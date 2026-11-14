import type { PublicManifest } from "../../lib/analytics/publicMetrics";
import { normalizeToolName } from "../../../auth-api/src/internal/analytics/visitor/events";

export type WindowKey = "last7d" | "last30d";
export type ContentKey = "topPages" | "topPlayers" | "topGuilds" | "topGuides";
export type SourceState = "available" | "legacy" | "not_available" | "error";
export type CounterState = "available" | "observed" | "partial" | "not_recorded";
export type Period = { startDate: string; endDate: string; startDateTime?: string; endDateTime?: string };
export type TopEntry = { path: string; count: number; type: string; identifier?: string; slug?: string };
export type Counter = Period & {
  count: number | null; state: CounterState; coverage: string; trackingStartedAt: string | null;
};
export type ToolClicks = Counter & { targets: { id: string; target: string; count: number; toolName?: string }[] };
export type EventUsage = Period & {
  count: number; coverage: string;
  categories: { id: string; label: string; count: number }[];
  events: { id: string; category: string; label: string; count: number }[];
};
export type SizeDistribution = { state: "observed" | "partial" | "not_recorded"; counts: { small: number; medium: number; large: number; unknown: number } | null; total: number | null; pageVisits: number };
export type ScreenSizes = { classes: { smallMax: number; mediumMax: number; unit: string; basis: string }; asOf: string } & Record<WindowKey, Period & { overall: SizeDistribution; byPath: Record<string, SizeDistribution> }>;
type Windows<T> = Record<"today" | WindowKey, T>;
export type DetailData = {
  schemaVersion: 1 | 2;
  totals: Windows<Period & { visits: number }>;
  topPages: Record<WindowKey, TopEntry[]>;
  topPlayers: Record<WindowKey, TopEntry[]>;
  topGuilds: Record<WindowKey, TopEntry[]>;
  topGuides: Record<WindowKey, TopEntry[]>;
  screenSizes?: ScreenSizes;
  ranges?: Windows<Period>;
  eventUsage?: Windows<EventUsage>;
  collectionDisplays?: Windows<Counter>;
  toolClicks?: Windows<ToolClicks>;
  pageViewEvents?: Windows<Counter>;
  lastRefresh?: { state: string; attemptedAt?: string };
};
export type Source<T> = {
  state: SourceState; asOf: string | null; ageSeconds: number | null; stale: boolean;
  error: string | null; data: T | null;
};
export type VisitorSnapshot = {
  schemaVersion: 1; timezone: string; retrievedAt: string;
  website: Source<PublicManifest>; details: Source<DetailData>;
  limits: { topLists: number; toolTargets: null; usageEvents: null };
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

// Validate the shared envelope before replacing the last successful response.
// Optional/new fields are read separately: missing values never become zero.
export function parseVisitorSnapshot(value: unknown): VisitorSnapshot {
  const data = record(value);
  for (const name of ["website", "details"] as const) {
    const source = record(data?.[name]);
    if (!source || !["available", "legacy", "not_available", "error"].includes(String(source.state)) ||
        !(source.data === null || record(source.data))) throw new Error("Ungültiger Statistikstand");
  }
  if (data?.schemaVersion !== 1 || typeof data.timezone !== "string") throw new Error("Unbekannter Statistikstand");
  return value as VisitorSnapshot;
}

export const metricValue = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
export function formatNumber(value: unknown, decimals = 0): string {
  const number = metricValue(value);
  return number === null ? "—" : new Intl.NumberFormat("de-DE", { maximumFractionDigits: decimals }).format(number);
}
export function formatDate(value: string | null | undefined, withTime = true): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "nicht verfügbar";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", ...(withTime ? { timeStyle: "short" as const } : {}), timeZone: "Europe/Berlin" }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value));
}
export function periodLabel(period: Period | undefined): string {
  return period ? `${formatDate(period.startDate, false)} – ${formatDate(period.endDate, false)}` : "Zeitraum nicht verfügbar";
}
export function counterNote(counter: Counter | undefined): string {
  if (!counter || counter.state === "not_recorded" || metricValue(counter.count) === null) return "Noch keine Messdaten";
  if (counter.state === "partial") return `Teilweise erfasster Zeitraum · seit ${formatDate(counter.trackingStartedAt)}`;
  if (counter.state === "observed") return "Erfasste Ereignisse · Abdeckung unbekannt";
  return "Erfasst seit bestätigtem Beginn";
}
export function sourceNote<T>(source: Source<T> | undefined): string {
  if (!source) return "Noch nicht geladen";
  if (source.state === "error") return source.data ? `Letzter gültiger Stand · ${formatDate(source.asOf)}` : "Datenabruf fehlgeschlagen";
  if (!source.data || source.state === "not_available") return "Noch keine Messdaten";
  return `${source.state === "legacy" ? "Älterer Datenumfang · " : ""}${source.stale ? "Älterer Stand · " : "Stand · "}${formatDate(source.asOf)}`;
}
export function websiteNote(manifest: PublicManifest | null | undefined): string {
  switch (manifest?.state) {
    case "ready": return "";
    case "not_configured": return "Auswertungsbeginn noch nicht eingestellt";
    case "not_started": return "Erfassung noch nicht begonnen";
    case "unverified": return "Erfassungsbeginn noch nicht bestätigt";
    default: return "Noch keine Messdaten";
  }
}

const pageLabels: Record<string, string> = {
  "/": "Startseite", "/dashboard": "Dashboard", "/data-hub": "DataHub",
  "/data-hub/overview": "DataHub · Übersicht", "/data-hub/toplists": "DataHub · Toplisten",
  "/data-hub/player-hub": "Spielerübersicht", "/data-hub/guild-hub": "Gildenübersicht",
  "/guidehub-v2": "Guides", "/guidehub": "Guides", "/sf-collection": "Dons Collection",
  "/tools": "Tools", "/community": "Community", "/help": "Hilfe", "/settings": "Einstellungen",
};
export function pageLabel(entry: TopEntry): string {
  if (entry.type === "player_profile") return `Spielerprofil · ${entry.identifier || entry.path}`;
  if (entry.type === "guild_profile") return `Gildenprofil · ${entry.identifier || entry.path}`;
  return pageLabels[entry.path] || (entry.slug ? `Guide · ${entry.slug}` : entry.path);
}
// Unknown future tools retain their complete normalized target address.
export function toolLabel(target: string, toolName?: unknown): string {
  return normalizeToolName(toolName) ?? target;
}

// Never turn absent/malformed class data into zero or compute percentages against
// the differently aggregated page ranking. The stored size sum is the denominator.
export function sizeDistribution(value: SizeDistribution | undefined): SizeDistribution | null {
  if (!value?.counts || !["observed", "partial"].includes(value.state)) return null;
  const values = [value.counts.small, value.counts.medium, value.counts.large, value.counts.unknown];
  return values.every(n => Number.isSafeInteger(n) && n >= 0) && values.reduce((a, b) => a + b, 0) === value.total ? value : null;
}
