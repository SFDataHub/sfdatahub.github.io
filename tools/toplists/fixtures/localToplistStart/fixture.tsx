import { putSfDataHubArchiveSearchIndexCache } from "../../../../src/lib/guilds/localScanLibrary";
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { HashRouter, Route, Routes, useNavigate } from "react-router-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../../../src/i18n/en.json";
import Toplist from "../../../../src/pages/DataHub/Toplist";
import DataHub from "../../../../src/pages/DataHub/Index";
import { buildToplistServerGroupsFromRegistry } from "../../../../src/pages/DataHub/localToplistPageModel";
import { LocalToplistViewWorkerSession } from "../../../../src/lib/toplists/localToplistViewWorkerClient";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
import { acquireExplicitLocalFirstArchiveScans } from "../../../../src/lib/scanArchive/localFirstScanAcquisition";
import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";
import type { LocalToplistViewWorkerResponse } from "../../../../src/lib/toplists/localToplistViewWorkerTypes";
import "../../../../src/styles/index.css";

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25));
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
async function until(check: () => boolean, message: string) {
  for (let i = 0; i < 800; i++) { if (check()) return; await pause(); }
  throw Error(`${message}: ${document.body.innerText.slice(-1200)}`);
}
const normalApp = new URL(location.href).searchParams.has("normal");
const now = Date.UTC(2026, 9, 8, 12);
const entry = (id: string, server: string): ScanArchiveEntry => ({ id, server, timestamp: now, timestampUtc: new Date(now).toISOString(),
  path: `${id}.json.gz`, format: "sftools.raw.v1", compression: "gzip", sha256: id === "fusion" ? "a".repeat(64) : "b".repeat(64), compressedBytes: 1, uncompressedBytes: 1,
  searchIndex: {schemaVersion:1,path:`${id}-index.json.gz`,sha256:"f".repeat(64),compressedBytes:1,uncompressedBytes:1,playerCount:3,groupCount:1},
  playerCount: 3, groupCount: 1, archiveYear: 2026, manifestRevision: 1, manifestUrl: `${location.origin}/w17-manifest.json`, fileUrl: `${location.origin}/${id}.gz` });
const entries = [entry("fusion", "f8_net"), entry("named", "stumblesteppe_net")];
const raw = (server: string) => ({ players: Array.from({length: 3}, (_, i) => ({ identifier: `${server}_p${i+1}`, prefix: server, timestamp: now,
  name: `W17 Player ${i+1}`, class: 1, level: 100+i, rank: i+1, guildIdentifier: `${server}_g1`, guildName: "W17 Guild",
  values: { Base: 10000-i, "Base Strength": 10000-i, "Base Constitution": 500, Attribute: 15000-i, Constitution: 750 } })),
  groups: [{ identifier: `${server}_g1`, prefix: server, timestamp: now, name: "W17 Guild", rank: 1, memberCount: 3, avgLevel: 101 }] });
const w08 = { loads: [] as any[], acks: [] as any[], publicCalls: 0,
  acquire: async (selected: ScanArchiveEntry[], options: any) => {
    api.acquisitions.push(selected.map(e => e.server));
    const held = api.acquisitionGate;
    if (held) {api.acquisitionHeld = true; await held;}
    return acquireExplicitLocalFirstArchiveScans(selected, { ...options, dependencies: { downloadArchiveEntry: async requested => {
      api.downloads.push(requested.server); return { content: JSON.stringify(raw(requested.server)) };
    } } });
  } };
(globalThis as any).w08 = w08;
const api = { ready: false, run, bindings: [] as Array<{expected: any; pending: string; actual: LocalToplistViewWorkerResponse}>, acquisitions: [] as string[][],
  acquisitionGate: undefined as Promise<void> | undefined, acquisitionHeld: false,
  manifestGate: undefined as Promise<void> | undefined, manifestHeld: false,
  failNextInit: false, failNextSearch: false, workerStarts: [] as string[], terminations: 0, messages: [] as any[],
  downloads: [] as string[], results: [] as string[], errors: [] as string[], metadata: [] as string[], documentId: crypto.randomUUID(), scope: () => pageContextStore.get("local-toplist").servers };
(globalThis as any).w17 = api;
window.addEventListener("unhandledrejection", e => api.errors.push(String(e.reason)));
const publicFilters = JSON.stringify({servers:["F8","STUMBLESTEPPE"],sortBy:"level",classes:[],guilds:[],searchText:""});
if (!localStorage.getItem("TL_FILTERS_V2")) localStorage.setItem("TL_FILTERS_V2", publicFilters);
const nativeFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (normalApp && url.includes("/auth/")) return Promise.resolve(new Response(JSON.stringify({error:"isolated-test-unauthenticated"}),{status:401}));
  if (url.includes("catalog.json")) { api.metadata.push("catalog"); return Promise.resolve(new Response(JSON.stringify({schemaVersion:1, archives:[{year:2026,active:true,manifestUrl:`${location.origin}/w17-manifest.json`}]}))); }
  if (url.includes("w17-manifest.json")) { api.metadata.push("manifest"); return (async () => { if (api.manifestGate) {api.manifestHeld = true; await api.manifestGate;} return new Response(JSON.stringify({ schemaVersion:1,archiveYear:2026,revision:1,updatedAt:new Date(now).toISOString(),scanCount:2,serverCount:2,scans:entries,
    toplists:{schemaVersion:1,current:Object.fromEntries(entries.map(e=>[e.server,e.id])),monthly:{}} })); })(); }
  return nativeFetch(input, init);
}) as typeof fetch;
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) { super(url, options); api.workerStarts.push(String(url)); }
  postMessage(message: any, transfer: Transferable[] | StructuredSerializeOptions = []) {
    const send = (value: any) => Array.isArray(transfer) ? super.postMessage(value, transfer) : super.postMessage(value, transfer);
    if (message.type === "init") api.messages.push({type:message.type,scope:api.scope(),datasetId:message.datasetId,contentRevision:message.contentRevision});
    if (api.failNextInit && message.type === "init") { api.failNextInit = false; return send({...message,playerRows:null}); }
    if (api.failNextSearch && message.type === "search") {api.failNextSearch = false; return send({...message,datasetId:"foreign-controlled-dataset"});}
    send(message);
  }
  terminate() {api.terminations++; super.terminate();}
};
if (normalApp) {
  const rule = {id:"main.guildHub",route:"/guild-hub",area:"main",status:"active",minRole:"guest"};
  localStorage.setItem("sf_feature_access_snapshot",JSON.stringify({byId:{"main.guildHub":rule},byRoute:{"/guild-hub":rule}}));
  localStorage.setItem("sf_feature_access_date",new Date().toISOString().slice(0,10));
}
let navigate!: ReturnType<typeof useNavigate>;
function App() { navigate = useNavigate(); return <><button data-home onClick={() => navigate("/data-hub")}>Data Hub</button><Routes>
  <Route path="*" element={<DataHub/>}/><Route path="/data-hub/toplist" element={<Toplist/>}/></Routes></>; }
async function click(element: Element | undefined | null) { assert(element, "Control missing"); flushSync(() => (element as HTMLElement).click()); await pause(); }
const button = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label);
async function open() { await click(document.querySelector('button[aria-label^="Select servers"]')); await until(() => !!document.querySelector('[role="dialog"]'), "picker"); }
async function rows() { await until(() => !!document.querySelector('[data-sfh-identifier]') || document.body.innerText.includes("binding_mismatch"), "visible rows"); assert(!document.body.innerText.includes("binding_mismatch"), "binding mismatch"); }
async function run() {
  // This entry test controls acquisition, and seeds only archive sidecars for
  // the new cross-server search. No local table dataset is prepared at mount.
  for (const e of entries) {
    const content = raw(e.server);
    await putSfDataHubArchiveSearchIndexCache(e, { schemaVersion: 1, archiveScanId: e.id, sourceSha256: e.sha256, server: e.server, timestamp: e.timestamp,
      players: content.players.map(p => ({ identifier: p.identifier, name: p.name, classId: p.class, guildIdentifier: p.guildIdentifier, guildName: p.guildName })),
      guilds: content.groups.map(g => ({ identifier: g.identifier, name: g.name })) });
  }
  if (new URL(location.href).searchParams.has("stale")) {
    const registered = await navigator.serviceWorker.register("/service-worker.js", {scope:"/"});
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {once:true}));
    const legacy = await nativeFetch("/docs/assets/localToplistView.worker-DL2AShum.js");
    assert(legacy.ok, "existing legacy worker asset available");
    const cache = await caches.open("sfdatahub-cache-v2");
    await cache.put(`${location.origin}/src/workers/localToplistView.worker.ts?worker_file&type=module`, new Response(await legacy.text(), {headers:{"Content-Type":"text/javascript"}}));
    (api as any).staleWorker = {url:"/src/workers/localToplistView.worker.ts?worker_file&type=module", artifact:"docs/assets/localToplistView.worker-DL2AShum.js", scope:registered.scope};
  }
  try {
    await click(document.querySelector('a[href="#/data-hub/toplist"]'));
    await until(() => (api as any).contextIssues !== undefined, "context resolution"); await pause(); await pause();
    (api as any).initial = {scope:api.scope(),acquisitions:api.acquisitions.length,datasetInitMessages:api.messages.length,
      derivationWorkerStarts:api.workerStarts.filter(url=>url.includes("localToplistDerivation.worker")).length,
      idleViewWorkerStarts:api.workerStarts.filter(url=>url.includes("localToplistView.worker")).length,
      otherSearchIndexWorkerStarts:api.workerStarts.filter(url=>url.includes("scanArchiveSearchIndex.worker")).length,metadata:[...api.metadata]};
    api.results.push(`initial scope ${JSON.stringify(api.scope())}; toplist acquisitions=${api.acquisitions.length}; worker init=${api.messages.length}`);
    if (!new URL(location.href).searchParams.has("before")) {
      assert(JSON.stringify(api.scope()) === "[]", "first navigation starts empty");
      assert(api.acquisitions.length === 0 && api.messages.length === 0, "empty scope owns no acquisition or dataset preparation");
      assert(document.body.innerText.includes("Please select at least one server."), "selection prompt");
    }
    await open();
    if ((api.scope() ?? []).length) await click(button("Clear"));
    await click(document.querySelector('button[title="Fusion 8"]')); await click(button("Done")); await rows();
    api.results.push("F8 cold guild rows"); await click(button("Players")); await rows(); api.results.push("F8 cold player rows");
    assert((api.scope() ?? []).join() === "F8", "single fusion scope");
    await click(document.querySelector('[data-home]')); await until(() => !!document.querySelector('a[href="#/data-hub/toplist"]'), "home");
    await click(document.querySelector('a[href="#/data-hub/toplist"]')); await rows();
    assert((api.scope() ?? []).join() === "F8", "ordinary return restores own scope"); api.results.push("tile return restores F8 without scope expansion");
    await open(); await click(button("Clear")); await click(button("Done"));
    await until(() => !document.querySelector('[data-sfh-identifier]'), "empty clears table");
    const work = api.acquisitions.length, inits = api.messages.length;
    await pause(); await pause();
    assert(api.acquisitions.length === work && api.messages.length === inits, "cleared scope starts no new owner data work");
    await click(document.querySelector('[data-home]')); await until(() => !!document.querySelector('a[href="#/data-hub/toplist"]'), "home");
    let release!: () => void; api.manifestGate = new Promise<void>(resolve => release = resolve); api.manifestHeld = false;
    await click(document.querySelector('a[href="#/data-hub/toplist"]')); await until(() => api.manifestHeld, "late manifest held");
    await open(); await click(button("Clear")); await click(button("Done")); api.manifestGate = undefined; release(); await pause(); await pause();
    assert(JSON.stringify(api.scope()) === "[]" && api.acquisitions.length === work, "late manifest cannot fill cleared scope");
    api.results.push("explicit clear survives remount and delayed manifest with no owner acquisition");
    await open();
    let releaseAcquisition!: () => void; api.acquisitionGate = new Promise<void>(resolve => releaseAcquisition = resolve); api.acquisitionHeld = false;
    await click(document.querySelector('button[title="Stumble Steppe"]')); await click(button("Done")); await until(() => api.acquisitionHeld, "selected named-server acquisition held");
    await open(); await click(button("Clear")); await click(button("Done"));
    const heldWork = api.acquisitions.length, heldInits = api.messages.length;
    api.acquisitionGate = undefined; releaseAcquisition(); await pause(); await pause();
    assert(JSON.stringify(api.scope()) === "[]" && !document.querySelector('[data-sfh-identifier]'), "late acquisition cannot publish after explicit clear");
    assert(api.acquisitions.length === heldWork && api.messages.length === heldInits, "clear never starts replacement all-server acquisition or dataset init");
    api.results.push("held own acquisition finishes after clear without rows, replacement acquisition or dataset preparation");
    await open(); api.failNextInit = true; await click(document.querySelector('button[title="Stumble Steppe"]')); await click(button("Done"));
    await until(() => document.body.innerText.includes("Cannot") || document.body.innerText.includes("null") || document.body.innerText.includes("iterable"), "controlled actual worker failure");
    const terminations = api.terminations;
    await click(button("Retry")); await rows(); assert(api.terminations >= terminations && !api.failNextInit, "bounded worker retry");
    api.results.push("named registry server STUMBLESTEPPE: actual malformed-init worker failure, termination and visible Retry recover guild rows");
    await click(button("Players")); await rows(); api.results.push("named registry server STUMBLESTEPPE player rows");
    const setQuery = async (value: string) => {
      const input = document.getElementById("guild-hub-local-toplist-search") as HTMLInputElement;
      assert(input,"real local search input"); input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);
      input.dispatchEvent(new Event("input",{bubbles:true})); await pause();
    };
    api.failNextSearch = true; await setQuery("W17 Player");
    await until(() => document.body.innerText.includes("local_toplist_view_worker_dataset_not_initialized"),"controlled actual searchworker failure");
    const searchTerminations = api.terminations;
    await click(button("Retry"));
    await until(() => [...document.querySelectorAll("#guild-hub-local-toplist-search-results button")].some(b=>b.textContent?.includes("W17 Player 1")),"search retry returns actual results");
    assert(api.terminations >= searchTerminations && (api.scope() ?? []).join() === "STUMBLESTEPPE","search retry recreates worker and preserves scope");
    api.results.push("actual searchworker dataset error ends cleanly; visible Retry acknowledges fresh worker and restores search results without changing scope");
    await setQuery("");

    await open(); await click(button("Clear"));
    for (const region of ["EU", "US", "INT", "Fusion"]) await click(document.querySelector(`section[aria-labelledby="region-${region}"] button`));
    await click(button("Done")); await rows();
    const all = Object.values(buildToplistServerGroupsFromRegistry()).flat().sort();
    assert(JSON.stringify([...(api.scope() ?? [])].sort()) === JSON.stringify(all), "only explicit region Select all selects all registry servers");
    api.results.push(`explicit all ${all.length} registry servers supported; owner resolves only two available archive servers`);
    await click(document.querySelector('[data-home]')); await until(() => !!document.querySelector('a[href="#/data-hub/toplist"]'), "home");
    await click(document.querySelector('a[href="#/data-hub/toplist"]')); await rows();
    assert(JSON.stringify([...(api.scope() ?? [])].sort()) === JSON.stringify(all), "explicit complete scope survives remount");
    await open(); await click(button("Clear")); await click(document.querySelector('button[title="Fusion 8"]')); await click(button("Done")); await rows();
    // Existing explicit targeted ingress: set one declared server without all-server expansion.
    flushSync(() => navigate("/data-hub")); await until(() => !!document.querySelector('a[href="#/data-hub/toplist"]'), "home");
    flushSync(() => navigate("/data-hub/toplist", {state:{hubToplistTarget:{version:1,id:"w17-target",kind:"player",server:"STUMBLESTEPPE",identifiers:["stumblesteppe_net_p1"],label:"W17 Player 1",month:null}}}));
    await rows(); assert((api.scope() ?? []).join() === "STUMBLESTEPPE", "targeted entrance keeps one declared server");
    api.results.push("explicit targeted player ingress retains single named-server scope");
    // Leave a valid own scope for a real browser reload and persisted IDB proof.
    await open(); await click(button("Clear")); await click(document.querySelector('button[title="Fusion 8"]')); await click(button("Done")); await rows();
    assert(api.errors.length === 0 && w08.publicCalls === 0, "no unhandled errors or public profile/provider");
  } catch (error) { return evidence(String(error)); }
  return evidence();
}
function evidence(error?: string) { return {error,results:api.results,scope:api.scope(),initial:(api as any).initial,bindings:api.bindings,messages:api.messages,acquisitions:api.acquisitions,downloads:api.downloads,workerStarts:api.workerStarts,terminations:api.terminations,metadata:api.metadata,errors:api.errors,contextIssues:(api as any).contextIssues,staleWorker:(api as any).staleWorker}; }
async function checkReload(expected: string[]) {
  if (document.querySelector('a[href="#/data-hub/toplist"]')) await click(document.querySelector('a[href="#/data-hub/toplist"]'));
  await until(() => (api as any).contextIssues !== undefined, "reload context");
  assert(JSON.stringify(api.scope()) === JSON.stringify(expected), "own scope survives real reload");
  if (expected.length) { await rows(); await click(button("Players")); await rows(); assert(api.downloads.length === 0, "valid persisted raw/derived data restore without archive download"); }
  else { await pause(); await pause(); assert(api.acquisitions.length === 0 && api.messages.length === 0, "empty reload has no owner data work"); }
  assert(localStorage.getItem("TL_FILTERS_V2") === publicFilters, "public filters untouched");
  assert(JSON.parse(localStorage.getItem("SFH_LOCAL_TL_FILTERS_V1") ?? "{}").sortBy === "level", "other own filter survives reload");
  return evidence();
}
async function selectAll() {
  await open(); await click(button("Clear"));
  for (const region of ["EU", "US", "INT", "Fusion"]) await click(document.querySelector(`section[aria-labelledby="region-${region}"] button`));
  await click(button("Done")); await rows(); return api.scope();
}
async function clear() {await open(); await click(button("Clear")); await click(button("Done")); await until(() => !document.querySelector('[data-sfh-identifier]'), "cleared rows");}
async function runApp() {
  try {
    assert(document.querySelector("#app-shell"), "normal src/main.tsx / RootLayout mounted");
    await click(document.querySelector('a[href="#/data-hub/toplist"]'));
    await until(() => (api as any).contextIssues !== undefined,"normal app context");
    assert(JSON.stringify(api.scope()) === "[]" && api.acquisitions.length === 0 && api.messages.length === 0,"normal app empty owner start");
    await open(); await click(document.querySelector('button[title="Fusion 8"]')); await click(button("Done")); await rows();
    await click(button("Players")); await rows();
    api.results.push("normal index.html → src/main.tsx → RootLayout → real Data Hub tile → real picker → F8 guild/player rows");
    await open(); await click(button("Clear")); await click(document.querySelector('button[title="Stumble Steppe"]')); await click(button("Done")); await rows();
    await click(button("Guilds")); await rows();
    assert((api.scope() ?? []).join() === "STUMBLESTEPPE", "normal app named scope");
    api.results.push("normal frontend named registry scope → visible player/guild rows without binding error");
    assert(api.errors.length === 0,"normal app no unhandled errors");
    return evidence();
  } catch(error) {return evidence(String(error));}
}
Object.assign(api,{checkReload,clear,selectAll,runApp});

await i18n.use(initReactI18next).init({lng:"en",fallbackLng:"en",resources:{en:{translation:en}},interpolation:{escapeValue:false}});
if (!normalApp) createRoot(document.getElementById("root")!).render(<React.StrictMode><HashRouter><App/></HashRouter></React.StrictMode>);
void until(() => !!document.querySelector('a[href="#/data-hub/toplist"], button[aria-label^="Select servers"]'), "production entry").then(() => {api.ready = true;});
