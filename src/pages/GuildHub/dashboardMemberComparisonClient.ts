import type { DashboardMemberComparisonRequest, DashboardMemberComparisonResult } from "./dashboardMemberComparison";
export type MemberComparisonWorker = Pick<Worker, "postMessage" | "terminate" | "addEventListener" | "removeEventListener">;
/** One batch per mounted guild/stand. Modes and overlay reopen use that result. */
export function startDashboardMemberComparison(input: DashboardMemberComparisonRequest, factory: () => MemberComparisonWorker = () => new Worker(new URL("./dashboardMemberComparison.worker.ts", import.meta.url), { type: "module" })) {
  let worker: MemberComparisonWorker;
  try { worker = factory(); } catch (error) { return { promise: Promise.reject<DashboardMemberComparisonResult>(error), cancel() {} }; }
  const id = crypto.randomUUID();
  let ended = false, rejectRun: (error: Error) => void;
  const cleanup = () => { ended = true; worker.removeEventListener("message", message); worker.removeEventListener("error", error); worker.terminate(); };
  const message = (event: Event) => {
    const data = (event as MessageEvent<{ id: string; result?: DashboardMemberComparisonResult; error?: string }>).data;
    if (ended || data.id !== id) return;
    cleanup(); if (data.error || !data.result) rejectRun(Error(data.error ?? "Missing comparison result")); else resolveRun(data.result);
  };
  const error = () => { if (!ended) { cleanup(); rejectRun(Error("Member comparison worker failed")); } };
  let resolveRun: (result: DashboardMemberComparisonResult) => void;
  const promise = new Promise<DashboardMemberComparisonResult>((resolve, reject) => { resolveRun = resolve; rejectRun = reject; });
  worker.addEventListener("message", message); worker.addEventListener("error", error); try { worker.postMessage({ id, input: { ...input, summaries: input.summaries.map(summary => ({ ...summary, fusionInventorySlices: summary.fusionInventorySlices?.map(slice => ({ ...slice, playerIdentifiers: [], guildIdentifiers: [] })) })) } }); }
  catch (error) { cleanup(); rejectRun!(error instanceof Error ? error : Error(String(error))); }
  return { id, promise, cancel() { if (!ended) { cleanup(); rejectRun(new DOMException("Cancelled", "AbortError")); } } };
}
