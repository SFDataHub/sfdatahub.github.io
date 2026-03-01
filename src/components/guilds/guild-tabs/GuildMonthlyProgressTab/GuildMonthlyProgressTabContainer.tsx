import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import {
  beginReadScope,
  endReadScope,
  traceGetDoc,
  traceGetDocs,
  type FirestoreTraceScope,
} from "../../../../lib/debug/firestoreReadTrace";
import GuildMonthlyProgressTab from "./GuildMonthlyProgressTab";
import type {
  GuildMonthlyProgressData,
  MonthOption,
  TableBlock,
} from "./GuildMonthlyProgressTab.types";
import { guildIconUrlByIdentifier } from "../../../../data/guilds";
import type { MembersSummaryDoc, MonthKey } from "../../../../lib/guilds/monthly/types";

type Props = {
  guildId: string;
  guildName: string;
  guildServer?: string | null;
};

type GuildMonthlyLoadResult = {
  opts: MonthOption[];
  snapshotsByMonth: Record<string, MembersSummaryDoc | null>;
};

const guildMonthlyLoadInFlight = new Map<string, Promise<GuildMonthlyLoadResult>>();
const guildMonthlyLoadCache = new Map<string, GuildMonthlyLoadResult>();

/**
 * Container: holt Monats-Snapshots aus Firestore
 * und bef\u00fcllt den UI-Presenter. Ohne vorhandene Daten -> Fallback "-" und leere Tabellen.
 */
const GuildMonthlyProgressTabContainer: React.FC<Props> = ({
  guildId,
  guildName,
  guildServer,
}) => {
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<MonthOption[] | null>(null);
  const [currentMonthKey, setCurrentMonthKey] = useState<string | undefined>(undefined);

  // Cache: Snapshot-Dokumente pro Monat
  const snapshotCache = useRef<Record<string, MembersSummaryDoc | null>>({});

  const [uiData, setUiData] = useState<GuildMonthlyProgressData>(() =>
    emptyUiData(guildId, guildName, guildServer)
  );

  useEffect(() => {
    let cancelled = false;
    const guildKey = guildId.trim().toLowerCase();

    const applyLoadedResult = (result: GuildMonthlyLoadResult) => {
      snapshotCache.current = { ...result.snapshotsByMonth };
      const opts = result.opts;
      if (!opts.length) {
        setMonths(null);
        setCurrentMonthKey(undefined);
        setUiData(emptyUiData(guildId, guildName, guildServer));
        return;
      }
      setMonths(opts);
      const firstKey = opts[0].key;
      setCurrentMonthKey(firstKey);
      const currentSnapshot = snapshotCache.current[firstKey] ?? null;
      const prevKey = getPrevMonthKey(firstKey);
      const prevSnapshot = prevKey ? snapshotCache.current[prevKey] ?? null : null;
      const progress = currentSnapshot
        ? buildProgressFromSnapshots(firstKey as MonthKey, currentSnapshot, prevSnapshot, guildServer)
        : null;
      setUiData(
        progressToUiData(progress, {
          guildId,
          guildName,
          guildServer,
          currentMonthKey: firstKey,
          months: opts,
        })
      );
    };

    const fetchMonths = async (): Promise<GuildMonthlyLoadResult> => {
      const scope: FirestoreTraceScope = beginReadScope("GuildMonthly:months");
      setLoading(true);
      try {
        const monthCol = collection(db, `guilds/${guildId}/snapshots`);
        const monthSnaps = await traceGetDocs(scope, { path: monthCol.path }, () => getDocs(monthCol));
        const opts: MonthOption[] = [];
        const snapshotsByMonth: Record<string, MembersSummaryDoc | null> = {};
        for (const mDoc of monthSnaps.docs) {
          const key = extractMonthKey(mDoc.id);
          if (!key) continue;
          const raw = mDoc.data() as any;
          if (!raw) continue;
          const snapshot = normalizeSnapshot(raw);
          snapshotsByMonth[key] = snapshot;
          const option = buildMonthOption(key, snapshot);
          opts.push(option);
        }
        opts.sort((a, b) => (a.key < b.key ? 1 : -1));
        return { opts, snapshotsByMonth };
      } finally {
        endReadScope(scope);
      }
    };

    async function loadMonthsAndMaybeProgress() {
      let existing: Promise<GuildMonthlyLoadResult> | undefined;
      try {
        if (!guildKey) {
          setMonths(null);
          setCurrentMonthKey(undefined);
          setUiData(emptyUiData(guildId, guildName, guildServer));
          setLoading(false);
          return;
        }

        const cached = guildMonthlyLoadCache.get(guildKey);
        if (cached) {
          if (!cancelled) applyLoadedResult(cached);
          setLoading(false);
          return;
        }

        existing = guildMonthlyLoadInFlight.get(guildKey);
        const promise = existing ?? fetchMonths();
        if (!existing) guildMonthlyLoadInFlight.set(guildKey, promise);

        const result = await promise;
        guildMonthlyLoadCache.set(guildKey, result);
        if (!cancelled) applyLoadedResult(result);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setMonths(null);
          setCurrentMonthKey(undefined);
          setUiData(emptyUiData(guildId, guildName, guildServer));
        }
      } finally {
        if (!existing) guildMonthlyLoadInFlight.delete(guildKey);
        if (!cancelled) setLoading(false);
      }
    }

    loadMonthsAndMaybeProgress();
    return () => {
      cancelled = true;
    };
  }, [guildId, guildName, guildServer]);

  async function handleMonthChange(key: string) {
    setCurrentMonthKey(key);

    const currentSnapshot = await loadSnapshotForMonth(guildId, key, snapshotCache);
    if (!currentSnapshot) {
      // Monat existiert nicht -> leer rendern, aber Dropdown bleibt
      setUiData(
        emptyUiData(guildId, guildName, guildServer, {
          currentMonthKey: key,
          months: months ?? undefined,
        })
      );
      return;
    }

    const prevKey = getPrevMonthKey(key);
    const prevSnapshot = prevKey
      ? await loadSnapshotForMonth(guildId, prevKey, snapshotCache)
      : null;
    const progress = buildProgressFromSnapshots(key as MonthKey, currentSnapshot, prevSnapshot, guildServer);
    setUiData(
      progressToUiData(progress, {
        guildId,
        guildName,
        guildServer,
        currentMonthKey: key,
        months: months ?? undefined,
      })
    );
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

const extractMonthKey = (docId: string): MonthKey | null => {
  if (!docId.startsWith(SNAPSHOT_PREFIX)) return null;
  const key = docId.slice(SNAPSHOT_PREFIX.length);
  return MONTH_KEY_RE.test(key) ? (key as MonthKey) : null;
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

const buildMonthOption = (key: MonthKey, snapshot: MembersSummaryDoc): MonthOption => {
  const range = getMemberScanRange(snapshot.members || []);
  const fallbackMs = typeof snapshot.updatedAtMs === "number" ? snapshot.updatedAtMs : null;
  const minMs = range?.minMs ?? fallbackMs;
  const maxMs = range?.maxMs ?? fallbackMs;
  const fromISO = minMs ? new Date(minMs).toISOString() : new Date(`${key}-01T00:00:00Z`).toISOString();
  const toISO = maxMs ? new Date(maxMs).toISOString() : new Date(`${key}-28T00:00:00Z`).toISOString();
  const span = minMs && maxMs ? Math.floor((maxMs - minMs) / 86400000) : 0;
  const available = Boolean(minMs && maxMs && span <= 40);
  const label = new Date(`${key}-01T00:00:00Z`).toLocaleString("de-DE", {
    month: "short",
    year: "numeric",
  });
  return {
    key,
    label,
    fromISO,
    toISO,
    daysSpan: span,
    available,
    reason: available ? undefined : minMs && maxMs ? "SPAN_GT_40D" : "INSUFFICIENT_DATA",
  };
};

const getPrevMonthKey = (key: string): MonthKey | null => {
  if (!MONTH_KEY_RE.test(key)) return null;
  const [yearRaw, monthRaw] = key.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  return MONTH_KEY_RE.test(prevKey) ? (prevKey as MonthKey) : null;
};

const loadSnapshotForMonth = async (
  guildId: string,
  key: string,
  cacheRef: React.MutableRefObject<Record<string, MembersSummaryDoc | null>>,
): Promise<MembersSummaryDoc | null> => {
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(cacheRef.current, key)) {
    return cacheRef.current[key] ?? null;
  }
  const scope: FirestoreTraceScope = beginReadScope("GuildMonthly:monthDoc");
  try {
    const ref = doc(db, `guilds/${guildId}/snapshots/${SNAPSHOT_PREFIX}${key}`);
    const snap = await traceGetDoc(scope, ref, () => getDoc(ref));
    if (!snap.exists()) {
      cacheRef.current[key] = null;
      return null;
    }
    const snapshot = normalizeSnapshot(snap.data());
    cacheRef.current[key] = snapshot;
    return snapshot;
  } catch (e) {
    console.error(e);
    cacheRef.current[key] = null;
    return null;
  } finally {
    endReadScope(scope);
  }
};

const buildProgressFromSnapshots = (
  monthKey: MonthKey,
  current: MembersSummaryDoc,
  prev: MembersSummaryDoc | null,
  guildServer?: string | null,
) => {
  const range = getMemberScanRange(current.members || []);
  const fallbackMs = typeof current.updatedAtMs === "number" ? current.updatedAtMs : null;
  const minMs = range?.minMs ?? fallbackMs;
  const maxMs = range?.maxMs ?? fallbackMs;
  const spanDays = minMs && maxMs ? Math.floor((maxMs - minMs) / 86400000) : null;
  const available = Boolean(minMs && maxMs && spanDays != null && spanDays <= 40);
  const status: { available: boolean; reason?: "INSUFFICIENT_DATA" | "SPAN_GT_40D" } = { available };
  if (!available) {
    status.reason = minMs && maxMs ? "SPAN_GT_40D" : "INSUFFICIENT_DATA";
  }

  const base = {
    meta: {
      monthKey,
      label: new Date(`${monthKey}-01T00:00:00Z`).toLocaleString("de-DE", {
        month: "short",
        year: "numeric",
      }),
      fromISO: minMs ? new Date(minMs).toISOString() : null,
      toISO: maxMs ? new Date(maxMs).toISOString() : new Date().toISOString(),
      fromTs: minMs ? Math.floor(minMs / 1000) : null,
      toTs: maxMs ? Math.floor(maxMs / 1000) : Math.floor(Date.now() / 1000),
      daysSpan: spanDays,
      guildId: current.guildId || "",
      server: guildServer ?? null,
    },
    status,
  };

  const prevMap = new Map<string, any>();
  for (const m of prev?.members || []) {
    if (!m?.playerId) continue;
    prevMap.set(m.playerId, m);
  }

  const mostBaseGained: any[] = [];
  const sumBaseStats: any[] = [];
  const highestBaseStats: any[] = [];
  const highestTotalStats: any[] = [];
  const mainAndCon: any[] = [];

  for (const m of current.members || []) {
    if (!m?.playerId) continue;
    const f = prevMap.get(m.playerId) || null;

    const baseLatest = m.sumBaseTotal ?? null;
    const baseFirst = f?.sumBaseTotal ?? null;
    const baseDelta =
      baseLatest != null && baseFirst != null ? baseLatest - baseFirst : null;

    const totalLatest = m.totalStats ?? null;
    const totalFirst = f?.totalStats ?? null;
    const totalDelta =
      totalLatest != null && totalFirst != null ? totalLatest - totalFirst : null;

    mostBaseGained.push({
      playerId: m.playerId,
      name: m.name ?? null,
      class: m.class ?? null,
      levelLatest: m.level ?? null,
      baseLatest,
      baseDelta,
    });

    sumBaseStats.push({
      playerId: m.playerId,
      name: m.name ?? null,
      base: baseLatest,
      stamDelta: null,
      shoDelta: null,
    });

    highestBaseStats.push({
      playerId: m.playerId,
      name: m.name ?? null,
      stats: baseLatest,
      delta: baseDelta,
    });

    highestTotalStats.push({
      playerId: m.playerId,
      name: m.name ?? null,
      total: totalLatest,
      delta: totalDelta,
    });

    mainAndCon.push({
      playerId: m.playerId,
      name: m.name ?? null,
      class: m.class ?? null,
      stats: m.baseMain ?? null,
      delta:
        f?.baseMain != null && m.baseMain != null ? m.baseMain - f.baseMain : null,
    });
  }

  mostBaseGained.sort(
    (a, b) => (b.baseDelta ?? -Infinity) - (a.baseDelta ?? -Infinity)
  );
  highestBaseStats.sort(
    (a, b) => (b.stats ?? -Infinity) - (a.stats ?? -Infinity)
  );
  highestTotalStats.sort(
    (a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity)
  );
  sumBaseStats.sort((a, b) => (b.base ?? -Infinity) - (a.base ?? -Infinity));
  mainAndCon.sort((a, b) => (b.stats ?? -Infinity) - (a.stats ?? -Infinity));

  return {
    ...base,
    mostBaseGained: mostBaseGained.slice(0, 50),
    sumBaseStats: sumBaseStats.slice(0, 50),
    highestBaseStats: highestBaseStats.slice(0, 50),
    highestTotalStats: highestTotalStats.slice(0, 50),
    mainAndCon: mainAndCon.slice(0, 50),
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
      centerCaption: "Most Base Stats gained",
      currentMonthKey: extra?.currentMonthKey,
      months: extra?.months,
    },
    panels: {
      leftImageUrl: undefined,
      rightImageUrl: undefined,
    },
    tablesTop: [
      mkBlock("Most Base Stats gained", guildServer ? `Server ${guildServer}` : undefined),
      mkBlock("Sum Base Stats"),
      mkBlock("Highest Base Stats"),
    ],
    tablesBottom: [
      mkBlock("Main & Con"),
      mkBlock("Sum Base Stats"),
      mkBlock("Highest Base Stats"),
      mkBlock("Highest Total Stats"),
    ],
  };
}

function mkBlock(title: string, subtitle?: string): TableBlock {
  return {
    title,
    subtitle,
    columns: [], // Presenter zeigt "No data", wenn rows leer bleiben
    rows: [],
  };
}

/**
 * Mappt das gespeicherte Monatsdokument auf die Presenter-Struktur.
 * Erwartete Felder (optional):
 * - meta: { fromISO, toISO, daysSpan, label }
 * - status: { available, reason? }
 * - mostBaseGained[], sumBaseStats[], highestBaseStats[], highestTotalStats[], mainAndCon[]
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
  const meta = progress?.meta ?? {};
  const header: GuildMonthlyProgressData["header"] = {
    title: `${ctx.guildName} - Monthly Progress`,
    monthRange: undefined, // Dropdown uebernimmt
    emblemUrl: guildIconUrlByIdentifier(ctx.guildId, 512) || undefined,
    centerCaption: "Most Base Stats gained",
    months: ctx.months,
    currentMonthKey: ctx.currentMonthKey,
  };

  const colRankName = [
    { key: "rank", label: "#", width: 36, align: "right" as const },
    { key: "name", label: "Name" },
  ];

  const topBlocks: TableBlock[] = [
    {
      title: "Most Base Stats gained",
      subtitle: ctx.guildServer ? `Server ${ctx.guildServer}` : undefined,
      columns: [
        ...colRankName,
        { key: "level", label: "Level", width: 70, align: "right", format: "num" as const },
        { key: "base", label: "Base", width: 80, align: "right", format: "num" as const },
        { key: "delta", label: "Delta", width: 70, align: "right", format: "num" as const },
      ],
      rows: (progress?.mostBaseGained ?? []).map((r: any, i: number) => ({
        id: r.playerId ?? i,
        rank: i + 1,
        name: r.name ?? "-",
        level: r.levelLatest ?? r.level ?? null,
        base: r.baseLatest ?? r.base ?? null,
        delta: r.baseDelta ?? r.delta ?? null,
      })),
    },
    {
      title: "Sum Base Stats",
      columns: [
        ...colRankName,
        { key: "base", label: "Base", width: 100, align: "right", format: "num" as const },
        { key: "stam", label: "Stam Delta", width: 90, align: "right", format: "num" as const },
        { key: "sho", label: "Sho Delta", width: 90, align: "right", format: "num" as const },
      ],
      rows: (progress?.sumBaseStats ?? []).map((r: any, i: number) => ({
        id: r.playerId ?? i,
        rank: i + 1,
        name: r.name ?? "-",
        base: r.base ?? null,
        stam: r.stamDelta ?? r.staminaDelta ?? null,
        sho: r.shoDelta ?? r.shootingDelta ?? null,
      })),
    },
    {
      title: "Highest Base Stats",
      columns: [
        ...colRankName,
        { key: "stats", label: "Stats", width: 100, align: "right", format: "num" as const },
        { key: "delta", label: "Delta", width: 80, align: "right", format: "num" as const },
      ],
      rows: (progress?.highestBaseStats ?? []).map((r: any, i: number) => ({
        id: r.playerId ?? i,
        rank: i + 1,
        name: r.name ?? "-",
        stats: r.stats ?? r.base ?? null,
        delta: r.delta ?? null,
      })),
    },
  ];

  const bottomBlocks: TableBlock[] = [
    {
      title: "Main & Con",
      columns: [
        ...colRankName,
        { key: "class", label: "Class", width: 72, align: "center" as const },
        { key: "stats", label: "Stats", width: 100, align: "right", format: "num" as const },
        { key: "delta", label: "Delta", width: 80, align: "right", format: "num" as const },
      ],
      rows: (progress?.mainAndCon ?? []).map((r: any, i: number) => ({
        id: r.playerId ?? i,
        rank: i + 1,
        name: r.name ?? "-",
        class: r.class ?? r.className ?? "",
        stats: r.stats ?? null,
        delta: r.delta ?? null,
      })),
    },
    {
      title: "Sum Base Stats",
      columns: [
        ...colRankName,
        { key: "base", label: "Base", width: 100, align: "right", format: "num" as const },
        { key: "stam", label: "Stam Delta", width: 90, align: "right", format: "num" as const },
        { key: "sho", label: "Sho Delta", width: 90, align: "right", format: "num" as const },
      ],
      rows: (progress?.sumBaseStats ?? []).map((r: any, i: number) => ({
        id: r.playerId ?? i,
        rank: i + 1,
        name: r.name ?? "-",
        base: r.base ?? null,
        stam: r.stamDelta ?? null,
        sho: r.shoDelta ?? null,
      })),
    },
    {
      title: "Highest Base Stats",
      columns: [
        ...colRankName,
        { key: "stats", label: "Stats", width: 100, align: "right", format: "num" as const },
        { key: "delta", label: "Delta", width: 80, align: "right", format: "num" as const },
      ],
      rows: (progress?.highestBaseStats ?? []).map((r: any, i: number) => ({
        id: r.playerId ?? i,
        rank: i + 1,
        name: r.name ?? "-",
        stats: r.stats ?? null,
        delta: r.delta ?? null,
      })),
    },
    {
      title: "Highest Total Stats",
      columns: [
        ...colRankName,
        { key: "total", label: "Total Stats", width: 120, align: "right", format: "num" as const },
        { key: "delta", label: "Delta", width: 80, align: "right", format: "num" as const },
      ],
      rows: (progress?.highestTotalStats ?? []).map((r: any, i: number) => ({
        id: r.playerId ?? i,
        rank: i + 1,
        name: r.name ?? "-",
        total: r.total ?? null,
        delta: r.delta ?? null,
      })),
    },
  ];

  return {
    header,
    panels: {
      leftImageUrl: undefined,
      rightImageUrl: undefined,
    },
    tablesTop: topBlocks,
    tablesBottom: bottomBlocks,
  };
}
