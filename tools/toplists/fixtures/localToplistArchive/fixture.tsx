import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../../../src/i18n/en.json";
import Toplist from "../../../../src/pages/DataHub/Toplist";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
import * as scans from "../../../../src/lib/guilds/localScanLibrary";
import { loadLocalToplistArchiveContext } from "../../../../src/pages/DataHub/localToplistPageModel";
import { loadScanArchiveSearchIndexSet } from "../../../../src/lib/scanArchive/searchIndexService";
import { acquireExplicitLocalFirstArchiveScans } from "../../../../src/lib/scanArchive/localFirstScanAcquisition";
import { isToplistRowVisible } from "../../../../src/pages/Toplists/useToplistRowFocus";
import { openDB } from "idb";
import type { HubToplistCommand } from "../../../../src/lib/data-hub/hubTargetResolver";
import "../../../../src/styles/base.css";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
const errors: string[] = [];
window.addEventListener("unhandledrejection", e => errors.push(String(e.reason)));
const api: any = { ready: false, loads: [], acks: [], publicCalls: 0, messages: [], localSearchReads: 0, run, visual, actualArtifacts, costs: [], errors };
(globalThis as any).w26 = api; (globalThis as any).w08 = api;
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  postMessage(message: any, transfer: Transferable[] | StructuredSerializeOptions = []) {
    api.messages.push({ type: message.type, entry: message.entry?.id, time: performance.now() });
    Array.isArray(transfer) ? super.postMessage(message, transfer) : super.postMessage(message, transfer);
  }
};
let root: Root | undefined;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function until(check: () => boolean, message: string, timeout = 20000) {
  const end = Date.now() + timeout;
  while (!check()) { if (Date.now() > end) throw Error(message + ': ' + document.body.innerText.slice(-1300)); await act(async () => { await frame(); }); }
}
async function click(el: Element | null) { assert(el, "control required"); await act(async () => (el as HTMLElement).click()); }
async function query(text: string) {
  await act(async () => api.filters.setSearchText(text));
  const input = document.getElementById("guild-hub-local-toplist-search") as HTMLInputElement;
  await act(async () => { input.blur(); input.focus(); });
  await until(() => [...document.querySelectorAll('#guild-hub-local-toplist-search-results button')].some(b => b.textContent?.includes(text)), "archive query " + text);
  return [...document.querySelectorAll('#guild-hub-local-toplist-search-results button')].find(b => b.textContent?.includes(text)) as HTMLButtonElement;
}
async function mount(servers: string[], hubToplistTarget?: HubToplistCommand) {
  if (root) await act(async () => root!.unmount());
  pageContextStore.selectServers(servers);
  root = createRoot(document.getElementById("root")!);
  await act(async () => root!.render(<MemoryRouter initialEntries={[{ pathname: '/data-hub/toplist', state: { hubToplistTarget } }]}><Toplist /></MemoryRouter>));
  await until(() => !!api.filters, "Toplist parent");
}
const scope = () => pageContextStore.get("local-toplist").servers ?? [];
const mark = () => ({ messages: api.messages.length, localSearchReads: api.localSearchReads, loads: api.loads.length });
const delta = (before: ReturnType<typeof mark>) => ({ workerMessages: api.messages.slice(before.messages), localSearchReads: api.localSearchReads-before.localSearchReads, datasets: api.loads.length-before.loads });
async function run() {
  const results: string[] = [];
  await i18n.use(initReactI18next).init({ lng: "en", fallbackLng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  await fetch('/w26/phase?value=seed-index');
  const context = await loadLocalToplistArchiveContext();
  const old = await loadScanArchiveSearchIndexSet(context.entries); assert(old.failedIndexes.length===0,"old sidecars stored through real workers");
  assert(old.searchSet.search('Archive Player').every(h=>!h.appearance),'legacy format has no images');
  await fetch('/w26/phase?value=seed-raw');
  await acquireExplicitLocalFirstArchiveScans([context.entries.find(e=>e.server==='f8_net')!]);
  await scans.importGuildHubLocalScan('own-only.json',JSON.stringify({players:[{identifier:'s2_eu_p9',prefix:'s2_eu',timestamp:Date.UTC(2026,9,6),name:'Private Only Sentinel',class:1}],groups:[]}));
  const db=await openDB('sfdatahub-local-data');const raws=await db.getAll('scans');const rawBefore=raws.map((s:any)=>[s.id,s.contentHash]);db.close();
  await mount([]);
  await fetch('/w26/phase?value=empty-search');
  const before=mark(); await query('Archive Player');
  assert(scope().length===0,'empty scope remains empty before selection');
  assert(document.querySelectorAll('#guild-hub-local-toplist-search-results [data-search-portrait-fallback]').length===3,'legacy players all searchable with placeholders');
  await query('Archive Guild');assert(document.querySelectorAll('#guild-hub-local-toplist-search-results [data-search-coa-fallback]').length===3,'guilds from all servers with empty scope');
  await act(async()=>api.filters.setSearchText('Private Only Sentinel'));
  await until(()=>document.getElementById('guild-hub-local-toplist-search-results')?.textContent?.includes('No archive matches.')===true,'own imports excluded');
  const emptyCost=delta(before); assert(emptyCost.datasets===0 && !emptyCost.workerMessages.some((m:any)=>['download','derive-toplists'].includes(m.type)),'no raw acquisition or derivation for empty-scope search');assert(emptyCost.localSearchReads===0,'no own inventory/projection reads');api.costs.push({phase:'empty-search',...emptyCost});
  results.push('Empty scope finds archive players and guilds across three servers, legacy placeholders, own-only import excluded, no raw/table/local search preparation');
  await mount(['F8']);await until(()=>api.loads.at(-1)?.result.playerRows.length===2,'existing F8 table settles');
  await fetch('/w26/phase?value=one-server-search');const oneBefore=mark();const foreign=await query('Archive Player EU1');const oneCost=delta(oneBefore);assert(!oneCost.workerMessages.some((m:any)=>['download','derive-toplists'].includes(m.type)),'foreign hit display no raw or derivation');api.costs.push({phase:'one-server-search',...oneCost});
  await fetch('/w26/phase?value=foreign-selection');const actionBefore=mark(); await click(foreign);
  await until(()=>!!document.querySelector('[data-toplist-target-status="visibleAck"]'),'foreign server real DOM ACK');
  assert(JSON.stringify(scope())===JSON.stringify(['EU1','F8']),'foreign target adds exactly EU1 and preserves F8');
  const row=document.querySelector<HTMLElement>('[data-sfh-identifier="s1_eu_p1"]');assert(row&&isToplistRowVisible(row)&&row.className.includes('--focused'),'actual marked visible row');api.costs.push({phase:'foreign-selection',...delta(actionBefore)});
  await click(await query('Archive Player EU1'));await until(()=>!!document.querySelector('[data-toplist-target-status="visibleAck"]'),'same server target');assert(scope().length===2,'no duplicate');
  await act(async()=>api.filters.setClasses(['mage']));await click(await query('Archive Player EU1'));await until(()=>!!document.querySelector('[data-toplist-target-status="hiddenByFilters"]'),'filter blocker');assert(api.filters.classes.includes('mage'),'filter not cleared');
  await act(async()=>{api.filters.setClasses([]);api.filters.setSearchText('');});
  await fetch('/w26/phase?value=named-selection');
  await fetch('/w26/hold?kind=raw');
  const staleAck=api.acks.length;
  await query('Archive Guild Named');
  await click([...document.querySelectorAll('#guild-hub-local-toplist-search-results button')].find(b=>b.querySelector('[data-search-artwork="guild"]')&&b.textContent?.includes('Archive Guild Named'))??null);
  let held=false;for(let i=0;i<100&&!held;i++){held=await fetch('/w26/held').then(r=>r.json());await act(async()=>{await frame();});}assert(held,'actual foreign Raw transport held');
  await act(async()=>api.filters.setSearchText(''));await fetch('/w26/release');
  await until(()=>api.loads.at(-1)?.result.readySelections.length===3,'held target dataset ready');
  assert(api.acks.length===staleAck&&!document.querySelector('[data-toplist-target-status]'),'query clear cancels late target completion');
  await query('Archive Guild Named');await click([...document.querySelectorAll('#guild-hub-local-toplist-search-results button')].find(b=>b.querySelector('[data-search-artwork="guild"]')&&b.textContent?.includes('Archive Guild Named'))??null);
  await until(()=>!!document.querySelector('[data-toplist-target-status="visibleAck"]'),'named guild real ACK');assert(scope().includes('STUMBLESTEPPE'),'registry named alias');
  results.push('Foreign player adds one server, preserves previous scope, real row highlight/scroll/DOM ACK; repeat no duplicate; class blocker; named guild alias');
  // Update the manifest at the same address and mount the actual consumer again.
  await fetch('/w26/update',{method:'POST'});
  await fetch('/w26/phase?value=cold-updated-search');
  const coldBefore=mark();await mount([]);await query('Archive Player');api.costs.push({phase:'cold-updated-search',...delta(coldBefore)});
  const current=await loadLocalToplistArchiveContext();const caches=await scans.listSfDataHubArchiveSearchIndexCacheRecords();
  for(const e of current.entries) assert(caches.some(c=>c.archiveScanId===e.id&&c.searchIndexSha256===e.searchIndex?.sha256&&c.payload.schemaVersion===2),'fresh manifest automatically acquires new sidecar');
  const afterDb=await openDB('sfdatahub-local-data');const rawAfter=(await afterDb.getAll('scans')).map((s:any)=>[s.id,s.contentHash]);afterDb.close();
  assert(rawBefore.every(pair=>rawAfter.some(p=>JSON.stringify(p)===JSON.stringify(pair))),'all previously stored Raw retained');
  api.cache={old:context.entries.map(e=>e.searchIndex?.sha256),new:current.entries.map(e=>e.searchIndex?.sha256),rawBefore,rawAfter};
  await until(()=>document.querySelectorAll('canvas.avatar-portrait__canvas').length===3,'real PortraitMaker ready');
  results.push('Browser IndexedDB old sidecars automatically replaced by schema 2 after same-address manifest update; old Raw retained');
  await fetch('/w26/phase?value=integrity-checks');
  const good=current.entries[0];
  const integrity=await loadScanArchiveSearchIndexSet([good,{...current.entries[1],searchIndex:{...current.entries[1].searchIndex!,sha256:'0'.repeat(64)}}]);
  assert(integrity.status==='partial'&&integrity.failedIndexes[0].errorCode==='hash-or-size-error','real worker hash mismatch partial set');
  const wrongSource=await loadScanArchiveSearchIndexSet([{...good,sha256:'0'.repeat(64)}]);assert(wrongSource.failedIndexes[0].errorCode==='server-or-timestamp-mismatch','real worker source mismatch');
  await fetch('/w26/phase?value=partial-retry');
  await fetch('/w26/corrupt');await mount([]);await query('Archive Player');
  assert(document.getElementById('guild-hub-local-toplist-search-results')?.textContent?.includes('Archive search incomplete'),'parent partial coverage honest even with hits');
  assert(!document.getElementById('guild-hub-local-toplist-search-results')?.textContent?.includes('Archive Player Named'),'damaged index not searched');
  await fetch('/w26/recover');await click([...document.querySelectorAll('#guild-hub-local-toplist-search-results button')].find(b=>b.textContent==='Retry')??null);
  await until(()=>document.getElementById('guild-hub-local-toplist-search-results')?.textContent?.includes('Archive Player Named')===true,'parent retry acquires repaired sidecar');
  results.push('Actual worker hash/source mismatch and partial set; parent partial notice alongside hits and Retry repair');
  await fetch('/w26/phase?value=late-index-check');
  await fetch('/w26/hold?kind=index');await mount([]);
  await act(async()=>api.filters.setSearchText('Archive Player Named'));document.getElementById('guild-hub-local-toplist-search')?.focus();
  let heldIndex=false;for(let i=0;i<100&&!heldIndex;i++){heldIndex=await fetch('/w26/held').then(r=>r.json());await act(async()=>{await frame();});}assert(heldIndex,'actual search worker transport held');
  await act(async()=>api.filters.setSearchText(''));await fetch('/w26/release');await act(async()=>{await frame();await frame();});
  assert(!document.getElementById('guild-hub-local-toplist-search-results'),'late index response after Clear does not reopen results');
  await query('Archive Player EU1');assert(!document.getElementById('guild-hub-local-toplist-search-results')?.textContent?.includes('Archive Player Named'),'latest input owns search response');
  results.push('Held real Raw completion after query Clear cannot ACK old target; late sidecar after Clear/new input cannot replace current results');
  // Current vs displayed Compare target month remains September-only.
  await fetch('/w26/phase?value=compare-preparation');
  await mount(['F8']);await until(()=>!!document.querySelector('[data-sfh-identifier]'),'F8 current');
  await click(document.querySelector('[data-proof="compare"]'));await click(document.querySelector('[data-proof="from"]'));await click(document.querySelector('[data-proof="to"]'));
  await until(()=>api.compareState?.status==='complete'&&!api.compareState.loading,'real Compare settles');
  await fetch('/w26/phase?value=compare-search');
  await query('September Only');
  await act(async()=>api.filters.setSearchText('Archive Player'));
  await until(()=>!document.getElementById('guild-hub-local-toplist-search-results')?.textContent?.includes('Loading...'),'Compare search completes');
  assert(!document.getElementById('guild-hub-local-toplist-search-results')?.textContent?.includes('Archive Player EU1'),'Current occurrence not mixed into September search');
  await fetch('/w26/phase?value=compare-selection');
  await click(await query('September Only EU1'));await until(()=>!!document.querySelector('[data-toplist-target-status="visibleAck"]'),'Compare foreign selection');
  assert(scope().includes('F8')&&scope().includes('EU1'),'Compare retains scope');
  results.push('Actual monthly/Compare target-side search and foreign target ACK retain historical observation rules');
  await fetch('/w26/phase?value=single-month-preparation');
  await mount(['F8'], { version: 1, id: 'w26-single-month', kind: 'player', label: 'September Only F8', server: 'F8', identifiers: ['f8_net_p1'], month: '2026-09' });
  await until(()=>!!document.querySelector('[data-toplist-target-status="visibleAck"]'),'explicit September command ACK');
  await fetch('/w26/phase?value=single-month-search');
  await click(await query('September Only EU1'));
  await until(()=>!!document.querySelector('[data-toplist-target-status="visibleAck"]'),'single-month foreign selection ACK');
  assert(scope().includes('F8')&&scope().includes('EU1'),'single-month server addition preserves existing scope');
  assert(api.loads.at(-1)?.result.playerRows.some((r:any)=>r.name==='September Only EU1')&&!api.loads.at(-1)?.result.playerRows.some((r:any)=>r.name==='Archive Player EU1'),'search selection preserves exact September rows');
  results.push('Explicit single-month scope retains September after foreign server addition, with actual historical row and DOM ACK');
  assert(api.publicCalls===0&&errors.length===0,'no public fallbacks/unhandled rejections');
  api.results=results;await visual();return {results,costs:api.costs,cache:api.cache,errors};
}
async function visual(){await fetch('/w26/phase?value=visual-warm');await mount([]);await query('Archive');return true;}
api.ready=true;

/** Connect the retained legacy cache to actual, independently verified W26
 * sidecars taken from the local archive, through the actual Toplist parent. */
async function actualArtifacts() {
  await act(async()=>api.filters.setSearchText(''));
  await fetch('/w26/actual-old');
  const setup=await fetch('/w26/actual-setup').then(r=>r.json());
  await mount([]);
  const oldContext=await loadLocalToplistArchiveContext();
  const original=oldContext.entries.find(e=>e.id===setup.scan.id)!;
  const seed=await loadScanArchiveSearchIndexSet([original]);assert(seed.failedIndexes.length===0,'actual old sidecar validated and saved');
  const db=await openDB('sfdatahub-local-data');const before=(await db.getAll('scans')).map((s:any)=>[s.id,s.contentHash]);db.close();
  const input=()=>document.getElementById('guild-hub-local-toplist-search') as HTMLInputElement;
  const target=()=>document.querySelector<HTMLElement>(`[data-toplist-search-identifier="${setup.player.identifier}"]`);
  await act(async()=>{api.filters.setSearchText(setup.player.identifier);input().focus();});
  await until(()=>!!target(),'actual legacy archive entity');assert(!!target()?.querySelector('[data-search-portrait-fallback]'),'actual old sidecar placeholder');
  const oldCache=await scans.getSfDataHubArchiveSearchIndexCache(original);assert(oldCache?.payload.schemaVersion===1,'actual schema1 stored');
  await fetch('/w26/actual-new');const started=mark();await mount([]);
  await act(async()=>input().focus());await until(()=>!!target()?.querySelector('canvas'),'actual new sidecar images');
  const newContext=await loadLocalToplistArchiveContext();const updated=newContext.entries.find(e=>e.id===original.id)!;
  const nextCache=await scans.getSfDataHubArchiveSearchIndexCache(updated);assert(nextCache?.payload.schemaVersion===2,'actual updated schema2 stored');
  assert(updated.searchIndex?.sha256!==original.searchIndex?.sha256,'actual content hashes changed');
  await until(()=>{const c=target()?.querySelector('canvas');if(!c)return false;const data=c.getContext('2d')?.getImageData(0,0,c.width,c.height).data;return !!data?.some((v,i)=>i%4===3&&v>0);},'actual archive PortraitMaker pixels');
  const afterDb=await openDB('sfdatahub-local-data');const after=(await afterDb.getAll('scans')).map((s:any)=>[s.id,s.contentHash]);afterDb.close();
  assert(JSON.stringify(before)===JSON.stringify(after),'actual artifact renewal retains all Raw');
  const cost=delta(started);assert(cost.datasets===0&&!cost.workerMessages.some((m:any)=>['download','derive-toplists'].includes(m.type)),'actual archive images no Raw/table acquisition');
  return {archiveScanId:original.id,identifier:setup.player.identifier,oldRevision:setup.oldRevision,newRevision:setup.newRevision,
    oldHash:original.searchIndex?.sha256,newHash:updated.searchIndex?.sha256,oldSchema:oldCache?.payload.schemaVersion,newSchema:nextCache?.payload.schemaVersion,
    oldPlaceholder:true,newPortraitPixels:true,rawBefore:before,rawAfter:after,cost};
}
