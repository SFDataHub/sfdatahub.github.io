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

// CSV/ISO/ms → Sekunden (nur für Vergleich; wir schreiben nichts Neues)
function toSecFlexible(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  if (/^\d{10}$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]), MM = Number(m[2]) - 1, yyyy = Number(m[3]);
    const hh = Number(m[4]), mm = Number(m[5]), ss = m[6] ? Number(m[6]) : 0;
    const d = new Date(yyyy, MM, dd, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) return Math.floor(t / 1000);
  return null;
}

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

    // Prepare data (unverändert)
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

      // *** EINZIGE ERGÄNZUNG ggü. deiner alten Datei: robustes prevTs ***
      // 1) bevorzugt d.values.Timestamp (CSV-String im latest)
      // 2) sonst d.ts (Sekunden)
      // 3) sonst d.timestamp (Sek./ms/String)
      let prevTs = 0;
      if (latestSnap.exists()) {
        const d: any = latestSnap.data();

        if (d?.values?.Timestamp != null) {
          const s = toSecFlexible(d.values.Timestamp);
          prevTs = s != null ? s : 0;
        } else if (typeof d?.ts === "number") {
          prevTs = d.ts;
        } else if (d?.timestamp != null) {
          const v = d.timestamp;
          if (typeof v === "number") {
            prevTs = v > 9_999_999_999 ? Math.floor(v / 1000) : v;
          } else if (typeof v === "string") {
            const p = Date.parse(v);
            prevTs = Number.isFinite(p) ? Math.floor(p / 1000) : 0;
          }
        }
      }

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
