import { DataJobsProvider, useDataJobs } from "../../../../src/context/DataJobsContext";
import { NotificationsProvider } from "../../../../src/context/NotificationsContext";
import { scanFightReportScreenshot } from "../../../../src/pages/GuildHub/fightReportOcr";
import "./metrics";
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { openDB } from "idb";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../../../src/i18n/en.json";
import "../../../../src/styles/index.css";
import { LocalePreferencesProvider } from "../../../../src/context/LocalePreferencesContext";
import RootLayout from "../../../../src/layout/RootLayout";
import { dataHubRouteElements } from "../../../../src/pages/DataHub/routes";
import DataHubRouteHost from "../../../../src/pages/DataHub/RouteHost";
import ScanManagement from "../../../../src/components/ScanManagement/ScanManagementOverlay";
import { FEATURE_ACCESS_CONFIG, FeatureAccessProvider } from "../../../../src/lib/featureAccessConfig";
import { LEGACY_DATA_HUB_ROUTES, localEntityPath, parseLocalEntity } from "../../../../src/lib/data-hub/routes";
import { useLocalProfileNavigation } from "../../../../src/lib/data-hub/profileNavigation";
import { pageContextStore, pageGuildReference } from "../../../../src/lib/data-hub/pageContextStore";
import { hubFavoritesStore } from "../../../../src/lib/data-hub/hubFavoritesStore";
import { guildFavorite } from "../../../../src/lib/data-hub/hubFavoritesContract";
import { localPlayerFavorite } from "../../../../src/lib/data-hub/hubFavoritesProjection";
import { resolveLocalProfileEntry } from "../../../../src/lib/data-hub/localProfileEntry";
import * as scans from "../../../../src/lib/guilds/localScanLibrary";
import { acquireExplicitLocalFirstArchiveScans } from "../../../../src/lib/scanArchive/localFirstScanAcquisition";
import { loadScanArchiveManifestEntries } from "../../../../src/lib/scanArchive/client";
import { sharedAnalyticsPreparation } from "../../../../src/lib/local-player-profile/sharedPreparation";
import FightTracking from "../../../../src/pages/GuildHub/FightTracking";
import * as trackerStore from "../../../../src/pages/GuildHub/fightTrackingStore";
import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";
import type { LocalPlayerCurrentSeed } from "../../../../src/pages/GuildHub/localPlayerCurrentSeed";
import { __scanArchiveSearchIndexServiceTestUtils } from "../../../../src/lib/scanArchive/searchIndexService";
import { FilterProvider, useFilters } from "../../../../src/components/Filters/FilterContext";
import { setRole } from "./mocks";
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20));
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
const until = async (check: () => boolean, message: string) => { for (let i=0;i<1500;i++) { if (check()) return; await pause(); } throw Error(`${message}: ${document.body.innerText.slice(0,700)}; favorites=${JSON.stringify(hubFavoritesStore.getSnapshot())}; dialogs=${document.querySelectorAll('[data-favorite-id]').length}`); };
const results: string[] = [], errors: string[] = [];
const time = Date.UTC(2026,9,6,12), historical = Date.UTC(2026,8,6,12), baseline = Date.UTC(2026,7,6,12);
const raw = (at: number) => ({ players: [1,2].map(id => ({ identifier: `f8_net_p${id}`, prefix: "f8_net", timestamp: at, name: `${at===time?'Current':'Historical'} Player ${id}`, class: 1, level: 100+id, rank: id, guildIdentifier: "f8_net_g1", guildName: "Fixture Guild", values: { Base: 1000, Attribute: 2000, "Base Strength": 500, "Base Constitution": 500 } })), groups: [{ identifier: "f8_net_g1", prefix: "f8_net", timestamp: at, name: "Fixture Guild", rank: 1, memberCount: 2, memberIdentifiers: ["f8_net_p1","f8_net_p2"] }] });
const entry = (id: string, at: number): ScanArchiveEntry => ({ id, server: "f8_net", timestamp: at, archiveYear: 2026, path: `${id}.gz`, format: "sftools.raw.v1", compression: "gzip", sha256: id[0].repeat(64), compressedBytes:1, uncompressedBytes:1, searchIndex:{schemaVersion:1,path:`${id}-index.gz`,sha256:"f".repeat(64),compressedBytes:1,uncompressedBytes:1,playerCount:2,groupCount:1}, playerCount:2, groupCount:1, manifestRevision:1, manifestUrl:"https://fixture.invalid/manifest.json", fileUrl:`https://fixture.invalid/${id}.gz` });
const currentEntry = entry("ccccurrent",time), historicalEntry = entry("aaaold",historical), baselineEntry = entry("bbbbaseline",baseline);
const entries = [baselineEntry,historicalEntry,currentEntry];
const manifest = { schemaVersion:1,archiveYear:2026,revision:1,updatedAt:new Date(time).toISOString(),scanCount:3,serverCount:1,scans:entries,toplists:{schemaVersion:1,current:{f8_net:currentEntry.id},monthly:{"2026-08":{f8_net:baselineEntry.id},"2026-09":{f8_net:historicalEntry.id}}} };
const w08 = { context: { status:"complete",catalog:null,manifests:[manifest],manifestUrlsByYear:{2026:currentEntry.manifestUrl},entries:[currentEntry],selections:[],serverOptions:[{server:"F8",sourceServer:"f8_net",label:"F8",archiveScanId:currentEntry.id,scanTimestamp:time}],issues:[] }, filters: {} as any, loads: [] as any[],publicCalls:0,acks:[] as any[],
  acquire: (selected: ScanArchiveEntry[], options: any) => acquireExplicitLocalFirstArchiveScans(selected,{...options,dependencies:{downloadArchiveEntry:async (e:ScanArchiveEntry)=>({content:JSON.stringify(raw(e.timestamp))})}}) };
(globalThis as any).w08=w08;
const api = { ready:false, documentId:crypto.randomUUID(), results, errors, reads:[] as string[], cores:[] as string[], builds:[] as string[], gate:undefined as Promise<void>|undefined, gateSource:"", gateHeld:false, run:runFinal, reloadCheck:reloadFinal,
  measurements: {} as Record<string,unknown>, setScan:(_open:boolean)=>{}, navigate:(_to:string,_state?:unknown)=>{}, profile:null as any, requestEnds:0, openExact:(_identifier:string,_server:string,_source:string,_at:number,_row:string)=>{},
  projectionCommitReads:0, offlineMetadata:false, holdAcks:false, heldAcks:[] as {ack:any;replay:()=>void}[], indexTimings:[] as any[], searchControllers: [] as any[], searchReads: [] as string[], source:"", oldSource:"", location:null as any, publicCalls:0, filters:null as any,filterScope:"", counters:null as any, testSeed:undefined as LocalPlayerCurrentSeed|undefined, open:(_seed:LocalPlayerCurrentSeed)=>{}, auth:setRole };
(globalThis as any).w12=api;
window.addEventListener("unhandledrejection",e=>errors.push(String(e.reason)));
const nativeFetch=window.fetch.bind(window);
window.fetch = (async (input,init) => { const value=String(input); if(value.includes("catalog")||value.startsWith(location.origin+"/archive/")||value.startsWith(location.origin+"/w32/")){if(api.offlineMetadata && (value.includes("catalog")||value.endsWith("manifest.json")))throw Error("controlled offline metadata");return nativeFetch(input,init);} throw Error(`Unexpected external request: ${value}`); }) as typeof fetch;
const writeLog: string[]=[]; const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(value:any,...args:any[]) { if(this.name==="state")writeLog.push(value.key);return put.call(this,value,...args); };
function storeRules(hidden=false) { const rules=FEATURE_ACCESS_CONFIG.map(r=>r.id==="main.guildHub"?{...r,status:hidden?"hidden":"active"}:r);localStorage.setItem("sf_feature_access_snapshot",JSON.stringify({byId:Object.fromEntries(rules.map(r=>[r.id,r])),byRoute:Object.fromEntries(rules.map(r=>[r.route,r]))}));localStorage.setItem("sf_feature_access_date",new Date().toISOString().slice(0,10)); }
storeRules();
function FiltersProbe({scope="public"}:{scope?:string}){const filters=useFilters();api.filters=filters;api.filterScope=scope;return <button data-filter-change onClick={()=>filters.setSearchText("local-only")}>Change filter</button>;}
function OriginHarness(){const navigation=useLocalProfileNavigation();api.open=navigation.open;api.openExact=navigation.openExact;return <button data-seeded-open onClick={()=>api.testSeed&&navigation.open(api.testSeed)}>Open prepared</button>;}
function Login(){const l=useLocation();return <div data-login>{l.search}</div>;}
function JobsProbe(){(globalThis as any).w32Jobs=useDataJobs();return null;}
function App(){const navigate=useNavigate(),location=useLocation();api.location=location;api.navigate=(to,state)=>flushSync(()=>navigate(to,{state}));const [scan,setScan]=React.useState(false);api.setScan=open=>flushSync(()=>setScan(open));return <><DataHubRouteHost>{l=><Routes location={(monitor.w12.routeLocation=l,l)}><Route element={<RootLayout/>}>{dataHubRouteElements()}<Route path="/" element={<div data-home>Home</div>}/><Route path="/login" element={<Login/>}/><Route path="/filter-probe" element={<FilterProvider key="public"><FiltersProbe/></FilterProvider>}/><Route path="/local-filter-probe" element={<FilterProvider key="local" storageKey="SFH_LOCAL_TL_FILTERS_V1" migrateFrom="TL_FILTERS_V2"><FiltersProbe scope="local"/></FilterProvider>}/><Route path="/w14-tracker" element={<FightTracking/>}/><Route path="/origin" element={<OriginHarness/>}/><Route path="*" element={<div data-missing>Missing</div>}/></Route></Routes>}</DataHubRouteHost><ScanManagement isOpen={scan} onClose={()=>setScan(false)}/></>;}
let root:ReturnType<typeof createRoot>; let gateKey=0;
function render(){flushSync(()=>root.render(<React.StrictMode><HashRouter><FeatureAccessProvider key={gateKey}><LocalePreferencesProvider><NotificationsProvider><DataJobsProvider><JobsProbe/><App/></DataJobsProvider></NotificationsProvider></LocalePreferencesProvider></FeatureAccessProvider></HashRouter></React.StrictMode>));}
async function go(to:string,state?:unknown){api.navigate(to,state);await pause();}
async function click(selector:string){await until(()=>!!document.querySelector(selector),`Missing ${selector}`);const e=document.querySelector<HTMLElement>(selector);flushSync(()=>e!.click());await pause();}
async function tab(label:string){const find=()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label || b.querySelector('[class*=tabLabel]')?.textContent===label);await until(()=>!!find(),`Tab ${label}`);flushSync(()=>find()!.click());await pause();}
async function back(){history.back();await pause();}
const dialog=()=>document.querySelector('.profile-overlay--local[role="dialog"]');
const hero=()=>document.querySelector('.local-hero')?.textContent??document.querySelector('.player-profile')?.textContent??"";
async function profile(name="Current Player 1"){await until(()=>hero().includes(name),`Profile ${name}`);await pause();}
async function closed(){await until(()=>!dialog(),"profile closed");}
const guild={id:"f8_net_g1",guildId:"1",name:"Fixture Guild",server:"F8",logoIdentifier:"f8_net_g1",memberCount:2};
async function seed(){
  localStorage.setItem('TL_FILTERS_V2',JSON.stringify({servers:['F9'],searchText:'public-seed',classes:[]}));
  const basis=await loadScanArchiveManifestEntries({year:2026,active:true,manifestUrl:location.origin+"/archive/manifest.json"}); await acquireExplicitLocalFirstArchiveScans(basis.entries);const bindings=(await scans.readDataHubLocalScanMetadata()).bindings;api.source=bindings.find(b=>b.archiveScanId==="current-a")!.localScanId;api.oldSource=bindings.find(b=>b.archiveScanId==="historical")!.localScanId;
  await hubFavoritesStore.refresh();await hubFavoritesStore.mutate({type:'save',favorite:guildFavorite(guild,0,null,false)});
  const p=await resolveLocalProfileEntry({entity:parseLocalEntity('player','F8','f8_net_p1')!,observation:{kind:'exact',anchor:{source:api.source,at:time}}});await hubFavoritesStore.mutate({type:'save',favorite:localPlayerFavorite(p)!});
  pageContextStore.selectServers(['F8']);pageContextStore.selectGuild('guild-dashboard',null);
  sessionStorage.setItem('w12-seeded','1');api.reads=[];api.cores=[];api.builds=[];
}
function input(selector:string,value:string){const element=document.querySelector<HTMLInputElement>(selector)!;assert(element,`input ${selector}`);element.focus();const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;flushSync(()=>{setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
function select(index:number,value:string){const element=document.querySelectorAll<HTMLSelectElement>('[data-hub-search] select')[index];assert(element,`select ${index}`);flushSync(()=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));});}
async function queryHub(text:string){input('[data-hub-search] input[type="search"]',text);await until(()=>!!document.querySelector('[data-hub-search-hit]'),`query ${text}`);await new Promise(r=>setTimeout(r,250));}
const hitSelector=(identifier:string)=>`[data-hub-search-hit="${identifier}"]`;
async function returnHub(){if(api.location.pathname!=="/data-hub"){history.back();await until(()=>api.location.pathname==='/data-hub','Back to search');}await until(()=>!!document.querySelector('[data-hub-search]'),'search remounted');document.querySelector<HTMLInputElement>('[data-hub-search] input[type=search]')!.focus();await new Promise(r=>setTimeout(r,300));}
async function targetAck(identifier:string){await until(()=>document.querySelector('[data-toplist-target-status]')?.getAttribute('data-toplist-target-status')==='visibleAck',`actual DOM ACK ${identifier}`);assert(!!document.querySelector(`[data-sfh-identifier="${identifier}"]`),'actual row DOM present');}

const monitor = globalThis as any;
const activeSearch = () => api.searchControllers.filter(c => !c.inspect().stopped).at(-1);
async function transportCount() { return (await (await nativeFetch('/archive/metrics.json')).json()).length as number; }
async function begin(name:string) { const index=await transportCount(); const window=monitor.w14Begin(name);window.transportIndex=index;return window; }
async function finish() {
  // Fixed quiet tail is part of the window; no dependent work is hidden after readiness.
  await new Promise(r=>setTimeout(r,350));
  const window=monitor.w14End(); window.transport=(await (await nativeFetch('/archive/metrics.json')).json()).slice(window.transportIndex);
  window.searchCosts=api.searchControllers.map(c=>({...c.costs,inspect:c.inspect()}));
  window.workers=monitor.w14Metrics.workers.slice(window.workersAtStart);
  window.notCaptured=['worker internal CPU and IDB','pure structured-clone time','RAM/heap','complete per-owner CPU timings'];
  return window;
}
async function dashboardReady(window:any) {
  await until(()=>!!document.querySelector('[data-hub-search]') && document.querySelectorAll('[data-inventory-kpi]').length===0,'dashboard with closed inventory DOM');
  window.readiness.entry=performance.now()-window.started;
  assert(!document.querySelector('[data-hub-favorites]'),'Dashboard favorites absent');await click('[data-local-favorites-trigger]');
  await until(()=>document.querySelectorAll('#local-favorites-dialog [data-favorite-id]').length===2,'two actual favorite rows');
  window.readiness.favorites=performance.now()-window.started;await click('#local-favorites-dialog > header button');
  await new Promise(r=>setTimeout(r,250));assert(!activeSearch(),'Dashboard opening before interaction has zero active search starts');assert(!document.querySelector('[data-search-loading]'),'mount no search spinner');
  document.querySelector<HTMLInputElement>('[data-hub-search] input')!.focus();
  await until(()=>{const s=activeSearch()?.getSnapshot();return s&&!s.local.preparing&&!s.archive.preparing;},'all source and archive search preparation');
  window.readiness.search=performance.now()-window.started;
  window.search=activeSearch().getSnapshot();
}
async function coldState() {
  await go('/origin');
  const db=await openDB('sfdatahub-local-data');
  const tx=db.transaction(['scans','scanSummaries','archiveScanBindings','archiveSearchIndexes','localToplistSnapshots','metadata'],'readwrite');
  await tx.objectStore('scanSummaries').clear();await tx.objectStore('archiveSearchIndexes').clear();await tx.objectStore('localToplistSnapshots').clear();
  for(const scan of await tx.objectStore('scans').getAll()) {
    delete scan.normalizedMembers;
    await tx.objectStore('scans').put(scan);
  }
  for(const binding of await tx.objectStore('archiveScanBindings').getAll()) {delete binding.readiness;await tx.objectStore('archiveScanBindings').put(binding);}
  for(const key of await tx.objectStore('metadata').getAllKeys()) if(String(key).startsWith('hub-search:'))await tx.objectStore('metadata').delete(key);
  await tx.done;db.close();
  const databases=await indexedDB.databases();
  if(databases.some(d=>d.name==='sfdatahub-guild-analytics')) {const adb=await openDB('sfdatahub-guild-analytics');const atx=adb.transaction([...adb.objectStoreNames],'readwrite');for(const store of adb.objectStoreNames)await atx.objectStore(store).clear();await atx.done;adb.close();}
  sessionStorage.setItem('w14-window','cold');
}
async function opening(name:string) {
  const window=await begin(`${name}: dashboard then explicit inventory`);
  await go('/data-hub');await dashboardReady(window);
  await new Promise(r=>setTimeout(r,350));
  const before=window.dashboardOpening={calls:{...window.calls},idbRequests:window.idb.length,transport:(await (await nativeFetch('/archive/metrics.json')).json()).slice(window.transportIndex),elapsed:performance.now()-window.started};
  for(const key of ['inventoryStart','inventoryMetadata','inventoryArchive','inventoryConfirm']) assert((before.calls[key]??0)===0,`${name}: no ${key} before icon`);
  const opened=performance.now();await click('[data-inventory-toggle]');
  await until(()=>[...(monitor.w14Inventories??[])].filter((c:any)=>!c.stopped).some((c:any)=>{const s=c.getSnapshot();return !s.available.loading&&!s.ready.loading&&!s.personal.loading;}),'explicit KPI controller terminal');
  window.readiness.kpisAfterIcon=performance.now()-opened;
  window.kpis=[...document.querySelectorAll('[data-inventory-kpi]')].map(e=>e.textContent);
  const complete=await finish();
  complete.inventoryOpening={calls:Object.fromEntries(Object.entries(complete.calls).map(([key,value])=>[key,(value as number)-(before.calls[key]??0)])),idbRequests:complete.idbGroups.reduce((n:number,e:any)=>n+e.requests,0)-before.idbRequests,transport:complete.transport.slice(before.transport.length),elapsed:performance.now()-opened};
  assert(complete.inventoryOpening.calls.inventoryStart>0,`${name}: actual inventory activated`);
  return complete;
}
async function cleanup() {
  await go('/origin');await new Promise(r=>setTimeout(r,350));
  const controllers=api.searchControllers.map(c=>c.inspect());
  assert(controllers.every(c=>c.stopped&&c.localDocuments===0&&c.archiveDocuments===0&&c.listeners===0),'all search consumers released');
  const readiness=monitor.w14ReadinessInspect();assert(readiness.flights===0&&readiness.consumers===0,'readiness flights released');
  assert(__scanArchiveSearchIndexServiceTestUtils.inFlightCount()===0,'search index flights released');
  assert(monitor.w14AcquisitionInspect()===0,'acquisition registry released');
  const preparation=sharedAnalyticsPreparation.inspect();
  return {controllers,readiness,indexFlights:__scanArchiveSearchIndexServiceTestUtils.inFlightCount(),acquisition:monitor.w14AcquisitionInspect(),preparation};
}
async function runFinal() {
  await coldState();const cold=await opening('cold');
  assert(cold.summary.rawRequests>0 && cold.calls.searchProjection>0 && cold.calls.readiness>0,'cold includes Raw, projection and readiness work');
  await cleanup();const warm=await opening('warm');
  assert((warm.calls.searchProjection??0)===0,'warm does not rebuild persisted projections');
  sessionStorage.setItem('w14-reload','1');
  return {cold,warm,cleanup:await cleanup()};
}
async function reloadFinal() {
  const reload=await opening('reload');
  assert((reload.calls.searchProjection??0)===0,'reload retains search projections');
  const window=await begin('five-warm-queries');
  const cpu=activeSearch().costs.queryMs;
  for(const text of ['Current','Player','f8_net_p1','Historical','Current Player 1'])await queryHub(text);
  window.queryCpuMs=activeSearch().costs.queryMs-cpu;
  const queries=await finish();assert(queries.summary.rawRequests===0,'warm queries have no physical Raw requests');
  const player=await begin('player-profile-target');await click(hitSelector('f8_net_p1')+' > button');await profile();player.visibleProfile=hero();const profileTarget=await finish();
  await returnHub();select(0,'toplist');await queryHub('Current Player 1');
  const toplist=await begin('player-toplist-target');await click(hitSelector('f8_net_p1')+' > button');await targetAck('f8_net_p1');toplist.rows=w08.loads.at(-1).result.playerRows.length;const toplistTarget=await finish();
  await cleanup();return {reload,queries,profileTarget,toplistTarget,cleanup:await cleanup()};
}
async function recovery() {
  await cleanup();const basis=await loadScanArchiveManifestEntries({year:2026,active:true,manifestUrl:location.origin+'/archive/manifest.json'});
  const member=basis.entries.find(e=>e.id==='historical')!;
  await acquireExplicitLocalFirstArchiveScans([member]);
  const binding=(await scans.listGuildHubArchiveScanBindings()).find(b=>b.archiveScanId==='historical')!;
  const db=await openDB('sfdatahub-local-data');const source=await db.get('scans',binding.localScanId);assert(source,'recovery setup source');
  // Deliberate isolated crash-like inconsistency. Production deletion normally
  // removes bindings; bypass it only to reach the surviving-binding branch.
  await db.delete('scans',source.id);assert(await db.get('archiveScanBindings',binding.key),'binding survives isolated Raw removal');
  const exact={entity:parseLocalEntity('player','F8','f8_net_p1')!,observation:{kind:'exact' as const,anchor:{source:source.id,at:historical}}};
  const error=async(work:()=>Promise<unknown>)=>{try{await work();return null;}catch(e){return {code:(e as any).code??null,name:(e as any).name,message:String(e)};}};
  const offlineStart=await transportCount();await nativeFetch('/archive/control?raw=offline');
  const offline=await error(()=>resolveLocalProfileEntry(exact));assert(offline,'offline recovery fails honestly');
  await nativeFetch('/archive/control?raw=online');
  // Acquisition validates and may remove stale bindings before a failed
  // download. Restore only the isolated surviving-binding precondition.
  await db.put('archiveScanBindings',binding);
  const retryStart=await transportCount();const retry=await error(()=>resolveLocalProfileEntry(exact));
  assert(retry?.code==='missing','new local source must not replace fixed historical source ID');
  const next=(await scans.listGuildHubArchiveScanBindings()).find(b=>b.archiveScanId==='historical')!;
  assert(next.localScanId!==source.id,'actual acquisition creates new local Source ID');
  const acquired=await resolveLocalProfileEntry({...exact,observation:{kind:'exact',anchor:{source:next.localScanId,at:historical}}});
  assert(acquired.sourceScanId===next.localScanId && acquired.analytics.scannedAtMs===historical,'new explicit source retains individual observation time');
  const free=await resolveLocalProfileEntry({...exact,observation:{kind:'free'}});
  assert(free.analytics.scannedAtMs===time,'free entry retains newest individual choice');
  await go(localEntityPath('player',exact.entity)+`?source=${encodeURIComponent(next.localScanId)}&at=${historical}`);await profile('Historical Player 1');
  await until(()=>hero().includes('Historical Player 1'),'visible recovered exact profile');
  const visible=hero();assert(visible.includes('Historical Player 1'),'recovery has actual profile DOM');await cleanup();
  const transport=await (await nativeFetch('/archive/metrics.json')).json();
  const downloads=transport.slice(retryStart).filter((r:any)=>r.path.endsWith('.gz'));
  assert(downloads.length===1&&downloads[0].path==='/archive/historical.gz','bounded matching physical version, no arbitrary Current acquisition');
  // An unusable but present Raw does not enter the existing !scan recovery branch.
  const recovered=await db.get('scans',next.localScanId);await db.put('scans',{...recovered,rawData:{}});
  const unusableStart=await transportCount();const unusable=await error(()=>resolveLocalProfileEntry({...exact,observation:{kind:'exact',anchor:{source:next.localScanId,at:historical}}}));
  assert(unusable,'unusable local Raw rejected');
  const unusableTransport=(await (await nativeFetch('/archive/metrics.json')).json()).slice(unusableStart);assert(!unusableTransport.some((r:any)=>r.path.endsWith('.gz')),'present unusable Raw has no W12 acquisition fallback');
  await db.put('scans',recovered);
  await db.delete('scans',next.localScanId);await db.put('archiveScanBindings',next);
  let release!:()=>void;monitor.w14RecoveryGate=new Promise<void>(r=>release=r);let allowed=true;
  const pending=error(()=>resolveLocalProfileEntry({...exact,observation:{kind:'exact',anchor:{source:next.localScanId,at:historical}}},undefined,()=>allowed));
  await until(()=>monitor.w14RecoveryHeld,'actual W12 recovery branch held');allowed=false;release();monitor.w14RecoveryGate=null;
  const stale=await pending;assert(stale?.name==='AbortError','expired recovery cannot return a target');
  db.close();
  return {sourceBefore:source.id,sourceAfter:next.localScanId,at:acquired.analytics.scannedAtMs,freeAt:free.analytics.scannedAtMs,offline,retry,visible,downloads,offlineTransport:transport.slice(offlineStart,retryStart),unusable,unusableTransport,stale,cleanup:await cleanup()};
}
async function large(kind:'single'|'multi') {
  await cleanup();
  const ids:string[]=[];const sourceCount=kind==='single'?1:5,perSource=kind==='single'?10000:2000;
  const setupStarted=performance.now();
  for(let s=0;s<sourceCount;s++) {
    const players=Array.from({length:perSource},(_,i)=>({...raw(time).players[0],identifier:`f8_net_p${10000+s*perSource+i}`,name:`Large Player ${s*perSource+i}`}));
    const result=await scans.importGuildHubLocalScan(`w14-${kind}-${s}.json`,JSON.stringify({players,groups:raw(time).groups}));ids.push(result.scan.id);
  }
  await scans.resetHubSearchProjections(ids);
  const setupMs=performance.now()-setupStarted;
  const cold=await opening(`large-${kind}-search-cold`);
  const inventory=await scans.readHubSearchProjectionInventory();assert(ids.every(id=>inventory.projections.has(id)),'all large source projections have actual persisted commits');
  assert(activeSearch().getSnapshot().local.failed===0,'large source preparation succeeds without partial failures');
  const query=await begin(`large-${kind}-warm-queries`),cpu=activeSearch().costs.queryMs;
  for(const text of ['Large','Large Player 9999','f8_net_p19999','No matching player','Player']) {input('[data-hub-search] input[type=search]',text);await new Promise(r=>setTimeout(r,260));}
  query.queryCpuMs=activeSearch().costs.queryMs-cpu;const queries=await finish();
  const cleanupBeforeDelete=await cleanup();
  assert(cleanupBeforeDelete.preparation.sources===0&&cleanupBeforeDelete.preparation.projections===0,'large fixture releases preparation registry');
  const abort=await begin(`large-${kind}-navigation-unmount`);await scans.resetHubSearchProjections(ids);await go('/data-hub');input('[data-hub-search] input[type=search]','Large');await go('/origin');const cancelled=await finish();
  const after=await cleanup();await scans.deleteGuildHubLocalScans(ids);
  return {kind,sourceCount,perSource,persistedSources:ids.length,playerObservations:10000,origin:'synthetic supported players/groups Raw, deterministic identifiers and timestamps',setupMs,cold,queries,cancelled,cleanup:after};
}
async function neighbors() {
  await cleanup();
  const slots:string[]=[];
  for(let i=0;i<2;i++) {
    const state=await trackerStore.createFightTracker({name:`W14 tracker ${i}`,server:'F8',source:'guild_scan',linkedGuildHubGuildId:'1',linkedGuildHubLogoIdentifier:'f8_net_g1',members:[{name:'Kept manual member',source:'manual',active:true}]});
    const tracker=state.tracker!;
    await trackerStore.putFightTrackerFight({id:`w14-fight-${i}`,trackerId:tracker.id,guildId:tracker.id,type:'attack',date:new Date(time).toISOString(),fightNumber:"1",opponentGuild:'Kept opponent',source:'manual',createdAt:new Date(time).toISOString(),rosterSnapshot:[],missedMemberIds:[]});
    slots.push(tracker.id);
  }
  const unchanged=async()=>JSON.stringify(await Promise.all(slots.map(id=>trackerStore.readFightTrackerStateById(id))));
  const before=await unchanged();
  const favoritesBefore=JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);
  const sourceIds=(await scans.readDataHubLocalScanMetadata()).sourceIds.join();
  await go('/filter-probe');await until(()=>api.filterScope==='public','public filter owner');
  flushSync(()=>api.filters.setSearchText('w14-public'));await pause();const publicStored=localStorage.getItem('TL_FILTERS_V2');
  await go('/local-filter-probe');await until(()=>api.filterScope==='local','local filter owner');
  flushSync(()=>{api.filters.setSearchText('w14-local');api.filters.setClasses(['1']);});await pause();const localStored=localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1');
  assert(localStorage.getItem('TL_FILTERS_V2')===publicStored,'local edits retain public persistence');
  await go('/filter-probe');await until(()=>api.filters.searchText==='w14-public','public return/remount');
  await go('/local-filter-probe');await until(()=>api.filters.searchText==='w14-local','local return/remount');
  flushSync(()=>api.filters.resetAll());await pause();assert(api.filters.searchText===''&&api.filters.classes.length===0,'explicit local reset');
  assert(localStorage.getItem('TL_FILTERS_V2')===publicStored,'local reset retains public namespace');
  assert((await scans.readDataHubLocalScanMetadata()).sourceIds.join()===sourceIds,'filter reset retains sources');
  assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===favoritesBefore,'filter reset retains favorites');
  assert(await unchanged()===before,'filter reset retains two trackers and fights');
  localStorage.setItem('SFH_LOCAL_TL_FILTERS_V1',localStored!);
  pageContextStore.selectGuild('fight-tracking',pageGuildReference(guild));
  await go('/w14-tracker');await until(()=>monitor.w14Tracker,'actual tracker parent');
  await monitor.w14Tracker.openTracker(slots[0]);await until(()=>monitor.w14Tracker.tracker?.id===slots[0],'explicit tracker slot open');
  assert((await trackerStore.readFightTrackerStateById(slots[0])).fights.length===1,'opened tracker retains fight');
  await go('/data-hub');await dashboardReady({started:performance.now(),readiness:{}});
  pageContextStore.selectGuild('guild-dashboard',null);pageContextStore.selectGuild('guild-analytics',pageGuildReference(guild));
  await hubFavoritesStore.mutate({type:'move',id:hubFavoritesStore.getSnapshot().snapshot!.record.favorites[0].id,direction:1});
  assert(await unchanged()===before,'dashboard/favorite/analyticscontext never sync or reassign tracker');
  await go('/w14-tracker');await until(()=>monitor.w14Tracker.tracker===null,'remount retains selection screen without autoopening another slot');await monitor.w14Tracker.openTracker(slots[0]);await until(()=>monitor.w14Tracker.tracker?.id===slots[0],'explicit original slot reopen');
  await monitor.w14Tracker.loadSyncPlan();await until(()=>monitor.w14Tracker.syncPlan,'explicit roster plan');
  const firstPlan=monitor.w14Tracker.syncPlan;
  assert(await unchanged()===before,'preparing roster plan performs no member writes');
  await monitor.w14Tracker.handleImportScanMembers();await pause();
  const applied=await trackerStore.readFightTrackerStateById(slots[0]);
  assert(applied.members.length>1&&applied.fights.length===1,'actual explicit apply adds roster and retains fight');
  const untouched=await trackerStore.readFightTrackerStateById(slots[1]);assert(untouched.members.length===1&&untouched.fights.length===1,'other slot untouched by sync');
  await cleanup();
  const multiAt=time+60000;
  const multi=await scans.importGuildHubLocalScan('w14-tracker-multitime.json',JSON.stringify({players:[{...raw(historical).players[0],name:'Earlier roster',timestamp:historical},{...raw(multiAt).players[0],name:'Latest roster',timestamp:multiAt}],groups:[...raw(historical).groups,...raw(multiAt).groups]}));
  await go('/w14-tracker');await until(()=>monitor.w14Tracker.tracker===null,'tracker multitime selection');await monitor.w14Tracker.openTracker(slots[0]);await until(()=>monitor.w14Tracker.tracker?.id===slots[0],'explicit multitime slot');
  await monitor.w14Tracker.loadSyncPlan();await until(()=>monitor.w14Tracker.syncPlan?.snapshot.scanId===multi.scan.id,'multi-time source selected');
  const multiPlan=monitor.w14Tracker.syncPlan;
  const multiEvidence={scanId:multiPlan.snapshot.scanId,scanAt:multiPlan.snapshot.scanAt,members:multiPlan.snapshot.members.map((m:any)=>({name:m.name,ref:m.scanMemberRef,lastSeen:m.lastSeenScanAt})),hasChanges:multiPlan.hasChanges};
  await cleanup();
  await scans.updateGuildHubLocalScan(multi.scan.id,'w14-tracker-sametime.json',JSON.stringify({players:[{...raw(multiAt).players[0],name:'Changed same-time roster',level:222,values:{'Base Strength':700,'Base Constitution':700}}],groups:raw(multiAt).groups}));
  await go('/w14-tracker');await until(()=>monitor.w14Tracker.tracker===null,'same-time tracker selection');await monitor.w14Tracker.openTracker(slots[0]);await until(()=>monitor.w14Tracker.tracker?.id===slots[0],'explicit same-time slot');
  await monitor.w14Tracker.loadSyncPlan();await until(()=>monitor.w14Tracker.syncPlan?.snapshot.members.some((m:any)=>m.name==='Changed same-time roster'),'same-ID same-time actual values');
  const sameTimePlan=monitor.w14Tracker.syncPlan;assert(sameTimePlan.hasChanges,'changed source stats visible in explicit plan');
  await monitor.w14Tracker.handleImportScanMembers();await pause();
  const sameTimeApplied=await trackerStore.readFightTrackerStateById(slots[0]);
  assert(sameTimeApplied.members.some(m=>m.scanMemberRef==='f8_net_p1'&&m.level===222),'same-time explicit sync applies actual member values');
  assert(sameTimeApplied.fights.length===1&&(await trackerStore.readFightTrackerStateById(slots[1])).fights.length===1,'both fights retained after equal-time sync');
  sessionStorage.setItem('w14-neighbor-reload',JSON.stringify({slots,publicStored,localStored}));
  const result={slots,firstPlan:{scanId:firstPlan.snapshot.scanId,newMembers:firstPlan.newMembers.length},multiEvidence,sameTime:{scanId:sameTimePlan.snapshot.scanId,scanAt:sameTimePlan.snapshot.scanAt,level:222},filterKeys:['TL_FILTERS_V2','SFH_LOCAL_TL_FILTERS_V1'],trackerStates:await Promise.all(slots.map(id=>trackerStore.readFightTrackerStateById(id))),cleanup:await cleanup()};
  return result;
}
async function neighborReload() {
  const expected=JSON.parse(sessionStorage.getItem('w14-neighbor-reload')!);
  await go('/filter-probe');await until(()=>api.filters.searchText==='w14-public','public filter reload');
  await go('/local-filter-probe');await until(()=>api.filters.searchText==='w14-local','local filter reload');
  assert(localStorage.getItem('TL_FILTERS_V2')===expected.publicStored,'public persistent record retained at reload');
  const states=await Promise.all(expected.slots.map((id:string)=>trackerStore.readFightTrackerStateById(id)));
  assert(states.every(s=>s.fights.length===1),'multiple tracker fights persist across browser reload');
  return {filters:{public:'w14-public',local:'w14-local'},slots:states.length,fights:states.map(s=>s.fights.length),cleanup:await cleanup()};
}
async function overlays() {
  await cleanup();
  const model=await resolveLocalProfileEntry({entity:parseLocalEntity('player','F8','f8_net_p1')!,observation:{kind:'free'}});
  api.testSeed=model.currentSeed;assert(api.testSeed,'prepared profile input');
  await go('/origin');await begin('prepared-origin-overlay');await click('[data-seeded-open]');await profile();assert(dialog(),'prepared actual overlay');const prepared=await finish();
  const url=api.location.pathname+api.location.search;
  await back();await closed();assert(api.location.pathname==='/origin','Back retains origin');history.forward();await profile();assert(dialog(),'Forward reopens actual profile');
  await click('.profile-overlay__close--local');await closed();assert(api.location.pathname==='/origin','Close returns to origin');
  await click('[data-seeded-open]');await profile();windowDispatchEscape();await closed();
  await click('[data-seeded-open]');await profile();await click('.profile-overlay--local');await closed();
  await click('[data-seeded-open]');await profile();api.setScan(true);await until(()=>!!document.querySelector('[aria-label="Datenverwaltung schließen"]'),'scan over profile');
  assert(history.state.usr?.localProfileParent&&history.state.ghOverlay,'scan history retains actual router marker');
  await back();await until(()=>!document.querySelector('[aria-label="Datenverwaltung schließen"]'),'Back closes scan');assert(dialog(),'profile retained below scanner');await back();await closed();
  // Opposite order: actual scanner first, profile navigation while it is open.
  api.setScan(true);await until(()=>!!document.querySelector('[aria-label="Datenverwaltung schließen"]'),'scanner first');
  await click('[data-seeded-open]');await profile();assert(dialog(),'profile opens while scanner present');
  windowDispatchEscape();await closed();assert(document.querySelector('[aria-label="Datenverwaltung schließen"]'),'newer profile closes first and older scanner remains');
  windowDispatchEscape();await until(()=>!document.querySelector('[aria-label="Datenverwaltung schließen"]'),'second Escape closes older scanner');
  // Real table parent and sort/query/scroll survive overlay Close.
  await go('/data-hub/toplist?fixture=w14-kept');await tab('Players');
  await until(()=>!!document.querySelector('[data-sfh-identifier="f8_net_p1"]'),'real top list rows');
  flushSync(()=>{w08.filters.setSearchText('Current');w08.filters.setSortBy('name');});await pause();
  const row=document.querySelector('[data-sfh-identifier="f8_net_p1"]');const dataset=w08.loads.at(-1).datasetId;window.scrollTo(0,140);const scroll=scrollY;
  await click('[data-sfh-identifier="f8_net_p1"]');await profile();windowDispatchEscape();await closed();
  assert(document.querySelector('[data-sfh-identifier="f8_net_p1"]')===row,'actual table DOM retained');
  assert(w08.filters.searchText==='Current'&&w08.filters.sortBy==='name'&&scrollY===scroll,'sort/filter/scroll retained');
  assert(w08.loads.at(-1).datasetId===dataset&&api.location.search==='?fixture=w14-kept','dataset/query retained');
  await cleanup();
  return {prepared,url,checks:['Back','Forward','Close','Escape','Backdrop','scanner over profile','profile with scanner already open','actual table DOM/filter/sort/scroll/query/dataset retained'],cleanup:await cleanup()};
}
function windowDispatchEscape(){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));}
async function preparedDashboard() {
  pageContextStore.selectGuild('guild-dashboard',pageGuildReference(guild));
  await go('/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard');
  await until(()=>!!document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]'),'fresh actual Dashboard');
  await until(()=>sharedAnalyticsPreparation.inspect().queue.jobs===0,'independent Dashboard preparation completed');
  await new Promise(r=>setTimeout(r,200));
  await begin('fresh-prepared-dashboard-overlay');
  await click('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]');await profile();
  const measured=await finish();
  const entryRaw=measured.idbGroups.filter((g:any)=>g.store==='scans'&&g.method==='get'&&g.caller.includes('localProfileEntry')).reduce((n:number,g:any)=>n+g.requests,0);
  return {measured,entryRaw,currentCoreCalls:measured.calls.playerCore??0,zeroCurrentCostCheck:entryRaw===0&&(measured.calls.playerCore??0)===0,visible:hero(),cleanup:await cleanup()};
}
monitor.w14PreparedDashboard=preparedDashboard;
monitor.w14Recovery=recovery;monitor.w14Large=large;monitor.w14Neighbors=neighbors;monitor.w14NeighborReload=neighborReload;monitor.w14Overlays=overlays;
await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:{en:{translation:en}},interpolation:{escapeValue:false}});
if(!sessionStorage.getItem('w12-seeded'))await seed();
root=createRoot(document.getElementById('root')!);render();api.ready=true;

monitor.w32Extended=async()=>{
 const proof:any={groups:[]};monitor.w32ExtendedProof=proof;
 await go('/data-hub');
 pageContextStore.selectGuild('guild-analytics',pageGuildReference(guild));
 await go('/data-hub/analytics');
 await until(()=>document.body.textContent?.includes('Uebersicht')??false,'analytics mounted');
 await new Promise(r=>setTimeout(r,1500));
 await tab('Fight Participation');await new Promise(r=>setTimeout(r,300));
 proof.analyticsOverview={charts:document.querySelectorAll('svg').length,body:document.body.innerText.slice(0,600)};
 await tab('Fortschritt');await new Promise(r=>setTimeout(r,500));
 await tab('Vergleich');await new Promise(r=>setTimeout(r,200));
 input('input[placeholder="Gildennamen eingeben"]','Audit');
 await until(()=>document.body.textContent?.includes('Audit Guild')??false,'analytics cloud search result');
 proof.groups.push('analytics overview/progress/compare/search');
 await go('/data-hub/guild-hub/fusion-planner');
 await until(()=>!!document.querySelector('input[placeholder="z.B. Solaris"]'),'Fusion mounted');
 input('input[placeholder="z.B. Solaris"]','Audit');
 await until(()=>document.body.textContent?.includes('Audit Guild')??false,'fusion search');
 const suggestion=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('Audit Guild'));assert(suggestion,'cloud suggestion');flushSync(()=>suggestion!.click());
 await tab('Members & Slots');await until(()=>document.body.textContent?.includes('Audit Member 1')??false,'fusion members');
 await tab('Overview');await tab('Result');proof.groups.push('fusion cloud/member/allocation/result');
 await go('/data-hub/guild-hub/import');await until(()=>!!document.querySelector('input[type="file"]'),'import inventory');
 await until(()=>monitor.w32Jobs.isReady,'DataJobs ready');
 api.setScan(true);await pause();
 const job=await monitor.w32Jobs.startSfToolsImportJob(new File([JSON.stringify(raw(time+86400000))],'audit-import.json',{type:'application/json'}));
 api.setScan(false);await new Promise(r=>setTimeout(r,350));
 await until(()=>monitor.w32Jobs.jobs.some((j:any)=>j.id===job.id&&j.status!=='running'),'DataJob after UI close');
 const completed=monitor.w32Jobs.jobs.find((j:any)=>j.id===job.id);assert(completed.status==='completed',JSON.stringify(completed));proof.dataJob=completed;proof.groups.push('native DataJob survives overlay close');
 api.setScan(true);await until(()=>!!document.querySelector('button[title="Scan-Details anzeigen"]'),'scan inventory/details button');
 const open=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.includes('Details')||b.title.includes('Details'));
 if(open){flushSync(()=>open.click());await pause();proof.scanDetails=document.body.innerText.slice(-500);}
 api.setScan(false);await new Promise(r=>setTimeout(r,350));
 await go('/data-hub/toplist');await tab('Players');flushSync(()=>{w08.filters.setSearchText('');w08.filters.setClasses([]);});pageContextStore.selectServers(['F8']);await until(()=>!!document.querySelector('[data-sfh-identifier="f8_net_p1"]'),'export source rows');
 await tab('Compare');await until(()=>Boolean(monitor.sfhDataHubRuntimeAudit?.status().totals?.F24?.reports),'actual Toplist compare projection');proof.compareAudit=monitor.sfhDataHubRuntimeAudit.snapshot();proof.groups.push('native Toplist before/current comparison projection');await tab('Normal');await pause();
 await monitor.w32ExportPrepare();await pause();await monitor.w32Export();proof.groups.push('native toplist PNG capture/download');
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=360;const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,1000,360);ctx.fillStyle='black';ctx.font='32px sans-serif';ctx.fillText('ATTACK WON',40,70);ctx.fillText('Guild Fight',40,120);ctx.fillText('Audit Member 1',40,175);ctx.fillText('Audit Member 2',40,220);
 const blob=await new Promise<Blob>(r=>canvas.toBlob(b=>r(b!),'image/png'));
 await go('/w14-tracker');await until(()=>monitor.w14Tracker,'Fight tracker mounted');flushSync(()=>{monitor.w14Tracker.setSetupGuildName('W32 Manual Audit');monitor.w14Tracker.setSetupGuildServer('F8');});await pause();await monitor.w14Tracker.createManualTracker();await until(()=>monitor.w14Tracker.tracker?.name==='W32 Manual Audit','actual manual tracker mutation');proof.groups.push('native Fight tracker mutation and participation view');
 proof.ocr=await scanFightReportScreenshot(new File([blob],'audit-fight.png',{type:'image/png'}),[]);proof.groups.push('native six-language Tesseract worker/WASM recognition/parsing/termination');
 proof.cloudReads=monitor.w32CloudReads;proof.errors=errors;return proof;
};
monitor.w32DashboardBench=async()=>{
 await go('/data-hub');await new Promise(r=>setTimeout(r,500));
 pageContextStore.selectGuild('guild-dashboard',pageGuildReference(guild));
 monitor.sfhDataHubRuntimeAudit?.console(false);monitor.sfhDataHubRuntimeAudit?.clear();
 const before=sharedAnalyticsPreparation.inspect();const entry=await begin('guild-overview-visible');
 await go('/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard');
 await until(()=>!!document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]'),'Dashboard visible cards');
 await until(()=>document.querySelector('svg[aria-label=\"Gilden-Basiswerte-Trend\"]')!==null && document.querySelectorAll('svg[data-trend]').length>=4 && !document.body.innerText.includes('Loading historical comparison.'),'Cards/curves/guild chart/history ready');
 await until(()=>sharedAnalyticsPreparation.inspect().queue.jobs===0,'Cards/trend preparation completed');
 await until(()=>document.querySelectorAll('svg[data-trend] path').length>=2,'actual drawn card curve paths');
 await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
 const element=document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]')!;const rect=element.getBoundingClientRect();assert(rect.width>0&&rect.height>0,'visible card dimensions');
 const visibleAt=performance.now(),body=document.body.innerText;
 const overview=await finish();overview.usableMs=visibleAt-entry.started;overview.visibleCards=document.querySelectorAll('button[aria-label$="lokales Spielerprofil öffnen"]').length;overview.curves=document.querySelectorAll('svg[data-trend]').length;overview.drawnCurvePaths=document.querySelectorAll('svg[data-trend] path').length;overview.guildTrendSvgs=document.querySelectorAll('[class*="guildTrend"] svg').length;
 const after=sharedAnalyticsPreparation.inspect();overview.preparationBefore=before;overview.preparationAfter=after;overview.audit=monitor.sfhDataHubRuntimeAudit?.snapshot()??null;
 const profileWindow=await begin('shared-profile-from-prepared-overview');await click('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]');await profile();const profileAt=performance.now();const profileMeasure=await finish();profileMeasure.usableMs=profileAt-profileWindow.started;profileMeasure.audit=monitor.sfhDataHubRuntimeAudit?.snapshot()??null;
 const cleanupResult=await cleanup();return {overview,profile:profileMeasure,body,cleanup:cleanupResult};
};
