import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "../../../../src/i18n/de.json";
import en from "../../../../src/i18n/en.json";
import "../../../../src/styles/index.css";
import DataHubIndex from "../../../../src/pages/DataHub/Index";
import {
  importGuildHubLocalScan, createGuildHubLocalScanImportPreview, commitGuildHubLocalScanPreview,
  bindGuildHubLocalScanToArchiveEntry, updateGuildHubLocalScan, deleteGuildHubLocalScans,
  confirmGuildHubArchiveReadiness, readDataHubLocalScanMetadata,
} from "../../../../src/lib/guilds/localScanLibrary";
import { commitLocalDataMutation } from "../../../../src/lib/local-data/localDataTransaction";
import type { LocalChangesSchema } from "../../../../src/lib/local-data/localDataChanges";
import { openDB } from "idb";
import { entry, content, catalog, manifest, deferred } from "./data";

type Costs = { metadataReads: number; rawReads: number; rawPoolReads: number; payloadValidations: number;
  normalizations: number; derivedBuilds: number; metadataSnapshots: number; archiveNetwork: number; rawNetwork: number; publications: number; kpiStarts: number; kpiDisposes: number; kpiSubscriptions: number; kpiUnsubscriptions: number;
  kpiMetadataReads: number; kpiDependencyReads: number; kpiArchiveLoads: number; kpiArchiveRequests: number; kpiConfirmations: number; readinessWrites: number; otherMetadataReads: number };
const costs: Costs = { metadataReads: 0, rawReads: 0, rawPoolReads: 0, payloadValidations: 0,
  normalizations: 0, derivedBuilds: 0, metadataSnapshots: 0, archiveNetwork: 0, rawNetwork: 0, publications: 0, kpiStarts: 0, kpiDisposes: 0, kpiSubscriptions: 0, kpiUnsubscriptions: 0,
  kpiMetadataReads: 0, kpiDependencyReads: 0, kpiArchiveLoads: 0, kpiArchiveRequests: 0, kpiConfirmations: 0, readinessWrites: 0, otherMetadataReads: 0 };
const evidence: Array<{ name: string; costs: Costs; values: string[] }> = [];
const errors: string[] = [];
window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
const cloneCosts = () => ({ ...costs });
const difference = (start: Costs): Costs => Object.fromEntries(Object.entries(costs).map(([key, value]) => [key, value - start[key as keyof Costs]])) as Costs;
const api: any = { costs, evidence, errors, ready: false, readinessInspect: (globalThis as any).w09ReadinessInspect };
(globalThis as any).w09 = api;
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
const wait = async (test: () => boolean, label: string) => {
  for (let i = 0; i < 1000; i++) { if (test()) return; await pause(); }
  throw Error(`timeout ${label}: ${document.body.innerText}`);
};
const a = entry("user"), twin = { ...a, id: "other-physical", sha256: "b".repeat(64), path: "other.json.gz", fileUrl: "https://inventory.test/2026/other.json.gz" };
const old = entry("archivefirst", 2025, "c");
const enrich = (e: typeof a) => ({ ...e, searchIndex: { schemaVersion: 1 as const, path: `${e.id}.search.json.gz`, sha256: "d".repeat(64), compressedBytes: 10, uncompressedBytes: 20, playerCount: 1, groupCount: 1 } });
let catalogGate = deferred<void>(), holdCatalog = true, offlineCatalog = false, badYear = false, mismatch = false;
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/data/scan-archive/catalog.json")) {
    costs.archiveNetwork++;
    if (holdCatalog) await catalogGate.promise;
    if (offlineCatalog) throw Error("controlled offline catalog");
    return Response.json(catalog);
  }
  if (url.startsWith("https://inventory.test/") && url.endsWith("manifest.json")) {
    costs.archiveNetwork++;
    if (url.includes("2025")) return badYear ? new Response("offline", { status: 503 }) : Response.json(manifest(2025, [enrich(old)]));
    const m = manifest(2026, [enrich(a), enrich(twin)].map(e => mismatch ? { ...e, playerCount: 2, searchIndex: { ...e.searchIndex, playerCount: 2 } } : e));
    return Response.json({ ...m, toplists: { schemaVersion: 1, current: { f8_net: a.id }, monthly: { "2026-09": { f8_net: a.id } } } });
  }
  if (url.startsWith("https://inventory.test/")) { costs.rawNetwork++; throw Error("dashboard must not download archive payloads"); }
  return nativeFetch(input, init);
};
const put = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function(value, ...args) { if (this.name === "archiveScanBindings" && value.readiness) costs.readinessWrites++; return put.call(this, value, ...args); };
const get = IDBObjectStore.prototype.get, getAll = IDBObjectStore.prototype.getAll, getAllKeys = IDBObjectStore.prototype.getAllKeys;
IDBObjectStore.prototype.get = function(query) { if (this.name === "scans") costs.rawReads++; else costs.metadataReads++; return get.call(this, query); };
IDBObjectStore.prototype.getAll = function(...args) { if (this.name === "scans") costs.rawPoolReads++; else costs.metadataReads++; return getAll.apply(this, args); };
IDBObjectStore.prototype.getAllKeys = function(...args) { costs.metadataReads++; return getAllKeys.apply(this, args); };

await i18n.use(initReactI18next).init({ lng: "de", fallbackLng: "en", resources: { de: { translation: de }, en: { translation: en } }, interpolation: { escapeValue: false } });
document.body.style.background = "#091529";
document.body.style.margin = "0";
const root = createRoot(document.getElementById("root")!);
let mountId = 0;
const mount = () => flushSync(() => root.render(<MemoryRouter key={++mountId} initialEntries={["/data-hub"]}><Routes>
  <Route path="/data-hub" element={<DataHubIndex />} />
  <Route path="*" element={<p id="navigation-destination">Existing destination</p>} />
</Routes></MemoryRouter>));
const unmount = () => flushSync(() => root.render(<div id="unmounted">Unmounted</div>));
const tiles = () => document.querySelector('[aria-label="Data-Hub-Bereiche"]')!;
const value = (key: string) => document.querySelector(`[data-inventory-kpi="${key}"]`)?.querySelector("h2 + p")?.textContent;
const values = () => ["available", "ready", "personal"].map(key => value(key) ?? "missing");
const settled = () => !document.querySelector('[data-inventory-kpi]')?.parentElement?.textContent?.includes("Wird geprüft");
const waitValues = async (available: string, ready: string, personal: string) => wait(() => values().join("|") === [available, ready, personal].join("|") && settled(), `values ${available}/${ready}/${personal}`);
const toggle = () => flushSync(() => document.querySelector<HTMLButtonElement>('[data-inventory-toggle]')!.click());
const retry = () => document.querySelector<HTMLButtonElement>(`#${CSS.escape(document.querySelector('[data-inventory-toggle]')!.getAttribute('aria-controls')!)} button`)!.click();
const assertClosedWork = (start: Costs, name: string) => {
  const change = difference(start);
  for (const key of ['kpiStarts', 'kpiMetadataReads', 'kpiDependencyReads', 'kpiArchiveLoads', 'kpiArchiveRequests', 'kpiConfirmations', 'readinessWrites', 'publications'] as const)
    assert(change[key] === 0, `${name}: ${key}=${change[key]}`);
  assert(costs.kpiSubscriptions === costs.kpiUnsubscriptions, `${name}: subscriptions released`);
  assert(!document.querySelector('[data-inventory-kpi]'), `${name}: no hidden KPI consumer`);
};
const snapshot = (name: string, start: Costs) => evidence.push({ name, costs: difference(start), values: values() });
const initialCosts = cloneCosts();
mount(); api.ready = true;

api.run = async () => {
  const results: string[] = [];
  await new Promise(resolve => setTimeout(resolve, 400));
  window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); await pause();
  assertClosedWork(initialCosts, 'dashboard before first icon click');
  snapshot('dashboard opening without inventory', initialCosts);
  const searchRect = document.querySelector('[data-hub-search]')!.getBoundingClientRect(), infoRect = document.querySelector('[data-inventory-toggle]')!.getBoundingClientRect();
  assert(searchRect.right <= infoRect.x && infoRect.width === 44 && searchRect.width > infoRect.width, 'wide search fills remaining width and info stays right');
  api.capture = { kind: 'wide-closed', viewport: innerWidth }; await wait(() => !api.capture, 'closed wide screenshot');
  results.push('real dashboard before first icon: zero KPI starts, dependency/metadata reads, archive requests, confirmations, writes; search/favorites remain mounted');
  const firstOpen = cloneCosts(); toggle();
  await wait(() => value("personal") === "0", "independent empty personal inventory");
  assert(value("available") === "—", "unknown loading archive must not be zero");
  assert(tiles().children.length === 4 && tiles().querySelectorAll("a").length === 5, "four navigation areas and five links remain during loading");
  results.push("loading/unknown archive and true empty personal zero; four unchanged navigation areas and five links");
  holdCatalog = false; catalogGate.resolve(); await waitValues("3", "0", "0");
  snapshot('first explicit inventory opening', firstOpen);
  assert(difference(firstOpen).kpiStarts === 1 && difference(firstOpen).kpiArchiveRequests === 3, 'first click activates actual catalog and both manifests');
  results.push("actual validated multi-year manifests; current/monthly references do not add files");
  const user = await importGuildHubLocalScan("personal.json", content(a)); await waitValues("3", "0", "1");
  await bindGuildHubLocalScanToArchiveEntry(a, user.scan.id);
  await bindGuildHubLocalScanToArchiveEntry(twin, user.scan.id); await waitValues("3", "2", "1");
  assert(document.body.innerText.includes("Die Zahlen werden nicht addiert"), "overlap is explicit");
  assert(!document.body.innerText.includes(user.scan.id) && !document.body.innerText.includes(a.sha256), "no internal keys/hashes in product");
  results.push("actual personal import, two physical bindings on one Raw and overlap without total");
  const archived = await commitGuildHubLocalScanPreview(await createGuildHubLocalScanImportPreview("archive.json", content(old)));
  await bindGuildHubLocalScanToArchiveEntry(old, archived.scan.id); await waitValues("3", "3", "1");
  const dup = await importGuildHubLocalScan("user-duplicate.json", content(old));
  assert(dup.status === "duplicate" && dup.scan.id === archived.scan.id && dup.scan.importedAt === archived.scan.importedAt && dup.scan.filename === archived.scan.filename, "archivefirst preserves actual source identity");
  await waitValues("3", "3", "2");
  await importGuildHubLocalScan("duplicate-again.json", content(old)); await waitValues("3", "3", "2");
  results.push("archivefirst personal duplicate, repeated duplicate stable counts and original identity/time/name");
  await updateGuildHubLocalScan(user.scan.id, "update.json", content(a, "Updated")); await waitValues("3", "1", "2");
  await deleteGuildHubLocalScans([archived.scan.id]); await waitValues("3", "0", "1");
  results.push("actual personal content update expires readiness; Rawdelete updates displayed counts");
  const db = await openDB("sfdatahub-local-data");
  const legacy = (await commitGuildHubLocalScanPreview(await createGuildHubLocalScanImportPreview("own-old-sftools.json", content(entry("legacy"))))).scan;
  const localDb = db as unknown as import("idb").IDBPDatabase<LocalChangesSchema & {
    scans: { key: string; value: any }; scanSummaries: { key: string; value: any }; archiveScanBindings: { key: string; value: any };
  }>;
  await commitLocalDataMutation(localDb, ["scans", "scanSummaries"], { owner: "sources", kinds: ["provenance"], sourceIds: [legacy.id], removedSourceIds: [], servers: ["f8_net"], unknownImpact: false }, async tx => {
    for (const name of ["scans", "scanSummaries"] as const) { const row = await tx.objectStore(name).get(legacy.id); delete row.provenance; await tx.objectStore(name).put(row); }
  });
  await wait(() => document.body.innerText.includes("unbekannter persönlicher Herkunft: 1"), "legacy unknown hint");
  assert(document.querySelector('[data-inventory-kpi="personal"]')?.textContent?.includes("Teilbestand"), "unknown origin cannot imply full personal inventory");
  results.push("legacy own/name/no annotation stays unknown with explicit partial personal status");

  await bindGuildHubLocalScanToArchiveEntry(a, user.scan.id); await bindGuildHubLocalScanToArchiveEntry(twin, user.scan.id); await waitValues("3", "2", "1");
  const proofGate = deferred<void>(); api.proofGate = proofGate.promise;
  const coldStart = cloneCosts();
  await commitLocalDataMutation(localDb, ["archiveScanBindings"], { owner: "sources", kinds: ["binding"], sourceIds: [user.scan.id], removedSourceIds: [], servers: ["f8_net"], unknownImpact: false }, async tx => {
    for (const row of await tx.objectStore("archiveScanBindings").getAll()) { delete row.readiness; await tx.objectStore("archiveScanBindings").put(row); }
  });
  await wait(() => document.body.innerText.includes("ungeprüfte lokale Archivkandidaten: 2"), "pending candidates separate from confirmed count");
  assert(value("ready") === "0" && tiles().querySelectorAll("a").length === 5, "pending checks preserve navigation");
  api.proofGate = undefined; proofGate.resolve(); await waitValues("3", "2", "1");
  snapshot("cold bound candidates", coldStart);
  const cold = difference(coldStart);
  assert(cold.rawReads === 1 && cold.payloadValidations === 2 && cold.normalizations === 0 && cold.derivedBuilds === 0 && cold.rawNetwork === 0 && cold.rawPoolReads === 0, `cold work ${JSON.stringify(cold)}`);
  results.push("targeted cold readiness: 1 Raw read, 2 validations, 0 normalization/build/download/fullpool");
  unmount(); const closedRemount = cloneCosts(); mount(); await new Promise(resolve => setTimeout(resolve, 350)); assertClosedWork(closedRemount, 'closed remount'); snapshot('warm dashboard opening without inventory', closedRemount); const warmStart = cloneCosts(); toggle(); await waitValues("3", "2", "1");
  snapshot("warm explicit inventory reopen", warmStart);
  const warm = difference(warmStart);
  assert(warm.rawReads === 0 && warm.payloadValidations === 0 && warm.normalizations === 0 && warm.derivedBuilds === 0 && warm.rawPoolReads === 0 && warm.rawNetwork === 0, `warm work ${JSON.stringify(warm)}`);
  results.push("warm real inventory reopen reuses proof: zero payload read/validation/normalization/derivedbuild");

  // Hold real shared readiness, then release only this dashboard consumer.
  toggle(); const whileClosed = cloneCosts();
  const sharedGate = deferred<void>(); api.proofGate = sharedGate.promise; api.proofHeld = false;
  await commitLocalDataMutation(localDb, ["archiveScanBindings"], { owner: "sources", kinds: ["binding"], sourceIds: [user.scan.id], removedSourceIds: [], servers: ["f8_net"], unknownImpact: false }, async tx => {
    for (const row of await tx.objectStore("archiveScanBindings").getAll()) { delete row.readiness; await tx.objectStore("archiveScanBindings").put(row); }
  });
  await new Promise(resolve => setTimeout(resolve, 350)); assertClosedWork(whileClosed, 'binding change while closed');
  snapshot('closed binding change', whileClosed);
  toggle(); await wait(() => api.proofHeld && api.readinessInspect().consumers === 1, 'real held readiness');
  assert(value('ready') === '0', 'reopen never presents stale readiness as current');
  const peerProof = confirmGuildHubArchiveReadiness([a, twin], { expectedBindings: (await readDataHubLocalScanMetadata()).bindings });
  await wait(() => api.readinessInspect().consumers === 2, 'second real consumer joins');
  toggle(); assert(costs.kpiStarts === costs.kpiDisposes, 'closed controller disposed');
  assert(api.readinessInspect().consumers === 1, 'other consumer survives close');
  const closedPublication = costs.publications;
  api.proofGate = undefined; sharedGate.resolve(); assert((await peerProof).confirmed.length === 2, 'shared peer completes real proof');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert(costs.publications === closedPublication && !document.querySelector('[data-inventory-kpi]'), 'late proof cannot publish or reopen');
  const reused = cloneCosts(); toggle(); await waitValues('3', '2', '1'); snapshot('reopen after shared proof', reused);
  assert(difference(reused).rawReads === 0 && difference(reused).payloadValidations === 0, 'valid peer proof reused');
  results.push('closed mutation triggers zero KPI work; real shared proof survives close, no late publication, reopen reuses current evidence');

  // Durable commit without a live event: focus must catch up from journal.
  const tx = db.transaction(["scans", "scanSummaries", "localChanges"], "readwrite");
  for (const name of ["scans", "scanSummaries"] as const) {
    const row = await tx.objectStore(name).get(legacy.id);
    row.provenance = { version: 1, sourceId: legacy.id, contentHash: row.contentHash, role: "original", history: "unknown", personalImport: { observedAt: new Date().toISOString() } };
    await tx.objectStore(name).put(row);
  }
  await tx.objectStore("localChanges").add({ owner: "sources", kinds: ["provenance"], sourceIds: [legacy.id], removedSourceIds: [], servers: ["f8_net"], unknownImpact: false, committedAt: new Date().toISOString() }); await tx.done;
  window.dispatchEvent(new Event("focus")); await waitValues("3", "2", "2");
  results.push("missed provenance event caught up from durable journal on focus");
  toggle(); const missedWhileClosed = cloneCosts();
  await deleteGuildHubLocalScans([legacy.id]); await new Promise(resolve => setTimeout(resolve, 300));
  window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); await pause();
  assertClosedWork(missedWhileClosed, 'source deletion and focus while closed');
  snapshot('source deletion while closed', missedWhileClosed);
  toggle(); await waitValues('3', '2', '1');
  results.push('Raw deletion while closed: no KPI work, fresh next-open personal inventory');
  // Restore a proven source to preserve later original count assertions.
  await importGuildHubLocalScan('restored-personal.json', content(entry('restored'))); await waitValues('3', '2', '2');
  mismatch = true; retry(); await waitValues('3', '0', '2');
  assert(document.body.innerText.includes('Lokale Archivkandidaten ohne erfolgreiche Bestätigung: 2'), 'failed candidates remain explicit');
  mismatch = false; retry(); await waitValues('3', '2', '2');
  results.push('actual failed payload expectation is partial and reachable; retry recovers');
  badYear = true; retry(); await waitValues("2", "2", "2");
  assert(document.querySelector('[data-inventory-kpi="available"]')?.textContent?.includes("Teilbestand"), "partial archive status explicit");
  assert(!document.querySelector('[data-inventory-kpi="personal"]')?.textContent?.includes("Teilbestand"), "personal is independent of failed year");
  results.push("offline year leaves valid active subset and independently complete personal count");
  offlineCatalog = true; retry(); await wait(() => document.body.innerText.includes("Letzter bekannter Archivstand") && settled(), "last known offline");
  assert(value("available") === "2", "last known subset retained");
  offlineCatalog = false; badYear = false, mismatch = false; retry(); await waitValues("3", "2", "2");
  results.push("offline catalog explicitly last-known, retained date and successful retry");
  await i18n.changeLanguage("en"); await wait(() => document.body.innerText.includes("Own SFTools sources (proven)"), "English translation");
  await i18n.changeLanguage("de");
  api.capture = { kind: "wide", values: values(), widths: [...document.querySelectorAll('[data-inventory-kpi]')].map(node => node.getBoundingClientRect().width) };
  await wait(() => !api.capture, "wide screenshot");
  results.push("accessible live status, translated labels and wide layout");

  toggle(); offlineCatalog = true; toggle();
  await wait(() => settled() && document.querySelector('[data-inventory-kpi="available"]')?.textContent?.includes('Prüfung fehlgeschlagen') === true, 'unknown archive error on fresh open');
  assert(value('available') === '—', 'fresh unknown archive error is never complete zero');
  offlineCatalog = false; retry(); await waitValues('3', '2', '2');
  holdCatalog = true; catalogGate = deferred<void>(); retry(); await wait(() => !settled(), 'held close refresh');
  const oldCatalog = catalogGate; toggle(); const stopped = cloneCosts(); holdCatalog = false;
  await new Promise(resolve => setTimeout(resolve, 120)); assertClosedWork(stopped, 'closed pending archive request');
  toggle(); await waitValues('3', '2', '2');
  const newerPublications = costs.publications; oldCatalog.resolve(); await new Promise(resolve => setTimeout(resolve, 120));
  assert(costs.publications === newerPublications && values().join('|') === '3|2|2', 'old closed request cannot overwrite newer open job');
  results.push('close during held archive request: aborted owner, no late UI/reopen; fresh error remains unknown and retry recovers');
  holdCatalog = true; catalogGate = deferred<void>(); retry(); await wait(() => !settled(), "held refresh");
  (tiles().querySelector('a[href="/data-hub/analytics"]') as HTMLAnchorElement).click();
  await wait(() => Boolean(document.getElementById("navigation-destination")), "actual existing Link navigates and unmounts");
  const publicationBefore = costs.publications;
  holdCatalog = false; catalogGate.resolve(); await new Promise(resolve => setTimeout(resolve, 100));
  assert(costs.publications === publicationBefore, "no late UI publications after actual dashboard unmount");
  assert(errors.length === 0, `unhandled errors: ${errors}`);
  results.push("real navigation remains operable during held request; no late publications after unmount");
  db.close(); api.results = results; return results;
};
api.runNarrow = async () => {
  mount();
  const search = document.querySelector('[data-hub-search]')!;
  const button = document.querySelector('[data-inventory-toggle]')!;
  const left = search.getBoundingClientRect(), right = button.getBoundingClientRect();
  assert(left.right <= right.x && right.width === 44 && left.width > right.width, 'search takes remaining width, info on right');
  api.capture = { kind: 'narrow-closed', viewport: innerWidth }; await wait(() => !api.capture, 'closed narrow screenshot');
  toggle(); await waitValues("3", "2", "2");
  assert(document.querySelector('[data-hub-search]') === search, 'search consumer retained across toggle');
  assert(document.documentElement.scrollWidth <= innerWidth, 'whole narrow page has no horizontal overflow');
  const cards = [...document.querySelectorAll('[data-inventory-kpi]')].map(node => node.getBoundingClientRect());
  assert(cards[1].y > cards[0].y && cards[2].y > cards[1].y, "narrow KPIs stack");
  assert(cards.every(rect => rect.x >= 0 && rect.right <= window.innerWidth), "narrow no KPI horizontal overflow");
  const main = document.querySelector("main")!; main.scrollTop = 0;
  api.capture = { kind: "narrow", values: values(), viewport: window.innerWidth, widths: cards.map(rect => rect.width) };
  await wait(() => !api.capture, "narrow screenshot");
  const grid = tiles(); main.scrollTop = main.scrollHeight;
  assert(grid.querySelectorAll("a").length === 5 && grid.children.length === 4, "all five narrow links remain reachable");
  return ["390px actual shell/dashboard: stacked KPIs, no horizontal overflow and all four navigation areas and five links"];
};
