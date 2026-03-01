import type { Request, Response } from "express";
import { Router } from "express";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import { db } from "../firebase";

const playerChartsRouter = Router();

const REQUIRED_SCHEMA = 2;
const REQUIRED_VALUE_KEYS = [
  "con",
  "conTotal",
  "main",
  "mainTotal",
  "mine",
  "sum",
  "sumTotal",
  "totalStats",
  "treasury",
  "xpTotal",
  "xpProgress",
] as const;
const SCAN_TS_FIELD = "timestamp";
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const CHART_VALUE_KEYS = [
  "level",
  "totalStats",
  "honor",
  "scrapbook",
  "con",
  "conTotal",
  "main",
  "mainTotal",
  "mine",
  "sum",
  "sumTotal",
  "treasury",
  "xpProgress",
  "xpTotal",
] as const;
type ChartValueKey = (typeof CHART_VALUE_KEYS)[number];

const CHART_VALUE_ALIASES: Record<ChartValueKey, readonly string[]> = {
  level: ["level", "Level"],
  totalStats: [],
  honor: ["honor", "Honor", "Fortress Honor"],
  scrapbook: [
    "scrapbookPct",
    "scrapbook",
    "Scrapbook %",
    "Scrapbook",
    "Album",
    "Album %",
    "AlbumPct",
    "AlbumPercent",
    "AlbumPercentage",
    "AlbumCompletion",
    "AlbumProgress",
  ],
  con: ["con", "Con", "Base Constitution"],
  conTotal: ["conTotal", "Con Total", "Constitution"],
  main: ["main", "Main", "Base"],
  mainTotal: ["mainTotal", "Main Total", "Attribute"],
  mine: ["mine", "Gem Mine"],
  sum: [],
  sumTotal: [],
  treasury: ["treasury", "Treasury"],
  xpProgress: ["xpProgress", "XP Progress", "XP"],
  xpTotal: ["xpTotal", "XP Total"],
};

type SnapshotMonthEntry = {
  tsSec: number;
  scanDocId: string;
  kind: "monthly" | "week1";
  scanAtSec?: number;
  scanAtRaw?: string;
  values: Record<string, unknown>;
};

type MonthlyChartsSnapshotDoc = {
  schemaVersion?: number;
  months?: Record<string, unknown>;
  updatedAt?: unknown;
  builtThrough?: string | null;
  maxMonthKey?: string | null;
};

type MonthlyQueryStrategyState = {
  structuredDisabled: boolean;
  rangeDisabled: boolean;
};

const toNum = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const sign = raw.startsWith("-") ? -1 : 1;
  const unsigned = raw.replace(/^[+-]/, "").replace(/[\s%]/g, "");
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const decimalPos = Math.max(lastComma, lastDot);
  let normalized = "";

  if (decimalPos > -1) {
    const fractional = unsigned.slice(decimalPos + 1).replace(/[^0-9]/g, "");
    const integer = unsigned.slice(0, decimalPos).replace(/[^0-9]/g, "");
    if (fractional.length > 0 && fractional.length <= 2) {
      normalized = `${integer}.${fractional}`;
    } else {
      normalized = `${integer}${fractional}`.replace(/[^0-9]/g, "");
    }
  } else {
    normalized = unsigned.replace(/[^0-9]/g, "");
  }

  if (!normalized) return null;
  const parsed = Number(normalized) * sign;
  return Number.isFinite(parsed) ? parsed : null;
};

const asObjectRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const canonicalizeKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const buildCanonicalLookup = (record: Record<string, unknown> | null): Map<string, unknown> => {
  const out = new Map<string, unknown>();
  if (!record) return out;
  Object.entries(record).forEach(([key, value]) => {
    out.set(canonicalizeKey(key), value);
  });
  return out;
};

const readScanValueByAliases = (
  aliases: readonly string[],
  scanRow: Record<string, unknown>,
  scanRowCanonical: Map<string, unknown>,
  scanValues: Record<string, unknown> | null,
  scanValuesCanonical: Map<string, unknown>,
): unknown => {
  for (const alias of aliases) {
    if (hasOwn(scanRow, alias)) return scanRow[alias];
    if (scanValues && hasOwn(scanValues, alias)) return scanValues[alias];
  }

  for (const alias of aliases) {
    const canonical = canonicalizeKey(alias);
    if (scanRowCanonical.has(canonical)) return scanRowCanonical.get(canonical);
    if (scanValuesCanonical.has(canonical)) return scanValuesCanonical.get(canonical);
  }

  return undefined;
};

const buildMonthValuesFromScan = (scanData: FirebaseFirestore.DocumentData): Record<string, unknown> => {
  const scanRow = asObjectRecord(scanData) ?? {};
  const scanValues = asObjectRecord(scanRow.values);
  const scanRowCanonical = buildCanonicalLookup(scanRow);
  const scanValuesCanonical = buildCanonicalLookup(scanValues);
  const values: Record<string, unknown> = {};

  CHART_VALUE_KEYS.forEach((snapshotKey) => {
    const aliases = CHART_VALUE_ALIASES[snapshotKey];
    const rawValue = readScanValueByAliases(aliases, scanRow, scanRowCanonical, scanValues, scanValuesCanonical);
    if (rawValue === undefined) return;
    if (snapshotKey === "scrapbook") {
      const scrapbookValue = toNum(rawValue);
      if (scrapbookValue != null) values[snapshotKey] = scrapbookValue;
      return;
    }
    values[snapshotKey] = rawValue;
  });

  const main = toNum(values.main);
  const con = toNum(values.con);
  if (main != null && con != null) {
    values.sum = main + con;
  }

  const mainTotal = toNum(values.mainTotal);
  const conTotal = toNum(values.conTotal);
  if (mainTotal != null && conTotal != null) {
    const sumTotal = mainTotal + conTotal;
    values.sumTotal = sumTotal;
    values.totalStats = sumTotal;
  }

  return values;
};

const isMonthKey = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}$/.test(value);

const parseMonthKey = (monthKey: string): { year: number; monthIndex: number } | null => {
  if (!isMonthKey(monthKey)) return null;
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
};

const monthKeyFromUtcSec = (tsSec: number): string => {
  const date = new Date(tsSec * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const monthStartUtcSec = (monthKey: string): number | null => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  return Math.floor(Date.UTC(parsed.year, parsed.monthIndex, 1, 0, 0, 0, 0) / 1000);
};

const nextMonthKey = (monthKey: string): string | null => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  const next = new Date(Date.UTC(parsed.year, parsed.monthIndex + 1, 1, 0, 0, 0, 0));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
};

const currentUtcMonthKey = (): string => monthKeyFromUtcSec(Math.floor(Date.now() / 1000));

const resolveScanTimestampSec = (scanData: FirebaseFirestore.DocumentData, docId: string): number | null => {
  const direct =
    toNum(scanData?.[SCAN_TS_FIELD]) ??
    toNum(scanData?.timestampSec) ??
    toNum(scanData?.tsSec) ??
    toNum(scanData?.createdAtSec);
  if (direct != null) return direct;
  const fromDocId = toNum(docId);
  return fromDocId != null ? Math.floor(fromDocId) : null;
};

const resolveScanAtSec = (scanData: FirebaseFirestore.DocumentData): number | null => {
  const value =
    toNum(scanData?.[SCAN_TS_FIELD]) ??
    toNum(scanData?.timestampSec) ??
    toNum(scanData?.tsSec) ??
    toNum(scanData?.latestScanAtSec);
  return value != null ? Math.floor(value) : null;
};

const resolveScanAtRaw = (scanData: FirebaseFirestore.DocumentData): string | null => {
  const scanValues = asObjectRecord(scanData?.values);
  const raw =
    scanData?.timestampRaw ??
    scanData?.lastScan ??
    scanValues?.timestampRaw ??
    scanValues?.lastScan;
  if (raw == null) return null;
  const text = String(raw).trim();
  return text.length > 0 ? text : null;
};

const coerceSnapshotMonthEntry = (value: unknown): SnapshotMonthEntry | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const tsSec = toNum(row.tsSec);
  const scanDocId = typeof row.scanDocId === "string" ? row.scanDocId.trim() : "";
  const kind = row.kind === "monthly" ? "monthly" : row.kind === "week1" ? "week1" : null;
  if (tsSec == null || !scanDocId || !kind) return null;
  const values = asObjectRecord(row.values) ? { ...(row.values as Record<string, unknown>) } : {};
  CHART_VALUE_KEYS.forEach((key) => {
    if (!hasOwn(values, key) && hasOwn(row, key)) {
      values[key] = row[key];
    }
  });
  return {
    tsSec: Math.floor(tsSec),
    scanDocId,
    kind,
    scanAtSec: toNum(row.scanAtSec) ?? undefined,
    scanAtRaw: typeof row.scanAtRaw === "string" && row.scanAtRaw.trim() ? row.scanAtRaw.trim() : undefined,
    values,
  };
};

const readSnapshotMonths = (data: MonthlyChartsSnapshotDoc | undefined): Record<string, SnapshotMonthEntry> => {
  const raw = data?.months;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, SnapshotMonthEntry> = {};
  for (const [monthKey, entry] of Object.entries(raw)) {
    if (!isMonthKey(monthKey)) continue;
    const parsed = coerceSnapshotMonthEntry(entry);
    if (parsed) out[monthKey] = parsed;
  }
  return out;
};

const getMaxMonthKey = (months: Record<string, SnapshotMonthEntry>): string | null => {
  const keys = Object.keys(months).filter(isMonthKey).sort();
  return keys.length ? keys[keys.length - 1] : null;
};

const isIndexOrQuerySupportError = (error: unknown): boolean => {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  return code === "failed-precondition" || code === "invalid-argument" || msg.includes("index");
};

const findMonthlyScan = async (
  scansCol: FirebaseFirestore.CollectionReference,
  monthKey: string,
  monthStartSec: number,
  monthEndSec: number,
  strategyState: MonthlyQueryStrategyState,
): Promise<QueryDocumentSnapshot | null> => {
  if (!strategyState.structuredDisabled) {
    try {
      const structuredSnap = await scansCol
        .where("monthlyKey", "==", monthKey)
        .where("scanKind", "==", "monthly")
        .orderBy(SCAN_TS_FIELD, "desc")
        .limit(1)
        .get();
      if (!structuredSnap.empty) return structuredSnap.docs[0] ?? null;
    } catch (error) {
      if (isIndexOrQuerySupportError(error)) {
        strategyState.structuredDisabled = true;
        console.warn("[playerCharts] monthlyKey query unavailable, falling back", { monthKey, error });
      } else {
        throw error;
      }
    }
  }

  if (!strategyState.rangeDisabled) {
    try {
      const rangeSnap = await scansCol
        .where("scanKind", "==", "monthly")
        .where(SCAN_TS_FIELD, ">=", monthStartSec)
        .where(SCAN_TS_FIELD, "<", monthEndSec)
        .orderBy(SCAN_TS_FIELD, "desc")
        .limit(1)
        .get();
      if (!rangeSnap.empty) return rangeSnap.docs[0] ?? null;
    } catch (error) {
      if (isIndexOrQuerySupportError(error)) {
        strategyState.rangeDisabled = true;
        console.warn("[playerCharts] monthly range query unavailable, falling back", { monthKey, error });
      } else {
        throw error;
      }
    }
  }

  return null;
};

const findWeek1Scan = async (
  scansCol: FirebaseFirestore.CollectionReference,
  monthStartSec: number,
  monthEndSec: number,
): Promise<QueryDocumentSnapshot | null> => {
  const week1EndSec = Math.min(monthEndSec, monthStartSec + WEEK_SECONDS);
  const snap = await scansCol
    .where(SCAN_TS_FIELD, ">=", monthStartSec)
    .where(SCAN_TS_FIELD, "<", week1EndSec)
    .orderBy(SCAN_TS_FIELD, "desc")
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0] ?? null);
};

const buildMonthEntryFromScan = (
  monthKey: string,
  kind: "monthly" | "week1",
  scanSnap: QueryDocumentSnapshot,
): SnapshotMonthEntry | null => {
  const data = scanSnap.data();
  const tsSec = resolveScanTimestampSec(data, scanSnap.id);
  if (tsSec == null) return null;
  const derivedMonthKey = monthKeyFromUtcSec(tsSec);
  if (derivedMonthKey !== monthKey) return null;
  const scanAtSec = resolveScanAtSec(data);
  const scanAtRaw = resolveScanAtRaw(data);
  return {
    tsSec,
    scanDocId: scanSnap.id,
    kind,
    ...(scanAtSec != null ? { scanAtSec } : {}),
    ...(scanAtRaw ? { scanAtRaw } : {}),
    values: buildMonthValuesFromScan(data),
  };
};

const shouldReplaceMonthEntry = (current: SnapshotMonthEntry | undefined, next: SnapshotMonthEntry): boolean => {
  if (!current) return true;
  if (current.kind === "week1" && next.kind === "monthly") return true;
  if (current.kind !== next.kind) return false;
  if (next.tsSec !== current.tsSec) return next.tsSec > current.tsSec;
  return next.scanDocId !== current.scanDocId;
};

const listMonthKeysInclusive = (startMonthKey: string, endMonthKey: string): string[] => {
  if (!isMonthKey(startMonthKey) || !isMonthKey(endMonthKey) || startMonthKey > endMonthKey) return [];
  const result: string[] = [];
  let cursor: string | null = startMonthKey;
  let guard = 0;
  while (cursor && cursor <= endMonthKey && guard < 1200) {
    result.push(cursor);
    if (cursor === endMonthKey) break;
    cursor = nextMonthKey(cursor);
    guard += 1;
  }
  return result;
};

const normalizeIdentifier = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

playerChartsRouter.post("/:identifier/charts/monthly_v1/build", async (req: Request, res: Response) => {
  const identifier = normalizeIdentifier(req.params.identifier);
  if (!identifier) {
    return res.status(400).json({ error: "identifier is required" });
  }

  const nowMonthKey = currentUtcMonthKey();
  const playerRef = db.collection("players").doc(identifier);
  const chartsDocRef = playerRef.collection("charts").doc("monthly_v1");
  const scansCol = playerRef.collection("scans");

  try {
    const [snapshotSnap, earliestScanSnap] = await Promise.all([
      chartsDocRef.get(),
      scansCol.orderBy(SCAN_TS_FIELD, "asc").limit(1).get(),
    ]);

    const snapshotData = snapshotSnap.exists ? (snapshotSnap.data() as MonthlyChartsSnapshotDoc) : undefined;
    const months = readSnapshotMonths(snapshotData);
    const rawMonths =
      snapshotData?.months && typeof snapshotData.months === "object" && !Array.isArray(snapshotData.months)
        ? (snapshotData.months as Record<string, unknown>)
        : null;
    const rawSnapshotMonthKeys = rawMonths ? Object.keys(rawMonths).filter(isMonthKey).sort() : [];
    const snapshotSchemaVersion =
      typeof snapshotData?.schemaVersion === "number" ? snapshotData.schemaVersion : 0;
    const latestRawMonthKey = rawSnapshotMonthKeys.length
      ? rawSnapshotMonthKeys[rawSnapshotMonthKeys.length - 1]
      : null;
    const latestRawMonth =
      latestRawMonthKey && rawMonths && typeof rawMonths[latestRawMonthKey] === "object" && rawMonths[latestRawMonthKey]
        ? (rawMonths[latestRawMonthKey] as Record<string, unknown>)
        : null;
    const latestRawValues =
      latestRawMonth?.values && typeof latestRawMonth.values === "object" && !Array.isArray(latestRawMonth.values)
        ? (latestRawMonth.values as Record<string, unknown>)
        : null;
    const latestHasMissingRequiredValues =
      !!latestRawMonthKey &&
      REQUIRED_VALUE_KEYS.some((key) => !latestRawValues || !hasOwn(latestRawValues, key));
    const latestHasScanTime =
      !!latestRawMonth &&
      (toNum(latestRawMonth.scanAtSec) != null ||
        (typeof latestRawMonth.scanAtRaw === "string" && latestRawMonth.scanAtRaw.trim().length > 0));
    const latestHasMissingScanTime = !!latestRawMonthKey && !latestHasScanTime;
    const needsUpgrade = snapshotSchemaVersion < REQUIRED_SCHEMA || latestHasMissingRequiredValues || latestHasMissingScanTime;
    const upgradeMonthKeys = needsUpgrade ? rawSnapshotMonthKeys : [];
    const upgradeMonthKeySet = new Set(upgradeMonthKeys);
    const builtThrough =
      snapshotData?.builtThrough && isMonthKey(snapshotData.builtThrough) ? snapshotData.builtThrough : null;
    const maxMonthKey = getMaxMonthKey(months);

    let startMonthKey: string | null = null;
    if (builtThrough && builtThrough < nowMonthKey) {
      startMonthKey = nextMonthKey(builtThrough);
    } else if (!snapshotSnap.exists && !earliestScanSnap.empty) {
      const earliestDoc = earliestScanSnap.docs[0];
      const earliestTs = resolveScanTimestampSec(earliestDoc.data(), earliestDoc.id);
      if (earliestTs != null) startMonthKey = monthKeyFromUtcSec(earliestTs);
    } else if (!builtThrough && maxMonthKey && maxMonthKey <= nowMonthKey) {
      startMonthKey = maxMonthKey;
    }

    const monthsToProcess = new Set<string>();
    if (startMonthKey) {
      listMonthKeysInclusive(startMonthKey, nowMonthKey).forEach((monthKey) => monthsToProcess.add(monthKey));
    }
    monthsToProcess.add(nowMonthKey);
    upgradeMonthKeys.forEach((monthKey) => monthsToProcess.add(monthKey));
    Object.entries(months).forEach(([monthKey, entry]) => {
      if (entry.kind === "week1") monthsToProcess.add(monthKey);
    });

    const strategyState: MonthlyQueryStrategyState = {
      structuredDisabled: false,
      rangeDisabled: false,
    };

    let updatedMonths = 0;
    let processedMonths = 0;

    const monthKeys = Array.from(monthsToProcess).filter(isMonthKey).sort();
    for (const monthKey of monthKeys) {
      const monthStartSec = monthStartUtcSec(monthKey);
      const nextMonth = nextMonthKey(monthKey);
      const monthEndSec = nextMonth ? monthStartUtcSec(nextMonth) : null;
      if (monthStartSec == null || monthEndSec == null) continue;

      processedMonths += 1;
      const monthlyScan = await findMonthlyScan(scansCol, monthKey, monthStartSec, monthEndSec, strategyState);
      const weeklyScan = monthlyScan ? null : await findWeek1Scan(scansCol, monthStartSec, monthEndSec);
      const candidate =
        (monthlyScan && buildMonthEntryFromScan(monthKey, "monthly", monthlyScan)) ||
        (weeklyScan && buildMonthEntryFromScan(monthKey, "week1", weeklyScan)) ||
        null;

      if (!candidate) continue;
      if (upgradeMonthKeySet.has(monthKey)) {
        months[monthKey] = candidate;
        updatedMonths += 1;
        continue;
      }
      if (shouldReplaceMonthEntry(months[monthKey], candidate)) {
        months[monthKey] = candidate;
        updatedMonths += 1;
      }
    }

    const nextMaxMonthKey = getMaxMonthKey(months);

    await chartsDocRef.set(
      {
        schemaVersion: REQUIRED_SCHEMA,
        months,
        builtThrough: nowMonthKey,
        maxMonthKey: nextMaxMonthKey,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return res.json({
      ok: true,
      identifier,
      processedMonths,
      updatedMonths,
      builtThrough: nowMonthKey,
      maxMonthKey: nextMaxMonthKey,
      monthsCount: Object.keys(months).length,
    });
  } catch (error) {
    console.error("[playerCharts] Failed to build monthly_v1 snapshot", { identifier, error });
    return res.status(500).json({ error: "Failed to build monthly chart snapshot" });
  }
});

export default playerChartsRouter;
