// tools/backfill-monthly-toplists.mts
// Build monthly player toplist snapshots from scans in a time window.
// Raw->Derived pipeline reference: src/lib/import/csv.ts (deriveForPlayer + buildPlayerDerivedSnapshotEntry).
// Run example:
//   npx tsx tools/backfill-monthly-toplists.mts --server EU1 --from 2026-01-01T00:00:00Z --to 2026-01-03T23:59:59Z --label 2025-12 --topN 500 --dry-run
//
// Auth: gcloud auth application-default login

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  buildPlayerDerivedSnapshotEntry,
  deriveForPlayer,
  toFiniteNumberOrNull,
} from "./playerDerivedHelpers.mts";

// ---------- Init ----------
try {
  initializeApp({ credential: applicationDefault() });
} catch {}
const db = getFirestore();

// ---------- Config ----------
const STATS_PUBLIC_LATEST = "stats_public/toplists_players_v1/lists/latest_toplists/servers";
const DOC_SIZE_LIMIT_BYTES = 1_000_000;

// ---------- Args ----------
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "true";
    args.set(k, v);
    if (v !== "true") i++;
  }
}

const requireArg = (key: string): string => {
  const value = args.get(key);
  if (!value) throw new Error(`Missing required --${key}`);
  return value;
};

const parseDateArg = (value: string, label: string): Date => {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid ${label}: ${value}`);
  return new Date(ms);
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const previousMonthLabel = (d: Date): string => {
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth(); // 0-based
  if (m === 0) {
    y -= 1;
    m = 11;
  } else {
    m -= 1;
  }
  return `${y}-${pad2(m + 1)}`;
};

// ---------- Snapshot helpers (compatible with csv import parsing) ----------
const CANON = (s: string) =>
  String(s ?? "")
    .trim()
    .replace(/:+$/, "")
    .toLowerCase()
    .replace(/[\s_\u00a0]+/g, "");

const pickByCanon = (row: Record<string, any>, canonKey: string): any => {
  for (const k of Object.keys(row)) if (CANON(k) === canonKey) return row[k];
  return undefined;
};

const pickAnyByCanon = (row: Record<string, any>, keys: string[]): any =>
  keys.map((k) => pickByCanon(row, k)).find((v) => v != null && String(v) !== "");

const PLAYER_CLASS_NAMES: Record<number, string> = {
  1: "Warrior",
  2: "Mage",
  3: "Scout",
  4: "Assassin",
  5: "Battle Mage",
  6: "Berserker",
  7: "Demon Hunter",
  8: "Bard",
};

const classIdFromName = (name: string): number | null => {
  const canon = CANON(name);
  for (const [id, label] of Object.entries(PLAYER_CLASS_NAMES)) {
    if (CANON(label) === canon) return Number(id);
  }
  return null;
};

const parseClassValue = (value: any): { classId: number | null; className: string | null } => {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return { classId: null, className: null };
  const asNumber = Number(raw);
  const isIntegerNumber = Number.isInteger(asNumber) && !Number.isNaN(asNumber);
  if (isIntegerNumber) {
    const classId = asNumber;
    return { classId, className: PLAYER_CLASS_NAMES[classId] ?? String(classId) };
  }
  const classId = classIdFromName(raw);
  return { classId, className: raw };
};

const toNumberLoose = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const parseLevelValue = (v: any): number | null => {
  const n = toNumberLoose(v);
  return Number.isFinite(n ?? NaN) ? Math.trunc(n as number) : null;
};

const COL = {
  PLAYERS: {
    IDENTIFIER: CANON("Identifier"),
    PID: CANON("ID"),
    GUILD_IDENTIFIER: CANON("Guild Identifier"),
    SERVER: CANON("Server"),
    NAME: CANON("Name"),
    TIMESTAMP: CANON("Timestamp"),
    LEVEL: CANON("Level"),
    CLASS: CANON("Class"),
    GUILD: CANON("Guild"),
  },
} as const;

const PLAYER_LEVEL_KEYS = [COL.PLAYERS.LEVEL, CANON("Level"), CANON("Lvl"), CANON("Stufe")];
const PLAYER_CLASS_KEYS = [
  COL.PLAYERS.CLASS,
  CANON("Class"),
  CANON("ClassID"),
  CANON("Class ID"),
  CANON("CharClass"),
  CANON("Klasse"),
];

const resolveTimestampSec = (data: any, docId: string): number | null => {
  const candidates = [data?.timestamp, data?.timestampSec, data?.tsSec];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  if (typeof docId === "string" && /^\d+$/.test(docId)) {
    const n = Number(docId);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
};

const parseLabel = (value: string): string => {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid label format (expected YYYY-MM): ${value}`);
  }
  return trimmed;
};

// ---------- Main ----------
const run = async () => {
  const serverArg = requireArg("server").trim();
  const fromArg = requireArg("from");
  const toArg = requireArg("to");

  const fromDate = parseDateArg(fromArg, "from");
  const toDate = parseDateArg(toArg, "to");
  const fromSec = Math.floor(fromDate.getTime() / 1000);
  const toSec = Math.floor(toDate.getTime() / 1000);
  if (fromSec > toSec) throw new Error(`Invalid range: from > to (${fromArg} > ${toArg})`);

  const labelArg = args.get("label");
  const label = labelArg ? parseLabel(labelArg) : previousMonthLabel(fromDate);
  const topNArg = args.get("topN");
  const topN = topNArg ? Number(topNArg) : 500;
  if (!Number.isFinite(topN) || topN <= 0) throw new Error(`Invalid --topN: ${topNArg}`);

  const dryRun = args.get("dry-run") === "true";
  const serverCode = serverArg.toUpperCase();
  const docId = `${serverCode}__${label}`;
  const targetPath = `${STATS_PUBLIC_LATEST}/${docId}`;

  let scansInWindow = 0;
  let skippedNonPlayers = 0;
  let skippedMissingId = 0;
  let skippedBadTimestamp = 0;

  const byPlayer = new Map<string, { ts: number; data: any; docId: string }>();

  let q: Query = db.collectionGroup("scans") as Query;
  q = q.where("server", "==", serverArg);
  q = q.where("timestamp", ">=", fromSec).where("timestamp", "<=", toSec);
  q = q.orderBy("timestamp", "asc");

  try {
    const stream = q.stream() as AsyncIterable<QueryDocumentSnapshot>;
    for await (const doc of stream) {
      const path = doc.ref.path;
      if (!path.startsWith("players/") || !path.includes("/scans/")) {
        skippedNonPlayers++;
        continue;
      }

      const data = doc.data() || {};
      const playerId = String(data.playerId ?? doc.ref.parent.parent?.id ?? "");
      if (!playerId) {
        skippedMissingId++;
        continue;
      }

      const ts = resolveTimestampSec(data, doc.id);
      if (!ts) {
        skippedBadTimestamp++;
        continue;
      }
      if (ts < fromSec || ts > toSec) continue;

      scansInWindow++;
      const prev = byPlayer.get(playerId);
      if (!prev || ts > prev.ts) {
        byPlayer.set(playerId, { ts, data, docId: doc.id });
      }
    }
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.toLowerCase().includes("index")) {
      console.warn("[monthly-toplists] Query failed due to missing index.");
      console.warn("[monthly-toplists] Firestore may require a composite index for collectionGroup(scans) + server + timestamp.");
    }
    throw err;
  }

  const uniquePlayers = byPlayer.size;
  if (uniquePlayers === 0) {
    console.warn("[monthly-toplists] No player scans found in the requested window.");
  }

  const players: any[] = [];
  for (const [playerId, picked] of byPlayer.entries()) {
    const data = picked.data || {};
    const values = data.values && typeof data.values === "object" ? data.values : {};
    const name = data.name ?? pickByCanon(values, COL.PLAYERS.NAME);
    const guildName = data.guildName ?? pickByCanon(values, COL.PLAYERS.GUILD);

    const levelRaw = data.level ?? pickAnyByCanon(values, PLAYER_LEVEL_KEYS);
    const level = parseLevelValue(levelRaw);

    const classRaw = data.className ?? pickAnyByCanon(values, PLAYER_CLASS_KEYS);
    const classInfo = parseClassValue(classRaw);
    const className = classInfo.className;

    const guildIdentifier = data.guildIdentifier ?? pickByCanon(values, COL.PLAYERS.GUILD_IDENTIFIER);
    const lastScanRaw = data.timestampRaw ?? pickByCanon(values, COL.PLAYERS.TIMESTAMP);

    const derivedInput = {
      playerId,
      name,
      className,
      level,
      server: data.server ?? serverArg,
      guildIdentifier,
      guildName,
      values,
      timestamp: picked.ts,
    };
    const derived = deriveForPlayer(derivedInput);
    const snapshotEntry = buildPlayerDerivedSnapshotEntry({
      playerId,
      server: serverCode,
      name,
      className,
      guildName,
      level,
      lastScanRaw,
      timestampSec: picked.ts,
      derived,
    });
    players.push(snapshotEntry);
  }

  players.sort((a, b) => {
    const diff = (toFiniteNumberOrNull(b.sum) ?? 0) - (toFiniteNumberOrNull(a.sum) ?? 0);
    if (diff !== 0) return diff;
    return String(a.playerId ?? "").localeCompare(String(b.playerId ?? ""));
  });
  if (players.length > topN) players.length = topN;

  const sizeBytes = Buffer.byteLength(JSON.stringify({ server: serverCode, players }), "utf8");
  if (sizeBytes > DOC_SIZE_LIMIT_BYTES) {
    throw new Error(
      `Snapshot payload is ~${sizeBytes} bytes (limit 1,000,000). Reduce --topN or shard the snapshot.`
    );
  }

  if (!dryRun) {
    await db.doc(targetPath).set(
      {
        server: serverCode,
        updatedAt: FieldValue.serverTimestamp(),
        players,
        publishedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  console.log("[monthly-toplists] Scans in window:", scansInWindow);
  console.log("[monthly-toplists] Unique players:", uniquePlayers);
  console.log("[monthly-toplists] Players written:", players.length);
  console.log("[monthly-toplists] Target doc:", targetPath);
  console.log("[monthly-toplists] Label:", label);
  console.log("[monthly-toplists] Dry run:", dryRun);
  console.log("[monthly-toplists] Skipped non-players:", skippedNonPlayers);
  console.log("[monthly-toplists] Skipped missing playerId:", skippedMissingId);
  console.log("[monthly-toplists] Skipped bad timestamp:", skippedBadTimestamp);
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
