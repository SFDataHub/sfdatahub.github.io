import { AUDIT_NAMES, auditIsRenderObservation, auditIsCommittedView, printAuditOperation } from "./runtimeAuditPresentation";
/** Optional, realm-local observation. This module never coordinates feature work. */
export const DATA_HUB_AUDIT_KEY = "sfh:debug:dataHubRuntimeAudit";
export const AUDIT_LIMITS = { completed: 200, active: 200, spans: 1000, fields: 64, links: 64 } as const;
export type AuditFamily = `F${string}` | `S${string}` | "worker" | "phase";
export type AuditStatus = "completed" | "missing" | "partial" | "failed" | "aborted" | "superseded" | "stale-discarded" | "timeout" | "recording-stopped";
export type AuditFields = Record<string, string | number | boolean | null | undefined>;
type Span = { id: string; parentSpanId?: string; name: string; kind: string; startMs: number; endMs?: number; elapsedMs?: number; fields?: AuditFields };
export type AuditReport = {
  id: string; sessionId: string; realmId: string; timeOrigin: number | null; clock: string;
  routeContextId: string; route: string; family: AuditFamily; action: string; parentId?: string;
  startMs: number; endMs?: number; elapsedMs?: number; status?: AuditStatus;
  spans: Span[]; counts: Record<string, number>; fields: AuditFields;
  links: { id: string; relation: string; retained?: boolean }[];
  droppedSpans: number; droppedFields: number; droppedLinks: number;
  sumSpanElapsedMs?: number; signedTotalMinusSumMs?: number;
  observedLeafCoverageMs?: number; unobservedWallMs?: number;
  coverageComplete: false; outputCallMs?: number; consolePublicationHandled?: boolean;
};
export type AuditRun = { readonly id: string; record?: AuditReport; pending: number; returned: boolean; phase?: Span | null; owner?: AuditRun; lastChildId?: string; graphRevision?: string };
export type AuditEnvelope = { sessionId: string; ownerId: string; realmId: string; workerInstanceId: string; workerJobId: string };
let enabled = false, sessionId = "", realmId = "", sequence = 0, epoch = 0, route = "", routeEpoch = 0;
let current: AuditRun | null = null;
type EntryToken = { run: AuditRun; previous: AuditRun | null; span: Span | null; previousToken: EntryToken | null; previousChild?: string };
let entering: EntryToken | null = null;
const active = new Map<string, AuditRun>();
const completed: AuditReport[] = [];
let promises = new WeakMap<object, string>();
let results = new WeakMap<object, string>();
let dependencies = new WeakMap<object, string>();
let evictedReports = 0, stoppedRuns = 0, diagnosticErrors = 0;
const totals: Record<string, { reports: number; spans: number; droppedSpans: number }> = {};
let output = true;
// IDs and one terminal deadline only; reports remain in the existing bounded ring.
const presentations = new Map<string, { expected: Set<string>; settled: Set<string>; consumerDecision?: boolean; timer?: ReturnType<typeof setTimeout> }>();
const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const safe = (work: () => void) => { try { work(); } catch { diagnosticErrors++; } };
function initialize() {
  if (sessionId) return;
  const tag = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  realmId = `${typeof window === "undefined" ? "worker" : "main"}-${tag}`;
  sessionId = tag;
}
export function auditEnabled() { return enabled; }
export function auditCurrent() { return enabled ? current : null; }
function fields(target: AuditFields, source: AuditFields, report: AuditReport) {
  for (const key of Object.keys(source)) {
    if (key.length > 80 || (!(key in target) && Object.keys(target).length >= AUDIT_LIMITS.fields)) { report.droppedFields++; continue; }
    const value = source[key];
    if (typeof value === "string") { if (value.length > 240) report.droppedFields++; target[key] = value.length > 240 ? value.slice(0, 239) + "…" : value; }
    else if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) target[key] = value;
    else if (value !== undefined) report.droppedFields++;
  }
}
/** Calls made before opt-in have no run. Mid-flight child records are partial observations. */
export function auditBegin(family: AuditFamily, action: string, parent: AuditRun | null = current): AuditRun | null {
  if (!enabled) return null;
  try {
    initialize();
    const selectedRoute = typeof window === "undefined" ? "worker" : window.location.hash.slice(0, 300);
    if (selectedRoute !== route) { route = selectedRoute; routeEpoch++; }
    if (active.size >= AUDIT_LIMITS.active) {
      const oldest = active.values().next().value as AuditRun | undefined;
      if (oldest) auditFinish(oldest, "recording-stopped", { reason: "active-limit", physicalContinues: true });
    }
    const id = `${realmId}:${epoch}:${++sequence}`;
    const parentRecord = parent?.record ?? (parent ? completed.find(r => r.id === parent.id) : undefined);
    const record: AuditReport = { id, sessionId, realmId, timeOrigin: typeof performance !== "undefined" ? performance.timeOrigin : null,
      clock: typeof performance !== "undefined" ? "performance-monotonic" : "date-nonmonotonic-fallback",
      routeContextId: `${sessionId}:route:${routeEpoch}`, route, family, action: action.slice(0, 200), parentId: parent?.id,
      startMs: now(), spans: [], counts: {}, fields: { observation: "starts-at-instrumented-call; earlier work may be unrecorded",
        operationId: parentRecord?.fields.operationId ?? id,
        consumerArea: parentRecord?.fields.consumerArea ?? AUDIT_NAMES[family]?.[0], trigger: parentRecord?.fields.trigger ?? "unbekannt",
        consumer: parentRecord?.fields.consumer, consumerId: parentRecord?.fields.consumerId,
        ...(auditIsRenderObservation(family, action) ? { consoleRole: auditIsCommittedView(family, action) ? "committed-view" : "observation", trigger: "render-memo-evaluation" } : {}) }, links: [],
      droppedSpans: 0, droppedFields: 0, droppedLinks: 0, coverageComplete: false };
    const run: AuditRun = { id, record, pending: 0, returned: false }; active.set(id, run);
    if (typeof window !== "undefined" && (family === "F16" || family === "F23")) {
      const cause = window.history.state?.usr?.__sfhAuditCauseId;
      if (typeof cause === "string" && cause.length <= 200) auditLink(run, cause, "navigation-cause");
    }
    if (parent && parentRecord) { parent.lastChildId = id; auditLink(parent.record ? parent : retainedRun(parent.id), id, family.startsWith("S") ? "preparation" : "child"); }
    return run;
  } catch { diagnosticErrors++; return null; }
}
export function auditPhaseBegin(action: string, parent: AuditRun | null = current, kind = "async-container"): AuditRun | null {
  if (!enabled || !parent?.record) return null;
  const phase = auditSpan(parent, action, kind);
  return { id: parent.id, get record() { return parent.record; }, owner: parent, phase, pending: 0, returned: false };
}
export function auditFields(run: AuditRun | null, values: AuditFields) {
  if (!run?.record) return;
  safe(() => fields(run.record!.fields, values, run.record!));
}
export function auditDiscard(run: AuditRun) { if (run.record) { run.record.status = "stale-discarded"; auditFields(run, { discarded: true, physicalContinues: true }); } }
export function auditCount(run: AuditRun | null, name: string, value = 1) {
  const record = run?.record; if (!record) return;
  if (!(name in record.counts) && Object.keys(record.counts).length >= AUDIT_LIMITS.fields) { record.droppedFields++; return; }
  const key = name.slice(0, 80);
  if (Number.isFinite(value)) record.counts[key] = (record.counts[key] ?? 0) + value;
}
export function auditLink(run: AuditRun | null, id: string | undefined, relation: string) {
  const record = run?.record; if (!record || !id) return;
  if (record.links.some(link => link.id === id && link.relation === relation)) return;
  if (record.links.length >= AUDIT_LIMITS.links) { record.droppedLinks++; return; }
  record.links.push({ id, relation: relation.slice(0, 80) });
}
/** Refer to real accepted input identities; never infer sharing from names or routes. */
export function auditObserveInputs(run: AuditRun | null, inputs: readonly unknown[]) {
  if (!run?.record) return;
  safe(() => {
    for (const input of inputs) {
      const id = auditResultId(input); if (!id || id === run.id) continue;
      let target = active.get(id) ?? retainedRun(id);
      auditLink(run, id, "input-result");
      const bundle = (run.record!.family === "F10" || run.record!.family === "F08" && run.record!.action.startsWith("main:")) && run.record!.fields.consoleRole === "observation";
      if (bundle && !target?.record) {
        // Keep observations together by the actual historical input ID even if
        // its report was evicted. This group represents observations only; it
        // cannot certify the old request's trigger, duration or physical work.
        const existing = completed.find(r => r.action === "render-observations-unavailable-owner" && r.fields.historicalOwnerId === id);
        if (existing) target = retainedRun(existing.id);
        else {
          const action = run.record!.action;
          run.record!.action = "render-observations-unavailable-owner";
          auditFields(run, { historicalOwnerId: id, ownerDetails: "unbekannt; evicted-or-unrecorded", trigger: "unbekannt", elapsedMeaning: "first-observation-only", operationId: id });
          run.phase = auditSpan(run, `render:${action}`, "render-container");
          auditCount(run, "renderObservations");
          return;
        }
      }
      if (bundle && target?.record) {
        // Card projections are details of the real accepted cards request, even
        // after its console group has been published. No per-card report chain.
        const observation = run.record!;
        active.delete(run.id);
        (run as { id: string }).id = target.id;
        run.record = target.record; run.owner = target;
        run.phase = auditSpan(target, `render:${observation.action}`, "render-container", { observationId: observation.id });
        auditCount(target, "renderObservations");
        return;
      }
      if (!run.record!.parentId && run.record!.fields.consoleRole === "observation") {
        run.record!.parentId = id;
        auditFields(run, { operationId: target?.record?.fields.operationId ?? id, consumerArea: target?.record?.fields.consumerArea });
      }
      auditLink(target, run.id, "render-observation");
    }
  });
}
function retainedRun(id: string): AuditRun | null {
  return completed.some(r => r.id === id) ? { id, get record() { return completed.find(r => r.id === id); }, pending: 0, returned: false } : null;
}
export function auditSpan(run: AuditRun | null, name: string, kind = "async-elapsed", values?: AuditFields): Span | null {
  const record = run?.record; if (!record) return null;
  if (record.spans.length >= AUDIT_LIMITS.spans) { record.droppedSpans++; return null; }
  try {
    const span: Span = { id: `${run!.id}:span:${record.spans.length + 1}`, parentSpanId: run?.phase?.id, name: name.slice(0, 160), kind, startMs: now() };
    if (values) { span.fields = {}; fields(span.fields, values, record); }
    record.spans.push(span); return span;
  } catch { diagnosticErrors++; return null; }
}
export function auditSpanEnd(run: AuditRun | null, span: Span | null) {
  if (!run?.record || !span || span.endMs !== undefined) return;
  safe(() => { span.endMs = now(); span.elapsedMs = span.endMs - span.startMs; });
}
export function auditEvent(run: AuditRun | null, name: string, values?: AuditFields) {
  const span = auditSpan(run, name, "event", values); auditSpanEnd(run, span);
}
/** Preserve existing diagnostics, without pretending their emission time is a measured interval. */
export function auditDiagnostic(run: AuditRun | null, entry: { phase: string; durationMs: number; count?: number; details?: AuditFields }) {
  auditCount(run, "legacyDiagnosticEntries");
  auditCount(run, "legacyReportedDurationMsNonAdditive", entry.durationMs);
  auditEvent(run, `legacy:${entry.phase}`, { ...entry.details, reportedDurationMs: entry.durationMs,
    count: entry.count, durationUnit: "ms", nonAdditive: true,
    measurement: ["active-source-selection", "analytics-read-mode", "local-first-acquisition", "local-first-acquisition-request"].includes(entry.phase)
      ? "status-marker" : "existing-measurement; boundaries-not-retained" });
}
function reportHandle(id: string | undefined) { return id ? active.get(id) ?? retainedRun(id) : null; }
/** Link evidence is bounded; an identity alone does not certify its old context. */
export function auditDetailsStatus(id: string | undefined) {
  return !enabled || !id ? "unknown" : reportHandle(id)?.record ? "retained" : "not-retained";
}
/** Wait for the existing hook's decision, never extend the execution interval. */
export function auditExpectConsumer(run: AuditRun | null) {
  if (!run?.record || typeof window === "undefined") return;
  auditFields(run, { consumerDecision: "pending", measuredPixelPaint: false });
  presentations.set(run.id, { expected: new Set(), settled: new Set(), consumerDecision: true });
}
export function auditExpectGraph(run: AuditRun | null) {
  if (!run?.record || typeof window === "undefined") return;
  auditFields(run, { awaitGraph: true });
  if (!presentations.has(run.id)) presentations.set(run.id, { expected: new Set(), settled: new Set() });
}
export function auditPrepareGraph(run: AuditRun | null) {
  if (!run?.record) return;
  let parent = reportHandle(run.record.parentId);
  const seen = new Set<string>();
  while (parent?.record && !seen.has(parent.id)) {
    seen.add(parent.id);
    if (presentations.has(parent.id)) return;
    parent = reportHandle(parent.record.parentId);
  }
  // The model is an independent action on an already prepared input.
  run.record.parentId = undefined;
  auditFields(run, { operationId: run.id, consoleRole: "committed-view", startBoundary: "graph-model-memo", trigger: "graph-context-memo" });
  auditExpectGraph(run);
}
/** An input still awaiting its graph belongs to this operation. A completed,
 * already published input is historical preparation, never a new reaction start. */
export function auditGraphBegin(family: AuditFamily, area: string, inputId?: string): AuditRun | null {
  if (!enabled) return null;
  let parent = reportHandle(inputId), owner: AuditRun | null = null;
  if (family === "F10" && parent?.record) {
    const phase = auditPhaseBegin(`graph:${area}`, parent, "render-container");
    if (phase?.phase) {
      phase.graphRevision = phase.phase.id;
      const waiting = presentations.get(parent.id);
      if (waiting && waiting.expected.size < AUDIT_LIMITS.spans) waiting.expected.add(phase.graphRevision);
      else if (waiting) auditFields(parent, { graphExpectationsTruncated: true });
    }
    auditCount(parent, "graphRenderObservations");
    return phase;
  }
  const seen = new Set<string>();
  while (parent?.record && !seen.has(parent.id)) {
    seen.add(parent.id);
    if (presentations.has(parent.id) && !parent.record.consolePublicationHandled) { owner = parent; break; }
    parent = reportHandle(parent.record.parentId);
  }
  const run = auditBegin(family, "graph-geometry", owner);
  if (!run?.record) return run;
  auditFields(run, { graphArea: area, graphOperationId: owner?.id ?? run.id, trigger: "graph-context-render",
    startBoundary: "graph-component-render", consoleRole: owner ? "observation" : "committed-view" });
  if (inputId) auditLink(run, inputId, "input-result");
  auditExpectGraph(owner ?? run);
  const waiting = presentations.get(owner?.id ?? run.id);
  if (waiting && waiting.expected.size < AUDIT_LIMITS.spans) waiting.expected.add(run.id);
  else if (waiting) auditFields(owner ?? run, { graphExpectationsTruncated: true });
  return run;
}
function publish(record: AuditReport) {
  if (record.consolePublicationHandled) return;
  record.consolePublicationHandled = true;
  const waiting = presentations.get(record.id); if (waiting?.timer) clearTimeout(waiting.timer);
  presentations.delete(record.id);
  const parent = reportHandle(record.parentId);
  if (!output || typeof window === "undefined" || parent && parent.record?.fields.consoleRole !== "observation") return;
  const at = now();
  safe(() => printAuditOperation(record, [...completed, ...[...active.values()].flatMap(r => r.record ? [r.record] : [])], evictedReports));
  record.outputCallMs = now() - at;
}
/** Only the matching geometry revision can complete a graph observation. */
export function auditGraphEvent(id: string | undefined, name: "graph-commit" | "graph-render-opportunity" | "graph-observation-ended", values: AuditFields) {
  if (!enabled) return;
  const run = reportHandle(id); if (!run?.record) return;
  const root = reportHandle(String(run.record.fields.graphOperationId ?? id));
  const revision = typeof values.graphRevision === "string" ? values.graphRevision : id!;
  const requestedRevision = root?.record && (!root.record.consolePublicationHandled || root.record.spans.some(s => s.name === "graph-commit" && s.fields?.graphRevision === revision));
  const measured = requestedRevision && root?.record && (!root.record.status || ["completed", "partial"].includes(root.record.status)) &&
    !root.record.droppedSpans && !root.record.droppedFields && !root.record.droppedLinks && !root.record.fields.graphExpectationsTruncated &&
    !run.record.droppedSpans && !run.record.droppedFields && !run.record.droppedLinks;
  const reactionMs = measured && name !== "graph-observation-ended" ? now() - root.record!.startMs : undefined;
  const details = { ...values, graphRevision: revision, reactionMs, reactionScope: requestedRevision ? "current-request" : "historical-input-observation", startBoundary: root?.record?.fields.startBoundary ?? "instrumented-request-call", measuredPixelPaint: false };
  auditEvent(run, name, details);
  if (root?.id !== id) auditEvent(root, name, details);
  if (!root?.record) return;
  const waiting = presentations.get(root.id);
  if (name === "graph-commit" && waiting && waiting.expected.size < AUDIT_LIMITS.spans) waiting.expected.add(revision);
  if (name !== "graph-commit" && waiting?.expected.has(revision)) waiting.settled.add(revision);
  if (root.record.endMs !== undefined && waiting && waiting.expected.size > 0 && waiting.expected.size === waiting.settled.size &&
    root.record.spans.some(s => s.name === "graph-render-opportunity")) publish(root.record);
}
/** The ambient owner exists only for this synchronous call, never across an await. */
export function auditCall<T>(run: AuditRun | null, name: string, work: () => T, kind = "sync-elapsed"): T {
  if (!enabled) return work();
  // A real consumer callback can still refer to its bounded, completed report.
  // Its later observations never reopen output or recompute operation duration.
  if (run && !run.record) run = retainedRun(run.id);
  if (!run?.record) return work();
  const span = auditSpan(run, name, kind), previous = current; current = run;
  const previousChild = run.lastChildId;
  let asyncObservation = false;
  try {
    const value = work();
    safe(() => {
      if (value && typeof (value as { then?: unknown }).then === "function") {
        if (run.lastChildId !== previousChild && run.lastChildId) promises.set(value as object, run.lastChildId!);
        if (kind !== "sync-elapsed") {
          asyncObservation = true;
          void (value as unknown as Promise<unknown>).then(() => auditSpanEnd(run, span), () => auditSpanEnd(run, span));
        }
      }
    });
    return value;
  } finally { current = previous; if (!asyncObservation) auditSpanEnd(run, span); }
}
/** Argument evaluation enters and leaves synchronously, preserving TS narrowing. */
export function auditEnter(run: AuditRun | null, name: string, kind = "async-elapsed"): EntryToken | null {
  if (!run?.record) return null;
  const token: EntryToken = { run, previous: current, span: auditSpan(run, name, kind), previousToken: entering, previousChild: run.lastChildId };
  current = run; entering = token; return token;
}
export function auditValue<T>(run: AuditRun | null, token: ReturnType<typeof auditEnter>, value: T): T {
  if (!run || !token) return value;
  current = token.previous; if (entering === token) entering = token.previousToken;
  safe(() => {
  if (token.span?.kind === "async-elapsed" && value && typeof (value as { then?: unknown }).then === "function") {
    const id = promises.get(value as object); if (id) auditLink(run, id, "await-existing-promise");
    else if (run.lastChildId && run.lastChildId !== token.previousChild) promises.set(value as object, run.lastChildId);
    void (value as unknown as Promise<unknown>).then(() => auditSpanEnd(run, token.span), () => auditSpanEnd(run, token.span));
  } else auditSpanEnd(run, token.span);
  });
  return value;
}
export function auditCaught(run: AuditRun | null, error: unknown) {
  if (!run?.record) return;
  while (entering?.run === run) { current = entering.previous; auditSpanEnd(run, entering.span); entering = entering.previousToken; }
  auditFields(run, { caughtErrorClass: error instanceof Error ? error.name : "unknown" });
  run.record.status = "partial";
}
export function auditAssociate(run: AuditRun | null, value: unknown) {
  if (!run?.record || !value || typeof value !== "object") return;
  results.set(value, run.id);
}
export function auditAccept(run: AuditRun | null, value: unknown) {
  if (!run?.record) return;
  safe(() => auditResult(run, value)); auditEvent(run, "accepted-state");
}
export function auditResultId(value: unknown) { return enabled && value && typeof value === "object" ? results.get(value) : undefined; }
export function auditResultTrigger(value: unknown) { return reportHandle(auditResultId(value))?.record?.fields.trigger; }
/** Weak dependency identity, separate from job/result sharing; retains no payload. */
export function auditDependencyId(value: unknown) {
  if (!enabled || !value || typeof value !== "object" && typeof value !== "function") return undefined;
  let id = dependencies.get(value as object); if (!id) { id = auditId("dependency")!; dependencies.set(value as object, id); }
  return id;
}
export function associateAuditResultId(value: object, id: string | undefined) { if (enabled && id) results.set(value, id); }
export function auditRecordedEvent(id: string | undefined, name: string, values?: AuditFields) {
  if (!enabled || !id) return;
  const handle = reportHandle(id); const record = handle?.record; if (!record) return;
  const observedAt = now();
  auditEvent(handle, name, values);
  if (name === "projection-accepted" || name === "projection-superseded") {
    const late = record.consolePublicationHandled && record.fields.consumerDecision === "pending";
    auditFields(handle, { consumerDecision: name === "projection-accepted" ? "accepted" : "superseded",
      consumerDecisionMs: observedAt });
    if (record.endMs !== undefined && presentations.get(id)?.consumerDecision) publish(record);
    // A terminal pending group is never reopened. Identify its late observation
    // without another completion group or a new execution duration.
    if (late && output && typeof window !== "undefined") safe(() => console.info(
      `Favoritenansicht · späte Consumerentscheidung: ${name === "projection-accepted" ? "angenommen" : "verworfen"}`,
      { ownerId: id, consumerDecisionMs: observedAt, executionEndMs: record.endMs, executionElapsedMs: record.elapsedMs }));
  }
  if (active.has(id)) return;
  if (name === "react-commit" && record.fields.consoleRole === "committed-view" && !record.fields.awaitGraph && !record.consolePublicationHandled) {
    record.consolePublicationHandled = true;
    const parent = record.parentId ? active.get(record.parentId)?.record ?? completed.find(r => r.id === record.parentId) : undefined;
    if (output && typeof window !== "undefined" && !parent) safe(() => {
      const at = now();
      try { printAuditOperation(record, [...completed, ...[...active.values()].flatMap(r => r.record ? [r.record] : [])], evictedReports); }
      finally { record.outputCallMs = now()-at; }
    });
  }
}
export function auditAwait<T>(run: AuditRun | null, name: string, work: () => T): T {
  if (!run?.record) return work();
  const span = auditSpan(run, name), previous = current; current = run;
  try {
    const previousChild = run.lastChildId;
    const value = work();
    safe(() => {
    if (value && typeof (value as { then?: unknown }).then === "function") {
      const id = promises.get(value as object); if (id) auditLink(run, id, "await-existing-promise");
      else if (run.lastChildId && run.lastChildId !== previousChild) promises.set(value as object, run.lastChildId);
      // Observe the original promise. Return it unchanged; never replay work.
      void (value as unknown as Promise<unknown>).then(() => auditSpanEnd(run, span), () => auditSpanEnd(run, span));
    } else auditSpanEnd(run, span);
    });
    return value;
  } catch (error) { auditSpanEnd(run, span); throw error; }
  finally { current = previous; }
}
export function auditError(run: AuditRun | null, error: unknown) {
  while (entering?.run === run) { current = entering.previous; auditSpanEnd(run, entering.span); entering = entering.previousToken; }
  if (!run?.record) return;
  safe(() => {
  const name = error instanceof Error ? error.name : "unknown";
  if (run.owner) { auditEvent(run, "phase-error", { errorClass: name, phase: run.phase?.name }); return; }
  const status = name === "AbortError" ? "aborted" : error instanceof Error && /budget exceeded|timeout/i.test(error.message) ? "timeout" : "failed";
  auditFields(run, { errorClass: name }); run.record!.status = status;
  });
}
/** Returns the exact original result and records only compact shape information. */
export function auditReturn<T>(run: AuditRun | null, value: T): T {
  if (!run?.record) return value;
  safe(() => {
  if (value && typeof (value as { then?: unknown }).then === "function") {
    run.returned = true;
    const existing = promises.get(value as object);
    if (existing && existing !== run.id) auditLink(run, existing, "in-flight-join");
    else if (!run.owner) promises.set(value as object, run.id);
    void (value as unknown as Promise<unknown>).then(result => { safe(() => auditResult(run, result)); auditFinish(run); }, error => { auditError(run, error); auditFinish(run); });
  } else { safe(() => auditResult(run, value)); }
  });
  return value;
}
function auditResult(run: AuditRun, value: unknown) {
  if (!run.record) return;
  auditAssociate(run, value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    // Identity annotations only; WeakMap keys neither retain nor copy payloads.
    for (const key of ["value", "index", "intervals", "data", "command", "members", "state"]) {
      const child = (value as Record<string, unknown>)[key];
      if (child && typeof child === "object") auditAssociate(run, child);
    }
  }
  if (Array.isArray(value)) {
    auditCount(run, "resultRows", value.length);
    if (!run.owner) auditFields(run, { resultRows: value.length });
  }
  else if (value === null && !run.owner) run.record.status ??= "missing";
  else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["players", "guilds", "playerRows", "guildRows", "members", "snapshots", "intervals", "hits", "sources", "entries", "observations"]) {
      if (Array.isArray(object[key])) {
        auditCount(run, `output:${key}`, object[key].length);
        if (!run.owner) auditFields(run, { [`result:${key}`]: object[key].length });
      }
    }
    for (const key of ["status", "source", "sourceScanId", "localScanId", "archiveScanId", "sourceGeneration", "networkAccessed", "workerRan", "cacheHits", "cacheMisses", "totalRows", "windowStart"]) {
      const v = object[key]; if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") auditFields(run, { [key]: v });
      else if (Array.isArray(v)) auditCount(run, key, v.length);
    }
    if (run.owner) return; // Intermediate phase results never decide the enclosing job status.
    if (object.status === "partial" || object.status === "empty" || object.status === "missing") run.record.status = object.status === "partial" ? "partial" : "missing";
    if (object.status === "cancelled" || object.status === "aborted") run.record.status = "aborted";
    if (object.status === "stale" || object.status === "superseded") run.record.status = "stale-discarded";
    if (object.status === "error" || object.status === "failed") run.record.status = "failed";
  }
  // Deliberately no traversal, object retention or JSON sizing of feature results.
}
export function auditLeave(run: AuditRun | null) { if (run && !run.returned) auditFinish(run); }
export function auditFinish(run: AuditRun | null, status?: AuditStatus, values?: AuditFields) {
  const record = run?.record; if (!record) return;
  if (run?.owner) { auditSpanEnd(run.owner, run.phase ?? null); return; }
  safe(() => {
    if (values) fields(record.fields, values, record);
    record.endMs = now(); record.elapsedMs = record.endMs - record.startMs; record.status = status ?? record.status ?? "completed";
    for (const span of record.spans) if (span.endMs === undefined) { span.endMs = record.endMs; span.elapsedMs = span.endMs - span.startMs; fields(span.fields ??= {}, { recordingEndedBeforeOperation: true }, record); }
    record.sumSpanElapsedMs = record.spans.reduce((sum, span) => sum + (span.elapsedMs ?? 0), 0);
    record.signedTotalMinusSumMs = record.elapsedMs - record.sumSpanElapsedMs;
    // Only narrow measured intervals; async containers do not explain their interiors.
    const intervals = record.spans.filter(s => s.kind === "sync-elapsed" && s.endMs !== undefined).map(s => [Math.max(record.startMs, s.startMs), Math.min(record.endMs!, s.endMs!)]).sort((a,b) => a[0]-b[0]);
    let coverage = 0, end = record.startMs;
    for (const [a,b] of intervals) { if (b > Math.max(a,end)) coverage += b-Math.max(a,end); end = Math.max(end,b); }
    record.observedLeafCoverageMs = coverage; record.unobservedWallMs = record.elapsedMs-coverage;
    active.delete(run!.id); run!.record = undefined;
    if (record.status === "recording-stopped") stoppedRuns++;
    if (record.family.length <= 16 && (record.family in totals || Object.keys(totals).length < 64)) {
      const total = totals[record.family] ??= { reports: 0, spans: 0, droppedSpans: 0 };
      total.reports++; total.spans += record.spans.length; total.droppedSpans += record.droppedSpans;
    }
    completed.push(record); if (completed.length > AUDIT_LIMITS.completed) {
      const removed = completed.shift()!; const waiting = presentations.get(removed.id);
      if (waiting?.consumerDecision) { fields(removed.fields, { consumerDetailsUnavailable: true }, removed); publish(removed); }
      if (waiting?.timer) clearTimeout(waiting.timer); presentations.delete(removed.id); evictedReports++;
    }
    const parentRecord = record.parentId ? active.get(record.parentId)?.record ?? completed.find(r => r.id === record.parentId) : undefined;
    // Even a later physical completion stays a detail of its real consumers.
    // Their terminal status never changes the source's independent status.
    const waiting = presentations.get(record.id);
    if (waiting && ["completed", "partial"].includes(record.status)) {
      if (waiting.consumerDecision && record.fields.consumerDecision !== "pending") { publish(record); return; }
      // A single bounded terminal deadline, never a feature timer or polling loop.
      waiting.timer = setTimeout(() => {
        const retained = reportHandle(record.id)?.record;
        if (retained) { fields(retained.fields, waiting.consumerDecision ? { consumerObservationDeadline: true } : { graphObservationDeadline: true }, retained); publish(retained); }
      }, 1000);
    } else if (waiting) {
      if (waiting.consumerDecision) fields(record.fields, { consumerDecision: "not-accepted", consumerDecisionReason: record.status }, record);
      presentations.delete(record.id); publish(record);
    }
    if (!waiting && output && typeof window !== "undefined" && !["observation", "committed-view"].includes(String(record.fields.consoleRole)) && (!parentRecord || parentRecord.fields.consoleRole === "observation")) {
      const at = now();
      try {
        if (record.parentId && !parentRecord) fields(record.fields, { parentDetailsUnavailable: true }, record);
        publish(record);
      }
      catch { diagnosticErrors++; }
      record.outputCallMs = now()-at;
    }
  });
  // A failed logger must still release the collector.
  active.delete(run!.id); run!.record = undefined;
}
export function auditBindPromise(run: AuditRun | null, promise: object) { if (run?.record) promises.set(promise, run.id); }
export function auditAliasPromise(to: object, from: object) { if (enabled) { const id = promises.get(from); if (id) promises.set(to, id); } }
export function auditId(prefix: string) { if (!enabled) return undefined; initialize(); return `${realmId}:${epoch}:${prefix}:${++sequence}`; }
export function auditPromiseId(promise: object) { return enabled ? promises.get(promise) : undefined; }
export function auditWorkerEnvelope(run: AuditRun | null, workerInstanceId: string, workerJobId: string): AuditEnvelope | undefined {
  if (!run?.record) return undefined;
  return { sessionId: run.record.sessionId, ownerId: run.id, realmId, workerInstanceId, workerJobId };
}
export function auditAcceptWorker(envelope?: AuditEnvelope): AuditRun | null {
  if (!envelope || typeof envelope.ownerId !== "string" || envelope.ownerId.length > 200 || typeof envelope.sessionId !== "string") { if (enabled) stopRecording("worker-request-without-opt-in"); enabled = false; return null; }
  enabled = true; initialize(); sessionId = envelope.sessionId.slice(0, 100);
  const run = auditBegin("worker", "request");
  if (run?.record) { run.record.parentId = envelope.ownerId; auditFields(run, { workerInstanceId: envelope.workerInstanceId, workerJobId: envelope.workerJobId }); }
  return run;
}
export function auditWorkerResult(run: AuditRun | null, status: AuditStatus = "completed") {
  if (!run?.record) return undefined;
  const record = run.record;
  // Existing worker flights remain distinct. Fold their bounded observations into
  // the existing reply so no additional message or unbounded remote ring is needed.
  safe(() => {
    const byId = new Map(completed.map(child => [child.id, child]));
    const pendingIds = record.links.map(link => link.id);
    const visited = new Set<string>();
    let folded = 0;
    while (pendingIds.length && folded < AUDIT_LIMITS.completed) {
      const id = pendingIds.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const child = byId.get(id);
      if (!child) { auditCount(run, "workerChildReportsUnavailable"); continue; }
      folded++;
      for (const link of child.links) if (!visited.has(link.id)) pendingIds.push(link.id);
      auditEvent(run, "worker-child-report", { childId: child.id, childFamily: child.family, childAction: child.action, childStatus: child.status, childStartMs: child.startMs, childEndMs: child.endMs, childElapsedMs: child.elapsedMs, childDroppedSpans: child.droppedSpans, childDroppedFields: child.droppedFields, childDroppedLinks: child.droppedLinks });
      auditCount(run, "workerChildDroppedSpans", child.droppedSpans);
      auditCount(run, "workerChildDroppedFields", child.droppedFields);
      auditCount(run, "workerChildDroppedLinks", child.droppedLinks);
      for (const [key, value] of Object.entries(child.counts)) auditCount(run, `${child.family}:${key}`, value);
      for (const span of child.spans) {
        const target = auditSpan(run, `child:${child.family}:${span.name}`, "worker-child-interval", { ...span.fields, childId: child.id, childSpanId: span.id, childParentSpanId: span.parentSpanId, originalKind: span.kind, originalStartMs: span.startMs, originalEndMs: span.endMs, originalElapsedMs: span.elapsedMs });
        if (target) { target.startMs = span.startMs; target.endMs = span.endMs; target.elapsedMs = span.elapsedMs; }
        auditSpanEnd(run, target);
      }
    }
  });
  auditFinish(run, status); return record;
}
export function auditMergeWorker(run: AuditRun | null, report?: AuditReport) {
  if (!run?.record || !report) return;
  safe(() => {
    if (report.parentId !== run.id) return;
    auditEvent(run, "worker-result", { workerJobId: report.id, workerRealmId: report.realmId, workerElapsedMs: report.elapsedMs, workerTimeOrigin: report.timeOrigin, workerClock: report.clock, workerStatus: report.status });
    for (const [key, value] of Object.entries(report.counts)) auditCount(run, `worker:${key}`, value);
    // Original realm/timeOrigin and measured boundaries are retained. Main receipt
    // timestamps are not worker durations and never enter Main interval coverage.
    for (const span of report.spans.slice(0, AUDIT_LIMITS.spans)) {
      const added = auditSpan(run, `worker:${span.name}`, "worker-interval", { translatedToMainClock: false, ...span.fields, realmId: report.realmId, timeOrigin: report.timeOrigin, workerSpanId: span.id, workerParentSpanId: span.parentSpanId, originalKind: span.kind, workerStartMs: span.startMs, workerEndMs: span.endMs, workerElapsedMs: span.elapsedMs });
      const workerOrigin = report.timeOrigin, mainOrigin = run.record?.timeOrigin;
      if (added && typeof workerOrigin === "number" && typeof mainOrigin === "number" && Number.isFinite(workerOrigin) && Number.isFinite(mainOrigin) && Number.isFinite(span.startMs) && typeof span.endMs === "number" && Number.isFinite(span.endMs)) {
        added.startMs = workerOrigin + span.startMs - mainOrigin;
        added.endMs = workerOrigin + span.endMs - mainOrigin;
        added.elapsedMs = span.elapsedMs ?? span.endMs - span.startMs;
        if (added.fields) added.fields.translatedToMainClock = true;
      } else if (added?.fields) added.fields.translatedToMainClock = false;
      auditSpanEnd(run, added);
    }
    auditCount(run, "workerDroppedSpans", report.droppedSpans);
    auditCount(run, "workerDroppedFields", report.droppedFields);
    auditCount(run, "workerDroppedLinks", report.droppedLinks);
  });
}
function stopRecording(reason: string) {
  for (const [id, waiting] of presentations) {
    if (waiting.timer) clearTimeout(waiting.timer);
    const record = completed.find(r => r.id === id);
    if (waiting.consumerDecision && record) { fields(record.fields, { consumerObservationStopped: reason }, record); publish(record); }
  }
  presentations.clear();
  for (const run of [...active.values()]) auditFinish(run, "recording-stopped", { reason, physicalContinues: true });
  current = null; entering = null; promises = new WeakMap(); results = new WeakMap(); dependencies = new WeakMap(); epoch++;
}
export const dataHubRuntimeAudit = {
  enable() { safe(() => { if (typeof localStorage !== "undefined") localStorage.setItem(DATA_HUB_AUDIT_KEY, "1"); }); enabled = true; initialize(); return this.status(); },
  disable() { enabled = false; safe(() => { if (typeof localStorage !== "undefined") localStorage.removeItem(DATA_HUB_AUDIT_KEY); }); stopRecording("disabled"); return this.status(); },
  status() { return { enabled, sessionId: sessionId || null, realmId: realmId || null, active: active.size, completed: completed.length, evictedReports, stoppedRuns, diagnosticErrors, limits: AUDIT_LIMITS, totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, { ...value }])) }; },
  snapshot() {
    const retained = new Set([...completed.map(r => r.id), ...active.keys()]);
    return { ...this.status(), reports: [...completed, ...[...active.values()].flatMap(r => r.record ? [r.record] : [])].map(r => ({ ...r, fields: { ...r.fields }, counts: { ...r.counts }, spans: r.spans.map(s => ({ ...s, fields: s.fields ? { ...s.fields } : undefined })), links: r.links.map(l => ({ ...l, retained: retained.has(l.id) })) })) };
  },
  clear() { stopRecording("cleared"); completed.length = 0; evictedReports = 0; stoppedRuns = 0; for (const key of Object.keys(totals)) delete totals[key]; return this.status(); },
  console(value: boolean) { output = value; return this.status(); },
};
declare global { interface Window { sfhDataHubRuntimeAudit: typeof dataHubRuntimeAudit } }
if (typeof window !== "undefined") {
  safe(() => { enabled = localStorage.getItem(DATA_HUB_AUDIT_KEY) === "1"; if (enabled) initialize(); });
  safe(() => { window.sfhDataHubRuntimeAudit = dataHubRuntimeAudit; });
  window.addEventListener("storage", event => { if (event.key === DATA_HUB_AUDIT_KEY || event.key === null) { const next = event.newValue === "1"; if (!next && enabled) stopRecording("storage-disabled"); enabled = next; } });
}
