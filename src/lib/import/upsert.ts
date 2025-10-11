// /src/lib/importer/upsert.ts
import {
  collection, doc, getDoc, writeBatch, setDoc, Firestore,
} from "firebase/firestore";
import type {
  CsvRow, ImportReport, Kind, Mapping, MetaAppConfig,
} from "./types";
import { getTimestamp, makeKeyFromTemplate, nowServerTimestamp } from "./db";
import { bestId, headerValue, normalizeServer } from "./preprocess";

const MAX_OPS = 450; // Firestore limit < 500

export async function upsertRows(
  db: Firestore,
  kind: Kind,
  rows: CsvRow[],
  mapping: Mapping,
  meta: MetaAppConfig,
  onProgress?: (p: number) => void,
): Promise<ImportReport> {
  const cols = kind === "players"
    ? { latest: meta.playersLatestCollection, scans: meta.playersScansCollection }
    : { latest: meta.guildsLatestCollection,  scans: meta.guildsScansCollection };

  let writtenLatest = 0;
  let writtenScans  = 0;
  let skippedDuplicate = 0;
  let skippedMissingRequired = 0;
  let errors = 0;

  let batch = writeBatch(db);
  let ops = 0;
  let processed = 0;

  const normCfg = meta.csvMapping.serverNormalize;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for (const row of rows) {
    processed++;

    // Basics
    const svRaw = headerValue(row, mapping.serverHeader);
    const sv = normalizeServer(svRaw, normCfg);
    const ts = getTimestamp(row, mapping.timestampHeader);
    if (!sv || !ts) {
      skippedMissingRequired++;
      continue;
    }
    const pidOrIdentifier = bestId(mapping, row);
    if (!pidOrIdentifier) {
      skippedMissingRequired++;
      continue;
    }

    // Build doc keys
    const baseKey = makeKeyFromTemplate(mapping.keyTemplate || "{sv}#{pidOrIdentifier}#{ts}", {
      sv, pidOrIdentifier, ts,
    });
    const latestKey = makeKeyFromTemplate("{sv}#{pidOrIdentifier}", { sv, pidOrIdentifier });
    const scansRef  = doc(collection(db, cols.scans),  baseKey);
    const latestRef = doc(collection(db, cols.latest), latestKey);

    // Prepare data
    const common = {
      sv,
      ts,
      id: pidOrIdentifier,
      name: headerValue(row, mapping.nameHeader),
      ...nowServerTimestamp(meta),
      src: "csv",
    };

    // upsert into scans (all rows)
    batch.set(scansRef, { ...row, ...common }, { merge: true });
    ops++; writtenScans++;

    // upsert into latest: only if ts is newer
    try {
      const latestSnap = await getDoc(latestRef);
      const prevTs = latestSnap.exists() ? Number(latestSnap.get("ts") || 0) : 0;
      if (ts > prevTs) {
        batch.set(latestRef, { ...row, ...common }, { merge: true });
        ops++; writtenLatest++;
      } else {
        skippedDuplicate++; // older or equal snapshot
      }
    } catch (e) {
      errors++;
      console.error("latest getDoc error", e);
    }

    if (ops >= MAX_OPS) await flush();
    if (onProgress) onProgress(Math.floor((processed / rows.length) * 100));
  }

  await flush();

  return {
    kind,
    total: rows.length,
    writtenLatest,
    writtenScans,
    skippedDuplicate,
    skippedMissingRequired,
    errors,
  };
}
