// src/lib/guilds/monthly/computeProgress.ts
import type { MembersSummaryDoc, ProgressDoc, MonthKey } from "./types";

export function computeProgressDoc(params: {
  guildId: string;
  monthKey: MonthKey;
  server?: string | null;
  first: MembersSummaryDoc | null;
  firstTsMs: number | null;
  latest: MembersSummaryDoc;
  latestTsMs: number;
}): ProgressDoc {
  const { guildId, monthKey, server, first, firstTsMs, latest, latestTsMs } = params;

  const spanDays =
    firstTsMs != null ? Math.floor((latestTsMs - firstTsMs) / 86400000) : null;
  const available = spanDays != null && spanDays <= 40;

  // Variante A: Key `reason` nur setzen, wenn nicht verfügbar (kein undefined!)
  const status: { available: boolean; reason?: "INSUFFICIENT_DATA" | "SPAN_GT_40D" } = {
    available,
  };
  if (!available) {
    status.reason = spanDays == null ? "INSUFFICIENT_DATA" : "SPAN_GT_40D";
  }

  const base: ProgressDoc = {
    meta: {
      monthKey,
      label: new Date(`${monthKey}-01T00:00:00Z`).toLocaleString("de-DE", {
        month: "short",
        year: "numeric",
      }),
      fromISO: firstTsMs ? new Date(firstTsMs).toISOString() : null,
      toISO: new Date(latestTsMs).toISOString(),
      fromTs: firstTsMs ? Math.floor(firstTsMs / 1000) : null,
      toTs: Math.floor(latestTsMs / 1000),
      daysSpan: spanDays,
      guildId,
      server: server ?? null,
    },
    status,
  };

  // Wenn nicht verfügbar oder keine Baseline: nur Meta/Status zurückgeben
  if (!available || !first) return base;

  const firstMap = new Map<string, any>();
  for (const m of first.members || []) if (m.playerId) firstMap.set(m.playerId, m);

  const mostBaseGained: any[] = [];
  const sumBaseStats: any[] = [];
  const highestBaseStats: any[] = [];
  const highestTotalStats: any[] = [];
  const mainAndCon: any[] = [];

  for (const m of latest.members || []) {
    if (!m.playerId) continue;
    const f = firstMap.get(m.playerId) || null;

    const baseLatest = m.sumBaseTotal ?? null;
    const baseFirst = f?.sumBaseTotal ?? null;
    const baseDelta =
      baseLatest != null && baseFirst != null ? baseLatest - baseFirst : 0;

    const totalLatest = m.totalStats ?? null;
    const totalFirst = f?.totalStats ?? null;
    const totalDelta =
      totalLatest != null && totalFirst != null ? totalLatest - totalFirst : 0;

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
      stamDelta: null, // falls verfügbar später befüllen
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
        f?.baseMain != null && m.baseMain != null ? m.baseMain - f.baseMain : 0,
    });
  }

  // Sortierungen + Top-X
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
}
