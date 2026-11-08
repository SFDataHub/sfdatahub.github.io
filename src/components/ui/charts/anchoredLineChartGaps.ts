export type GapChartScanPoint = { seriesKey: string; seriesLabel: string; timestampMs: number; value: number | null; observationKey?: string; partial?: boolean; note?: string };
type Coord = { pointKey: string; timestampMs?: number; observationKey?: string; seriesLabel?: string; partial?: boolean; note?: string; x: number; y: number | null; value?: number };
type Series = { key: string; renderKey?: string; color: string; opacity: number; drawProgress: number; coords: Coord[] };
export type GapChartMarker = { key: string; x: number; y: number; color: string; opacity: number; onRail: boolean; isolated: boolean; point: GapChartScanPoint };

/** Coordinates for visual orientation only. Missing values stay null; the
 * interpolated SVG height never becomes a data value or a calculation input. */
export function projectChartGaps(series: readonly Series[], labels: ReadonlyMap<string, string>, railY: number, observedOnly = false) {
  const connections: { key: string; seriesKey: string; path: string; color: string; opacity: number }[] = [];
  const markers: GapChartMarker[] = [];
  for (const row of series) {
    // A transition can render the previous and next state of the same domain
    // series simultaneously. Keep that render identity out of the data/hover key.
    const renderKey = row.renderKey ?? row.key;
    const valid = row.coords.map((coord, index) => coord.y == null ? -1 : index).filter(index => index >= 0);
    const first = row.coords[valid[0]], last = row.coords[valid[valid.length - 1]];
    const revealX = first && last ? first.x + (last.x - first.x) * row.drawProgress : Infinity;
    for (let i = 1; i < valid.length; i++) {
      const left = row.coords[valid[i - 1]], right = row.coords[valid[i]];
      if (valid[i] === valid[i - 1] + 1 || left.y == null || right.y == null || revealX <= left.x) continue;
      const endX = Math.min(right.x, revealX);
      const endY = left.y + (right.y - left.y) * (endX - left.x) / Math.max(1, right.x - left.x);
      connections.push({ key: JSON.stringify([renderKey, left.pointKey, right.pointKey]), seriesKey: row.key, path: 'M' + left.x + ',' + left.y + ' L' + endX + ',' + endY, color: row.color, opacity: row.opacity });
    }
    row.coords.forEach((coord, index) => {
      if (observedOnly && (coord.y == null || coord.x > revealX)) return;
      const timestampMs = coord.timestampMs ?? Number(coord.pointKey);
      if (!Number.isFinite(timestampMs)) return;
      const leftIndex = [...valid].reverse().find(i => i < index);
      const rightIndex = valid.find(i => i > index);
      const left = leftIndex == null ? null : row.coords[leftIndex], right = rightIndex == null ? null : row.coords[rightIndex];
      const bounded = coord.y == null && left?.y != null && right?.y != null;
      const y = coord.y ?? (bounded ? left!.y! + (right!.y! - left!.y!) * (coord.x - left!.x) / Math.max(1, right!.x - left!.x) : railY);
      const point: GapChartScanPoint = { seriesKey: row.key, seriesLabel: coord.seriesLabel ?? labels.get(row.key) ?? row.key, timestampMs, value: coord.y == null ? null : coord.value ?? null, ...(coord.observationKey ? { observationKey: coord.observationKey } : {}), ...(coord.partial !== undefined ? { partial: coord.partial } : {}), ...(coord.note !== undefined ? { note: coord.note } : {}) };
      markers.push({ key: JSON.stringify([renderKey, coord.pointKey]), x: coord.x, y, color: row.color, onRail: coord.y == null && !bounded, isolated: coord.y != null && valid.length === 1, opacity: coord.y == null && bounded && coord.x > revealX ? 0 : row.opacity, point });
    });
  }
  return { connections, markers };
}
