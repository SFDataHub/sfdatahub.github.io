import express from "express";
import { Timestamp } from "firebase-admin/firestore";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeBucket, createFakeFirestore } from "../test/fakeFirebase";

const TEST_USER_ID = "discord:TEST_USER";
const TEST_BUCKET = "test-upload-bucket";

const fakeDb = createFakeFirestore();
const fakeBucket = createFakeBucket();

vi.mock("../firebase", () => ({
  db: fakeDb,
  admin: {
    storage: () => ({
      bucket: (_name?: string) => fakeBucket,
    }),
  },
}));

vi.mock("../config", () => ({
  UPLOAD_INBOX_BUCKET: TEST_BUCKET,
}));

vi.mock("../middleware/auth", () => ({
  requireUser: (req: any, _res: any, next: any) => {
    req.sessionUser = { userId: TEST_USER_ID, roles: ["user"] };
    next();
  },
}));

const buildApp = async () => {
  const router = (await import("./userUploadInbox")).default;
  const app = express();
  app.use(express.json());
  app.use("/user", router);
  return app;
};

describe("GET /user/upload-inbox", () => {
  beforeEach(async () => {
    fakeDb.reset();
    fakeBucket.reset();
    const userRef = fakeDb.collection("users").doc(TEST_USER_ID);
    await userRef.set({ userId: TEST_USER_ID });

    const inbox = userRef.collection("uploadInbox");
    const now = Timestamp.now();
    await inbox.doc("scan-new").set({
      createdAt: Timestamp.fromMillis(now.toMillis() + 2000),
      downloadedAt: null,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 60_000),
      playersCount: 1,
      guildsCount: 0,
      server: "eu1",
      source: "discord",
      storagePathPlayers: null,
      storagePathGuilds: null,
      status: "ready",
    });

    await inbox.doc("scan-old").set({
      createdAt: Timestamp.fromMillis(now.toMillis() - 2000),
      downloadedAt: Timestamp.fromMillis(now.toMillis() - 1000),
      expiresAt: Timestamp.fromMillis(now.toMillis() + 30_000),
      playersCount: 2,
      guildsCount: 1,
      server: null,
      source: "discord",
      storagePathPlayers: null,
      storagePathGuilds: null,
      status: "downloaded",
    });

    await inbox.doc("scan-expired").set({
      createdAt: Timestamp.fromMillis(now.toMillis() - 3000),
      downloadedAt: null,
      expiresAt: Timestamp.fromMillis(now.toMillis() - 1000),
      playersCount: 5,
      guildsCount: 5,
      server: null,
      source: "discord",
      storagePathPlayers: null,
      storagePathGuilds: null,
      status: "ready",
    });

    await inbox.doc("scan-other-status").set({
      createdAt: Timestamp.fromMillis(now.toMillis() + 1000),
      downloadedAt: null,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 60_000),
      playersCount: 1,
      guildsCount: 1,
      server: null,
      source: "discord",
      storagePathPlayers: null,
      storagePathGuilds: null,
      status: "processing",
    });
  });

  it("lists active inbox items sorted by createdAt desc", async () => {
    const app = await buildApp();
    const response = await request(app).get("/user/upload-inbox");

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: any) => item.scanId)).toEqual(["scan-new", "scan-old"]);
    expect(response.body.items[0]).toMatchObject({
      status: "ready",
      playersCount: 1,
      guildsCount: 0,
      server: "eu1",
    });
  });
});

describe("GET /user/upload-inbox/:scanId/download", () => {
  beforeEach(() => {
    fakeDb.reset();
    fakeBucket.reset();
  });

  it("returns CSV contents and marks as downloaded", async () => {
    const userRef = fakeDb.collection("users").doc(TEST_USER_ID);
    await userRef.set({ userId: TEST_USER_ID });
    const inboxDoc = userRef.collection("uploadInbox").doc("scan-1");
    const now = Timestamp.now();
    await inboxDoc.set({
      createdAt: now,
      downloadedAt: null,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 60_000),
      playersCount: 2,
      guildsCount: 1,
      server: "eu1",
      source: "discord",
      storagePathPlayers: `user-upload-inbox/${TEST_USER_ID}/scan-1/players.csv`,
      storagePathGuilds: `user-upload-inbox/${TEST_USER_ID}/scan-1/guilds.csv`,
      status: "ready",
    });

    fakeBucket.files.set(
      `user-upload-inbox/${TEST_USER_ID}/scan-1/players.csv`,
      Buffer.from("id\np1\np2\n"),
    );
    fakeBucket.files.set(
      `user-upload-inbox/${TEST_USER_ID}/scan-1/guilds.csv`,
      Buffer.from("id\ng1\n"),
    );

    const app = await buildApp();
    const response = await request(app).get("/user/upload-inbox/scan-1/download");

    expect(response.status).toBe(200);
    expect(response.body.scanId).toBe("scan-1");
    expect(response.body.playersCsv).toContain("p1");
    expect(response.body.guildsCsv).toContain("g1");
    expect(response.body.meta.status).toBe("downloaded");
    expect(response.body.meta.downloadedAt).toBeTruthy();

    const updatedSnap = await inboxDoc.get();
    const updated = updatedSnap.data() as any;
    expect(updated.status).toBe("downloaded");
    expect(updated.downloadedAt).toBeTruthy();
  });

  it("returns 404 when scan is missing", async () => {
    const userRef = fakeDb.collection("users").doc(TEST_USER_ID);
    await userRef.set({ userId: TEST_USER_ID });

    const app = await buildApp();
    const response = await request(app).get("/user/upload-inbox/missing/download");
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("scan_not_found");
  });

  it("returns 410 when expired", async () => {
    const userRef = fakeDb.collection("users").doc(TEST_USER_ID);
    await userRef.set({ userId: TEST_USER_ID });
    const inboxDoc = userRef.collection("uploadInbox").doc("expired-scan");
    const now = Timestamp.now();
    await inboxDoc.set({
      createdAt: now,
      downloadedAt: null,
      expiresAt: Timestamp.fromMillis(now.toMillis() - 1000),
      playersCount: 0,
      guildsCount: 0,
      server: null,
      source: "discord",
      storagePathPlayers: null,
      storagePathGuilds: null,
      status: "ready",
    });

    const app = await buildApp();
    const response = await request(app).get("/user/upload-inbox/expired-scan/download");
    expect(response.status).toBe(410);
    expect(response.body.error).toBe("scan_expired");
  });
});
