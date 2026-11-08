import { useLayoutEffect } from "react";
import { auditEnabled, auditResultId, auditRecordedEvent } from "./runtimeAudit";

/** Observes the commit of this particular accepted value, not an empty first render. */
export function useRuntimeAuditCommit(value: unknown, ready: boolean, area: string, acceptedRunId?: string) {
  useLayoutEffect(() => {
    if (!ready || !auditEnabled()) return;
    const id = acceptedRunId ?? auditResultId(value); if (!id) return;
    auditRecordedEvent(id, "react-commit", { area, visibility: document.visibilityState, viewportVisibility: "unknown" });
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { auditRecordedEvent(id, "presentation-opportunity", { area, visibility: document.visibilityState, measuredPixelPaint: false }); });
    });
    return () => cancelAnimationFrame(frame);
  }, [value, ready, area, acceptedRunId]);
}
