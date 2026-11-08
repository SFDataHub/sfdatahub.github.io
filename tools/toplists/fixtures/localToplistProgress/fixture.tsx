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
const previousTime = Date.UTC(2026,8,8,12);
const previousEntries = entries.map(e=>({...e,id:e.id+'-previous',path:e.id+'-previous.json.gz',timestamp:previousTime,timestampUtc:new Date(previousTime).toISOString(),sha256:(e.id==='fusion'?'c':'d').repeat(64)}));
const raw = (server: string, at = now) => ({ players: Array.from({length: 3}, (_, i) => ({ identifier: `${server}_p${i+1}`, prefix: server, timestamp: at,
  name: `W17 Player ${i+1}`, class: 1, level: 100+i, rank: i+1, guildIdentifier: `${server}_g1`, guildName: "W17 Guild",
  values: { Base: 10000-i, "Base Strength": 10000-i, "Base Constitution": 500, Attribute: 15000-i, Constitution: 750 } })),
  groups: [{ identifier: `${server}_g1`, prefix: server, timestamp: at, name: "W17 Guild", rank: 1, memberCount: 3, avgLevel: 101 }] });
const gates = new Map<string, Promise<void>>();
const releases = new Map<string, () => void>();
const fail = new Set<string>();
const downloadStarted: string[] = [];
const w08 = { loads: [] as any[], acks: [] as any[], publicCalls: 0,
  acquire: async (selected: ScanArchiveEntry[], options: any) => {
    api.acquisitions.push(selected.map(e => e.server));
    const held = api.acquisitionGate;
    if (held) {api.acquisitionHeld = true; await held;}
    return acquireExplicitLocalFirstArchiveScans(selected, { ...options, dependencies: { downloadArchiveEntry: async requested => {
      api.downloads.push(requested.server); downloadStarted.push(requested.id); if (gates.has(requested.id)) await gates.get(requested.id); if (fail.has(requested.id)) throw Error("controlled source failure"); return { content: JSON.stringify(raw(requested.server, requested.timestamp)) };
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
  if (url.includes("w17-manifest.json")) { api.metadata.push("manifest"); return (async () => { if (api.manifestGate) {api.manifestHeld = true; await api.manifestGate;} return new Response(JSON.stringify({ schemaVersion:1,archiveYear:2026,revision:1,updatedAt:new Date(now).toISOString(),scanCount:4,serverCount:2,scans:[...entries,...previousEntries],
    toplists:{schemaVersion:1,current:Object.fromEntries(entries.map(e=>[e.server,e.id])),monthly:{"2026-09":Object.fromEntries(previousEntries.map(e=>[e.server,e.id]))}} })); })(); }
  return nativeFetch(input, init);
}) as typeof fetch;
const workerGates = new Map<string, Promise<void>>();
let viewGate: Promise<void> | undefined;
let releaseView: () => void;
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) { super(url, options); api.workerStarts.push(String(url)); }
  postMessage(message: any, transfer: Transferable[] | StructuredSerializeOptions = []) {
    const send = (value: any) => Array.isArray(transfer) ? super.postMessage(value, transfer) : super.postMessage(value, transfer);
    if (message.type === "init") api.messages.push({type:message.type,scope:api.scope(),datasetId:message.datasetId,contentRevision:message.contentRevision});
    if (api.failNextInit && message.type === "init") { api.failNextInit = false; return send({...message,playerRows:null}); }
    if (api.failNextSearch && message.type === "search") {api.failNextSearch = false; return send({...message,datasetId:"foreign-controlled-dataset"});}
    const workerGate = message.type === 'derive-toplists' ? workerGates.get(message.sources?.[0]?.archiveScanId) : ['init','view'].includes(message.type) ? viewGate : undefined;
    if (workerGate) {void workerGate.then(()=>send(message)); return;}
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

Object.assign(api, { before:false, positions:[] as any[], samples:[] as any[] });
let commandResolve: () => void;
(globalThis as any).w18Resolve = () => commandResolve();
async function command(value: object) { await new Promise<void>(resolve => { commandResolve=resolve; (window as any).w18Command(JSON.stringify(value)); }); }
function hold(id: string) { gates.set(id,new Promise<void>(resolve=>releases.set(id,resolve))); }
function holdView() {viewGate=new Promise<void>(resolve=>releaseView=resolve);}
function finishView() {viewGate=undefined;releaseView();}
function release(id: string) { releases.get(id)?.(); gates.delete(id); }
function position(label: string) {
 const header = document.querySelector('.toplists-table-header, [data-local-toplist-header]');
 const body = document.querySelector('.toplists-table-scroll, [data-local-toplist-body]');
 const loading = document.querySelector('[data-local-toplist-progress]');
 const rect = (el: Element | null) => el ? {top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right} : null;
 const sample = {label, header:rect(header),body:rect(body),progress:rect(loading),text:document.body.innerText, scope:api.scope(), progressHtml:loading?.outerHTML};
 (api as any).positions.push(sample); return sample;
}
function assertStable(before:string,after:string) {
 const a=(api as any).positions.find((p:any)=>p.label===before),b=(api as any).positions.find((p:any)=>p.label===after);
 assert(a.header?.top===b.header?.top&&a.body?.top===b.body?.top,`stable positions ${before} → ${after}`);
 if (a.progress) assert(a.progress.top>=a.header.bottom && a.progress.right<=innerWidth,'loading under actual header and reachable');
}
async function shot(label:string) {position(label); await command({type:'screenshot',label});}
async function scope(values:string[]) { flushSync(()=>pageContextStore.selectServers(values)); await pause(); }
async function done() {await until(()=>!!document.querySelector('[data-sfh-identifier]') && !document.querySelector('[data-local-toplist-progress]'),'completed real view');}
function progress() {const bar=document.querySelector('[role=progressbar]'); return {value:bar?.getAttribute('aria-valuenow'),max:bar?.getAttribute('aria-valuemax'),text:document.querySelector('[data-local-toplist-progress]')?.textContent};}
async function run() {
 try {
 await click(document.querySelector('a[href="#/data-hub/toplist"]')); await until(()=>(api as any).contextIssues !== undefined,'manifest');
 let finishDerivation: () => void = () => {};
 if (!(api as any).before) {workerGates.set('named',new Promise<void>(resolve=>finishDerivation=resolve)); holdView();}
 hold('fusion'); hold('named'); await scope(['F8','STUMBLESTEPPE']);
 await until(()=>downloadStarted.includes('fusion') && downloadStarted.includes('named'),'real downloads held');
 await shot('cold-loading');
 if (!(api as any).before) {assert(!document.body.innerText.includes('Ready - 0 rows')&&!document.body.innerText.includes('No results'),'no misleading completed empty state'); assert(progress().max==='2'&&progress().value==='0','physical source denominator 2');}
 release('fusion');
 if (!(api as any).before) {await until(()=>progress().value==='1','one actual acquisition completed'); (api as any).samples.push(progress()); await shot('cold-one-source');}
 release('named');
 if (!(api as any).before) {
 await until(()=>progress().text?.includes('Preparing toplist data')===true && progress().value==='1','one actual prepared snapshot');
 await shot('cold-one-snapshot'); (api as any).samples.push(progress());
 workerGates.delete('named');finishDerivation();
 await until(()=>progress().text?.includes('Preparing table')===true,'actual View awaits ACK');
 assert(progress().value==null && !document.body.innerText.includes('Ready -'),'no overall done before view'); await shot('cold-view-pending');finishView();
 }
 await done(); await shot('cold-ready');
 const pos=(api as any).positions;
 if (!(api as any).before) {
 assert(pos[0].header.top===pos.at(-1).header.top && pos[0].body.top===pos.at(-1).body.top,'stable desktop Guild header/body');
 api.results.push('Cold two physical sources: 0/2 → 1/2 through actual source completion; stable Guild header/body');
 const downloads=api.downloads.length, derives=api.workerStarts.filter(u=>u.includes('localToplistDerivation')).length;
 await scope(['F8']); await done(); await scope(['F8','STUMBLESTEPPE']); await done();
 assert(api.downloads.length===downloads && api.workerStarts.filter(u=>u.includes('localToplistDerivation')).length===derives,'warm reuse no downloads/derivation');
 api.results.push('Warm scope reuses confirmed Raw/Derived data without additional downloads/derivation');
 let finishAcquisition: () => void = () => {};
 api.acquisitionHeld=false;api.acquisitionGate=new Promise<void>(resolve=>finishAcquisition=resolve);
 holdView();await scope(Object.values(buildToplistServerGroupsFromRegistry()).flat());await until(()=>api.acquisitionHeld,'46 server real acquisition held');
 assert(progress().max==='2'&&progress().value==='0','46 selected servers have two pending physical sources');await shot('all-scope-sources-pending');
 api.acquisitionGate=undefined;finishAcquisition();await until(()=>progress().text?.includes('Preparing table')===true,'46 server view pending');await shot('all-scope-view-pending');finishView();await done();
 assert((api.scope()?.length??0)>10,'more than ten selected servers');
 assert(api.acquisitions.at(-1)?.length===2,'46 selected servers still two physical sources');
 api.results.push('46 selected registry servers map to two actual sources; no server/source confusion');
 await scope(['F8','STUMBLESTEPPE']); await done();
 await click(button('Players')); await done();
 holdView(); await scope(['F8']); await until(()=>!!document.querySelector('[data-local-toplist-progress]'),'Player view pending'); await shot('players-loading');finishView(); await done(); await shot('players-ready');
 assertStable('players-loading','players-ready');
 await command({type:'viewport',width:700,height:950}); await pause();
 holdView();await scope(['F8','STUMBLESTEPPE']);await until(()=>!!document.querySelector('[data-local-toplist-progress]'),'compact Player loading');await shot('compact-players-loading');finishView();await done();await shot('compact-players-ready');assertStable('compact-players-loading','compact-players-ready');
 assert(document.querySelector('[data-local-toplist-header]'),'compact Player has actual summary column header');
 await click(button('Guilds'));await done();holdView();await scope(['F8']);await until(()=>!!document.querySelector('[data-local-toplist-progress]'),'compact Guild loading');await shot('compact-guilds-loading');finishView();await done();await shot('compact-guilds-ready');assertStable('compact-guilds-loading','compact-guilds-ready');
 assert(document.querySelector('[data-local-toplist-header]'),'compact Guild has actual summary column header');
 await command({type:'viewport',width:1400,height:950}); await pause();
 api.results.push('Player/Guild loading → confirmed view: unchanged header/body in desktop and compact; reachable accessible phase bar');
 // A failed physical baseline source beside a confirmed cached current source.
 await scope(['F8','STUMBLESTEPPE']);await done();hold('fusion-previous');hold('named-previous');fail.add('named-previous');
 await click(button('Progress since'));
 const since=document.getElementById('toplists-compare-progress') as HTMLSelectElement;
 assert(since,'real compare month selector');flushSync(()=>{since.value='2026-09';since.dispatchEvent(new Event('change',{bubbles:true}));});
 await until(()=>downloadStarted.includes('fusion-previous')&&downloadStarted.includes('named-previous'),'real baseline acquisition');
 await shot('compare-loading');release('named-previous');
 await until(()=>progress().text?.includes('1 failed')===true,'failure reported separately');await shot('compare-failure-pending');(api as any).samples.push(progress());
 release('fusion-previous');await done();await shot('compare-partial');assertStable('compare-loading','compare-partial');
 assert(button('Retry'),'partial baseline has explicit retry');
 fail.delete('named-previous');hold('named-previous');await click(button('Retry'));await until(()=>downloadStarted.filter(id=>id==='named-previous').length>=2,'retry real missing source');
 await until(()=>progress().value==='1'&&progress().max==='2','completed local source beside pending retry');await shot('compare-retry-pending');
 release('named-previous');await done();await shot('compare-ready');
 api.results.push('Compare physical-source error remains failed; partial view + explicit Retry; current local source reused; baseline 1/2 while retry source pending');
 await click(button('Players'));await done();assert(!document.querySelector('[data-local-toplist-progress]'),'Player compare view ready');
 await click(button('Off'));await done();
 // Held real View replies from old scope cannot finish or overwrite a new/empty scope.
 holdView();await scope(['F8']);await until(()=>!!document.querySelector('[data-local-toplist-progress]'),'old view held');
 await scope(['STUMBLESTEPPE']);await until(()=>!!document.querySelector('[data-local-toplist-progress]'),'new view held');
 await scope([]);assert(!document.querySelector('[data-local-toplist-progress]'),'Clear cancels progress immediately');finishView();await pause();await pause();
 assert(!document.querySelector('[data-sfh-identifier]')&&!document.querySelector('[data-local-toplist-progress]'),'old reply never publishes after clear');
 await scope(['STUMBLESTEPPE']);await done();assert(api.scope()?.join()==='STUMBLESTEPPE','new scope alone');
 api.failNextInit=true;await scope(['F8']);await until(()=>document.body.innerText.includes('Cannot read'),'actual malformed worker error');
 assert(!document.querySelector('[data-local-toplist-progress]'),'worker error is not perpetual progress');await click(button('Retry'));await done();
 api.results.push('Scope switch + Clear discard old actual View replies; real worker error stops loading; one-shot Retry confirms a new View');
 await click(document.querySelector('button[title="Mage"]'));
 await until(()=>document.body.innerText.includes('Ready - 0 rows')&&document.body.innerText.includes('No results')&&!document.querySelector('[data-local-toplist-progress]'),'genuinely completed empty filter view');
 await shot('confirmed-empty');await click(button('None'));await done();
 api.results.push('Confirmed empty filtered View alone shows Ready 0 / No results; loading and empty selection remain separate');
 }
 assert(api.errors.length===0,'no unhandled error');
 } catch(error) {await shot('failure');return {error:String(error),results:api.results,positions:(api as any).positions,samples:(api as any).samples};}
 return {results:api.results,positions:(api as any).positions,samples:(api as any).samples,downloads:api.downloads,acquisitions:api.acquisitions,bindings:api.bindings};
}
await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:{en:{translation:en}},interpolation:{escapeValue:false}});
createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><App/></HashRouter></React.StrictMode>);
void until(()=>!!document.querySelector('a[href="#/data-hub/toplist"]'),'production entry').then(()=>{api.ready=true;});
