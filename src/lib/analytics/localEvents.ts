import { useEffect, useRef } from "react";
import { getQaQuestion } from "../help/qaCatalog";
import { resolveServer } from "../servers/serverResolver";

export const uploadViewEvents = {
  "scans": "datahub/uploads/user-scans",
  "archive": "datahub/uploads/archive",
  "fightTracker": "datahub/uploads/fight-tracker"
} as const;

export const scanViewEvents = {
  "results": "datahub/uploads/scan-overview",
  "player": "datahub/uploads/player-details",
  "guild": "datahub/uploads/guild-details"
} as const;

export const fightViewEvents = {
  "sync": "datahub/fight/sync",
  "member": "datahub/fight/members",
  "memberList": "datahub/fight/member-list",
  "fight": "datahub/fight/attack",
  "screenshots": "datahub/fight/screenshots",
  "tracklist": "datahub/fight/participation"
} as const;

export const playerViewEvents = {
  "general": "datahub/player/general",
  "progress": "datahub/player/progress",
  "base": "datahub/player/base",
  "total": "datahub/player/total",
  "fortress": "datahub/player/fortress"
} as const;

export const guildViewEvents = {
  "general": "datahub/guild/general",
  "progress": "datahub/guild/progress",
  "base": "datahub/guild/base",
  "total": "datahub/guild/total",
  "fortress": "datahub/guild/fortress"
} as const;

export const analyticsViewEvents = {
  "overview": "datahub/analytics/overview",
  "progress": "datahub/analytics/progress",
  "compare": "datahub/analytics/compare"
} as const;

export const fusionViewEvents = {
  "setup": "datahub/fusion/setup",
  "members": "datahub/fusion/members",
  "overview": "datahub/fusion/overview",
  "scenarios": "datahub/fusion/scenarios",
  "result": "datahub/fusion/result"
} as const;

const eventNames = [
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
export type LocalEvent = typeof eventNames[number];
const allowed = new Set<string>(eventNames);
type ToplistTab = "players" | "guilds";
type ActionEvent = `home/twitch/live-click/${string}` | `dungeons/library/book-open/${string}` | `help/qa/question-open/${string}` | `datahub/toplist/${ToplistTab}/server-view/${string}` | `datahub/setup/completed/servers/${number}`;
type EventPath = LocalEvent | ActionEvent;
const dungeonBookIds = new Set(["light-world", "shadow-world", "class-world", "fairy-tower", "continuous-loop", "twister", "sandstorm"]);
type Payload = { path: EventPath; title: EventPath; event: true; referrer: ""; no_session: true };
type CounterWindow = Window & { goatcounter?: { count?: (payload: Payload) => void } };
const queue: Array<{ payload: Payload; expires: number }> = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  timer = undefined;
  const counter = (window as CounterWindow).goatcounter;
  while (queue.length) {
    if (queue[0].expires <= Date.now()) { queue.shift(); continue; }
    if (typeof counter?.count !== "function") break;
    // Remove before calling: a throwing provider must never cause a redelivery.
    const entry = queue.shift()!;
    try { counter.count(entry.payload); } catch { /* Analytics never interrupts the app. */ }
  }
  if (queue.length) timer = setTimeout(flush, 200);
}

function enqueueEvent(path: EventPath) {
  if (typeof window === "undefined") return;
  if (queue.length >= 64) queue.shift();
  queue.push({ payload: { path, title: path, event: true, referrer: "", no_session: true }, expires: Date.now() + 10_000 });
  if (timer !== undefined) clearTimeout(timer);
  flush();
}

/** Only fixed catalog entries are accepted, including at runtime. No app data. */
export function trackLocalEvent(path: LocalEvent) {
  if (allowed.has(path)) enqueueEvent(path);
}

/** Count each outgoing click using the existing channel login, never its label or URL. */
export function trackTwitchLiveClick(login: string) {
  const channel = login.trim().toLowerCase();
  if (/^[a-z0-9_]+$/.test(channel)) enqueueEvent(`home/twitch/live-click/${channel}`);
}

/** Only the seven stable book IDs are accepted; reopening counts again. */
export function trackDungeonBookOpen(worldId: string) {
  if (dungeonBookIds.has(worldId)) enqueueEvent(`dungeons/library/book-open/${worldId}`);
}

/** Only catalog IDs; called by deliberate closed-to-open actions, never restoration. */
export function trackHelpQuestionOpen(questionId: string) {
  if (getQaQuestion(questionId)) enqueueEvent(`help/qa/question-open/${questionId}`);
}

/** Fixed action prefix, registry codes only; never enters the page-view stream. */
export function trackToplistServerView(tab: ToplistTab, value: string) {
  const server = resolveServer(value);
  if (server && (tab === "players" || tab === "guilds")) enqueueEvent(`datahub/toplist/${tab}/server-view/${server.code}`);
}

/** One successful explicit preparation; only the confirmed target count, never server data. */
export function trackDataHubSetupCompleted(serverCount: number) {
  if (Number.isSafeInteger(serverCount) && serverCount > 0) enqueueEvent(`datahub/setup/completed/servers/${serverCount}`);
}

/** Count resolved selection transitions; data updates and effect replays are inert. */
export function useToplistServerViews(servers: readonly string[], tab: ToplistTab, ready: boolean) {
  const previous = useRef<{ tab: ToplistTab; servers: Set<string> } | null>(null);
  useEffect(() => {
    if (!ready) return;
    const current = new Set(servers.flatMap(value => {
      const server = resolveServer(value);
      return server ? [server.code] : [];
    }));
    const before = previous.current;
    previous.current = { tab, servers: current };
    for (const server of current) {
      if (before?.tab !== tab || !before.servers.has(server)) trackToplistServerView(tab, server);
    }
  }, [servers, tab, ready]);
}

/** Count committed visibility/selection transitions, never effect replays or renders.
 * Overlay entry already represents its initial view, including Loading/Error.
 * Its later mounted content passes countInitial=false to avoid a Ready recount.
 */
export function useAnalyticsView(event: LocalEvent | null, countInitial = true) {
  const previous = useRef<LocalEvent | null | undefined>(undefined);
  useEffect(() => {
    const initial = previous.current === undefined;
    if (previous.current === event) return;
    previous.current = event;
    if (event && (!initial || countInitial)) trackLocalEvent(event);
  }, [event, countInitial]);
}
