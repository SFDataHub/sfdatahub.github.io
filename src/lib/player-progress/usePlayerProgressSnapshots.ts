import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import type { TrendSeries } from "../../components/player-profile/types";
import { db } from "../firebase";
import { AUTH_BASE_URL } from "../auth/config";
import { beginReadScope, endReadScope, traceGetDoc, type FirestoreTraceScope } from "../debug/firestoreReadTrace";

const CHART_SNAPSHOT_REQUIRED_SCHEMA = 2;
const CHART_SNAPSHOT_REQUIRED_VALUE_KEYS = [
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
const CHARTS_RANGE_LABEL = "Monthly history";
const CHART_MONTHLY_HISTORY_LABEL_KEY = "playerProfile.chartsTab.labels.monthlyHistory";
const CHART_LATEST_LABEL_KEY = "playerProfile.chartsTab.labels.latest";
const CHART_START_LABEL_KEY = "playerProfile.chartsTab.labels.start";

export type ChartSectionKey =
  | "coreProgress"
  | "attributesBase"
  | "attributesTotals"
  | "economy"
  | "experience";
export type ChartMetricKey =
  | "level"
  | "totalStats"
  | "honor"
  | "main"
  | "con"
  | "sum"
  | "mainTotal"
  | "conTotal"
  | "sumTotal"
  | "mine"
  | "treasury"
  | "xpTotal"
  | "xpProgress";

export type ProgressChartMetricConfigEntry = {
  key: ChartMetricKey;
  sectionKey: ChartSectionKey;
  labelKey: string;
  fallbackLabel: string;
};

const CHART_METRIC_KEYS: readonly ChartMetricKey[] = [
  "level",
  "totalStats",
  "honor",
  "main",
  "con",
  "sum",
  "mainTotal",
  "conTotal",
  "sumTotal",
  "mine",
  "treasury",
  "xpTotal",
  "xpProgress",
] as const;

export const PLAYER_PROGRESS_CHART_METRIC_CONFIG: ProgressChartMetricConfigEntry[] = [
  { key: "level", sectionKey: "coreProgress", labelKey: "playerProfile.chartsTab.metrics.level", fallbackLabel: "Level" },
  {
    key: "totalStats",
    sectionKey: "coreProgress",
    labelKey: "playerProfile.chartsTab.metrics.totalStats",
    fallbackLabel: "Total Stats",
  },
  { key: "honor", sectionKey: "coreProgress", labelKey: "playerProfile.chartsTab.metrics.honor", fallbackLabel: "Honor" },
  { key: "main", sectionKey: "attributesBase", labelKey: "playerProfile.chartsTab.metrics.main", fallbackLabel: "Main" },
  { key: "con", sectionKey: "attributesBase", labelKey: "playerProfile.chartsTab.metrics.con", fallbackLabel: "Constitution" },
  { key: "sum", sectionKey: "attributesBase", labelKey: "playerProfile.chartsTab.metrics.sum", fallbackLabel: "Sum" },
  {
    key: "mainTotal",
    sectionKey: "attributesTotals",
    labelKey: "playerProfile.chartsTab.metrics.mainTotal",
    fallbackLabel: "Main Total",
  },
  {
    key: "conTotal",
    sectionKey: "attributesTotals",
    labelKey: "playerProfile.chartsTab.metrics.conTotal",
    fallbackLabel: "Con Total",
  },
  {
    key: "sumTotal",
    sectionKey: "attributesTotals",
    labelKey: "playerProfile.chartsTab.metrics.sumTotal",
    fallbackLabel: "Sum Total",
  },
  { key: "mine", sectionKey: "economy", labelKey: "playerProfile.chartsTab.metrics.mine", fallbackLabel: "Mine" },
  {
    key: "treasury",
    sectionKey: "economy",
    labelKey: "playerProfile.chartsTab.metrics.treasury",
    fallbackLabel: "Treasury",
  },
  {
    key: "xpTotal",
    sectionKey: "experience",
    labelKey: "playerProfile.chartsTab.metrics.xpTotal",
    fallbackLabel: "XP Total",
  },
  {
    key: "xpProgress",
    sectionKey: "experience",
    labelKey: "playerProfile.chartsTab.metrics.xpProgress",
    fallbackLabel: "XP Progress",
  },
];

export const PLAYER_PROGRESS_CHART_SECTION_ORDER: Array<{
  key: ChartSectionKey;
  titleKey: string;
  fallbackTitle: string;
}> = [
  {
    key: "coreProgress",
    titleKey: "playerProfile.chartsTab.sections.coreProgress",
    fallbackTitle: "Core Progress",
  },
  {
    key: "attributesBase",
    titleKey: "playerProfile.chartsTab.sections.attributesBase",
    fallbackTitle: "Attributes (Base)",
  },
  {
    key: "attributesTotals",
    titleKey: "playerProfile.chartsTab.sections.attributesTotals",
    fallbackTitle: "Attributes (Totals)",
  },
  {
    key: "economy",
    titleKey: "playerProfile.chartsTab.sections.economy",
    fallbackTitle: "Economy",
  },
  {
    key: "experience",
    titleKey: "playerProfile.chartsTab.sections.experience",
    fallbackTitle: "Experience",
  },
];

type ChartMetricValues = Partial<Record<ChartMetricKey, number | null>>;

export type MonthlyChartEntry = {
  monthId: string;
  lastTs: number | null;
  scanAtSec: number | null;
  scanAtRaw: string | null;
  values: ChartMetricValues;
};

type MonthlyChartsSnapshotMonthPayload = {
  tsSec?: number | null;
  scanDocId?: string | null;
  kind?: "monthly" | "week1" | string | null;
  scanAtSec?: number | null;
  scanAtRaw?: string | null;
  values?: Record<string, unknown> | null;
  level?: number | null;
  totalStats?: number | null;
  honor?: number | null;
};

type MonthlyChartsSnapshotDocPayload = {
  schemaVersion?: number;
  builtThrough?: string | null;
  maxMonthKey?: string | null;
  months?: Record<string, MonthlyChartsSnapshotMonthPayload | null | undefined> | null;
};

type SnapshotSource = "snapshot" | "fallback";

type LoadedProgressSnapshot = {
  months: MonthlyChartEntry[];
  series: TrendSeries[];
  source: SnapshotSource;
};

export type PlayerProgressSnapshotStatus = "idle" | "loading" | "ready" | "error";

export type PlayerProgressSnapshotResult = {
  identifier: string;
  status: PlayerProgressSnapshotStatus;
  months: MonthlyChartEntry[];
  series: TrendSeries[];
  source: SnapshotSource | null;
  error: Error | null;
};

type UsePlayerProgressSnapshotsInput = {
  identifiers: string[];
};

type UsePlayerProgressSnapshotsResult = {
  byIdentifier: Record<string, PlayerProgressSnapshotResult>;
};

const snapshotCache = new Map<string, LoadedProgressSnapshot>();
const inFlightSnapshotLoads = new Map<string, Promise<LoadedProgressSnapshot>>();
const buildAttempts = new Set<string>();

const toNum = (value: any): number | null => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
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
      normalized = (integer + fractional).replace(/[^0-9]/g, "");
    }
  } else {
    normalized = unsigned.replace(/[^0-9]/g, "");
  }

  if (!normalized) return null;
  const num = Number(normalized) * sign;
  return Number.isFinite(num) ? num : null;
};

const toChartMetricNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const buildSeriesForMetric = (
  metric: ProgressChartMetricConfigEntry,
  samples: Array<{ label: string; value: number; scanAtSec: number | null; scanAtRaw: string | null }>,
  locale?: string,
): TrendSeries => {
  const points = samples.map((sample) => sample.value);
  return {
    key: metric.key,
    sectionKey: metric.sectionKey,
    labelKey: metric.labelKey,
    label: metric.fallbackLabel,
    points,
    unit: "",
    subLabelKey: CHART_MONTHLY_HISTORY_LABEL_KEY,
    subLabel: CHARTS_RANGE_LABEL,
    tooltips: samples.length
      ? samples.map((sample) => `${sample.label}: ${sample.value.toLocaleString(locale)}`)
      : undefined,
    pointMeta: samples.length
      ? samples.map((sample) => ({
          label: sample.label,
          scanAtSec: sample.scanAtSec,
          scanAtRaw: sample.scanAtRaw,
        }))
      : undefined,
    latestLabelKey: CHART_LATEST_LABEL_KEY,
    latestLabel: `${metric.fallbackLabel} (latest)`,
    startLabelKey: CHART_START_LABEL_KEY,
    startLabel: `${metric.fallbackLabel} (start)`,
    showAvgMarker: false,
  };
};

export const buildSeriesFromMonthly = (months: MonthlyChartEntry[]): TrendSeries[] => {
  const sorted = [...months].sort((a, b) => a.monthId.localeCompare(b.monthId));
  const locale =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().locale || undefined
      : undefined;
  return PLAYER_PROGRESS_CHART_METRIC_CONFIG.map((metric) => {
    const samples: Array<{ label: string; value: number; scanAtSec: number | null; scanAtRaw: string | null }> = [];
    sorted.forEach((month) => {
      const value = toChartMetricNumber(month.values[metric.key]);
      if (value == null) return;
      samples.push({
        label: month.monthId,
        value,
        scanAtSec: month.scanAtSec,
        scanAtRaw: month.scanAtRaw,
      });
    });
    return buildSeriesForMetric(metric, samples, locale);
  });
};

export const buildFallbackProgressSeries = (): TrendSeries[] =>
  PLAYER_PROGRESS_CHART_METRIC_CONFIG.map((metric) => buildSeriesForMetric(metric, []));

const isUtcMonthKey = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}$/.test(value);

const currentUtcMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const mapMonthlyChartsSnapshotDocToEntries = (docSnap: any): MonthlyChartEntry[] => {
  if (!docSnap?.exists?.()) return [];
  const data = (typeof docSnap.data === "function" ? docSnap.data() : null) as MonthlyChartsSnapshotDocPayload | null;
  const monthsRaw = data?.months;
  if (!monthsRaw || typeof monthsRaw !== "object" || Array.isArray(monthsRaw)) return [];

  return Object.entries(monthsRaw)
    .map(([monthId, raw]) => {
      if (!isUtcMonthKey(monthId) || !raw || typeof raw !== "object") return null;
      const valuesRaw =
        raw.values && typeof raw.values === "object" && !Array.isArray(raw.values)
          ? (raw.values as Record<string, unknown>)
          : null;
      const rawRecord = raw as Record<string, unknown>;
      const values: ChartMetricValues = {};
      CHART_METRIC_KEYS.forEach((metricKey) => {
        const fromValues = toNum(valuesRaw?.[metricKey]);
        if (fromValues != null) {
          values[metricKey] = fromValues;
          return;
        }
        const fallback = toNum(rawRecord[metricKey]);
        if (fallback != null) values[metricKey] = fallback;
      });
      return {
        monthId,
        lastTs: toNum(raw.tsSec) ?? null,
        scanAtSec: toNum(rawRecord.scanAtSec) ?? null,
        scanAtRaw:
          typeof rawRecord.scanAtRaw === "string" && rawRecord.scanAtRaw.trim()
            ? rawRecord.scanAtRaw.trim()
            : null,
        values,
      } satisfies MonthlyChartEntry;
    })
    .filter((entry): entry is MonthlyChartEntry => !!entry)
    .sort((a, b) => a.monthId.localeCompare(b.monthId));
};

const shouldBuildMonthlyChartsSnapshot = (docSnap: any, currentMonthKey: string) => {
  if (!docSnap?.exists?.()) return true;
  const data = (typeof docSnap.data === "function" ? docSnap.data() : null) as MonthlyChartsSnapshotDocPayload | null;
  const rawMonths =
    data?.months && typeof data.months === "object" && !Array.isArray(data.months)
      ? (data.months as Record<string, unknown>)
      : null;
  const schemaVersion = typeof data?.schemaVersion === "number" ? data.schemaVersion : 0;
  if (schemaVersion < CHART_SNAPSHOT_REQUIRED_SCHEMA) return true;
  if (rawMonths) {
    const sortedMonthKeys = Object.keys(rawMonths).filter(isUtcMonthKey).sort();
    const latestMonthKey = sortedMonthKeys.length ? sortedMonthKeys[sortedMonthKeys.length - 1] : null;
    if (latestMonthKey) {
      const latestMonthRaw = rawMonths[latestMonthKey];
      const latestMonthRecord =
        latestMonthRaw && typeof latestMonthRaw === "object" && !Array.isArray(latestMonthRaw)
          ? (latestMonthRaw as Record<string, unknown>)
          : null;
      const latestValuesRaw =
        latestMonthRecord?.values &&
        typeof latestMonthRecord.values === "object" &&
        !Array.isArray(latestMonthRecord.values)
          ? (latestMonthRecord.values as Record<string, unknown>)
          : null;
      const hasMissingRequiredValue = CHART_SNAPSHOT_REQUIRED_VALUE_KEYS.some(
        (key) => !latestValuesRaw || !Object.prototype.hasOwnProperty.call(latestValuesRaw, key),
      );
      if (hasMissingRequiredValue) return true;
      const hasScanTime =
        toNum(latestMonthRecord?.scanAtSec) != null ||
        (typeof latestMonthRecord?.scanAtRaw === "string" && latestMonthRecord.scanAtRaw.trim().length > 0);
      if (!hasScanTime) return true;
    }
  }
  const builtThrough = isUtcMonthKey(data?.builtThrough) ? data?.builtThrough : null;
  if (builtThrough && builtThrough >= currentMonthKey) return false;
  if (rawMonths) {
    const monthRow = rawMonths[currentMonthKey];
    if (monthRow && typeof monthRow === "object") return false;
  }
  return true;
};

const buildMonthlyChartsSnapshot = async (identifier: string) => {
  if (!AUTH_BASE_URL) return false;
  const endpoint = `${AUTH_BASE_URL}/api/players/${encodeURIComponent(identifier)}/charts/monthly_v1/build`;
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    let message = `Build snapshot failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data?.error === "string" && data.error.trim()) {
        message = data.error;
      }
    } catch {
      // ignore JSON parse failures
    }
    throw new Error(message);
  }
  return true;
};

const normalizeIdentifier = (value: string): string => value.trim().toLowerCase();

const loadProgressSnapshot = async (identifier: string, currentMonthKey: string): Promise<LoadedProgressSnapshot> => {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const cacheKey = `${normalizedIdentifier}:${currentMonthKey}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached) return cached;

  const existing = inFlightSnapshotLoads.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const scope: FirestoreTraceScope = beginReadScope("PlayerProgressSnapshots:load");
    try {
      const snapshotRef = doc(db, "players", normalizedIdentifier, "charts", "monthly_v1");
      let snapshotDoc = await traceGetDoc(scope, snapshotRef, () => getDoc(snapshotRef));
      let snapshotMonths = mapMonthlyChartsSnapshotDocToEntries(snapshotDoc);

      const needsBuild = shouldBuildMonthlyChartsSnapshot(snapshotDoc, currentMonthKey);
      const buildAttemptKey = `${normalizedIdentifier}:${currentMonthKey}:s${CHART_SNAPSHOT_REQUIRED_SCHEMA}`;
      if (needsBuild && !buildAttempts.has(buildAttemptKey)) {
        buildAttempts.add(buildAttemptKey);
        const didTriggerBuild = await buildMonthlyChartsSnapshot(normalizedIdentifier);
        if (didTriggerBuild) {
          snapshotDoc = await traceGetDoc(scope, snapshotRef, () => getDoc(snapshotRef));
          snapshotMonths = mapMonthlyChartsSnapshotDocToEntries(snapshotDoc);
        }
      } else if (needsBuild && !AUTH_BASE_URL) {
        console.warn("[charts] AUTH_BASE_URL missing, cannot build monthly snapshot", { historyIdentifier: normalizedIdentifier });
      }

      const loaded: LoadedProgressSnapshot = snapshotMonths.length
        ? { months: snapshotMonths, series: buildSeriesFromMonthly(snapshotMonths), source: "snapshot" }
        : { months: [], series: buildFallbackProgressSeries(), source: "fallback" };
      snapshotCache.set(cacheKey, loaded);
      return loaded;
    } finally {
      endReadScope(scope);
      inFlightSnapshotLoads.delete(cacheKey);
    }
  })();

  inFlightSnapshotLoads.set(cacheKey, promise);
  return promise;
};

const createIdleResult = (identifier: string): PlayerProgressSnapshotResult => ({
  identifier,
  status: "idle",
  months: [],
  series: buildFallbackProgressSeries(),
  source: null,
  error: null,
});

export function usePlayerProgressSnapshots({ identifiers }: UsePlayerProgressSnapshotsInput): UsePlayerProgressSnapshotsResult {
  const normalizedIdentifiers = useMemo(
    () => Array.from(new Set(identifiers.map((id) => normalizeIdentifier(id)).filter(Boolean))),
    [identifiers],
  );
  const normalizedIdentifiersKey = useMemo(() => normalizedIdentifiers.slice().sort().join("|"), [normalizedIdentifiers]);
  const stableIdentifiers = useMemo(
    () => (normalizedIdentifiersKey ? normalizedIdentifiersKey.split("|").filter(Boolean) : []),
    [normalizedIdentifiersKey],
  );
  const currentMonthKey = currentUtcMonthKey();
  const [byIdentifier, setByIdentifier] = useState<Record<string, PlayerProgressSnapshotResult>>({});

  useEffect(() => {
    setByIdentifier((prev) => {
      const next: Record<string, PlayerProgressSnapshotResult> = {};
      let changed = false;
      stableIdentifiers.forEach((identifier) => {
        if (prev[identifier]) {
          next[identifier] = prev[identifier];
        } else {
          next[identifier] = createIdleResult(identifier);
          changed = true;
        }
      });
      if (Object.keys(prev).length !== stableIdentifiers.length) {
        changed = true;
      }
      if (!changed) return prev;
      return next;
    });
  }, [stableIdentifiers, normalizedIdentifiersKey]);

  useEffect(() => {
    if (!stableIdentifiers.length) return;
    let cancelled = false;

    stableIdentifiers.forEach((identifier) => {
      setByIdentifier((prev) => {
        const existing = prev[identifier] ?? createIdleResult(identifier);
        if (existing.status === "loading" || existing.status === "ready") return prev;
        return {
          ...prev,
          [identifier]: {
            ...existing,
            status: "loading",
            error: null,
          },
        };
      });

      void loadProgressSnapshot(identifier, currentMonthKey)
        .then((loaded) => {
          if (cancelled) return;
          setByIdentifier((prev) => ({
            ...prev,
            [identifier]: {
              identifier,
              status: "ready",
              months: loaded.months,
              series: loaded.series,
              source: loaded.source,
              error: null,
            },
          }));
        })
        .catch((error) => {
          if (cancelled) return;
          const err = error instanceof Error ? error : new Error("Failed to load progress snapshot");
          setByIdentifier((prev) => ({
            ...prev,
            [identifier]: {
              identifier,
              status: "error",
              months: [],
              series: buildFallbackProgressSeries(),
              source: "fallback",
              error: err,
            },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [currentMonthKey, normalizedIdentifiersKey, stableIdentifiers]);

  return { byIdentifier };
}
