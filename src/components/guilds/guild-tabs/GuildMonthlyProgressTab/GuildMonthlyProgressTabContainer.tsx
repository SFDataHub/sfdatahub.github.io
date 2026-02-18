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

type Props = {
  guildId: string;
  guildName: string;
  guildServer?: string | null;
};

type GuildMonthlyLoadResult = {
  opts: MonthOption[];
  progressByMonth: Record<string, any>;
};

const guildMonthlyLoadInFlight = new Map<string, Promise<GuildMonthlyLoadResult>>();
const guildMonthlyLoadCache = new Map<string, GuildMonthlyLoadResult>();

/**
 * Container: holt Monatsuebersicht + Progress-Daten aus Firestore
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

  // Cache: progress-Dokumente pro Monat
  const progressCache = useRef<Record<string, any>>({});

  const [uiData, setUiData] = useState<GuildMonthlyProgressData>(() =>
    emptyUiData(guildId, guildName, guildServer)
  );

  useEffect(() => {
    let cancelled = false;
    const guildKey = guildId.trim().toLowerCase();

    const applyLoadedResult = (result: GuildMonthlyLoadResult) => {
      progressCache.current = { ...result.progressByMonth };
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
      const firstProgress = progressCache.current[firstKey];
      setUiData(
        progressToUiData(firstProgress, {
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
        const monthCol = collection(db, `guilds/${guildId}/history_monthly`);
        const monthSnaps = await traceGetDocs(scope, { path: monthCol.path }, () => getDocs(monthCol));
        const opts: MonthOption[] = [];
        const progressByMonth: Record<string, any> = {};
        for (const mDoc of monthSnaps.docs) {
          const key = mDoc.id;
          const p = mDoc.data() as any;
          if (!p) continue;
          progressByMonth[key] = p;
          const meta = p?.meta ?? {};
          const fromISO: string = meta.fromISO || meta.baselineISO || meta.firstISO || "";
          const toISO: string = meta.toISO || meta.latestISO || meta.nowISO || "";
          const span: number =
            Number(meta.daysSpan ?? Math.floor((+new Date(toISO) - +new Date(fromISO)) / 86400000)) || 0;
          const available: boolean = Boolean(p?.status?.available ?? (fromISO && toISO ? span <= 40 : false));
          const label =
            meta.label ||
            new Date(key + "-01T00:00:00").toLocaleString("de-DE", {
              month: "short",
              year: "numeric",
            });
          opts.push({
            key,
            label,
            fromISO: fromISO || new Date(key + "-01").toISOString(),
            toISO: toISO || new Date(key + "-28").toISOString(),
            daysSpan: span,
            available,
            reason: available ? undefined : (p?.status?.reason as any),
          });
        }
        opts.sort((a, b) => (a.key < b.key ? 1 : -1));
        return { opts, progressByMonth };
      } finally {
        endReadScope(scope);
      }
    };

    async function loadMonthsAndMaybeProgress() {
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

        const existing = guildMonthlyLoadInFlight.get(guildKey);
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

    // aus Cache oder holen
    let p = progressCache.current[key];
    if (!p) {
      const scope: FirestoreTraceScope = beginReadScope("GuildMonthly:monthDoc");
      try {
        const ref = doc(db, `guilds/${guildId}/history_monthly/${key}`);
        const pSnap = await traceGetDoc(scope, ref, () => getDoc(ref));
        if (pSnap.exists()) {
          p = pSnap.data();
          progressCache.current[key] = p;
        } else {
          p = null;
        }
      } catch (e) {
        console.error(e);
        p = null;
      } finally {
        endReadScope(scope);
      }
    }

    if (!p) {
      // Monat existiert nicht -> leer rendern, aber Dropdown bleibt
      setUiData(
        emptyUiData(guildId, guildName, guildServer, {
          currentMonthKey: key,
          months: months ?? undefined,
        })
      );
      return;
    }

    setUiData(
      progressToUiData(p, {
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
