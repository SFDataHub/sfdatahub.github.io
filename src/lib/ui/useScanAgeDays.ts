import { useEffect, useReducer } from "react";
import { getScanAgeDays } from "./formatScanDateTimeLabel";

/** Refresh presentation at local midnight and after a suspended tab resumes.
 * Keep observation timestamps in prepared models, never a cached age. */
export function useScanAgeDays(scanAt: unknown): number | null {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, midnight.getTime() - now.getTime() + 50);
    };
    const update = () => { refresh(); schedule(); };
    schedule();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return getScanAgeDays(scanAt);
}
