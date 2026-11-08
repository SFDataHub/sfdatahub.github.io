import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RouteFrame, routing } from "../profileBrowserGuards/RouteFrame";
import GuildHubDashboard from "../../../../src/pages/GuildHub/Dashboard";
import GuildHubToplist from "../../../../src/pages/DataHub/Toplist";
import * as scans from "../../../../src/lib/guilds/localScanLibrary";
import { captureLocalDataDependencies } from "../../../../src/lib/local-data/localDataDependencies";
import { createLocalPlayerCurrentSeed } from "../../../../src/pages/GuildHub/localPlayerCurrentSeed";
import { buildLocalPlayerProfileModel } from "../../../../src/pages/GuildHub/localPlayerProfileAdapter";
import { buildLocalPlayerInsights } from "../../../../src/components/local-player-profile/localPlayerInsightsModel";
import { deriveLocalToplistsFromConfirmedScans } from "../../../../src/lib/toplists/localToplistDerivation";
import { localToplistDatasetId } from "../../../../src/lib/toplists/localToplistStore";
import type { LocalPlayerProfileModel } from "../../../../src/components/local-player-profile/types";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const now = Date.UTC(2026, 9, 6, 12), previous = Date.UTC(2026, 8, 6, 12), baseline = Date.UTC(2026, 7, 6, 12);
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const deferred = () => {
  let release!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((resolve, fail) => { release = resolve; reject = fail; });
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  return { promise, release, reject, entered, started };
};
type Gate = ReturnType<typeof deferred> & { id?: string };
export const w05: {
  guild: scans.GuildHubSelectionGuild;
  selectionRefresh?: () => void;
  filters?: any;
  context?: any;
  results: Map<string, any>;
  raw: Array<{ id: string; stack: string }>;
  core: Array<{ name: string; stack: string }>;
  comparisons: string[][];
  comparisonCommits: number;
  unhandled: string[];
  rawGates: Gate[];
  validityGates: Gate[];
  comparisonGates: Gate[];
  comparisonEnds: number;
  insightsStarts: number;
  actionEnds: number; entryStarts:number; entryEnds:number[];
  profile?: LocalPlayerProfileModel;
  insightsEnds: number;
  ready: boolean;
  error?: string;
  run?: () => Promise<string[]>;
} = {
  guild: { id: "f8_net_g1", guildId: "g1", name: "Proof Guild", server: "f8_net", logoIdentifier: "f8_net_g1", logo: "f8_net_g1", memberCount: 2, hofRank: 5, coaString: null },
  results: new Map(), raw: [], core: [], comparisons: [], comparisonCommits: 0, unhandled: [], rawGates: [], validityGates: [], comparisonGates: [], comparisonEnds: 0, insightsStarts: 0, actionEnds: 0, entryStarts:0,entryEnds:[], insightsEnds: 0, ready: false,
};
(globalThis as any).w05 = w05;
window.addEventListener("unhandledrejection", event => { w05.unhandled.push(String(event.reason)); });
export async function afterGate(kind: "rawGates" | "validityGates", id: string) {
  const index = w05[kind].findIndex(gate => !gate.id || gate.id === id);
  if (index < 0) return;
  const [gate] = w05[kind].splice(index, 1);
  gate.entered();
  await gate.promise;
}
(globalThis as any).w05AfterGate = afterGate;
(globalThis as any).w05BeforeComparison = async (summaries: scans.GuildHubScanSummary[]) => {
  w05.comparisons.push(summaries.map(summary => summary.sourceScanId));
  const gate = w05.comparisonGates.shift();
  if (gate) { gate.entered(); await gate.promise; }
};
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function until(check: () => boolean, message: string) {
  const deadline = Date.now() + 15000;
  while (!check()) { if (Date.now() > deadline) throw new Error(`Timeout: ${message}; ${document.body.innerText}`); await act(async () => { await frame(); }); }
}
let root: Root | undefined;
async function mount(kind: "dashboard" | "toplist") {
  if (root) await act(async () => root!.unmount());
  root = createRoot(document.getElementById("root")!);
  await act(async () => root!.render(<RouteFrame kind={kind}>{kind === "dashboard" ? <GuildHubDashboard /> : <GuildHubToplist />}</RouteFrame>));
}
async function click(selector: string) {
  const button = document.querySelector<HTMLElement>(selector);
  assert(button, `Missing control: ${selector}`);
  await act(async () => button!.click());
}
async function escape() { await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); }); }
const dialog = () => document.querySelector('[role="dialog"]');
const profileName = () => document.querySelector('.player-profile__player-name')?.textContent;
const currentRawReads = () => w05.raw.filter(read => !read.stack.includes("readRanksFromMatchedSnapshots"));
const currentCore = () => w05.core.filter(read => !read.stack.includes("readRanksFromMatchedSnapshots"));
const raw = (timestamp: number, label: string) => ({ players: [1, 2].map(id => ({ identifier: `f8_net_p${id}`, prefix: "f8_net", timestamp, name: `${label} ${id === 1 ? "A" : "B"}`,
  class: 1, level: 100 + id, baseMain: 100 + id, conBase: 100, xpTotal: timestamp / 1000, rank: id + 10, guildIdentifier: "f8_net_g1", guildName: "Proof Guild" })), groups: [{ identifier: "f8_net_g1", prefix: "f8_net", timestamp, name: "Proof Guild", rank: 5, memberCount: 2 }] });
async function setup() {
  // The profile regression has an explicit F8 selection. W-17 keeps a fresh
  // Toplist scope empty until that selection reaches the actual page owner.
  pageContextStore.selectServers(["F8"]);
  const sources: scans.GuildHubLocalScan[] = [];
  for (const [time, label] of [[baseline, "Baseline"], [previous, "Historical"], [now, "Current"]] as const) {
    const source = await scans.importGuildHubLocalScan(`${label}.json`, JSON.stringify(raw(time, label)));
    sources.push(source.scan);
  }
  const entries = sources.map((source, i) => ({ id: `proof-${i}`, server: "f8_net", timestamp: [baseline, previous, now][i], timestampUtc: new Date([baseline, previous, now][i]).toISOString(),
    path: `proof-${i}.json.gz`, format: "sftools.raw.v1" as const, compression: "gzip" as const, sha256: String(i + 1).repeat(64), compressedBytes: 1, uncompressedBytes: 1,
    playerCount: 2, groupCount: 1, searchIndex: { schemaVersion: 1 as const, path: "proof-index.json.gz", sha256: "f".repeat(64), compressedBytes: 1, uncompressedBytes: 1, playerCount: 2, groupCount: 1 }, archiveYear: 2026, manifestRevision: 1, manifestUrl: "https://example.test/manifest.json", fileUrl: `https://example.test/${i}.gz` }));
  const resultFor = (entry: typeof entries[number], i: number) => {
    const derived = deriveLocalToplistsFromConfirmedScans([{ manifestYear: 2026, archiveScanId: entry.id, archiveSha256: entry.sha256, server: entry.server,
      scanTimestamp: entry.timestamp, localScanId: sources[i].id, rawScan: sources[i].rawData, confirmation: { kind: "archiveSource", archiveScanId: entry.id, archiveSha256: entry.sha256 } }]);
    return { status: "complete", snapshots: derived.snapshots, playerRows: derived.players, guildRows: derived.guilds, readySelections: [], failedSelections: [], cacheHits: [], cacheMisses: [], derivedSelections: [], networkAccessed: false, workerRan: false, issues: [] };
  };
  entries.forEach((entry, i) => w05.results.set(localToplistDatasetId([entry]), resultFor(entry, i)));
  w05.context = { status: "complete", catalog: null, manifests: [{ schemaVersion: 1, archiveYear: 2026, revision: 1, updatedAt: new Date(now).toISOString(), scanCount: 3, serverCount: 1, scans: entries, toplists: { schemaVersion: 1, current: { f8_net: entries[2].id }, monthly: { "2026-08": { f8_net: entries[0].id }, "2026-09": { f8_net: entries[1].id } } } }], manifestUrlsByYear: { 2026: "https://example.test/manifest.json" }, selections: [], entries: [entries[2]], serverOptions: [{ server: "F8", sourceServer: "f8_net", label: "F8", archiveScanId: entries[2].id, scanTimestamp: now }], issues: [] };
  return { sources, entries };
}

w05.run = async () => {
  const passed: string[] = [];
  const { sources } = await setup();
  w05.raw = []; w05.core = [];
  const comparison = deferred(); w05.comparisonGates.push(comparison);
  await mount("dashboard");
  await act(async () => { await comparison.started; });
  await until(() => document.body.innerText.includes("Current A"), "dashboard current before held comparison");
  assert(document.body.innerText.includes("Loading historical comparison"), "comparison is independently loading");
  assert(w05.comparisons[0].length === 1 && w05.comparisons[0][0] === sources[1].id, "first 30-day candidate, no oldest fallback");
  assert(currentRawReads().length === 1, "dashboard current loads one payload");
  const coreBeforeProfile = currentCore().length;
  const rawBeforeProfile = currentRawReads().length;
  const pendingDashboard = { ...deferred(), id: sources[2].id }; w05.validityGates.push(pendingDashboard);
  const pendingDashboardEnds = w05.actionEnds;
  await click('button[aria-label="Current A lokales Spielerprofil öffnen"]'); await pendingDashboard.started;
  await escape();
  await act(async () => pendingDashboard.release());
  await until(() => w05.actionEnds > pendingDashboardEnds, "dashboard seed validation action completes after Close");
  assert(!dialog() && !document.body.innerText.includes("Spielerprofil wird geladen"), "dashboard Close invalidates pending metadata-validated open");
  // Actual card and list parent callbacks, actual Overlay and Insights.
  await click('button[aria-label="Current A lokales Spielerprofil öffnen"]');
  await until(() => profileName()==="Current A", "card profile opens before comparison");
  await until(() => w05.insightsEnds > 0, "actual seeded Insights finishes");
  assert(currentRawReads().length === rawBeforeProfile, "opening + Insights add zero current Rawpayload reads");
  assert(currentCore().length === coreBeforeProfile, "opening + Insights reuse existing member/card cores");
  const dashboardProfile = w05.profile!;
  assert(dashboardProfile.currentSeed?.normalizedCore && dashboardProfile.currentSeed.rawIdentifier === "f8_net_p1", "full core and original identifier reach profile");
  await escape(); assert(!dialog(), "Escape closes actual overlay");
  await click('[aria-label="Mitgliederansicht"] button:nth-child(2)');
  await until(() => Boolean(document.querySelector('[data-testid="w05-list-row"][data-name="Current A"]')) || document.body.innerText.includes("Current A"), "member list");
  await click('[data-testid="w05-list-row"][data-name="Current A"]');
  await until(() => profileName()==="Current A", "list profile opens before comparison");
  await click('.profile-overlay'); assert(!dialog(), "Backdrop closes parent action");
  await act(async () => comparison.reject(new Error("controlled historical failure")));
  await until(() => document.body.innerText.includes("The historical comparison could not be loaded"), "independent comparison error");
  assert(document.body.innerText.includes("Current A"), "comparison error preserves current");
  passed.push("actual Dashboard: held comparison, current/card/list profile readiness; separate error; zero extra current reads/normalizations");

  const comparisonRefresh = deferred(); w05.comparisonGates.push(comparisonRefresh);
  const scanUpdate = await scans.createGuildHubLocalScanImportPreview("HistoryRefresh.json", JSON.stringify(raw(baseline - 86400000, "Older")));
  await act(async () => { await scans.commitGuildHubLocalScanPreview(scanUpdate); });
  await comparisonRefresh.started;
  assert(document.querySelector('[data-testid="w05-list-row"][data-name="Current A"]'), "history refresh retains list toggle and mounted member panel");
  await click('[data-testid="w05-list-row"][data-name="Current A"]'); await until(() => profileName()==="Current A", "profile during history refresh");
  await act(async () => comparisonRefresh.release());
  await until(() => !document.body.innerText.includes("Loading historical comparison"), "comparison settles");
  assert(dialog() && profileName() === "Current A", "historical refresh retains opened profile");
  await escape();
  passed.push("historical refresh preserves current tree, view toggle and profile");

  // Gates finish explicit old jobs; no elapsed delay serves as proof.
  const staleComparison = deferred(); w05.comparisonGates.push(staleComparison);
  const staleComparisonEnds = w05.comparisonEnds;
  await act(async () => { await scans.importGuildHubLocalScan("Older2.json", JSON.stringify(raw(baseline - 2 * 86400000, "Older2"))); });
  await staleComparison.started;
  await act(async () => { w05.guild = { ...w05.guild, id: "f8_net_g2", guildId: "g2", logoIdentifier: "f8_net_g2", name: "Other Guild" }; w05.selectionRefresh?.(); });
  await until(() => document.body.innerText.includes("Keine lokalen Scans"), "guild context changes");
  await act(async () => staleComparison.reject(new Error("old guild failure")));
  await until(() => w05.comparisonEnds > staleComparisonEnds, "old comparison failure completes");
  assert(!document.body.innerText.includes("The historical comparison could not be loaded"), "old comparison failure is discarded");
  passed.push("guild change rejects old comparison failure after explicit completion");
  const only = raw(now, "Only");
  only.players.forEach(player => { player.guildIdentifier = "f8_net_g2"; player.guildName = "Other Guild"; });
  only.groups[0].identifier = "f8_net_g2"; only.groups[0].name = "Other Guild";
  const comparisonCount = w05.comparisons.length;
  await act(async () => { await scans.importGuildHubLocalScan("Only.json", JSON.stringify(only)); });
  await until(() => document.body.innerText.includes("Only A"), "current without historical candidate");
  assert(w05.comparisons.length === comparisonCount && !document.body.innerText.includes("Loading historical comparison"), "no candidate ends empty without historical read");
  passed.push("missing comparison candidate preserves current and starts no historical read");
  w05.guild = { ...w05.guild, id: "f8_net_g1", guildId: "g1", logoIdentifier: "f8_net_g1", name: "Proof Guild" };

  const staleSuccess = deferred(); w05.comparisonGates.push(staleSuccess);
  await mount("dashboard"); await staleSuccess.started;
  await until(() => Boolean(document.querySelector('button[aria-label="Current A lokales Spielerprofil öffnen"]')), "old current while comparison held");
  await click('button[aria-label="Current A lokales Spielerprofil öffnen"]');
  await until(() => profileName()==="Current A", "profile bound to old source generation");
  await until(() => w05.insightsEnds === w05.insightsStarts, "old profile Insights complete");
  await act(async () => { await scans.updateGuildHubLocalScan(sources[2].id, "Replacement.json", JSON.stringify(raw(now, "Replacement"))); });
  await until(() => document.body.innerText.includes("Replacement A"), "new Current generation commits independently");
  await until(() => !profileName() && Boolean(document.querySelector('.profile-overlay--local [role="alert"]')), "changed routed observation rejects old source generation");
  assert(new URLSearchParams(routing.location!.search).get("source")===sources[2].id, "source change never switches the observation anchor");
  await until(() => !document.body.innerText.includes("Loading historical comparison"), "new comparison settles");
  const successEnds = w05.comparisonEnds;
  const successCommits = w05.comparisonCommits;
  await act(async () => staleSuccess.release());
  await until(() => w05.comparisonEnds > successEnds, "old successful comparison completes");
  assert(w05.comparisonCommits === successCommits, "late successful comparison never reaches a state writer");
  assert(document.body.innerText.includes("Replacement A") && !profileName(), "old successful comparison cannot restore old Current/profile");
  await escape();
  await act(async () => { await scans.updateGuildHubLocalScan(sources[1].id, "EmptyHistory.json", JSON.stringify({ players: [], groups: raw(previous, "Historical").groups })); });
  await until(() => document.body.innerText.includes("No comparison members available"), "empty historical members");
  assert(document.body.innerText.includes("Replacement A"), "empty comparison preserves Current");
  await act(async () => { await scans.updateGuildHubLocalScan(sources[1].id, "Historical.json", JSON.stringify(raw(previous, "Historical"))); });
  await act(async () => { await scans.updateGuildHubLocalScan(sources[2].id, "Current.json", JSON.stringify(raw(now, "Current"))); });
  await until(() => document.body.innerText.includes("Current A") && !document.body.innerText.includes("Loading historical comparison"), "sources restored through normal owner writes");
  passed.push("same-source generation change rejects late comparison success; hashed routed target reports Changed at original anchor; empty comparison preserves Current");

  await mount("toplist");
  await click('[role="tab"]');
  await until(() => Boolean(document.querySelector('[data-player="Current A"]')), "actual Toplist row caller ready");
  w05.raw = []; w05.core = [];
  const slow = { ...deferred(), id: sources[2].id }; w05.rawGates.push(slow);
  const beforeEnds = w05.actionEnds;
  await click('[data-player="Current A"]'); await slow.started;
  await click('[data-player="Current B"]'); await until(() => profileName() === "Current B", "newer B opens");
  slow.release(); await until(() => w05.actionEnds >= beforeEnds + 2, "both actions completed");
  assert(profileName() === "Current B", "old A cannot replace B or its status");
  assert(currentCore().filter(item => item.name === "Current B").length === 1, "selected B normalized once; guild-average work is counted separately");
  await until(() => w05.insightsEnds === w05.insightsStarts, "B Insights settled");
  const opened = w05.profile;
  await act(async () => w05.filters.setClasses(["warrior"]));
  await until(() => Boolean(document.querySelector('[data-player="Current B"]')), "filtered table ready");
  assert(dialog() && w05.profile === opened, "pure filter retains committed Toplist profile");
  passed.push("actual Toplist A slow/B fast; selected-only normalization; open profile survives filter");

  const closeGate = { ...deferred(), id: sources[2].id }; w05.rawGates.push(closeGate);
  const closeEnds = w05.actionEnds;
  await click('[data-player="Current A"]'); await closeGate.started;
  await click('.profile-overlay'); assert(!dialog(), "backdrop invalidates pending A and opened B");
  closeGate.reject(new Error("late read failure")); await until(() => w05.actionEnds > closeEnds, "late failure handled");
  assert(!dialog() && !document.querySelector('[role="alert"]'), "late error neither opens nor changes status");

  const escapeGate = { ...deferred(), id: sources[2].id }; w05.rawGates.push(escapeGate);
  const escapeEnds = w05.actionEnds;
  await click('[data-player="Current A"]'); await escapeGate.started;
  await escape(); escapeGate.release(); await until(() => w05.actionEnds > escapeEnds, "pending Escape action settles");
  assert(!dialog() && !document.body.innerText.includes("Spielerprofil wird geladen"), "pending Escape leaves closed and no loading");

  const dependencyGate = { ...deferred(), id: sources[2].id }; w05.validityGates.push(dependencyGate);
  const dependencyEnds = w05.actionEnds;
  await click('[data-player="Current A"]'); await dependencyGate.started;
  await act(async () => w05.filters.setServers([]));
  await until(()=>!document.querySelector('[data-player="Current B"]'),"background dataset emptied while exact route pending");
  assert(new URLSearchParams(routing.location!.search).get("source")===sources[2].id,"accepted exact route has its own observation contract");
  await act(async () => w05.filters.setServers(["F8"]));
  await until(()=>Boolean(document.querySelector('[data-player="Current B"]')),"new dataset revision ready");
  await click('[data-player="Current B"]'); await until(()=>profileName()==="Current B","new target after dataset/view change");
  dependencyGate.release(); await until(() => w05.actionEnds > dependencyEnds, "context invalidation after Raw + metadata");
  assert(profileName()==="Current B", "dataset/view change and newer routed target prevent old pending A/status overwrite");
  await escape();
  await act(async () => w05.filters.setServers(["F8"]));
  await until(() => Boolean(document.querySelector('[data-player="Current A"]')), "toplist restored");
  const sourceGate = { ...deferred(), id: sources[2].id }; w05.rawGates.push(sourceGate);
  const sourceEnds = w05.actionEnds;
  await click('[data-player="Current A"]'); await sourceGate.started;const sourceAttempt=w05.entryStarts;
  await act(async () => { await scans.updateGuildHubLocalScan(sources[2].id, "ChangedDuringOpen.json", JSON.stringify(raw(now, "Source Changed"))); });
  await until(() => !document.body.innerText.includes("Spielerprofil wird geladen"), "pending source dependency invalidated");
  await act(async () => sourceGate.release()); await until(() => w05.entryEnds.includes(sourceAttempt), "stale source delivery settles");
  await until(()=>profileName()==="Source Changed A", "new un-hashed exact observation replaces old generation after old delivery");
  assert(w05.profile?.analytics.scannedAtMs===now && w05.profile?.analytics.memberRef==="f8_net_p1", "un-hashed source refresh keeps individual time/player");
  assert(w05.profile?.currentSeed?.validity.sourceGeneration===(await scans.readGuildHubLocalScanSourceValidity([sources[2].id])).get(sources[2].id)?.sourceGeneration,"visible profile holds the new valid generation");
  assert(new URLSearchParams(routing.location!.search).get("source")===sources[2].id,"changed source retains exact anchor");
  await escape();
  await act(async () => { await scans.updateGuildHubLocalScan(sources[2].id, "Current.json", JSON.stringify(raw(now, "Current"))); });
  const unmountGate = { ...deferred(), id: sources[2].id }; w05.rawGates.push(unmountGate);
  const unmountEnds = w05.actionEnds;
  await click('[data-player="Current A"]'); await unmountGate.started;
  await act(async () => root!.unmount()); root = undefined;
  unmountGate.release(); await until(() => w05.actionEnds > unmountEnds, "unmounted action settles");
  assert(!dialog(), "unmount blocks late setter");
  passed.push("actual Toplist: Backdrop + late error, pending Escape, real dataset revision plus newer routed target after metadata, un-hashed exact source refresh during Raw delivery, Unmount; no late loading/status writes");

  // Actual monthly Compare selection and __localRow pass-through; the current
  // normal table still has October, while Compare selects September/August.
  await mount("toplist"); await click('[role="tab"]');
  await until(() => Boolean(document.querySelector('[data-player="Current A"]')), "normal current dataset");
  await click('[data-testid="historical-compare"]');
  await click('[data-testid="compare-from-august"]');
  await click('[data-testid="compare-to-september"]');
  await until(() => Boolean(document.querySelector('[data-player="Historical A"]')), "actual monthly Compare row");
  await click('[data-player="Historical A"]'); await until(() => profileName() === "Historical A", "historical Compare row opens");
  assert(w05.profile?.sourceScanId === sources[1].id && w05.profile?.analytics.scannedAtMs === previous, "Compare anchor remains despite newer scan");
  await until(() => w05.insightsEnds === w05.insightsStarts, "historical Compare Insights settled");
  await escape();
  passed.push("actual monthly Compare row stays at selected source/time despite newer source");

  // Directly count the missing-core seeded adapter + actual Insights path.
  const scan = (await scans.getGuildHubLocalScan(sources[2].id))!;
  const dependencies = await captureLocalDataDependencies({ sourceIds: [scan.id] });
  const target = { sourceScanId: scan.id, sourcePlayerKey: "f8_net_p1", sourceMemberRef: "f8_net_p1", scannedAtMs: now, scannedAtIso: new Date(now).toISOString(), guild: { name: "Proof Guild", server: "F8", identifier: "f8_net_g1" } };
  const seed = createLocalPlayerCurrentSeed({ scan, dependencies, coreLookup: new Map() }, target)!;
  w05.raw = []; w05.core = [];
  const profile = buildLocalPlayerProfileModel({ ...target, rawPlayer: seed.rawPlayer, currentSeed: seed });
  await buildLocalPlayerInsights(profile);
  assert(currentRawReads().length === 0, "missing-core seed + Insights needs no Currentpayload reload");
  const selectedCore = currentCore().filter(item => item.name === "Current A");
  assert(selectedCore.length === 1, "selected Current normalized exactly once; Insights uses same core");
  assert(dashboardProfile.analytics.scannedAtMs===now && dashboardProfile.analytics.memberRef==="f8_net_p1", "current actual receiver preserves player/time");
  const historyReads = w05.raw.filter(item => item.stack.includes("readRanksFromMatchedSnapshots")).length;
  assert(historyReads >= 3, "historical reads are exercised and counted separately");
  passed.push(`missing-core seed: Current reads 0, selected Current normalization 1, historical rank reads ${historyReads} counted separately`);
  await act(async () => root!.unmount()); root = undefined;
  assert(w05.unhandled.length === 0, "no unhandled Promise rejection");
  return passed;
};
w05.ready = true;
