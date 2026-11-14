import type { Hit } from "./metrics";

// stats/sizes returns these five native ranges, not exact widths. Keep whole
// ranges; never interpret the provider's device-like IDs as detected devices.
export type SizeCounts = { small: number; medium: number; large: number; unknown: number };
export type SizeDistribution = { state: "observed" | "partial" | "not_recorded"; counts: SizeCounts | null; total: number | null; pageVisits: number };
export const sizeClasses = { smallMax: 600, mediumMax: 1000, unit: "screen_css_pixels", basis: "per_path_sessions_provider_days" };
const empty = (): SizeCounts => ({ small: 0, medium: 0, large: 0, unknown: 0 });
export function summarizeSizes(rows: { id: string; count: number }[]): SizeCounts | null {
  if (!rows.length) return null;
  const expected = ["phone", "tablet", "desktop", "desktophd", "unknown"];
  if (rows.length !== expected.length || expected.some(id => rows.filter(row => row.id === id).length !== 1)) throw Error("Incomplete or unsupported GoatCounter size classes");
  if (rows.some(row => !Number.isSafeInteger(row.count) || row.count < 0)) throw Error("Invalid GoatCounter size count");
  const count = (id: string) => rows.find(row => row.id === id)!.count;
  return { small: count("phone"), medium: count("tablet"), large: count("desktop") + count("desktophd"), unknown: count("unknown") };
}
type ReadSizes = (start: string, end: string, ids: number[]) => Promise<SizeCounts | null>;
type Range = { startDate: string; endDate: string; startDateTime: string; endDateTime: string };
// Limit each include_paths to 100 IDs (also bounds URL length for safe integers).
// Partition selected groups and the remainder: no original ID is queried twice
// in a window, even when one normalized page appears in several rankings.
export async function buildScreenSizes(rows: Hit[], paths: string[], normalize: (path: string) => string | null, range: Range, read?: ReadSizes) {
  const groups = new Map<string, Hit[]>();
  for (const row of rows) {
    if (row.event) continue;
    const path = normalize(row.path);
    if (path === null) continue;
    groups.set(path, [...(groups.get(path) ?? []), row]);
  }
  const selected = new Set(paths), byPath: Record<string, SizeDistribution> = Object.create(null);
  const allCounts = empty(); let available = 0, missing = 0, pageVisits = 0;
  async function distribution(hits: Hit[]): Promise<SizeDistribution> {
    const counts = empty(); let measured = 0, absent = 0;
    for (let i = 0; i < hits.length; i += 100) {
      const part = read ? await read(range.startDateTime, range.endDateTime, hits.slice(i, i + 100).map(hit => hit.path_id)) : null;
      if (part === null) { absent++; continue; }
      measured++;
      for (const key of Object.keys(counts) as (keyof SizeCounts)[]) counts[key] += part[key];
    }
    if (!hits.length) absent++;
    return { state: measured ? absent ? "partial" : "observed" : "not_recorded", counts: measured ? counts : null,
      total: measured ? Object.values(counts).reduce((a, b) => a + b, 0) : null, pageVisits: hits.reduce((n, hit) => n + hit.count, 0) };
  }
  function include(value: SizeDistribution) {
    pageVisits += value.pageVisits;
    if (value.counts) { available++; for (const key of Object.keys(allCounts) as (keyof SizeCounts)[]) allCounts[key] += value.counts[key]; }
    if (value.state !== "observed") missing++;
  }
  for (const path of selected) { const value = await distribution(groups.get(path) ?? []); byPath[path] = value; include(value); }
  const rest = [...groups].filter(([path]) => !selected.has(path)).flatMap(([, hits]) => hits);
  if (rest.length) include(await distribution(rest));
  const overall: SizeDistribution = { state: available ? missing ? "partial" : "observed" : "not_recorded", counts: available ? allCounts : null,
    total: available ? Object.values(allCounts).reduce((a, b) => a + b, 0) : null, pageVisits };
  return { ...range, overall, byPath };
}
