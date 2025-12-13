import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeBucket, createFakeFirestore } from "../test/fakeFirebase";

const TEST_TOKEN = "test-scan-token";
const TEST_BUCKET = "test-scan-bucket";
const TEST_DISCORD_ID = "1234567890";
const TEST_USER_ID = `discord:${TEST_DISCORD_ID}`;

const formatTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fakeDb = createFakeFirestore();
const fakeBucket = createFakeBucket();

vi.mock("../firebase", () => {
  return {
    db: fakeDb,
    admin: {
      storage: () => ({
        bucket: (_name?: string) => fakeBucket,
      }),
      firestore: {
        FieldValue: {
          serverTimestamp: () => ({ serverTimestamp: true }),
        },
      },
    },
  };
});

vi.mock("../config", () => ({
  SCAN_UPLOAD_TOKEN: TEST_TOKEN,
  SCAN_UPLOAD_CSV_BUCKET: TEST_BUCKET,
}));

const setupApp = async () => {
  const router = (await import("./scanUploads")).default;
  const app = express();
  app.use(express.json());
  app.use("/internal/scan-uploads", router);
  return app;
};

describe("POST /internal/scan-uploads", () => {
  beforeEach(async () => {
    fakeDb.reset();
    fakeBucket.reset();
    await fakeDb.collection("upload_quota_config").doc("default").set({
      enabled: true,
      dailyGuildLimit: 10,
      dailyPlayerLimit: 50,
      roles: {
        admin: { enabled: true, dailyGuildLimit: 0, dailyPlayerLimit: 0 },
        user: { enabled: true, dailyGuildLimit: 5, dailyPlayerLimit: 6 },
      },
    });
    await fakeDb.collection("users").doc(TEST_USER_ID).set({
      userId: TEST_USER_ID,
      roles: ["user"],
      uploadCenter: {
        usage: {
          date: formatTodayString(),
          players: 0,
          guilds: 0,
        },
      },
    });
  });

  it("rejects missing or invalid tokens", async () => {
    const app = await setupApp();

    const missing = await request(app).post("/internal/scan-uploads").send({});
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe("unauthorized");

    const wrong = await request(app)
      .post("/internal/scan-uploads")
      .set("x-scan-upload-token", "wrong-token")
      .send({
        source: "discord-bot",
        queueId: "q-0001",
        playersCsv: "id\np1\n",
      });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe("unauthorized");
  });

  it("validates payload and requires at least one CSV", async () => {
    const app = await setupApp();

    const response = await request(app)
      .post("/internal/scan-uploads")
      .set("x-scan-upload-token", TEST_TOKEN)
      .send({
        source: "discord-bot",
        queueId: "q-0023",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_payload");
  });

  it("stores scan metadata and uploads CSVs to storage", async () => {
    const app = await setupApp();

    const response = await request(app)
      .post("/internal/scan-uploads")
      .set("x-scan-upload-token", TEST_TOKEN)
      .send({
        source: "discord-bot",
        queueId: "q-0100",
        discordUser: { id: TEST_DISCORD_ID, username: "Nickname#1234" },
        serverCode: "w1",
        playersCsv: "id\np1\np2\np3\n",
        guildsCsv: "id\ng1\ng2\n",
      });

    expect(response.status).toBe(201);
    expect(response.body.scanId).toBeTruthy();

    const scanId = response.body.scanId as string;
    const docSnap = await fakeDb.collection("scan_uploads").doc(scanId).get();
    expect(docSnap.exists).toBe(true);
    const data = docSnap.data() as Record<string, any>;
    expect(data.scanId).toBe(scanId);
    expect(data.source).toBe("discord-bot");
    expect(data.queueId).toBe("q-0100");
    expect(data.discordUserId).toBe(TEST_DISCORD_ID);
    expect(data.discordUsername).toBe("Nickname#1234");
    expect(data.serverCode).toBe("w1");
    expect(data.hasPlayersCsv).toBe(true);
    expect(data.hasGuildsCsv).toBe(true);
    expect(data.status).toBe("stored");
    expect(data.storagePaths.playersCsv).toBe(`scans/${scanId}/players.csv`);
    expect(data.storagePaths.guildsCsv).toBe(`scans/${scanId}/guilds.csv`);
    expect(fakeBucket.files.has(`scans/${scanId}/players.csv`)).toBe(true);
    expect(fakeBucket.files.has(`scans/${scanId}/guilds.csv`)).toBe(true);

    const userSnap = await fakeDb.collection("users").doc(TEST_USER_ID).get();
    const userData = userSnap.data() as Record<string, any>;
    expect(userData.uploadCenter?.usage?.date).toBe(formatTodayString());
    expect(userData.uploadCenter?.usage?.players).toBe(3);
    expect(userData.uploadCenter?.usage?.guilds).toBe(2);
  });

  it("marks the Firestore doc as error if storage upload fails", async () => {
    const app = await setupApp();
    fakeBucket.failNextSave();

    const response = await request(app)
      .post("/internal/scan-uploads")
      .set("x-scan-upload-token", TEST_TOKEN)
      .send({
        source: "discord-bot",
        queueId: "q-err",
        discordUser: { id: TEST_DISCORD_ID, username: "Nickname#1234" },
        playersCsv: "id\np1\n",
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("storage_upload_failed");

    const [docPath] =
      [...fakeDb.store.keys()].filter((path) => path.startsWith("scan_uploads/")) ?? [];
    expect(docPath).toBeTruthy();
    const scanId = docPath.split("/")[1];

    const docSnap = await fakeDb.collection("scan_uploads").doc(scanId).get();
    expect(docSnap.exists).toBe(true);
    const data = docSnap.data() as Record<string, any>;
    expect(data.status).toBe("error");
    expect(data.lastError).toBe("players_csv_upload_failed");
    expect(data.storagePaths.playersCsv).toBeNull();
    expect(data.storagePaths.guildsCsv).toBeNull();

    const userSnap = await fakeDb.collection("users").doc(TEST_USER_ID).get();
    const userData = userSnap.data() as Record<string, any>;
    expect(userData.uploadCenter?.usage?.players).toBe(0);
    expect(userData.uploadCenter?.usage?.guilds).toBe(0);
  });

  it("rejects uploads when the daily quota is exhausted", async () => {
    const app = await setupApp();
    await fakeDb.collection("users").doc(TEST_USER_ID).set({
      userId: TEST_USER_ID,
      roles: ["user"],
      uploadCenter: {
        usage: {
          date: formatTodayString(),
          players: 6,
          guilds: 0,
        },
      },
    });

    const response = await request(app)
      .post("/internal/scan-uploads")
      .set("x-scan-upload-token", TEST_TOKEN)
      .send({
        source: "discord-bot",
        queueId: "q-limit",
        discordUser: { id: TEST_DISCORD_ID, username: "Nickname#1234" },
        playersCsv: "id\np1\n",
      });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe("quota_exhausted");

    const docs =
      [...fakeDb.store.keys()].filter((path) => path.startsWith("scan_uploads/")) ?? [];
    expect(docs.length).toBe(0);

    const userSnap = await fakeDb.collection("users").doc(TEST_USER_ID).get();
    const userData = userSnap.data() as Record<string, any>;
    expect(userData.uploadCenter?.usage?.players).toBe(6);
  });

  it("allows admins to upload without quota limits", async () => {
    const app = await setupApp();
    await fakeDb.collection("users").doc(TEST_USER_ID).set({
      userId: TEST_USER_ID,
      roles: ["admin"],
      uploadCenter: {
        usage: {
          date: formatTodayString(),
          players: 0,
          guilds: 0,
        },
      },
    });

    const response = await request(app)
      .post("/internal/scan-uploads")
      .set("x-scan-upload-token", TEST_TOKEN)
      .send({
        source: "discord-bot",
        queueId: "q-admin",
        discordUser: { id: TEST_DISCORD_ID, username: "Admin#1234" },
        playersCsv: "id\np1\n",
      });

    expect(response.status).toBe(201);

    const userSnap = await fakeDb.collection("users").doc(TEST_USER_ID).get();
    const userData = userSnap.data() as Record<string, any>;
    expect(userData.uploadCenter?.usage?.players).toBe(1);
    expect(userData.uploadCenter?.usage?.guilds).toBe(0);
    expect(userData.uploadCenter?.usage?.date).toBe(formatTodayString());
  });
});
