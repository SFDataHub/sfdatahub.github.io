// tools/update-player-derived.mts
// Run: npx tsx tools/update-player-derived.mts
// Auth: gcloud auth application-default login

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp, BulkWriter } from "firebase-admin/firestore";

// ---------- Config ----------
const META_DOC_PATH = "stats_public/toplists_meta_v1";
const PLAYER_CACHE_COL = "stats_cache_player_derived";
const PLAYERS_COL = "players";
const LATEST_DOC_ID = "latest";

// ---------- Init ----------
try {
  initializeApp({ credential: applicationDefault() });
} catch {}
const db = getFirestore();

// ---------- Utils ----------
const toNumber = (v: any): number => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s || s === "-" || s.toLowerCase() === "nan") return 0;
  s = s.replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

type ServerNorm = { group: "EU" | "US" | "INT" | "FUSION" | "ALL"; serverKey: string };
const normalizeServer = (raw: any): ServerNorm => {
  if (!raw) return { group: "ALL", serverKey: "all" };
  const s = String(raw).toUpperCase();

  let m = s.match(/S?(\d+)[._-]?EU|S(\d+)\.SFGAME\.EU/);
  if (m) {
    const num = m[1] || m[2];
    return { group: "EU", serverKey: `EU${num}` };
  }
  if (s.includes("AM1") || s.includes("S1.SFGAME.US")) return { group: "US", serverKey: "AM1" };
  if (s.includes("MAERWYNN")) return { group: "INT", serverKey: "MAERWYNN" };
  m = s.match(/F(\d+)/);
  if (m) return { group: "FUSION", serverKey: `F${m[1]}` };
  return { group: "ALL", serverKey: "all" };
};

const MAIN_BY_CLASS: Record<string, "Base Strength" | "Base Dexterity" | "Base Intelligence"> = {
  Warrior: "Base Strength",
  Berserker: "Base Strength",
  Paladin: "Base Strength",
  Scout: "Base Dexterity",
  Assassin: "Base Dexterity",
  "Demon Hunter": "Base Dexterity",
  Bard: "Base Dexterity",
  Mage: "Base Intelligence",
  "Battle Mage": "Base Intelligence",
  Necromancer: "Base Intelligence",
  Druid: "Base Intelligence",
};

const pick = (obj: Record<string, any>, key: string): any =>
  obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;

const computeBaseStats = (values: Record<string, any>) => {
  const bs = {
    str: toNumber(pick(values, "Base Strength")),
    dex: toNumber(pick(values, "Base Dexterity")),
    intl: toNumber(pick(values, "Base Intelligence")),
    con: toNumber(pick(values, "Base Constitution")),
    luck: toNumber(pick(values, "Base Luck")),
  };
  const sum = bs.str + bs.dex + bs.intl + bs.con + bs.luck;
  return { ...bs, sum };
};

const deriveForPlayer = (latest: any) => {
  const {
    playerId,
    name,
    className,
    level: levelRaw,
    server: serverRaw,
    guildIdentifier,
    guildName,
    timestamp, // number (deine Felder)
    updatedAt, // Firestore TS
    values = {},
  } = latest || {};

  const level = toNumber(levelRaw);
  const { group, serverKey } = normalizeServer(serverRaw);
  const base = computeBaseStats(values);

  const mainKey = MAIN_BY_CLASS[String(className)] ?? "Base Intelligence";
  const main = toNumber(pick(values, mainKey));
  const sum = base.sum;
  const con = base.con;
  const ratio = level > 0 ? sum / level : 0;

  return {
    playerId: String(playerId ?? ""),
    name: String(name ?? ""),
    class: String(className ?? ""),
    level,
    group,
    serverKey,
    guildId: guildIdentifier ? String(guildIdentifier) : "",
    guildName: guildName ? String(guildName) : "",
    sum,
    main,
    con,
    ratio,
    timestamp: toNumber(timestamp),
    updatedAtFromLatest: updatedAt ?? FieldValue.serverTimestamp(),
  };
};

// ---------- Main ----------
const run = async () => {
  const metaRef = db.doc(META_DOC_PATH);
  const metaSnap = await metaRef.get();
  if (!metaSnap.exists) throw new Error(`Meta missing at ${META_DOC_PATH}`);
  const meta = metaSnap.data() || {};
  const lastComputedAtMs = toNumber(meta.lastComputedAt || 0);

  // collectionGroup auf players/*/latest/latest mit updatedAt > lastComputedAt
  // erfordert Single-Field-Index (Collection Group "latest", Field "updatedAt", Asc)
  const sinceTs = new Timestamp(Math.floor(lastComputedAtMs / 1000), 0);
  let cg = db.collectionGroup(LATEST_DOC_ID).where("updatedAt", ">", sinceTs);

  const writer: BulkWriter = db.bulkWriter({ throttling: true });
  let processed = 0;

  const handleDoc = async (snap: FirebaseFirestore.QueryDocumentSnapshot) => {
    // sicherstellen, dass es players/*/latest/latest ist
    const path = snap.ref.path;
    if (!path.startsWith(`${PLAYERS_COL}/`) || !path.endsWith(`/latest/${LATEST_DOC_ID}`)) return;

    const latest = snap.data();
    const derived = deriveForPlayer(latest);
    // Fallback-ID, falls playerId im Doc fehlt: players/{pid}
    const fallbackId =
      derived.playerId ||
      snap.ref.parent.parent?.parent?.id || // players/{pid}/latest/latest
      snap.ref.parent.parent?.id ||
      snap.id;

    const destRef = db.collection(PLAYER_CACHE_COL).doc(String(fallbackId));
    writer.set(destRef, derived, { merge: true });
    processed++;
  };

  const stream = await cg.stream();
  for await (const doc of stream) {
    await handleDoc(doc as FirebaseFirestore.QueryDocumentSnapshot);
  }

  await writer.close();

  // lastComputedAt aktualisieren
  await metaRef.set(
    {
      lastComputedAt: Date.now(),
      nextUpdateAt: 0,
    },
    { merge: true }
  );

  console.log(`player_derived updated: ${processed} players.`);
};

run()
  .then(() => {
    console.log("DONE update-player-derived");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
