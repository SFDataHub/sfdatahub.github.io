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
import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";
import type { LocalPlayerCurrentSeed } from "../../../../src/pages/GuildHub/localPlayerCurrentSeed";
import { FilterProvider, useFilters } from "../../../../src/components/Filters/FilterContext";
import { setRole } from "../dataHubRoutes/mocks";
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
const api = { ready:false, documentId:crypto.randomUUID(), results, errors, reads:[] as string[], cores:[] as string[], builds:[] as string[], gate:undefined as Promise<void>|undefined, gateSource:"", gateHeld:false, run, reloadCheck, narrowRun, mutateRun,
  rowSources:new WeakMap<object,{id:string;generation?:string;row:number}>(),coreDetails:[] as any[],readDetails:[] as any[],validities:[] as any[],measurements: {} as Record<string,unknown>, setScan:(_open:boolean)=>{}, navigate:(_to:string,_state?:unknown)=>{}, profile:null as any, requestEnds:0, openExact:(_identifier:string,_server:string,_source:string,_at:number,_row:string)=>{},
  source:"", oldSource:"", location:null as any, publicCalls:0, filters:null as any,filterScope:"", counters:null as any, testSeed:undefined as LocalPlayerCurrentSeed|undefined, open:(_seed:LocalPlayerCurrentSeed)=>{}, auth:setRole };
(globalThis as any).w12=api;
window.addEventListener("unhandledrejection",e=>errors.push(String(e.reason)));
window.fetch = (async input => { const value=String(input); if(value.includes("catalog")) return new Response(JSON.stringify({schemaVersion:1,archives:[]})); throw Error(`Unexpected external request: ${value}`); }) as typeof fetch;
const writeLog: string[]=[]; const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(value:any,...args:any[]) { if(this.name==="state")writeLog.push(value.key);return put.call(this,value,...args); };
function storeRules(hidden=false) { const rules=FEATURE_ACCESS_CONFIG.map(r=>r.id==="main.guildHub"?{...r,status:hidden?"hidden":"active"}:r);localStorage.setItem("sf_feature_access_snapshot",JSON.stringify({byId:Object.fromEntries(rules.map(r=>[r.id,r])),byRoute:Object.fromEntries(rules.map(r=>[r.route,r]))}));localStorage.setItem("sf_feature_access_date",new Date().toISOString().slice(0,10)); }
storeRules();
function FiltersProbe({scope="public"}:{scope?:string}){const filters=useFilters();api.filters=filters;api.filterScope=scope;return <button data-filter-change onClick={()=>filters.setSearchText("local-only")}>Change filter</button>;}
function OriginHarness(){const navigation=useLocalProfileNavigation();api.open=navigation.open;api.openExact=navigation.openExact;return <button data-seeded-open onClick={()=>api.testSeed&&navigation.open(api.testSeed)}>Open prepared</button>;}
function Login(){const l=useLocation();return <div data-login>{l.search}</div>;}
function App(){const navigate=useNavigate(),location=useLocation();api.location=location;api.navigate=(to,state)=>flushSync(()=>navigate(to,{state}));const [scan,setScan]=React.useState(false);api.setScan=open=>flushSync(()=>setScan(open));return <><DataHubRouteHost>{l=><Routes location={l}><Route element={<RootLayout/>}>{dataHubRouteElements()}<Route path="/" element={<div data-home>Home</div>}/><Route path="/login" element={<Login/>}/><Route path="/filter-probe" element={<FilterProvider key="public"><FiltersProbe/></FilterProvider>}/><Route path="/local-filter-probe" element={<FilterProvider key="local" storageKey="SFH_LOCAL_TL_FILTERS_V1" migrateFrom="TL_FILTERS_V2"><FiltersProbe scope="local"/></FilterProvider>}/><Route path="/origin" element={<OriginHarness/>}/><Route path="*" element={<div data-missing>Missing</div>}/></Route></Routes>}</DataHubRouteHost><ScanManagement isOpen={scan} onClose={()=>setScan(false)}/></>;}
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
async function run(){
  for(const [old,target] of Object.entries(LEGACY_DATA_HUB_ROUTES)){await go(old+"?preserved=a%2Bb",{returnTo:"/data-hub",guildFeatureTarget:{feature:"guild-analytics",guild},guildFeatureTargetKey:"once-fixture"});await until(()=>api.location.pathname===target,old);assert(api.location.search==="?preserved=a%2Bb"&&api.location.state?.returnTo==="/data-hub","query/state preserved");}
  const before=pageContextStore.get("guild-analytics");pageContextStore.selectGuild("guild-dashboard",pageGuildReference({...guild,id:"other",guildId:"2",logoIdentifier:"f8_net_g2"}));await go("/guild-hub/dashboard?preserved=a%2Bb",{guildFeatureTarget:{feature:"guild-analytics",guild},guildFeatureTargetKey:"once-fixture"});await pause();assert(pageContextStore.get("guild-dashboard").guild?.guild.id==="other","redirect must not consume again");assert(before.targetKeys.includes("once-fixture"),"stable command consumed");
  results.push("All 16 production legacy registrations preserve query/state; aliases canonicalize once; consumed feature command is not replayed");
  await go("/guild-hub/unknown");await until(()=>!!document.querySelector('[data-missing]'),"unknown legacy path not migrated");
  pageContextStore.selectGuild('guild-hub',pageGuildReference(guild));pageContextStore.selectGuild('guild-analytics',pageGuildReference({...guild,id:'other',guildId:'2',logoIdentifier:'f8_net_g2'}));await go('/data-hub/guild-hub');
  await click('a[href="#/data-hub/analytics"]');await until(()=>pageContextStore.get('guild-analytics').guild?.guild.id===guild.id,"productive targeted analytics consumer");assert(pageContextStore.get('guild-dashboard').guild?.guild.id==='other',"targeted analytics leaves dashboard context intact");
  results.push('Productive Guild Hub analytics action sends one recipient feature target; actual Analytics consumes it without changing Dashboard context');
  await go("/data-hub");await until(()=>!!document.querySelector('a[href="#/data-hub/player-hub"]'),"Player Hub real link");const favoritesBefore=JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);const globalBefore=writeLog.filter(x=>x==="guild-selection").length;
  await click('[data-hub-favorites] a[href*="guild-hub/guild"]');await until(()=>!!document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]'),"addressed guild favorite");
  assert(api.location.pathname.includes('/guild/f8/f8_net_g1/dashboard'),"guild favorite address matches selected guild");
  await click('[data-guild-overview-return]');await until(()=>api.location.pathname==='/data-hub',"guild safe return");
  results.push("Real guild favorite opens addressed local Dashboard and safe return without favorite/global writes");
  await click('[data-hub-favorites] a[href*="player-hub/player"]');await profile();assert(!dialog(),"favorite is page");assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===favoritesBefore,"navigation has no favorite write");assert(writeLog.filter(x=>x==="guild-selection").length===globalBefore,"no global write");await click('.local-profile-route-actions button');await until(()=>api.location.pathname==="/data-hub","favorite return");
  results.push("Real Data Hub favorite links open local entities without autosave/global selection; safe page return");
  pageContextStore.selectGuild("guild-dashboard",pageGuildReference(guild));await go("/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard");await until(()=>document.querySelector('[title="Current Player 1"]')!=null||document.body.innerText.includes("Current Player 1"),"dashboard ready");
  const member=[...document.querySelectorAll<HTMLElement>('button')].find(e=>e.textContent?.includes("Current Player 1")||e.getAttribute('aria-label')?.includes("Current Player 1"));assert(member,"dashboard member");
  await pause();const coreStart=api.coreDetails.length,readStart=api.readDetails.length;api.reads=[];api.cores=[];api.builds=[];await click('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]');await profile();assert(!!dialog()&&api.location.pathname.includes("player-hub/player"),"dashboard URL overlay");api.measurements.preparedDashboard={reads:[...api.reads],cores:[...api.cores],builds:[...api.builds]};api.measurements.legacyCoreWindow=api.coreDetails.slice(coreStart);api.measurements.legacyReadWindow=api.readDetails.slice(readStart);assert(api.reads.filter(x=>x.startsWith("entry:")).length===0,"prepared no entry raw");assert(api.cores.length===0,"prepared no current normalization");const detail=api.location.pathname+api.location.search;
  await back();await closed();assert(api.location.pathname==="/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard","back closes exactly one");history.forward();await profile();await click('.profile-overlay__close--local');await closed();
  results.push("Actual Dashboard prepared overlay: addressable URL; Back/Forward/X; no additional Current raw/core work");
  api.reads=[];api.cores=[];api.builds=[];
  await go(detail,{returnTo:"https://external.test"});await profile();assert(!dialog(),"direct page");api.measurements.coldDirect={reads:[...api.reads],cores:[...api.cores],builds:[...api.builds]};await click('.local-profile-route-actions button');await until(()=>api.location.pathname==="/data-hub/player-hub","invalid return fallback");
  await go("/data-hub/toplist?fixture=kept");await tab("Players");flushSync(()=>{w08.filters.setSearchText("Current");w08.filters.setSortBy("name");});await until(()=>document.querySelector('[data-sfh-identifier="f8_net_p1"]')!=null,"toplist rows");
  const parent=document.querySelector('[data-sfh-identifier="f8_net_p1"]');const focus=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='Players')!;focus.focus();window.scrollTo(0,140);const scroll=scrollY;const dataset=w08.loads.at(-1)?.datasetId;const parentUrl=api.location.pathname+api.location.search;api.reads=[];api.cores=[];api.builds=[];await click('[data-sfh-identifier="f8_net_p1"]');await profile();assert(!!dialog(),"desktop overlay");await click('.profile-overlay--local');await closed();assert(document.querySelector('[data-sfh-identifier="f8_net_p1"]')===parent,"background DOM preserved");
  await click('[data-sfh-identifier="f8_net_p1"]');await profile();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await closed();assert(document.querySelector('[data-sfh-identifier="f8_net_p1"]')===parent,"Escape retains parent");
  assert(api.location.pathname+api.location.search===parentUrl,'background query retained');assert(w08.filters.searchText==='Current'&&w08.filters.sortBy==='name','background filters and sort retained');assert(w08.loads.at(-1)?.datasetId===dataset,'background valid dataset revision retained');assert(document.activeElement===focus&&scrollY===scroll,'background focus and scroll restored');
  flushSync(()=>w08.filters.setSearchText(''));await pause();
  results.push("Actual desktop Toplist overlay: backdrop/Escape share Close; parent DOM, dataset, filters, sort, query, scroll and focus retained");
  await tab("Guilds");await until(()=>!!document.querySelector('[data-sfh-identifier="f8__1"]'),"desktop guild row");await click('[data-sfh-identifier="f8__1"]');
  await until(()=>!!document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]'),"guild row Dashboard");assert(new URLSearchParams(api.location.search).get('at')===String(time),"guild exact observation carried");
  await click('[data-guild-overview-return]');await until(()=>api.location.pathname==='/data-hub/toplist',"guild returns local Toplist");
  await tab("Players");await until(()=>!!document.querySelector('[data-sfh-identifier="f8_net_p1"]'),"players restored");
  results.push("Desktop guild row opens local addressed Dashboard with source/time and local return");
  await click('[data-proof="compare"]');await click('[data-proof="from"]');await click('[data-proof="to"]');await until(()=>document.querySelector('[data-sfh-identifier="f8_net_p1"]')?.textContent?.includes("Historical Player 1")===true,"compare ready");await click('[data-sfh-identifier="f8_net_p1"]');await profile("Historical Player 1");assert(new URLSearchParams(api.location.search).get('at')===String(historical),"historical row anchor");const historicalLink=api.location.pathname+api.location.search;await back();await closed();assert(!!document.querySelector('[data-proof="compare"]'),"compare parent retained");
  results.push("Actual month Compare row opens historical observation; copied/reloaded query keeps source/time instead of newest");
  await click('[data-sfh-identifier="f8_net_p1"]');await profile("Historical Player 1");api.setScan(true);await until(()=>!!document.querySelector('[aria-label="Datenverwaltung schließen"]'),"scan open");const state=history.state;assert(state.usr?.localProfileParent&&state.ghOverlay,"scan marker merges router state");await back();await until(()=>!document.querySelector('[aria-label="Datenverwaltung schließen"]'),"scan back");assert(!!dialog(),"scan Back does not close profile");await back();await closed();
  await click('[data-sfh-identifier="f8_net_p1"]');await profile("Historical Player 1");api.setScan(true);window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await until(()=>!document.querySelector('[aria-label="Datenverwaltung schließen"]'),"scan Escape");assert(!!dialog(),"scan Escape only top");await click('.profile-overlay__close--local');await closed();
  results.push("Actual ScanManagement over profile: state/idx retained; Back and Escape close only the top layer under StrictMode");
  await go("/data-hub/player-hub/player/F9/f8_net_p1");await until(()=>document.body.innerText.includes("Invalid local entity"),"invalid entity");await go("/data-hub/player-hub/player/F8/f8_net_p1?source=missing&at="+historical);await until(()=>document.body.innerText.includes("selected local observation is missing"),"missing exact");
  results.push("Direct invalid namespace and missing exact source render explained failures, with no Current fallback");
  setRole("user");await pause();assert(!document.querySelector('a[href="#/data-hub"]'),"admin-only sidebar");await go("/data-hub");assert(!!document.querySelector('[data-hub-favorites]'),"entry ungated");setRole("guest");await go(detail);await until(()=>!!document.querySelector('[data-login]'),"detail auth");assert(sessionStorage.getItem('sfh:authNext')===detail,"auth query retained");setRole("user");await profile();assert(api.location.pathname===detail.split('?')[0],"auth returns local detail");
  results.push("Production FeatureGate/RootLayout auth: user access, admin-only Data Hub Sidebar, ungated entry, exact detail return query");
  await go("/filter-probe");await until(()=>api.filterScope==='public',"public provider mounted");assert(api.filters.searchText==="public-seed","public filter namespace preserved");api.filters.setSearchText("public-after");await pause();assert(JSON.parse(localStorage.getItem('TL_FILTERS_V2')!).searchText==="public-after","public writes own key");assert(JSON.parse(localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1')!).searchText!=="public-after","local independent");results.push("Actual public/local FilterProviders restore and write independent keys; old source preserved");
  const publicStored=localStorage.getItem('TL_FILTERS_V2')!,localStored=localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1')!;
  localStorage.removeItem('SFH_LOCAL_TL_FILTERS_V1');await go('/local-filter-probe');await until(()=>api.filterScope==='local',"local provider mounted");await until(()=>api.filters.searchText==='public-after',"validated first cutover");assert(localStorage.getItem('TL_FILTERS_V2')===publicStored,"migration source preserved");
  await go('/filter-probe');await until(()=>api.filterScope==='public',"public provider mounted");localStorage.setItem('TL_FILTERS_V2','{broken');localStorage.removeItem('SFH_LOCAL_TL_FILTERS_V1');await go('/local-filter-probe');await until(()=>api.filterScope==='local',"local provider mounted");await pause();assert(localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1')===null,"failed restore no empty initial write");assert(localStorage.getItem('TL_FILTERS_V2')==='{broken',"failed source preserved");
  flushSync(()=>api.filters.setSearchText('explicit-retry'));await until(()=>localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1')?.includes('explicit-retry')===true,"later explicit local write");localStorage.setItem('TL_FILTERS_V2',publicStored);localStorage.setItem('SFH_LOCAL_TL_FILTERS_V1',localStored);
  results.push("Real local filter first cutover validates and copies once; malformed legacy restore writes no empty default; later user write stays local");
  await go("/origin");await until(()=>!!document.querySelector('[data-seeded-open]'),"live origin mounted");flushSync(()=>api.openExact("f8_net_p1","F8",api.source,time,"f8_net_p1"));await profile();const gatedDetail=api.location.pathname+api.location.search;setRole('guest');await until(()=>!!document.querySelector('[data-login]'),"live background cannot bypass target auth");assert(sessionStorage.getItem('sfh:authNext')===gatedDetail,"overlay auth retains actual detail query");setRole('user');await profile();assert(!dialog(),"auth reentry without live origin is a page");
  storeRules(true);gateKey++;render();await until(()=>api.location.pathname==='/',"hidden feature target denied");await go('/data-hub');await until(()=>!!document.querySelector('[data-hub-favorites]'),"entry remains ungated with hidden local feature");storeRules();gateKey++;render();
  results.push("Real live overlay target enforces auth; hidden existing local gate denies detail while Data Hub entry remains ungated");
  await go("/origin");await until(()=>!!document.querySelector('[data-seeded-open]'),"live origin mounted"); let release!:()=>void; api.gate=new Promise<void>(r=>release=r);api.gateSource=api.oldSource;api.gateHeld=false;
  const historyBefore=history.length;
  flushSync(()=>api.openExact("f8_net_p1","F8",api.oldSource,historical,"f8_net_p1"));await until(()=>api.gateHeld,"slow A held");
  flushSync(()=>api.openExact("f8_net_p2","F8",api.source,time,"f8_net_p2"));await profile("Current Player 2");api.gate=undefined;release();await pause();
  assert(hero().includes("Current Player 2"),"slow A cannot overwrite B");assert(history.length===historyBefore+1,"profile switch adds one entry only");await click('.profile-overlay__close--local');await closed();
  api.gate=new Promise<void>(r=>release=r);api.gateSource=api.oldSource;api.gateHeld=false;
  flushSync(()=>api.openExact("f8_net_p1","F8",api.oldSource,historical,"f8_net_p1"));await until(()=>api.gateHeld,"close during resolution");await click('.local-profile-route-actions button');await closed();api.gate=undefined;release();await pause();assert(!dialog(),"late resolution cannot reopen");
  results.push("Routed A-slow/B-fast and Close during resolution discard stale work; profile switches retain one history entry");
  api.setScan(true);flushSync(()=>api.openExact("f8_net_p1","F8",api.source,time,"f8_net_p1"));await profile();
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await closed();assert(!!document.querySelector('[aria-label="Datenverwaltung schließen"]'),"profile above scan: Escape keeps scan");
  await back();await until(()=>!document.querySelector('[aria-label="Datenverwaltung schließen"]'),"underlying scan back");
  results.push("Profile above ScanManagement: Escape and subsequent Back close the responsible top layer once");
  await go(historicalLink);await profile("Historical Player 1");assert(!dialog(),"historical direct page");api.measurements.historicalLink=historicalLink;api.measurements.detail=detail;
  return results;
}
async function narrowRun(){
  assert(innerWidth===390,"real mobile CSS viewport");
  await go("/data-hub/toplist");await tab("Guilds");await until(()=>!!document.querySelector('[data-sfh-identifier="f8__1"] .toplists-mobile-summary'),"compact guild row");
  await click('[data-sfh-identifier="f8__1"] .toplists-mobile-summary');await click('[data-sfh-identifier="f8__1"] .toplists-mobile-action-button');await until(()=>api.location.pathname.includes('/guild/f8/f8_net_g1/dashboard'),"compact guild local Dashboard");assert(new URLSearchParams(api.location.search).get('at')===String(time),"compact guild anchor");await click('[data-guild-overview-return]');await until(()=>api.location.pathname==='/data-hub/toplist',"compact guild return");
  await tab("Players");
  await until(()=>!!document.querySelector('[data-sfh-identifier="f8_net_p1"] .toplists-mobile-summary'),"compact player");
  const parent=document.querySelector('[data-sfh-identifier="f8_net_p1"]');await click('[data-sfh-identifier="f8_net_p1"] .toplists-mobile-summary');await click('[data-sfh-identifier="f8_net_p1"] .toplists-mobile-action-button');await profile();assert(!!dialog(),"compact routed overlay");
  api.measurements.compactUrl=api.location.pathname+api.location.search;
  return {url:api.measurements.compactUrl,parentRetained:parent===document.querySelector('[data-sfh-identifier="f8_net_p1"]'),errors};
}
async function mutateRun(){
  if(dialog()){await click('.profile-overlay__close--local');await closed();}
  const metadata=await scans.readDataHubLocalScanMetadata({includeContentHashes:true});const source=metadata.summaries.find(s=>s.snapshotTimestamps.includes(time))!;
  const ref=parseLocalEntity('player','F8','f8_net_p1')!;const original=localEntityPath('player',ref,{source:source.sourceScanId,at:time,row:'f8_net_p1',hash:source.contentHash});
  await scans.updateGuildHubLocalScan(source.sourceScanId,'changed.json',JSON.stringify({...raw(time),players:[{...raw(time).players[0],name:'Changed'}]}));await go(original);await until(()=>document.body.innerText.includes('source or identity changed'),"changed exact source");
  await scans.updateGuildHubLocalScan(source.sourceScanId,'ambiguous.json',JSON.stringify({players:[raw(time).players[0],raw(time).players[0]],groups:raw(time).groups}));
  const unverified=localEntityPath('player',ref,{source:source.sourceScanId,at:time,row:'f8_net_p1'});await go(unverified);await until(()=>document.body.innerText.includes('Multiple local rows'),"ambiguous exact source");
  await scans.deleteGuildHubLocalScans([source.sourceScanId]);await until(()=>document.body.innerText.includes('selected local observation is missing'),"deleted source invalidates finished route");
  assert(w08.publicCalls===0,"no public reader fallback");return {results:['Changed, ambiguous and deleted sources in actual routed page produce explained states without public fallback'],errors};
}
async function reloadCheck(){await profile("Historical Player 1");assert(!dialog(),"stale history parent cannot prove live overlay after reload");api.measurements.reload={reads:api.reads,cores:api.cores,builds:api.builds};return {url:api.location.pathname+api.location.search,measurements:api.measurements,errors};}
async function seed(){
  localStorage.setItem('TL_FILTERS_V2',JSON.stringify({servers:['F9'],searchText:'public-seed',classes:[]}));
  await w08.acquire(entries,{});const bindings=(await scans.readDataHubLocalScanMetadata()).bindings;api.source=bindings.find(b=>b.archiveScanId===currentEntry.id)!.localScanId;api.oldSource=bindings.find(b=>b.archiveScanId===historicalEntry.id)!.localScanId;
  await hubFavoritesStore.refresh();await hubFavoritesStore.mutate({type:'save',favorite:guildFavorite(guild,0,null,false)});
  const p=await resolveLocalProfileEntry({entity:parseLocalEntity('player','F8','f8_net_p1')!,observation:{kind:'exact',anchor:{source:api.source,at:time}}});await hubFavoritesStore.mutate({type:'save',favorite:localPlayerFavorite(p)!});
  pageContextStore.selectServers(['F8']);pageContextStore.selectGuild('guild-dashboard',pageGuildReference(guild));
  sessionStorage.setItem('w12-seeded','1');api.reads=[];api.cores=[];api.builds=[];
}
await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:{en:{translation:en}},interpolation:{escapeValue:false}});
if(!sessionStorage.getItem('w12-seeded'))await seed();
root=createRoot(document.getElementById('root')!);render();api.ready=true;
