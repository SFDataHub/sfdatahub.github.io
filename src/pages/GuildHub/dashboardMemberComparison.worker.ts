/// <reference lib="webworker" />
import { loadDashboardMemberComparison, type DashboardMemberComparisonRequest } from "./dashboardMemberComparison";
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<{ id: string; input: DashboardMemberComparisonRequest }>) => {
  try { scope.postMessage({ id: event.data.id, result: await loadDashboardMemberComparison(event.data.input) }); }
  catch (error) { scope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) }); }
};
