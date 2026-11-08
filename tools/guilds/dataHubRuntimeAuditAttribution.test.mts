import { outputPath, artifactPath } from '../codex/workspace.mjs';
import "fake-indexeddb/auto";
import "./fixtures/localDataCoordination/nodeLocks.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// A controlled Main realm, real collector and real store acceptance logic.
const native = { groupCollapsed: console.groupCollapsed, groupEnd: console.groupEnd, log: console.log, table: console.table, info: console.info };
const previousChannel = globalThis.BroadcastChannel;
(globalThis as any).BroadcastChannel = undefined;
(globalThis as any).window = { location: { hash: "#/data-hub/player-hub" }, history: { state: {} }, addEventListener() {}, removeEventListener() {} };
(globalThis as any).document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
const audit = await import("../../src/lib/data-hub/runtimeAudit.ts");
const { auditConsoleSummary } = await import("../../src/lib/data-hub/runtimeAuditPresentation.ts");
const { HubFavoritesStore, hubFavoritesRecordAudit } = await import("../../src/lib/data-hub/hubFavoritesStore.ts");
const { migrateGuildFavorites } = await import("../../src/lib/data-hub/hubFavoritesContract.ts");
const { projectHubFavorites } = await import("../../src/lib/data-hub/hubFavoritesProjection.ts");
const api = audit.dataHubRuntimeAudit;
const evidence = outputPath(process.env.W37_EVIDENCE ?? artifactPath("tmp/w37/unit"));
await mkdir(outputPath(evidence), { recursive: true });
const heads: string[] = []; let depth = 0;
const lateObservations: string[] = [];
console.groupCollapsed = (...args) => { if (!depth) heads.push(String(args[0])); depth++; };
console.groupEnd = () => { assert(depth > 0); depth--; };
console.log = () => {}; console.table = () => {};
console.info = (...args) => { lateObservations.push(String(args[0])); };
const report = (id: string) => api.snapshot().reports.find(r => r.id === id)!;
const results: Record<string, unknown> = {};
try {
  api.enable(); api.clear(); api.console(true);
  const guild = { id: "f8_net_g1", guildId: "1", name: "Guild", server: "F8", logo: "f8_net_g1", logoIdentifier: "f8_net_g1", coaString: null, hofRank: null, memberCount: 2 };
  let durable = migrateGuildFavorites({ selectedGuilds: [guild], activeGuildId: null }, null);
  let fail = false;
  const persistence = { restore: async () => { if (fail) throw Error("controlled restore error"); return structuredClone(durable); } };
  const store = new HubFavoritesStore(persistence as any);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  await store.refresh("test-first-record");
  const original = store.getSnapshot().snapshot!.record;
  const initial = hubFavoritesRecordAudit(original);
  assert(initial.originId && initial.notificationId);
  assert(report(initial.notificationId).spans.some(s => s.name === "store-notification" && s.fields?.delivered && s.fields?.notificationKind === "record-change"));
  const beforeNotifications = notifications;
  await store.refresh("visibilitychange");
  const unchanged = hubFavoritesRecordAudit(original);
  assert.equal(store.getSnapshot().snapshot!.record, original);
  assert.equal(notifications, beforeNotifications);
  assert.equal(unchanged.originId, initial.originId);
  assert.equal(unchanged.notificationId, initial.notificationId);
  assert.notEqual(unchanged.restoreId, initial.restoreId);
  const check = report(unchanged.restoreId!);
  assert.equal(check.counts.storeNotifications ?? 0, 0);
  assert.match(auditConsoleSummary(check, api.snapshot().reports).headline, /Bestand geprüft, unverändert/);
  results.unchangedRestore = { initial, unchanged, snapshot: api.snapshot() };

  // The already existing full persisted-value comparison proves this change.
  durable.record.favorites[0].display.name = "Same revision metadata changed";
  await store.refresh("favorites-broadcast");
  const changedRecord = store.getSnapshot().snapshot!.record;
  assert.notEqual(changedRecord, original);
  assert.equal(changedRecord.recordRevision, original.recordRevision);
  const changed = hubFavoritesRecordAudit(changedRecord);
  assert.equal(changed.sameRevisionValueChanged, true);
  assert.equal(changed.recordValueChanged, true);
  assert(changed.notificationId && changed.notificationId !== initial.notificationId);
  fail = true; await store.refresh("error-probe");
  assert.equal(store.getSnapshot().status, "error");
  assert.equal(store.getSnapshot().snapshot!.record, changedRecord);
  assert.equal(hubFavoritesRecordAudit(changedRecord).notificationId, changed.notificationId);
  const errorReport = api.snapshot().reports.at(-1)!;
  assert(errorReport.spans.some(s => s.name === "store-notification" && s.fields?.notificationKind === "state-only"));
  fail = false; await store.refresh("retry"); unsubscribe();
  results.sameRevisionAndError = { changed, errorReport, notifications };

  // Decision publication uses the original execution interval and one group.
  api.clear(); heads.length = 0;
  for (const decision of ["projection-superseded", "projection-accepted"] as const) {
    const run = audit.auditBegin("F02", "projectHubFavorites")!;
    audit.auditFields(run, { awaitConsumerDecision: true, trigger: "consumer-effect-setup-unchanged-record" });
    audit.auditExpectConsumer(run); audit.auditReturn(run, []); audit.auditLeave(run);
    const finished = report(run.id), count = heads.length;
    assert.equal(finished.fields.consumerDecision, "pending");
    assert.match(auditConsoleSummary(finished, api.snapshot().reports).headline, /Ergebnisübernahme ausstehend/);
    audit.auditRecordedEvent(run.id, decision, { attempt: 1 });
    const decided = report(run.id);
    assert.equal(decided.startMs, finished.startMs); assert.equal(decided.endMs, finished.endMs); assert.equal(decided.elapsedMs, finished.elapsedMs);
    assert(Number(decided.fields.consumerDecisionMs) >= finished.endMs!);
    assert.equal(heads.length, count + 1);
    assert.match(heads.at(-1)!, decision === "projection-accepted" ? /vom Consumer angenommen/ : /vom Consumer verworfen/);
    if (decision === "projection-accepted") {
      audit.auditRecordedEvent(run.id, "react-commit", { area: "favorites-projection" });
      audit.auditRecordedEvent(run.id, "presentation-opportunity", { measuredPixelPaint: false });
    }
    assert.equal(heads.length, count + 1); assert.equal(report(run.id).elapsedMs, finished.elapsedMs);
  }
  results.decisions = { heads: [...heads], snapshot: api.snapshot() };

  // An execution error publishes immediately, never waits for a nonexistent commit.
  const failed = audit.auditBegin("F02", "projectHubFavorites")!;
  audit.auditFields(failed, { awaitConsumerDecision: true }); audit.auditExpectConsumer(failed);
  audit.auditError(failed, Error("controlled projection failure")); audit.auditLeave(failed);
  assert.equal(report(failed.id).fields.consumerDecision, "not-accepted");
  assert.match(heads.at(-1)!, /fehlgeschlagen.*keine Ergebnisübernahme/);
  const unknown = audit.auditBegin("F02", "projectHubFavorites")!;
  audit.auditFields(unknown, { awaitConsumerDecision: true }); audit.auditExpectConsumer(unknown); audit.auditLeave(unknown);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(report(unknown.id).fields.consumerObservationDeadline, true);
  assert.match(heads.at(-1)!, /Ergebnisübernahme ausstehend.*Übernahmebeobachtung begrenzt/);
  const duration = report(unknown.id).elapsedMs, count = heads.length;
  audit.auditRecordedEvent(unknown.id, "projection-superseded");
  assert.equal(heads.length, count); assert.equal(report(unknown.id).elapsedMs, duration);
  assert.match(lateObservations.at(-1)!, /späte Consumerentscheidung: verworfen/);
  results.failureAndDeadline = { snapshot: api.snapshot(), heads: [...heads], lateObservations };

  // Losing an owner cannot create a new report, infer acceptance or leak a timer.
  const evicted = audit.auditBegin("F02", "projectHubFavorites")!;
  audit.auditFields(evicted, { awaitConsumerDecision: true }); audit.auditExpectConsumer(evicted); audit.auditLeave(evicted);
  api.console(false);
  for (let n = 0; n < 205; n++) { const run = audit.auditBegin("F21", "bounded-ring"); audit.auditLeave(run); }
  assert.equal(audit.auditDetailsStatus(evicted.id), "not-retained");
  assert.equal(api.status().completed, audit.AUDIT_LIMITS.completed);
  const retainedCount = api.status().completed;
  audit.auditRecordedEvent(evicted.id, "projection-accepted");
  assert.equal(api.status().completed, retainedCount);
  assert.equal(hubFavoritesRecordAudit(changedRecord).originDetails, "not-retained");
  api.console(true);
  await projectHubFavorites([], { trigger: "unknown", storeNotificationId: changed.notificationId }, changedRecord);
  const withoutOwner = api.snapshot().reports.findLast(r => r.action === "projectHubFavorites")!;
  assert.equal(withoutOwner.fields.notificationDetails, "not-retained");
  assert(!withoutOwner.links.some(link => link.relation === "store-notification"));
  assert(withoutOwner.links.some(link => link.relation === "historical-store-notification" && !link.retained));
  assert.match(heads.at(-1)!, /Ergebnisübernahme unbekannt; kein Consumeranschluss/);
  results.unavailableOwner = { report: withoutOwner, headline: heads.at(-1) };
  api.clear(); assert.equal(api.status().completed, 0);
  assert.equal(hubFavoritesRecordAudit(changedRecord).notificationDetails, "not-retained");
  const active = audit.auditBegin("F02", "projectHubFavorites")!; audit.auditExpectConsumer(active);
  api.disable(); assert.equal(api.status().active, 0);
  assert.equal(hubFavoritesRecordAudit(changedRecord).originDetails, "unknown");
  results.limitsClearDisable = api.status();
  assert.equal(depth, 0);
  await writeFile(outputPath(evidence + "/attribution-results.json"), JSON.stringify({ passed: true, ...results }, null, 2) + "\n");
} finally {
  api.disable(); Object.assign(console, native); globalThis.BroadcastChannel = previousChannel;
  delete (globalThis as any).window; delete (globalThis as any).document;
}
console.log("PASS W37 store provenance/notification, same-revision metadata, state-only error, decision publication, unchanged duration, deadlines, eviction, clear/disable");
