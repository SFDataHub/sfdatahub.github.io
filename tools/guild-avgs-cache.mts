// tools/guild-avgs-cache.mts
// ESM + TypeScript (.mts). Ausführen z. B. mit:
//  npx tsx tools/guild-avgs-cache.mts --guild s3_eu_g1 --ts 1759128540
// Oder Batch:
//  npx tsx tools/guild-avgs-cache.mts --sinceHours 4
//
// Auth: Application Default Credentials (gcloud auth application-default login)

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

// ---- Config / Paths ---------------------------------------------------------
// FIX: flache Top-Level-Collections (keine Slashes im Namen!)
const PLAYER_DERIVED_COL = "stats_cache_player_derived";
const GUILD_CACHE_COL = "stats_cache_guild_avgs";
const GUILDS_COL = "guilds";
const LATEST_DOC_ID = "latest";

// ---- Bootstrap --------------------------------------------------------------
try {
  initializeApp({ credential: applicationDefault() });
} catch { /* ignore re-init in watch mode */ }
const db = getFirestore();

// ---- Util -------------------------------------------------------------------
const toNumber = (v: any): number => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s || s === "-" || s.toLowerCase() === "nan") return 0;
  s = s.replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

type GuildAvgDoc = {
  guildId: string;
  timestamp: number;
  memberCountUsed: number;
  levelAvg: number | null;
  mainAvg: number | null;
  conAvg: number | null;
  sumAvg: number | null;
  computedAt: FirebaseFirestore.FieldValue;
};

// ---- Core: ensure cache for one (guildId, timestamp) ------------------------
export async function ensureGuildAvgCache(guildId: string, timestampNum: number) {
  if (!guildId) throw new Error("guildId required");
  if (!Number.isFinite(timestampNum)) throw new Error("timestamp (number) required");

  const cacheId = `${guildId}__${timestampNum}`;
  const cacheRef = db.collection(GUILD_CACHE_COL).doc(cacheId);
  const cacheSnap = await cacheRef.get();
  if (cacheSnap.exists) {
    return { existed: true, ref: cacheRef, data: cacheSnap.data() };
  }

  // Spieler lesen: strict timestamp match + GuildId
  const q = db.collection(PLAYER_DERIVED_COL)
    .where("guildId", "==", guildId)
    .where("timestamp", "==", timestampNum);

  const shots = await q.get();

  let memberCountUsed = 0;
  let levelSum = 0, mainSum = 0, conSum = 0, sumSum = 0;

  shots.forEach(doc => {
    const d = doc.data() as any;
    memberCountUsed++;
    levelSum += toNumber(d.level);
    mainSum  += toNumber(d.main);
    conSum   += toNumber(d.con);
    sumSum   += toNumber(d.sum);
  });

  const denom = memberCountUsed > 0 ? memberCountUsed : 1;
  const payload: GuildAvgDoc = {
    guildId,
    timestamp: timestampNum,
    memberCountUsed,
    levelAvg: memberCountUsed ? +(levelSum / denom).toFixed(2) : null,
    mainAvg:  memberCountUsed ? +(mainSum  / denom).toFixed(2) : null,
    conAvg:   memberCountUsed ? +(conSum   / denom).toFixed(2) : null,
    sumAvg:   memberCountUsed ? +(sumSum   / denom).toFixed(2) : null,
    computedAt: FieldValue.serverTimestamp(),
  };

  await cacheRef.set(payload, { merge: true });
  return { existed: false, ref: cacheRef, data: payload };
}

// ---- Batch mode: ensure for guilds updated recently -------------------------
async function ensureForGuildsUpdatedSince(hours: number) {
  const since = Timestamp.fromMillis(Date.now() - hours * 3600 * 1000);
  // Hole alle guilds/*/latest/latest mit updatedAt >= since
  const cg = db.collectionGroup(LATEST_DOC_ID)
    .where("updatedAt", ">=", since);

  let ensured = 0, skipped = 0;
  const stream = await cg.stream();
  for await (const snap of stream) {
    const path = snap.ref.path; // guilds/{gid}/latest/latest
    if (!path.startsWith(`${GUILDS_COL}/`) || !path.endsWith(`/latest/${LATEST_DOC_ID}`)) continue;

    const latest = snap.data() || {};
    const guildId = String(latest.guildIdentifier || latest.guildId || snap.ref.parent.parent?.parent?.id || "");
    const ts = toNumber(latest.timestamp);
    if (!guildId || !Number.isFinite(ts)) { skipped++; continue; }

    const res = await ensureGuildAvgCache(guildId, ts);
    if (!res.existed) ensured++;
  }
  console.log(`guild-avgs-cache: ensured=${ensured}, skipped=${skipped}`);
}

// ---- CLI --------------------------------------------------------------------
const args = new Map<string, string>();
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith("--")) {
    const k = a.replace(/^--/, "");
    const v = arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true";
    args.set(k, v);
  }
});

const guildArg = args.get("guild") || args.get("g");
const tsArg = args.get("ts") || args.get("timestamp");
const sinceHoursArg = args.get("sinceHours");

(async () => {
  if (sinceHoursArg) {
    await ensureForGuildsUpdatedSince(Number(sinceHoursArg));
    process.exit(0);
  }

  if (!guildArg || !tsArg) {
    console.error("Usage:");
    console.error("  npx tsx tools/guild-avgs-cache.mts --guild <guildId> --ts <timestampNumber>");
    console.error("  npx tsx tools/guild-avgs-cache.mts --sinceHours 4");
    process.exit(2);
  }

  const res = await ensureGuildAvgCache(String(guildArg), Number(tsArg));
  console.log(
    res.existed
      ? `Cache already exists for ${guildArg} @ ${tsArg}`
      : `Cache created for ${guildArg} @ ${tsArg}`
  );
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
