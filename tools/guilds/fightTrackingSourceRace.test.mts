import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as audit from "../../src/lib/data-hub/runtimeAudit.ts";

// Execute the production loader, refresh callback, source effects and reset/back
// handlers together. Only React scheduling and external summary I/O are controlled.
// This test writes no files; callers may capture stdout in their own evidence dir.
const text = await readFile("src/pages/GuildHub/FightTracking.tsx", "utf8");
const source = ts.createSourceFile("FightTracking.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "GuildHubFightTracking");
assert(component?.body);
const loader = source.statements.find(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === "loadTrackerGuildSources"));
assert(loader);
const names = new Set(["resetTrackerView", "backToSelection", "guildSourcesConsumer", "previousSourceSelection", "guildSourcesLifecycle", "guildSourcesRequest", "invalidateGuildSources", "clearGuildSelection", "refreshGuildSources", "createTrackerFromGuildSource", "createManualTracker", "confirmTrackerDelete"]);
const statements = component.body.statements.filter(s => {
  if (ts.isVariableStatement(s)) return s.declarationList.declarations.some(d => ts.isIdentifier(d.name) && names.has(d.name.text));
  return ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && ts.isPropertyAccessExpression(s.expression.expression) &&
    ["useEffect", "useLayoutEffect"].includes(s.expression.expression.name.text) &&
    /subscribeToSfDataHubLocalScanChanges|guildSourcesLifecycle/.test(s.getText(source));
});
assert(statements.some(s => s.getText(source).includes("subscribeToSfDataHubLocalScanChanges")));
const body = ts.transpileModule([loader, ...statements].map(s => s.getText(source)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const make = new Function("scope", "selectedGuilds", "guildSelectionLoading", `
 const {React,subscribeToSfDataHubLocalScanChanges,listGuildHubScanSummaries,
 listGuildHubLocalServersFromScanSummaries,listGuildHubLocalGuildsForServerFromScanSummaries,
 mapLocalGuildIdentityToSelection,refreshTrackerSummaries,createFightTracker,deleteFightTracker,...other}=scope;
 const {${["auditBegin", "auditFields", "auditDependencyId", "auditLink", "auditEnter", "auditValue", "auditReturn", "auditError", "auditLeave", "auditId", "auditAccept", "auditDiscard"].join(",")}}=other;
 const {setTrackerGuildSources,setGuildSourcesError,setGuildSourcesLoading,setStoreError,
 setTracker,setTrackerMembers,setFights,setSyncPlan,setTrackerScanSnapshot,setScanImportStatus,
 setActiveMobilePanel,setParticipationStatusDrafts,setIsApplyingParticipationDrafts,
 setImportSession,setScanState,setIsAddPanelOpen,setSelectedScanGuildId,setSetupGuildName,
 setSetupGuildServer,setManagerState,applyFightCreationTarget}=other;
 const selection=scope.selection;
 const setupGuildName="Manual fixture", setupGuildServer="F8";
 const managerState={mode:"delete",trackerId:"test-tracker"}, tracker={id:"test-tracker"};
 ${body}
 return {refreshGuildSources,resetTrackerView,clearGuildSelection,backToSelection,createTrackerFromGuildSource,createManualTracker,confirmTrackerDelete};
`);

type Guild = { id: string; name: string; server: string };
const guild = (id: string, name = id): Guild => ({ id, name, server: "F8" });
type Pending = { resolve: (rows: Guild[]) => void; reject: (error: Error) => void };
type Effect = { kind: "layout" | "passive"; deps: unknown[]; setup: () => void | (() => void); cleanup?: () => void; pending: boolean };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness() {
  const state: { sources: Guild[]; error: string | null; loading: boolean; commits: number } = { sources: [], error: null, loading: false, commits: 0 };
  const cells: any[] = [], requests: Pending[] = [], effects: Effect[] = [];
  const listeners = new Set<() => void>(); let index = 0, api: any;
  const equal = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const effect = (kind: Effect["kind"], setup: Effect["setup"], deps: unknown[]) => {
    const slot = index++, prev: Effect | undefined = cells[slot];
    if (prev && equal(prev.deps, deps)) return;
    const next: Effect = { kind, setup, deps, pending: true, cleanup: prev?.cleanup };
    cells[slot] = next; effects.push(next);
  };
  const ignore = () => {};
  const scope = {
    ...audit,
    selection: { chooseGuild: (value: unknown) => { assert.equal(value, null); } },
    React: {
      useRef: (value?: unknown) => { const slot = index++; return cells[slot] ??= { current: value }; },
      useCallback: (fn: any, deps: unknown[]) => { const slot = index++, prev = cells[slot]; if (prev && equal(prev.deps, deps)) return prev.fn; cells[slot] = { fn, deps }; return fn; },
      useEffect: (fn: Effect["setup"], deps: unknown[]) => effect("passive", fn, deps),
      useLayoutEffect: (fn: Effect["setup"], deps: unknown[]) => effect("layout", fn, deps),
    },
    listGuildHubScanSummaries: () => new Promise<Guild[]>((resolve, reject) => requests.push({ resolve, reject })),
    listGuildHubLocalServersFromScanSummaries: () => [{ id: "F8" }],
    listGuildHubLocalGuildsForServerFromScanSummaries: (rows: Guild[]) => rows,
    mapLocalGuildIdentityToSelection: (row: Guild) => row,
    subscribeToSfDataHubLocalScanChanges: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    refreshTrackerSummaries: async () => {},
    createFightTracker: async (input: any) => ({ tracker: { id: "test-tracker", ...input }, members: [], fights: [] }),
    deleteFightTracker: async () => {},
    setTrackerGuildSources: (rows: Guild[]) => { state.sources = rows; state.commits++; },
    setGuildSourcesError: (value: string | null) => { state.error = value; },
    setGuildSourcesLoading: (value: boolean) => { state.loading = value; },
    setStoreError: ignore, setTracker: ignore, setTrackerMembers: ignore, setFights: ignore,
    setSyncPlan: ignore, setTrackerScanSnapshot: ignore, setScanImportStatus: ignore,
    setActiveMobilePanel: ignore, setParticipationStatusDrafts: ignore,
    setIsApplyingParticipationDrafts: ignore, setImportSession: ignore, setScanState: ignore,
    setIsAddPanelOpen: ignore, setSelectedScanGuildId: ignore, setSetupGuildName: ignore,
    setSetupGuildServer: ignore, setManagerState: ignore, applyFightCreationTarget: ignore,
  };
  const commit = () => { for (const kind of ["layout", "passive"] as const) for (const e of effects) if (e.pending && e.kind === kind) { e.cleanup?.(); e.cleanup = e.setup() || undefined; e.pending = false; } };
  const render = (selection: Guild[], loading = false) => { index = 0; api = make(scope, selection, loading); commit(); return api; };
  const unmount = () => { for (const kind of ["layout", "passive"] as const) for (const c of cells) if (c?.kind === kind) { c.cleanup?.(); c.cleanup = undefined; } };
  const replay = () => { unmount(); for (const kind of ["layout", "passive"] as const) for (const c of cells) if (c?.kind === kind) c.cleanup = c.setup() || undefined; };
  return { state, requests, listeners, render, unmount, replay, get api() { return api; } };
}
const results: string[] = [];
for (const enabled of [false, true]) {
  enabled ? audit.dataHubRuntimeAudit.enable() : audit.dataHubRuntimeAudit.disable();
  audit.dataHubRuntimeAudit.console(false); audit.dataHubRuntimeAudit.clear();
  for (const detail of [false, true]) {
    // Detail shares precisely this same component pipeline; actual views are also
    // covered by the native browser fixture, rather than simulated navigation.
    const h = harness(); h.render([guild("A")]); h.render([guild("B")]);
    h.requests[1].resolve([guild("B", "B current")]); await flush();
    assert.equal(h.state.sources[0].name, "B current");
    h.requests[0].resolve([guild("A", "A old")]); await flush();
    assert.deepEqual(h.state.sources, [guild("B", "B current")], `late A cannot replace B (${detail ? "detail" : "list"})`);
    assert.equal(h.state.error, null); assert.equal(h.state.loading, false); h.unmount();
  }
  {
    const h = harness(), a = [guild("A")]; h.render(a); h.render([guild("B")]); h.render(a);
    h.requests[2].resolve([guild("A", "A newest")]); await flush();
    h.requests[0].resolve([guild("A", "A oldest")]); h.requests[1].resolve([guild("B")]); await flush();
    assert.equal(h.state.sources[0].name, "A newest", "ABA requires a new request/lifetime, not a guild-ID match"); h.unmount();
  }
  {
    const h = harness(), a = [guild("A")]; h.render(a); h.requests[0].resolve(a); await flush();
    const first = h.api.refreshGuildSources(undefined, { trigger: "tracker-manual-refresh" });
    const second = h.api.refreshGuildSources(undefined, { trigger: "tracker-list-return" });
    h.requests[2].resolve([guild("A", "new refresh")]); await second;
    h.requests[1].resolve([guild("A", "old refresh")]); await first;
    assert.equal(h.state.sources[0].name, "new refresh"); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); h.render([guild("B")]);
    h.requests[0].resolve([guild("A")]); await flush(); assert.equal(h.state.loading, true, "old finally must not clear B's loading");
    h.requests[1].resolve([guild("B")]); await flush(); assert.equal(h.state.loading, false); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); h.render([guild("B")]);
    h.requests[1].resolve([guild("B")]); await flush(); h.requests[0].reject(Error("old failure")); await flush();
    assert.equal(h.state.error, null); assert.equal(h.state.sources[0].id, "B"); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); h.requests[0].reject(Error("current failure")); await flush();
    assert.match(h.state.error!, /Scan-Quellen/); assert.equal(h.state.loading, false);
    const retry = h.api.refreshGuildSources(undefined, { trigger: "tracker-manual-refresh" }); h.requests[1].resolve([guild("A")]); await retry;
    assert.equal(h.state.error, null, "successful explicit retry clears the current error"); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); h.requests[0].resolve([guild("A")]); await flush();
    h.render([]); h.requests[1].resolve([]); await flush(); assert.deepEqual(h.state.sources, [], "current empty output replaces the previous list"); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); h.api.clearGuildSelection();
    h.requests[0].resolve([guild("A")]); await flush(); assert.equal(h.state.commits, 0, "the visible selection Clear handler invalidates a pending source request");
    assert.equal(h.state.loading, false);
    h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); const back = h.api.backToSelection(); await flush();
    assert.equal(h.requests.length, 2, "Back retains its explicit fresh source request");
    h.requests[1].resolve([guild("A", "back current")]); await back; await flush();
    h.requests[0].resolve([guild("A", "before back")]); await flush(); assert.equal(h.state.sources[0].name, "back current"); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); const oldListener = [...h.listeners][0]; h.unmount();
    h.requests[0].resolve([guild("A")]); await flush(); oldListener(); await flush();
    assert.equal(h.state.commits, 0); assert.equal(h.requests.length, 1, "stopped subscription cannot start another read");
  }
  {
    const h = harness(); const a = [guild("A")]; h.render(a); h.replay();
    assert.equal(h.requests.length, 2); h.requests[1].resolve([guild("A", "replay current")]); await flush();
    h.requests[0].resolve([guild("A", "replay old")]); await flush(); assert.equal(h.state.sources[0].name, "replay current"); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); h.requests[0].resolve([guild("A")]); await flush();
    [...h.listeners][0](); h.requests[1].resolve([guild("A", "dependency current")]); await flush();
    assert.equal(h.state.sources[0].name, "dependency current"); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); h.render([guild("A")], true);
    h.requests[0].reject(Error("failure after selection restore")); await flush(); assert.equal(h.state.error, null); assert.equal(h.state.commits, 0); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]);
    const latest = h.api.refreshGuildSources(undefined, { trigger: "tracker-manual-refresh" });
    h.requests[1].reject(Error("current refresh failure")); await latest;
    const currentError = h.state.error; assert(currentError);
    h.requests[0].resolve([guild("A", "old success")]); await flush();
    assert.equal(h.state.error, currentError, "old success cannot clear a newer error");
    assert.equal(h.state.commits, 0); assert.equal(h.state.loading, false); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]);
    [...h.listeners][0](); h.requests[1].resolve([guild("A", "background current")]); await flush();
    assert.equal(h.state.loading, false, "latest background refresh completes the superseded initial loading");
    h.requests[0].reject(Error("old initial failure")); await flush();
    assert.equal(h.state.error, null); assert.equal(h.state.sources[0].name, "background current"); h.unmount();
  }
  {
    const h = harness(); const old = h.render([guild("A")]).refreshGuildSources;
    h.render([guild("B")]); await old(undefined, { trigger: "tracker-created-manually" });
    assert.equal(h.requests.length, 2, "a stale action callback cannot launch a source request for the previous selection");
    h.requests[1].resolve([guild("B")]); h.requests[0].resolve([guild("A")]); await flush();
    assert.equal(h.state.sources[0].id, "B"); h.unmount();
  }
  for (const action of ["createManualTracker", "createTrackerFromGuildSource", "confirmTrackerDelete"] as const) {
    const h = harness(); h.render([guild("A")]);
    await h.api[action](guild("A")); await flush();
    assert.equal(h.requests.length, 2, `${action} retains the actual post-action source refresh`);
    h.requests[1].resolve([guild("A", "post action current")]); await flush();
    h.requests[0].resolve([guild("A", "pre action old")]); await flush();
    assert.equal(h.state.sources[0].name, "post action current", `${action} shares the same adoption guard`); h.unmount();
  }
  {
    const h = harness(); h.render([guild("A")]); h.api.resetTrackerView();
    h.requests[0].reject(Error("old failure after reset")); await flush();
    assert.equal(h.state.error, null); assert.equal(h.state.commits, 0); h.unmount();
  }
  if (enabled) {
    const reports = audit.dataHubRuntimeAudit.snapshot().reports.filter(r => r.family === "F26");
    assert(reports.some(r => r.status === "stale-discarded"));
    assert(reports.filter(r => r.status === "stale-discarded").every(r => !r.spans.some(s => s.name === "accepted-state")), "discarded results never claim a state acceptance");
    assert(reports.some(r => r.status === "completed" && r.fields.consumerDecision === "accepted"));
  }
  results.push(`audit=${enabled}: production source pipeline races/lifetime/errors/empty/dependency checks passed`);
}
audit.dataHubRuntimeAudit.disable();
console.log("PASS", results.join("\nPASS "));
