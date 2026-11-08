import { buildLocalGuildRanking, guildModeCategories, localGuildRankingField, type DashboardMemberMode } from "./localGuildRanking";
import { readFocusedPlayerStats } from "../../lib/players/focusedPlayerStats";
import type { NormalizedPlayer } from "../../lib/parsing/normalizedPlayer";
import { normalizeSfPlayerCharacterCore } from "../../lib/parsing/normalizedPlayer";
import { readProgressRadarTotalXpForPlayer } from "../Playground/progressRadarModel";
import { readSfPlayerStats } from "../../lib/parsing/parseSfJson";

import { readProfileAllAttributeSums } from "../../lib/players/profileAttributeSums";
import type { ProfileSumPair } from "../../lib/players/profileAttributeSums";
import type { AttributeSumMode } from "../../lib/settings/preferences";

export type LocalGuildPlayerStats = {
  profileAllSums?: ProfileSumPair;
  baseMain: number | null;
  conBase: number | null;
  sumBaseTotal: number | null;
  attrTotal: number | null;
  conTotal: number | null;
  totalStats: number | null;
  level?: number | null;
  hofRank?: number | null;
  xpTotal?: number | null;
  mountBonus?: number | null;
  mine?: number | null;
  treasury?: number | null;
};

export type LocalGuildStatsMember = {
  key: string;
  name: string;
  classLabel: string | null;
  playerStats: LocalGuildPlayerStats;
};

// Reuse the already normalized current core when available; no profile build.
export function readLocalGuildPlayerStats(rawPlayer: unknown, core?: NormalizedPlayer | null): LocalGuildPlayerStats {
  return readFocusedPlayerStats(rawPlayer, core);
}

/** Compact current/history display values, using the existing domain readers. */
export function readLocalGuildMemberValues(rawPlayer: unknown, core?: NormalizedPlayer | null): LocalGuildPlayerStats {
  const normalized = core ?? normalizeSfPlayerCharacterCore(rawPlayer);
  const raw = rawPlayer && typeof rawPlayer === "object" ? rawPlayer as Record<string, unknown> : {};
  const stats = readSfPlayerStats(raw);
  const number = (keys: string[]) => {
    const sources = [raw, raw.values, raw.latestValues];
    for (const source of sources) if (source && typeof source === "object") for (const key of keys) {
      const value = (source as Record<string, unknown>)[key];
      if (value == null || value === "" || typeof value === "boolean") continue;
      const n = Number(value); if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const rank = normalized.progression.rank ?? number(["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank"]);
  return { ...readFocusedPlayerStats(raw, normalized), profileAllSums: readProfileAllAttributeSums(normalized),
    level: normalized.progression.level ?? stats.level,
    hofRank: rank != null && rank > 0 ? rank : null,
    xpTotal: readProgressRadarTotalXpForPlayer(raw, normalized),
    mountBonus: normalized.progressionStatus.mount.bonus ?? number(["Mount", "Mount %", "mount", "mountPct", "mountBonus", "MountBonus"]),
    mine: normalized.fortress.buildings.gemMine,
    treasury: normalized.fortress.buildings.treasury,
  };
}

export function summarizeLocalGuildPlayerStats(members: readonly LocalGuildStatsMember[], mode: DashboardMemberMode) {
  return guildModeCategories(mode).map(category => {
    const entries = buildLocalGuildRanking(members, [], category, mode, null).filter(row => row.value != null);
    return { field: localGuildRankingField(category, mode), category,
      average: entries.length ? entries.reduce((sum, entry) => sum + entry.value!, 0) / entries.length : null,
      entries: entries.slice(0, 3),
    };
  });
}

/** Project a guild-wide average from prepared member values. Missing values do
 * not enter the denominator; finite zeros do. No scan/profile reads are needed. */
export function averageLocalGuildMemberField(
  members: readonly { playerStats?: LocalGuildPlayerStats }[],
  field: keyof LocalGuildPlayerStats,
): number | null {
  const values = members.map(member => member.playerStats?.[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Select prepared profile sums without touching acquisition or persisted fields. */
export function projectLocalGuildStats<T extends LocalGuildPlayerStats>(stats: T, mode: AttributeSumMode): T {
  return mode === "main-con" ? stats : { ...stats, sumBaseTotal: stats.profileAllSums?.base ?? null, totalStats: stats.profileAllSums?.total ?? null };
}
export function projectLocalGuildMembers<T extends { playerStats?: LocalGuildPlayerStats }>(members: readonly T[], mode: AttributeSumMode): T[] {
  return members.map(member => member.playerStats ? { ...member, playerStats: projectLocalGuildStats(member.playerStats, mode) } : member);
}
