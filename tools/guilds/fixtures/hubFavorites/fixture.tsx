import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { openDB } from "idb";
import de from "../../../../src/i18n/de.json";
import en from "../../../../src/i18n/en.json";
import "../../../../src/styles/index.css";
import DataHubIndex from "../../../../src/pages/DataHub/Index";
import GuildHubIndex from "../../../../src/pages/GuildHub/Index";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
import LocalFavoritesMenu from "../../../../src/components/data-hub/LocalFavoritesMenu";
import LocalPlayerProfileOverlay from "../../../../src/components/local-player-profile/LocalPlayerProfileOverlay";
import { hubFavoritesStore, FAVORITES_KEY, FAVORITES_MIGRATION_KEY, GUILD_COMPATIBILITY_KEY } from "../../../../src/lib/data-hub/hubFavoritesStore";
import { getHubStateDb } from "../../../../src/lib/data-hub/hubStateDb";
import { guildSelection, referenceKey } from "../../../../src/lib/data-hub/hubFavoritesContract";
import { localPlayerFavorite } from "../../../../src/lib/data-hub/hubFavoritesProjection";
import { importGuildHubLocalScan, getGuildHubLocalScan, deleteGuildHubLocalScans, GUILD_HUB_SCAN_SUMMARY_VERSION, type GuildHubScanSummary } from "../../../../src/lib/guilds/localScanLibrary";
import { GUILD_SCAN_NORMALIZER_VERSION } from "../../../../src/lib/guilds/guildScanNormalizer";
import { LOCAL_SCAN_CORE_NORMALIZER_VERSION } from "../../../../src/lib/guilds/localSourceValidity";
import { commitLocalDataMutation } from "../../../../src/lib/local-data/localDataTransaction";
import type { LocalChangesSchema } from "../../../../src/lib/local-data/localDataChanges";
import type { DBSchema } from "idb";
import { captureLocalDataDependencies } from "../../../../src/lib/local-data/localDataDependencies";
import { createLocalPlayerCurrentSeed } from "../../../../src/pages/GuildHub/localPlayerCurrentSeed";
import { buildLocalPlayerProfileModel } from "../../../../src/pages/GuildHub/localPlayerProfileAdapter";
import { acquireLocalPlayerProfile } from "../../../../src/lib/local-player-profile/coordinator";
import { linkPlayerIdentifiers, unlinkPlayerIdentifier } from "../../../../src/lib/identities/playerIdentityStore";
import { createFightTracker, readFightTrackerState, readFightTrackerStateById, readFightTrackers } from "../../../../src/pages/GuildHub/fightTrackingStore";
import type { LocalPlayerProfileModel } from "../../../../src/components/local-player-profile/types";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
const until = async (test: () => boolean, label: string) => { for (let i = 0; i < 1000; i++) { if (test()) return; await pause(); } throw Error(`timeout ${label}: ${document.body.innerText}`); };
const costs = { rawReads: 0, rawPoolReads: 0, normalizations: 0, derivedBuilds: 0, archivePayloadRequests: 0 };
type Costs = typeof costs;
interface SummaryProofDb extends DBSchema, LocalChangesSchema {
  scans: { key: string; value: unknown };
  scanSummaries: { key: string; value: GuildHubScanSummary };
}
const evidence: Array<{ name: string; costs: Costs }> = [], results: string[] = [], errors: string[] = [];
const work = { favoriteMetadataReads: 0, favoriteProjectionCompletions: 0, kpiMetadataReads: 0, archiveReadinessRuns: 0, currentSeedResolutions: 0, summaryEnsureRuns: 0 };
const writes = { summaryRepairs: 0, favoriteWrites: 0, controlledSummaryWrites: 0 };
const summaryValidity: Array<{ name: string; costs: Costs; writes: typeof writes; work: typeof work }> = [];
const diff = (before: Costs): Costs => Object.fromEntries(Object.entries(costs).map(([key, value]) => [key, value - before[key as keyof Costs]])) as Costs;
const zero = (before: Costs, label: string) => { const measured = diff(before); evidence.push({ name: label, costs: measured }); assert(Object.values(measured).every(value => value === 0), `${label}: ${JSON.stringify(measured)}`); };
const peer = new URL(location.href).searchParams.has("peer");
const restoreGate = deferred(), mutationGate = deferred();
const api = { ready: false, costs, evidence, errors, results, work, writes, summaryValidity, controlledSummaryWrite: false, restoreGate: peer ? undefined : restoreGate.promise,
  mutationGate: undefined as Promise<void> | undefined, projectionGate: undefined as Promise<void> | undefined, projectionHeld: false, projectionEnds: 0, failMigration: !peer, failWrites: false, missNotifications: false,
  capture: null as null | { kind: string }, run, runNarrow, peerSave, snapshot: () => hubFavoritesStore.getSnapshot(),
  closeNotifications: () => { api.missNotifications = true; }, releaseMutation: () => { api.mutationGate = undefined; mutationGate.resolve(); },
  focus: () => window.dispatchEvent(new Event("focus")), keyboardReady: () => { const edit = document.querySelector<HTMLButtonElement>('#local-favorites-dialog [data-guild-favorites-edit]')!; if (edit.getAttribute('aria-pressed') !== 'true') flushSync(() => edit.click()); const button = document.querySelector<HTMLButtonElement>('#local-favorites-dialog li button[aria-label*="verschieben"]:not(:disabled)'); assert(button, "keyboard button available"); button!.scrollIntoView(); button!.focus(); return button!.getAttribute("aria-label"); },
  keyboardRevision: () => hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision,
  refresh: () => hubFavoritesStore.refresh() };
(globalThis as typeof globalThis & { w10: typeof api }).w10 = api;
window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/data/scan-archive/catalog.json")) return Response.json({ schemaVersion: 1, archives: [] });
  if (/\.(json\.gz|gz)(\?|$)/.test(url)) { costs.archivePayloadRequests++; throw Error("No archive payload requested by favorites"); }
  return nativeFetch(input, init);
};
const get = IDBObjectStore.prototype.get, getAll = IDBObjectStore.prototype.getAll, put = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.get = function(query) { if (this.name === "scans") costs.rawReads++; return get.call(this, query); };
IDBObjectStore.prototype.getAll = function(...args) { if (this.name === "scans") costs.rawPoolReads++; return getAll.apply(this, args); };
const storeCursor = IDBObjectStore.prototype.openCursor, indexGet = IDBIndex.prototype.get,
  indexGetAll = IDBIndex.prototype.getAll, indexCursor = IDBIndex.prototype.openCursor;
IDBObjectStore.prototype.openCursor = function(...args) { if (this.name === "scans") costs.rawPoolReads++; return storeCursor.apply(this, args); };
IDBIndex.prototype.get = function(query) { if (this.objectStore.name === "scans") costs.rawReads++; return indexGet.call(this, query); };
IDBIndex.prototype.getAll = function(...args) { if (this.objectStore.name === "scans") costs.rawPoolReads++; return indexGetAll.apply(this, args); };
IDBIndex.prototype.openCursor = function(...args) { if (this.objectStore.name === "scans") costs.rawPoolReads++; return indexCursor.apply(this, args); };
IDBObjectStore.prototype.put = function(value, ...args) {
  if (this.name === "scanSummaries") writes[api.controlledSummaryWrite ? "controlledSummaryWrites" : "summaryRepairs"]++;
  if (this.name === "state" && value.key === FAVORITES_KEY) writes.favoriteWrites++;
  if (this.name === "state" && (api.failMigration && value.key === FAVORITES_MIGRATION_KEY || api.failWrites && value.key === FAVORITES_KEY)) throw Error("controlled W-10 transaction failure");
  return put.call(this, value, ...args);
};

await i18n.use(initReactI18next).init({ lng: "de", fallbackLng: "en", resources: { de: { translation: de }, en: { translation: en } }, interpolation: { escapeValue: false } });
document.body.style.background = "#091529"; document.body.style.margin = "0";
const root = createRoot(document.getElementById("root")!);
let profile: LocalPlayerProfileModel | null = null;
let showGuild = !peer, showProfile = !peer;
import { useGuildHubSelection } from "../../../../src/pages/GuildHub/hooks/useGuildHubSelection";

const render = () => flushSync(() => root.render(<MemoryRouter><LocalFavoritesMenu><DataHubIndex />{showGuild && <GuildHubIndex />}
  <LocalPlayerProfileOverlay isOpen={showProfile} profile={profile} onClose={() => { showProfile = false; render(); }} /></LocalFavoritesMenu></MemoryRouter>));
const guild = (id: number) => ({ id: `f8_net_g${id}`, guildId: `g${id}`, name: `Guild ${id}`, server: "F8", logo: `f8_net_g${id}`, logoIdentifier: `f8_net_g${id}`, hofRank: id, memberCount: 2, coaString: null });
const old = { selectedGuilds: [guild(1), guild(2), { id: "broken", name: "Legacy unresolved" }], activeGuildId: guild(2).id };
const db = await getHubStateDb();
let sourceId = "", trackerId = "";
let oldRecord: unknown;
let primed: ReturnType<typeof acquireLocalPlayerProfile> | undefined;
if (!peer) {
  await db.put("state", { key: "guild-selection", value: old, updatedAt: "2026-10-01T12:00:00Z" });
  oldRecord = await db.get("state", "guild-selection");
  const timestamp = 1791194400000;
  const raw = { players: [1, 2].map(id => ({ identifier: `f8_net_p${id}`, prefix: "f8_net", name: `Player ${id}`, level: 100, class: 1,
    timestamp, guildIdentifier: "f8_net_g1", guildName: "Guild 1" })), groups: [1, 2, 3].map(id => ({ identifier: `f8_net_g${id}`, prefix: "f8_net", name: `Guild ${id}`, timestamp })) };
  const imported = await importGuildHubLocalScan("fixture.json", JSON.stringify(raw)); sourceId = imported.scan.id;
  const scan = (await getGuildHubLocalScan(sourceId))!;
  const dependencies = await captureLocalDataDependencies({ sourceIds: [sourceId] });
  const target = { sourceScanId: sourceId, sourcePlayerKey: "f8_net_p1", sourceMemberRef: "f8_net_p1", scannedAtMs: timestamp, scannedAtIso: new Date(timestamp).toISOString(), guild: { name: "Guild 1", server: "F8", identifier: "f8_net_g1" } };
  const seed = createLocalPlayerCurrentSeed({ scan, dependencies, coreLookup: new Map() }, target)!;
  profile = buildLocalPlayerProfileModel({ ...target, rawPlayer: seed.rawPlayer, currentSeed: seed });
  primed = acquireLocalPlayerProfile(profile); assert((await primed.request("current")).status === "ready", "actual local Current profile primed");
  const tracker = await createFightTracker({ name: "Independent Tracker", server: "F8", source: "manual", members: [{ name: "Member", active: true, source: "manual" }] });
  trackerId = tracker.tracker!.id;
}
const initialDisplay = { ...costs };
render(); api.ready = true;


const action = () => document.querySelector<HTMLButtonElement>('[data-local-favorite-action] > button')!;
const click = async (selector: string) => { const element = document.querySelector<HTMLButtonElement>(selector); assert(element, selector); element!.click(); await pause(); };
const ready = () => hubFavoritesStore.getSnapshot().status === "ready";
const favorites = () => hubFavoritesStore.getSnapshot().snapshot!.record.favorites;
const favoriteNames = () => [...document.querySelectorAll("#local-favorites-dialog [data-favorite-name]")].map(element => element.textContent);
async function screenshot(kind: string) { if (kind === "wide" || kind === "narrow") document.querySelector("#local-favorites-dialog")!.scrollIntoView({ behavior: "instant", block: "center" }); api.capture = { kind }; await until(() => api.capture === null, `screenshot ${kind}`); }

async function openMenu() { if (!document.querySelector("#local-favorites-dialog")) { await until(() => !!document.querySelector("[data-local-favorites-trigger]"), "menu trigger"); await click("[data-local-favorites-trigger]"); } }
async function closeMenu() { if (document.querySelector("#local-favorites-dialog")) await click("#local-favorites-dialog > header button"); }
if (peer) { await openMenu(); await until(ready, "peer restore"); }
async function run() {
  assert(!document.querySelector("[data-hub-favorites]"), "Dashboard favorites block removed");
  await openMenu();
  assert(action().disabled, "early player save gated by actual store restore");
  assert(document.querySelector("fieldset")!.disabled, "guild management gated by restore");
  assert(document.querySelector(".profile-overlay")?.textContent?.includes("Player 1"), "independent local profile still displays");
  action().click(); assert(await db.get("state", FAVORITES_KEY) === undefined, "early click wrote nothing");
  restoreGate.resolve(); api.restoreGate = undefined;
  await until(() => hubFavoritesStore.getSnapshot().status === "error", "migration abort visible");
  assert(await db.get("state", FAVORITES_KEY) === undefined && await db.get("state", FAVORITES_MIGRATION_KEY) === undefined && await db.get("state", GUILD_COMPATIBILITY_KEY) === undefined, "real IDB migration fully aborted");
  assert(JSON.stringify(await db.get("state", "guild-selection")) === JSON.stringify(oldRecord), "recovery unchanged");
  api.failMigration = false;
  await click('[data-local-favorite-action] [role="alert"] button'); await until(ready, "visible migration retry");
  assert(favorites().length === 3 && guildSelection(hubFavoritesStore.getSnapshot().snapshot!).activeGuildId === guild(2).id, "migration order and active compatibility preserved");
  assert(favoriteNames().includes("Legacy unresolved"), "unresolved legacy visible in actual favorites menu");
  zero(initialDisplay, "initial favorites display with existing hydrated scan summaries");
  results.push("real IDB: held restore gates both UIs, independent profile remains; migration abort/visible retry/cutover preserve recovery and active guild");

  await until(() => action().textContent?.includes("Spieler lokal speichern") === true, "actual local action ready");
  await until(() => !action().disabled, "current favorite projection permits action");
  const beforeSave = { ...costs }; action().click(); await until(() => ready() && action().getAttribute("aria-pressed") === "true", "durable player save");
  zero(beforeSave, "save from actual already-open local profile");
  await closeMenu(); await screenshot("profile-wide"); await openMenu();
  const player = favorites().find(f => f.kind === "player")!;
  assert(player.reference?.identifier === "f8_net_p1" && player.display.name === "Player 1" && !Object.hasOwn(player, "currentSeed"), "entity and lightweight display only");
  assert(favoriteNames().includes("Player 1"), "same committed player in favorites menu");
  action().click(); await until(() => ready() && action().getAttribute("aria-pressed") === "false", "actual player remove");
  action().click(); await until(() => ready() && action().getAttribute("aria-pressed") === "true", "actual player resave");
  const revision = hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision;
  await hubFavoritesStore.mutate({ type: "save", favorite: localPlayerFavorite(profile!)! });
  assert(hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision === revision, "repeat exact save no duplicate/write");
  results.push("real local Overlay/Hero/current coordinator/action: save, remove, repeat save and dashboard synchronization; extra Raw/normalizer/derived/download counts zero");

  api.failWrites = true; const committed = JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);
  action().click(); await until(() => hubFavoritesStore.getSnapshot().status === "error", "remove failure visible");
  assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot) === committed && action().getAttribute("aria-pressed") === "true", "failure preserves committed saved status");
  api.failWrites = false; await click('[data-local-favorite-action] [role="alert"] button'); await until(() => ready() && action().getAttribute("aria-pressed") === "false", "remove retry");
  action().click(); await until(() => ready() && action().getAttribute("aria-pressed") === "true", "resave");
  results.push("actual action write failure preserves saved state; visible Retry commits remove");

  api.mutationGate = mutationGate.promise; action().click(); await until(() => hubFavoritesStore.getSnapshot().status === "saving", "remove held");
  profile = { ...profile!, sourcePlayerKey: "f8_net_p2", analytics: { ...profile!.analytics, memberRef: "f8_net_p2", playerName: "Player 2" },
    currentSeed: undefined, hero: { ...profile!.hero, playerName: "Player 2" } }; render();
  api.releaseMutation(); await until(ready, "late remove after target switch");
  assert(action().getAttribute("aria-pressed") === "false", "old response cannot save new profile");
  showProfile = false; render(); primed?.release(); primed = undefined;
  results.push("late action completion after actual profile switch/unmount cannot publish old player saved status");

  // Keep the actual favorites menu (including independent, empty-catalog KPIs) and
  // ContextBar mounted. Unmount the scan-picker and all profile consumers, whose
  // legitimate repair paths must not be attributed to favorite projection.
  showGuild = false; render();
  await click('[data-inventory-toggle]');
  await until(() => document.querySelectorAll('[data-inventory-kpi]').length === 3 && work.kpiMetadataReads > 0, 'explicit concurrent KPI consumer');
  await hubFavoritesStore.mutate({ type: "save", favorite: player });
  await until(() => document.querySelector(`[data-favorite-id="${player.id}"]`)?.textContent?.includes(i18n.t("hubFavorites.availability.available")) === true, "validated original player availability");
  await pause();
  const proofDb = await openDB<SummaryProofDb>("sfdatahub-local-data");
  const validSummary = await proofDb.get("scanSummaries", sourceId) as GuildHubScanSummary;
  const proofSnapshot = JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);
  const retainedRawKey = await proofDb.getKey("scans", sourceId);
  assert(retainedRawKey === sourceId, "Raw exists before Summary validity cases");
  const row = () => document.querySelector(`[data-favorite-id="${player.id}"]`)!;
  const guildRow = () => [...document.querySelectorAll("#local-favorites-dialog li")].find(element => element.textContent?.includes("Guild 1"))!;
  const delta = <T extends Record<string, number>,>(after: T, before: T) => Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - before[key]])) as T;
  async function updateSummary(name: string, summary: GuildHubScanSummary | null, expected: string) {
    const beforeCosts = { ...costs }, beforeWrites = { ...writes }, beforeWork = { ...work };
    await commitLocalDataMutation(proofDb, ["scanSummaries"], {
      owner: "sources", kinds: ["normalization"], sourceIds: [sourceId], removedSourceIds: [], servers: ["F8"], unknownImpact: false,
    }, async tx => {
      if (summary) {
        api.controlledSummaryWrite = true;
        try { await tx.objectStore("scanSummaries").put(summary); }
        finally { api.controlledSummaryWrite = false; }
      } else await tx.objectStore("scanSummaries").delete(sourceId);
    });
    await until(() => work.favoriteProjectionCompletions > beforeWork.favoriteProjectionCompletions && row().textContent?.includes(expected) === true &&
      guildRow().textContent?.includes(expected) === true, name);
    await pause(); await pause();
    const measured = { name, costs: diff(beforeCosts), writes: delta(writes, beforeWrites), work: delta(work, beforeWork) };
    assert(Object.values(measured.costs).every(value => value === 0), `${name}: ${JSON.stringify(measured)}`);
    assert(measured.writes.summaryRepairs === 0 && measured.writes.favoriteWrites === 0, `${name}: no repairs or favorite writes`);
    assert(measured.work.archiveReadinessRuns === 0 && measured.work.currentSeedResolutions === 0 && measured.work.summaryEnsureRuns === 0, `${name}: independent payload consumers absent`);
    assert(measured.work.kpiMetadataReads > 0, `${name}: independent KPI revalidation counted separately`);
    assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot) === proofSnapshot, `${name}: favorite fields/order/compatibility unchanged`);
    assert(await proofDb.getKey("scans", sourceId) === sourceId, `${name}: Raw remains present`);
    summaryValidity.push(measured);
  }
  const unknown = i18n.t("hubFavorites.availability.unknown"), available = i18n.t("hubFavorites.availability.available");
  await updateSummary("Raw present, Summary missing: actual favorites retained with unknown availability", null, unknown);
  await updateSummary("Raw present, Summary schema stale: no positive or negative evidence", { ...validSummary, summaryVersion: GUILD_HUB_SCAN_SUMMARY_VERSION - 1 }, unknown);
  await updateSummary("Raw present, guild normalizer stale: unknown availability", { ...validSummary, normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION - 1 }, unknown);
  await updateSummary("Raw present, core normalizer stale: unknown availability", { ...validSummary, coreNormalizerVersion: LOCAL_SCAN_CORE_NORMALIZER_VERSION - 1 }, unknown);
  await updateSummary("Raw index hash contradicts Summary: unknown availability", { ...validSummary, contentHash: "not-the-indexed-Raw-hash" }, unknown);
  await updateSummary("Current Summary restored: production subscription confirms available without Raw reads", validSummary, available);

  await hubFavoritesStore.mutate({ type: "remove", id: player.id });
  showGuild = true; render(); await pause(); await pause();
  results.push("N02 actual favorites menu: missing/stale schema, guild/core versions and contradicted Raw hash remain unknown; valid metadata update restores availability, favorites and compatibility retained, independent KPI metadata counted separately");

  const beforeDisplay = { ...costs }; await hubFavoritesStore.refresh(); await until(() => favoriteNames().length === 3, "favorite metadata display"); await pause();
  zero(beforeDisplay, "pure favorites/dashboard/contextbar display after warm restore");
  const beforeSelection = structuredClone(hubFavoritesStore.getSnapshot().snapshot!);
  await click('#local-favorites-dialog button[aria-label="Guild Overview öffnen: Guild 1"]'); await openMenu(); await until(ready, "read-only favorite view");
  assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot!) === JSON.stringify(beforeSelection), "favorite view writes neither favorites nor compatibility");
  assert(!document.querySelector('nav[aria-label="Guild-Hub-Kontextnavigation"]'), "retired header rail absent");
  assert((await readFightTrackerState(null)).tracker!.id === trackerId && (await readFightTrackers()).length === 1, "tracker active slot independent");
  results.push("real local favorite cards use committed metadata; viewing creates no global selection; independent tracker remains assigned; pure display costs zero");

  await closeMenu();
  const editRevision=hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision;
  await click('button[aria-label="Gildenauswahl bearbeiten"]');
  assert(hubFavoritesStore.getSnapshot().snapshot!.record.recordRevision===editRevision,'shared edit control does not write');
  await click('button[aria-label="Guild 2 nach oben verschieben"]'); await until(ready, "guild keyboard reorder");
  assert(guildSelection(hubFavoritesStore.getSnapshot().snapshot!).selectedGuilds[0].name === "Guild 2", "actual guild reorder changes common store");
  await click('button[aria-label="Bearbeitung beenden"]'); await click('button[aria-label="Gilde hinzufügen"]');
  await until(() => Boolean(document.querySelector('select')), "actual guild server picker");
  const serverSelect = document.querySelector<HTMLSelectElement>('select')!;
  serverSelect.value = "F8"; serverSelect.dispatchEvent(new Event("change", { bubbles: true }));
  await until(() => Boolean(document.querySelector('input[type="search"]')), "actual guild picker");
  const picker = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Guild 3"));
  const pickerContextBefore = JSON.stringify(pageContextStore.get("guild-hub"));
  assert(picker, "Guild 3 actual metadata picker");
  const pickerSnapshot=JSON.stringify(hubFavoritesStore.getSnapshot().snapshot);
  api.failWrites=true;picker!.click();await until(()=>hubFavoritesStore.getSnapshot().status==='error','actual picker save failure');
  assert(JSON.stringify(hubFavoritesStore.getSnapshot().snapshot)===pickerSnapshot&&!!document.querySelector('[data-guild-picker]'),'failed picker save retains committed collection and picker');
  api.failWrites=false;
  const retry=[...document.querySelector('[data-guild-favorites-edit]')!.closest('section')!.querySelectorAll<HTMLButtonElement>('[role="alert"] button')].find(b=>b.textContent?.includes('Erneut versuchen'))!;
  assert(retry,'Guild Hub retry visible');retry.click(); await openMenu(); await until(() => ready() && favoriteNames().includes("Guild 3"), "guild add reflected dashboard");
  await until(()=>!document.querySelector('[data-guild-picker]'),'shared picker closes only after retry commit');
  assert(JSON.stringify(pageContextStore.get("guild-hub")) === pickerContextBefore, "saving a favorite does not select a page input");
  await closeMenu(); await click('button[aria-label="Gildenauswahl bearbeiten"]'); await click('button[aria-label="Guild 3 aus Guild Hub entfernen"]');
  await click('[role="dialog"] button:last-child'); await openMenu(); await until(() => ready() && !favoriteNames().includes("Guild 3"), "guild remove reflected dashboard");
  await closeMenu(); await click('button[aria-label="Bearbeitung beenden"]'); await openMenu();
  document.querySelector("fieldset")!.scrollIntoView(); await screenshot("guild-wide"); window.scrollTo(0, 0);
  results.push("actual GuildHubIndex shared edit writes nothing; picker failed save/Retry preserves committed collection/context and closes after commit; keyboard reorder and confirmation remove write same dashboard collection");

  const historical: LocalPlayerProfileModel = { ...profile!, sourcePlayerKey: "f8_net_p77", sourceScanId: sourceId, analytics: { ...profile!.analytics, memberRef: "f8_net_p77" }, hero: { ...profile!.hero, playerName: "Historical entity" } };
  await linkPlayerIdentifiers("f8_net_p77", "f9_net_p77", { source: "manual" });
  await hubFavoritesStore.mutate({ type: "save", favorite: localPlayerFavorite(historical)! });
  await until(() => document.querySelector(`[data-favorite-id="${localPlayerFavorite(historical)!.id}"]`)?.textContent?.includes("Identität bestätigt") === true, "confirmed identity display");
  const projectionGate = deferred(); api.projectionGate = projectionGate.promise; api.projectionHeld = false;
  // W116 reuses a valid held projection. Start the race with a real durable
  // invalidation rather than expecting focus alone to rebuild valid rows.
  await commitLocalDataMutation(proofDb, ["scanSummaries"], {owner:"sources",kinds:["normalization"],sourceIds:[sourceId],removedSourceIds:[],servers:["F8"],unknownImpact:false}, async tx => { await tx.objectStore("scanSummaries").put(validSummary); });
  api.focus();
  await until(() => api.projectionHeld, "old projection held after metadata and identity read");
  api.projectionGate = undefined;
  await unlinkPlayerIdentifier("f9_net_p77");
  const oldEnds = api.projectionEnds; projectionGate.resolve(); await until(() => api.projectionEnds > oldEnds, "old projection settled");
  await until(() => document.querySelector(`[data-favorite-id="${localPlayerFavorite(historical)!.id}"]`)?.textContent?.includes("Widersprüchliche Referenzen") === true, "unlink conflict menu after superseded single-flight projection settles");
  assert(document.querySelector(`[data-favorite-id="${localPlayerFavorite(historical)!.id}"]`)?.textContent?.includes("Widersprüchliche Referenzen"), "late old projection cannot replace newer conflict");
  results.push("held older projection settles after unlink; actual hook retains newer conflict display");
  const beforeDelete = favorites().map(f => f.id); await deleteGuildHubLocalScans([sourceId]);
  await until(() => document.querySelector(`[data-favorite-id="${localPlayerFavorite(historical)!.id}"]`)?.textContent?.includes("Keine lokalen Daten") === true, "Rawdelete availability");
  assert(JSON.stringify(favorites().map(f => f.id)) === JSON.stringify(beforeDelete), "Rawdelete keeps favorites");
  assert((await readFightTrackerStateById(trackerId)).members.length === 1, "tracker contents preserved");
  assert(JSON.stringify(await db.get("state", "guild-selection")) === JSON.stringify(oldRecord), "all actions leave old recovery read-only");
  results.push("dashboard Identity unlink conflict remains removable; Rawdelete changes availability, retains favorites and tracker content; recovery read-only");
  assert(document.querySelectorAll("[data-inventory-kpi]").length === 3, "three W-09 KPIs preserved");
  assert(document.querySelectorAll('a[href="/data-hub/toplist"],a[href="/data-hub/analytics"],a[href="/data-hub/guild-hub/dashboard"]').length >= 3, "existing entry tiles preserved");
  await screenshot("wide"); return [...results];
}
async function runNarrow() {
  const before = { ...costs }; await hubFavoritesStore.refresh(); await pause(); zero(before, "narrow pure favorites display");
  const section = document.querySelector<HTMLElement>("#local-favorites-dialog")!;
  assert(section.scrollWidth <= section.clientWidth + 1, "favorites have no horizontal overflow at 390px");
  assert([...section.querySelectorAll("button")].every(button => button.getBoundingClientRect().width <= section.clientWidth), "controls fit narrow width");
  await screenshot("narrow");
  document.querySelector("fieldset")!.scrollIntoView(); await screenshot("guild-narrow");
  window.scrollTo(0, 0); showProfile = true; render();
  await until(() => !!document.querySelector("[data-local-favorite-action]"), "narrow actual profile action");
  await closeMenu();
  const localAction = document.querySelector<HTMLElement>("[data-local-favorite-action]")!;
  assert(localAction.scrollWidth <= localAction.clientWidth + 1, "local profile action fits narrow width");
  assert(localAction.getBoundingClientRect().top < document.querySelector(".profile-overlay__panel")!.getBoundingClientRect().top + 160, "favorite action remains in compact profile header");
  await screenshot("profile-narrow"); showProfile = false; render(); await openMenu();
  return ["390px actual favorites menu/guild/contextbar/profile-action layout fits; favorites and controls remain available"];
}
async function peerSave(id: number) {
  const model: LocalPlayerProfileModel = { sourceScanId: "peer-hint", sourcePlayerKey: `f8_net_p${id}`, analytics: { playerName: `Peer ${id}`, server: "F8", memberRef: `f8_net_p${id}`, guildIdentifier: null, guildName: null, scannedAtMs: 1791194400000 },
    hero: { playerName: `Peer ${id}`, server: "F8", metrics: [], badges: [], actions: [] } };
  const favorite = localPlayerFavorite(model)!; assert(referenceKey(favorite.reference!).endsWith(`::${id}`), "original ref retained");
  return hubFavoritesStore.mutate({ type: "save", favorite });
}
