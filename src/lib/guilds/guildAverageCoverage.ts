/** Shared Dashboard/Radar display contract. Counts must be declared, never
 * inferred from the available rows. Missing metrics do not become zeroes. */
export function guildAverageCoverage(found: number, declared: number | null, used: number, conflict: boolean) {
  const reason = declared == null ? "unknown" : conflict ? "conflict" : used > declared || found > declared ? "excess"
    : used === 0 ? "empty" : declared - used > 5 ? "missing" : null;
  return { found, declared, used, partial: reason == null && used < declared!, reason };
}
