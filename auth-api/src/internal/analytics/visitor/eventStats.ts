import type { Hit } from "./metrics";
import { PAGE_VIEW_PREFIX, normalPage, validDay } from "./metrics";
import { COLLECTION_DISPLAY, TOOL_CLICK_PREFIX, normalizeToolTarget, normalizeToolName, usageEvent, eventCategories } from "./events";

export function collectionTrackingStart(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString() : null;
}

type Range = { startDate: string; endDate: string; startDateTime: string; endDateTime: string };
export function buildEventStats(rows: Hit[], range: Range, trackingStart: string | null) {
  let displays = 0, pageViews = 0;
  const events = new Map<string, { id: string; category: string; label: string; count: number }>();
  const targets = new Map<string, number>();
  const names = new Map<string, { name: string; count: number }>();
  for (const hit of rows) {
    if (!hit.event) continue;
    if (hit.path === COLLECTION_DISPLAY) { displays += hit.count; continue; }
    if (hit.path.startsWith(TOOL_CLICK_PREFIX)) {
      const raw = hit.path.slice(TOOL_CLICK_PREFIX.length), target = normalizeToolTarget(raw);
      // Only the exact canonical sender contract belongs in this stream.
      if (target && target === raw) {
        targets.set(target, (targets.get(target) ?? 0) + hit.count);
        const name = normalizeToolName(hit.title), previous = names.get(target);
        // stats/hits normally has one title per path. If inputs contain several,
        // choose deterministically; they provide no title-change timestamp.
        if (name && (!previous || hit.count > previous.count || hit.count === previous.count && name < previous.name)) names.set(target, { name, count: hit.count });
      }
      continue;
    }
    if (hit.path.startsWith(PAGE_VIEW_PREFIX)) {
      if (normalPage(hit.path.slice(PAGE_VIEW_PREFIX.length))) pageViews += hit.count;
      continue;
    }
    const event = usageEvent(hit.path);
    if (event) {
      const previous = events.get(event.id);
      events.set(event.id, { ...event, count: (previous?.count ?? 0) + hit.count });
    }
  }
  const newCounter = (count: number) => {
    const started = trackingStart && trackingStart <= range.endDateTime;
    const observed = count > 0;
    return { ...range, count: started || observed ? count : null,
      state: started ? (trackingStart! > range.startDateTime ? "partial" : "available") : observed ? "observed" : "not_recorded",
      trackingStartedAt: trackingStart, coverage: started ? "since_verified_start" : "unknown" };
  };
  const categories = new Map<string, number>();
  for (const event of events.values()) categories.set(event.category, (categories.get(event.category) ?? 0) + event.count);
  const byCount = <T extends { count: number; id: string }>(a: T, b: T) => b.count - a.count || a.id.localeCompare(b.id);
  const toolCount = [...targets.values()].reduce((a, b) => a + b, 0);
  return {
    usage: { ...range, state: "available", coverage: "unknown", trackingStartedAt: null,
      count: [...events.values()].reduce((sum, event) => sum + event.count, 0),
      events: [...events.values()].sort(byCount),
      categories: [...categories].map(([id, count]) => ({ id, label: eventCategories[id], count })).sort(byCount) },
    collectionDisplays: newCounter(displays),
    toolClicks: { ...newCounter(toolCount), targets: [...targets].map(([id, count]) => ({ id, target: id, count, ...(names.has(id) ? { toolName: names.get(id)!.name } : {}) })).sort(byCount) },
    pageViewEvents: { ...range, state: "available", count: pageViews, coverage: "unknown", trackingStartedAt: null },
  };
}
