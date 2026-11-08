import React from "react";
import { subscribeToLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";

/** Parent action lifetime, independent of workers and committed source writes. */
export function useLocalPlayerProfileAction(context: unknown, resetOpened: boolean) {
  const [profile, setProfile] = React.useState<LocalPlayerProfileModel | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<"missing" | "failed" | null>(null);
  const generation = React.useRef(0);
  const pendingStop = React.useRef<(() => void) | null>(null);
  const activeContext = React.useRef(context);
  activeContext.current = context;
  const mounted = React.useRef(false);
  const close = React.useCallback(() => {
    generation.current++;
    pendingStop.current?.();
    pendingStop.current = null;
    setProfile(null);
    setLoading(false);
    setError(null);
  }, []);
  React.useLayoutEffect(() => {
    mounted.current = true;
    generation.current++;
    pendingStop.current?.();
    pendingStop.current = null;
    setLoading(false);
    setError(null);
    if (resetOpened) setProfile(null);
    return () => { mounted.current = false; generation.current++; pendingStop.current?.(); pendingStop.current = null; };
  }, [context, resetOpened]);
  React.useEffect(() => {
    if (!loading) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [loading, close]);
  const open = React.useCallback(async (build: (allowed: () => boolean) => Promise<LocalPlayerProfileModel | null>, sourceScanId?: string) => {
    pendingStop.current?.();
    pendingStop.current = null;
    const action = ++generation.current;
    const targetContext = activeContext.current;
    const allowed = () => mounted.current && generation.current === action && activeContext.current === targetContext;
    setLoading(true);
    setError(null);
    let stopSource = () => {};
    const invalidateSource = () => {
      if (!allowed()) return;
      generation.current++;
      stopSource();
      if (pendingStop.current === stopSource) pendingStop.current = null;
      setLoading(false);
      setError(null);
    };
    if (sourceScanId) {
      stopSource = subscribeToLocalDataDependencies({ sourceIds: [sourceScanId] }, invalidateSource, invalidateSource);
      pendingStop.current = stopSource;
    }
    try {
      const next = await build(allowed);
      if (!allowed()) return;
      if (next) setProfile(next);
      else setError("missing");
    } catch (failure) {
      if (allowed()) {
        console.error("[LocalPlayerProfile] failed to open observation", failure);
        setError("failed");
      }
    } finally {
      stopSource();
      if (pendingStop.current === stopSource) pendingStop.current = null;
      if (allowed()) setLoading(false);
    }
  }, []);
  return { profile, loading, error, open, close };
}
