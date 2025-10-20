import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import GuildMonthlyProgressTab from "./GuildMonthlyProgressTab";
import type {
  GuildMonthlyProgressData,
  MonthOption,
  TableBlock,
} from "./GuildMonthlyProgressTab.types";
import { guildIconUrlByName } from "../../../../data/guilds";

type Props = {
  guildId: string;
  guildName: string;
  guildServer?: string | null;
};

/**
 * Container: holt Monatsübersicht + Progress-Daten aus Firestore
 * und befüllt den UI-Presenter. Ohne vorhandene Daten -> Fallback „-”
 * und leere Tabellen.
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
    emptyUiData(guildName, guildServer)
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMonthsAndMaybeProgress() {
      setLoading(true);
      try {
        // 1) Monate auflisten: guilds/{id}/history_monthly/*
        const monthCol = collection(db, `guilds/${guildId}/history_monthly`);
        const monthSnaps = await getDocs(monthCol);

        const opts: MonthOption[] = [];

        // Für jeden Monat direkt das Monatsdokument lesen (kein /progress mehr)
        for (const mDoc of monthSnaps.docs) {
          const key = mDoc.id; // "YYYY-MM"
          const p = mDoc.data() as any;
          if (!p) continue;

          progressCache.current[key] = p; // cache

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

        // Sort: neueste zuerst
        opts.sort((a, b) => (a.key < b.key ? 1 : -1));

        if (cancelled) return;

        if (opts.length === 0) {
          // keine Daten vorhanden -> Fallback „-” und leere Tabellen
          setMonths(null);
          setCurrentMonthKey(undefined);
          setUiData(emptyUiData(guildName, guildServer));
          setLoading(false);
          return;
        }

        setMonths(opts);
        const firstKey = opts[0].key;
        setCurrentMonthKey(firstKey);

        // 2) UI-Daten aus progress für den ersten Monat
        const firstProgress = progressCache.current[firstKey];
        setUiData(
          progressToUiData(firstProgress, {
            guildName,
            guildServer,
            currentMonthKey: firstKey,
            months: opts,
          })
        );
      } catch (e) {
        console.error(e);
        // Sicherheit: Fallback
        setMonths(null);
        setCurrentMonthKey(undefined);
        setUiData(emptyUiData(guildName, guildServer));
      } finally {
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
      try {
        const ref = doc(db, `guilds/${guildId}/history_monthly/${key}`);
        const pSnap = await getDoc(ref);
        if (pSnap.exists()) {
          p = pSnap.data();
          progressCache.current[key] = p;
        } else {
          p = null;
        }
      } catch (e) {
        console.error(e);
        p = null;
      }
    }

    if (!p) {
      // Monat existiert nicht -> leer rendern, aber Dropdown bleibt
      setUiData(
        emptyUiData(guildName, guildServer, {
          currentMonthKey: key,
          months: months ?? undefined,
        })
      );
      return;
    }

    setUiData(
      progressToUiData(p, {
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
  guildName: string,
  guildServer?: string | null,
  extra?: Partial<Pick<GuildMonthlyProgressData["header"], "currentMonthKey" | "months">>
): GuildMonthlyProgressData {
  return {
    header: {
      title: `${guildName} – Monthly Progress`,
      monthRange: "-", // Fallback-Anzeige
      emblemUrl: guildIconUrlByName(guildName, 512) || undefined,
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
    columns: [], // Presenter zeigt „No data“, wenn rows leer bleiben
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
    guildName: string;
    guildServer?: string | null;
    currentMonthKey: string;
    months?: MonthOption[];
  }
): GuildMonthlyProgressData {
  const meta = progress?.meta ?? {};
  const header: GuildMonthlyProgressData["header"] = {
    title: `${ctx.guildName} – Monthly Progress`,
    monthRange: undefined, // Dropdown übernimmt
    emblemUrl: guildIconUrlByName(ctx.guildName, 512) || undefined,
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
        { key: "delta", label: "Δ", width: 70, align: "right", format: "num" as const },
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
        { key: "stam", label: "Stam Δ", width: 90, align: "right", format: "num" as const },
        { key: "sho", label: "Sho Δ", width: 90, align: "right", format: "num" as const },
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
        { key: "delta", label: "Δ", width: 80, align: "right", format: "num" as const },
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
        { key: "delta", label: "Δ", width: 80, align: "right", format: "num" as const },
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
        { key: "stam", label: "Stam Δ", width: 90, align: "right", format: "num" as const },
        { key: "sho", label: "Sho Δ", width: 90, align: "right", format: "num" as const },
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
        { key: "delta", label: "Δ", width: 80, align: "right", format: "num" as const },
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
        { key: "delta", label: "Δ", width: 80, align: "right", format: "num" as const },
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
