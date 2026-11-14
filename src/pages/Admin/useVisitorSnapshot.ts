import { useEffect, useRef, useState } from "react";
import { visitorAdminRequest } from "./VisitorMetricsSettings";
import { parseVisitorSnapshot, type Source, type VisitorSnapshot } from "./visitorAnalyticsModel";

function retainFailedSource<T>(next: Source<T>, previous?: Source<T>): Source<T> {
  if (next.state !== "error" || next.data || !previous?.data) return next;
  return { ...next, data: previous.data, asOf: previous.asOf, stale: true,
    ageSeconds: previous.asOf ? Math.max(0, Math.floor((Date.now() - Date.parse(previous.asOf)) / 1000)) : null };
}

const HOUR = 3_600_000;
// Allow the 240s backend contract and another process's 60s read cache to settle.
const HOUR_OFFSET = 5 * 60_000;
// The largest verified stream needs three bounded calls. Four attempts allow
// one extra failure: 4*240s + 3*60s backoff + 60s process cache = 20 minutes.
// One final GET at +20m is bounded; delayed Cloud delivery is still possible.
const RETRY_DELAY = 15 * 60_000;

// The authenticated identity gate remounts this hook when access changes. Every
// automatic update reads saved data; only a deliberate admin action sends POST.
export function useVisitorSnapshot(isAdmin: boolean) {
  const [snapshot, setSnapshot] = useState<VisitorSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshAction = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    let pending: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dueHour = () => Math.floor((Date.now() - HOUR_OFFSET) / HOUR);
    let checkedHour = dueHour();
    let retry: { hour: number; at: number } | null = null;
    const visible = () => document.visibilityState === "visible";
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };
    const schedule = () => {
      clearTimer();
      if (!active || !visible() || pending) return;
      const at = dueHour() > checkedHour ? Date.now() : retry?.at ?? (checkedHour + 1) * HOUR + HOUR_OFFSET;
      timer = setTimeout(tick, Math.max(0, at - Date.now()));
    };
    const load = async (kind: "initial" | "auto" | "retry" | "manual", target = dueHour()) => {
      if (!active || pending) return;
      clearTimer();
      const controller = new AbortController();
      pending = controller;
      if (kind !== "initial") checkedHour = Math.max(checkedHour, target);
      if (kind === "manual") retry = null;
      setBusy(true); setError(null);
      let refreshError = false;
      let next: VisitorSnapshot | null = null;
      try {
        if (kind === "manual" && isAdmin) {
          try { await visitorAdminRequest("refresh", { method: "POST", signal: controller.signal }); }
          catch { if (controller.signal.aborted) return; refreshError = true; }
        }
        next = parseVisitorSnapshot(await visitorAdminRequest("snapshot", { signal: controller.signal }));
        if (!active || controller.signal.aborted) return;
        const value = next;
        setSnapshot(previous => ({ ...value,
          website: retainFailedSource(value.website, previous?.website),
          details: retainFailedSource(value.details, previous?.details),
        }));
        if (refreshError) setError("Die Aktualisierung ist fehlgeschlagen. Der gespeicherte Statistikstand wird angezeigt.");
      } catch {
        if (active && !controller.signal.aborted) setError(refreshError
          ? "Aktualisierung und Datenabruf fehlgeschlagen. Vorhandene Werte bleiben erhalten."
          : "Der Statistikstand konnte nicht geladen werden. Vorhandene Werte bleiben erhalten.");
      } finally {
        if (active && pending === controller) {
          pending = null; setBusy(false);
          // One retry per due hour, including a failed GET. No polling loop.
          if (kind === "auto" && (!next || [next.website, next.details].some(source =>
            source.state === "error" || !source.asOf || Math.floor(Date.parse(source.asOf) / HOUR) < target))) {
            retry = { hour: target, at: Date.now() + RETRY_DELAY };
          }
          schedule();
        }
      }
    };
    function tick() {
      clearTimer();
      if (!active || !visible() || pending) return;
      const hour = dueHour();
      if (hour > checkedHour) { retry = null; void load("auto", hour); }
      else if (retry && retry.at <= Date.now()) {
        const target = retry.hour; retry = null; void load("retry", target);
      } else schedule();
    }
    const onVisibility = () => { if (visible()) tick(); else clearTimer(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);
    refreshAction.current = () => void load("manual");
    // StrictMode's discarded effect must not issue a second initial read.
    void Promise.resolve().then(() => { if (active) void load("initial"); });
    return () => {
      active = false; clearTimer(); pending?.abort(); pending = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
      refreshAction.current = () => {};
    };
  }, [isAdmin]);
  return { snapshot, busy, error, refresh: () => refreshAction.current() };
}
