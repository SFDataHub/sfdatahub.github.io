import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
import { hubFavoritesStore } from "../../../../src/lib/data-hub/hubFavoritesStore";
import { favoriteReference } from "../../../../src/lib/data-hub/hubFavoritesContract";
import { acquireExplicitLocalFirstArchiveScans } from "../../../../src/lib/scanArchive/localFirstScanAcquisition";
import { createSfDataHubLocalScanImportPreview, commitSfDataHubLocalScanPreview } from '../../../../src/lib/guilds/localScanLibrary';
import { createScanArchiveSourceMetadata } from '../../../../src/lib/scanArchive/client';
import { loadOrBuildLocalToplistSnapshots } from '../../../../src/lib/toplists/localToplistService';
import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";

const fullPlayers = String("__VALIDATION_FULL_PLAYERS__") === "true";
const api: any = { ready: true, documentId: crypto.randomUUID(), stand: "__VALIDATION_STAND__", messages: [], responses: [], workerURLs: [], downloads: [], errors: [], lookupIds: [], idb: [] };
(globalThis as any).w27Update = api;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25));
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
async function until(check: () => boolean, message: string) {
  for (let i = 0; i < 1600; i++) { if (check()) return; await pause(); }
  throw Error(`${message}: ${document.body.innerText.slice(-2000)}`);
}
const stamp = Date.UTC(2026, 9, 6);
const entry: ScanArchiveEntry = { id: "w27-validation-current", server: "f8_net", timestamp: stamp,
  timestampUtc: new Date(stamp).toISOString(), path: "controlled.json.gz", format: "sftools.raw.v1", compression: "gzip",
  sha256: "a".repeat(64), compressedBytes: 1, uncompressedBytes: 1, playerCount: 1005, groupCount: 1,
  archiveYear: 2026, manifestRevision: 1, manifestUrl: `${location.origin}/controlled-manifest.json`, fileUrl: `${location.origin}/controlled.json.gz` };
const secondEntry: ScanArchiveEntry = {...entry,id:'w30-unselected-existing',server:'f28_net',path:'existing.json.gz',fileUrl:location.origin+'/existing.json.gz',sha256:'b'.repeat(64),playerCount:1};
const secondRaw={players:[{identifier:'f28_net_p1',prefix:'f28_net',timestamp:stamp,name:'ExistingSource',guildIdentifier:'f28_net_g1',guildName:'Existing Guild',class:1,level:100,values:{Base:20000,'Base Strength':20000,'Base Constitution':500,Attribute:21000,Constitution:750}}],groups:[{identifier:'f28_net_g1',prefix:'f28_net',timestamp:stamp,name:'Existing Guild',rank:1,memberCount:1,avgLevel:100}]};
for(const method of ['get','getAll','getAllKeys'] as const){const original=IDBObjectStore.prototype[method] as (...args:any[])=>IDBRequest;(IDBObjectStore.prototype as any)[method]=function(...args:any[]){if(this.transaction.db.name==='sfdatahub-local-data')api.idb.push({method,store:this.name,key:typeof args[0]==='string'?args[0]:undefined});return original.apply(this,args);};}
const raw = { players: Array.from({ length: 1005 }, (_, i) => ({ identifier: `f8_net_p${i + 1}`, prefix: "f8_net", timestamp: stamp,
  name: i === 1004 ? "FarAway" : `Player${String(i).padStart(4, "0")}`, guildIdentifier: "f8_net_g1", guildName: "Validation Guild",
  class: 1, level: 100 + i, rank: i + 1,
  values: { Base: 10000 - i, "Base Strength": 10000 - i, "Base Constitution": 500, Attribute: 15000 - i, Constitution: 750 } })),
  groups: [{ identifier: "f8_net_g1", prefix: "f8_net", timestamp: stamp, name: "Validation Guild", rank: 1, memberCount: 1005, avgLevel: 500 }] };
api.context = { status: "complete", catalog: null, manifests: [{ schemaVersion: 1, archiveYear: 2026, revision: 1,
  updatedAt: new Date(stamp).toISOString(), scanCount: 2, serverCount: 2, scans: [entry,secondEntry],
  toplists: { schemaVersion: 1, current: { f8_net: entry.id, f28_net: secondEntry.id }, monthly: {} } }],
  manifestUrlsByYear: { 2026: entry.manifestUrl }, entries: [entry,secondEntry], selections: [], serverOptions: [], issues: [] };
api.acquire = (selected: ScanArchiveEntry[], options: any) => acquireExplicitLocalFirstArchiveScans(selected, {
  ...options, dependencies: { downloadArchiveEntry: async (requested: ScanArchiveEntry) => {
    api.downloads.push(requested.id); return { content: JSON.stringify(requested.id===secondEntry.id?secondRaw:raw) };
  } },
});
if (pageContextStore.get("local-toplist").servers === null) pageContextStore.selectServers(["F8"]);
const rule = { id: "main.guildHub", route: "/guild-hub", area: "main", status: "active", minRole: "guest" };
localStorage.setItem("sf_feature_access_snapshot", JSON.stringify({ byId: { "main.guildHub": rule }, byRoute: { "/guild-hub": rule } }));
localStorage.setItem("sf_feature_access_date", new Date().toISOString().slice(0, 10));
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    super(url, options); api.workerURLs.push(String(url));
    super.addEventListener("message", event => api.responses.push(structuredClone(event.data)));
  }
  postMessage(message: any, transfer: Transferable[] | StructuredSerializeOptions = []) {
    api.messages.push({ type: message.type, requestId: message.requestId, datasetId: message.datasetId,
      contentRevision: message.contentRevision, nameFilter: message.nameFilter });
    if (Array.isArray(transfer)) super.postMessage(message, transfer); else super.postMessage(message, transfer);
  }
};
window.addEventListener("unhandledrejection", event => api.errors.push(String(event.reason)));
const ids = () => [...document.querySelectorAll<HTMLElement>("[data-sfh-identifier]")].map(el => el.dataset.sfhIdentifier);
async function tableReady() {
  await until(() => api.responses.some((r: any) => r.ok && r.type === "view" && r.tab === "players") && ids().some(id => id?.startsWith("f8_net_p")) && !document.querySelector("[data-local-toplist-progress]"), "actual ready player table");
}
const click = (el: Element | undefined | null) => { assert(el, "missing control"); (el as HTMLElement).click(); };
api.old = async () => {
  await until(() => !!document.querySelector('button[role="tab"]'), "actual Toplist route");
  click([...document.querySelectorAll('button[role="tab"]')].find(el => el.textContent === "Players"));
  await tableReady();
  assert(api.responses.some((r:any)=>r.type==='view'&&r.totalRows===1005),'authentic pre-W30 full player cohort');
  // Prepare a normal, locally imported and derived, unselected source. Its
  // archiveSource allows reuse without a sidecar binding after the update.
  const preview=await createSfDataHubLocalScanImportPreview('existing.json',JSON.stringify(secondRaw),{archiveSource:createScanArchiveSourceMetadata(secondEntry)});
  await commitSfDataHubLocalScanPreview(preview);
  const prepared=await loadOrBuildLocalToplistSnapshots([secondEntry],{dependencies:{acquireEntries:api.acquire}});
  assert(prepared.status==='complete','old stand prepares existing source normally');
  await hubFavoritesStore.refresh();
  if (!hubFavoritesStore.getSnapshot().snapshot!.record.favorites.length) {
    const ref = favoriteReference("player", "f8_net_p1005")!;
    assert(await hubFavoritesStore.mutate({ type: "save", favorite: { id: "w27-validation-favorite", kind: "player", reference: ref,
      originalReferences: [ref], identityHint: null, referenceIssue: null, order: 0, recordRevision: 1,
      display: { name: "FarAway", server: "F8", observedAtMs: stamp } } }), "save actual local favorite");
  }
  return { stand: api.stand, documentId: api.documentId, workerURLs: api.workerURLs, oldNativeView: api.responses.findLast((r: any) => r.type === "view" && r.tab === "players"),
    count: ids().length, farAwayVisible: ids().includes("f8_net_p1005"), controller: navigator.serviceWorker.controller?.scriptURL ?? null };
};
api.filter = async () => {
  await until(()=>!!document.querySelector('button[role="tab"]'),'actual updated route');
  click([...document.querySelectorAll('button[role="tab"]')].find(el=>el.textContent==='Players'));
  await tableReady();
  const preservedBeforeActivation=await api.durable();
  api.lookupIds.length=0;api.idb.length=0;api.messages.length=0;
  const toggleExistingSource=async()=>{
    click(document.querySelector('button[aria-label^="Select servers"]'));
    await until(()=>!!document.querySelector('#sheet-serversearch'),'normal server picker');
    const input=document.querySelector<HTMLInputElement>('#sheet-serversearch')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'F28');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const chip=()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-pressed]')].find(el=>el.title.replace(/\s/g,'').toUpperCase()==='FUSION28');
    await until(()=>!!chip(),'existing source server chip');click(chip());
    click([...document.querySelectorAll('[role="dialog"] button')].find(el=>el.textContent==='Done'));
  };
  await toggleExistingSource();
  await until(()=>api.responses.some((r:any)=>r.type==='view'&&r.totalRows===1006)&&ids().includes('f28_net_p1')&&!document.querySelector('[data-local-toplist-progress]'),'newly selected existing source reused');
  assert(api.lookupIds.includes(secondEntry.id),'new lookup actually executed via normal acquisition');
  assert(api.idb.some((r:any)=>r.store==='scanSummaries'&&r.method==='getAll'),'metadata candidate enumeration');
  assert(api.idb.some((r:any)=>r.store==='scans'&&r.method==='get'),'targeted authoritative raw access');
  assert(!api.idb.some((r:any)=>r.store==='scans'&&r.method==='getAll'),'no full raw inventory after update');
  assert(api.downloads.length===0,'no reimport/download');
  assert(!api.messages.some((m:any)=>m.type==='derive-toplists'),'no derived rebuild');
  await toggleExistingSource();
  await until(()=>api.responses.at(-1)?.type==='view'&&api.responses.at(-1)?.totalRows===1005&&!document.querySelector('[data-local-toplist-progress]'),'selection restored through regular owner');
  return {stand:api.stand,documentId:api.documentId,lookupIds:api.lookupIds,idb:api.idb,workerURLs:api.workerURLs,downloads:api.downloads,controller:navigator.serviceWorker.controller?.scriptURL??null,preservedBeforeActivation};
};
const digest = async (text: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(v => v.toString(16).padStart(2, "0")).join("");
api.durable = async () => {
  const stores: any[] = [];
  for (const info of await indexedDB.databases()) {
    if (!info.name?.startsWith("sfdatahub-")) continue;
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(info.name!); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    for (const name of [...db.objectStoreNames]) {
      if (!["scans", "scanSummaries", "localToplistSnapshots", "archiveScanBindings", "state"].includes(name)) continue;
      const values = await new Promise<any[]>((resolve, reject) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const relevant = name === "state" ? values.filter(v => ["hub-favorites", "guild-selection-compatibility", "migration.hubFavorites.v1"].includes(v.key)) : values;
      stores.push({ database: info.name, store: name, records: await Promise.all(relevant.map(async value => ({ id: value.id ?? value.sourceScanId ?? value.key ?? value.cacheKey, hash: await digest(JSON.stringify(value)) }))) });
    }
    db.close();
  }
  return { stores, scope: pageContextStore.get("local-toplist").servers };
};
