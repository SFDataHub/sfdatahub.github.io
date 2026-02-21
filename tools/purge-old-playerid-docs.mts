// tools/purge-old-playerid-docs.mts
// Run: npx tsx tools/purge-old-playerid-docs.mts --project <id> [--limit <n>]
// Run: npx tsx tools/purge-old-playerid-docs.mts --execute --project <id> [--limit <n>]
// Auth: gcloud auth login (user token via REST; no ADC)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import https from "node:https";

const execFileAsync = promisify(execFile);

// ---------- Config ----------
const PLAYERS_COL = "players";
const SUBCOLS = ["scans", "history_weekly", "history_monthly"] as const;
const NUMERIC_ID = /^\d+$/;
const PAGE_SIZE_SCANS = 200;
const PAGE_SIZE_SUBCOL = 10;
const PROGRESS_EVERY = 50;
const RETRY_STATUSES = new Set([429, 503]);
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 200;
const MAX_NAMESPACES = 200;
const MAX_TOTAL_DELETES = 20000;

type Cursor = { name: string; playerId: string } | null;
type DocInfo = { name: string; playerId: string };

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

const execute = args.get("execute") === "true";
const projectId = args.get("project");
if (!projectId) {
  console.error("Missing required --project <id>");
  process.exit(2);
}
const limitArg = args.get("limit");
const limit = limitArg ? Number(limitArg) : null;
if (limitArg && (!Number.isFinite(limit) || (limit as number) <= 0)) {
  console.error(`Invalid --limit: ${limitArg}`);
  process.exit(2);
}

// ---------- HTTP helpers ----------
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
    const json = await res.json().catch(() => ({}));
    return json;
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
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
};

// ---------- Token ----------
const getUserToken = async (): Promise<string> => {
  try {
    const isWin = process.platform === "win32";
    const { stdout } = isWin
      ? await execFileAsync("cmd.exe", ["/d", "/s", "/c", "gcloud auth print-access-token"], {
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        })
      : await execFileAsync("gcloud", ["auth", "print-access-token"], { maxBuffer: 1024 * 1024 });
    const token = stdout.trim();
    if (!token) throw new Error('no token returned. Bitte "gcloud auth login".');
    return token;
  } catch (err: any) {
    const msg = err?.message || String(err);
    const code = err?.code ? ` code=${err.code}` : "";
    throw new Error(`Failed to obtain access token via gcloud (${msg}${code}). Bitte "gcloud auth login".`);
  }
};

// ---------- Firestore REST helpers ----------
const baseDocsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const RUNQUERY_URL = `${baseDocsUrl}:runQuery`;

type ListResponse = {
  documents?: { name: string }[];
  nextPageToken?: string;
};

const listDocuments = async (collectionPath: string, pageSize: number, pageToken?: string): Promise<ListResponse> => {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) params.set("pageToken", pageToken);
  const url = `${baseDocsUrl}/${collectionPath}?${params.toString()}`;
  return requestWithRetry("GET", url, accessToken) as Promise<ListResponse>;
};

const deleteDocument = async (docName: string) => {
  const url = `https://firestore.googleapis.com/v1/${encodeURI(docName)}`;
  await requestWithRetry("DELETE", url, accessToken);
};

const extractId = (docName: string): string => {
  const parts = docName.split("/");
  return parts[parts.length - 1];
};

// ---------- runQuery builders ----------
const buildScansQueryBody = (cursor: Cursor): string => {
  const structuredQuery: any = {
    from: [{ collectionId: "scans", allDescendants: true }],
    where: {
      unaryFilter: { op: "IS_NOT_NULL", field: { fieldPath: "playerId" } },
    },
    select: { fields: [{ fieldPath: "__name__" }, { fieldPath: "playerId" }] },
    orderBy: [
      { field: { fieldPath: "playerId" }, direction: "ASCENDING" },
      { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
    ],
    limit: PAGE_SIZE_SCANS,
  };
  if (cursor) {
    const playerValue = /^\d+$/.test(cursor.playerId)
      ? { integerValue: cursor.playerId }
      : { stringValue: cursor.playerId };
    structuredQuery.startAt = {
      values: [playerValue, { referenceValue: cursor.name }],
      before: false,
    };
  }
  return JSON.stringify({ structuredQuery });
};

const runQueryPage = async (cursor: Cursor): Promise<{ infos: DocInfo[]; rawRows: number }> => {
  const body = buildScansQueryBody(cursor);
  console.log(`[purge-old-playerid-docs] runQuery body: ${body}`);
  let res: any[] = [];
  try {
    const json = await requestWithRetry("POST", `${baseDocsUrl}:runQuery`, accessToken, body);
    res = Array.isArray(json) ? json : [];
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (String(msg).includes("FAILED_PRECONDITION") && String(msg).toLowerCase().includes("index")) {
      console.error(
        'Need collection group single-field index for scans.playerId (ASC). Enable collection group indexing for scans.playerId.'
      );
    }
    throw err;
  }

  const infos: DocInfo[] = res.flatMap((r: any): DocInfo[] => {
    const doc = r?.document;
    if (!doc || typeof doc.name !== "string") return [];
    const match = /\/documents\/players\/([^/]+)\/scans\//.exec(doc.name);
    const pidFromPath = match?.[1];
    if (!pidFromPath || !NUMERIC_ID.test(pidFromPath)) return [];

    const fields = doc.fields || {};
    const pidStr = typeof fields.playerId?.stringValue === "string" ? fields.playerId.stringValue : undefined;
    const pidIntRaw = fields.playerId?.integerValue;
    const pidInt = pidIntRaw != null ? String(pidIntRaw) : undefined;
    const playerId = pidStr ?? pidInt ?? pidFromPath;
    if (!NUMERIC_ID.test(playerId)) return [];

    return [{ name: doc.name, playerId }];
  });

  return { infos, rawRows: res.length };
};

// ---------- State ----------
let accessToken: string;

const run = async () => {
  console.log(
    `[purge-old-playerid-docs] start project=${projectId} execute=${execute} limit=${limit ?? "none"} pageSizeScans=${PAGE_SIZE_SCANS}`
  );
  console.log(
    `Env GOOGLE_APPLICATION_CREDENTIALS: ${
      process.env.GOOGLE_APPLICATION_CREDENTIALS ? `set (${path.basename(process.env.GOOGLE_APPLICATION_CREDENTIALS)})` : "unset"
    }`
  );

  accessToken = await getUserToken();

  const stats = {
    namespacesFound: 0,
    namespacesDeleted: 0,
    deleted: {
      scans: 0,
      latest: 0,
      history_weekly: 0,
      history_monthly: 0,
      root: 0,
      total: 0,
    },
    errors: 0,
    aborted: false,
  };

  const namespaces = new Set<string>();

  // Discovery via collectionGroup(scans) by path (numeric only)
  let cursor: Cursor = null;
  let lastCursor = "";
  let page = 0;
  while (namespaces.size < (limit || MAX_NAMESPACES) && namespaces.size < MAX_NAMESPACES) {
    page++;
    const { infos, rawRows } = await runQueryPage(cursor);
    if (!infos.length) break;
    for (const info of infos) {
      namespaces.add(info.playerId);
      if (namespaces.size >= (limit || MAX_NAMESPACES) || namespaces.size >= MAX_NAMESPACES) break;
    }
    const last = infos[infos.length - 1];
    const nextCursor = last ? { playerId: last.playerId, name: last.name } : null;
    const cursorKey = nextCursor ? `${nextCursor.name}` : "";
    console.log(
      `[purge-old-playerid-docs] page=${page} rawRows=${rawRows} uniquePlayerNamespaces=${namespaces.size} cursor=${cursorKey || "(none)"}`
    );
    if (!nextCursor || cursorKey === lastCursor) break;
    lastCursor = cursorKey;
    cursor = nextCursor;
  }

  const namespaceList = Array.from(namespaces);
  stats.namespacesFound = namespaceList.length;

  if (!execute) {
    const sample = namespaceList.slice(0, 20);
    console.log(
      `[purge-old-playerid-docs] namespacesFound=${stats.namespacesFound} namespacesPlanned=${namespaceList.length} sampleNumericIds=${sample.length ? sample.join(",") : "(none)"} (dry-run, nothing deleted)`
    );
    console.log(
      `[purge-old-playerid-docs] limits MAX_NAMESPACES=${MAX_NAMESPACES} MAX_TOTAL_DELETES=${MAX_TOTAL_DELETES}`
    );
    return;
  }

  const ensureBudget = (wouldAdd: number): boolean => {
    if (stats.deleted.total + wouldAdd > MAX_TOTAL_DELETES) {
      stats.aborted = true;
      console.error(
        `[purge-old-playerid-docs] abort: total deletes would exceed MAX_TOTAL_DELETES (${MAX_TOTAL_DELETES}). current=${stats.deleted.total} add=${wouldAdd}`
      );
      return false;
    }
    return true;
  };

  const deleteSubcollectionDocs = async (playerId: string, subcol: string) => {
    let token: string | undefined;
    do {
      let res: ListResponse;
      try {
        res = await listDocuments(`${PLAYERS_COL}/${playerId}/${subcol}`, PAGE_SIZE_SUBCOL, token);
      } catch (err: any) {
        if (err?.status === 404) break;
        throw err;
      }
      const docs = res.documents || [];
      if (!ensureBudget(docs.length)) return;
      for (const doc of docs) {
        try {
          await deleteDocument(doc.name);
          (stats.deleted as any)[subcol] += 1;
          stats.deleted.total += 1;
        } catch (err: any) {
          if (err?.status === 404) continue;
          stats.errors++;
          console.error(`Failed to delete ${doc.name}: ${err?.message ?? err}`);
        }
      }
      token = res.nextPageToken;
    } while (token && !stats.aborted);
  };

  for (const playerId of namespaces) {
    if (stats.aborted) break;
    if (!NUMERIC_ID.test(playerId)) continue;

    for (const sub of SUBCOLS) {
      await deleteSubcollectionDocs(playerId, sub);
      if (stats.aborted) break;
    }
    if (stats.aborted) break;

    // latest/latest doc
    if (ensureBudget(1)) {
      try {
        await deleteDocument(
          `projects/${projectId}/databases/(default)/documents/${PLAYERS_COL}/${playerId}/latest/latest`
        );
        stats.deleted.latest += 1;
        stats.deleted.total += 1;
      } catch (err: any) {
        if (err?.status === 404) {
          // ignore
        } else {
          stats.errors++;
          console.error(`Failed to delete latest doc for ${playerId}: ${err?.message ?? err}`);
        }
      }
    } else break;

    // delete root doc
    if (ensureBudget(1)) {
      try {
        await deleteDocument(`projects/${projectId}/databases/(default)/documents/${PLAYERS_COL}/${playerId}`);
        stats.deleted.root += 1;
        stats.deleted.total += 1;
        stats.namespacesDeleted++;
      } catch (err: any) {
        stats.errors++;
        console.error(`Failed to delete players/${playerId}: ${err?.message ?? err}`);
      }
    } else break;

    if (stats.namespacesDeleted % PROGRESS_EVERY === 0) {
      console.log(
        `[purge-old-playerid-docs] progress namespacesDeleted=${stats.namespacesDeleted} deleted.total=${stats.deleted.total} errors=${stats.errors}`
      );
    }

    if (stats.deleted.total >= MAX_TOTAL_DELETES) {
      stats.aborted = true;
      console.error(
        `[purge-old-playerid-docs] abort: reached MAX_TOTAL_DELETES (${MAX_TOTAL_DELETES})`
      );
      break;
    }
  }

  console.log(
    `[purge-old-playerid-docs] summary namespacesFound=${stats.namespacesFound} namespacesDeleted=${stats.namespacesDeleted} deleted.scans=${stats.deleted.scans} deleted.history_weekly=${stats.deleted.history_weekly} deleted.history_monthly=${stats.deleted.history_monthly} deleted.latest=${stats.deleted.latest} deleted.root=${stats.deleted.root} totalDeleted=${stats.deleted.total} errors=${stats.errors} aborted=${stats.aborted}`
  );
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
