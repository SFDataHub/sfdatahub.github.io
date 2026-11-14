/** Pure analytics wire catalog shared with the browser; no SDK or app data. */
export const eventNames = [
  "datahub/analytics/compare",
  "datahub/analytics/details",
  "datahub/analytics/filters",
  "datahub/analytics/overview",
  "datahub/analytics/progress",
  "datahub/dashboard/scan-inventory",
  "datahub/favorites/open",
  "datahub/fight/attack",
  "datahub/fight/manager",
  "datahub/fight/member-list",
  "datahub/fight/members",
  "datahub/fight/participation",
  "datahub/fight/manager-members",
  "datahub/fight/manager-fights",
  "datahub/fight/participation-export",
  "datahub/fight/participation-preview",
  "datahub/fight/screenshot-review",
  "datahub/fight/screenshots",
  "datahub/fight/sync",
  "datahub/fight/sync-details",
  "datahub/fusion/members",
  "datahub/fusion/overview",
  "datahub/fusion/result",
  "datahub/fusion/scenarios",
  "datahub/fusion/setup",
  "datahub/guild/base",
  "datahub/guild/chart-details",
  "datahub/guild/compare",
  "datahub/guild/fortress",
  "datahub/guild/general",
  "datahub/guild/members-cards",
  "datahub/guild/members-list",
  "datahub/guild/overlay",
  "datahub/guild/progress",
  "datahub/guild/ranking",
  "datahub/guild/scan-details",
  "datahub/guild/total",
  "datahub/guild/transfers",
  "datahub/guild/trend",
  "datahub/identity/dashboard",
  "datahub/identity/analyze-success",
  "datahub/identity/details",
  "datahub/identity/evidence",
  "datahub/identity/link-success",
  "datahub/identity/manual-link",
  "datahub/identity/matching-success",
  "datahub/identity/workspace",
  "datahub/planner/form",
  "datahub/player/base",
  "datahub/player/chart-details",
  "datahub/player/composition",
  "datahub/player/fortress",
  "datahub/player/general",
  "datahub/player/overlay",
  "datahub/player/progress",
  "datahub/player/total",
  "datahub/search/guild-select",
  "datahub/search/open",
  "datahub/search/player-select",
  "datahub/settings/save-success",
  "datahub/toplist/compare",
  "datahub/toplist/filters",
  "datahub/toplist/guilds",
  "datahub/toplist/players",
  "datahub/toplist/png-dialog",
  "datahub/toplist/png-export-success",
  "datahub/uploads/archive",
  "datahub/uploads/delete-success",
  "datahub/uploads/fight-tracker",
  "datahub/uploads/guild-details",
  "datahub/uploads/import-preview",
  "datahub/uploads/import-success",
  "datahub/uploads/player-details",
  "datahub/uploads/scan-overview",
  "datahub/uploads/sftools-import-success",
  "datahub/uploads/update-success",
  "datahub/uploads/user-scans",
  "datahub/waitlist/form"
] as const;

export const COLLECTION_DISPLAY = "sfcollection/display-v1";
export const TOOL_CLICK_PREFIX = "sfcollection/tool-click-v1:";
export const dungeonBookIds = ["light-world", "shadow-world", "class-world", "fairy-tower", "continuous-loop", "twister", "sandstorm"] as const;

/** No allowlist of tools. Query/fragment are deliberately discarded, never sent.
 * Keep scheme, canonical host/port and case-sensitive path; fold trailing slashes.
 * No credentials, controls, whitespace, relative URLs or oversized values.
 */
export function normalizeToolTarget(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    const target = url.origin + (url.pathname.replace(/\/+$/, "") || "/");
    return target.length <= 512 ? target : null;
  } catch { return null; }
}

const fixed = new Set<string>(eventNames);
/** Optional display metadata only; never part of a metric's URL identity. */
export function normalizeToolName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 120 || /[\u0000-\u001f\u007f-\u009f<>]/.test(value)) return null;
  const name = value.trim();
  if (!name || name.startsWith(TOOL_CLICK_PREFIX)) return null;
  return name;
}

export const eventCategories: Record<string, string> = {
  analytics: "DataHub Analytics", dashboard: "DataHub Dashboard", favorites: "Favorites",
  fight: "Fight tracking", fusion: "Fusion planner", guild: "Guild profiles", identity: "Identity matching",
  planner: "Guild planner", player: "Player profiles", search: "DataHub search", settings: "Settings",
  setup: "DataHub setup", toplist: "Toplists", uploads: "Scans and uploads", waitlist: "Waitlist",
  dungeons: "Dungeon Library", help: "Help", youtube: "YouTube clicks", twitch: "Twitch clicks",
};
export type UsageEvent = { id: string; category: string; label: string };
/** Preserve exact stable family IDs, never reinterpret visits or unknown messages. */
export function usageEvent(path: string): UsageEvent | null {
  let category: string | undefined;
  if (fixed.has(path)) category = path.split("/")[1];
  else if (/^home\/youtube\/video-click\/UC[A-Za-z0-9_-]{22}\/[A-Za-z0-9_-]{11}$/.test(path)) category = "youtube";
  else if (/^home\/twitch\/live-click\/[a-z0-9_]+$/.test(path)) category = "twitch";
  else if (path.startsWith("dungeons/library/book-open/") && (dungeonBookIds as readonly string[]).includes(path.slice("dungeons/library/book-open/".length))) category = "dungeons";
  else if (/^help\/qa\/question-open\/[a-z0-9-]{1,80}$/.test(path)) category = "help";
  else if (/^datahub\/toplist\/(players|guilds)\/server-view\/[A-Z0-9_]{1,64}$/.test(path)) category = "toplist";
  else if (/^datahub\/setup\/completed\/servers\/[1-9]\d{0,15}$/.test(path) && Number.isSafeInteger(Number(path.split("/").pop()))) category = "setup";
  if (!category) return null;
  return { id: path, category, label: path.split("/").slice(category === "youtube" || category === "twitch" ? 2 : 1).join(" / ").replace(/-/g, " ") };
}
