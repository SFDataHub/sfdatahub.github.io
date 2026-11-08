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
import HubSearch from "../../../../src/pages/DataHub/HubSearch";
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
import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";
import type { LocalPlayerCurrentSeed } from "../../../../src/pages/GuildHub/localPlayerCurrentSeed";
import { __scanArchiveSearchIndexServiceTestUtils } from "../../../../src/lib/scanArchive/searchIndexService";
import { FilterProvider, useFilters } from "../../../../src/components/Filters/FilterContext";
import { setRole } from "./mocks";
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20));
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
const until = async (check: () => boolean, message: string) => { for (let i=0;i<1500;i++) { if (check()) return; await pause(); } throw Error(`${message}: ${document.body.innerText.slice(0,700)}`); };
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
const api = { ready:false, documentId:crypto.randomUUID(), results, errors, reads:[] as string[], cores:[] as string[], builds:[] as string[], gate:undefined as Promise<void>|undefined, gateSource:"", gateHeld:false, run:runHub, reloadCheck:reloadHub, narrowRun:compactHub, cleanupProof:cleanupHub, keyboardCheck:keyboardHub,
  measurements: {} as Record<string,unknown>, setScan:(_open:boolean)=>{}, navigate:(_to:string,_state?:unknown)=>{}, profile:null as any, requestEnds:0, openExact:(_identifier:string,_server:string,_source:string,_at:number,_row:string)=>{},
  projectionCommitReads:0, offlineMetadata:false, holdAcks:false, heldAcks:[] as {ack:any;replay:()=>void}[], indexTimings:[] as any[], searchControllers: [] as any[], searchReads: [] as string[], source:"", oldSource:"", location:null as any, publicCalls:0, filters:null as any,filterScope:"", counters:null as any, testSeed:undefined as LocalPlayerCurrentSeed|undefined, open:(_seed:LocalPlayerCurrentSeed)=>{}, auth:setRole };
(globalThis as any).w12=api;
window.addEventListener("unhandledrejection",e=>errors.push(String(e.reason)));
const nativeFetch=window.fetch.bind(window);
window.fetch = (async (input,init) => { const value=String(input); if(value.startsWith(location.origin+'/w24-assets/'))return nativeFetch(input,init);if(value.includes("catalog")||value.startsWith(location.origin+"/archive/")){if(api.offlineMetadata && (value.includes("catalog")||value.endsWith("manifest.json")))throw Error("controlled offline metadata");return nativeFetch(input,init);} throw Error(`Unexpected external request: ${value}`); }) as typeof fetch;
const writeLog: string[]=[]; const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(value:any,...args:any[]) { if(this.name==="state")writeLog.push(value.key);return put.call(this,value,...args); };
function storeRules(hidden=false) { const rules=FEATURE_ACCESS_CONFIG.map(r=>r.id==="main.guildHub"?{...r,status:hidden?"hidden":"active"}:r);localStorage.setItem("sf_feature_access_snapshot",JSON.stringify({byId:Object.fromEntries(rules.map(r=>[r.id,r])),byRoute:Object.fromEntries(rules.map(r=>[r.route,r]))}));localStorage.setItem("sf_feature_access_date",new Date().toISOString().slice(0,10)); }
storeRules();
function FiltersProbe({scope="public"}:{scope?:string}){const filters=useFilters();api.filters=filters;api.filterScope=scope;return <button data-filter-change onClick={()=>filters.setSearchText("local-only")}>Change filter</button>;}
function OriginHarness(){const navigation=useLocalProfileNavigation();api.open=navigation.open;api.openExact=navigation.openExact;return <button data-seeded-open onClick={()=>api.testSeed&&navigation.open(api.testSeed)}>Open prepared</button>;}
function Login(){const l=useLocation();return <div data-login>{l.search}</div>;}
function App(){const navigate=useNavigate(),location=useLocation();api.location=location;api.navigate=(to,state)=>flushSync(()=>navigate(to,{state}));const [scan,setScan]=React.useState(false);api.setScan=open=>flushSync(()=>setScan(open));return <><DataHubRouteHost>{l=><Routes location={l}><Route element={<RootLayout/>}>{dataHubRouteElements()}<Route path="/w24-history" element={<HubSearch/>}/><Route path="/" element={<div data-home>Home</div>}/><Route path="/login" element={<Login/>}/><Route path="/filter-probe" element={<FilterProvider key="public"><FiltersProbe/></FilterProvider>}/><Route path="/local-filter-probe" element={<FilterProvider key="local" storageKey="SFH_LOCAL_TL_FILTERS_V1" migrateFrom="TL_FILTERS_V2"><FiltersProbe scope="local"/></FilterProvider>}/><Route path="/origin" element={<OriginHarness/>}/><Route path="*" element={<div data-missing>Missing</div>}/></Route></Routes>}</DataHubRouteHost><ScanManagement isOpen={scan} onClose={()=>setScan(false)}/></>;}
let root:ReturnType<typeof createRoot>; let gateKey=0;
function render(){flushSync(()=>root.render(<React.StrictMode><HashRouter><FeatureAccessProvider key={gateKey}><LocalePreferencesProvider><App/></LocalePreferencesProvider></FeatureAccessProvider></HashRouter></React.StrictMode>));}
async function go(to:string,state?:unknown){api.navigate(to,state);await pause();}
async function click(selector:string){await until(()=>!!document.querySelector(selector),`Missing ${selector}`);const e=document.querySelector<HTMLElement>(selector);flushSync(()=>e!.click());await pause();}
async function tab(label:string){const find=()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);await until(()=>!!find(),`Tab ${label}`);flushSync(()=>find()!.click());await pause();}
async function back(){history.back();await pause();}
const dialog=()=>document.querySelector('.profile-overlay--local[role="dialog"]');
const hero=()=>document.querySelector('.local-hero')?.textContent??document.querySelector('.player-profile')?.textContent??"";
async function profile(name="Current Player 1"){await until(()=>hero().includes(name),`Profile ${name}`);await pause();}
async function closed(){await until(()=>!dialog(),"profile closed");}
const guild={id:"f8_net_g1",guildId:"1",name:"Fixture Guild",server:"F8",logoIdentifier:"f8_net_g1",memberCount:2};
async function seed(){
  localStorage.setItem('TL_FILTERS_V2',JSON.stringify({servers:['F9'],searchText:'public-seed',classes:[]}));
  await w08.acquire(entries,{});const bindings=(await scans.readDataHubLocalScanMetadata()).bindings;api.source=bindings.find(b=>b.archiveScanId===currentEntry.id)!.localScanId;api.oldSource=bindings.find(b=>b.archiveScanId===historicalEntry.id)!.localScanId;
  await hubFavoritesStore.refresh();await hubFavoritesStore.mutate({type:'save',favorite:guildFavorite(guild,0,null,false)});
  const p=await resolveLocalProfileEntry({entity:parseLocalEntity('player','F8','f8_net_p1')!,observation:{kind:'exact',anchor:{source:api.source,at:time}}});await hubFavoritesStore.mutate({type:'save',favorite:localPlayerFavorite(p)!});
  pageContextStore.selectServers(['F8']);pageContextStore.selectGuild('guild-dashboard',pageGuildReference(guild));
  sessionStorage.setItem('w12-seeded','1');api.reads=[];api.cores=[];api.builds=[];
}
function input(selector:string,value:string){const element=document.querySelector<HTMLInputElement>(selector)!;assert(element,`input ${selector}`);element.focus();const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;flushSync(()=>{setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
function select(index:number,value:string){const element=document.querySelectorAll<HTMLSelectElement>('[data-hub-search] select')[index];assert(element,`select ${index}`);flushSync(()=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));});}
async function queryHub(text:string){input('[data-hub-search] input[type="search"]',text);await until(()=>!!document.querySelector('[data-hub-search-hit]'),`query ${text}`);await new Promise(r=>setTimeout(r,250));}
const hitSelector=(identifier:string)=>`[data-hub-search-hit="${identifier}"]`;
let searchPath='/data-hub';
async function returnHub(){if(api.location.pathname!==searchPath){history.back();await until(()=>api.location.pathname===searchPath,'Back to search');}await until(()=>!!document.querySelector('[data-hub-search]'),'search remounted');document.querySelector<HTMLInputElement>('[data-hub-search] input[type=search]')!.focus();await new Promise(r=>setTimeout(r,300));}
async function observations(identifier:string){const row=document.querySelector(hitSelector(identifier))!;const details=row.querySelector('details');if(details){flushSync(()=>{details.open=true;});return [...row.querySelectorAll<HTMLButtonElement>('details button')];}await click(hitSelector(identifier)+' > button[aria-expanded]');return [...document.querySelectorAll<HTMLButtonElement>(hitSelector(identifier)+' > button[role=option]')].slice(1);}
async function historicalHost(){searchPath='/w24-history';await go(searchPath);await until(()=>!!document.querySelector('[data-hub-search]'),'legacy historical search mounted');}
async function dashboardHost(){searchPath='/data-hub';await go(searchPath);await until(()=>!!document.querySelector('[data-dashboard-search]'),'Dashboard current search mounted');document.querySelector<HTMLInputElement>('[data-hub-search] input')!.focus();}
const activeSearch=()=>api.searchControllers.filter(c=>!c.inspect().stopped).slice(-1)[0];
function dashboardScope(){assert(document.querySelectorAll('[data-hub-search] select').length===1,'Dashboard only Open in');const query=JSON.parse(sessionStorage.getItem('sfdatahub:hub-search:v1')!);assert(query.scope.kind==='current'&&query.kind==='both','Dashboard fixed both/current');}
async function targetAck(identifier:string){await until(()=>document.querySelector('[data-toplist-target-status]')?.getAttribute('data-toplist-target-status')==='visibleAck',`actual DOM ACK ${identifier}`);assert(!!document.querySelector(`[data-sfh-identifier="${identifier}"]`),'actual row DOM present');}
async function runHub(){
 await go('/data-hub');await until(()=>!!document.querySelector('[data-hub-search]'),'production Dashboard search');await new Promise(r=>setTimeout(r,300));assert(api.searchControllers.length===0,'Dashboard mount zero search starts');document.querySelector<HTMLInputElement>('[data-hub-search] input')!.focus();assert(!document.querySelector('[data-search-loading]'),'empty focus no spinner');await until(()=>!!activeSearch()&&!activeSearch().getSnapshot().local.preparing&&!activeSearch().getSnapshot().archive.preparing,'source and sidecar preparation');dashboardScope();
 const queryTransport=await (await nativeFetch('/archive/metrics.json')).json();assert(!queryTransport.some((r:any)=>r.path.endsWith('.gz')&&!r.path.includes('search/')),'zero archive Raw requests before target');api.measurements.queryTransport=queryTransport;
 const before={reads:api.searchReads.length,cores:api.cores.length,builds:api.builds.length,commitReads:api.projectionCommitReads,queryMs:api.searchControllers.reduce((n,c)=>n+c.costs.queryMs,0)};const favoriteBefore=JSON.stringify(hubFavoritesStore.getSnapshot().snapshot),globalBefore=writeLog.filter(k=>k==='guild-selection').length;
 for(const text of ['Current','Player','f8_net_p1','Historical','Current Player 1'])await queryHub(text);
 assert(api.searchReads.length===before.reads,'typing no repeated Raw search reads');assert(api.cores.length===before.cores,'query no full cores');assert(api.builds.length===before.builds,'query no profile builds');
 api.measurements.warmQueries={rawSearchReads:api.searchReads.length-before.reads,projectionCommitRawReads:api.projectionCommitReads-before.commitReads,cores:api.cores.length-before.cores,profileBuilds:api.builds.length-before.builds,queryCpuMs:api.searchControllers.reduce((n,c)=>n+c.costs.queryMs,0)-before.queryMs};results.push('Production Dashboard cold metadata preparation and five warm queries: no repeat Raw/core/profile work');
 await click(hitSelector('f8_net_p1')+' > button');await profile();assert(!api.location.search,'free profile has no matching historical anchor');await returnHub();assert(document.querySelector<HTMLInputElement>('[data-hub-search] input[type=search]')?.value==='Current Player 1','Back restores query');results.push('Player/Profile sender -> actual shared W-12 local detail; free Current and Back query restore');
 await queryHub('Historical Player 1');const historicalButton=(await observations('f8_net_p1')).find(b=>b.textContent?.includes(new Date(historical).toLocaleString('en')))!;assert(historicalButton,'historical individual occurrence button');flushSync(()=>historicalButton.click());await profile('Historical Player 1');assert(new URLSearchParams(api.location.search).get('at')===String(historical),'individual historical anchor');await returnHub();results.push('Explicit historical observation -> actual local detail keeps checked individual source/time');
 await queryHub('Fixture Guild');await click(hitSelector('f8_net_g1')+' > button');await until(()=>!!document.querySelector('[data-dashboard-selected-mode] button[data-member-profile]'),'actual addressed Guild Dashboard');await returnHub();results.push('Guild/Profile sender -> actual addressed local Guild Dashboard');
 await queryHub('Archive Player 3');const acquiredBefore=(await scans.readDataHubLocalScanMetadata()).bindings.length;await click(hitSelector('f8_net_p3')+' > button');await profile('Archive Player 3');assert((await scans.readDataHubLocalScanMetadata()).bindings.length>acquiredBefore,'explicit archive acquisition produced revalidated local source');await returnHub();results.push('Valid archive-only player match -> explicit production Raw acquisition -> actual local profile');
 select(0,'toplist');await new Promise(r=>setTimeout(r,250));await queryHub('Archive Player 3');pageContextStore.selectServers(['F9']);await click(hitSelector('f8_net_p3')+' > button');await targetAck('f8_net_p3');assert(w08.loads.at(-1).result.cacheHits.length+w08.loads.at(-1).result.cacheMisses.length===2 && w08.loads.at(-1).result.playerRows.length===3,'full physical Currentset loaded');assert(pageContextStore.get('local-toplist').servers?.join()==='F8','explicit declared target server only');await returnHub();results.push('Player/Toplist sender -> full two-member Currentset -> actual player row -> visible DOM ACK');
 await queryHub('Fixture Guild');await click(hitSelector('f8_net_g1')+' > button');await targetAck('f8__1');await returnHub();results.push('Guild/Toplist sender -> full Currentset -> actual guild row -> visible DOM ACK');
 await historicalHost();select(0,'toplist');select(2,'historical');await new Promise(r=>setTimeout(r,250));await queryHub('Historical Player 1');const historyRow=document.querySelector(hitSelector('f8_net_p1'))!;flushSync(()=>{(historyRow.querySelector('details') as HTMLDetailsElement).open=true;});const monthButton=[...historyRow.querySelectorAll<HTMLButtonElement>('details button')].find(b=>b.textContent?.includes('monthly toplist'))!;assert(monthButton,'explicit monthly action');flushSync(()=>monthButton.click());await targetAck('f8_net_p1');assert(w08.loads.at(-1).result.playerRows.some((r:any)=>r.name==='Historical Player 1'),'actual monthly rows');await returnHub();results.push('Explicit historical archive scope and monthly full-set handoff resolve actual historical dataset row and DOM ACK');
 assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===favoriteBefore,'all four target actions no favorite writes');assert(writeLog.filter(k=>k==='guild-selection').length===globalBefore,'all four actions no global selection write');assert(w08.publicCalls===0,'no public search/profile fallback');results.push('All four target paths preserve favorites and global selection; public consumers untouched');
 await dashboardHost();await archiveRecoveryHub();
 await racesHub();
 api.measurements.indexTransportAndValidation=api.indexTimings;
 api.measurements.projectionCommitRawReads=api.projectionCommitReads;api.measurements.localRawReaderCalls=api.searchReads.length;api.measurements.coldPreparationRawReads=api.searchControllers.reduce((sum,c)=>sum+c.costs.coldRawReads,0);api.measurements.searchCosts=api.searchControllers.map(c=>({costs:c.costs,retained:c.inspect()}));api.measurements.heldModels={builds:api.builds.length,cores:api.cores.length};return results;
}
async function compactHub(){
 assert(innerWidth===390,'compact real viewport');dashboardScope();select(0,'profile');await new Promise(r=>setTimeout(r,250));
 await queryHub('Current Player 1');await click(hitSelector('f8_net_p1')+' > button');await profile("Changed Actual Player 1");await returnHub();
 await queryHub('Fixture Guild');await click(hitSelector('f8_net_g1')+' > button');await until(()=>!!document.querySelector('[data-dashboard-selected-mode] button[data-member-profile]'),'compact guild dashboard');await returnHub();
 select(0,'toplist');await new Promise(r=>setTimeout(r,250));await queryHub('Archive Player 3');await click(hitSelector('f8_net_p3')+' > button');await targetAck('f8_net_p3');await returnHub();
 await queryHub('Fixture Guild');await click(hitSelector('f8_net_g1')+' > button');await targetAck('f8__1');await returnHub();
 dashboardScope();await new Promise(r=>setTimeout(r,250));await queryHub('Fixture Guild');
 const inputEl=document.querySelector<HTMLInputElement>('[data-hub-search] input[type=search]')!;inputEl.focus();assert(document.activeElement===inputEl,'keyboard reachable input');
 results.push('Compact 390px: all four production target paths, actual rows and DOM ACK; keyboard reachable controls');
 return {query:inputEl.value,scope:JSON.parse(sessionStorage.getItem('sfdatahub:hub-search:v1')!).scope.kind,errors};
}
async function archiveRecoveryHub(){
 dashboardScope();await new Promise(r=>setTimeout(r,250));const controller=()=>api.searchControllers.filter(c=>!c.inspect().stopped).slice(-1)[0];
 await until(()=>controller()?.getSnapshot().archive.ready===2&&!controller().getSnapshot().archive.preparing,'current archive ready');
 const setup=await (await nativeFetch('/archive/setup.json')).json();const member=setup.manifest.scans.find((s:any)=>s.id==='current-a');
 await nativeFetch('/archive/control?corrupt=1');await scans.deleteGuildHubArchiveSearchIndexCache(member.id,member.searchIndex.sha256);
 await until(()=>controller().getSnapshot().archive.failed===1&&!controller().getSnapshot().archive.preparing,'real corrupted sidecar rejected');assert(controller().getSnapshot().archive.ready===1,'successful partial sidecar remains usable');
 await nativeFetch('/archive/control?corrupt=0');flushSync(()=>controller().retry());await until(()=>controller().getSnapshot().archive.ready===2&&controller().getSnapshot().archive.failed===0&&!controller().getSnapshot().archive.preparing,'same-scope retry');
 api.offlineMetadata=true;flushSync(()=>controller().retry());await until(()=>controller().getSnapshot().archive.failed===1&&controller().getSnapshot().archive.ready===2&&!controller().getSnapshot().archive.preparing,'offline certified expectations');assert(controller().getSnapshot().archive.unknown>0,'offline scope certainty stays unknown');
 api.offlineMetadata=false;flushSync(()=>controller().retry());await until(()=>controller().getSnapshot().archive.ready===2&&controller().getSnapshot().archive.failed===0&&!controller().getSnapshot().archive.preparing,'online recovery');
 results.push('Real malformed compressed sidecar rejected; other member remains usable; same-scope retry and certified offline metadata recovery');
}
async function holdHistorical(){
 select(0,'profile');select(2,'current');await new Promise(r=>setTimeout(r,250));await queryHub('Historical Player 1');
 const row=document.querySelector(hitSelector('f8_net_p1'))!;flushSync(()=>{(row.querySelector('details') as HTMLDetailsElement).open=true;});
 const button=[...row.querySelectorAll<HTMLButtonElement>('details button')].find(b=>b.closest('li')?.textContent?.includes(new Date(historical).toLocaleString('en')))!;assert(button,'held historical observation');
 let release!:()=>void;api.gate=new Promise(r=>release=r);api.gateSource=api.oldSource;api.gateHeld=false;flushSync(()=>button.click());await until(()=>api.gateHeld,'target read held');
 return ()=>{release();api.gate=undefined;};
}
async function racesHub(){
 await historicalHost();
 for(const kind of ['query','mode','scope','target','unmount','source']){
  const release=await holdHistorical();
  if(kind==='query')input('[data-hub-search] input[type=search]','Current Player 2');
  if(kind==='mode')select(0,'toplist');
  if(kind==='scope')select(2,'historical');
  if(kind==='target'){
   const buttons=[...document.querySelectorAll<HTMLButtonElement>(hitSelector('f8_net_p1')+' details button')];
   const newer=buttons.find(b=>b.closest('li')?.textContent?.includes(new Date(time).toLocaleString('en')))!;assert(newer,'new target observation');flushSync(()=>newer.click());
  }
  if(kind==='unmount')await go('/origin');
  if(kind==='source')await scans.updateGuildHubLocalScan(api.oldSource,'revised.json',JSON.stringify({players:[{...raw(historical).players[0],name:'Revised Historical Player 1'}],groups:raw(historical).groups}));
  release();await new Promise(r=>setTimeout(r,400));
  if(kind==='target'){await profile();assert(new URLSearchParams(api.location.search).get('at')===String(time),'late historic result cannot replace newer target');await returnHub();}
  else if(kind==='unmount'){assert(api.location.pathname==='/origin','unmounted target cannot navigate');await go(searchPath);await new Promise(r=>setTimeout(r,300));}
  else assert(api.location.pathname===searchPath,`old ${kind} action cannot navigate`);
 }
 results.push('Delayed target replies rejected after query/mode/scope/new target/unmount and same-source update; newer handed-off profile remains valid');
 await dashboardHost();select(0,'toplist');await new Promise(r=>setTimeout(r,250));await queryHub('Archive Player 3');
 const stored=JSON.parse(localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1')??'{}');localStorage.setItem('SFH_LOCAL_TL_FILTERS_V1',JSON.stringify({...stored,classes:['2'],guilds:[],favoritesOnly:false}));
 await click(hitSelector('f8_net_p3')+' > button');await until(()=>document.querySelector('[data-toplist-target-status]')?.getAttribute('data-toplist-target-status')==='hiddenByFilters','class filter blocker');
 assert(w08.filters.classes.join()==='2','declared target preserves class filter');flushSync(()=>w08.filters.setClasses([]));await targetAck('f8_net_p3');
 const consumed=api.location.state.hubToplistTarget;await go('/origin');pageContextStore.selectServers(['F9']);await go('/data-hub/toplist',{hubToplistTarget:consumed});await new Promise(r=>setTimeout(r,350));assert(pageContextStore.get('local-toplist').servers?.join()==='F9','consumed command cannot replay on remount');
 await go('/data-hub');await new Promise(r=>setTimeout(r,300));await queryHub('Current Player 1');
 api.holdAcks=true;api.heldAcks=[];await click(hitSelector('f8_net_p1')+' > button');await until(()=>api.heldAcks.length>0,'actual row ACK held');
 const oldAck=api.heldAcks[0];const bound=(await scans.readDataHubLocalScanMetadata()).bindings.find(b=>b.archiveScanId==='current-a')!;assert(bound,'actual Current member binding');
 const loadedBefore=w08.loads.length;await scans.updateGuildHubLocalScan(bound.localScanId,'actual-row-update.json',JSON.stringify({players:[{...raw(time).players[0],name:'Changed Actual Player 1'}],groups:raw(time).groups}));
 await until(()=>w08.loads.length>loadedBefore && api.heldAcks.some(a=>a.ack.datasetKey!==oldAck.ack.datasetKey),'new Actual Rows revision and genuine new DOM ACK');
 api.holdAcks=false;oldAck.replay();await pause();assert(document.querySelector('[data-toplist-target-status]')?.getAttribute('data-toplist-target-status')!=='visibleAck','stale receiver callback cannot claim old DOM ACK');
 const currentAck=api.heldAcks.filter(a=>a.ack.datasetKey!==oldAck.ack.datasetKey).slice(-1)[0];currentAck.replay();await targetAck('f8_net_p1');await returnHub();
 results.push('Existing class blocker requires explicit correction; consumed command cannot replay; same-ID Actual Rows change rejects stale DOM ACK callback');
 select(0,'toplist');dashboardScope();await new Promise(r=>setTimeout(r,250));await queryHub('Fixture Guild');
}
async function keyboardHub(){await targetAck('f8__1');await returnHub();return {status:'visibleAck',query:document.querySelector<HTMLInputElement>('[data-hub-search] input[type=search]')?.value};}
async function cleanupHub(){await go('/origin');await pause();const controllers=api.searchControllers.map(c=>c.inspect());assert(controllers.every(c=>c.stopped&&c.localDocuments===0&&c.archiveDocuments===0&&c.listeners===0),'unmount releases all search documents/listeners');assert(__scanArchiveSearchIndexServiceTestUtils.inFlightCount()===0,'no held archive flights');return {controllers,flights:__scanArchiveSearchIndexServiceTestUtils.inFlightCount(),errors};}
async function reloadHub(){await until(()=>document.querySelector<HTMLInputElement>('[data-hub-search] input[type=search]')?.value==='Fixture Guild','reload query preserved');assert(document.querySelectorAll<HTMLSelectElement>('[data-hub-search] select')[0].value==='toplist','reload mode preserved');dashboardScope();return {query:'Fixture Guild',mode:'toplist',scope:'current',errors};}

await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:{en:{translation:en}},interpolation:{escapeValue:false}});
if(!sessionStorage.getItem('w12-seeded'))await seed();
if(location.search.includes('w24-images')){const presentation=await import('./presentation');await presentation.preparePresentation(api);const favorites=await import('./favoritesPresentation');favorites.prepareFavoritePresentation(api);}else await scans.resetHubSearchProjections();
root=createRoot(document.getElementById('root')!);render();api.ready=true;
