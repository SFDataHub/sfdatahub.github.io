// tools/build-toplists.mts
// Build p1 Pages for Players (sum) and Guilds (sumAvg) across all groups/servers and time ranges.
// Run examples:
//   npx tsx tools/build-toplists.mts
//   npx tsx tools/build-toplists.mts --date 20251015
//
// Auth: gcloud auth application-default login

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ---------- Init ----------
try { initializeApp({ credential: applicationDefault() }); } catch {}
const db = getFirestore();

// ---------- Config ----------
const META_DOC_PATH = "stats_public/toplists_meta_v1";
const PLAYERS_PAGES_COL = "stats_public/toplists_players_v1";
const GUILDS_PAGES_COL  = "stats_public/toplists_guilds_v1";

const PLAYER_DERIVED_COL = "stats_cache_player_derived";
const GUILD_AVG_CACHE_COL = "stats_cache_guild_avgs";
const PLAYERS_INDEX_COL = "stats_index_players_daily_compact";
const GUILDS_INDEX_COL  = "stats_index_guilds_daily_compact";

const PLAYERS_COL = "players";
const GUILDS_COL  = "guilds";
const LATEST_DOC_ID = "latest";

const SUPPORTED_RANGES = ["all","3d","7d","14d","30d","60d","90d"] as const;

// ---------- Utils ----------
const pad2 = (n:number)=> (n<10?`0${n}`:String(n));
const toYYYYMMDDLocal = (d:Date)=> +(d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate()));
const fromYYYYMMDD = (n:number)=> {
  const s = String(n); const y=+s.slice(0,4), m=+s.slice(4,6), d=+s.slice(6,8);
  return new Date(y, m-1, d);
};
const shiftDaysYYYYMMDD = (dateKey:number, delta:number)=> {
  const d = fromYYYYMMDD(dateKey);
  d.setDate(d.getDate()+delta);
  return toYYYYMMDDLocal(d);
};

const toNumber = (v:any):number=>{
  if (typeof v==="number") return v;
  if (v==null) return 0;
  let s=String(v).trim();
  if (!s || s==="-" || s.toLowerCase()==="nan") return 0;
  s=s.replace(/\s+/g,"").replace(/\.(?=\d{3}\b)/g,"").replace(/,/g,".");
  const n=Number(s); return Number.isFinite(n)?n:0;
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
  defaults: {
    pageSize: number|string;
  };
  columnKeysPlayers?: string[];
  columnKeysGuilds?: string[];
};
const loadMeta = async (): Promise<Meta> => {
  const snap = await db.doc(META_DOC_PATH).get();
  if (!snap.exists) throw new Error(`Meta missing at ${META_DOC_PATH}`);
  return snap.data() as Meta;
};

// Scope handling
type Scope = { scopeId: string; group: string; serverKey: string; sort: "sum"|"sumAvg" };
const expandScopes = (meta: Meta) => {
  const groupScopes: Scope[] = [];
  const serverScopes: Scope[] = [];

  for (const g of (meta.enabledGroups||[])) {
    groupScopes.push({scopeId:`${g}_all_sum`, group:g, serverKey:"all", sort:"sum"});
    groupScopes.push({scopeId:`${g}_all_sumAvg`, group:g, serverKey:"all", sort:"sumAvg"});
  }

  const serversCfg = meta.servers || {};
  const pushServer = (group:string, key:string)=>{
    serverScopes.push({scopeId:`${group}_${key}_sum`, group, serverKey:key, sort:"sum"});
    serverScopes.push({scopeId:`${group}_${key}_sumAvg`, group, serverKey:key, sort:"sumAvg"});
  };

  if (serversCfg.EU?.type==="range") {
    for (let i=toNumber(serversCfg.EU.from); i<=toNumber(serversCfg.EU.to); i++) pushServer("EU",`EU${i}`);
  }
  if (serversCfg.FUSION?.type==="range") {
    for (let i=toNumber(serversCfg.FUSION.from); i<=toNumber(serversCfg.FUSION.to); i++) pushServer("FUSION",`F${i}`);
  }
  if (serversCfg.US?.type==="list" && Array.isArray(serversCfg.US.codes)) {
    for (const c of serversCfg.US.codes) pushServer("US", String(c));
  }
  if (serversCfg.INT?.type==="list" && Array.isArray(serversCfg.INT.codes)) {
    for (const c of serversCfg.INT.codes) pushServer("INT", String(c));
  }

  return {groupScopes, serverScopes};
};

// ---------- Helpers for indices ----------
const loadPlayersIndex = async (dateKey:number, scopeId:string)=>{
  const snap = await db.collection(PLAYERS_INDEX_COL).doc(`${dateKey}__${scopeId}`).get();
  return snap.exists ? (snap.data() as any) : null; // {n, ids, vals, ranks}
};
const loadGuildsIndex = async (dateKey:number, scopeId:string)=>{
  const snap = await db.collection(GUILDS_INDEX_COL).doc(`${dateKey}__${scopeId}`).get();
  return snap.exists ? (snap.data() as any) : null;
};

// ---------- Build Players Page ----------
async function buildPlayersPage(dateKey:number, range:string, scope:Scope, meta:Meta) {
  if (scope.sort!=="sum") return;

  const todayIdx = await loadPlayersIndex(dateKey, scope.scopeId);
  if (!todayIdx) return; // nichts zu tun (Index fehlt)

  const pageSize = typeof meta.defaults?.pageSize==="string" ? toNumber(meta.defaults.pageSize) : (meta.defaults?.pageSize||100);
  const totalRows = todayIdx.n || todayIdx.ids.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const currentIds: string[] = todayIdx.ids || [];
  const pageIds = currentIds.slice(0, pageSize);

  // Baseline für Range
  let baselineVals = new Map<string, number>();
  let baselineRanks = new Map<string, number>();
  if (range!=="all") {
    const days = toNumber(range.replace("d",""));
    const baseKey = shiftDaysYYYYMMDD(dateKey, -days);
    const baseIdx = await loadPlayersIndex(baseKey, scope.scopeId);
    if (baseIdx) {
      (baseIdx.ids||[]).forEach((id:string, i:number)=>{
        baselineVals.set(id, toNumber(baseIdx.vals?.[i] ?? 0));
        baselineRanks.set(id, toNumber(baseIdx.ranks?.[i] ?? (i+1)));
      });
    }
  }

  // Aktuelle Rank Map
  const currRank = new Map<string, number>();
  (todayIdx.ids||[]).forEach((id:string,i:number)=>currRank.set(id, i+1));

  // Daten sammeln: player_derived + latest (treasury, mine, lastScan)
  const rows:any[] = [];
  for (const pid of pageIds) {
    const dSnap = await db.collection(PLAYER_DERIVED_COL).doc(pid).get();
    if (!dSnap.exists) continue;
    const d = dSnap.data() as any;

    // treasury/mine/lastScan aus players/latest/latest
    let treasury = 0, mine = 0, lastScan = "";
    try {
      const latestRef = db.doc(`${PLAYERS_COL}/${pid}/latest/${LATEST_DOC_ID}`);
      const lSnap = await latestRef.get();
      if (lSnap.exists) {
        const l = lSnap.data() as any;
        treasury = toNumber(l.values?.["Treasury"]);
        mine     = toNumber(l.values?.["Mine"] ?? l.values?.["Quarry"] ?? 0);
        lastScan = String(l.timestampRaw || l.timestamp || "");
      }
    } catch {}

    // Deltas
    let deltaSum:number = 0;
    let deltaRank:any = "-";
    if (range!=="all") {
      const prevVal = baselineVals.get(pid);
      const prevRank = baselineRanks.get(pid);
      deltaSum  = prevVal!=null ? (toNumber(d.sum) - toNumber(prevVal)) : 0;
      const nowR = currRank.get(pid) || 0;
      deltaRank = (prevRank!=null && nowR>0) ? (prevRank - nowR) : 0;
    }

    // Row nach columnKeysPlayers
    const ck = meta.columnKeysPlayers || ["flag","deltaRank","server","name","class","level","guild","main","con","sum","ratio","treasury","mine","lastScan","deltaSum"];
    const map:any = {
      flag: "",
      deltaRank,
      server: d.serverKey || "",
      name: d.name || "",
      class: d.class || "",
      level: toNumber(d.level),
      guild: d.guildName || "",
      main: toNumber(d.main),
      con: toNumber(d.con),
      sum: toNumber(d.sum),
      ratio: toNumber(d.ratio),
      treasury: treasury,
      mine: mine,
      lastScan: lastScan,
      deltaSum: deltaSum,
    };
    const ordered:any = {};
    for (const k of ck) ordered[k] = map[k];
    rows.push(ordered);
  }

  // Meta + Write
  const pageId = `${scope.group}_${scope.serverKey}_${scope.sort}_${range}_p1`;
  const metaOut = {
    group: scope.group,
    serverKey: scope.serverKey,
    sort: scope.sort,
    timeRange: range,
    page: 1,
    pageSize,
    totalRows,
    totalPages,
    updatedAtRaw: Date.now(),
    updatedAt: new Date().toISOString(),
  };

  await db.collection(PLAYERS_PAGES_COL).doc(pageId).set({ meta: metaOut, rows }, { merge: true });
}

// ---------- Build Guilds Page ----------
async function buildGuildsPage(dateKey:number, range:string, scope:Scope, meta:Meta) {
  if (scope.sort!=="sumAvg") return;

  const todayIdx = await loadGuildsIndex(dateKey, scope.scopeId);
  if (!todayIdx) return;

  const pageSize = typeof meta.defaults?.pageSize==="string" ? toNumber(meta.defaults.pageSize) : (meta.defaults?.pageSize||100);
  const totalRows = todayIdx.n || todayIdx.ids.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const currentIds: string[] = todayIdx.ids || [];
  const pageIds = currentIds.slice(0, pageSize);

  // Baseline
  let baselineVals = new Map<string, number>();
  let baselineRanks = new Map<string, number>();
  if (range!=="all") {
    const days = toNumber(range.replace("d",""));
    const baseKey = shiftDaysYYYYMMDD(dateKey, -days);
    const baseIdx = await loadGuildsIndex(baseKey, scope.scopeId);
    if (baseIdx) {
      (baseIdx.ids||[]).forEach((id:string, i:number)=>{
        baselineVals.set(id, toNumber(baseIdx.vals?.[i] ?? 0));
        baselineRanks.set(id, toNumber(baseIdx.ranks?.[i] ?? (i+1)));
      });
    }
  }

  const currRank = new Map<string, number>();
  (todayIdx.ids||[]).forEach((id:string,i:number)=>currRank.set(id, i+1));

  const rows:any[] = [];
  for (const gid of pageIds) {
    // Guild latest
    let gLatest: any = null;
    try {
      const lSnap = await db.doc(`${GUILDS_COL}/${gid}/latest/${LATEST_DOC_ID}`).get();
      if (lSnap.exists) gLatest = lSnap.data();
    } catch {}

    // sumAvg & memberCount from cache (strict timestamp)
    let sumAvg = 0, mainAvg:number|null=null, conAvg:number|null=null, levelAvg:number|null=null, memberCountUsed=0;
    if (gLatest) {
      const ts = toNumber(gLatest.timestamp);
      const cacheId = `${gid}__${ts}`;
      const cSnap = await db.collection(GUILD_AVG_CACHE_COL).doc(cacheId).get();
      if (cSnap.exists) {
        const c = cSnap.data() as any;
        sumAvg = toNumber(c.sumAvg);
        mainAvg = c.mainAvg!=null ? toNumber(c.mainAvg) : null;
        conAvg  = c.conAvg!=null ? toNumber(c.conAvg) : null;
        levelAvg= c.levelAvg!=null ? toNumber(c.levelAvg): null;
        memberCountUsed = toNumber(c.memberCountUsed);
      }
    }

    // Stat Felder aus latest.values
    const v = gLatest?.values || {};
    const honor = toNumber(v["Guild Honor"] ?? v["Honor"] ?? 0);
    const hof   = toNumber(gLatest?.hofRank ?? v["Guild GT Rank"] ?? v["Guild Rank"] ?? 0);
    const raids = toNumber(v["Guild Raids"] ?? v["Guild Raids:"] ?? v["Guild Raids"] ?? gLatest?.raids ?? 0);
    const portal= toNumber(v["Guild Portal Percent"] ?? v["Guild Portal"] ?? v["Portal"] ?? 0);
    const hydra = toNumber(v["Guild Hydra"] ?? v["Hydra"] ?? 0);
    const petLevel = toNumber(v["Guild Pet Level"] ?? v["Pet Level"] ?? 0);

    // Deltas
    let deltaSumAvg:number = 0;
    let deltaRank:any = "-";
    if (range!=="all") {
      const prevVal = baselineVals.get(gid);
      const prevRank = baselineRanks.get(gid);
      deltaSumAvg = prevVal!=null ? (sumAvg - toNumber(prevVal)) : 0;
      const nowR = currRank.get(gid) || 0;
      deltaRank = (prevRank!=null && nowR>0) ? (prevRank - nowR) : 0;
    }

    const ck = meta.columnKeysGuilds || ["flag","deltaRank","rank","server","name","honor","hof","levelAvg","raids","portal","hydra","petLevel","mainAvg","conAvg","sumAvg","deltaSumAvg"];
    const map:any = {
      flag: "",
      deltaRank,
      rank: currRank.get(gid) || 0,
      server: gLatest?.server || "",
      name: gLatest?.name || "",
      honor,
      hof,
      levelAvg,
      raids,
      portal,
      hydra,
      petLevel,
      mainAvg,
      conAvg,
      sumAvg,
      deltaSumAvg,
    };
    const ordered:any = {};
    for (const k of ck) ordered[k] = map[k];
    rows.push(ordered);
  }

  const pageId = `${scope.group}_${scope.serverKey}_${scope.sort}_${range}_p1`;
  const metaOut = {
    group: scope.group,
    serverKey: scope.serverKey,
    sort: scope.sort,
    timeRange: range,
    page: 1,
    pageSize,
    totalRows,
    totalPages,
    updatedAtRaw: Date.now(),
    updatedAt: new Date().toISOString(),
  };
  await db.collection(GUILDS_PAGES_COL).doc(pageId).set({ meta: metaOut, rows }, { merge: true });
}

// ---------- Main ----------
const args = new Map<string,string>();
for (let i=2;i<process.argv.length;i++){
  const a=process.argv[i];
  if (a.startsWith("--")){
    const k=a.slice(2);
    const v=process.argv[i+1] && !process.argv[i+1].startsWith("--") ? process.argv[i+1] : "true";
    args.set(k,v);
    if (v!=="true") i++;
  }
}
const dateArg = args.get("date");

(async ()=>{
  const meta = await loadMeta();
  const { groupScopes, serverScopes } = expandScopes(meta);
  const scopes: Scope[] = [...groupScopes, ...serverScopes];

  const d = dateArg ? Number(dateArg) : toYYYYMMDDLocal(new Date());

  // Players
  for (const s of scopes) {
    if (s.sort!=="sum") continue;
    for (const r of SUPPORTED_RANGES) {
      await buildPlayersPage(d, r, s, meta);
      await new Promise(res=>setTimeout(res, 5));
    }
  }
  // Guilds
  for (const s of scopes) {
    if (s.sort!=="sumAvg") continue;
    for (const r of SUPPORTED_RANGES) {
      await buildGuildsPage(d, r, s, meta);
      await new Promise(res=>setTimeout(res, 5));
    }
  }

  // Meta timestamps
  await db.doc(META_DOC_PATH).set({
    lastComputedAt: Date.now(),
    nextUpdateAt: 0
  }, { merge: true });

  console.log("Build pages: DONE for", d);
  process.exit(0);
})().catch(err=>{
  console.error(err);
  process.exit(1);
});
