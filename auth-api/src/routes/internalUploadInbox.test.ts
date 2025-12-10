import express from "express";
import { Timestamp } from "firebase-admin/firestore";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeBucket, createFakeFirestore } from "../test/fakeFirebase";

const TEST_TOKEN = "test-upload-token";
const TEST_BUCKET = "test-upload-bucket";
const TEST_USER_ID = "discord:TEST_USER";

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
        Timestamp,
      },
    },
  };
});

vi.mock("../config", () => ({
  UPLOAD_INBOX_TOKEN: TEST_TOKEN,
  UPLOAD_INBOX_BUCKET: TEST_BUCKET,
}));

describe("POST /internal/upload-inbox/add", () => {
  beforeEach(async () => {
    fakeDb.reset();
    fakeBucket.reset();
    const userRef = fakeDb.collection("users").doc(TEST_USER_ID);
    await userRef.set({
      userId: TEST_USER_ID,
      createdAt: Timestamp.now(),
      roles: ["user"],
    });
  });

  it("stores CSVs, creates inbox doc, and updates communityScans", async () => {
    const router = (await import("./internalAdmin")).default;
    const app = express();
    app.use(express.json());
    app.use("/internal", router);

    const playersCsv = Buffer.from("id\np1\np2\np3\n").toString("base64");
    const guildsCsv = Buffer.from("id\ng1\ng2\n").toString("base64");

    const response = await request(app)
      .post("/internal/upload-inbox/add")
      .set("x-internal-token", TEST_TOKEN)
      .send({
        discordUserId: TEST_USER_ID.replace("discord:", ""),
        scanId: "scan-001",
        playersCount: 3,
        guildsCount: 2,
        playerIds: ["p1", "p2", "p3"],
        guildIds: ["g1", "g2"],
        server: "eu1",
        source: "discord",
        playersCsvBase64: playersCsv,
        guildsCsvBase64: guildsCsv,
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.userId).toBe(TEST_USER_ID);

    const inboxRef = fakeDb.collection("users").doc(TEST_USER_ID).collection("uploadInbox").doc("scan-001");
    const inboxSnap = await inboxRef.get();
    expect(inboxSnap.exists).toBe(true);
    const inboxData = inboxSnap.data();
    expect(inboxData?.status).toBe("ready");
    expect(inboxData?.playersCount).toBe(3);
    expect(inboxData?.guildsCount).toBe(2);
    expect(inboxData?.storagePathPlayers).toBe(
      `user-upload-inbox/${TEST_USER_ID}/scan-001/players.csv`,
    );
    expect(inboxData?.storagePathGuilds).toBe(
      `user-upload-inbox/${TEST_USER_ID}/scan-001/guilds.csv`,
    );

    expect(fakeBucket.files.has(`user-upload-inbox/${TEST_USER_ID}/scan-001/players.csv`)).toBe(true);
    expect(fakeBucket.files.has(`user-upload-inbox/${TEST_USER_ID}/scan-001/guilds.csv`)).toBe(true);

    const userSnap = await fakeDb.collection("users").doc(TEST_USER_ID).get();
    const userData = userSnap.data() as Record<string, any>;
    const scans = userData.communityScans;
    expect(scans.totalScans).toBe(1);
    expect(scans.totalPlayersUploaded).toBe(3);
    expect(scans.totalGuildsUploaded).toBe(2);
    expect(scans.uniquePlayerIds).toEqual(["p1", "p2", "p3"]);
    expect(scans.uniqueGuildIds).toEqual(["g1", "g2"]);
  });
});
