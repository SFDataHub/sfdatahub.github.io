// tools/update-player-derived.mts
// Run: npx tsx tools/update-player-derived.mts
// Auth: gcloud auth application-default login

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp, BulkWriter } from "firebase-admin/firestore";
import {
  toNumber,
  normalizeServer,
  MAIN_BY_CLASS,
  pick,
  computeBaseStats,
  deriveForPlayer,
} from "./playerDerivedHelpers.mts";

// ---------- Config ----------
const META_DOC_PATH = "stats_public/toplists_meta_v1";
const PLAYER_CACHE_COL = "stats_cache_player_derived";
const PLAYERS_COL = "players";
const LATEST_DOC_ID = "latest";

const scopeChangeCounts: Record<string, number> = {};

// ---------- Init ----------
try {
  initializeApp({ credential: applicationDefault() });
} catch {}
const db = getFirestore();

// ---------- Utils ----------

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
    const derived = deriveForPlayer(latest, () => FieldValue.serverTimestamp());
    // Fallback-ID, falls playerId im Doc fehlt: players/{pid}
    const fallbackId =
      derived.playerId ||
      snap.ref.parent.parent?.parent?.id || // players/{pid}/latest/latest
      snap.ref.parent.parent?.id ||
      snap.id;

    const destRef = db.collection(PLAYER_CACHE_COL).doc(String(fallbackId));
    writer.set(destRef, derived, { merge: true });
    processed++;

    const group = derived.group || "ALL";
    const serverKey = derived.serverKey || "all";
    const scopes: string[] = [];
    scopes.push("ALL_all_sum");
    scopes.push(`${group}_all_sum`);
    if (serverKey !== "all") scopes.push(`${group}_${serverKey}_sum`);

    for (const scopeId of scopes) {
      scopeChangeCounts[scopeId] = (scopeChangeCounts[scopeId] || 0) + 1;
    }
  };

  const stream = await cg.stream();
  for await (const doc of stream) {
    await handleDoc(doc as FirebaseFirestore.QueryDocumentSnapshot);
  }

  await writer.close();

  // lastComputedAt aktualisieren
  const nowMs = Date.now();
  const updates: any = {
    lastComputedAt: nowMs,
    nextUpdateAt: 0,
  };
  for (const [scopeId, count] of Object.entries(scopeChangeCounts)) {
    updates[`scopeChange.${scopeId}.lastChangeAtMs`] = nowMs;
    updates[`scopeChange.${scopeId}.changedSinceLastRebuild`] = FieldValue.increment(count);
  }
  await metaRef.set(updates, { merge: true });

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
