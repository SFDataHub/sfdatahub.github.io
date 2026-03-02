import { useEffect, useMemo, useState } from "react";
// @ts-ignore Recharts is expected in the app dependency set where this component is mounted.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./ServerComparisonMultiLineChart.module.css";
import { getClassIconUrl } from "./shared/classIcons";

type AxisId = "left" | "right";
type RangeMonths = 6 | 12;
type EntityKind = "player" | "favorite" | "baseline";

interface MetricDefinition {
  key: string;
  label: string;
  groupKey: string;
  groupLabel: string;
  axis: AxisId;
  hue: number;
  decimals: number;
  unit?: string;
}

interface EntityDefinition {
  key: string;
  label: string;
  className?: string;
  baseline: boolean;
  kind: EntityKind;
  lightnessShift: number;
}

interface ChartRow {
  month: string;
  [seriesKey: string]: string | number | null;
}

interface SeriesDescriptor {
  dataKey: string;
  label: string;
  metric: MetricDefinition;
  entity: EntityDefinition;
  yAxisId: AxisId;
  stroke: string;
  dashed: boolean;
  isPlayer: boolean;
}

interface TooltipPayloadItem {
  dataKey?: string;
  value?: number | string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  lineByKey: Record<string, SeriesDescriptor>;
  hiddenLineKeys?: Set<string>;
  normalize: boolean;
  monthScanLabels?: Record<string, string>;
}

export interface ServerComparisonExternalMetric {
  key: string;
  label: string;
  groupKey: string;
  groupLabel: string;
  axis?: AxisId;
  decimals?: number;
  unit?: string;
}

export interface ServerComparisonExternalEntity {
  key: string;
  label: string;
  className?: string | null;
  kind: EntityKind;
  baseline?: boolean;
  metricValues: Record<string, Array<number | null>>;
}

export interface ServerComparisonExternalData {
  months: string[];
  monthScanLabels?: Record<string, string>;
  metrics: ServerComparisonExternalMetric[];
  entities: ServerComparisonExternalEntity[];
  playerKey: string;
  serverBaselineKey?: string | null;
  guildBaselineKey?: string | null;
}

interface ServerComparisonMultiLineChartProps {
  externalData?: ServerComparisonExternalData;
  isLoading?: boolean;
  selectedFavoriteKeys?: string[];
  onSelectedFavoriteKeysChange?: (next: string[]) => void;
  availableFavoriteKeys?: string[];
  onFavoriteAdded?: (favoriteKey: string) => void | Promise<void>;
}

const MOCK_METRICS: MetricDefinition[] = [
  { key: "level", label: "Level", groupKey: "stats", groupLabel: "Stats", axis: "left", hue: 212, decimals: 0 },
  { key: "honor", label: "Honor", groupKey: "stats", groupLabel: "Stats", axis: "left", hue: 191, decimals: 0 },
  { key: "damage", label: "Damage", groupKey: "stats", groupLabel: "Stats", axis: "left", hue: 10, decimals: 0 },
  { key: "armor", label: "Armor", groupKey: "stats", groupLabel: "Stats", axis: "left", hue: 43, decimals: 0 },
  {
    key: "scrapbook",
    label: "Scrapbook",
    groupKey: "collection",
    groupLabel: "Collection",
    axis: "right",
    hue: 272,
    decimals: 1,
    unit: "%",
  },
  { key: "achievements", label: "Achievements", groupKey: "collection", groupLabel: "Collection", axis: "left", hue: 154, decimals: 0 },
  { key: "pets", label: "Pets", groupKey: "collection", groupLabel: "Collection", axis: "left", hue: 320, decimals: 0 },
];

const MOCK_ENTITIES: EntityDefinition[] = [
  { key: "player", label: "You", baseline: false, kind: "player", lightnessShift: 0 },
  { key: "aster", label: "Aster", baseline: false, kind: "favorite", lightnessShift: 8 },
  { key: "lyra", label: "Lyra", baseline: false, kind: "favorite", lightnessShift: 14 },
  { key: "voss", label: "Voss", baseline: false, kind: "favorite", lightnessShift: 18 },
  { key: "nyx", label: "Nyx", baseline: false, kind: "favorite", lightnessShift: 22 },
  { key: "kael", label: "Kael", baseline: false, kind: "favorite", lightnessShift: 12 },
  { key: "guildAvg", label: "Guild Avg", baseline: true, kind: "baseline", lightnessShift: 24 },
];

const MOCK_VALUES: Record<string, { base: number; trend: number; wave: number; min: number; max: number; offset: number }> = {
  level: { base: 410, trend: 9, wave: 18, min: 1, max: 800, offset: 0 },
  honor: { base: 320000, trend: 28000, wave: 58000, min: 0, max: 1500000, offset: 0 },
  damage: { base: 1050000, trend: 96000, wave: 140000, min: 0, max: 5000000, offset: 0 },
  armor: { base: 720000, trend: 63000, wave: 90000, min: 0, max: 3000000, offset: 0 },
  scrapbook: { base: 58, trend: 1.4, wave: 2.2, min: 0, max: 100, offset: 0 },
  achievements: { base: 2200, trend: 120, wave: 210, min: 0, max: 9000, offset: 0 },
  pets: { base: 1350, trend: 80, wave: 160, min: 0, max: 6000, offset: 0 },
};

const formatInteger = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function toSeriesKey(entityKey: string, metricKey: string): string {
  return `${entityKey}__${metricKey}`;
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function noise(seed: number, step: number): number {
  let value = seed ^ Math.imul(step + 1, 1597334677);
  value = Math.imul(value ^ (value >>> 15), 2246822519);
  value ^= value >>> 13;
  const normalized = (value >>> 0) / 4294967295;
  return normalized * 2 - 1;
}

function buildRangeLabels(monthCount: number): string[] {
  const labels: string[] = [];
  const now = new Date();
  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const labelDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    labels.push(
      labelDate.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
    );
  }
  return labels;
}

function generateMockSeries(metricKey: string, entityKey: string, points: number): Array<number | null> {
  const cfg = MOCK_VALUES[metricKey];
  if (!cfg) return Array.from({ length: points }, () => null);

  const seed = hashSeed(`${metricKey}:${entityKey}`);
  const entityBias = 0.9 + (hashSeed(entityKey) % 25) / 100;
  const entityOffset = ((hashSeed(entityKey) % 5) - 2) * (cfg.base * 0.02);
  const values: Array<number | null> = [];

  for (let index = 0; index < points; index += 1) {
    const trend = cfg.trend * index;
    const seasonal = Math.sin((index + (seed % 9)) / 1.85) * cfg.wave;
    const jitter = noise(seed, index) * cfg.wave * 0.4;
    const raw = (cfg.base + trend + seasonal + jitter + entityOffset + cfg.offset) * entityBias;
    const clamped = Math.max(cfg.min, Math.min(cfg.max, raw));
    values.push(clamped);
  }

  return values;
}

function normalizeNullableSeries(values: Array<number | null>): Array<number | null> {
  let baseline: number | null = null;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      baseline = value === 0 ? 1 : value;
      break;
    }
  }
  if (baseline == null) return values.map(() => null);
  return values.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Number(((value / baseline) * 100).toFixed(1));
  });
}

function metricValueLabel(metric: MetricDefinition, value: number, normalize: boolean): string {
  if (normalize) return `${value.toFixed(1)} idx`;
  if (metric.decimals > 0) return `${value.toFixed(metric.decimals)}${metric.unit ?? ""}`;
  return `${formatInteger.format(value)}${metric.unit ?? ""}`;
}

const PLAYER_COLOR = "#4da3ff";
const ENTITY_COLOR_PALETTE = [
  "#f97316",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
  "#84cc16",
  "#38bdf8",
  "#f59e0b",
  "#c084fc",
  "#f472b6",
];
const CHART_ANIM = {
  isAnimationActive: true,
  animationDuration: 750,
  animationEasing: "ease-in-out",
  animationBegin: 0,
} as const;

function serverKeyFromIdentifier(identifier: string): string {
  const index = identifier.indexOf("_p");
  if (index <= 0) return "";
  return identifier.slice(0, index);
}

function toEntityDisplayName(identifier: string, label: string): string {
  const displayName = label || identifier;
  const serverTag = serverKeyFromIdentifier(identifier);
  if (!serverTag) return displayName;
  return `${displayName} (${serverTag})`;
}

function colorForIdentifier(identifier: string, isPlayer: boolean): string {
  if (isPlayer) return PLAYER_COLOR;
  const index = hashSeed(identifier) % ENTITY_COLOR_PALETTE.length;
  return ENTITY_COLOR_PALETTE[index];
}

function buildSeriesLabel(entity: EntityDefinition, metric: MetricDefinition): string {
  const identifier = entity.key;
  const nameWithServer = toEntityDisplayName(identifier, entity.label || identifier);
  return `${nameWithServer} - ${metric.label}`;
}

function ChartTooltip({ active, label, payload, lineByKey, hiddenLineKeys, normalize, monthScanLabels }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const scanAt = label ? monthScanLabels?.[label] : undefined;
  const labelWithScan = scanAt ? `${label} | Scan: ${scanAt}` : label;

  return (
    <div className={styles.tooltipCard}>
      <div className={styles.tooltipLabel}>{labelWithScan}</div>
      <div className={styles.tooltipRows}>
        {payload.map((item) => {
          if (!item.dataKey) return null;
          if (hiddenLineKeys?.has(item.dataKey)) return null;
          const descriptor = lineByKey[item.dataKey];
          if (!descriptor) return null;

          const numericValue =
            typeof item.value === "number"
              ? item.value
              : typeof item.value === "string"
                ? Number(item.value)
                : Number.NaN;
          if (!Number.isFinite(numericValue)) return null;

          return (
            <div key={item.dataKey} className={styles.tooltipRow}>
              <span className={styles.tooltipKey}>
                <span className={styles.tooltipDot} style={{ background: descriptor.stroke }} />
                {descriptor.label}
              </span>
              <strong>{metricValueLabel(descriptor.metric, numericValue, normalize)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ServerComparisonMultiLineChart({
  externalData,
  isLoading = false,
  selectedFavoriteKeys,
  onSelectedFavoriteKeysChange,
  availableFavoriteKeys,
  onFavoriteAdded,
}: ServerComparisonMultiLineChartProps) {
  const [rangeMonths, setRangeMonths] = useState<RangeMonths>(12);
  const [normalize, setNormalize] = useState(false);
  const [showServerAvg, setShowServerAvg] = useState(false);
  const [showGuildAvg, setShowGuildAvg] = useState(true);
  const [internalSelectedFavoriteKeys, setInternalSelectedFavoriteKeys] = useState<string[]>(["aster"]);
  const [nextFavorite, setNextFavorite] = useState<string>("aster");

  const metricDefs = useMemo<MetricDefinition[]>(
    () =>
      externalData
        ? externalData.metrics.map((metric) => ({
            key: metric.key,
            label: metric.label,
            groupKey: metric.groupKey,
            groupLabel: metric.groupLabel,
            axis: metric.axis ?? "left",
            hue: hashSeed(metric.key) % 360,
            decimals: metric.decimals ?? 0,
            unit: metric.unit,
          }))
        : MOCK_METRICS,
    [externalData],
  );

  const entityDefs = useMemo<EntityDefinition[]>(
    () =>
      externalData
        ? externalData.entities.map((entity, index) => ({
            key: entity.key,
            label: entity.label,
            className: typeof entity.className === "string" ? entity.className : undefined,
            kind: entity.kind,
            baseline: entity.baseline === true || entity.kind === "baseline",
            lightnessShift: (index * 8) % 30,
          }))
        : MOCK_ENTITIES,
    [externalData],
  );

  const entityByKey = useMemo(
    () =>
      entityDefs.reduce<Record<string, EntityDefinition>>((acc, entity) => {
        acc[entity.key] = entity;
        return acc;
      }, {}),
    [entityDefs],
  );

  const favoriteEntityKeys = useMemo(
    () => entityDefs.filter((entity) => entity.kind === "favorite").map((entity) => entity.key),
    [entityDefs],
  );
  const playerEntityKey = externalData?.playerKey ?? "player";
  const serverBaselineKey = externalData?.serverBaselineKey ?? null;
  const guildBaselineKey = externalData?.guildBaselineKey ?? "guildAvg";
  const serverBaselineAvailable = !!serverBaselineKey && !!entityByKey[serverBaselineKey];
  const guildBaselineAvailable = !!guildBaselineKey && !!entityByKey[guildBaselineKey];

  const comparePlayers = selectedFavoriteKeys ?? internalSelectedFavoriteKeys;
  const setComparePlayers = (next: string[]) => {
    if (onSelectedFavoriteKeysChange) {
      onSelectedFavoriteKeysChange(next);
      return;
    }
    setInternalSelectedFavoriteKeys(next);
  };

  useEffect(() => {
    const filtered = comparePlayers.filter((key) => favoriteEntityKeys.includes(key));
    const unchanged =
      filtered.length === comparePlayers.length &&
      filtered.every((key, index) => key === comparePlayers[index]);
    if (unchanged) return;
    setComparePlayers(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteEntityKeys.join("|")]);

  const availableFavorites = useMemo(() => {
    const selected = new Set(comparePlayers);
    const fromProps = availableFavoriteKeys ?? favoriteEntityKeys;
    return fromProps.filter((favoriteKey) => !selected.has(favoriteKey) && !!entityByKey[favoriteKey]);
  }, [availableFavoriteKeys, comparePlayers, entityByKey, favoriteEntityKeys]);

  const classIconByEntityKey = useMemo(
    () =>
      entityDefs.reduce<Record<string, string | undefined>>((acc, entity) => {
        acc[entity.key] = getClassIconUrl(entity.className, 32);
        return acc;
      }, {}),
    [entityDefs],
  );

  const displayLabelByEntityKey = useMemo(
    () =>
      entityDefs.reduce<Record<string, string>>((acc, entity) => {
        acc[entity.key] = toEntityDisplayName(entity.key, entity.label || entity.key);
        return acc;
      }, {}),
    [entityDefs],
  );

  useEffect(() => {
    if (!availableFavorites.length) return;
    if (!availableFavorites.includes(nextFavorite)) {
      setNextFavorite(availableFavorites[0]);
    }
  }, [availableFavorites, nextFavorite]);

  const groupedMetrics = useMemo(() => {
    const grouped = new Map<string, { key: string; label: string; metricKeys: string[] }>();
    metricDefs.forEach((metric) => {
      const existing = grouped.get(metric.groupKey);
      if (existing) {
        existing.metricKeys.push(metric.key);
        return;
      }
      grouped.set(metric.groupKey, { key: metric.groupKey, label: metric.groupLabel, metricKeys: [metric.key] });
    });
    return Array.from(grouped.values());
  }, [metricDefs]);

  const overviewDefaultMetrics = useMemo(() => {
    const preferred = ["level", "honor", "xpProgress", "scrapbook"];
    const preferredExisting = preferred.filter((key) => metricDefs.some((metric) => metric.key === key));
    if (preferredExisting.length) return preferredExisting.slice(0, 3);
    return metricDefs.slice(0, 3).map((metric) => metric.key);
  }, [metricDefs]);

  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(overviewDefaultMetrics);
  useEffect(() => {
    setSelectedMetrics((current) => {
      const valid = current.filter((key) => metricDefs.some((metric) => metric.key === key));
      return valid.length ? valid : overviewDefaultMetrics;
    });
  }, [metricDefs, overviewDefaultMetrics]);

  const selectedMetricSet = useMemo(() => new Set(selectedMetrics), [selectedMetrics]);
  const allChartEntities = useMemo(() => {
    const entities: EntityDefinition[] = [];
    if (entityByKey[playerEntityKey]) entities.push(entityByKey[playerEntityKey]);
    favoriteEntityKeys.forEach((key) => {
      if (entityByKey[key]) entities.push(entityByKey[key]);
    });
    if (serverBaselineAvailable && serverBaselineKey && entityByKey[serverBaselineKey]) {
      entities.push(entityByKey[serverBaselineKey]);
    }
    if (guildBaselineAvailable && guildBaselineKey && entityByKey[guildBaselineKey]) {
      entities.push(entityByKey[guildBaselineKey]);
    }
    return entities;
  }, [
    entityByKey,
    favoriteEntityKeys,
    guildBaselineAvailable,
    guildBaselineKey,
    playerEntityKey,
    serverBaselineAvailable,
    serverBaselineKey,
  ]);

  const visibleEntitySet = useMemo(() => {
    const visible = new Set<string>();
    if (entityByKey[playerEntityKey]) visible.add(playerEntityKey);
    comparePlayers.forEach((key) => {
      if (entityByKey[key]) visible.add(key);
    });
    if (showServerAvg && serverBaselineAvailable && serverBaselineKey && entityByKey[serverBaselineKey]) {
      visible.add(serverBaselineKey);
    }
    if (showGuildAvg && guildBaselineKey && entityByKey[guildBaselineKey]) visible.add(guildBaselineKey);
    return visible;
  }, [comparePlayers, entityByKey, guildBaselineKey, playerEntityKey, serverBaselineKey, showGuildAvg, showServerAvg]);

  const allMonths = useMemo(() => (externalData ? externalData.months : buildRangeLabels(rangeMonths)), [externalData, rangeMonths]);
  const visibleMonths = useMemo(() => allMonths.slice(-rangeMonths), [allMonths, rangeMonths]);
  const visibleStartIndex = Math.max(0, allMonths.length - visibleMonths.length);

  const externalMetricValuesByEntity = useMemo(
    () =>
      (externalData?.entities ?? []).reduce<Record<string, Record<string, Array<number | null>>>>((acc, entity) => {
        acc[entity.key] = entity.metricValues;
        return acc;
      }, {}),
    [externalData],
  );
  const monthScanLabels = externalData?.monthScanLabels;

  const seriesByKey = useMemo<Record<string, Array<number | null>>>(() => {
    const nextSeries: Record<string, Array<number | null>> = {};
    metricDefs.forEach((metric) => {
      allChartEntities.forEach((entity) => {
        const key = toSeriesKey(entity.key, metric.key);
        const values = externalData
          ? visibleMonths.map((_, localIndex) => {
              const sourceIndex = visibleStartIndex + localIndex;
              const raw = externalMetricValuesByEntity[entity.key]?.[metric.key]?.[sourceIndex];
              return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
            })
          : generateMockSeries(metric.key, entity.key, visibleMonths.length);
        nextSeries[key] = normalize ? normalizeNullableSeries(values) : values;
      });
    });
    return nextSeries;
  }, [allChartEntities, externalData, externalMetricValuesByEntity, metricDefs, normalize, visibleMonths, visibleStartIndex]);

  const lineDescriptors = useMemo<SeriesDescriptor[]>(() => {
    const lines: SeriesDescriptor[] = [];
    metricDefs.forEach((metric) => {
      allChartEntities.forEach((entity) => {
        const isPlayer = entity.key === playerEntityKey;
        lines.push({
          dataKey: toSeriesKey(entity.key, metric.key),
          label: buildSeriesLabel(entity, metric),
          metric,
          entity,
          yAxisId: metric.axis,
          stroke: colorForIdentifier(entity.key, isPlayer),
          dashed: entity.baseline,
          isPlayer,
        });
      });
    });
    return lines;
  }, [allChartEntities, metricDefs, playerEntityKey]);

  const lineByKey = useMemo<Record<string, SeriesDescriptor>>(
    () =>
      lineDescriptors.reduce<Record<string, SeriesDescriptor>>((acc, descriptor) => {
        acc[descriptor.dataKey] = descriptor;
        return acc;
      }, {}),
    [lineDescriptors],
  );

  const chartRows = useMemo<ChartRow[]>(
    () =>
      visibleMonths.map((month, index) => {
        const row: ChartRow = { month };
        Object.entries(seriesByKey).forEach(([key, values]) => {
          const value = values[index];
          row[key] = typeof value === "number" ? value : null;
        });
        return row;
      }),
    [seriesByKey, visibleMonths],
  );

  const hiddenLineKeys = useMemo(() => {
    const hidden = new Set<string>();
    lineDescriptors.forEach((descriptor) => {
      const metricVisible = selectedMetricSet.has(descriptor.metric.key);
      const entityVisible = visibleEntitySet.has(descriptor.entity.key);
      if (!metricVisible || !entityVisible) {
        hidden.add(descriptor.dataKey);
      }
    });
    return hidden;
  }, [lineDescriptors, selectedMetricSet, visibleEntitySet]);

  const visibleLineDescriptors = useMemo(
    () => lineDescriptors.filter((descriptor) => !hiddenLineKeys.has(descriptor.dataKey)),
    [hiddenLineKeys, lineDescriptors],
  );

  const hasRightAxisMetric = useMemo(
    () => metricDefs.some((metric) => metric.axis === "right"),
    [metricDefs],
  );

  const chartOverlayMessage =
    selectedMetrics.length === 0
      ? "Select at least one metric to render the chart."
      : visibleMonths.length === 0
        ? "No history available yet."
        : null;

  const applyPreset = (preset: "overview" | "groupA" | "groupB" | "clear") => {
    switch (preset) {
      case "overview":
        setSelectedMetrics(overviewDefaultMetrics);
        break;
      case "groupA":
        setSelectedMetrics(groupedMetrics[0]?.metricKeys ?? []);
        break;
      case "groupB":
        setSelectedMetrics(groupedMetrics[1]?.metricKeys ?? []);
        break;
      case "clear":
        setSelectedMetrics([]);
        break;
      default:
        break;
    }
  };

  const toggleMetric = (metricKey: string) => {
    setSelectedMetrics((current) => {
      const next = current.includes(metricKey)
        ? current.filter((key) => key !== metricKey)
        : [...current, metricKey];
      return metricDefs.filter((metric) => next.includes(metric.key)).map((metric) => metric.key);
    });
  };

  const addFavorite = () => {
    if (!nextFavorite || comparePlayers.includes(nextFavorite)) return;
    if (onFavoriteAdded) {
      void onFavoriteAdded(nextFavorite);
      return;
    }
    setComparePlayers([...comparePlayers, nextFavorite]);
  };

  const removeFavorite = (favorite: string) => {
    setComparePlayers(comparePlayers.filter((key) => key !== favorite));
  };

  const hasPreset = (keys: string[]) =>
    keys.length === selectedMetrics.length && keys.every((key) => selectedMetricSet.has(key));

  const renderEntityLabel = (entityKey: string) => {
    const iconUrl = classIconByEntityKey[entityKey];
    const label = displayLabelByEntityKey[entityKey] ?? entityByKey[entityKey]?.label ?? entityKey;
    return (
      <span className={styles.compareEntityLabel}>
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            className={styles.compareEntityIcon}
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <span className={styles.compareEntityText}>{label}</span>
      </span>
    );
  };

  const controls = (
    <div className={styles.controlsPanel}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Range</h3>
        <div className={styles.segmented}>
          <button
            type="button"
            className={`${styles.segmentedButton} ${rangeMonths === 6 ? styles.segmentedButtonActive : ""}`.trim()}
            onClick={() => setRangeMonths(6)}
          >
            Last 6M
          </button>
          <button
            type="button"
            className={`${styles.segmentedButton} ${rangeMonths === 12 ? styles.segmentedButtonActive : ""}`.trim()}
            onClick={() => setRangeMonths(12)}
          >
            Last 12M
          </button>
        </div>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={normalize}
            onChange={(event) => setNormalize(event.target.checked)}
          />
          <span>Normalize (Index)</span>
        </label>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Metric Groups</h3>
        {groupedMetrics.map((group) => (
          <div key={group.key} className={styles.metricGroup}>
            <h4>{group.label}</h4>
            <div className={styles.metricGrid}>
              {group.metricKeys.map((metricKey) => {
                const metric = metricDefs.find((entry) => entry.key === metricKey);
                if (!metric) return null;
                return (
                  <label key={metric.key} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={selectedMetricSet.has(metric.key)}
                      onChange={() => toggleMetric(metric.key)}
                    />
                    <span>{metric.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Compare Players</h3>
        <div className={styles.compareAddRow}>
          <select
            value={nextFavorite}
            onChange={(event) => setNextFavorite(event.target.value)}
            disabled={availableFavorites.length === 0}
          >
            {availableFavorites.length > 0 ? (
              availableFavorites.map((favoriteKey) => (
                <option key={favoriteKey} value={favoriteKey}>
                  {displayLabelByEntityKey[favoriteKey] ?? entityByKey[favoriteKey]?.label ?? favoriteKey}
                </option>
              ))
            ) : (
              <option value={nextFavorite || ""}>All favorites selected</option>
            )}
          </select>
          <button type="button" onClick={addFavorite} disabled={availableFavorites.length === 0}>
            Add
          </button>
        </div>
        {availableFavorites.length > 0 && nextFavorite ? (
          <div className={styles.compareSelectPreview}>{renderEntityLabel(nextFavorite)}</div>
        ) : null}
        <div className={styles.compareList}>
          {entityByKey[playerEntityKey] ? (
            <div className={`${styles.compareChip} ${styles.compareChipCurrent}`.trim()}>
              {renderEntityLabel(playerEntityKey)}
            </div>
          ) : null}
          {comparePlayers.length === 0 ? (
            <p className={styles.muted}>No favorites selected.</p>
          ) : (
            comparePlayers.map((favoriteKey) => (
              <button
                key={favoriteKey}
                type="button"
                className={styles.compareChip}
                onClick={() => removeFavorite(favoriteKey)}
              >
                {renderEntityLabel(favoriteKey)}
                <span className={styles.compareChipTag}>Remove</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Baselines</h3>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={false}
            onChange={() => undefined}
            disabled
          />
          <span>Server Avg (unavailable)</span>
        </label>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={showGuildAvg}
            onChange={(event) => setShowGuildAvg(event.target.checked)}
            disabled={!guildBaselineAvailable}
          />
          <span>{guildBaselineAvailable ? "Guild Avg" : "Guild Avg (unavailable)"}</span>
        </label>
      </section>
    </div>
  );

  return (
    <section className={styles.root}>
      <header className={styles.headerCard}>
        <div>
          <h2>Server Comparison Multi-Line Chart</h2>
          <p>
            Track selected metrics across your profile, favorite players, and baseline averages.
          </p>
        </div>
      </header>

      <div className={styles.presetsRow}>
        <button
          type="button"
          className={`${styles.presetButton} ${hasPreset(overviewDefaultMetrics) ? styles.presetButtonActive : ""}`.trim()}
          onClick={() => applyPreset("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={`${styles.presetButton} ${hasPreset(groupedMetrics[0]?.metricKeys ?? []) ? styles.presetButtonActive : ""}`.trim()}
          onClick={() => applyPreset("groupA")}
        >
          {groupedMetrics[0]?.label ?? "Group A"}
        </button>
        <button
          type="button"
          className={`${styles.presetButton} ${hasPreset(groupedMetrics[1]?.metricKeys ?? []) ? styles.presetButtonActive : ""}`.trim()}
          onClick={() => applyPreset("groupB")}
          disabled={!groupedMetrics[1]}
        >
          {groupedMetrics[1]?.label ?? "Group B"}
        </button>
        <button
          type="button"
          className={`${styles.presetButton} ${selectedMetrics.length === 0 ? styles.presetButtonActive : ""}`.trim()}
          onClick={() => applyPreset("clear")}
        >
          Clear
        </button>
      </div>

      <div className={styles.layoutGrid}>
        <aside className={styles.controlsCard}>
          <details className={styles.controlsDetails} open>
            <summary className={styles.controlsSummary}>Chart Controls</summary>
            {controls}
          </details>
        </aside>

        <article className={styles.chartCard}>
          <div className={styles.chartHead}>
            <h3>Progress Comparison</h3>
            <span>{normalize ? "Indexed view" : "Absolute values"}</span>
          </div>

          <div className={styles.legendWrap}>
            {visibleLineDescriptors.length > 0 ? (
              visibleLineDescriptors.map((descriptor) => (
                <div key={descriptor.dataKey} className={styles.legendItem}>
                  <span
                    className={styles.legendSwatch}
                    style={{
                      borderTopStyle: descriptor.dashed ? "dashed" : "solid",
                      borderTopColor: descriptor.stroke,
                    }}
                  />
                  <span>{descriptor.label}</span>
                </div>
              ))
            ) : (
              <p className={styles.muted}>No visible series.</p>
            )}
          </div>

          <div className={styles.chartBody}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 14, right: 20, left: 6, bottom: 6 }}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 4" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "rgba(222, 234, 255, 0.9)", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(148, 163, 184, 0.25)" }}
                  tickLine={{ stroke: "rgba(148, 163, 184, 0.25)" }}
                />
                <YAxis
                  yAxisId="left"
                  width={72}
                  tick={{ fill: "rgba(222, 234, 255, 0.9)", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(148, 163, 184, 0.25)" }}
                  tickLine={{ stroke: "rgba(148, 163, 184, 0.25)" }}
                  tickFormatter={(value: number | string) =>
                    typeof value === "number"
                      ? normalize
                        ? value.toFixed(0)
                        : formatInteger.format(value)
                      : String(value)
                  }
                />
                {hasRightAxisMetric ? (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    width={56}
                    domain={normalize ? ["auto", "auto"] : [0, 100]}
                    tick={{ fill: "rgba(222, 234, 255, 0.9)", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(148, 163, 184, 0.25)" }}
                    tickLine={{ stroke: "rgba(148, 163, 184, 0.25)" }}
                    tickFormatter={(value: number | string) =>
                      typeof value === "number"
                        ? normalize
                          ? value.toFixed(0)
                          : `${value.toFixed(0)}%`
                        : String(value)
                    }
                  />
                ) : null}
                <Tooltip
                  content={
                    <ChartTooltip
                      lineByKey={lineByKey}
                      hiddenLineKeys={hiddenLineKeys}
                      normalize={normalize}
                      monthScanLabels={monthScanLabels}
                    />
                  }
                />

                {lineDescriptors.map((descriptor) => (
                  <Line
                    key={descriptor.dataKey}
                    yAxisId={descriptor.yAxisId}
                    type="monotone"
                    dataKey={descriptor.dataKey}
                    name={descriptor.label}
                    hide={hiddenLineKeys.has(descriptor.dataKey)}
                    stroke={descriptor.stroke}
                    strokeWidth={descriptor.entity.baseline ? 1.6 : descriptor.isPlayer ? 2.8 : 2.1}
                    strokeOpacity={descriptor.isPlayer ? 1 : descriptor.entity.baseline ? 0.55 : 0.8}
                    strokeDasharray={descriptor.dashed ? "6 4" : undefined}
                    dot={false}
                    connectNulls
                    isAnimationActive={CHART_ANIM.isAnimationActive}
                    animationDuration={CHART_ANIM.animationDuration}
                    animationEasing={CHART_ANIM.animationEasing}
                    animationBegin={CHART_ANIM.animationBegin}
                    animateNewValues={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            {chartOverlayMessage ? (
              <div className={styles.emptyState}>
                <p>{chartOverlayMessage}</p>
              </div>
            ) : null}
            {isLoading ? (
              <div className={styles.loadingOverlay}>
                <div className={styles.loadingSpinner} aria-hidden="true" />
                <p className={styles.loadingText}>Loading series...</p>
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
