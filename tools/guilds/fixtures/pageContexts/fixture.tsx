import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { HashRouter, Routes, Route, useNavigate } from "react-router-dom";
import { openDB } from "idb";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../../../src/i18n/en.json";
import "../../../../src/styles/index.css";
import { useGuildHubSelection } from "../../../../src/pages/GuildHub/hooks/useGuildHubSelection";
import Dashboard from "../../../../src/pages/GuildHub/Dashboard";
import Analytics from "../../../../src/pages/DataHub/compareGuilds";
import GuildHub from "../../../../src/pages/GuildHub/Index";
import Toplist from "../../../../src/pages/DataHub/Toplist";
import FightTracking from "../../../../src/pages/GuildHub/FightTracking";
import FusionPlanner from "../../../../src/pages/GuildHub/FusionPlanner/FusionPlanner";
import { pageContextStore, pageGuildReference } from "../../../../src/lib/data-hub/pageContextStore";
import { hubFavoritesStore } from "../../../../src/lib/data-hub/hubFavoritesStore";
import { guildFavorite } from "../../../../src/lib/data-hub/hubFavoritesContract";
import { importGuildHubLocalScan, deleteGuildHubLocalScans } from "../../../../src/lib/guilds/localScanLibrary";
import { linkGuildAliases, unlinkGuildAlias } from "../../../../src/lib/identities/guildIdentityStore";
import { acquireExplicitLocalFirstArchiveScans } from "../../../../src/lib/scanArchive/localFirstScanAcquisition";
import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";
import { readFightTrackerStateById, createFightTracker, readFightTrackers } from "../../../../src/pages/GuildHub/fightTrackingStore";

import type { LocalToplistArchiveContext } from "../../../../src/pages/DataHub/localToplistPageModel";

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20));
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
const until = async (check: () => boolean, message: string) => { for (let i = 0; i < 1200; i++) { if (check()) return; await pause(); } throw Error(`${message}: ${document.body.innerText.slice(0, 900)}`); };
const guild = (id: number) => ({ id: `f8_net_g${id}`, guildId: String(id), name: `Guild ${id}`, server: "F8", logoIdentifier: `f8_net_g${id}`, memberCount: 1 });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => resolve = r); return { promise, resolve }; };
const gate = deferred();
const peer = new URL(location.href).searchParams.has("peer");
const results: string[] = [], errors: string[] = [];
const contexts = () => Object.fromEntries((["guild-hub", "guild-dashboard", "guild-analytics", "local-toplist", "fight-tracking"] as const).map(key => [key, pageContextStore.get(key)]));
const api = { documentId: crypto.randomUUID(), ready: false, results, errors, restoreGate: !sessionStorage.getItem("w11-seeded") && !peer ? gate.promise : undefined as Promise<void> | undefined,
  releaseRestore: () => { api.restoreGate = undefined; gate.resolve(); }, contexts, run, peerRun,
  reads: [] as string[], parents: {} as Record<string, any>, writes: [] as string[], currentGate: undefined as Promise<void> | undefined,
  manifestGate: undefined as Promise<void> | undefined, manifestHeld: false,
  fusionMembers:[] as Array<{id:string}>, currentHeld: false, clear: () => pageContextStore.selectGuild("guild-dashboard", null),
  selectPeer: () => pageContextStore.selectGuild("guild-dashboard", pageGuildReference(guild(3))),
  savePeer: () => hubFavoritesStore.mutate({ type: "save", favorite: guildFavorite(guild(4), 0, null, false) }),
  snapshot: () => hubFavoritesStore.getSnapshot().snapshot, currentReleases: 0,
  checkEmptyReload: async () => { await until(() => Boolean(document.querySelector('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]')), "empty reload favorites ready"); assert(pageContextStore.get("guild-dashboard").guild === null, "empty reload stays empty despite available legacy favorite"); return document.body.innerText; },
  checkReload: async () => { await until(() => document.querySelector('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]')?.getAttribute("aria-pressed") === "true", "reloaded own dashboard B"); return contexts(); }
};
(globalThis as any).w11 = api;
// Reuse the W-08 controlled archive loader and table presentation. Actual parent,
// ContextBar, page owner, favorites/IDB, workers, tables and focus remain real.
const archiveScan = (id: number): ScanArchiveEntry => ({ id: `w11-archive-${id}`, server: "f8_net", timestamp: Date.UTC(2026, 8, id, 12), timestampUtc: `2026-09-0${id}T12:00:00.000Z`, archiveYear: 2026, path: `proof/${id}.json`, format: "sftools.raw.v1", compression: "gzip", sha256: "a".repeat(64), compressedBytes: 1, uncompressedBytes: 1, playerCount: 1, groupCount: 1, manifestRevision: 1, manifestUrl: "https://example.test/manifest.json", fileUrl: "https://example.test/scan.gz" });
const content = { players: [{ identifier: "f8_net_p1", prefix: "f8_net", timestamp: Date.UTC(2026, 8, 1, 12), name: "Proof Player", class: 2, level: 100, rank: 1, guildIdentifier: "f8_net_g1", guildName: "Guild 1" }], groups: [{ identifier: "f8_net_g1", prefix: "f8_net", timestamp: Date.UTC(2026, 8, 1, 12), name: "Guild 1", rank: 1, members: 1, memberIdentifiers: ["f8_net_p1"] }] };
const entry = archiveScan(1);
const archiveContext: LocalToplistArchiveContext = { status: "complete", catalog: null, manifests: [], manifestUrlsByYear: {}, entries: [entry], selections: [], serverOptions: [{ server: "F8", sourceServer: "f8_net", label: "F8", archiveScanId: entry.id, scanTimestamp: entry.timestamp }], issues: [] };
const w08 = { context: archiveContext, filters: {} as any, acks: [] as any[], loads: [] as any[], publicCalls: 0,
  acquire: (entries: ScanArchiveEntry[], options: any) => acquireExplicitLocalFirstArchiveScans(entries, { ...options, dependencies: { downloadArchiveEntry: async () => ({ content: JSON.stringify(content) }) } }) };
(globalThis as any).w08 = w08;
window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
const nativeFetch = window.fetch;
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => String(input).includes("catalog") ? Promise.resolve(new Response(JSON.stringify({ schemaVersion: 1, archives: [] }), { status: 200 })) : nativeFetch(input, init)) as typeof fetch;
const put = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function(value: any, ...args: any[]) { if (this.name === "state") api.writes.push(value.key); return put.call(this, value, ...args); };
let navigate!: ReturnType<typeof useNavigate>;
function ConsumerControls({ feature, children }: { feature: "guild-dashboard" | "guild-analytics" | "fight-tracking"; children: React.ReactNode }) {
  const selection = useGuildHubSelection(feature);
  return <><section data-context-controls>
    {selection.selectedGuilds.map(g => <button key={g.id} aria-label={`${g.name}, ${g.server} auswählen`} aria-pressed={selection.activeGuildId === g.id} onClick={() => selection.chooseGuild(g)}>{g.name}</button>)}
    <button onClick={() => selection.chooseGuild(null)}>Clear this page</button>
    {selection.contextIssue && <p>{selection.contextIssue === "unresolved" ? "ambiguous" : selection.contextIssue}</p>}
    {!selection.context.guild && <p>Choose a guild for this page</p>}
  </section>{children}</>;
}
function App() {
  navigate = useNavigate();
  return <><header>{["hub", "dashboard", "analytics", "toplist", "tracker", "fusion", "both"].map(page => <button key={page} data-nav={page} onClick={() => navigate('/'+page)}>{page}</button>)}</header>
    <Routes>
      <Route path="/" element={<ConsumerControls feature="guild-dashboard"><Dashboard /></ConsumerControls>} /><Route path="/dashboard" element={<ConsumerControls feature="guild-dashboard"><Dashboard /></ConsumerControls>} />
      <Route path="/hub" element={<GuildHub />} /><Route path="/analytics" element={<ConsumerControls feature="guild-analytics"><Analytics /></ConsumerControls>} /><Route path="/toplist" element={<><section data-context-controls>{[1,2,3].map(id=><button key={id} aria-label={`Guild ${id}, F8 auswählen`} onClick={()=>(globalThis as any).w11.toplistFavorite(guild(id))}>Guild {id}</button>)}</section><Toplist /></>} />
      <Route path="/tracker" element={<ConsumerControls feature="fight-tracking"><FightTracking /></ConsumerControls>} /><Route path="/fusion" element={<FusionPlanner />} />
      <Route path="/both" element={<><div data-feature="dashboard"><ConsumerControls feature="guild-dashboard"><Dashboard /></ConsumerControls></div><div data-feature="analytics"><ConsumerControls feature="guild-analytics"><Analytics /></ConsumerControls></div><div data-feature="fusion"><FusionPlanner /></div></>} />
    </Routes></>;
}
async function go(page: string, state?: any) { flushSync(() => navigate('/'+page, { state })); await pause(); }
async function click(selector: string) { const button = document.querySelector<HTMLButtonElement>(selector); assert(button && !button.disabled, `click ${selector}`); flushSync(() => button!.click()); await pause(); }
async function selected(feature: string, id: number) { await until(() => pageContextStore.get(feature as any).guild?.guild.id === guild(id).id, `${feature} selects ${id}`); }
async function run() {
  assert(api.parents.dashboard?.guild === null, "actual parent has explicit early cleared input while restore held");
  await go("dashboard", { guildFeatureTarget: { feature: "guild-dashboard", guild: guild(2) } });
  await selected("guild-dashboard", 2);
  await click('[data-context-controls] button:not([aria-label])');
  assert(pageContextStore.get("guild-dashboard").guild === null, "real clear during held favorite restore");
  api.releaseRestore(); await hubFavoritesStore.refresh();
  await until(() => hubFavoritesStore.getSnapshot().status === "ready", "restore ready");
  // Explicit clear/choice occurred before the held initial restore completed.
  assert(pageContextStore.get("guild-dashboard").guild === null, "early explicit clear defeats late legacy");
  results.push("Actual targeted detail-consumer input then fixture clear during held favorites restore defeat late legacy input");
  await click('[data-context-controls] button[aria-label="Guild 1, F8 auswählen"]'); await selected("guild-dashboard", 1);
  await go("analytics"); await click('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]'); await selected("guild-analytics", 2);
  assert(pageContextStore.get("guild-dashboard").guild?.guild.id === guild(1).id, "dashboard A independent of analytics B");
  await go("both"); await until(() => api.parents.analytics?.guild?.id === guild(2).id && api.parents.dashboard?.guild?.id === guild(1).id && typeof api.parents.fusion?.setSetup === "function" && document.querySelector('[data-feature="fusion"]') !== null, "all actual parents mounted with independent guilds before own setup");
  flushSync(() => { api.parents.analytics.setRange({ key: "30d" }); api.parents.analytics.setMetric("memberCount"); api.parents.analytics.setPlayers(["f8_net_p1"]);
    api.parents.fusion.setSetup({mode: "manual", baseGuild: {id:"base",name:"Retained Base",server:"F8",kind:"base"}, partnerGuilds:[{id:"partner",name:"Retained Partner",server:"F8",kind:"partner"}]}); });
  // Manual setup finishes its own member/scenario effects before the foreign
  // selection window. A Render + 20 ms is not a completed scenario baseline.
  await until(()=>{
    const ids=api.fusionMembers.map(member=>member.id).sort().join('|');
    return api.parents.fusion.setupState.mode==='manual'&&ids.length>0&&api.parents.fusion.scenarios.every((scenario:{decisions:Record<string,unknown>;targetGuildAssignments?:Record<string,unknown>})=>Object.keys(scenario.decisions).sort().join('|')===ids&&Object.keys(scenario.targetGuildAssignments??{}).sort().join('|')===ids);
  },"manual Fusion members and full scenario assignments initialized before foreign selection");
  const analyticsBefore = JSON.stringify(api.parents.analytics);
  const fusionBefore = JSON.stringify(api.parents.fusion);
  const analyticsInput = pageContextStore.get("guild-analytics");
  await click('[data-feature="dashboard"] [data-context-controls] button[aria-label="Guild 3, F8 auswählen"]');
  assert(pageContextStore.get("guild-analytics") === analyticsInput && JSON.stringify(api.parents.analytics) === analyticsBefore, "foreign change retains analytics range/metric/player state");
  assert(JSON.stringify(api.parents.fusion) === fusionBefore, "fusion own base/partner/scenario remain unchanged");
  assert([...document.querySelectorAll<HTMLButtonElement>('[data-feature="fusion"] [data-context-controls] button')].every(button => button.disabled), "fusion favorites have no invented selection action");
  results.push("Actual Dashboard A / Analytics B and their explicit consumer inputs stay independent; foreign choice retains Analytics range/metric/player and Fusion base/partner/scenario");
  await go("dashboard"); await until(() => document.querySelector('[data-context-controls] button[aria-label="Guild 3, F8 auswählen"]')?.getAttribute("aria-pressed") === "true", "ordinary navigation restores own dashboard");
  await go("analytics"); await until(() => document.querySelector('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]')?.getAttribute("aria-pressed") === "true", "ordinary navigation restores own analytics");
  await go("dashboard", { guildFeatureTarget: { feature: "guild-dashboard", guild: guild(1) } }); await selected("guild-dashboard", 1);
  await click('[data-context-controls] button[aria-label="Guild 3, F8 auswählen"]'); await go("hub"); await go("dashboard"); await selected("guild-dashboard", 3);
  results.push("Actual router navigation/remount restores each own input; targeted routerstate updates only its declared target feature");
  const beforeFavorite = JSON.stringify(api.snapshot()); const writesBefore = api.writes.length;
  await click('[data-context-controls] button[aria-label="Guild 1, F8 auswählen"]');
  assert(JSON.stringify(api.snapshot()) === beforeFavorite && api.writes.length === writesBefore, "view/FastSelect has zero favorites/global writes");
  const inputBefore = pageContextStore.get("guild-dashboard");
  await hubFavoritesStore.mutate({ type: "reorderGuild", id: guild(2).id, targetIndex: 0 });
  await hubFavoritesStore.mutate({ type: "removeGuild", id: guild(1).id });
  await hubFavoritesStore.mutate({ type: "save", favorite: guildFavorite(guild(1), 0, null, false) });
  assert(pageContextStore.get("guild-dashboard") === inputBefore, "remove/reorder/save retain selected entity independent of favorite");
  await click('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]');
  results.push("Actual view/FastSelect writes zero IDB state; favorite Save/Remove/Reorder retain own and foreign contexts and read-only compatibility");
  const manifest = deferred(); api.manifestGate = manifest.promise;
  await go("toplist"); await until(() => api.manifestHeld, "archive restore held");
  flushSync(() => pageContextStore.selectServers(["F28"]));
  api.manifestGate = undefined; manifest.resolve(); await pause(); await pause();
  assert(pageContextStore.get("local-toplist").servers?.[0] === "F28", "early manual scope defeats delayed archive default");
  results.push("Actual Toplist early manual unavailable server wins against controlled delayed manifest restore");
  flushSync(() => w08.filters.setServers(["F8"]));
  await until(() => w08.loads.length > 0 && document.querySelector('[data-sfh-identifier="f8__1"]') !== null, "actual toplist rows");
  const beforeFocusFilters = JSON.stringify({servers:w08.filters.servers,classes:w08.filters.classes,query:w08.filters.searchText,sort:w08.filters.sortBy});
  await click('[data-context-controls] button[aria-label="Guild 1, F8 auswählen"]');
  await until(() => w08.acks.some(ack => ack.identifier === "f8__1" && ack.status === "visibleAck"), "favorite uses real DOM ACK");
  assert(JSON.stringify({servers:w08.filters.servers,classes:w08.filters.classes,query:w08.filters.searchText,sort:w08.filters.sortBy}) === beforeFocusFilters, "favorite focus retains all existing filters");
  const filtersBefore = JSON.stringify({ servers: w08.filters.servers, classes: w08.filters.classes, query: w08.filters.searchText, sort: w08.filters.sortBy });
  assert(w08.publicCalls === 0 && !document.querySelector('[data-local-profile]'), "favorite focus opens no profile");
  flushSync(() => w08.filters.setClasses(["mage"])); flushSync(() => w08.filters.setSearchText("retained query"));
  flushSync(() => w08.filters.setServers(["F28"]));
  await go("hub"); await click('button[title="Guild 3 (F8)"]');
  await go("toplist"); await until(() => document.body.innerText.includes("selected server") || document.body.innerText.includes("Selected server") || pageContextStore.get("local-toplist").servers?.[0] === "F28", "manual unavailable server retained");
  assert(pageContextStore.get("local-toplist").servers?.[0] === "F28" && w08.filters.searchText === "retained query", "foreign guild/remount preserve manual scope/query");
  assert(w08.filters.classes[0] === "mage", "filter class survives remount");
  results.push(`Actual Toplist favorite uses visible DOM ACK, no profile/global write; manual unavailable F28 and filter/query survive foreign selection/remount; initial filters ${filtersBefore}`);
  const trackerState = JSON.stringify(await readFightTrackerStateById(trackerId));
  await go("tracker"); await until(() => Boolean(document.querySelector('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]')), "actual tracker parent");
  await click('[data-context-controls] button[aria-label="Guild 3, F8 auswählen"]'); await go("dashboard"); await click('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]');
  assert(JSON.stringify(await readFightTrackerStateById(trackerId)) === trackerState && (await readFightTrackers()).length === 1, "tracker suggestions never open/reassign/sync stored tracker");
  results.push("Actual FightTracking proposal context changes without tracker assignment, member or fight changes");
  const held = deferred(); api.currentHeld = false; api.currentGate = held.promise;
  await click('[data-context-controls] button[aria-label="Guild 1, F8 auswählen"]');
  await until(() => api.currentHeld, "own old Current read held");
  await click('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]');
  api.currentGate = undefined; held.resolve(); await pause(); await pause();
  await until(() => api.parents.dashboard.current === guild(2).id || api.parents.dashboard.error !== null, "new own current settles");
  assert(api.parents.dashboard.current !== guild(1).id, "old own answer never published after own switch");
  results.push("Actual dashboard old Current source read held across own context switch cannot publish the previous guild");
  const analyticsStable = pageContextStore.get("guild-analytics");
  const merged = await linkGuildAliases("f8_net_g1", "f8_net_g2", {source:"manual"});
  assert(merged, "identity aliases linked");
  const saved = guildFavorite(guild(1), 0, null, false);
  saved.originalReferences = [pageGuildReference(guild(1)).reference!, pageGuildReference(guild(2)).reference!];
  pageContextStore.selectGuild("guild-dashboard", pageGuildReference(guild(1), saved));
  await unlinkGuildAlias("f8_net_g2");
  await until(() => api.parents.dashboard.guild === null && document.body.innerText.includes("ambiguous"), "ambiguous context explained");
  assert(pageContextStore.get("guild-dashboard").guild?.guild.id === guild(1).id && pageContextStore.get("guild-analytics") === analyticsStable, "identity conflict retains reference and foreign selection without first favorite fallback");
  results.push("Actual identity link/unlink conflict explains retained page reference; no first favorite substitution or foreign selection change");
  await click('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]');
  const sourceBefore = pageContextStore.get("guild-dashboard");
  await deleteGuildHubLocalScans([sourceId]);
  assert(pageContextStore.get("guild-dashboard") === sourceBefore && pageContextStore.get("guild-analytics") === analyticsStable, "source deletion leaves page metadata inputs intact");
  results.push("Actual source deletion renews dependent data without rewriting own/foreign page inputs");
  await click('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]');
  await click('[data-context-controls] button:not([aria-label])');
  assert(pageContextStore.get("guild-dashboard").guild === null, "explicit clear stays empty");
  await go("hub"); await hubFavoritesStore.refresh(); await go("dashboard");
  assert(pageContextStore.get("guild-dashboard").guild === null, "clear survives remount/favorites refresh");
  await click('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]');
  results.push("Explicit clear remains empty across favorite refresh/remount; own selection restored for subsequent reload proof");
  return results;
}
let trackerId = "", sourceId = "";
async function peerRun() { await until(() => hubFavoritesStore.getSnapshot().status === "ready", "peer ready"); api.selectPeer(); return contexts(); }
await i18n.use(initReactI18next).init({ lng: "en", fallbackLng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
if (!sessionStorage.getItem("w11-seeded") && !peer) {
  const db = await openDB("sfdatahub-guild-hub", 2, { upgrade(db) { if (!db.objectStoreNames.contains("state")) db.createObjectStore("state", { keyPath: "key" }); } });
  await db.put("state", { key: "guild-selection", value: { selectedGuilds: [guild(1), guild(2), guild(3)], activeGuildId: guild(1).id }, updatedAt: "original" }); db.close();
  trackerId = (await createFightTracker({ name: "Retained tracker", server: "F8", source: "manual", members: [{ name: "Retained member", source: "manual", active: true }] })).tracker!.id;
  const scan = await importGuildHubLocalScan("w11-local.json", JSON.stringify({players: [1,2].map(id => ({ ...content.players[0],identifier:`f8_net_p${id}`,guildIdentifier:`f8_net_g${id}`,guildName:`Guild ${id}`})), groups:[1,2].map(id => ({...content.groups[0],identifier:`f8_net_g${id}`,name:`Guild ${id}`}))}));
  sourceId = scan.scan.id;
  pageContextStore.selectGuild("guild-dashboard", null);
  sessionStorage.setItem("w11-seeded", "yes");
}
flushSync(() => createRoot(document.getElementById("root")!).render(<HashRouter><App /></HashRouter>));
api.ready = true;
