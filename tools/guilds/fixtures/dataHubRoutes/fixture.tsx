import { captureLocalDataDependencies } from "../../../../src/lib/local-data/localDataDependencies";
import {createLocalPlayerCurrentSeed,isLocalPlayerCurrentSeedValid} from "../../../../src/pages/GuildHub/localPlayerCurrentSeed";
import {normalizeSfPlayerCharacterCore} from "../../../../src/lib/parsing/normalizedPlayer";
import {costEvents,setCostPhase,scopedCosts} from "../profileBrowserGuards/costProbe";
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
const api = { ready:false, documentId:crypto.randomUUID(), results, errors, reads:[] as string[], cores:[] as string[], builds:[] as string[], gate:undefined as Promise<void>|undefined, gateSource:"", gateHeld:false, run, reloadCheck, narrowRun, mutateRun, w20Run, w20Show, w20Reload, w21Run, w21Reload, w21Narrow, w21OpenPicker:openPicker,
  lastSeed:undefined as LocalPlayerCurrentSeed|undefined, currentParts:[] as any[], ranksGate:undefined as Promise<void>|undefined,ranksHeld:false, measurements: {} as Record<string,unknown>, setScan:(_open:boolean)=>{}, navigate:(_to:string,_state?:unknown)=>{}, profile:null as any, requestEnds:0, openExact:(_identifier:string,_server:string,_source:string,_at:number,_row:string)=>{},
  summaryEnsures:0, poolReads:0, failFavoriteWrites:false, pickerGate:undefined as Promise<void>|undefined, pickerHeld:false, releasePicker:()=>{}, mutationGate:undefined as Promise<void>|undefined, mutationHeld:false, releaseMutation:()=>{},
  source:"", oldSource:"", location:null as any, publicCalls:0, filters:null as any,filterScope:"", counters:null as any, testSeed:undefined as LocalPlayerCurrentSeed|undefined, open:(_seed:LocalPlayerCurrentSeed)=>{}, auth:setRole };
(globalThis as any).w12=api;
window.addEventListener("unhandledrejection",e=>errors.push(String(e.reason)));
window.fetch = (async input => { const value=String(input); if(value.includes("catalog")) return new Response(JSON.stringify({schemaVersion:1,archives:[]})); throw Error(`Unexpected external request: ${value}`); }) as typeof fetch;
const writeLog: string[]=[]; const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(value:any,...args:any[]) { if(this.name==="state") { writeLog.push(value.key); if(api.failFavoriteWrites && value.key==="hub-favorites") throw Error("controlled W21 favorite failure"); } return put.call(this,value,...args); };
const getAll = IDBObjectStore.prototype.getAll; IDBObjectStore.prototype.getAll = function(...args) { if(this.name==="scans") api.poolReads++; return getAll.apply(this,args); };
function storeRules(hidden=false) { const rules=FEATURE_ACCESS_CONFIG.map(r=>r.id==="main.guildHub"?{...r,status:hidden?"hidden":"active"}:r);localStorage.setItem("sf_feature_access_snapshot",JSON.stringify({byId:Object.fromEntries(rules.map(r=>[r.id,r])),byRoute:Object.fromEntries(rules.map(r=>[r.route,r]))}));localStorage.setItem("sf_feature_access_date",new Date().toISOString().slice(0,10)); }
storeRules();
function FiltersProbe({scope="public"}:{scope?:string}){const filters=useFilters();api.filters=filters;api.filterScope=scope;return <button data-filter-change onClick={()=>filters.setSearchText("local-only")}>Change filter</button>;}
function OriginHarness(){const navigation=useLocalProfileNavigation();api.open=navigation.open;api.openExact=navigation.openExact;return <button data-seeded-open onClick={()=>api.testSeed&&navigation.open(api.testSeed)}>Open prepared</button>;}
function Login(){const l=useLocation();return <div data-login>{l.search}</div>;}
function App(){const navigate=useNavigate(),location=useLocation();React.useLayoutEffect(()=>{api.location=location;},[location]);api.navigate=(to,state)=>flushSync(()=>navigate(to,{state}));const [scan,setScan]=React.useState(false);api.setScan=open=>flushSync(()=>setScan(open));return <><DataHubRouteHost>{l=><Routes location={l}><Route element={<RootLayout/>}>{dataHubRouteElements()}<Route path="/" element={<div data-home>Home</div>}/><Route path="/login" element={<Login/>}/><Route path="/filter-probe" element={<FilterProvider key="public"><FiltersProbe/></FilterProvider>}/><Route path="/local-filter-probe" element={<FilterProvider key="local" storageKey="SFH_LOCAL_TL_FILTERS_V1" migrateFrom="TL_FILTERS_V2"><FiltersProbe scope="local"/></FilterProvider>}/><Route path="/origin" element={<OriginHarness/>}/><Route path="*" element={<div data-missing>Missing</div>}/></Route></Routes>}</DataHubRouteHost><ScanManagement isOpen={scan} onClose={()=>setScan(false)}/></>;}
let root:ReturnType<typeof createRoot>; let gateKey=0;
function render(){flushSync(()=>root.render(<React.StrictMode><HashRouter><FeatureAccessProvider key={gateKey}><LocalePreferencesProvider><App/></LocalePreferencesProvider></FeatureAccessProvider></HashRouter></React.StrictMode>));}
async function go(to:string,state?:unknown){
  const previousKey=api.location?.key;api.navigate(to,state);
  const requested=to.split('?')[0],canonical=LEGACY_DATA_HUB_ROUTES[requested]??requested;
  await until(()=>api.location?.key!==previousKey&&history.state?.key===api.location?.key&&location.hash.slice(1)===api.location.pathname+api.location.search&&[canonical,'/login','/'].includes(api.location.pathname),`committed navigation ${to}`);
}
async function click(selector:string){await until(()=>!!document.querySelector(selector),`Missing ${selector}`);const e=document.querySelector<HTMLElement>(selector);flushSync(()=>e!.click());await pause();}
async function tab(label:string){const find=()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);await until(()=>!!find(),`Tab ${label}`);flushSync(()=>find()!.click());await pause();}
async function back(){history.back();await pause();}
const dialog=()=>document.querySelector('.profile-overlay--local[role="dialog"]');
const hero=()=>document.querySelector('.local-hero')?.textContent??document.querySelector('.player-profile')?.textContent??"";
async function profile(name="Current Player 1"){await until(()=>hero().includes(name),`Profile ${name}`);await pause();}
async function closed(){await until(()=>!dialog(),"profile closed");}
const guild={id:"f8_net_g1",guildId:"1",name:"Fixture Guild",server:"F8",logoIdentifier:"f8_net_g1",memberCount:2};
async function w20Show(view: string) {
  await go('/data-hub');
  if (view === 'guild') await go('/data-hub/guild-hub/dashboard');
  if (view === 'player') await go('/data-hub/player-hub');
  if (view === 'menu') await click('[data-local-favorites-trigger]');
  if (view === 'navigation') document.querySelector('[data-hub-area]')!.scrollIntoView({block:'center'});
  await new Promise(resolve => setTimeout(resolve, 220));
  assert(!document.querySelector('nav[aria-label="Guild-Hub-Kontextnavigation"]'), 'old rail absent');
  return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
}
async function w20Reload() {
  await until(()=>!!document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]'),'addressed reload');
  return { path: api.location.pathname, errors };
}

const menuSelector = '#local-favorites-dialog';
const editorSelector = `${menuSelector} [data-guild-favorites-edit]`;
const pickerSelector = `${menuSelector} [data-guild-picker]`;
const menuIds = () => [...document.querySelectorAll(`${menuSelector} [data-favorite-id]`)].map(e=>e.getAttribute('data-favorite-id')).filter(id=>hubFavoritesStore.getSnapshot().snapshot!.record.favorites.some(f=>f.id===id&&f.kind==='guild'));
const committedIds = () => hubFavoritesStore.getSnapshot().snapshot!.record.favorites.filter(f=>f.kind==='guild').map(f=>f.id);
const readyFavorites = () => hubFavoritesStore.getSnapshot().status === 'ready';
const escapeActive = () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); };
async function openPicker() {
  await click(`${menuSelector} button[aria-label="Add guild"]`);
  await until(()=>!!document.querySelector(`${pickerSelector} select:not(:disabled)`),'existing picker servers');
  const server = document.querySelector<HTMLSelectElement>(`${pickerSelector} select`)!;
  flushSync(()=>{server.value='F8';server.dispatchEvent(new Event('change',{bubbles:true}));});
  await until(()=>!!document.querySelector(`${pickerSelector} input`),'existing picker search');
}
async function pick(name:string) {
  await until(()=>[...document.querySelectorAll<HTMLButtonElement>(`${pickerSelector} button`)].some(b=>b.textContent?.includes(name)),'picker result '+name);
  const result=[...document.querySelectorAll<HTMLButtonElement>(`${pickerSelector} button`)].find(b=>b.textContent?.includes(name))!;
  flushSync(()=>result.click());await pause();
}
async function waitCommit() { await until(readyFavorites,'favorite committed'); await until(()=>JSON.stringify(menuIds())===JSON.stringify(committedIds()),'committed menu'); }
async function w21Run() {
  const proof:string[]=[];
  await go('/data-hub');await new Promise(r=>setTimeout(r,350));
  const saved=structuredClone(hubFavoritesStore.getSnapshot().snapshot!);
  sessionStorage.setItem('w21-original',JSON.stringify(saved));
  const scan=await scans.importGuildHubLocalScan('w21-picker.json',JSON.stringify({players:[],groups:[2,3].map(id=>({identifier:`f8_net_g${id}`,prefix:'f8_net',timestamp:time,name:`Menu Guild ${id}`,memberCount:0,memberIdentifiers:[]}))}));
  assert(scan.status==='imported' || scan.status==='duplicate','isolated picker scan imported');
  sessionStorage.setItem('w21-source',scan.scan.id);
  const trackerLibrary=await import('../../../../src/pages/GuildHub/fightTrackingStore');
  const tracker=await trackerLibrary.createFightTracker({name:'W21 retained',server:'F8',source:'manual',members:[{name:'Keep member',source:'manual',active:true}]});
  const trackerId=tracker.tracker!.id;
  const trackerBefore=JSON.stringify(await trackerLibrary.readFightTrackerStateById(trackerId));
  const stateBefore=JSON.stringify(await trackerLibrary.readFightTrackerState(null));
  const contexts=()=>JSON.stringify(['guild-hub','guild-dashboard','guild-analytics','fight-tracking'].map(f=>pageContextStore.get(f as Parameters<typeof pageContextStore.get>[0])));
  const sessionContexts=()=>JSON.stringify(Object.fromEntries(Object.entries({...sessionStorage}).filter(([key])=>!key.startsWith('w21-'))));
  const contextBefore=contexts(), sessionBefore=sessionContexts(), pathBefore=JSON.stringify(api.location), compatibility=JSON.stringify(saved.compatibility);
  const workBefore={reads:api.reads.length,cores:api.cores.length,ensures:api.summaryEnsures,pool:api.poolReads};
  const writesBefore=writeLog.length;
  await click('[data-local-favorites-trigger]');await click(editorSelector);
  assert(document.querySelector(editorSelector)?.getAttribute('aria-pressed')==='true','Manage activates editing');
  assert(!document.querySelector(`${menuSelector} a[href="#/data-hub/guild-hub"]`),'management link replaced');
  await click(`${menuSelector} button[aria-label="Open Guild Overview: Fixture Guild"]`);
  assert(JSON.stringify(api.location)===pathBefore&&!document.querySelector('[data-local-favorite-page-action]'),'editing card cannot navigate/select');
  await click(editorSelector);assert(!!document.querySelector(menuSelector),'finish keeps menu open');
  assert(writeLog.length===writesBefore,'opening/editing/finishing write nothing');
  assert(api.reads.length===workBefore.reads&&api.cores.length===workBefore.cores&&api.summaryEnsures===workBefore.ensures&&api.poolReads===workBefore.pool,'menu/edit no raw/pool/core/summary repair');
  proof.push('Manage/finish/edit-card clicks retain complete route/page and create no favorite writes or Raw/pool/core/summary work');
  await click(editorSelector);await openPicker();
  const pickerWork={summaryEnsures:api.summaryEnsures-workBefore.ensures,rawReads:api.reads.length-workBefore.reads,rawPoolReads:api.poolReads-workBefore.pool};
  assert(pickerWork.summaryEnsures>0,'requested picker counted separately from free menu display');
  document.querySelector<HTMLElement>(`${pickerSelector} input`)!.focus();escapeActive();await until(()=>!document.querySelector(pickerSelector),'picker Escape cancels only picker');
  assert(!!document.querySelector(menuSelector)&&document.activeElement?.getAttribute('aria-label')==='Add guild','picker cancel restores plus focus');
  assert(writeLog.length===writesBefore,'cancel picker no save');
  api.pickerGate=new Promise<void>(resolve=>api.releasePicker=resolve);
  await click(`${menuSelector} button[aria-label="Add guild"]`);await until(()=>api.pickerHeld,'picker loading held');
  await click(`${menuSelector} > header button`);api.releasePicker();api.pickerGate=undefined;await new Promise(r=>setTimeout(r,200));
  assert(!document.querySelector(menuSelector)&&JSON.stringify(api.location)===pathBefore&&writeLog.length===writesBefore,'late picker load cannot reopen/save/navigate');
  await click('[data-local-favorites-trigger]');await click(editorSelector);
  await openPicker();api.failFavoriteWrites=true;await pick('Menu Guild 2');
  await until(()=>hubFavoritesStore.getSnapshot().status==='error','add failure');
  assert(!!document.querySelector(`${menuSelector} [role="alert"]`)&&!!document.querySelector(pickerSelector)&&JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===JSON.stringify(saved),'failed save honest, old committed list retained');
  api.failFavoriteWrites=false;await click(`${menuSelector} [role="alert"] button`);await waitCommit();
  await until(()=>!document.querySelector(pickerSelector),'successful retry closes picker');await openPicker();
  const duplicateRevision=hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision, duplicateWrites=writeLog.length;
  await pick('Menu Guild 2');await waitCommit();await until(()=>!document.querySelector(pickerSelector),'duplicate picker closes');
  assert(hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision===duplicateRevision&&writeLog.length===duplicateWrites,'duplicate follows store dedupe without commit');
  proof.push('Production plus-card/picker adds; real aborted IDB save displays failure/Retry; duplicate keeps durable revision; explicit picker cost '+JSON.stringify(pickerWork));
  const mutationWork={reads:api.reads.length,cores:api.cores.length,ensures:api.summaryEnsures,pool:api.poolReads};
  const beforeOrder=JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);
  api.failFavoriteWrites=true;await click(`${menuSelector} button[aria-label="Move Fixture Guild down"]`);
  await until(()=>hubFavoritesStore.getSnapshot().status==='error','reorder failure');
  assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===beforeOrder,'failed reorder preserves committed order');
  api.failFavoriteWrites=false;await click(`${menuSelector} [role="alert"] button`);await waitCommit();
  assert(document.querySelector(`${menuSelector} [data-favorite-id]`)?.textContent?.includes('Menu Guild 2'),'down uses existing insertion-index contract');
  const source=document.querySelector<HTMLButtonElement>(`${menuSelector} button[aria-label="Open Guild Overview: Menu Guild 2"]`)!;
  const target=document.querySelector<HTMLButtonElement>(`${menuSelector} button[aria-label="Open Guild Overview: Fixture Guild"]`)!.closest('li')!;
  const transfer=new DataTransfer();flushSync(()=>source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer})));await pause();
  const rect=target.getBoundingClientRect();flushSync(()=>target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.right-1})));await pause();
  flushSync(()=>target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer})));await waitCommit();
  assert(document.querySelector(`${menuSelector} [data-favorite-id]`)?.textContent?.includes('Fixture Guild'),'shared drag/drop commits order');
  await click(`${menuSelector} button[aria-label="Move Menu Guild 2 up"]`);await waitCommit();
  const revision=hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision;
  document.querySelector<HTMLElement>(`${menuSelector} button[aria-label="Remove Menu Guild 2"]`)!.focus();
  await click(`${menuSelector} button[aria-label="Remove Menu Guild 2"]`);
  const nested=document.querySelector<HTMLElement>(`${menuSelector} [role="dialog"]`)!;
  assert(nested.contains(document.activeElement),'remove initial focus inside nested dialog');
  const nestedButtons=[...nested.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  nestedButtons.at(-1)!.focus();nestedButtons.at(-1)!.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert(document.activeElement===nestedButtons[0],'nested Tab wraps without menu hijack');
  nestedButtons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert(document.activeElement===nestedButtons.at(-1),'nested ShiftTab wraps');
  escapeActive();await until(()=>!document.querySelector(`${menuSelector} [role="dialog"]`),'cancel removal Escape');
  assert(!!document.querySelector(menuSelector)&&document.activeElement?.getAttribute('aria-label')==='Remove Menu Guild 2'&&hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision===revision,'cancel remove preserves focus/menu/revision '+JSON.stringify({menu:!!document.querySelector(menuSelector),focus:document.activeElement?.outerHTML,revision:hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision,expected:revision}));
  await click(`${menuSelector} button[aria-label="Remove Menu Guild 2"]`);api.failFavoriteWrites=true;await click(`${menuSelector} [role="dialog"] button:last-child`);
  await until(()=>hubFavoritesStore.getSnapshot().status==='error','remove failure');assert(document.querySelector(`${menuSelector} [data-favorite-id]`)?.textContent?.includes('Menu Guild 2')&&!!document.querySelector(`${menuSelector} [role="dialog"] [role="alert"]`),'failed remove remains committed in dialog');
  api.failFavoriteWrites=false;await click(`${menuSelector} [role="dialog"] [role="alert"] button`);await waitCommit();
  await until(()=>!document.querySelector(`${menuSelector} [role="dialog"]`),'successful retry closes confirmation');
  assert(!hubFavoritesStore.getSnapshot().snapshot!.record.favorites.some(f=>f.display.name==='Menu Guild 2'),'remove committed');
  assert(api.reads.length===mutationWork.reads&&api.cores.length===mutationWork.cores&&api.summaryEnsures===mutationWork.ensures&&api.poolReads===mutationWork.pool,'reorder/drag/remove/retry do no raw/pool/core/repair work');
  // A held response is released after close. It may commit, never reopen or select.
  await openPicker();api.mutationGate=new Promise<void>(resolve=>api.releaseMutation=resolve);await pick('Menu Guild 3');
  await until(()=>api.mutationHeld,'late save held');await click(`${menuSelector} > header button`);
  api.releaseMutation();api.mutationGate=undefined;await until(readyFavorites,'late commit after menu close');
  assert(!document.querySelector(menuSelector)&&JSON.stringify(api.location)===pathBefore&&contexts()===contextBefore,'late commit cannot reopen/navigate/select');
  await click('[data-local-favorites-trigger]');assert(document.querySelector(editorSelector)?.getAttribute('aria-pressed')==='false','reopen resets editor');
  await click(editorSelector);await waitCommit();
  await click(`${menuSelector} button[aria-label="Move Menu Guild 3 up"]`);await waitCommit();
  const persisted=committedIds();sessionStorage.setItem('w21-expected',JSON.stringify(persisted));
  await click(editorSelector);assert(!!document.querySelector(menuSelector),'finish retained drawer');
  await click(`${menuSelector} > header button`);assert(!document.querySelector('[data-hub-favorites]'),'dashboard favorites absent');await click('[data-local-favorites-trigger]');await waitCommit();
  const dashboardGuilds=[...document.querySelectorAll('#local-favorites-dialog [data-favorite-id]')].map(e=>e.getAttribute('data-favorite-id')).filter(id=>hubFavoritesStore.getSnapshot().snapshot!.record.favorites.some(f=>f.id===id&&f.kind==='guild'));
  assert(JSON.stringify(dashboardGuilds)===JSON.stringify(persisted),'reopened menu ordered committed guilds');await click(`${menuSelector} > header button`);
  assert(contexts()===contextBefore&&JSON.stringify(hubFavoritesStore.getSnapshot().snapshot!.compatibility)===compatibility,'all mutations retain every page context/active hint');
  assert(JSON.stringify(await trackerLibrary.readFightTrackerStateById(trackerId))===trackerBefore&&JSON.stringify(await trackerLibrary.readFightTrackerState(null))===stateBefore,'all tracker bytes/active slot unchanged');
  assert(sessionContexts()===sessionBefore,'management preserves underlying session/page selections');
  assert(!!await scans.getGuildHubLocalScan(scan.scan.id),'remove preserves scans');
  await click('[data-local-favorites-trigger]');await waitCommit();assert(JSON.stringify(menuIds())===JSON.stringify(persisted),'reopen persists order/remove/add');
  await click(`${menuSelector} button[aria-label="Open Guild Overview: Fixture Guild"]`);await until(()=>api.location.pathname.includes('/guild/f8/f8_net_g1/dashboard'),'normal target after finish');
  proof.push('Both reorder directions/removal persist; nested focus/Tab/Escape; actual failed remove/Retry; late save after close; dashboard subscriptions; contexts/compatibility/tracker/source preserved; normal card target restored');
  await go('/data-hub/analytics');await click('[data-local-favorites-trigger]');await until(()=>!!document.querySelector('[data-local-favorite-page-action]'),'registered page action');
  const pageState=contexts(), pageLocation=JSON.stringify(api.location), pageSnapshot=JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);
  await click(editorSelector);assert(!document.querySelector('[data-local-favorite-page-action]'),'recipient action hidden while editing');
  await click(`${menuSelector} button[aria-label="Open Guild Overview: Fixture Guild"]`);
  assert(contexts()===pageState&&JSON.stringify(api.location)===pageLocation&&JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===pageSnapshot,'editing cannot invoke recipient or target');
  await click(editorSelector);assert(!!document.querySelector('[data-local-favorite-page-action]'),'normal recipient action restored after finish');
  await click(`${menuSelector} > header button`);await go('/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard');
  proof.push('Actual Analytics recipient action hidden during edit and restored after finish, without route/context/favorite writes; drag/drop and failed reorder/Retry use existing mutations');
  return proof;
}
async function w21Reload() {
  await until(readyFavorites,'durable reload restore');await click('[data-local-favorites-trigger]');await waitCommit();
  assert(JSON.stringify(menuIds())===sessionStorage.getItem('w21-expected'),'actual page reload retains added/removed/reordered favorites');
  await click(`${menuSelector} > header button`);
  const before=JSON.parse(sessionStorage.getItem('w21-original')!) as NonNullable<ReturnType<typeof hubFavoritesStore.getSnapshot>['snapshot']>;
  for (const favorite of hubFavoritesStore.getSnapshot().snapshot!.record.favorites) await hubFavoritesStore.mutate({type:'remove',id:favorite.id});
  for (const favorite of before.record.favorites) await hubFavoritesStore.mutate({type:'save',favorite});
  await scans.deleteGuildHubLocalScans([sessionStorage.getItem('w21-source')!]);
  return 'Actual reload retains committed menu add/remove/order; isolated fixture baseline restored for original navigation protections';
}
async function w21Narrow() {
  const writes=writeLog.length;const before=JSON.stringify(api.location);
  await click(editorSelector);await openPicker();
  const panel=document.querySelector<HTMLElement>(menuSelector)!;
  assert(panel.scrollWidth<=panel.clientWidth&&document.documentElement.scrollWidth<=innerWidth,'menu and picker fit');
  const input=document.querySelector<HTMLElement>(`${pickerSelector} input`)!;input.scrollIntoView();input.focus();escapeActive();await pause();
  assert(!!document.querySelector(menuSelector)&&!document.querySelector(pickerSelector),'responsive Escape cancels picker');
  await click(editorSelector);assert(writeLog.length===writes&&JSON.stringify(api.location)===before,'responsive finish/cancel no save/navigation');
  return {width:innerWidth,overflow:false};
}

async function w20Run() {
  const proof: string[] = [];
  await go('/data-hub');
  const areas = [...document.querySelectorAll('[data-hub-area]')].map(area => ({kind:area.getAttribute('data-hub-area'),headings:[...area.querySelectorAll('h2,h3')].map(h=>h.textContent),links:[...area.querySelectorAll('a')].map(a=>a.getAttribute('href'))}));
  assert(JSON.stringify(areas)===JSON.stringify([
    {kind:'players',headings:['Players','Player Overview'],links:['#/data-hub/player-hub']},
    {kind:'guilds',headings:['Guilds','Guild Overview','Fight Tracking'],links:['#/data-hub/guild-hub/dashboard','#/data-hub/guild-hub/fight-tracking']}
  ]),'exact requested nested tiles with semantic headings');
  assert(document.querySelectorAll('[data-inventory-kpi]').length===0,'inventory initially closed');
  await click('[data-inventory-toggle]');
  assert(document.querySelectorAll('[data-inventory-kpi]').length===3&&!document.querySelector('[data-hub-favorites]')&&!!document.querySelector('[data-hub-search]'),'KPIs/search/favorites retained');
  proof.push('Production dashboard: exact Players/Guilds cards and tiles, shared divider headers, independent Toplist/Analytics, KPIs/search/favorites retained');
  const dashboardInput=document.querySelector<HTMLInputElement>('[data-hub-search] input[type=search]')!;
  flushSync(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(dashboardInput,'dashboard retained');dashboardInput.dispatchEvent(new Event('input',{bubbles:true}));});
  await new Promise(r=>setTimeout(r,250));
  const dashboardQuery=sessionStorage.getItem('sfdatahub:hub-search:v1');
  const saved=structuredClone(hubFavoritesStore.getSnapshot().snapshot!);
  const contextsBefore=JSON.stringify(pageContextStore.get('guild-dashboard'));
  await click('a[href="#/data-hub/guild-hub/dashboard"]');
  await until(()=>!!document.querySelector('[data-overview-entry="guild"]'),'plain guild entry despite selected old context');
  assert(JSON.stringify(pageContextStore.get('guild-dashboard'))===contextsBefore,'entry preserves old context without applying it');
  assert(!document.querySelector('button[aria-label$="lokales Spielerprofil öffnen"]'),'no implicit detail');
  await go('/origin');await new Promise(r=>setTimeout(r,250));
  const costsBefore=costEvents.length, readsBefore=api.reads.length, coreBefore=api.cores.length;
  const snapshotBefore=JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);
  await click('[data-local-favorites-trigger]');await until(()=>!!document.querySelector('#local-favorites-dialog [data-favorite-id]'),'menu committed cards');
  await new Promise(r=>setTimeout(r,200));
  assert(api.reads.length===readsBefore&&api.cores.length===coreBefore&&costEvents.slice(costsBefore).every(e=>e.kind!=='raw'&&e.kind!=='core'),'menu view has no raw/core/repair pipeline');
  assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===snapshotBefore,'view no favorites/global writes');
  const menu=document.querySelector<HTMLElement>('#local-favorites-dialog')!;
  assert(menu.contains(document.activeElement),'initial focus inside menu');
  const buttons=[...menu.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]')];buttons.at(-1)!.focus();buttons.at(-1)!.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert(document.activeElement===buttons[0],'Tab wraps focus');
  buttons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert(document.activeElement===buttons.at(-1),'Shift Tab wraps focus');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await until(()=>!document.querySelector('#local-favorites-dialog'),'Escape closes');assert(document.activeElement===document.querySelector('[data-local-favorites-trigger]'),'focus returns trigger');
  await click('[data-local-favorites-trigger]');await click('#local-favorites-dialog button[aria-label="Open Guild Overview: Fixture Guild"]');await until(()=>!!document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]'),'menu addressed overview');
  assert(api.location.pathname==='/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard','menu direct address');
  await click('[data-guild-overview-return]');await until(()=>api.location.pathname==='/data-hub/guild-hub/dashboard','safe menu return fallback');
  proof.push('Global local-only menu: committed GuildCards, no Raw/core/repair/public/favorite writes on view, focus trap, Escape/trigger restore, direct addressed target and exact return');
  await hubFavoritesStore.mutate({type:'save',favorite:guildFavorite({...guild,id:'f8_net_g2',guildId:'2',logoIdentifier:'f8_net_g2',name:'Second Guild'},0,null,false)});
  await click('[data-local-favorites-trigger]');await until(()=>document.querySelectorAll('#local-favorites-dialog [data-favorite-id]').length===saved.record.favorites.length+1,'same mixed collection updates menu');
  await click('#local-favorites-dialog [data-guild-favorites-edit]');
  await click('#local-favorites-dialog button[aria-label="Move Second Guild up"]');await until(()=>document.querySelector('#local-favorites-dialog [data-favorite-id]')?.textContent?.includes('Second Guild')===true,'committed reorder');
  await click('#local-favorites-dialog button[aria-label="Remove Second Guild"]');await click('#local-favorites-dialog [role="dialog"] button:last-child');await until(()=>document.querySelectorAll('#local-favorites-dialog [data-favorite-id]').length===saved.record.favorites.length,'remove updates mixed menu');
  await click('#local-favorites-dialog > header button');await go('/data-hub');assert(!document.querySelector('[data-hub-favorites]'),'dashboard favorites absent');await click('[data-local-favorites-trigger]');await until(()=>document.querySelectorAll('#local-favorites-dialog [data-favorite-id]').length===saved.record.favorites.length,'reopened menu same collection');await click('#local-favorites-dialog > header button');
  proof.push('Menu reorder/remove use existing mutations; dashboard and menu reflect the same committed collection without page selection writes');
  for (const favorite of saved.record.favorites) await hubFavoritesStore.mutate({type:'remove',id:favorite.id});
  const afterRemoval=JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);
  for (const kind of ['guild','player'] as const) {
    await go(kind==='guild'?'/data-hub/guild-hub/dashboard':'/data-hub/player-hub');await until(()=>!!document.querySelector(`[data-overview-entry="${kind}"]`),'entry without favorites');
    assert(document.querySelectorAll('[data-hub-search] select').length===1,'entity/profile mode fixed; scope remains available');
    const input=document.querySelector<HTMLInputElement>('[data-hub-search] input[type=search]')!;
    const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
    flushSync(()=>{set.call(input,kind==='guild'?'Fixture':'Current');input.dispatchEvent(new Event('input',{bubbles:true}));});
    const id=kind==='guild'?'f8_net_g1':'f8_net_p1';
    await until(()=>!!document.querySelector(`[data-hub-search-hit="${id}"]`),'typed search result');
    assert([...document.querySelectorAll('[data-hub-search-hit]')].every(hit=>hit.getAttribute('data-hub-search-hit')?.includes(kind==='guild'?'_g':'_p')),'search entity restriction');
    await click(`[data-hub-search-hit="${id}"] > button`);
    if (kind==='guild') {await until(()=>!!document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]'),'guild search address');await click('[data-guild-overview-return]');}
    else {await profile();await click('.local-profile-route-actions button');}
    await until(()=>!!document.querySelector(`[data-overview-entry="${kind}"]`),'return own entry');
    assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===afterRemoval,'search opens without favorite save/activation');
  }
  assert(sessionStorage.getItem('sfdatahub:hub-search:v1')===dashboardQuery,'Overview queries do not overwrite dashboard');
  proof.push('Both empty-favorite Overview entries are usable with old page context; entity-only searches open direct targets without save/activation; independent inputs and exact returns');
  for (const favorite of saved.record.favorites) await hubFavoritesStore.mutate({type:'save',favorite});
  for (const route of ['/data-hub/toplist','/data-hub/analytics']) {await go(route);await until(()=>!!document.querySelector('[data-data-hub-back]'),'page return');await click('[data-data-hub-back]');await until(()=>api.location.pathname==='/data-hub','Data Hub return');}
  await go('/data-hub/toplist');await tab('Guilds');await until(()=>!!document.querySelector('[data-sfh-identifier="f8__1"]'),'toplist guild');
  const filters=JSON.stringify({servers:w08.filters.servers,classes:w08.filters.classes,search:w08.filters.searchText,sort:w08.filters.sortBy});
  await click('[data-local-favorites-trigger]');await until(()=>!!document.querySelector('[data-local-favorite-page-action]'),'Toplist registered action');await click('[data-local-favorite-page-action]');
  await until(()=>w08.acks.some(a=>a.identifier==='f8__1'&&a.status==='visibleAck'),'favorite Toplist DOM ACK');
  assert(api.location.pathname==='/data-hub/toplist'&&JSON.stringify({servers:w08.filters.servers,classes:w08.filters.classes,search:w08.filters.searchText,sort:w08.filters.sortBy})===filters,'favorite focus retains filters and route');
  const dashboardContext=JSON.stringify(pageContextStore.get('guild-dashboard'));
  pageContextStore.selectGuild('guild-analytics',null);
  await go('/data-hub/analytics');await click('[data-local-favorites-trigger]');await until(()=>!!document.querySelector('[data-local-favorite-page-action]'),'Analytics action');await click('[data-local-favorite-page-action]');await until(()=>pageContextStore.get('guild-analytics').guild?.guild.id===guild.id,'own analytics context');assert(JSON.stringify(pageContextStore.get('guild-dashboard'))===dashboardContext,'Analytics selection independent');
  const trackerLibrary=await import('../../../../src/pages/GuildHub/fightTrackingStore');
  const tracker=await trackerLibrary.createFightTracker({name:'W20 retained tracker',server:'F8',source:'manual',members:[{name:'Retained member',source:'manual',active:true}]});
  const trackerId=tracker.tracker!.id, storedTracker=JSON.stringify(await trackerLibrary.readFightTrackerStateById(trackerId));
  await go('/data-hub/guild-hub/fight-tracking');assert(api.location.pathname.endsWith('/fight-tracking'),'Fight Tracking correct route');
  await click('[data-local-favorites-trigger]');await until(()=>!!document.querySelector('[data-local-favorite-page-action]'),'Tracker action');
  await click('[data-local-favorite-page-action]');await until(()=>pageContextStore.get('fight-tracking').guild?.guild.id===guild.id,'own tracker proposal context');
  assert(JSON.stringify(await trackerLibrary.readFightTrackerStateById(trackerId))===storedTracker,'favorite context cannot assign/sync/change tracker slots');
  await click('[data-local-favorites-trigger]');await click('#local-favorites-dialog button[aria-label="Open Guild Overview: Fixture Guild"]');
  await until(()=>api.location.pathname.includes('/guild/f8/f8_net_g1/dashboard'),'tracker favorite viewing addresses Overview');
  assert(JSON.stringify(await trackerLibrary.readFightTrackerStateById(trackerId))===storedTracker,'viewing favorite preserves tracker');
  assert(w08.publicCalls===0&&api.publicCalls===0,'no public favorite/profile calls');
  proof.push('Canonical Toplist/Analytics return to Data Hub; menu Toplist focus retains filters with DOM ACK; Analytics action changes only its own context; Fight Tracking route retained');
  await go('/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard');await until(()=>!!document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]'),'addressed target for reload');
  return proof;
}
async function run(){
  for(const [old,target] of Object.entries(LEGACY_DATA_HUB_ROUTES)){await go(old+"?preserved=a%2Bb",{returnTo:"/data-hub",guildFeatureTarget:{feature:"guild-analytics",guild},guildFeatureTargetKey:"once-fixture"});await until(()=>api.location.pathname===target,old);assert(api.location.search==="?preserved=a%2Bb"&&api.location.state?.returnTo==="/data-hub","query/state preserved");}
  const before=pageContextStore.get("guild-analytics");pageContextStore.selectGuild("guild-dashboard",pageGuildReference({...guild,id:"other",guildId:"2",logoIdentifier:"f8_net_g2"}));await go("/guild-hub/dashboard?preserved=a%2Bb",{guildFeatureTarget:{feature:"guild-analytics",guild},guildFeatureTargetKey:"once-fixture"});await pause();assert(pageContextStore.get("guild-dashboard").guild?.guild.id==="other","redirect must not consume again");assert(before.targetKeys.includes("once-fixture"),"stable command consumed");
  results.push("All 16 production legacy registrations preserve query/state; aliases canonicalize once; consumed feature command is not replayed");
  await go("/guild-hub/unknown");await until(()=>!!document.querySelector('[data-missing]'),"unknown legacy path not migrated");
  pageContextStore.selectGuild('guild-hub',pageGuildReference(guild));pageContextStore.selectGuild('guild-analytics',pageGuildReference({...guild,id:'other',guildId:'2',logoIdentifier:'f8_net_g2'}));await go('/data-hub/guild-hub');
  await click('a[href="#/data-hub/analytics"]');await until(()=>pageContextStore.get('guild-analytics').guild?.guild.id===guild.id,"productive targeted analytics consumer");assert(pageContextStore.get('guild-dashboard').guild?.guild.id==='other',"targeted analytics leaves dashboard context intact");
  results.push('Productive Guild Hub analytics action sends one recipient feature target; actual Analytics consumes it without changing Dashboard context');
  await go("/data-hub");await until(()=>!!document.querySelector('a[href="#/data-hub/player-hub"]'),"Player Hub real link");const favoritesBefore=JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);const globalBefore=writeLog.filter(x=>x==="guild-selection").length;
  await click('[data-local-favorites-trigger]');await click('#local-favorites-dialog button[aria-label="Open Guild Overview: Fixture Guild"]');await until(()=>!!document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]'),"addressed guild favorite");
  assert(api.location.pathname.includes('/guild/f8/f8_net_g1/dashboard'),"guild favorite address matches selected guild");
  await click('[data-guild-overview-return]');await until(()=>api.location.pathname==='/data-hub',"guild safe return");
  results.push("Real guild favorite opens addressed local Dashboard and safe return without favorite/global writes");
  await click('[data-local-favorites-trigger]');await click('#local-favorites-dialog [data-player-favorite-card] > button:last-child');await profile();assert(!dialog(),"favorite is page");assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===favoritesBefore,"navigation has no favorite write");assert(writeLog.filter(x=>x==="guild-selection").length===globalBefore,"no global write");await click('.local-profile-route-actions button');await until(()=>api.location.pathname==="/data-hub","favorite return");
  results.push("Real Data Hub favorite links open local entities without autosave/global selection; safe page return");
  pageContextStore.selectGuild("guild-dashboard",pageGuildReference(guild));await go("/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard");await until(()=>document.querySelector('[title="Current Player 1"]')!=null||document.body.innerText.includes("Current Player 1"),"dashboard ready");
  const member=[...document.querySelectorAll<HTMLElement>('button')].find(e=>e.textContent?.includes("Current Player 1")||e.getAttribute('aria-label')?.includes("Current Player 1"));assert(member,"dashboard member");
  await pause();const costStart=costEvents.length;setCostPhase("prepared-open");api.reads=[];api.cores=[];api.builds=[];await click('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]');await profile();assert(!!dialog()&&api.location.pathname.includes("player-hub/player"),"dashboard URL overlay");api.measurements.preparedDashboard={reads:[...api.reads],cores:[...api.cores],builds:[...api.builds]};assert(api.reads.filter(x=>x.startsWith("entry:")).length===0,"prepared no entry raw");const preparedCosts=scopedCosts(costEvents.slice(costStart));api.measurements.preparedAttribution={...preparedCosts,legacyGlobalCores:api.cores.length};assert(preparedCosts.unresolved.length===0,"every prepared-window main call attributed");assert(preparedCosts.raw===0,"prepared no current raw");assert(preparedCosts.core===0,"prepared no current normalization");setCostPhase("after-prepared");const detail=api.location.pathname+api.location.search;
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
  setRole("user");await pause();assert(!document.querySelector('a[href="#/data-hub"]'),"admin-only sidebar");await go("/data-hub");assert(!!document.querySelector('[data-dashboard-search]')&&!document.querySelector('[data-hub-favorites]'),"entry ungated, no favorite block");setRole("guest");await go(detail);await until(()=>!!document.querySelector('[data-login]'),"detail auth");assert(sessionStorage.getItem('sfh:authNext')===detail,"auth query retained");setRole("user");await profile();assert(api.location.pathname===detail.split('?')[0],"auth returns local detail");
  results.push("Production FeatureGate/RootLayout auth: user access, admin-only Data Hub Sidebar, ungated entry, exact detail return query");
  await go("/filter-probe");await until(()=>api.filterScope==='public',"public provider mounted");assert(api.filters.searchText==="public-seed","public filter namespace preserved");api.filters.setSearchText("public-after");await pause();assert(JSON.parse(localStorage.getItem('TL_FILTERS_V2')!).searchText==="public-after","public writes own key");assert(JSON.parse(localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1')!).searchText!=="public-after","local independent");results.push("Actual public/local FilterProviders restore and write independent keys; old source preserved");
  const publicStored=localStorage.getItem('TL_FILTERS_V2')!,localStored=localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1')!;
  localStorage.removeItem('SFH_LOCAL_TL_FILTERS_V1');await go('/local-filter-probe');await until(()=>api.filterScope==='local',"local provider mounted");await until(()=>api.filters.searchText==='public-after',"validated first cutover");assert(localStorage.getItem('TL_FILTERS_V2')===publicStored,"migration source preserved");
  await go('/filter-probe');await until(()=>api.filterScope==='public',"public provider mounted");localStorage.setItem('TL_FILTERS_V2','{broken');localStorage.removeItem('SFH_LOCAL_TL_FILTERS_V1');await go('/local-filter-probe');await until(()=>api.filterScope==='local',"local provider mounted");await pause();assert(localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1')===null,"failed restore no empty initial write");assert(localStorage.getItem('TL_FILTERS_V2')==='{broken',"failed source preserved");
  flushSync(()=>api.filters.setSearchText('explicit-retry'));await until(()=>localStorage.getItem('SFH_LOCAL_TL_FILTERS_V1')?.includes('explicit-retry')===true,"later explicit local write");localStorage.setItem('TL_FILTERS_V2',publicStored);localStorage.setItem('SFH_LOCAL_TL_FILTERS_V1',localStored);
  results.push("Real local filter first cutover validates and copies once; malformed legacy restore writes no empty default; later user write stays local");
  await go("/origin");await until(()=>!!document.querySelector('[data-seeded-open]'),"live origin mounted");flushSync(()=>api.openExact("f8_net_p1","F8",api.source,time,"f8_net_p1"));await profile();const gatedDetail=api.location.pathname+api.location.search;setRole('guest');await until(()=>!!document.querySelector('[data-login]'),"live background cannot bypass target auth");assert(sessionStorage.getItem('sfh:authNext')===gatedDetail,"overlay auth retains actual detail query");setRole('user');await profile();assert(!dialog(),"auth reentry without live origin is a page");
  storeRules(true);gateKey++;render();await until(()=>api.location.pathname==='/',"hidden feature target denied");await go('/data-hub');await until(()=>!!document.querySelector('[data-dashboard-search]')&&!document.querySelector('[data-hub-favorites]'),"entry remains ungated with hidden local feature");storeRules();gateKey++;render();
  results.push("Real live overlay target enforces auth; hidden existing local gate denies detail while Data Hub entry remains ungated");
  await go("/origin");await until(()=>!!document.querySelector('[data-seeded-open]'),"live origin mounted"); let release!:()=>void; api.gate=new Promise<void>(r=>release=r);api.gateSource=api.oldSource;api.gateHeld=false;
  const historyBefore=history.length;
  flushSync(()=>api.openExact("f8_net_p1","F8",api.oldSource,historical,"f8_net_p1"));await until(()=>api.gateHeld,"slow A held");
  flushSync(()=>api.openExact("f8_net_p2","F8",api.source,time,"f8_net_p2"));await profile("Current Player 2");const raceEnds=api.requestEnds;api.gate=undefined;release();await until(()=>api.requestEnds>raceEnds,"old routed A finishes");
  assert(hero().includes("Current Player 2"),"slow A cannot overwrite B");assert(history.length===historyBefore+1,"profile switch adds one entry only");await click('.profile-overlay__close--local');await closed();
  api.gate=new Promise<void>(r=>release=r);api.gateSource=api.oldSource;api.gateHeld=false;
  flushSync(()=>api.openExact("f8_net_p1","F8",api.oldSource,historical,"f8_net_p1"));await until(()=>api.gateHeld,"close during resolution");await click('.local-profile-route-actions button');await closed();const closeEnds=api.requestEnds;api.gate=undefined;release();await until(()=>api.requestEnds>closeEnds,"closed routed resolution finishes");assert(!dialog(),"late resolution cannot reopen");
  results.push("Routed A-slow/B-fast and Close during resolution discard stale work; profile switches retain one history entry");
  api.setScan(true);flushSync(()=>api.openExact("f8_net_p1","F8",api.source,time,"f8_net_p1"));await profile();
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await closed();assert(!!document.querySelector('[aria-label="Datenverwaltung schließen"]'),"profile above scan: Escape keeps scan");
  await back();await until(()=>!document.querySelector('[aria-label="Datenverwaltung schließen"]'),"underlying scan back");
  results.push("Profile above ScanManagement: Escape and subsequent Back close the responsible top layer once");
  await costCases();setCostPhase("after-cost-cases");
  await go(historicalLink);await profile("Historical Player 1");assert(!dialog(),"historical direct page");api.measurements.historicalLink=historicalLink;api.measurements.detail=detail;setCostPhase("after-main");
  return results;
}
async function costCases(){
  setCostPhase("case-preparation");
  const payload={players:[...raw(historical).players,...raw(time).players].map(p=>({...p,name:`Guard ${p.timestamp===time?'Current':'Historical'} ${p.identifier}`,xpTotal:p.timestamp/1000,baseMain:100,conBase:100})),groups:[...raw(historical).groups,...raw(time).groups]};
  const imported=await scans.importGuildHubLocalScan("w15-guards.json",JSON.stringify(payload));
  const source=imported.scan.id;
  async function prepared(){
    setCostPhase("case-preparation");const scan=(await scans.getGuildHubLocalScan(source))!;
    const dependencies=await captureLocalDataDependencies({sourceIds:[source]});
    const coreLookup=new Map((scan.rawData as typeof payload).players.map(p=>[p,normalizeSfPlayerCharacterCore(p)]));
    return createLocalPlayerCurrentSeed({scan,dependencies,coreLookup},{sourceScanId:source,sourcePlayerKey:"f8_net_p1",sourceMemberRef:"f8_net_p1",scannedAtMs:time,scannedAtIso:new Date(time).toISOString(),guild:{name:"Fixture Guild",server:"F8",identifier:"f8_net_g1"}})!;
  }
  const samples:unknown[]=[];
  for(const kind of ["valid","invalidated","missing-core","deleted"] as const){
    const seed=await prepared();assert(await isLocalPlayerCurrentSeedValid(seed,seed),"case initially valid");
    if(kind==="invalidated")await scans.updateGuildHubLocalScan(source,"w15-guards-refresh.json",JSON.stringify(payload));
    if(kind==="missing-core"){delete seed.normalizedCore;seed.coreLookup?.delete(seed.rawPlayer);}
    if(kind==="deleted")await scans.deleteGuildHubLocalScans([source]);
    const valid=await isLocalPlayerCurrentSeedValid(seed,seed);
    assert(valid===(kind==="valid"||kind==="missing-core"),"validity independently checked before opening");
    await go("/origin");await until(()=>!!document.querySelector('[data-seeded-open]'),"case productive sender mounted");
    const start=costEvents.length,parts=api.currentParts.length;setCostPhase(kind);api.testSeed=seed;
    let release!:()=>void;api.ranksHeld=false;api.ranksGate=new Promise<void>(r=>release=r);
    await click('[data-seeded-open]');
    if(kind==="deleted")await until(()=>Boolean(document.querySelector('.profile-overlay--local [role="alert"]')),"deleted prepared target missing");
    else{await profile("Guard Current f8_net_p1");await until(()=>api.currentParts.slice(parts).some(p=>p.area==="currentInsights"&&p.status==="ready"),"actual Current and Insights ready before history release");}
    const sample=scopedCosts(costEvents.slice(start));
    assert(sample.unresolved.length===0,"no unassigned case costs");
    assert(sample.raw===(kind==="invalidated"||kind==="deleted"?1:0),"case exact current raw count");
    assert(sample.core===(kind==="valid"||kind==="deleted"?0:kind==="missing-core"?1:2),"case exact current core count including guild average");
    assert(new URLSearchParams(api.location.search).get("source")===source&&new URLSearchParams(api.location.search).get("at")===String(time),"fallback/missing never changes selected observation");
    samples.push({kind,validBeforeOpen:valid,seedGeneration:seed.validity.sourceGeneration,...sample});
    if(kind!=="deleted")await until(()=>api.ranksHeld,"optional rank history really waits after Current readiness");
    setCostPhase(kind+"-history-release");api.ranksGate=undefined;release();
    if(kind!=="deleted")await until(()=>api.currentParts.slice(parts).some(p=>p.area==="bests"),"controlled history completion after Current proof");
    if(kind!=="deleted"){const history=costEvents.slice(start).filter(e=>e.owner==="history-ranks");assert(history.some(e=>e.kind==="raw"&&e.source===source),"same physical multi-time source is read independently for historical ranks");assert(history.some(e=>e.kind==="core"&&e.at===historical)&&history.some(e=>e.kind==="core"&&e.at===time),"individual history row times classified, not only source ID");(samples.at(-1) as any).history=history;}
    await click('.profile-overlay__close--local, .local-profile-route-actions button');await closed();
  }
  api.measurements.costCases=samples;
  results.push("Valid prepared Current 0/0; same-content source-generation fallback 1/2; missing-core 0/1; deleted anchor 1/0, real routed Current before controlled history");
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
  const legacyDb=await openDB('sfdatahub-guild-hub',2,{upgrade(db){if(!db.objectStoreNames.contains('state'))db.createObjectStore('state',{keyPath:'key'});}});
  await legacyDb.put('state',{key:'guild-selection',value:{selectedGuilds:[guild],activeGuildId:guild.id},updatedAt:'W20 old selection fixture'});legacyDb.close();
  await hubFavoritesStore.refresh();await hubFavoritesStore.mutate({type:'save',favorite:guildFavorite(guild,0,null,false)});
  const p=await resolveLocalProfileEntry({entity:parseLocalEntity('player','F8','f8_net_p1')!,observation:{kind:'exact',anchor:{source:api.source,at:time}}});await hubFavoritesStore.mutate({type:'save',favorite:localPlayerFavorite(p)!});
  pageContextStore.selectServers(['F8']);pageContextStore.selectGuild('guild-dashboard',pageGuildReference(guild));
  sessionStorage.setItem('w12-seeded','1');api.reads=[];api.cores=[];api.builds=[];
}
await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:{en:{translation:en}},interpolation:{escapeValue:false}});
if(!sessionStorage.getItem('w12-seeded'))await seed();
root=createRoot(document.getElementById('root')!);render();api.ready=true;
