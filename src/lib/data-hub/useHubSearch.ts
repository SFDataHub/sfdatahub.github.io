import { auditBegin, auditCall, auditSpan, auditSpanEnd, auditFinish, auditFields, type AuditRun } from "./runtimeAudit";
import { useRuntimeAuditCommit } from "./useRuntimeAuditCommit";
import { useEffect, useRef, useState } from "react";
import { HubSearchController, defaultHubSearchQuery, emptyHubSearchState, validHubSearchScope,
  HUB_SEARCH_DEBOUNCE_MS, type HubSearchQuery } from "./hubSearchService";
const SESSION_KEY = "sfdatahub:hub-search:v1";
export function restoreHubSearchQuery(storageKey = SESSION_KEY): HubSearchQuery {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (value && typeof value.text === "string" && value.text.length <= 200 && ["both", "player", "guild"].includes(value.kind) &&
      ["profile", "toplist"].includes(value.mode) && value.scope && validHubSearchScope(value.scope)) return value;
  } catch { /* A damaged session does not become an input. */ }
  return defaultHubSearchQuery;
}
export function constrainHubSearchQuery(query: HubSearchQuery, entityKind?: "guild" | "player", dashboard = false, fixedScope?: "current"): HubSearchQuery {
  const constrained = entityKind ? { ...query, kind: entityKind, mode: "profile" as const } : dashboard ? { ...query, kind: "both" as const, scope: { kind: "current" as const } } : query;
  // A view without scope controls must not inherit invisible historical filters.
  return fixedScope === "current" ? { ...constrained, scope: { kind: "current" } } : constrained;
}
export function useHubSearch(entityKind?: "guild" | "player", dashboard = false, fixedScope?: "current", transient = false, inputState?: "topbar") {
  // Global Topbar and each Overview keep their own input; recents remain shared.
  const storageKey = inputState === "topbar" ? `${SESSION_KEY}:topbar` : entityKind ? `${SESSION_KEY}:${entityKind}-overview` : SESSION_KEY;
  const [query, setStoredQuery] = useState(() => {
    const restored = transient ? defaultHubSearchQuery : restoreHubSearchQuery(storageKey);
    return constrainHubSearchQuery(restored, entityKind, dashboard, fixedScope);
  });
  const [state, setState] = useState(emptyHubSearchState);
  const [applied, setApplied] = useState("");
  const controller = useRef<HubSearchController>();
  const subscription = useRef<() => void>();
  const lifetime = useRef<AbortController>();
  const queryTimer = useRef<ReturnType<typeof setTimeout>>();
  const queryWait = useRef<AuditRun | null>(null);
  const activate = () => {
    if (controller.current) return controller.current;
    const next = new HubSearchController(); controller.current = next;
    lifetime.current = new AbortController();
    subscription.current = next.subscribe(() => setState(next.getSnapshot()));
    next.start(query); setApplied(JSON.stringify(query));
    return next;
  };
  useEffect(() => {
    if (!dashboard) activate();
    const resume = () => controller.current?.retry(); window.addEventListener("online", resume);
    return () => { lifetime.current?.abort(); subscription.current?.(); controller.current?.dispose(); window.removeEventListener("online", resume); controller.current = undefined; };
  }, []);
  useEffect(() => {
    try { if (!transient) sessionStorage.setItem(storageKey, JSON.stringify(query)); } catch { /* Query remains usable in this mount. */ }
    const wait = controller.current ? auditBegin("F05", "query-debounce") : null;
    auditFields(wait, { configuredMs: HUB_SEARCH_DEBOUNCE_MS, textLength: query.text.length });
    queryWait.current = wait;
    const waited = auditSpan(wait, "deliberate-debounce", "deliberate-wait");
    const timer = setTimeout(() => {
      auditSpanEnd(wait, waited);
      auditCall(wait, "apply-query", () => controller.current?.setQuery(query));
      setApplied(JSON.stringify(query));
      auditFinish(wait);
    }, HUB_SEARCH_DEBOUNCE_MS);
    queryTimer.current = timer;
    return () => { clearTimeout(timer); auditFinish(wait, "superseded", { reason: "query-replaced-or-unmounted" }); };
  }, [query, storageKey, transient]);
  const ensureController = async () => {
    const next = activate(), signal = lifetime.current!.signal;
    // Explicit reference actions do not depend on a pending text debounce.
    clearTimeout(queryTimer.current);
    auditFinish(queryWait.current, "superseded", { reason: "explicit-reference-flush" });
    if (applied !== JSON.stringify(query)) { next.setQuery(query); setApplied(JSON.stringify(query)); }
    const prepared = () => !next.getSnapshot().local.preparing && !next.getSnapshot().archive.preparing;
    if (!prepared()) await new Promise<void>((resolve, reject) => {
      const done = () => { unsubscribe(); signal.removeEventListener("abort", aborted); };
      const aborted = () => { done(); reject(new DOMException("Search closed", "AbortError")); };
      const unsubscribe = next.subscribe(() => { if (prepared()) { done(); resolve(); } });
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted(); else if (prepared()) { done(); resolve(); }
    });
    return next;
  };
  useRuntimeAuditCommit(state, !state.local.preparing || !state.archive.preparing, "hub-search-results");
  return { query, activate, ensureController, setQuery: (next: HubSearchQuery) => {
      const constrained = constrainHubSearchQuery(next, entityKind, dashboard, fixedScope);
      // Invalidate old responses immediately when clearing; preparation remains shared.
      if (dashboard && !constrained.text) controller.current?.setQuery(constrained);
      setStoredQuery(constrained);
    },
    state, controller, current: applied === JSON.stringify(query), retry: () => controller.current?.retry() };
}
