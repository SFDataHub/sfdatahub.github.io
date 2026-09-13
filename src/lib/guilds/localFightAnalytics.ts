import {
  readLinkedFightTrackerState,
  type FightTrackerGuild,
  type FightTrackerGuildHubIdentity,
  type GuildFight,
} from "../../pages/GuildHub/fightTrackingStore";
import {
  filterAnalyticsPointsByRange,
  resolveGuildAnalyticsTimeDomain,
  type GuildAnalyticsGuildIdentity,
  type GuildAnalyticsRangeInput,
  type GuildAnalyticsTimeDomain,
} from "./localGuildAnalytics";

export type FightParticipationPoint = {
  fightId: string;
  date: string;
  fightNumber: GuildFight["fightNumber"];
  opponentGuild: string;
  createdAt: string;
  timestampMs: number;
  eligible: number;
  participants: number;
  missed: number;
};

export type FightParticipationSeries = {
  tracker: FightTrackerGuild | null;
  allPoints: FightParticipationPoint[];
  visiblePoints: FightParticipationPoint[];
  timeDomain: GuildAnalyticsTimeDomain | null;
};

export type FightParticipationOptions = {
  includeFormerMembers?: boolean;
};

export async function buildLocalFightParticipationSeries(
  guild: GuildAnalyticsGuildIdentity | null | undefined,
  range: GuildAnalyticsRangeInput,
  options: FightParticipationOptions = {},
): Promise<FightParticipationSeries> {
  const linkedGuild = toFightTrackerGuildHubIdentity(guild);
  if (!linkedGuild) return { tracker: null, allPoints: [], visiblePoints: [], timeDomain: null };

  const state = await readLinkedFightTrackerState(linkedGuild);
  if (!state.tracker) return { tracker: null, allPoints: [], visiblePoints: [], timeDomain: null };

  const activeMemberIds = new Set(
    state.members
      .filter((member) => options.includeFormerMembers || member.active)
      .map((member) => member.id),
  );

  const allPoints = state.fights
    .filter((fight) => fight.type === "attack")
    .map((fight) => buildFightParticipationPoint(fight, activeMemberIds))
    .filter((point): point is FightParticipationPoint => Boolean(point))
    .sort(
      (a, b) =>
        a.timestampMs - b.timestampMs ||
        a.fightNumber.localeCompare(b.fightNumber) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.fightId.localeCompare(b.fightId),
    );

  const visiblePoints = filterAnalyticsPointsByRange(allPoints, range, (point) => point.timestampMs);
  return {
    tracker: state.tracker,
    allPoints,
    visiblePoints,
    timeDomain: resolveGuildAnalyticsTimeDomain(allPoints, visiblePoints, range, (point) => point.timestampMs),
  };
}

function buildFightParticipationPoint(
  fight: GuildFight,
  activeMemberIds: Set<string>,
): FightParticipationPoint | null {
  const timestampMs = parseFightDateMs(fight.date, fight.createdAt);
  if (!timestampMs) return null;

  const rosterMemberIds = new Set(
    fight.rosterSnapshot
      .map((member) => member.id)
      .filter((memberId) => activeMemberIds.has(memberId)),
  );
  const missedMemberIds = new Set(
    fight.missedMemberIds.filter((memberId) => activeMemberIds.has(memberId) && rosterMemberIds.has(memberId)),
  );

  const eligible = rosterMemberIds.size;
  const missed = missedMemberIds.size;

  return {
    fightId: fight.id,
    date: fight.date,
    fightNumber: fight.fightNumber,
    opponentGuild: fight.opponentGuild,
    createdAt: fight.createdAt,
    timestampMs,
    eligible,
    missed,
    participants: Math.max(0, eligible - missed),
  };
}

function toFightTrackerGuildHubIdentity(
  guild: GuildAnalyticsGuildIdentity | null | undefined,
): FightTrackerGuildHubIdentity | null {
  if (!guild?.guildId || !guild.logoIdentifier || !guild.server) return null;
  return {
    id: guild.logoIdentifier,
    guildId: guild.guildId,
    logoIdentifier: guild.logoIdentifier,
    server: guild.server,
  };
}

function parseFightDateMs(dateValue: string, fallbackValue: string) {
  const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const parsed = new Date(
      Number(dateMatch[1]),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      12,
      0,
      0,
      0,
    ).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Date.parse(dateValue);
  if (Number.isFinite(parsed)) return parsed;

  const fallback = Date.parse(fallbackValue);
  return Number.isFinite(fallback) ? fallback : 0;
}
