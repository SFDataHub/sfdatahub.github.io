// tools/index-compact-daily.mts
// Run examples:
//   npx tsx tools/index-compact-daily.mts
//   npx tsx tools/index-compact-daily.mts --date 20251015
//   npx tsx tools/index-compact-daily.mts --only players
//   npx tsx tools/index-compact-daily.mts --only guilds
//   npx tsx tools/index-compact-daily.mts --N 120 --Ng 50
//
// Auth: gcloud auth application-default login

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ---------- Init ----------
try {
  initializeApp({ credential: applicationDefault() });
} catch {}
const db = getFirestore();

// ---------- Config ----------
const META_DOC_PATH = "stats_public/toplists_meta_v1";

const PLAYER_DERIVED_COL = "stats_cache_player_derived";
const GUILD_AVG_CACHE_COL = "stats_cache_guild_avgs";

const PLAYERS_INDEX_COL = "stats_index_players_daily_compact";
const GUILDS_INDEX_COL  = "stats_index_guilds_daily_compact";

const LATEST_DOC_ID = "latest";

// ---------- Utils ----------
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const todayYYYYMMDDLocal = (): number => {
  const d = new Date();
  return +(d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()));
};

const toNumber = (v: any): number => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s || s === "-" || s.toLowerCase() === "nan") return 0;
  s = s.replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

type Meta = {
  enabledGroups: string[];
  servers: any;
  limits: {
    playersPerServerLimit?: number;
    playersGlobalLimit?: number;
    guildsPerServerLimit?: number;
    guildsGlobalLimit?: number;
  };
};

const loadMeta = async (): Promise<Meta> => {
  const snap = await db.doc(META_DOC_PATH).get();
  if (!snap.exists) throw new Error(`Meta missing at ${META_DOC_PATH}`);
  const d = snap.data() || {};
  return {
    enabledGroups: (d.enabledGroups || []) as string[],
    servers: d.servers || {},
    limits: d.limits || {},
  };
};

// ---------- Scopes ----------
type Scope = { scopeId: string; group: string; serverKey: string; sort: "sum" | "sumAvg" };

const expandScopes = (meta: Meta) => {
  const groupScopes: Scope[] = [];
  const serverScopes: Scope[] = [];

  const groups = meta.enabledGroups || [];
  for (const g of groups) {
    groupScopes.push({ scopeId: `${g}_all_sum`, group: g, serverKey: "all", sort: "sum" });
    groupScopes.push({ scopeId: `${g}_all_sumAvg`, group: g, serverKey: "all", sort: "sumAvg" });
  }

  const serversCfg = meta.servers || {};
  const pushServer = (group: string, key: string) => {
    serverScopes.push({ scopeId: `${group}_${key}_sum`, group, serverKey: key, sort: "sum" });
    serverScopes.push({ scopeId: `${group}_${key}_sumAvg`, group, serverKey: key, sort: "sumAvg" });
  };

  if (serversCfg.EU?.type === "range") {
    const from = toNumber(serversCfg.EU.from), to = toNumber(serversCfg.EU.to);
    for (let i = from; i <= to; i++) pushServer("EU", `EU${i}`);
  }
  if (serversCfg.FUSION?.type === "range") {
    const from = toNumber(serversCfg.FUSION.from), to = toNumber(serversCfg.FUSION.to);
    for (let i = from; i <= to; i++) pushServer("FUSION", `F${i}`);
  }
  if (serversCfg.US?.type === "list" && Array.isArray(serversCfg.US.codes)) {
    for (const c of serversCfg.US.codes) pushServer("US", String(c));
  }
  if (serversCfg.INT?.type === "list" && Array.isArray(serversCfg.INT.codes)) {
    for (const c of serversCfg.INT.codes) pushServer("INT", String(c));
  }

  return { groupScopes, serverScopes };
};

// ---------- Players index ----------
type CompactDoc = {
  n: number;
  ids: string[];
  vals: number[];
  ranks: number[];
  generatedAt: number;
};

const writePlayersIndex = async (dateKey: number, scope: Scope, N: number) => {
  const ref = db.collection(PLAYERS_INDEX_COL).doc(`${dateKey}__${scope.scopeId}`);

  let q = db.collection(PLAYER_DERIVED_COL) as FirebaseFirestore.Query;
  if (scope.serverKey !== "all") {
    q = q.where("serverKey", "==", scope.serverKey);
  } else {
    if (scope.group !== "ALL") q = q.where("group", "==", scope.group);
  }
  q = q.orderBy("sum", "desc").limit(N);

  const snap = await q.get();
  const ids: string[] = [];
  const vals: number[] = [];
  const ranks: number[] = [];
  let r = 1;

  snap.forEach(d => {
    const data = d.data() as any;
    const pid = String(data.playerId || d.id);
    ids.push(pid);
    vals.push(toNumber(data.sum));
    ranks.push(r++);
  });

  const payload: CompactDoc = {
    n: ids.length,
    ids, vals, ranks,
    generatedAt: Date.now(),
  };
  await ref.set(payload, { merge: true });
  return ids.length;
};

// ---------- Guild helpers ----------
const normalizeServerToKey = (raw: any): { group: string; serverKey: string } => {
  const s = String(raw || "").toUpperCase();
  let m = s.match(/S?(\d+)[._-]?EU|S(\d+)\.SFGAME\.EU/);
  if (m) return { group: "EU", serverKey: `EU${m[1] || m[2]}` };
  if (s.includes("AM1") || s.includes("S1.SFGAME.US")) return { group: "US", serverKey: "AM1" };
  if (s.includes("MAERWYNN")) return { group: "INT", serverKey: "MAERWYNN" };
  m = s.match(/F(\d+)/);
  if (m) return { group: "FUSION", serverKey: `F${m[1]}` };
  return { group: "ALL", serverKey: "all" };
};

const fetchGuildSumAvg = async (guildLatest: FirebaseFirestore.QueryDocumentSnapshot): Promise<{ guildId: string; sumAvg: number }> => {
  const latest = guildLatest.data() || {};
  const guildId = String(latest.guildIdentifier || latest.guildId || guildLatest.ref.parent.parent?.parent?.id || guildLatest.id);
  const ts = toNumber(latest.timestamp);
  const cacheId = `${guildId}__${ts}`;
  const cacheSnap = await db.collection(GUILD_AVG_CACHE_COL).doc(cacheId).get();
  if (!cacheSnap.exists) return { guildId, sumAvg: 0 };
  const c = cacheSnap.data() as any;
  return { guildId, sumAvg: toNumber(c.sumAvg) };
};

// ---------- Guilds index ----------
const writeGuildsIndex = async (dateKey: number, scope: Scope, Ng: number) => {
  const ref = db.collection(GUILDS_INDEX_COL).doc(`${dateKey}__${scope.scopeId}`);

  // Hole alle guilds/*/latest/latest (wir filtern lokal)
  let q = db.collectionGroup(LATEST_DOC_ID) as FirebaseFirestore.Query;
  q = q.where("name", ">=", ""); // leichter Starter, vermeidet harte Composite-Anforderungen
  const guildLatestSnap = await q.get();

  const rows: { id: string; val: number; group: string; serverKey: string }[] = [];
  for (const doc of guildLatestSnap.docs) {
    const latest = doc.data() || {};
    const { group, serverKey } = normalizeServerToKey(latest.server || latest.Server || "");
    if (scope.serverKey !== "all") {
      if (serverKey !== scope.serverKey) continue;
    } else {
      if (scope.group !== "ALL" && group !== scope.group) continue;
    }
    const { guildId, sumAvg } = await fetchGuildSumAvg(doc);
    rows.push({ id: guildId, val: sumAvg, group, serverKey });
  }

  rows.sort((a, b) => b.val - a.val);
  const top = rows.slice(0, Ng);
  const ids = top.map(r => r.id);
  const vals = top.map(r => r.val);
  const ranks = top.map((_, i) => i + 1);

  const payload: CompactDoc = {
    n: ids.length,
    ids, vals, ranks,
    generatedAt: Date.now(),
  };
  await ref.set(payload, { merge: true });
  return ids.length;
};

// ---------- Main ----------
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

const dateArg = args.get("date");
const onlyArg = args.get("only"); // 'players' | 'guilds'
const NArg = args.get("N");
const NgArg = args.get("Ng");

(async () => {
  const meta = await loadMeta();
  const { groupScopes, serverScopes } = expandScopes(meta);
  const scopes: Scope[] = [...groupScopes, ...serverScopes];

  const dateKey = dateArg ? Number(dateArg) : todayYYYYMMDDLocal();
  const N  = NArg  ? Number(NArg)  : 120;
  const Ng = NgArg ? Number(NgArg) : (meta.limits.guildsPerServerLimit || 50);

  let pCount = 0, gCount = 0;

  if (!onlyArg || onlyArg === "players") {
    for (const s of scopes) {
      if (s.sort !== "sum") continue;
      pCount += await writePlayersIndex(dateKey, s, N);
      await new Promise(r => setTimeout(r, 10));
    }
  }

  if (!onlyArg || onlyArg === "guilds") {
    for (const s of scopes) {
      if (s.sort !== "sumAvg") continue;
      gCount += await writeGuildsIndex(dateKey, s, Ng);
      await new Promise(r => setTimeout(r, 10));
    }
  }

  console.log(`compact daily done for ${dateKey}. players entries: ${pCount}, guilds entries: ${gCount}`);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
