import React, { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import {
  beginReadScope,
  endReadScope,
  traceGetDoc,
  type FirestoreTraceScope,
} from "../../../../lib/debug/firestoreReadTrace";
import GuildMonthlyProgressTab from "./GuildMonthlyProgressTab";
import type {
  GuildMonthlyProgressData,
  MonthOption,
  TableBlock,
  TableGroup,
  TableRow,
} from "./GuildMonthlyProgressTab.types";
import { guildIconUrlByIdentifier } from "../../../../data/guilds";
import type { MembersSummaryDoc, MonthKey } from "../../../../lib/guilds/monthly/types";
import { canonClassKey } from "../../GuildClassOverview/utils";

type Props = {
  guildId: string;
  guildName: string;
  guildServer?: string | null;
  seedData?: GuildMonthlyProgressSeedData | null;
};

export type GuildMonthlyProgressSeedData = {
  latestLatest?: Record<string, any> | null;
  latestSummary?: Record<string, any> | null;
  monthSnapshotsByKey?: Record<string, Record<string, any>>;
  latestSummaryMissing?: boolean;
  knownMissingMonthKeys?: string[];
};

type SnapshotEndpoint = { kind: "snapshot"; key: MonthKey } | { kind: "latest" };

type SnapshotCacheEntry =
  | {
      exists: true;
      snapshot: MembersSummaryDoc;
      tsMs: number | null;
    }
  | {
      exists: false;
    };

type MonthComparison = {
  monthKey: MonthKey;
  start: { kind: "snapshot"; key: MonthKey };
  end: SnapshotEndpoint;
  fromTsMs: number;
  toTsMs: number;
};

type GuildMonthlyLoadResult = {
  opts: MonthOption[];
  comparisonsByMonth: Record<string, MonthComparison>;
};

const guildMonthlyLoadInFlight = new Map<string, Promise<GuildMonthlyLoadResult>>();
const guildMonthlySnapshotCache = new Map<string, Record<string, SnapshotCacheEntry>>();

/**
 * Container: holt Monats-Snapshots aus Firestore
 * und bef\u00fcllt den UI-Presenter. Ohne vorhandene Daten -> Fallback "-" und leere Tabellen.
 */
const GuildMonthlyProgressTabContainer: React.FC<Props> = ({
  guildId,
  guildName,
  guildServer,
  seedData,
}) => {
  const [months, setMonths] = useState<MonthOption[] | null>(null);

  const comparisonCache = useRef<Record<string, MonthComparison>>({});
  const snapshotCache = useRef<Record<string, SnapshotCacheEntry>>({});
  const renderTokenRef = useRef(0);

  const [uiData, setUiData] = useState<GuildMonthlyProgressData>(() =>
    emptyUiData(guildId, guildName, guildServer)
  );

  async function renderComparisonForMonth(
    key: string,
    monthOptions: MonthOption[] | null | undefined,
  ): Promise<void> {
    const token = ++renderTokenRef.current;
    const comparison = comparisonCache.current[key];
    if (!comparison) {
      setUiData(
        emptyUiData(guildId, guildName, guildServer, {
          currentMonthKey: key,
          months: monthOptions ?? undefined,
        })
      );
      return;
    }

    const [startEntry, endEntry] = await Promise.all([
      loadSnapshotEntryByEndpoint(guildId, comparison.start, snapshotCache),
      loadSnapshotEntryByEndpoint(guildId, comparison.end, snapshotCache),
    ]);
    if (token !== renderTokenRef.current) return;

    const startSnapshot = startEntry.exists ? startEntry.snapshot : null;
    const endSnapshot = endEntry.exists ? endEntry.snapshot : null;
    if (!startSnapshot || !endSnapshot) {
      setUiData(
        emptyUiData(guildId, guildName, guildServer, {
          currentMonthKey: key,
          months: monthOptions ?? undefined,
        })
      );
      return;
    }

    const progress = buildProgressFromSnapshots(comparison.monthKey, startSnapshot, endSnapshot, guildServer);
    setUiData(
      progressToUiData(progress, {
        guildId,
        guildName,
        guildServer,
        currentMonthKey: key,
        months: monthOptions ?? undefined,
      })
    );
  }

  useEffect(() => {
    let cancelled = false;
    const guildKey = guildId.trim().toLowerCase();
    renderTokenRef.current += 1;
    comparisonCache.current = {};
    const rememberedSnapshotCache = guildKey ? guildMonthlySnapshotCache.get(guildKey) ?? {} : {};
    const seededSnapshotCache = { ...rememberedSnapshotCache };
    mergeSeedDataIntoSnapshotCache(seededSnapshotCache, seedData ?? undefined);
    snapshotCache.current = seededSnapshotCache;
    if (guildKey) guildMonthlySnapshotCache.set(guildKey, snapshotCache.current);

    const applyLoadedResult = (result: GuildMonthlyLoadResult) => {
      comparisonCache.current = { ...result.comparisonsByMonth };
      const opts = result.opts;
      if (!opts.length) {
        setMonths(null);
        setUiData(emptyUiData(guildId, guildName, guildServer));
        return;
      }
      setMonths(opts);
      const firstKey = opts[0].key;
      void renderComparisonForMonth(firstKey, opts);
    };

    const fetchMonths = async (): Promise<GuildMonthlyLoadResult> => {
      return loadMonthComparisonsForGuild(guildId, snapshotCache);
    };

    async function loadMonthsAndMaybeProgress() {
      let existing: Promise<GuildMonthlyLoadResult> | undefined;
      try {
        if (!guildKey) {
          setMonths(null);
          setUiData(emptyUiData(guildId, guildName, guildServer));
          return;
        }

        existing = guildMonthlyLoadInFlight.get(guildKey);
        const promise = existing ?? fetchMonths();
        if (!existing) guildMonthlyLoadInFlight.set(guildKey, promise);

        const result = await promise;
        if (!cancelled) applyLoadedResult(result);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setMonths(null);
          setUiData(emptyUiData(guildId, guildName, guildServer));
        }
      } finally {
        if (!existing) guildMonthlyLoadInFlight.delete(guildKey);
      }
    }

    loadMonthsAndMaybeProgress();
    return () => {
      cancelled = true;
      renderTokenRef.current += 1;
    };
  }, [guildId, guildName, guildServer, seedData]);

  async function handleMonthChange(key: string) {
    await renderComparisonForMonth(key, months);
  }

  // Presenter
  return (
    <GuildMonthlyProgressTab
      data={uiData}
      onMonthChange={handleMonthChange}
    />
  );
};

export default GuildMonthlyProgressTabContainer;

/* ====================== Helpers ====================== */

const SNAPSHOT_PREFIX = "members_summary__";
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
type MainBucketKey = "str" | "dex" | "int" | "other";

type ProgressMemberRow = {
  playerId: string;
  name: string;
  classLabel: string;
  level: number | null;
  bucket: MainBucketKey;
  xpTotal: number | null;
  xpDelta: number | null;
  baseMain: number | null;
  mainDelta: number | null;
  conBase: number | null;
  conDelta: number | null;
  sumBaseTotal: number | null;
  sumBaseDelta: number | null;
  mainAndConTotal: number | null;
  totalStats: number | null;
  totalDelta: number | null;
};

type BucketRanking = {
  key: MainBucketKey;
  label: string;
  rows: ProgressMemberRow[];
};

const BUCKET_ORDER: Array<{ key: MainBucketKey; label: string }> = [
  { key: "str", label: "Strength Classes" },
  { key: "dex", label: "Dexterity Classes" },
  { key: "int", label: "Intelligence Classes" },
  { key: "other", label: "Other / Unknown" },
];

const CLASS_TO_BUCKET: Record<string, MainBucketKey> = {
  warrior: "str",
  berserker: "str",
  "battle-mage": "str",
  paladin: "str",
  scout: "dex",
  assassin: "dex",
  "demon-hunter": "dex",
  "plague-doctor": "dex",
  mage: "int",
  druid: "int",
  bard: "int",
  necromancer: "int",
};

const normalizeSnapshot = (raw: any): MembersSummaryDoc => {
  const members = Array.isArray(raw?.members) ? raw.members : [];
  const normalizedMembers = members.map((m: any) => ({
    ...m,
    playerId: String(m?.playerId ?? m?.id ?? "").trim(),
  }));
  return {
    guildId: String(raw?.guildId ?? "").trim(),
    updatedAt: raw?.updatedAt ?? null,
    updatedAtMs: typeof raw?.updatedAtMs === "number" ? raw.updatedAtMs : null,
    timestamp: typeof raw?.timestamp === "number" ? raw.timestamp : null,
    members: normalizedMembers,
  };
};

const getMemberScanRange = (members: any[]): { minMs: number; maxMs: number } | null => {
  const values = members
    .map((m) => m?.lastScanMs)
    .filter((v: any): v is number => typeof v === "number" && Number.isFinite(v));
  if (!values.length) return null;
  return { minMs: Math.min(...values), maxMs: Math.max(...values) };
};

const LATEST_DOC_ID = "members_summary";
const LATEST_CACHE_KEY = "__latest__";

const monthLabelFromKey = (key: MonthKey) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString("de-DE", {
    month: "short",
    year: "numeric",
  });

const toSnapshotTsMsFromRaw = (raw: any): number | null => {
  const updatedAtMs = Number(raw?.updatedAtMs);
  if (Number.isFinite(updatedAtMs) && updatedAtMs > 0) return updatedAtMs;

  const timestamp = Number(raw?.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  }

  const updatedAt = raw?.updatedAt;
  if (updatedAt && typeof updatedAt === "object" && Number.isFinite((updatedAt as any).seconds)) {
    return Number((updatedAt as any).seconds) * 1000;
  }
  if (typeof updatedAt === "string") {
    const parsed = Date.parse(updatedAt);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};

const toSnapshotTsMs = (snapshot: MembersSummaryDoc): number | null => {
  const rawTs = toSnapshotTsMsFromRaw(snapshot);
  if (rawTs != null) return rawTs;
  const range = getMemberScanRange(snapshot.members || []);
  return range?.maxMs ?? range?.minMs ?? null;
};

const toMonthKeyFromMs = (ms: number): MonthKey => {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}` as MonthKey;
};

const shiftMonthKey = (key: MonthKey, deltaMonths: number): MonthKey | null => {
  if (!MONTH_KEY_RE.test(key)) return null;
  const [yearRaw, monthRaw] = key.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const shifted = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  const next = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
  return MONTH_KEY_RE.test(next) ? (next as MonthKey) : null;
};

const getNextMonthKey = (key: MonthKey): MonthKey | null => shiftMonthKey(key, 1);

const toCacheKey = (endpoint: SnapshotEndpoint): string =>
  endpoint.kind === "latest" ? LATEST_CACHE_KEY : endpoint.key;

const toSnapshotDocPath = (guildId: string, endpoint: SnapshotEndpoint): string =>
  endpoint.kind === "latest"
    ? `guilds/${guildId}/snapshots/${LATEST_DOC_ID}`
    : `guilds/${guildId}/snapshots/${SNAPSHOT_PREFIX}${endpoint.key}`;

const buildMonthOptionFromComparison = (comparison: MonthComparison): MonthOption => ({
  key: comparison.monthKey,
  label: monthLabelFromKey(comparison.monthKey),
  fromISO: new Date(comparison.fromTsMs).toISOString(),
  toISO: new Date(comparison.toTsMs).toISOString(),
  daysSpan: Math.floor((comparison.toTsMs - comparison.fromTsMs) / 86400000),
  available: true,
});

const seedSnapshotEntryFromRaw = (raw: any): SnapshotCacheEntry | null => {
  if (!raw || typeof raw !== "object") return null;
  const snapshot = normalizeSnapshot(raw);
  return {
    exists: true,
    snapshot,
    tsMs: toSnapshotTsMs(snapshot),
  };
};

const mergeSeedDataIntoSnapshotCache = (
  cache: Record<string, SnapshotCacheEntry>,
  seedData?: GuildMonthlyProgressSeedData,
) => {
  if (!seedData) return;
  const latestSeed = seedSnapshotEntryFromRaw(seedData.latestSummary);
  if (latestSeed) {
    cache[LATEST_CACHE_KEY] = latestSeed;
  } else if (seedData.latestSummaryMissing) {
    cache[LATEST_CACHE_KEY] = { exists: false };
  }
  const monthSnapshotsByKey = seedData.monthSnapshotsByKey ?? {};
  for (const [monthKey, monthRaw] of Object.entries(monthSnapshotsByKey)) {
    if (!MONTH_KEY_RE.test(monthKey)) continue;
    const seeded = seedSnapshotEntryFromRaw(monthRaw);
    if (!seeded) continue;
    cache[monthKey] = seeded;
  }
  for (const monthKey of seedData.knownMissingMonthKeys ?? []) {
    if (!MONTH_KEY_RE.test(monthKey)) continue;
    if (Object.prototype.hasOwnProperty.call(cache, monthKey)) continue;
    cache[monthKey] = { exists: false };
  }
};

const loadSnapshotEntryByEndpoint = async (
  guildId: string,
  endpoint: SnapshotEndpoint,
  cacheRef: React.MutableRefObject<Record<string, SnapshotCacheEntry>>,
  scope?: FirestoreTraceScope,
): Promise<SnapshotCacheEntry> => {
  const cacheKey = toCacheKey(endpoint);
  if (Object.prototype.hasOwnProperty.call(cacheRef.current, cacheKey)) {
    return cacheRef.current[cacheKey];
  }

  const ownScope = scope ?? beginReadScope("GuildMonthly:snapshotDoc");
  const path = toSnapshotDocPath(guildId, endpoint);
  const ref = doc(db, path);
  try {
    const snap = await traceGetDoc(ownScope, ref, () => getDoc(ref));
    if (!snap.exists()) {
      const miss: SnapshotCacheEntry = { exists: false };
      cacheRef.current[cacheKey] = miss;
      return miss;
    }
    const hit = seedSnapshotEntryFromRaw(snap.data()) ?? { exists: false as const };
    cacheRef.current[cacheKey] = hit;
    return hit;
  } catch (error) {
    console.error(error);
    const miss: SnapshotCacheEntry = { exists: false };
    cacheRef.current[cacheKey] = miss;
    return miss;
  } finally {
    if (!scope) endReadScope(ownScope);
  }
};

const loadMonthComparisonsForGuild = async (
  guildId: string,
  snapshotCacheRef: React.MutableRefObject<Record<string, SnapshotCacheEntry>>,
): Promise<GuildMonthlyLoadResult> => {
  const scope: FirestoreTraceScope = beginReadScope("GuildMonthly:months");
  try {
    const latestEntry = await loadSnapshotEntryByEndpoint(
      guildId,
      { kind: "latest" },
      snapshotCacheRef,
      scope ?? undefined,
    );

    const latestTsMs = latestEntry.exists ? latestEntry.tsMs : null;
    const latestMonthKey = latestTsMs != null ? toMonthKeyFromMs(latestTsMs) : null;
    if (latestMonthKey) {
      await loadSnapshotEntryByEndpoint(
        guildId,
        { kind: "snapshot", key: latestMonthKey },
        snapshotCacheRef,
        scope ?? undefined,
      );
    }

    const comparisonsByMonth: Record<string, MonthComparison> = {};
    const opts: MonthOption[] = [];
    const knownMonthKeys = Object.keys(snapshotCacheRef.current)
      .filter((key): key is MonthKey => MONTH_KEY_RE.test(key))
      .filter((key) => snapshotCacheRef.current[key]?.exists === true)
      .sort();

    for (const monthKey of knownMonthKeys) {
      const startEntry = snapshotCacheRef.current[monthKey];
      if (!startEntry?.exists || startEntry.tsMs == null) continue;
      const startTsMs = startEntry.tsMs;

      const nextKey = getNextMonthKey(monthKey);
      let nextEntry: SnapshotCacheEntry | null = null;
      if (nextKey) {
        nextEntry = snapshotCacheRef.current[nextKey] ?? null;
        if (!nextEntry) {
          nextEntry = await loadSnapshotEntryByEndpoint(
            guildId,
            { kind: "snapshot", key: nextKey },
            snapshotCacheRef,
            scope ?? undefined,
          );
        }
      }

      let end: SnapshotEndpoint | null = null;
      let endTsMs: number | null = null;

      if (nextKey && nextEntry?.exists && nextEntry.tsMs != null && nextEntry.tsMs > startTsMs) {
        end = { kind: "snapshot", key: nextKey };
        endTsMs = nextEntry.tsMs;
      } else if (latestTsMs != null && latestTsMs > startTsMs) {
        end = { kind: "latest" };
        endTsMs = latestTsMs;
      }

      if (!end || endTsMs == null || endTsMs <= startTsMs) continue;

      const comparison: MonthComparison = {
        monthKey,
        start: { kind: "snapshot", key: monthKey },
        end,
        fromTsMs: startTsMs,
        toTsMs: endTsMs,
      };
      comparisonsByMonth[monthKey] = comparison;
      opts.push(buildMonthOptionFromComparison(comparison));
    }

    opts.sort((a, b) => (a.key < b.key ? 1 : -1));
    return { opts, comparisonsByMonth };
  } finally {
    endReadScope(scope);
  }
};

const toNum = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const diffOrNull = (current: number | null, previous: number | null): number | null =>
  current != null && previous != null ? current - previous : null;

const toMainBucket = (classLabel: string | null | undefined): MainBucketKey => {
  const key = canonClassKey(classLabel);
  if (!key) return "other";
  return CLASS_TO_BUCKET[key] ?? "other";
};

const topBy = (
  rows: ProgressMemberRow[],
  pick: (row: ProgressMemberRow) => number | null,
  limit: number,
): ProgressMemberRow[] =>
  rows
    .filter((row) => pick(row) != null)
    .sort((a, b) => (pick(b) ?? Number.NEGATIVE_INFINITY) - (pick(a) ?? Number.NEGATIVE_INFINITY))
    .slice(0, limit);

const topPerBucket = (
  rows: ProgressMemberRow[],
  pick: (row: ProgressMemberRow) => number | null,
  limitPerBucket: number,
): BucketRanking[] =>
  BUCKET_ORDER.map(({ key, label }) => ({
    key,
    label,
    rows: topBy(
      rows.filter((row) => row.bucket === key),
      pick,
      limitPerBucket,
    ),
  })).filter((bucket) => bucket.rows.length > 0);

const buildProgressFromSnapshots = (
  monthKey: MonthKey,
  start: MembersSummaryDoc,
  end: MembersSummaryDoc,
  guildServer?: string | null,
) => {
  const fromMs = toSnapshotTsMs(start);
  const toMs = toSnapshotTsMs(end);
  const spanDays = fromMs != null && toMs != null ? Math.floor((toMs - fromMs) / 86400000) : null;
  const available = Boolean(fromMs != null && toMs != null && toMs > fromMs);
  const status: { available: boolean; reason?: "INSUFFICIENT_DATA" | "SPAN_GT_40D" } = { available };
  if (!available) {
    status.reason = "INSUFFICIENT_DATA";
  }

  const base = {
    meta: {
      monthKey,
      label: monthLabelFromKey(monthKey),
      fromISO: fromMs != null ? new Date(fromMs).toISOString() : null,
      toISO: toMs != null ? new Date(toMs).toISOString() : new Date().toISOString(),
      fromTs: fromMs != null ? Math.floor(fromMs / 1000) : null,
      toTs: toMs != null ? Math.floor(toMs / 1000) : Math.floor(Date.now() / 1000),
      daysSpan: spanDays,
      guildId: end.guildId || start.guildId || "",
      server: guildServer ?? null,
    },
    status,
  };

  const prevMap = new Map<string, any>();
  for (const m of start?.members || []) {
    if (!m?.playerId) continue;
    prevMap.set(m.playerId, m);
  }

  const mostBaseGained: ProgressMemberRow[] = [];
  const sumBaseStats: ProgressMemberRow[] = [];
  const highestBaseStats: ProgressMemberRow[] = [];
  const highestTotalStats: ProgressMemberRow[] = [];
  const mainAndCon: ProgressMemberRow[] = [];

  for (const m of end.members || []) {
    if (!m?.playerId) continue;
    const f = prevMap.get(m.playerId) || null;

    const baseMain = toNum(m.baseMain);
    const conBase = toNum(m.conBase);
    const sumBase =
      toNum(m.sumBaseTotal) ?? (baseMain != null && conBase != null ? baseMain + conBase : null);
    const total = toNum(m.totalStats);
    const xpTotal = toNum(m.xpTotal);

    const prevBaseMain = toNum(f?.baseMain);
    const prevConBase = toNum(f?.conBase);
    const prevSumBase =
      toNum(f?.sumBaseTotal) ??
      (prevBaseMain != null && prevConBase != null ? prevBaseMain + prevConBase : null);
    const prevTotal = toNum(f?.totalStats);
    const prevXpTotal = toNum(f?.xpTotal);

    const row: ProgressMemberRow = {
      playerId: m.playerId,
      name: String(m.name ?? "-"),
      classLabel: String(m.class ?? "—"),
      level: toNum(m.level),
      bucket: toMainBucket(m.class),
      xpTotal,
      xpDelta: diffOrNull(xpTotal, prevXpTotal),
      baseMain,
      mainDelta: diffOrNull(baseMain, prevBaseMain),
      conBase,
      conDelta: diffOrNull(conBase, prevConBase),
      sumBaseTotal: sumBase,
      sumBaseDelta: diffOrNull(sumBase, prevSumBase),
      mainAndConTotal: baseMain != null && conBase != null ? baseMain + conBase : null,
      totalStats: total,
      totalDelta: diffOrNull(total, prevTotal),
    };

    mostBaseGained.push(row);
    sumBaseStats.push(row);
    highestBaseStats.push(row);
    highestTotalStats.push(row);
    mainAndCon.push(row);
  }

  const mostBaseGainedByBucket = topPerBucket(mostBaseGained, (row) => row.mainDelta, 5);
  const mainAndConByBucket = topPerBucket(mainAndCon, (row) => row.mainAndConTotal, 5);

  return {
    ...base,
    xpRanking: topBy(mostBaseGained, (row) => row.xpTotal, 10),
    mainGainedByBucket: mostBaseGainedByBucket,
    conGained: topBy(mostBaseGained, (row) => row.conDelta, 10),
    sumBaseGained: topBy(sumBaseStats, (row) => row.sumBaseDelta, 10),
    mainAndConByBucket,
    sumBaseHighest: topBy(highestBaseStats, (row) => row.sumBaseTotal, 10),
    highestTotalStats: topBy(highestTotalStats, (row) => row.totalStats, 10),
  };
};

function emptyUiData(
  guildId: string,
  guildName: string,
  guildServer?: string | null,
  extra?: Partial<Pick<GuildMonthlyProgressData["header"], "currentMonthKey" | "months">>
): GuildMonthlyProgressData {
  return {
    header: {
      title: `${guildName} - Monthly Progress`,
      monthRange: "-", // Fallback-Anzeige
      emblemUrl: guildIconUrlByIdentifier(guildId, 512) || undefined,
      currentMonthKey: extra?.currentMonthKey,
      months: extra?.months,
    },
    topRow: {
      xpBlock: mkBlock("XP / Monthly XP", guildServer ? `Server ${guildServer}` : undefined),
      rightPlaceholder: {
        title: "Reserved",
        subtitle: "No data configured",
      },
    },
    sections: {
      mostBaseStatsGained: [mkBlock("Main"), mkBlock("Con"), mkBlock("Sum Base Stats")],
      highestBaseStats: [mkBlock("Main & Con"), mkBlock("Sum Base Stats"), mkBlock("Highest Total Stats")],
    },
  };
}

function mkBlock(title: string, subtitle?: string): TableBlock {
  return {
    title,
    subtitle,
    columns: [
      { key: "rank", label: "#", width: 36, align: "right" },
      { key: "name", label: "Name" },
    ],
    rows: [],
  };
}

/**
 * Mappt das gespeicherte Monatsdokument auf die Presenter-Struktur.
 * Erwartet die lokal abgeleiteten Rankings aus buildProgressFromSnapshots.
 */
function progressToUiData(
  progress: any,
  ctx: {
    guildId: string;
    guildName: string;
    guildServer?: string | null;
    currentMonthKey: string;
    months?: MonthOption[];
  }
): GuildMonthlyProgressData {
  const header: GuildMonthlyProgressData["header"] = {
    title: `${ctx.guildName} - Monthly Progress`,
    monthRange: undefined, // Dropdown uebernimmt
    emblemUrl: guildIconUrlByIdentifier(ctx.guildId, 512) || undefined,
    months: ctx.months,
    currentMonthKey: ctx.currentMonthKey,
  };

  const colRankName = [
    { key: "rank", label: "#", width: 36, align: "right" as const },
    { key: "name", label: "Name" },
  ];

  const toRows = (
    rows: ProgressMemberRow[],
    map: (row: ProgressMemberRow, index: number) => TableRow,
  ): TableRow[] => rows.map((row, index) => ({ id: row.playerId ?? index, rank: index + 1, ...map(row, index) }));

  const toGroups = (
    groups: BucketRanking[] | undefined,
    map: (row: ProgressMemberRow, index: number) => TableRow,
  ): TableGroup[] =>
    (groups ?? []).map((group) => ({
      key: group.key,
      label: group.label,
      rows: toRows(group.rows, map),
    }));

  const xpBlock: TableBlock = {
    title: "XP / Monthly XP",
    subtitle: ctx.guildServer ? `Server ${ctx.guildServer}` : undefined,
    columns: [
      ...colRankName,
      { key: "level", label: "Lvl", width: 54, align: "right", format: "num" as const },
      { key: "xp", label: "XP", width: 110, align: "right", format: "num" as const },
      { key: "delta", label: "+XP", width: 84, align: "right", format: "num" as const },
    ],
    rows: toRows(progress?.xpRanking ?? [], (r) => ({
      name: r.name,
      class: r.classLabel,
      level: r.level,
      xp: r.xpTotal,
      delta: r.xpDelta,
    })),
  };

  const mostBaseStatsGained: TableBlock[] = [
    {
      title: "Main",
      subtitle: "Top 5 per Main-Stat bucket",
      columns: [
        ...colRankName,
        { key: "main", label: "Main", width: 92, align: "right", format: "num" as const },
        { key: "delta", label: "+Main", width: 84, align: "right", format: "num" as const },
      ],
      rows: [],
      groups: toGroups(progress?.mainGainedByBucket, (r) => ({
        name: r.name,
        class: r.classLabel,
        main: r.baseMain,
        delta: r.mainDelta,
      })),
    },
    {
      title: "Con",
      subtitle: "Top 10",
      columns: [
        ...colRankName,
        { key: "con", label: "Con", width: 92, align: "right", format: "num" as const },
        { key: "delta", label: "+Con", width: 84, align: "right", format: "num" as const },
      ],
      rows: toRows(progress?.conGained ?? [], (r) => ({
        name: r.name,
        class: r.classLabel,
        con: r.conBase,
        delta: r.conDelta,
      })),
    },
    {
      title: "Sum Base Stats",
      subtitle: "Top 10",
      columns: [
        ...colRankName,
        { key: "level", label: "Lvl", width: 54, align: "right", format: "num" as const },
        { key: "sum", label: "Sum", width: 104, align: "right", format: "num" as const },
        { key: "delta", label: "+Sum", width: 84, align: "right", format: "num" as const },
      ],
      rows: toRows(progress?.sumBaseGained ?? [], (r) => ({
        name: r.name,
        class: r.classLabel,
        level: r.level,
        sum: r.sumBaseTotal,
        delta: r.sumBaseDelta,
      })),
    },
  ];

  const highestBaseStats: TableBlock[] = [
    {
      title: "Main & Con",
      subtitle: "Top 5 per Main-Stat bucket",
      columns: [
        ...colRankName,
        { key: "main", label: "Main", width: 88, align: "right", format: "num" as const },
        { key: "con", label: "Con", width: 88, align: "right", format: "num" as const },
      ],
      rows: [],
      groups: toGroups(progress?.mainAndConByBucket, (r) => ({
        name: r.name,
        class: r.classLabel,
        main: r.baseMain,
        con: r.conBase,
      })),
    },
    {
      title: "Sum Base Stats",
      subtitle: "Top 10",
      columns: [
        ...colRankName,
        { key: "level", label: "Lvl", width: 54, align: "right", format: "num" as const },
        { key: "sum", label: "Sum", width: 110, align: "right", format: "num" as const },
      ],
      rows: toRows(progress?.sumBaseHighest ?? [], (r) => ({
        name: r.name,
        class: r.classLabel,
        level: r.level,
        sum: r.sumBaseTotal,
      })),
    },
    {
      title: "Highest Total Stats",
      subtitle: "Top 10",
      columns: [
        ...colRankName,
        { key: "level", label: "Lvl", width: 54, align: "right", format: "num" as const },
        { key: "total", label: "Total", width: 110, align: "right", format: "num" as const },
        { key: "delta", label: "+Total", width: 84, align: "right", format: "num" as const },
      ],
      rows: toRows(progress?.highestTotalStats ?? [], (r) => ({
        name: r.name,
        class: r.classLabel,
        level: r.level,
        total: r.totalStats,
        delta: r.totalDelta,
      })),
    },
  ];

  return {
    header,
    topRow: {
      xpBlock,
      rightPlaceholder: {
        title: "Reserved",
        subtitle: "Placeholder",
      },
    },
    sections: {
      mostBaseStatsGained,
      highestBaseStats,
    },
  };
}
