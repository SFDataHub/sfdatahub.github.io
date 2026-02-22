// tools/backfill-monthly-toplists.mts
// Build monthly player toplist snapshots from scans in a time window.
// Raw->Derived pipeline reference: src/lib/import/csv.ts (deriveForPlayer + buildPlayerDerivedSnapshotEntry).
// Run example:
//   npx tsx tools/backfill-monthly-toplists.mts --server S12 --from 2026-01-01T00:00:00Z --to 2026-01-03T23:59:59Z --label 2025-01 --topN 500 --dry-run
//
// Auth (REST, ADC-free):
//   Default:       gcloud auth print-access-token (user token)
//   Optional:      gcloud auth print-access-token --impersonate-service-account=<SA>

import { execFile } from "node:child_process";
import https from "node:https";
import { promisify } from "node:util";
import {
  buildPlayerDerivedSnapshotEntry,
  deriveForPlayer,
  toFiniteNumberOrNull,
} from "./playerDerivedHelpers.mts";

const execFileAsync = promisify(execFile);

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

// ---------- HTTP / Token (REST) ----------
const RETRY_STATUSES = new Set([429, 503]);
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 200;
const PAGE_SIZE_SCANS = 500;
const hasGlobalFetch = typeof fetch === "function";
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const httpRequest = async (method: string, url: string, token: string, body?: string): Promise<any> => {
  if (hasGlobalFetch) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      const err: any = new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
      err.status = res.status;
      throw err;
    }
    if (method === "DELETE") return;
    return await res.json().catch(() => ({}));
  }

  return new Promise((resolve, reject) => {
    const { hostname, pathname, search, protocol } = new URL(url);
    const req = https.request(
      {
        protocol,
        hostname,
        path: pathname + search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            if (method === "DELETE") return resolve(undefined);
            try {
              resolve(bodyText ? JSON.parse(bodyText) : {});
            } catch {
              resolve({});
            }
          } else {
            const err: any = new Error(`HTTP ${res.statusCode}: ${bodyText}`);
            err.status = res.statusCode;
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.end(body);
  });
};

const requestWithRetry = async (method: string, url: string, token: string, body?: string) => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await httpRequest(method, url, token, body);
    } catch (err: any) {
      const status = err?.status;
      if (RETRY_STATUSES.has(status) && attempt < MAX_RETRIES) {
        await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("requestWithRetry exhausted without result");
};

const runGcloudCommand = async (gcloudArgs: string[]): Promise<string> => {
  const isWin = process.platform === "win32";
  const { stdout } = isWin
    ? await execFileAsync("cmd.exe", ["/d", "/s", "/c", `gcloud ${gcloudArgs.join(" ")}`], {
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      })
    : await execFileAsync("gcloud", gcloudArgs, { maxBuffer: 1024 * 1024 });
  return stdout.trim();
};

const getAccessTokenViaGcloud = async (
  impersonateSa?: string
): Promise<{ token: string; authMode: "user-token" | "impersonation-token" }> => {
  const gcloudArgs = ["auth", "print-access-token"];
  if (impersonateSa) gcloudArgs.push(`--impersonate-service-account=${impersonateSa}`);
  try {
    const token = await runGcloudCommand(gcloudArgs);
    if (!token) throw new Error("empty token");
    return { token, authMode: impersonateSa ? "impersonation-token" : "user-token" };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const code = err?.code ? ` code=${err.code}` : "";
    const hint = impersonateSa
      ? `gcloud auth login and ensure you can impersonate ${impersonateSa}`
      : "gcloud auth login";
    throw new Error(`Failed to obtain access token via gcloud (${msg}${code}). Please run "${hint}".`);
  }
};

// ---------- Config ----------
const STATS_PUBLIC_LATEST = "stats_public/toplists_players_v1/lists/latest_toplists/progress";
const DOC_SIZE_LIMIT_BYTES = 1_000_000;

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

type ResolvedServerKeys = {
  input: string;
  queryServerKey: string;
  fallbackServerKey?: string;
  writeServerKey: string;
};

const resolveServerKeys = (input: string): ResolvedServerKeys => {
  const upper = input.trim().toUpperCase();
  let match = upper.match(/^S(\d+)\.EU$/);
  if (match) {
    const num = match[1];
    return {
      input: upper,
      queryServerKey: `S${num}.EU`,
      fallbackServerKey: `S${num}`,
      writeServerKey: `EU${num}`,
    };
  }
  match = upper.match(/^S(\d+)$/);
  if (match) {
    const num = match[1];
    return {
      input: upper,
      queryServerKey: `S${num}`,
      fallbackServerKey: `S${num}.EU`,
      writeServerKey: `EU${num}`,
    };
  }
  match = upper.match(/^EU(\d+)$/);
  if (match) {
    const num = match[1];
    return {
      input: upper,
      queryServerKey: `EU${num}`,
      fallbackServerKey: `S${num}`,
      writeServerKey: `EU${num}`,
    };
  }
  match = upper.match(/^F(\d+)$/);
  if (match) {
    const num = match[1];
    return {
      input: upper,
      queryServerKey: `F${num}`,
      writeServerKey: `F${num}`,
    };
  }
  return { input: upper, queryServerKey: upper, writeServerKey: upper };
};

type FirestoreCursor = { ts: number; name: string } | null;
type FirestoreDocRow = { name: string; docId: string; data: any };

const firestoreValueToJs = (value: any): any => {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("stringValue" in value) return String(value.stringValue);
  if ("integerValue" in value) {
    const n = Number(value.integerValue);
    return Number.isFinite(n) ? n : value.integerValue;
  }
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map((v: any) => firestoreValueToJs(v));
  if ("mapValue" in value) {
    const out: Record<string, any> = {};
    const fields = value.mapValue?.fields ?? {};
    for (const [k, v] of Object.entries(fields)) out[k] = firestoreValueToJs(v);
    return out;
  }
  return null;
};

const jsToFirestoreValue = (value: any): any => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { nullValue: null };
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map((v) => jsToFirestoreValue(v)) } };
  if (typeof value === "object") {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) fields[k] = jsToFirestoreValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
};

const parseFirestoreDocumentFields = (doc: any): any => {
  const out: Record<string, any> = {};
  const fields = doc?.fields && typeof doc.fields === "object" ? doc.fields : {};
  for (const [k, v] of Object.entries(fields)) out[k] = firestoreValueToJs(v);
  return out;
};

const extractDocId = (docName: string): string => {
  const parts = String(docName).split("/");
  return parts[parts.length - 1] ?? "";
};

const resolveProjectId = async (): Promise<string> => {
  const fromArgs = (args.get("project") || "").trim();
  if (fromArgs) return fromArgs;

  const envCandidates = [
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.GCLOUD_PROJECT,
    process.env.FIREBASE_PROJECT_ID,
    process.env.GCP_PROJECT,
  ];
  for (const candidate of envCandidates) {
    const v = String(candidate ?? "").trim();
    if (v) return v;
  }

  const firebaseConfigRaw = process.env.FIREBASE_CONFIG;
  if (firebaseConfigRaw) {
    try {
      const parsed = JSON.parse(firebaseConfigRaw);
      const pid = String(parsed?.projectId ?? "").trim();
      if (pid) return pid;
    } catch {
      // ignore
    }
  }

  const configured = await runGcloudCommand(["config", "get-value", "project"]);
  const pid = configured.trim();
  if (pid && pid !== "(unset)") return pid;
  throw new Error("Missing project ID. Pass --project <id> or set GOOGLE_CLOUD_PROJECT / gcloud config project.");
};

const buildScansRunQueryBody = (serverKey: string, fromSec: number, toSec: number, cursor: FirestoreCursor): string => {
  const structuredQuery: any = {
    from: [{ collectionId: "scans", allDescendants: true }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "server" },
              op: "EQUAL",
              value: { stringValue: serverKey },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: "timestamp" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { integerValue: String(fromSec) },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: "timestamp" },
              op: "LESS_THAN_OR_EQUAL",
              value: { integerValue: String(toSec) },
            },
          },
        ],
      },
    },
    orderBy: [
      { field: { fieldPath: "timestamp" }, direction: "ASCENDING" },
      { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
    ],
    limit: PAGE_SIZE_SCANS,
  };
  if (cursor) {
    structuredQuery.startAt = {
      values: [{ integerValue: String(cursor.ts) }, { referenceValue: cursor.name }],
      before: false,
    };
  }
  return JSON.stringify({ structuredQuery });
};

const runScansQueryPage = async (
  baseDocsUrl: string,
  accessToken: string,
  serverKey: string,
  fromSec: number,
  toSec: number,
  cursor: FirestoreCursor
): Promise<{ rows: FirestoreDocRow[]; nextCursor: FirestoreCursor; rawRows: number }> => {
  const body = buildScansRunQueryBody(serverKey, fromSec, toSec, cursor);
  const json = await requestWithRetry("POST", `${baseDocsUrl}:runQuery`, accessToken, body);
  const res = Array.isArray(json) ? json : [];

  const rows: FirestoreDocRow[] = [];
  let nextCursor: FirestoreCursor = null;
  for (const r of res) {
    const doc = r?.document;
    if (!doc || typeof doc.name !== "string") continue;
    const data = parseFirestoreDocumentFields(doc);
    const ts = Number(data?.timestamp);
    if (Number.isFinite(ts)) {
      nextCursor = { ts: Math.trunc(ts), name: doc.name };
    } else {
      // Cursor fallback still needs stable order; skip setting cursor from malformed row.
      nextCursor = { ts: 0, name: doc.name };
    }
    rows.push({ name: doc.name, docId: extractDocId(doc.name), data });
  }
  return { rows, nextCursor, rawRows: res.length };
};

const writeProgressSnapshotDoc = async (
  baseDocsUrl: string,
  accessToken: string,
  targetPath: string,
  payload: { server: string; players: any[] }
) => {
  const nowIso = new Date().toISOString();
  const params = new URLSearchParams();
  params.append("updateMask.fieldPaths", "server");
  params.append("updateMask.fieldPaths", "updatedAt");
  params.append("updateMask.fieldPaths", "players");
  params.append("updateMask.fieldPaths", "publishedAt");
  const url = `${baseDocsUrl}/${targetPath}?${params.toString()}`;
  const body = JSON.stringify({
    fields: {
      server: { stringValue: payload.server },
      updatedAt: { timestampValue: nowIso },
      players: jsToFirestoreValue(payload.players),
      publishedAt: { timestampValue: nowIso },
    },
  });
  await requestWithRetry("PATCH", url, accessToken, body);
};

// ---------- Main ----------
const run = async () => {
  const impersonateSa = (args.get("impersonate-service-account") || process.env.FIRESTORE_IMPERSONATE_SA || "").trim();
  const projectId = await resolveProjectId();
  const { token: accessToken, authMode } = await getAccessTokenViaGcloud(impersonateSa || undefined);
  const baseDocsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  console.log(`[monthly-toplists] auth mode: ${authMode}`);
  if (impersonateSa) console.log(`[monthly-toplists] impersonated SA: ${impersonateSa}`);
  console.log(`[monthly-toplists] project: ${projectId}`);

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
  const resolvedServer = resolveServerKeys(serverArg);
  const serverCode = resolvedServer.writeServerKey;
  const docId = `${serverCode}__${label}`;
  const targetPath = `${STATS_PUBLIC_LATEST}/${docId}`;

  console.log(
    `[monthly-toplists] Resolved server: input=${resolvedServer.input} query=${resolvedServer.queryServerKey} write=${serverCode} label=${label}`
  );
  console.log(`[monthly-toplists] Target path (progress): ${targetPath}`);

  const scanForServer = async (serverKey: string) => {
    let scansInWindow = 0;
    let skippedNonPlayers = 0;
    let skippedMissingIdentifier = 0;
    let skippedBadTimestamp = 0;
    const byPlayer = new Map<string, { ts: number; data: any; docId: string }>();

    try {
      let cursor: FirestoreCursor = null;
      for (;;) {
        const { rows, nextCursor } = await runScansQueryPage(baseDocsUrl, accessToken, serverKey, fromSec, toSec, cursor);
        if (rows.length === 0) break;

        for (const doc of rows) {
          const path = String(doc.name).split("/documents/")[1] ?? "";
          if (!path) {
            skippedNonPlayers++;
            continue;
          }
          if (!path.startsWith("players/") || !path.includes("/scans/")) {
            skippedNonPlayers++;
            continue;
          }

          const data = doc.data || {};
          const identifierMatch = /^players\/([^/]+)\/scans\/[^/]+$/.exec(path);
          const identifier = String(identifierMatch?.[1] ?? "").trim();
          if (!identifier) {
            skippedMissingIdentifier++;
            continue;
          }

          const ts = resolveTimestampSec(data, doc.docId);
          if (!ts) {
            skippedBadTimestamp++;
            continue;
          }
          if (ts < fromSec || ts > toSec) continue;

          scansInWindow++;
          const prev = byPlayer.get(identifier);
          if (!prev || ts > prev.ts) {
            byPlayer.set(identifier, { ts, data, docId: doc.docId });
          }
        }

        if (!nextCursor) break;
        if (cursor && cursor.name === nextCursor.name && cursor.ts === nextCursor.ts) {
          throw new Error("REST runQuery pagination cursor did not advance; aborting to prevent infinite loop.");
        }
        cursor = nextCursor;
      }
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes("FAILED_PRECONDITION") || msg.toLowerCase().includes("index")) {
        console.warn("[monthly-toplists] Query failed due to missing index.");
        console.warn(
          "[monthly-toplists] Firestore may require a composite index for collectionGroup(scans) + server + timestamp."
        );
      }
      throw err;
    }

    return { scansInWindow, skippedNonPlayers, skippedMissingIdentifier, skippedBadTimestamp, byPlayer };
  };

  let activeQueryServer = resolvedServer.queryServerKey;
  let scanResult = await scanForServer(activeQueryServer);
  if (scanResult.scansInWindow === 0 && resolvedServer.fallbackServerKey) {
    console.warn(
      `[monthly-toplists] No scans found for ${resolvedServer.queryServerKey}. Retrying with ${resolvedServer.fallbackServerKey}.`
    );
    activeQueryServer = resolvedServer.fallbackServerKey;
    scanResult = await scanForServer(activeQueryServer);
  }

  const { scansInWindow, skippedNonPlayers, skippedMissingIdentifier, skippedBadTimestamp, byPlayer } = scanResult;

  const uniquePlayers = byPlayer.size;
  if (uniquePlayers === 0) {
    console.warn("[monthly-toplists] No player scans found in the requested window.");
  }

  const players: any[] = [];
  for (const [identifier, picked] of byPlayer.entries()) {
    const data = picked.data || {};
    const values = data.values && typeof data.values === "object" ? data.values : {};
    const playerId = data.playerId ?? null;
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
      identifier,
      playerId,
      name,
      className,
      level,
      server: serverCode,
      guildIdentifier,
      guildName,
      values,
      timestamp: picked.ts,
    };
    const derived = deriveForPlayer(derivedInput);
    const snapshotEntry = buildPlayerDerivedSnapshotEntry({
      identifier,
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
    return String(a.identifier ?? "").localeCompare(String(b.identifier ?? ""));
  });
  if (players.length > topN) players.length = topN;

  const sizeBytes = Buffer.byteLength(JSON.stringify({ server: serverCode, players }), "utf8");
  if (sizeBytes > DOC_SIZE_LIMIT_BYTES) {
    throw new Error(
      `Snapshot payload is ~${sizeBytes} bytes (limit 1,000,000). Reduce --topN or shard the snapshot.`
    );
  }

  if (!dryRun) {
    await writeProgressSnapshotDoc(baseDocsUrl, accessToken, targetPath, { server: serverCode, players });
  } else {
    console.log(`[monthly-toplists] Dry run: would PATCH ${targetPath} (progress snapshot only)`);
  }

  console.log("[monthly-toplists] Scans in window:", scansInWindow);
  console.log("[monthly-toplists] Unique players:", uniquePlayers);
  console.log("[monthly-toplists] Players written:", players.length);
  console.log("[monthly-toplists] Target doc:", targetPath);
  console.log("[monthly-toplists] Primary key:", "identifier");
  console.log("[monthly-toplists] Label:", label);
  console.log("[monthly-toplists] Dry run:", dryRun);
  console.log("[monthly-toplists] Skipped non-players:", skippedNonPlayers);
  console.log("[monthly-toplists] Skipped missing identifier:", skippedMissingIdentifier);
  console.log("[monthly-toplists] Skipped bad timestamp:", skippedBadTimestamp);
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
