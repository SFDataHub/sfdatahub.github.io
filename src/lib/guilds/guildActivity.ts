export const GUILD_ACTIVITY_INACTIVE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export type GuildActivityObservation = {
  lastActivityMs?: number | null;
  lastScanMs?: number | null;
};

export function calculateGuildActivityPct(observations: readonly GuildActivityObservation[]): number | null {
  const totalMembers = observations.length;
  if (!totalMembers) return null;

  let activeMembers = 0;
  for (const observation of observations) {
    const lastScanMs = observation.lastScanMs;
    const lastActivityMs = observation.lastActivityMs;
    if (lastScanMs == null || lastActivityMs == null) continue;

    const inactiveForTooLong = lastScanMs - lastActivityMs > GUILD_ACTIVITY_INACTIVE_THRESHOLD_MS;
    if (!inactiveForTooLong) activeMembers += 1;
  }

  return (activeMembers / totalMembers) * 100;
}
