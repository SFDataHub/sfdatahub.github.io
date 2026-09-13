// tools/backfill-monthly-guild-toplists.mts
// Build monthly guild toplist snapshots from existing guild history docs.
// Run example:
//   npx tsx tools/backfill-monthly-guild-toplists.mts --server F28 --from 2026-08-01T00:00:00Z --to 2026-08-31T23:59:59Z --label 2026-08 --dry-run
// Auth (REST, ADC-free):
//   Default:       gcloud auth print-access-token (user token)
//   Optional:      gcloud auth print-access-token --impersonate-service-account=<SA>

import { execFile } from "node:child_process";
import https from "node:https";
import { promisify } from "node:util";

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
const PAGE_SIZE_HISTORY = 500;
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
const STATS_PUBLIC_GUILD_PROGRESS = "stats_public/toplists_guilds_v1/lists/latest_toplists/progress";
const DOC_SIZE_LIMIT_BYTES = 1_000_000;
const GUILD_DERIVED_SNAPSHOT_LIMIT = 500;

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

const parseLabel = (value: string): string => {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid label format (expected YYYY-MM): ${value}`);
  }
  return trimmed;
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

const pickByKey = (values: Record<string, any> | null | undefined, keys: readonly string[]) => {
  if (!values || typeof values !== "object") return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return (values as any)[key];
  }
  return undefined;
};

const toFiniteNumberOrNull = (value: any): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toDigitsOnlyNumber = (value: any): number => {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const toNumberLoose = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const toSecFlexible = (v: any): number | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  if (/^\d{10}$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const MM = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const hh = m[4] ? Number(m[4]) : 0;
    const mm = m[5] ? Number(m[5]) : 0;
    const ss = m[6] ? Number(m[6]) : 0;
    const d = new Date(yyyy, MM, dd, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) return Math.floor(t / 1000);
  return null;
};

const G = {
  GUILD_IDENTIFIER: CANON("Guild Identifier"),
  SERVER: CANON("Server"),
  NAME: CANON("Name"),
  TIMESTAMP: CANON("Timestamp"),
  MEMBER_COUNT: CANON("Guild Member Count"),
  HOF: CANON("Hall of Fame Rank"),
  HOF_ALT: CANON("Hall of Fame"),
  RANK: CANON("Rank"),
  GUILD_RANK: CANON("Guild Rank"),
} as const;

const GUILD_LATEST_VALUE_KEYS = {
  honor: ["Guild Honor"],
  hydra: ["Guild Hydra"],
  instructor: ["Guild Instructor"],
  knights: ["Guild Knights"],
  knights15Plus: ["Guild Knights 15+"],
  memberCount: ["Guild Member Count"],
  portalFloor: ["Guild Portal Floor"],
  raids: ["Guild Raids"],
  treasury: ["Guild Treasure", "Guild Treasury"],
} as const;

const readGuildLatestMeta = (values: Record<string, any> | null | undefined) => ({
  honor: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.honor)),
  hydra: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.hydra)),
  instructor: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.instructor)),
  knights: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.knights)),
  knights15Plus: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.knights15Plus)),
  memberCount: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.memberCount)),
  portalFloor: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.portalFloor)),
  raids: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.raids)),
  treasury: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.treasury)),
});

type ResolvedServerKeys = {
  input: string;
  canonicalShortKey: string;
  queryKey: string;
  writeKey: string;
  longValueServer: string;
};

const TOP_LEVEL_SERVER_READ_ALIASES = {
  MAERWYNN: ["MAERWYNN", "maerwynn_net", "MAERWYNN_NET"],
  BLACKFOREST: ["BLACKFOREST", "blackforest_net", "BLACKFOREST_NET", "BLACK_FOREST"],
  GNAROGRIM: ["GNAROGRIM", "gnarogrim_net", "GNAROGRIM_NET", "GRANOGRIM", "granogrim_net"],
  STUMBLESTEPPE: [
    "STUMBLESTEPPE",
    "stumblesteppe_net",
    "STUMBLESTEPPE_NET",
    "STUMPLESTEPPE",
    "stumplesteppe_net",
    "STUMPLESTEPPE_NET",
  ],
} as const satisfies Record<string, readonly string[]>;

const getTopLevelServerReadCandidates = (canonicalServerKey: string): string[] => {
  const aliases = TOP_LEVEL_SERVER_READ_ALIASES[
    canonicalServerKey as keyof typeof TOP_LEVEL_SERVER_READ_ALIASES
  ];
  return [...new Set([canonicalServerKey, ...(aliases ?? [])])];
};

const HISTORY_MONTHLY_SERVER_READ_ALIASES = {
  BLACKFOREST: ["BLACKFOREST .NET"],
} as const satisfies Partial<Record<string, readonly string[]>>;

const getHistoryMonthlyServerReadCandidates = (resolvedServer: ResolvedServerKeys): string[] => {
  const canonical = resolvedServer.canonicalShortKey;
  const aliases = HISTORY_MONTHLY_SERVER_READ_ALIASES[
    canonical as keyof typeof HISTORY_MONTHLY_SERVER_READ_ALIASES
  ];
  return [...new Set([...(aliases ?? []), `${canonical}.NET`])];
};

const normalizeServerShortKey = (input: string): string => {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("Missing required --server");

  let token = raw.toUpperCase();
  token = token.replace(/^[A-Z]+:\/\//, "");
  token = token.split("/")[0] ?? token;
  token = token.trim();
  token = token.replace(/_NET$/i, "");
  token = token.replace(/\.NET$/i, "");
  if (token.includes(".")) token = token.split(".")[0] ?? token;
  token = token.trim();

  const legacyEu = token.match(/^S(\d+)$/i);
  if (legacyEu) return `EU${legacyEu[1]}`;

  if (!token) throw new Error(`Invalid --server value: ${input}`);
  const namedToken = token.replace(/[\s._-]+/g, "");
  if (namedToken === "STUMBLESTEPPE" || namedToken === "STUMPLESTEPPE") {
    return "STUMBLESTEPPE";
  }
  return token;
};

const resolveServerKeys = (input: string): ResolvedServerKeys => {
  const canonicalShortKey = normalizeServerShortKey(input);
  return {
    input: String(input ?? "").trim(),
    canonicalShortKey,
    queryKey: canonicalShortKey,
    writeKey: canonicalShortKey,
    longValueServer: `${canonicalShortKey.toLowerCase()}.sfgame.net`,
  };
};

type FirestoreNameCursor = { name: string } | null;
type FirestoreDocRow = { name: string; docId: string; path: string; data: any };

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

const extractDocumentPath = (docName: string): string => String(docName).split("/documents/")[1] ?? "";

const encodeDocumentPath = (path: string): string =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

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

const buildHistoryRunQueryBody = (
  serverFieldPath: "server",
  serverValue: string,
  monthFieldPath: "monthId",
  label: string,
  cursor: FirestoreNameCursor
): string => {
  const structuredQuery: any = {
    from: [{ collectionId: "history_monthly", allDescendants: true }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: monthFieldPath },
              op: "EQUAL",
              value: { stringValue: label },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: serverFieldPath },
              op: "EQUAL",
              value: { stringValue: serverValue },
            },
          },
        ],
      },
    },
    orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
    limit: PAGE_SIZE_HISTORY,
  };
  if (cursor) {
    structuredQuery.startAt = {
      values: [{ referenceValue: cursor.name }],
      before: false,
    };
  }
  return JSON.stringify({ structuredQuery });
};

const runHistoryQueryPage = async (
  baseDocsUrl: string,
  accessToken: string,
  serverFieldPath: "server",
  serverValue: string,
  monthFieldPath: "monthId",
  label: string,
  cursor: FirestoreNameCursor
): Promise<{ rows: FirestoreDocRow[]; nextCursor: FirestoreNameCursor; rawRows: number }> => {
  const body = buildHistoryRunQueryBody(serverFieldPath, serverValue, monthFieldPath, label, cursor);
  const json = await requestWithRetry("POST", `${baseDocsUrl}:runQuery`, accessToken, body);
  const res = Array.isArray(json) ? json : [];

  const rows: FirestoreDocRow[] = [];
  let nextCursor: FirestoreNameCursor = null;
  for (const r of res) {
    const doc = r?.document;
    if (!doc || typeof doc.name !== "string") continue;
    nextCursor = { name: doc.name };
    rows.push({
      name: doc.name,
      docId: extractDocId(doc.name),
      path: extractDocumentPath(doc.name),
      data: parseFirestoreDocumentFields(doc),
    });
  }
  return { rows, nextCursor, rawRows: res.length };
};

const readDocumentOrNull = async (baseDocsUrl: string, accessToken: string, path: string): Promise<any | null> => {
  try {
    const doc = await requestWithRetry("GET", `${baseDocsUrl}/${encodeDocumentPath(path)}`, accessToken);
    return parseFirestoreDocumentFields(doc);
  } catch (err: any) {
    if (err?.status === 404) return null;
    throw err;
  }
};

const writeProgressSnapshotDoc = async (
  baseDocsUrl: string,
  accessToken: string,
  targetPath: string,
  payload: { server: string; guilds: any[] }
) => {
  const nowIso = new Date().toISOString();
  const params = new URLSearchParams();
  params.append("updateMask.fieldPaths", "server");
  params.append("updateMask.fieldPaths", "updatedAt");
  params.append("updateMask.fieldPaths", "guilds");
  params.append("updateMask.fieldPaths", "publishedAt");
  const url = `${baseDocsUrl}/${targetPath}?${params.toString()}`;
  const body = JSON.stringify({
    fields: {
      server: { stringValue: payload.server },
      updatedAt: { timestampValue: nowIso },
      guilds: jsToFirestoreValue(payload.guilds),
      publishedAt: { timestampValue: nowIso },
    },
  });
  await requestWithRetry("PATCH", url, accessToken, body);
};

const resolveGuildIdFromHistoryPath = (path: string): string | null => {
  const match = /^guilds\/([^/]+)\/history_monthly\/([^/]+)$/.exec(path);
  if (!match) return null;
  return decodeURIComponent(match[1] ?? "").trim() || null;
};

const scoreOfGuildEntry = (entry: any) =>
  toFiniteNumberOrNull(entry?.sumAvg ?? entry?.avgSumBaseTotal ?? entry?.sum) ?? 0;

const resolveHistoryTimestampSec = (history: any, values: Record<string, any>): number | null => {
  const candidates = [
    history?.lastTs,
    history?.meta?.toTs,
    history?.periodEndSec,
    pickByCanon(values, G.TIMESTAMP),
    history?.lastTimestampRaw,
  ];
  for (const candidate of candidates) {
    const direct = toFiniteNumberOrNull(candidate);
    if (direct != null && direct > 0) return Math.trunc(direct > 9_999_999_999 ? direct / 1000 : direct);
    const parsed = toSecFlexible(candidate);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
};

const buildGuildEntry = (
  guildId: string,
  history: any,
  firstSummary: any | null,
  serverCode: string
): { entry: any | null; malformedValues: boolean; invalidGuildIdentifier: boolean } => {
  const values =
    history?.values && typeof history.values === "object" && !Array.isArray(history.values)
      ? (history.values as Record<string, any>)
      : {};
  const malformedValues = !(history?.values && typeof history.values === "object" && !Array.isArray(history.values));

  const guildIdentifierRaw =
    history?.guildIdentifier ??
    pickByCanon(values, G.GUILD_IDENTIFIER) ??
    firstSummary?.guildId ??
    guildId;
  const guildIdentifier = String(guildIdentifierRaw ?? "").trim();
  const invalidGuildIdentifier = !guildIdentifier;
  if (!guildIdentifier) {
    return { entry: null, malformedValues, invalidGuildIdentifier };
  }

  const latestMeta = readGuildLatestMeta(values);
  const nameRaw = history?.name ?? pickByCanon(values, G.NAME) ?? guildIdentifier;
  const name = String(nameRaw ?? guildIdentifier).trim() || guildIdentifier;
  const hofRankRaw =
    history?.hofRank ??
    pickAnyByCanon(values, [G.HOF, G.HOF_ALT, G.RANK, G.GUILD_RANK]);
  const historyMemberCount =
    toFiniteNumberOrNull(history?.memberCount) ??
    (latestMeta.memberCount > 0 ? latestMeta.memberCount : null) ??
    toNumberLoose(pickByCanon(values, G.MEMBER_COUNT));
  const count = toFiniteNumberOrNull(firstSummary?.count);
  const memberCount = count ?? historyMemberCount;

  const lastScanRaw = history?.lastTimestampRaw ?? pickByCanon(values, G.TIMESTAMP) ?? history?.lastTs ?? null;
  const lastScan = lastScanRaw != null && String(lastScanRaw).trim() !== "" ? String(lastScanRaw).trim() : null;
  const latestScanAtSec = resolveHistoryTimestampSec(history, values);

  const avgSumBaseTotal = toFiniteNumberOrNull(firstSummary?.avgSumBaseTotal);
  const entry = {
    guildId: guildIdentifier,
    guildIdentifier,
    server: serverCode,
    name,
    memberCount,
    hofRank: toNumberLoose(hofRankRaw),
    honor: toFiniteNumberOrNull(history?.honor) ?? latestMeta.honor,
    hydra: toFiniteNumberOrNull(history?.hydra) ?? latestMeta.hydra,
    instructor: toFiniteNumberOrNull(history?.instructor) ?? latestMeta.instructor,
    knights: toFiniteNumberOrNull(history?.knights) ?? latestMeta.knights,
    knights15Plus: toFiniteNumberOrNull(history?.knights15Plus) ?? latestMeta.knights15Plus,
    portalFloor: toFiniteNumberOrNull(history?.portalFloor) ?? latestMeta.portalFloor,
    raids: toFiniteNumberOrNull(history?.raids) ?? latestMeta.raids,
    treasury: toFiniteNumberOrNull(history?.treasury) ?? latestMeta.treasury,
    lastScan,
    latestScanAtSec,
    sum: null,
    sumAvg: avgSumBaseTotal,
    count,
    avgLevel: toFiniteNumberOrNull(firstSummary?.avgLevel),
    avgTreasury: toFiniteNumberOrNull(firstSummary?.avgTreasury),
    avgMine: toFiniteNumberOrNull(firstSummary?.avgMine),
    avgBaseMain: toFiniteNumberOrNull(firstSummary?.avgBaseMain),
    avgConBase: toFiniteNumberOrNull(firstSummary?.avgConBase),
    avgSumBaseTotal,
    avgAttrTotal: toFiniteNumberOrNull(firstSummary?.avgAttrTotal),
    avgConTotal: toFiniteNumberOrNull(firstSummary?.avgConTotal),
    avgTotalStats: toFiniteNumberOrNull(firstSummary?.avgTotalStats),
  };

  return { entry, malformedValues, invalidGuildIdentifier };
};

// ---------- Main ----------
const run = async () => {
  const impersonateSa = (args.get("impersonate-service-account") || process.env.FIRESTORE_IMPERSONATE_SA || "").trim();
  const projectId = await resolveProjectId();
  const { token: accessToken, authMode } = await getAccessTokenViaGcloud(impersonateSa || undefined);
  const baseDocsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  const serverArg = requireArg("server").trim();
  const fromArg = requireArg("from");
  const toArg = requireArg("to");
  const label = parseLabel(requireArg("label"));

  const fromDate = parseDateArg(fromArg, "from");
  const toDate = parseDateArg(toArg, "to");
  const fromSec = Math.floor(fromDate.getTime() / 1000);
  const toSec = Math.floor(toDate.getTime() / 1000);
  if (fromSec > toSec) throw new Error(`Invalid range: from > to (${fromArg} > ${toArg})`);

  const dryRun = args.get("dry-run") === "true";
  const resolvedServer = resolveServerKeys(serverArg);
  const serverCode = resolvedServer.writeKey;
  const docId = `${serverCode}__${label}`;
  const targetPath = `${STATS_PUBLIC_GUILD_PROGRESS}/${docId}`;
  const serverReadCandidates = getTopLevelServerReadCandidates(resolvedServer.canonicalShortKey);
  const historyServerReadCandidates = getHistoryMonthlyServerReadCandidates(resolvedServer);

  console.log(`[monthly-guild-toplists] auth mode: ${authMode}`);
  if (impersonateSa) console.log(`[monthly-guild-toplists] impersonated SA: ${impersonateSa}`);
  console.log(`[monthly-guild-toplists] project: ${projectId}`);
  console.log(`[monthly-guild-toplists] input server: ${serverArg}`);
  console.log(`[monthly-guild-toplists] canonical server: ${serverCode}`);
  console.log(`[monthly-guild-toplists] label: ${label}`);
  console.log(`[monthly-guild-toplists] from: ${fromDate.toISOString()}`);
  console.log(`[monthly-guild-toplists] to: ${toDate.toISOString()}`);
  console.log(`[monthly-guild-toplists] server read aliases: ${serverReadCandidates.join(", ")}`);
  console.log(
    `[monthly-guild-toplists] history_monthly server candidates: ${historyServerReadCandidates.join(", ")}`
  );
  console.log(`[monthly-guild-toplists] values.server example candidate: ${resolvedServer.longValueServer}`);
  console.log(`[monthly-guild-toplists] target doc: ${targetPath}`);

  const historyByName = new Map<string, FirestoreDocRow>();
  const queryHistory = async (
    serverFieldPath: "server",
    monthFieldPath: "monthId",
    serverValues: readonly string[]
  ) => {
    for (const serverValue of serverValues) {
      let cursor: FirestoreNameCursor = null;
      for (;;) {
        const { rows, nextCursor } = await runHistoryQueryPage(
          baseDocsUrl,
          accessToken,
          serverFieldPath,
          serverValue,
          monthFieldPath,
          label,
          cursor
        );
        if (rows.length === 0) break;

        for (const row of rows) {
          if (!historyByName.has(row.name)) historyByName.set(row.name, row);
        }

        if (!nextCursor) break;
        if (cursor && cursor.name === nextCursor.name) {
          throw new Error("REST runQuery pagination cursor did not advance; aborting to prevent infinite loop.");
        }
        cursor = nextCursor;
      }
    }
  };

  await queryHistory("server", "monthId", historyServerReadCandidates);
  if (historyByName.size === 0) {
    console.warn(
      `[monthly-guild-toplists] History query returned 0 docs for monthId=${label} and history_monthly.server candidates=${historyServerReadCandidates.join(", ")}.`
    );
  }

  if (historyByName.size === 0) {
    console.warn("[monthly-guild-toplists] No guild history docs found; no empty public snapshot will be written.");
    console.warn(
      `[monthly-guild-toplists] Zero-result filter: collectionGroup(history_monthly), label=${label}, history_monthly.server=${historyServerReadCandidates.join(", ")}`
    );
    console.log("[monthly-guild-toplists] Guilds discovered:", 0);
    console.log("[monthly-guild-toplists] Guild history docs read:", 0);
    console.log("[monthly-guild-toplists] Member summaries read:", 0);
    console.log("[monthly-guild-toplists] Complete guild entries:", 0);
    console.log("[monthly-guild-toplists] Partial guild entries:", 0);
    console.log("[monthly-guild-toplists] Skipped guilds:", 0);
    console.log("[monthly-guild-toplists] Guilds written:", 0);
    console.log("[monthly-guild-toplists] Payload size:", 0);
    console.log("[monthly-guild-toplists] Target doc:", targetPath);
    console.log("[monthly-guild-toplists] Dry run:", dryRun);
    return;
  }

  let historyDocsRead = 0;
  let memberSummariesRead = 0;
  let completeGuildEntries = 0;
  let partialGuildEntries = 0;
  let skippedGuilds = 0;
  let missingHistoryMonthly = 0;
  let missingMembersSummaryFirst = 0;
  let invalidGuildIdentifier = 0;
  let wrongServer = 0;
  let badTimestamp = 0;
  let malformedValues = 0;

  const guilds: any[] = [];
  for (const historyDoc of historyByName.values()) {
    historyDocsRead++;
    const pathGuildId = resolveGuildIdFromHistoryPath(historyDoc.path);
    const history = historyDoc.data || {};
    const values = history?.values && typeof history.values === "object" && !Array.isArray(history.values)
      ? (history.values as Record<string, any>)
      : {};

    if (!pathGuildId) {
      missingHistoryMonthly++;
      skippedGuilds++;
      continue;
    }

    const sourceServer = String(history?.server ?? history?.meta?.server ?? pickByCanon(values, G.SERVER) ?? "").trim();
    if (sourceServer) {
      const sourceCanonical = normalizeServerShortKey(sourceServer);
      if (sourceCanonical !== resolvedServer.canonicalShortKey) {
        wrongServer++;
        skippedGuilds++;
        continue;
      }
    }

    const latestScanAtSec = resolveHistoryTimestampSec(history, values);
    if (latestScanAtSec == null || latestScanAtSec < fromSec || latestScanAtSec > toSec) {
      badTimestamp++;
      if (latestScanAtSec != null) {
        console.warn("[monthly-guild-toplists] Skipping history doc outside requested range", {
          guildId: pathGuildId,
          historyPath: historyDoc.path,
          latestScanAtSec,
          fromSec,
          toSec,
        });
        skippedGuilds++;
        continue;
      }
    }

    const firstPath = `guilds/${pathGuildId}/history_monthly/${label}/snapshots/members_summary_first`;
    const firstSummary = await readDocumentOrNull(baseDocsUrl, accessToken, firstPath);
    memberSummariesRead++;
    if (!firstSummary) missingMembersSummaryFirst++;

    const built = buildGuildEntry(pathGuildId, history, firstSummary, serverCode);
    if (built.malformedValues) malformedValues++;
    if (built.invalidGuildIdentifier) {
      invalidGuildIdentifier++;
      skippedGuilds++;
      continue;
    }
    if (!built.entry) {
      skippedGuilds++;
      continue;
    }

    if (firstSummary) completeGuildEntries++;
    else partialGuildEntries++;
    guilds.push(built.entry);
  }

  guilds.sort((a, b) => {
    const diff = scoreOfGuildEntry(b) - scoreOfGuildEntry(a);
    if (diff !== 0) return diff;
    return String(a.guildId ?? "").localeCompare(String(b.guildId ?? ""));
  });
  if (guilds.length > GUILD_DERIVED_SNAPSHOT_LIMIT) guilds.length = GUILD_DERIVED_SNAPSHOT_LIMIT;

  const sizeBytes = Buffer.byteLength(JSON.stringify({ server: serverCode, guilds }), "utf8");
  if (sizeBytes > DOC_SIZE_LIMIT_BYTES) {
    throw new Error(
      `Snapshot payload is ~${sizeBytes} bytes (limit 1,000,000). Do not write; sharding needs a separate design.`
    );
  }

  if (guilds.length === 0) {
    console.warn("[monthly-guild-toplists] 0 valid guild entries after filtering; no empty public snapshot will be written.");
  } else if (!dryRun) {
    await writeProgressSnapshotDoc(baseDocsUrl, accessToken, targetPath, { server: serverCode, guilds });
  } else {
    console.log(`[monthly-guild-toplists] Dry run: would PATCH ${targetPath} (progress snapshot only)`);
  }

  console.log("[monthly-guild-toplists] Guilds discovered:", historyByName.size);
  console.log("[monthly-guild-toplists] Guild history docs read:", historyDocsRead);
  console.log("[monthly-guild-toplists] Member summaries read:", memberSummariesRead);
  console.log("[monthly-guild-toplists] Complete guild entries:", completeGuildEntries);
  console.log("[monthly-guild-toplists] Partial guild entries:", partialGuildEntries);
  console.log("[monthly-guild-toplists] Skipped guilds:", skippedGuilds);
  console.log("[monthly-guild-toplists] Guilds written:", guilds.length);
  console.log("[monthly-guild-toplists] Payload size:", sizeBytes);
  console.log("[monthly-guild-toplists] Target doc:", targetPath);
  console.log("[monthly-guild-toplists] Dry run:", dryRun);
  console.log("[monthly-guild-toplists] Missing history_monthly:", missingHistoryMonthly);
  console.log("[monthly-guild-toplists] Missing members_summary_first:", missingMembersSummaryFirst);
  console.log("[monthly-guild-toplists] Invalid guild identifier:", invalidGuildIdentifier);
  console.log("[monthly-guild-toplists] Wrong server:", wrongServer);
  console.log("[monthly-guild-toplists] Bad timestamp:", badTimestamp);
  console.log("[monthly-guild-toplists] Malformed values:", malformedValues);
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
