import { guideHubAnalyticsPath } from "../../pages/GuideHubV2/selection";
import { helpView } from "../help/view";

/** Keep the existing tracking paths, including individual profile identifiers.
 * Help/GuideHub content and the established toplist tab distinguish paths; display filters do not.
 */
export function toAnalyticsPath(pathname: string, search = "", hash = ""): string {
  if (pathname === "/guidehub-v2") return guideHubAnalyticsPath(search);
  if (pathname === "/help") {
    const view = helpView(search, hash);
    return view === "overview" ? "/help" : `/help/${view}`;
  }
  if (pathname === "/toplists") {
    return new URLSearchParams(search).get("tab") === "guilds" ? "/toplists/guilds" : "/toplists/players";
  }
  return pathname || "/";
}

// Versioned, fixed event: GoatCounter deduplicates this path across the whole site.
export const WEBSITE_VISIT_PATH = "sfdatahub/website-visit-v2";
export const PAGE_VIEW_PREFIX = "sfdatahub/page-view-v2:";
type CountPayload = { path: string; title?: string; event: boolean; no_session?: true; referrer?: string };
type CounterWindow = Window & {
  goatcounter?: { count?: (payload: CountPayload) => void };
  __sfhAnalyticsNavigation?: { path: string; key: string };
};
const queue: Array<{ path: string; expires: number }> = [];
let timer: ReturnType<typeof setTimeout> | undefined;
function flush() {
  timer = undefined;
  const counter = (window as CounterWindow).goatcounter;
  while (queue.length) {
    if (queue[0].expires <= Date.now()) { queue.shift(); continue; }
    if (typeof counter?.count !== "function") break;
    const { path } = queue.shift()!;
    // Never retry a delivered hit, even if the provider throws.
    try { counter.count({ path: WEBSITE_VISIT_PATH, title: WEBSITE_VISIT_PATH, event: true, referrer: "" }); } catch { /* optional analytics */ }
    try { counter.count({ path: PAGE_VIEW_PREFIX + path, title: path, event: true, no_session: true, referrer: "" }); } catch { /* optional analytics */ }
    // Preserve the established, session-deduplicated admin page statistics.
    // Public v2 snapshots exclude this stream, including older open app clients.
    try { counter.count({ path, event: false }); } catch { /* optional analytics */ }
  }
  if (queue.length) timer = setTimeout(flush, 200);
}

export function trackPageNavigation(path: string, key: string) {
  if (typeof window === "undefined") return;
  const win = window as CounterWindow;
  const previous = win.__sfhAnalyticsNavigation;
  if (previous?.path === path) return;
  win.__sfhAnalyticsNavigation = { path, key };
  // Changes within a canonical view and effect replays are not page loads. Returning from
  // another page or loading a fresh document is.
  if (queue.length >= 64) queue.shift();
  queue.push({ path, expires: Date.now() + 10_000 });
  if (timer !== undefined) clearTimeout(timer);
  flush();
}
