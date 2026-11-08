import { searchIndexPayloadForScanArchiveEntry } from "../../../../src/lib/scanArchive/archiveBuilderCore";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
import { openDB } from "idb";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { preparedProfileSeed } from "../../../../src/lib/data-hub/profileNavigation";
import { resolveLocalProfileEntry } from "../../../../src/lib/data-hub/localProfileEntry";
import { parseLocalEntity, parseObservation } from "../../../../src/lib/data-hub/routes";
import GuildHubToplist from "../../../../src/pages/DataHub/Toplist";
import * as scans from "../../../../src/lib/guilds/localScanLibrary";
import { acquireExplicitLocalFirstArchiveScans } from "../../../../src/lib/scanArchive/localFirstScanAcquisition";
import { createScanArchiveSourceMetadata } from "../../../../src/lib/scanArchive/client";
import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";
import type { LocalToplistLoadResult } from "../../../../src/lib/toplists/localToplistService";
import type { LocalPlayerProfileModel } from "../../../../src/components/local-player-profile/types";
import { LocalToplistViewWorkerSession } from "../../../../src/lib/toplists/localToplistViewWorkerClient";
import { isToplistRowVisible, useToplistRowFocus, type ToplistFocusResult, type ToplistFocusRequest } from "../../../../src/pages/Toplists/useToplistRowFocus";
import "../../../../src/styles/base.css";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
export const w08: { ready: boolean; publicCalls: number; loads: { datasetId: string; result: LocalToplistLoadResult }[]; acks: ToplistFocusResult[];
  location?: any; navigate?: (path:string)=>void; context?: any; filters?: any; profile?: LocalPlayerProfileModel; acquire?: typeof acquireExplicitLocalFirstArchiveScans; run?: () => Promise<string[]>; runCompact?: () => Promise<string[]>; } = { ready: false, publicCalls: 0, loads: [], acks: [] };
(globalThis as any).w08 = w08;
const unhandled: string[] = [];
window.addEventListener("unhandledrejection", event => unhandled.push(String(event.reason)));
const currentTime = Date.UTC(2026, 9, 6, 12), historicalTime = Date.UTC(2026, 8, 6, 12), baselineTime = Date.UTC(2026, 7, 6, 12);
const entry = (id: string, timestamp: number, server = "f8_net"): ScanArchiveEntry => ({ id, server, timestamp, timestampUtc: new Date(timestamp).toISOString(),
  path: `${id}.json.gz`, format: "sftools.raw.v1", compression: "gzip", sha256: (id[0] === "h" ? "a" : id[0]).repeat(64), compressedBytes: 1, uncompressedBytes: 1,
  searchIndex: { schemaVersion: 1, path: `${id}-index.gz`, sha256: "f".repeat(64), compressedBytes: 1, uncompressedBytes: 1, playerCount: id[0] === "h" || id[0] === "b" ? 1003 : 1002, groupCount: 251 },
  playerCount: id[0] === "h" || id[0] === "b" ? 1003 : 1002, groupCount: 251, archiveYear: 2026, manifestRevision: 1, manifestUrl: "https://example.test/manifest.json", fileUrl: `https://example.test/${id}.gz` });
const current = entry("ccccurrent", currentTime), historical = entry("hhhhistory", historicalTime), baseline = entry("bbbaseline", baselineTime), extra = entry("eeeeextra", currentTime, "s1_eu");
const raw = (time: number, historic = false, changed = false, server = "f8_net") => ({
  players: Array.from({ length: 1002 }, (_, index) => ({ identifier: `${server}_p${index + 1}`, prefix: server, timestamp: time,
    name: `Target${String(index).padStart(4, "0")}${changed && index === 0 ? " Changed" : ""}`, class: historic ? 2 : 1,
    level: 100 + index, rank: index + 1, guildIdentifier: `${server}_g1`, guildName: historic ? "Historical Guild" : "Guild0000",
    values: { Base: 10000 - index, "Base Strength": 10000 - index, "Base Intelligence": 10000 - index, "Base Constitution": 500, Attribute: 15000 - index, Constitution: 750 },
  })).concat(historic ? [{ identifier: `${server}_p2001`, prefix: server, timestamp: time, name: "HistoricalOnly", class: 2, level: 2001, rank: 1, guildIdentifier: `${server}_g2`, guildName: "Guild0001", values: { Base: 30000, "Base Strength": 30000, "Base Intelligence": 30000, "Base Constitution": 500, Attribute: 35000, Constitution: 750 } }] : []),
  groups: Array.from({ length: 251 }, (_, index) => ({ identifier: `${server}_g${index + 1}`, prefix: server, timestamp: time, name: `Guild${String(index).padStart(4,"0")}`, rank: index + 1, memberCount: 1, avgLevel: 1000 - index })),
});
const contents = new Map<string, string>([[current.id, JSON.stringify(raw(currentTime))], [historical.id, JSON.stringify(raw(historicalTime, true))], [baseline.id, JSON.stringify(raw(baselineTime, true))], [extra.id, JSON.stringify(raw(currentTime, false, false, "s1_eu"))]]);
let extraAvailable = false;
w08.acquire = (entries, options) => acquireExplicitLocalFirstArchiveScans(entries, { ...options, dependencies: { downloadArchiveEntry: async requested => {
  if (requested.id === extra.id && !extraAvailable) throw new Error("Controlled missing archive member");
  return { content: contents.get(requested.id)! };
} } });
let root: Root | undefined;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function until(check: () => boolean, message: string, timeout = 20000) {
  const end = Date.now() + timeout;
  while (!check()) { if (Date.now() > end) throw new Error(`Timeout ${message}: ${document.body.innerText.slice(0, 400)}; compare=${JSON.stringify((globalThis as any).w08.compareState, (key, value) => ["playerRows", "guildRows", "snapshots"].includes(key) ? value?.length : value).slice(0,1800)}`); await act(async () => { await frame(); }); }
}
// W12 supplies canonical profile routes; observe the real sender and validate
// its prepared entry. Complete profile/guild receiving parents are covered by
// the W12 routing and W13 Dashboard browser fixtures.
function RouteProbe(){
 const location=useLocation(),navigate=useNavigate();w08.location=location;w08.navigate=path=>navigate(path);
 React.useEffect(()=>{
  const parts=location.pathname.split('/');const index=parts.indexOf('player');if(index<0)return;
  const entity=parseLocalEntity('player',parts[index+1],parts[index+2]);if(!entity)return;
  let ended=false;w08.profile=undefined;void resolveLocalProfileEntry({entity,observation:parseObservation(location.search)},preparedProfileSeed(location)).then(model=>{if(!ended)w08.profile=model ?? undefined;});return()=>{ended=true;};
 },[location]);return null;
}
async function mount() {
  if (root) await act(async () => root!.unmount());
  root = createRoot(document.getElementById("root")!);
  await act(async () => root!.render(<MemoryRouter initialEntries={["/data-hub/toplist"]}><RouteProbe/><GuildHubToplist /></MemoryRouter>));
  await until(() => Boolean(document.querySelector('[data-sfh-identifier]')), "real rows");
}
async function click(element: Element | null) { assert(element, "Missing control"); await act(async () => (element as HTMLElement).click()); }
async function compare() { for (const key of ["compare", "from", "to"]) await click(document.querySelector(`[data-proof="${key}"]`)); }
async function tab(kind: "Players" | "Guilds") { await click([...document.querySelectorAll("button")].find(button => button.textContent?.trim() === kind) ?? null); }
async function search(label: string) {
  await act(async () => w08.filters.setSearchText(label));
  const input = document.getElementById("guild-hub-local-toplist-search") as HTMLInputElement;
  await act(async () => { input.blur(); input.focus(); });
  await until(() => [...document.querySelectorAll('#guild-hub-local-toplist-search-results button')].some(button => button.textContent?.includes(label)), `search ${label}`);
  const matches = [...document.querySelectorAll<HTMLButtonElement>('#guild-hub-local-toplist-search-results button')].filter(button => button.textContent?.includes(label));
  return matches.find(button => button.dataset.toplistSearchServer === "F8") ?? matches[0];
}
async function focus(label: string, identifier: string) {
  const before = w08.acks.length;
  await click(await search(label));
  await until(() => w08.acks.length > before && document.querySelector('[data-toplist-target-status="visibleAck"]') != null, `ACK ${label}`);
  const row = document.querySelector<HTMLElement>(`[data-sfh-identifier="${identifier}"]`);
  assert(row && isToplistRowVisible(row), `${identifier} must be mounted and inside the actual viewport`);
  assert(row!.className.includes("--focused"), `${identifier} must have visible highlight`);
  return row!;
}
function holdRow(identifier: string) {
  const style = document.createElement("style"); style.textContent = `[data-sfh-identifier="${identifier}"]{visibility:hidden!important}`;
  document.head.append(style); return () => style.remove();
}
async function selectHeld(label: string, identifier: string) {
  const release = holdRow(identifier), before = w08.acks.length;
  await click(await search(label));
  await until(() => Boolean(document.querySelector(`[data-sfh-identifier="${identifier}"].toplists-row--focused, [data-sfh-identifier="${identifier}"].toplists-mobile-row--focused`)), "held marked row");
  assert(w08.acks.length === before, "mark on an invisible DOM row is not an ACK");
  return { release, before };
}
async function capture(kind: string, row: HTMLElement) {
  const rect = row.getBoundingClientRect();
  (globalThis as any).w08.capture = { kind, identifier: row.dataset.sfhIdentifier, server: row.dataset.sfhServer,
    classes: row.className, visible: isToplistRowVisible(row), bounds: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    windowScrollY: window.scrollY, bodyScrollTop: document.body.scrollTop,
    tableScrollTop: (row.closest(".toplists-table-scroll") as HTMLElement | null)?.scrollTop ?? null,
    ack: w08.acks.at(-1), contentRevision: w08.loads.at(-1)?.result.contentRevision };
  await until(() => !(globalThis as any).w08.capture, `capture ${kind}`, 10000);
}
const clear = async () => { await act(async () => w08.filters.setSearchText("")); };
const setup = async () => {
  pageContextStore.selectServers(["F8"]);
  const entries = [baseline, historical, current, extra];
  for (const e of entries) await scans.putSfDataHubArchiveSearchIndexCache(e, { ...searchIndexPayloadForScanArchiveEntry(e, JSON.parse(contents.get(e.id)!)), schemaVersion: 1 });
  w08.context = { status: "complete", catalog: null, manifests: [{ schemaVersion: 1, archiveYear: 2026, revision: 1, updatedAt: new Date(currentTime).toISOString(), scanCount: 4, serverCount: 2, scans: entries,
    toplists: { schemaVersion: 1, current: { f8_net: current.id, s1_eu: extra.id }, monthly: { "2026-08": { f8_net: baseline.id }, "2026-09": { f8_net: historical.id } } } }],
    manifestUrlsByYear: { 2026: "https://example.test/manifest.json" }, entries: [current, extra],
    selections: [], serverOptions: [current, extra].map(item => ({ server: item.server === "f8_net" ? "F8" : "EU1", sourceServer: item.server, label: item.server, archiveScanId: item.id, scanTimestamp: item.timestamp })), issues: [] };
};

w08.run = async () => {
  const results: string[] = [];
  await setup(); await mount(); await tab("Players");
  for (const index of [99, 100, 999]) {
    const row = await focus(`Target${String(index).padStart(4,"0")}`, `f8_net_p${index + 1}`);
    const scroll = row.closest('.toplists-table-scroll') as HTMLElement;
    assert(scroll && scroll.scrollTop > 0, "desktop virtualizer scroll position changes");
    if (index === 999) await capture("desktop-999", row);
    results.push(`Desktop zero-based index ${index}: mounted matching row, scrollTop=${Math.round(scroll.scrollTop)}, visible active mark and bound ACK`);
  }
  const outside = await search("Target1001"); assert(!outside.disabled, "player beyond former BaseTop1000 is reachable"); await click(outside); await until(() => w08.acks.at(-1)?.identifier === "f8_net_p1002" && w08.acks.at(-1)?.status === "visibleAck", "beyond-1000 actual DOM ACK"); results.push("Player beyond former BaseTop1000 receives an actual DOM ACK");
  await clear();
  const old = await selectHeld("Target0100", "f8_net_p101");
  await focus("Target0099", "f8_net_p100"); old.release();
  assert(w08.acks.at(-1)?.identifier === "f8_net_p100", "new hit supersedes old pending focus");
  const cleared = await selectHeld("Target0100", "f8_net_p101");
  await clear(); cleared.release(); await act(async () => { await frame(); await frame(); });
  assert(w08.acks.length === cleared.before, "query clear cancels actual pending focus");
  results.push("Invisible mounted mark produces no ACK; a new hit/query clear cancels the pending real parent/renderer attempt");
  await act(async () => w08.filters.setClasses(["mage"]));
  await click(await search("Target0100"));
  await until(() => Boolean(document.querySelector('[data-toplist-target-status="hiddenByFilters"]')), "class blocker");
  assert(w08.filters.classes[0] === "mage", "filters must not be cleared automatically");
  const before = w08.acks.length;
  await act(async () => w08.filters.setClasses([]));
  await until(() => w08.acks.length > before, "same target resolves after manual class correction");
  results.push("Class blocker retained filter and target wish; manual correction produces a new view-bound visible ACK");
  await clear(); await act(async () => w08.filters.setGuilds(["Different Guild"])); await click(await search("Target0100"));
  await until(() => Boolean(document.querySelector('[data-toplist-target-status="hiddenByFilters"]')), "guild blocker");
  await clear(); await act(async () => { w08.filters.setGuilds([]); w08.filters.setFavoritesOnly(true); }); await click(await search("Target0100"));
  await until(() => Boolean(document.querySelector('[data-toplist-target-status="hiddenByFilters"]')), "favorite blocker");
  await clear(); await act(async () => w08.filters.setFavoritesOnly(false)); results.push("Guild/favorite blockers and query-clear cancellation preserve existing filters");
  await tab("Guilds"); const guild = await focus("Guild0200", "f8__201"); await click(guild);
  await until(() => Boolean(w08.location?.pathname.includes("/guild/") && w08.location?.pathname.endsWith("/dashboard")), "canonical local guild route");
  const excludedGuild = w08.loads.at(-1)!.result.guildRows.find(row => !document.querySelector(`[data-sfh-identifier="f8__${row.guildId}"]`));
  assert(excludedGuild, "one guild stays outside Guild250");
  const outsideGuild = await search(excludedGuild!.name); await click(outsideGuild);
  await until(() => Boolean(document.querySelector('[data-toplist-target-status="outsideView/Cohort"]')), "Guild250 target reason");
  assert(!document.querySelector(`[data-sfh-identifier="f8__${excludedGuild!.guildId}"]`), "Guild250 does not inject target"); results.push("Guild desktop DOM scroll/highlight/ACK; Guild250 excluded; addressed W12 profile sender without public call");
  await clear(); await tab("Players");
  await compare();
  await until(() => Boolean(document.querySelector('[data-sfh-identifier="f8_net_p2001"]')), "historical Comparecurrent");
  const historicRow = await focus("HistoricalOnly", "f8_net_p2001");
  await click(historicRow); await until(() => w08.profile?.hero.playerName === "HistoricalOnly", "historical local profile");
  assert(w08.profile?.analytics.scannedAtMs === historicalTime, "profile keeps actual historical anchor");
  await act(async () => w08.navigate!("/data-hub/toplist"));
  results.push("Historical Comparecurrent target absent in normal dataset: actual current maps, focus ACK and W-05 historical profile anchor");
  await clear(); await act(async () => w08.filters.setClasses(["mage"]));
  const sameEntity = await focus("Target0100", "f8_net_p101"); await click(sameEntity);
  await until(() => w08.profile?.hero.playerName === "Target0100", "same entity historical profile");
  assert(w08.profile?.analytics.scannedAtMs === historicalTime && w08.profile.analytics.guildName === "Historical Guild", "same entity uses compare class/guild/source/time");
  await act(async () => w08.navigate!("/data-hub/toplist"));
  await clear(); await act(async () => w08.filters.setClasses([]));
  const closing = await selectHeld("HistoricalOnly", "f8_net_p2001");
  await click(document.querySelector('[data-proof="normal"]')); closing.release();
  await until(() => !document.querySelector('[data-sfh-identifier="f8_net_p2001"]'), "compare close changes real context");
  await act(async () => { await frame(); await frame(); });
  assert(w08.acks.length === closing.before, "compare close cannot accept an old focus ACK");
  results.push("Same entity has different normal/compare class, guild, source and time; compare close cancels an invisible pending row attempt");
  await click(document.querySelector('[data-proof="normal"]')); await clear();
  await act(async () => w08.filters.setServers(["F8", "EU1"]));
  await until(() => w08.loads.at(-1)?.result.status === "partial", "partial actual dataset");
  const partial = w08.loads.at(-1)!;
  extraAvailable = true;
  const preview = await scans.createSfDataHubLocalScanImportPreview("extra.json", contents.get(extra.id)!, { archiveSource: createScanArchiveSourceMetadata(extra) });
  await scans.commitSfDataHubLocalScanPreview(preview);
  await until(() => w08.loads.at(-1)?.result.status === "complete" && w08.loads.at(-1)?.datasetId === partial.datasetId, "same ID partial to ready");
  assert(w08.loads.at(-1)!.result.contentRevision !== partial.result.contentRevision, "coverage revision changes");
  await act(async () => w08.filters.setServers(["F8"])); await until(() => w08.loads.at(-1)?.result.readySelections.length === 1, "F8 dataset");
  const original = w08.loads.at(-1)!; const sourceId = original.result.playerRows[0].localScanId;
  contents.set(current.id, JSON.stringify(raw(currentTime, false, true)));
  await scans.updateGuildHubLocalScan(sourceId, "changed.json", contents.get(current.id)!);
  await until(() => w08.loads.at(-1)?.result.playerRows.some(row => row.name === "Target0000 Changed") === true, "same-ID content update");
  const changed = w08.loads.at(-1)!;
  assert(changed.datasetId === original.datasetId && changed.result.playerRows.length === original.result.playerRows.length && changed.result.contentRevision !== original.result.contentRevision, "same ID/count changed actual content");
  await click(await search("Target0000"));
  await until(() => Boolean(document.querySelector('[data-toplist-target-status="visibleAck"]')), "updated worker search/view focus");
  results.push("Same requested ID partial→complete and same-count raw update replace actual parent/view/target data; archive search retains its source name");
  const source = await scans.getGuildHubLocalScan(sourceId); assert(source, "actual source");
  const revisionBefore = changed.result.contentRevision;
  await scans.updateGuildHubLocalScan(sourceId, "same-hash.json", contents.get(current.id)!);
  await until(() => w08.loads.at(-1)?.result.contentRevision !== revisionBefore, "same-hash fresh source generation");
  results.push("Same raw hash fresh source generation invalidates active dataset without changing values");
  const beforeForeign = w08.loads.length;
  await scans.importGuildHubLocalScan("foreign.json", JSON.stringify(raw(currentTime, false, false, "s2_eu")));
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => { await frame(); await frame(); });
  assert(w08.loads.length === beforeForeign, "unrelated server/source does not reload ready toplist");
  // Real durable mutation without publish: focus catches the missed event.
  const db = await openDB("sfdatahub-local-data");
  const stored = await db.get("scans", sourceId), summary = await db.get("scanSummaries", sourceId);
  const generation = crypto.randomUUID();
  const tx = db.transaction(["scans", "scanSummaries", "localChanges"], "readwrite");
  await tx.objectStore("scans").put({ ...stored, sourceGeneration: generation });
  await tx.objectStore("scanSummaries").put({ ...summary, sourceGeneration: generation });
  await tx.objectStore("localChanges").add({ owner: "sources", kinds: ["normalization"], sourceIds: [sourceId], removedSourceIds: [], servers: ["f8_net"], unknownImpact: false, committedAt: new Date().toISOString() });
  await tx.done; db.close();
  const missedRevision = w08.loads.at(-1)!.result.contentRevision;
  await act(async () => window.dispatchEvent(new Event("focus")));
  await until(() => w08.loads.at(-1)?.result.contentRevision !== missedRevision, "durable catch-up");
  results.push("Foreign source leaves ready dataset unchanged; missed Sourcegeneration event is caught through real IDB journal on focus");
  await clear(); await click(document.querySelector('[data-proof="progress"]')); await click(document.querySelector('[data-proof="since"]'));
  await until(() => (globalThis as any).w08.compareState?.current?.contentRevision === w08.loads.at(-1)!.result.contentRevision, "validated current reuse");
  const reused = (globalThis as any).w08.compareState.current as LocalToplistLoadResult;
  assert(reused === w08.loads.at(-1)!.result, "identical request composition and current receipt reuse actual normal result");
  const changedRaw = raw(currentTime, false, true); changedRaw.players[0].name = "Current Reuse Revised";
  contents.set(current.id, JSON.stringify(changedRaw));
  await scans.updateGuildHubLocalScan(sourceId, "reuse-update.json", contents.get(current.id)!);
  await until(() => (globalThis as any).w08.compareState?.current?.playerRows.some((row: any) => row.name === "Current Reuse Revised"), "changed reused current");
  assert((globalThis as any).w08.compareState.current.contentRevision !== reused.contentRevision, "actual current change invalidates dependent compare");
  await focus("Target0000", "f8_net_p1");
  await clear(); await click(document.querySelector('[data-proof="normal"]'));
  results.push("Current reuse verifies composition and receipt; same-ID current update replaces comparison and target context; search keeps archived names");
  const normalResult = w08.loads.at(-1)!.result;
  const session = new LocalToplistViewWorkerSession();
  await session.setData("same", normalResult.playerRows, normalResult.guildRows, "R1");
  await session.setData("same", [{ ...normalResult.playerRows[0], name: "Replaced Actual Worker" }], [], "R2");
  const actual = await session.requestSearch({ datasetId: "same", contentRevision: "R2", query: "Replaced Actual" });
  assert(actual.results[0]?.label === "Replaced Actual Worker", "real moduleworker replaces same-ID search arrays"); session.dispose();
  assert(w08.publicCalls === 0 && unhandled.length === 0, "no public action or unhandled rejection");
  results.push("Real moduleworker reinit observes replacement rows; no public provider/profile calls or unhandled rejections");
  return results;
};

w08.runCompact = async () => {
  const results: string[] = [];
  await mount(); await tab("Players");
  const player = await focus("Target0100", "f8_net_p101");
  assert(player.classList.contains("toplists-mobile-row"), "actual compact renderer");
  await capture("compact-100", player);
  let compactScroll = window.scrollY;
  for (let ancestor = player.parentElement; ancestor; ancestor = ancestor.parentElement) compactScroll += ancestor.scrollTop;
  assert(compactScroll > 0, "compact target moves its actual overflow container or viewport");
  await click(player.querySelector('.toplists-mobile-summary'));
  await click(player.querySelectorAll('.toplists-mobile-action-button')[1]);
  await until(() => Boolean(w08.location?.pathname.includes("/guild/") && w08.location?.pathname.endsWith("/dashboard")), "player guild cell canonical local target");
  assert(w08.publicCalls === 0, "player guild action uses no public fallback");
  await click(player.querySelector('.toplists-mobile-action-button'));
  await until(() => w08.profile?.hero.playerName === "Target0100", "compact local profile");
  await act(async () => w08.navigate!("/data-hub/toplist"));
  results.push("Compact player viewport scroll, visible mark and ACK; accordion expands; profile button uses existing local path");
  await clear(); await compare();
  const historic = await focus("HistoricalOnly", "f8_net_p2001");
  await click(historic.querySelector('.toplists-mobile-summary')); await click(historic.querySelector('.toplists-mobile-action-button'));
  await until(() => w08.profile?.hero.playerName === "HistoricalOnly", "compact historical local profile");
  assert(w08.profile?.analytics.scannedAtMs === historicalTime, "compact profile historical anchor");
  await act(async () => w08.navigate!("/data-hub/toplist"));
  results.push("Compact historical Comparecurrent player action retains September observation");
  await clear(); await click(document.querySelector('[data-proof="normal"]')); await tab("Guilds");
  const guild = await focus("Guild0200", "f8__201");
  await click(guild.querySelector('.toplists-mobile-summary')); await click(guild.querySelector('.toplists-mobile-action-button'));
  await until(() => Boolean(w08.location?.pathname.includes("/guild/") && w08.location?.pathname.endsWith("/dashboard")), "compact canonical guild target");
  assert(w08.publicCalls === 0, "compact guild must not open public profile"); results.push("Compact guild actual viewport focus ACK; guild-profile sender uses addressed W12 local route");
  await clear();
  const abandoned = await selectHeld("Guild0100", "f8__101");
  await act(async () => root!.render(<div>Unmounted Toplist</div>)); abandoned.release();
  await act(async () => { await frame(); await frame(); });
  assert(w08.acks.length === abandoned.before, "actual parent Unmount abandons pending guild focus");
  results.push("Player-guildcell delegates locally; actual Toplist Unmount cancels a pending compact guild attempt");
  await delayedFocusProof(); results.push("Real focus hook: delayed mount succeeds, missing DOM ends unresolved, old attempt cancelled, remount cannot replay completed focus");
  await act(async () => root!.unmount()); assert(unhandled.length === 0, "unmount cleans pending work");
  return results;
};

async function delayedFocusProof() {
  const acks: ToplistFocusResult[] = [];
  const target: ToplistFocusRequest = { identifier: "delayed", datasetKey: "actual", viewKey: "view", targetGeneration: 1, attempt: "1" };
  function Probe({ request, show }: { request: ToplistFocusRequest; show: boolean }) {
    const ref = React.useRef<HTMLDivElement>(null);
    const highlighted = useToplistRowFocus({ focusIdentifier: request.identifier, focusRequest: request, scrollContainerRef: ref, onFocusResult: result => acks.push(result) });
    return <div ref={ref}>{show && <div data-sfh-identifier="delayed" style={{ height: 80 }} className={highlighted === "delayed" ? "toplists-row--focused" : ""}>Delayed row</div>}</div>;
  }
  await act(async () => root!.render(<Probe request={target} show={false} />));
  await act(async () => { await frame(); root!.render(<Probe request={target} show />); });
  await until(() => acks.some(ack => ack.status === "visibleAck"), "delayed mount");
  acks.length = 0;
  await act(async () => root!.render(<Probe request={{ ...target, identifier: "missing", attempt: "2" }} show={false} />));
  await until(() => acks.some(ack => ack.status === "unresolved"), "bounded missing DOM", 3000);
  acks.length = 0;
  await act(async () => root!.render(<Probe request={{ ...target, attempt: "old" }} show={false} />));
  await act(async () => root!.render(<Probe request={{ ...target, attempt: "new" }} show />));
  await until(() => acks.length === 1, "new attempt"); assert(acks[0].attempt === "new", "old ACK cannot reach new target");
  await act(async () => root!.render(<Probe key="remount" request={{ ...target, completed: true, attempt: "new" }} show />));
  await act(async () => { await frame(); await frame(); }); assert(acks.length === 1, "completed child remount cannot repeat ACK");
  function LegacyProbe({ identifier }: { identifier: string | null }) {
    const ref = React.useRef<HTMLDivElement>(null);
    const highlighted = useToplistRowFocus({ focusIdentifier: identifier, scrollContainerRef: ref });
    return <div ref={ref}><div data-sfh-identifier="legacy" style={{ height: 80 }} className={highlighted === "legacy" ? "toplists-row--focused" : ""}>Legacy row</div></div>;
  }
  await act(async () => root!.render(<LegacyProbe identifier="legacy" />));
  await until(() => Boolean(document.querySelector('.toplists-row--focused')), "public legacy focus");
  await act(async () => root!.render(<LegacyProbe identifier={null} />));
  await act(async () => root!.render(<LegacyProbe identifier="legacy" />));
  await until(() => Boolean(document.querySelector('.toplists-row--focused')), "public legacy refocus after clear");
}
w08.ready = true;
