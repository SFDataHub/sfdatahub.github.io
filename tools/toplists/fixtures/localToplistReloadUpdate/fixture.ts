import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
import { hubFavoritesStore } from "../../../../src/lib/data-hub/hubFavoritesStore";
import { favoriteReference } from "../../../../src/lib/data-hub/hubFavoritesContract";
import { acquireExplicitLocalFirstArchiveScans } from "../../../../src/lib/scanArchive/localFirstScanAcquisition";
import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";

const fullPlayers = String("__VALIDATION_FULL_PLAYERS__") === "true";
const api: any = { ready: true, documentId: crypto.randomUUID(), stand: "__VALIDATION_STAND__", messages: [], responses: [], workerURLs: [], downloads: [], errors: [] };
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
const raw = { players: Array.from({ length: 1005 }, (_, i) => ({ identifier: `f8_net_p${i + 1}`, prefix: "f8_net", timestamp: stamp,
  name: i === 1004 ? "FarAway" : `Player${String(i).padStart(4, "0")}`, guildIdentifier: "f8_net_g1", guildName: "Validation Guild",
  class: 1, level: 100 + i, rank: i + 1,
  values: { Base: 10000 - i, "Base Strength": 10000 - i, "Base Constitution": 500, Attribute: 15000 - i, Constitution: 750 } })),
  groups: [{ identifier: "f8_net_g1", prefix: "f8_net", timestamp: stamp, name: "Validation Guild", rank: 1, memberCount: 1005, avgLevel: 500 }] };
api.context = { status: "complete", catalog: null, manifests: [{ schemaVersion: 1, archiveYear: 2026, revision: 1,
  updatedAt: new Date(stamp).toISOString(), scanCount: 1, serverCount: 1, scans: [entry],
  toplists: { schemaVersion: 1, current: { f8_net: entry.id }, monthly: {} } }],
  manifestUrlsByYear: { 2026: entry.manifestUrl }, entries: [entry], selections: [], serverOptions: [], issues: [] };
api.acquire = (selected: ScanArchiveEntry[], options: any) => acquireExplicitLocalFirstArchiveScans(selected, {
  ...options, dependencies: { downloadArchiveEntry: async (requested: ScanArchiveEntry) => {
    api.downloads.push(requested.id); return { content: JSON.stringify(raw) };
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
  if (!fullPlayers) assert(!document.querySelector("[data-toplist-search-mode]"), "authenticated old client has no W27 mode selection");
  else assert(document.querySelector("[data-toplist-search-mode]"), "authentic W27 client mode control");
  assert(!ids().includes("f8_net_p1005"), "FarAway outside old BaseTop1000");
  assert(api.responses.some((r: any) => r.type === "view" && r.playerRows?.length === 1000), "native old worker produced old output limit");
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
  await until(() => !!document.querySelector("[data-toplist-search-mode]"), "W27 actual mode selection after reload");
  click([...document.querySelectorAll('button[role="tab"]')].find(el => el.textContent === "Players"));
  await tableReady();
  const select = document.querySelector<HTMLSelectElement>("[data-toplist-search-mode]")!;
  assert(select.value === "search", "normal reload defaults to Search");
  if (fullPlayers) {
    assert(api.responses.some((r: any) => r.type === "view" && r.totalRows === 1005 && r.playerRows?.length <= 200), "new full cohort in bounded native response");
    const scroll = document.querySelector<HTMLElement>(".toplists-table-scroll")!;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    api.scrollBefore={height:scroll.clientHeight,scrollHeight:scroll.scrollHeight,top:scroll.scrollTop,body:document.body.innerText.slice(-2000)};
    scroll.scrollTop = scroll.scrollHeight; scroll.dispatchEvent(new Event("scroll"));
    await until(() => !!document.querySelector('[data-sfh-identifier="f8_net_p1005"]'), "FarAway through ordinary unfiltered scroll after reload");
    const row = document.querySelector<HTMLElement>('[data-sfh-identifier="f8_net_p1005"]')!;
    assert(row.querySelector("td")?.textContent === "1005", "full-list rank after ordinary reload");
    assert(select.value === "search" && !(document.getElementById("guild-hub-local-toplist-search") as HTMLInputElement).value, "without name filter");
    assert(api.downloads.length === 0 && !api.messages.some((m: any) => m.type === "derive-toplists"), "valid existing raw/derived reused");
    return { stand: api.stand, documentId: api.documentId, row: row.innerText, count: ids().length, mode: select.value,
      workerURLs: api.workerURLs, downloads: api.downloads, controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      fullResponse: api.responses.findLast((r: any) => r.type === "view" && r.playerRows?.some((p: any) => p.identifier === "f8_net_p1005")) };
  }
  select.value = "filter"; select.dispatchEvent(new Event("change", { bubbles: true }));
  const input = document.getElementById("guild-hub-local-toplist-search") as HTMLInputElement;
  assert(input?.placeholder === "enter a name", "actual updated input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "FarAway");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await until(() => ids().length === 1 && ids()[0] === "f8_net_p1005" && !document.querySelector("[data-local-toplist-progress]"), "new filter DOM row");
  const row = document.querySelector<HTMLElement>('[data-sfh-identifier="f8_net_p1005"]')!;
  assert(row.querySelector("td")?.textContent === "1005", "new filter preserves full-context rank 1005");
  assert(api.responses.some((r: any) => r.type === "view" && r.playerRows?.[0]?.identifier === "f8_net_p1005" && r.totalRows === 1), "genuine native filtered response");
  assert(api.downloads.length === 0, "existing valid raw and derived data reused without archive download");
  return { stand: api.stand, documentId: api.documentId, row: row.innerText, count: ids().length, mode: select.value,
    workerURLs: api.workerURLs, downloads: api.downloads, controller: navigator.serviceWorker.controller?.scriptURL ?? null,
    nativeFilteredResponse: api.responses.findLast((r: any) => r.type === "view" && r.playerRows?.[0]?.identifier === "f8_net_p1005") };
};
const digest = async (text: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(v => v.toString(16).padStart(2, "0")).join("");
api.durable = async () => {
  const stores: any[] = [];
  for (const info of await indexedDB.databases()) {
    if (!info.name?.startsWith("sfdatahub-")) continue;
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(info.name!); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    for (const name of [...db.objectStoreNames]) {
      if (!["scans", "localToplistSnapshots", "archiveScanBindings", "state"].includes(name)) continue;
      const values = await new Promise<any[]>((resolve, reject) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const relevant = name === "state" ? values.filter(v => ["hub-favorites", "guild-selection-compatibility", "migration.hubFavorites.v1"].includes(v.key)) : values;
      stores.push({ database: info.name, store: name, records: await Promise.all(relevant.map(async value => ({ id: value.id ?? value.key ?? value.cacheKey, hash: await digest(JSON.stringify(value)) }))) });
    }
    db.close();
  }
  return { stores, scope: pageContextStore.get("local-toplist").servers };
};
