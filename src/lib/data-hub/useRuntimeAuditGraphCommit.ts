import { useLayoutEffect, type RefObject } from "react";
import { auditEnabled, auditGraphEvent, auditResultId } from "./runtimeAudit";

/** The accepted target geometry is observed; animations keep their existing rules. */
export function useRuntimeAuditGraphCommit(value: unknown, ready: boolean, area: string,
  element: RefObject<Element>, acceptedRunId?: string, graphRevision?: string) {
  useLayoutEffect(() => {
    if (!auditEnabled()) return;
    const id = acceptedRunId ?? auditResultId(value); if (!id) return;
    const visibility = () => {
      const node = element.current;
      if (!node) return { visibility: document.visibilityState, graphVisibility: "unmounted" };
      const box = node.getBoundingClientRect(), style = getComputedStyle(node);
      const hidden = !box.width || !box.height || style.display === "none" || style.visibility === "hidden";
      return { visibility: document.visibilityState, graphVisibility: hidden ? "hidden" :
        box.bottom <= 0 || box.right <= 0 || box.top >= innerHeight || box.left >= innerWidth ? "outside-viewport" : "in-viewport" };
    };
    // An empty animation frame or old geometry is not the requested filled graph.
    if (!ready) return () => auditGraphEvent(id, "graph-observation-ended", { area, graphRevision, reason: "not-ready-superseded-or-unmounted", ...visibility() });
    auditGraphEvent(id, "graph-commit", { area, graphRevision, ...visibility(), endpoint: "accepted-target-geometry; animation-may-continue" });
    if (document.visibilityState === "hidden") {
      auditGraphEvent(id, "graph-observation-ended", { area, graphRevision, reason: "hidden-tab", ...visibility() }); return;
    }
    let settled = false;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        settled = true;
        if (document.visibilityState === "hidden") { auditGraphEvent(id, "graph-observation-ended", { area, graphRevision, reason: "hidden-before-render-opportunity", ...visibility() }); return; }
        auditGraphEvent(id, "graph-render-opportunity", { area, graphRevision, ...visibility(), endpoint: "two-requestAnimationFrame-callbacks" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (!settled) auditGraphEvent(id, "graph-observation-ended", { area, graphRevision, reason: element.current ? "superseded-or-effect-replay" : "unmounted", ...visibility() });
    };
  }, [value, ready, area, element, acceptedRunId, graphRevision]);
}
