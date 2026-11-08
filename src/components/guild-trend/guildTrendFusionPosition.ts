/** Preserve the existing interval chart and its dated end-label centres.
 * Interpolate only the marker's x position between those time anchors. */
export function guildTrendFusionPosition(intervals: readonly { start: { scannedAtMs: number }; end: { scannedAtMs: number } }[], timestampMs: number, plotLeft: number, barWidth: number, gap: number): number | null {
  if (!intervals.length || !Number.isFinite(timestampMs)) return null;
  const anchors = [{ at: intervals[0].start.scannedAtMs, x: plotLeft },
    ...intervals.map((interval, index) => ({ at: interval.end.scannedAtMs, x: plotLeft + index * (barWidth + gap) + barWidth / 2 }))];
  if (timestampMs < anchors[0].at || timestampMs > anchors[anchors.length - 1].at) return null;
  const next = anchors.findIndex(anchor => anchor.at >= timestampMs);
  if (next <= 0) return anchors[0].x;
  const start = anchors[next - 1], end = anchors[next];
  return end.at > start.at ? start.x + (timestampMs - start.at) / (end.at - start.at) * (end.x - start.x) : end.x;
}
