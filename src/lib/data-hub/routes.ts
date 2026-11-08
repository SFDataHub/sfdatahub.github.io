import { matchRoutes, type RouteObject } from "react-router-dom";
import { favoriteReference, type FavoriteKind, type FavoriteReference } from "./hubFavoritesContract";

export const DATA_HUB = "/data-hub";
export const GUILD_HUB = `${DATA_HUB}/guild-hub`;
export const PLAYER_HUB = `${DATA_HUB}/player-hub`;
export const LOCAL_PROFILE_PATTERN = `${PLAYER_HUB}/player/:server/:identifier`;
export const LOCAL_GUILD_PATTERN = `${GUILD_HUB}/guild/:server/:identifier/dashboard`;
export const GUILD_HUB_SUFFIXES = ["dashboard", "planner", "fusion-planner", "fight-tracking", "waitlist", "activity", "import", "announcements", "events", "roles", "settings"] as const;
export const LEGACY_DATA_HUB_ROUTES: Readonly<Record<string, string>> = {
  "/guild-hub": GUILD_HUB,
  ...Object.fromEntries(GUILD_HUB_SUFFIXES.map(suffix => [`/guild-hub/${suffix}`, `${GUILD_HUB}/${suffix}`])),
  "/guild-hub/toplist": `${DATA_HUB}/toplist`,
  "/guild-hub/analytics": `${DATA_HUB}/analytics`,
  "/guild-hub/compare-guilds": `${DATA_HUB}/analytics`,
  "/guild-hub/imports": `${GUILD_HUB}/import`,
};

/** Router params are already decoded by React Router. Never decode twice. */
export function parseLocalEntity(kind: FavoriteKind, server?: string, identifier?: string): FavoriteReference | null {
  if (!server || !identifier || !new RegExp(`^.+_${kind === "player" ? "p" : "g"}\\d+$`, "i").test(identifier)) return null;
  const ref = favoriteReference(kind, identifier);
  const namespace = favoriteReference(kind, "1", server)?.serverNamespace;
  return ref && namespace === ref.serverNamespace ? ref : null;
}

export type ObservationAnchor = { source: string; at: number; row?: string; snapshot?: string; hash?: string };
export type ParsedObservation = { kind: "free" } | { kind: "exact"; anchor: ObservationAnchor } | { kind: "invalid"; reason: string };
export function parseObservation(search: string): ParsedObservation {
  const params = new URLSearchParams(search);
  const fields = ["source", "snapshot", "row", "at", "hash"];
  if (!fields.some(field => params.has(field))) return { kind: "free" };
  if (fields.some(field => params.getAll(field).length > 1)) return { kind: "invalid", reason: "duplicate" };
  const source = params.get("source"), time = params.get("at");
  if (!source?.trim() || !time || !/^\d+$/.test(time) || !Number.isSafeInteger(Number(time)) || Number(time) <= 0 || Number(time) > 8640000000000000) return { kind: "invalid", reason: "anchor" };
  const at = Number(time), snapshot = params.get("snapshot"), row = params.get("row"), hash = params.get("hash");
  if (snapshot !== null && snapshot !== `${source}::${at}` || row !== null && !row.trim() || hash !== null && !hash.trim()) return { kind: "invalid", reason: "anchor" };
  return { kind: "exact", anchor: { source, at, ...(snapshot ? { snapshot } : {}), ...(row ? { row } : {}), ...(hash ? { hash } : {}) } };
}
export function observationQuery(anchor?: ObservationAnchor) {
  if (!anchor) return "";
  const params = new URLSearchParams({ source: anchor.source, at: String(anchor.at) });
  for (const field of ["snapshot", "row", "hash"] as const) if (anchor[field]) params.set(field, anchor[field]);
  return `?${params}`;
}
export function localEntityPath(kind: FavoriteKind, ref: FavoriteReference, anchor?: ObservationAnchor) {
  return `${kind === "player" ? PLAYER_HUB + "/player" : GUILD_HUB + "/guild"}/${encodeURIComponent(ref.serverNamespace)}/${encodeURIComponent(ref.identifier)}${kind === "guild" ? "/dashboard" : ""}${observationQuery(anchor)}`;
}

let appReturnRoutes: RouteObject[] = [];
/** Retain only paths from the actual router; its universal fallback is not a destination. */
export function registerAppReturnRoutes(routes: RouteObject[]) {
  const paths = (entries: RouteObject[]): RouteObject[] => entries.filter(route => route.path !== "*").map(route => ({
    path: route.path, caseSensitive: route.caseSensitive, ...(route.index ? { index: true as const } : { children: route.children ? paths(route.children) : undefined }),
  }));
  appReturnRoutes = paths(routes);
}

/** Only validated local entities or registered internal App destinations, including query. */
export function safeLocalReturn(value: unknown, currentPath?: string): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\\#\s\u0000-\u001f]/.test(value) || value.startsWith("//")) return null;
  const [path] = value.split("?");
  if (currentPath) {
    const canonical = (path: string) => {
      const normalized = path.split("?")[0].replace(/\/+$/, "").toLowerCase() || "/";
      return LEGACY_DATA_HUB_ROUTES[normalized] ?? normalized;
    };
    if (canonical(path) === canonical(currentPath)) return null;
  }
  if (Object.prototype.hasOwnProperty.call(LEGACY_DATA_HUB_ROUTES, path) || [DATA_HUB, GUILD_HUB, PLAYER_HUB, `${DATA_HUB}/toplist`, `${DATA_HUB}/analytics`, `${DATA_HUB}/scan-management`, `${DATA_HUB}/identity-matching`, ...GUILD_HUB_SUFFIXES.map(s => `${GUILD_HUB}/${s}`)].includes(path)) return value;
  if (path !== DATA_HUB && !path.startsWith(`${DATA_HUB}/`) && path !== "/guild-hub" && !path.startsWith("/guild-hub/")) {
    try {
      const decoded = decodeURIComponent(path);
      if (/^\/(?:data-hub|guild-hub)(?:\/|$)/i.test(decoded)) return null;
      if (/[\\#?\s\u0000-\u001f\u007f]/.test(decoded) || decoded.split("/").some(part => part === "." || part === "..")) return null;
      return matchRoutes(appReturnRoutes, path) ? value : null;
    } catch { return null; }
  }
  const match = path.match(/^\/data-hub\/(player-hub\/player|guild-hub\/guild)\/([^/]+)\/([^/]+)(\/dashboard)?$/);
  if (!match || (match[1] === "guild-hub/guild") !== !!match[4]) return null;
  try { return parseLocalEntity(match[4] ? "guild" : "player", decodeURIComponent(match[2]), decodeURIComponent(match[3])) && parseObservation(value.slice(path.length)).kind !== "invalid" ? value : null; } catch { return null; }
}
export function localCopyLink(path: string, href = window.location.href) {
  const base = new URL(href); base.hash = path; return base.href;
}
