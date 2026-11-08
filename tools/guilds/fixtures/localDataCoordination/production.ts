import { seedLegacyFixture, verifyLegacyUpgrade } from "./upgrade";
import { openDB } from "idb";
import * as scans from "../../../../src/lib/guilds/localScanLibrary";
import * as analytics from "../../../../src/lib/guilds/localGuildAnalyticsStore";
import { withLocalDataWrite } from "../../../../src/lib/local-data/localDataCoordination";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, subscribeToLocalDataDependencies } from "../../../../src/lib/local-data/localDataDependencies";
import { subscribeToLocalDataChanges } from "../../../../src/lib/local-data/localDataChanges";
import { linkPlayerIdentifiers, unlinkPlayerIdentifier, readPlayerIdentityChanges } from "../../../../src/lib/identities/playerIdentityStore";
import { loadIdentityResolutionSnapshot, revalidateIdentityResolutionSnapshot, resolvePlayerIdentity } from "../../../../src/lib/identities/identityResolution";
import { putLocalToplistSnapshot, deleteLocalToplistSnapshot } from "../../../../src/lib/toplists/localToplistStore";
import { startLocalToplistDerivationWorkerRun } from "../../../../src/lib/toplists/localToplistWorkerClient";
import type { GuildHubLocalScan } from "../../../../src/lib/guilds/localScanLibrary";

declare global { var w04DropLive: boolean; }
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const delay = (ms = 20) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 750; i++) { if (await predicate()) return; await delay(); }
  throw Error("Fixture timeout");
}
function gate() { let release!: () => void; const promise = new Promise<void>(r => release = r); return { promise, release }; }
export const content = (name: string, server = "f8_net", level = 100) => JSON.stringify({
  players: [{ identifier: `${server}_p1`, prefix: server, timestamp: 1791194400000, name, level, class: 1, guildIdentifier: `${server}_g1`, guildName: name }],
  groups: [{ identifier: `${server}_g1`, prefix: server, timestamp: 1791194400000, name }],
});
const command: Record<string, (...args: any[]) => Promise<any>> = {
  ready: () => scans.ensureSfDataHubLocalDataReady(),
  import: async (name, server = "f8_net") => (await scans.importGuildHubLocalScan(`${name}.json`, content(name, server))).scan,
  importPreview: async preview => (await scans.commitGuildHubLocalScanPreview(preview)).scan,
  update: (id, name) => scans.updateGuildHubLocalScan(id, `${name}.json`, content(name)),
  delete: id => scans.deleteGuildHubLocalScans([id]),
  reset: () => analytics.resetGuildAnalyticsDerivedData(),
  link: () => linkPlayerIdentifiers("f8_net_p1", "s30_eu_p7", {source:"manual"}),
  unlink: () => unlinkPlayerIdentifier("f8_net_p1"),
  hold: () => withLocalDataWrite(async () => { globalThis.postMessage?.("holding"); await new Promise(() => {}); }),
  failImport: async () => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args: Parameters<typeof add>) {
      if (this.name === "localChanges") throw Error("injected receipt failure");
      return add.apply(this, args);
    };
    try { await scans.importGuildHubLocalScan("failed.json", content("Failed")); } catch (error) { return String(error); }
    finally { IDBObjectStore.prototype.add = add; }
    throw Error("Expected failed import");
  },
};
const driver = new BroadcastChannel("w04-test-driver");
export function installPeer(tag: string) {
  driver.onmessage = async ({data}) => {
    if (data.target !== tag) return;
    try { driver.postMessage({requestId:data.requestId, result:await command[data.action](...data.args)}); }
    catch (error) { driver.postMessage({requestId:data.requestId, error:String(error)}); }
  };
}
let requestNumber = 0;
const waiters = new Map<number, {resolve:(value:any)=>void; reject:(error:Error)=>void}>();
function peer(action: string, args: any[] = [], target = "tab") {
  const requestId = ++requestNumber;
  return new Promise<any>((resolve, reject) => {
    waiters.set(requestId, {resolve,reject});
    driver.postMessage({requestId,target,action,args});
  });
}
async function physical(id: string) {
  const db = await openDB("sfdatahub-guild-analytics");
  const result = await Promise.all(["sources","snapshots","members","guilds"].map(async store => (await db.getAll(store)).filter(row => row.sourceScanId === id)));
  db.close(); return result;
}
async function pauseCommit(scan: GuildHubLocalScan, afterAcquisition = false) {
  const locks = navigator.locks, request = locks.request.bind(locks);
  const entered = gate(), resume = gate();
  let intercepted = false;
  (locks as any).request = async (name: string, options: LockOptions, callback: (lock: Lock|null)=>Promise<any>) => {
    if (intercepted) return request(name, options, callback);
    intercepted = true;
    if (!afterAcquisition) { entered.release(); await resume.promise; return request(name, options, callback); }
    return request(name, options, async lock => { entered.release(); await resume.promise; return callback(lock); });
  };
  const job = analytics.materializeGuildAnalyticsSource(scan).then(() => "ok", error => String(error));
  await entered.promise;
  (locks as any).request = request;
  return {job, resume};
}

export async function run() {
  driver.onmessage = ({data}) => {
    const waiter = waiters.get(data.requestId); if (!waiter) return;
    waiters.delete(data.requestId); data.error ? waiter.reject(Error(data.error)) : waiter.resolve(data.result);
  };
  await seedLegacyFixture();
  await scans.ensureSfDataHubLocalDataReady();
  await verifyLegacyUpgrade();
  const worker = new Worker(new URL("./production.worker.ts", import.meta.url), {type:"module"});
  await new Promise<void>(resolve => {worker.onmessage = () => resolve();});
  await peer("ready"); await peer("ready", [], "worker");
  const a = (await scans.importGuildHubLocalScan("A.json", content("A"))).scan;
  let count = 0;
  const unsubscribe = scans.subscribeToSfDataHubLocalScanChanges(() => count++);
  await delay(80);
  const old = await pauseCommit(a);
  const next = await peer("update", [a.id, "New"]);
  const newer = await physical(a.id);
  old.resume.release();
  assert((await old.job).includes("changed before Analytics commit"), "old Analytics job rejected after other tab update");
  assert(same(await physical(a.id), newer), "new physical four-store contents preserved");
  await until(() => count === 1);
  await delay(80); assert(count === 1, "single Cross-Realm subscription notification");

  const protectedCommit = await pauseCommit(next, true);
  const mutation = peer("update", [a.id, "AfterProtected"], "worker");
  await until(async () => (await navigator.locks.query()).pending!.length > 0);
  assert((await scans.getGuildHubLocalScan(a.id))?.filename === "New.json", "Raw mutation must wait while Analytics owns commit lease");
  protectedCommit.resume.release(); assert(await protectedCommit.job === "ok", "protected Analytics commit completed");
  await mutation;
  assert((await scans.getGuildHubLocalScan(a.id))?.filename === "AfterProtected.json", "worker mutation commits after protected section");

  const current = (await scans.getGuildHubLocalScan(a.id))!;
  const resetBuild = await pauseCommit(current);
  await peer("reset", [], "worker"); resetBuild.resume.release();
  assert((await resetBuild.job).includes("Reset changed"), "old reset certificate rejected");
  assert((await physical(a.id)).every(rows => rows.length === 0), "no rows recreated after reset");
  await analytics.materializeGuildAnalyticsSource(current);
  const deletedBuild = await pauseCommit(current);
  await peer("delete", [a.id]); deletedBuild.resume.release();
  assert((await deletedBuild.job).includes("changed before Analytics commit"), "old job rejected after delete");
  assert(await scans.getGuildHubLocalScan(a.id) === null && (await physical(a.id)).every(rows => !rows.length), "no Raw/marker/row resurrection");

  console.log("PASS browser guarded commit, update, reset, delete");
  // Lost genuine BroadcastChannel events are suppressed by the driver only in
  // this receiving tab. Persisted catch-up must still detect Worker mutations.
  globalThis.w04DropLive = true;
  const foreign = await captureLocalDataDependencies({servers:["f8_net"]});
  const relevant = await captureLocalDataDependencies({servers:["s30_eu"]});
  let resumed = 0;
  const stopScoped = subscribeToLocalDataDependencies({servers:["s30_eu"]}, () => resumed++);
  await delay(100);
  const newSource = await peer("import", ["Relevant", "s30_eu"], "worker");
  await delay(80); assert(resumed === 0, "live event deliberately missed");
  assert((await revalidateLocalDataDependencies(foreign)).current, "foreign server certificate stays valid");
  assert(!(await revalidateLocalDataDependencies(relevant)).current, "unknown new relevant Source ID invalidates selection");
  window.dispatchEvent(new Event("focus")); await until(() => resumed === 1);
  stopScoped(); globalThis.w04DropLive = false;

  console.log("PASS browser missed-event and scoped server");
  const identityNeed = await captureLocalDataDependencies({playerAliases:["f8_net_p1"]});
  const identity = await loadIdentityResolutionSnapshot();
  const rawDb = await openDB("sfdatahub-local-data");
  const rawBefore = await rawDb.getAll("scans");
  await peer("link", [], "worker");
  assert(!(await revalidateLocalDataDependencies(identityNeed)).current, "Identity receipt invalidates alias need");
  assert(resolvePlayerIdentity(await revalidateIdentityResolutionSnapshot(identity), "f8_net_p1").resolved, "held snapshot revalidated");
  assert(same(await rawDb.getAll("scans"), rawBefore), "Identity leaves literal Raw unchanged");
  await peer("unlink");
  assert((await readPlayerIdentityChanges()).length === 2, "independent committed Identity receipts");

  console.log("PASS browser Identity");
  // Real production Toplist Worker; stale payload rejected by persisted source
  // generation + dependency and reset certificates at the guarded final put.
  const topScan = (await scans.importGuildHubLocalScan("Top.json", content("Top"))).scan;
  const source = {manifestYear:2026, archiveScanId:"top", archiveSha256:"a".repeat(64), server:"f8_net", scanTimestamp:1791194400000,
    localScanId:topScan.id, localContentHash:topScan.contentHash, sourceGeneration:topScan.sourceGeneration,
    normalizerVersion:topScan.normalizerVersion, coreNormalizerVersion:topScan.coreNormalizerVersion,
    resetGeneration:await scans.readLocalToplistResetGeneration(topScan.id), dependencies:await captureLocalDataDependencies({sourceIds:[topScan.id]}),
    confirmation:{kind:"archiveSource" as const, archiveScanId:"top", archiveSha256:"a".repeat(64)}};
  const payload = (await startLocalToplistDerivationWorkerRun({sources:[source]}).promise)[0];
  await peer("update", [topScan.id,"TopChanged"]);
  let rejected = false; try {await putLocalToplistSnapshot(payload);} catch {rejected = true;}
  assert(rejected && (await scans.listGuildHubLocalToplistSnapshotRecords()).length === 0, "old actual Worker payload not cached");

  console.log("PASS browser actual Toplist worker");
  const preview = await scans.createGuildHubLocalScanImportPreview("Reconcile.json", content("Reconcile"));
  const hold = gate(), entered = gate();
  const lease = withLocalDataWrite(async () => {entered.release(); await hold.promise;});
  await entered.promise;
  const importing = peer("importPreview", [preview]);
  await until(async () => (await navigator.locks.query()).pending!.length > 0);
  const reconciling = analytics.reconcileGuildAnalyticsSources();
  hold.release(); await Promise.all([lease,importing,reconciling]);
  assert((await analytics.readGuildAnalyticsDerivedSource(preview.id)).members.length === 1, "Reconcile retains new source imported ahead of its guarded inventory");

  console.log("PASS browser Reconcile");
  const beforeFailure = await rawDb.getAll("scans"), changesBeforeFailure = await rawDb.getAll("localChanges");
  assert((await peer("failImport", [], "worker")).includes("injected receipt failure"), "real transaction failure propagated");
  assert(same(await rawDb.getAll("scans"), beforeFailure) && same(await rawDb.getAll("localChanges"), changesBeforeFailure), "browser Tx abort rolls back domain and receipt");
  const failing = await scans.createGuildHubLocalScanImportPreview("DerivedError.json", content("DerivedError"));
  try {await scans.commitGuildHubLocalScanPreview(failing, {analytics:{onPhase:phase => {if(phase.phase === "saving-derived-analytics") throw Error("injected Analytics failure");}}});} catch { /* Expected after Rawcommit. */ }
  assert(await scans.getGuildHubLocalScan(failing.id), "Raw survives subsequent Derived failure");
  assert((await scans.readSfDataHubLocalChanges()).some(change => change.sourceIds.includes(failing.id)), "successful Raw receipt survives Derived failure");
  await analytics.materializeGuildAnalyticsSource((await scans.getGuildHubLocalScan(failing.id))!);

  console.log("PASS browser transaction failure and Raw/Derived retry");
  const holding = new Promise<void>(resolve => { worker.onmessage = ({data}) => {if(data === "holding") resolve();}; });
  void peer("hold", [], "worker"); await holding;
  const afterTermination = scans.importGuildHubLocalScan("AfterTerminate.json", content("AfterTerminate"));
  await until(async () => (await navigator.locks.query()).pending!.length > 0);
  worker.terminate(); await afterTermination;
  assert((await scans.getGuildHubLocalScan(newSource.id))?.filename === "Relevant.json", "existing Raw retained after terminated Worker");
  unsubscribe(); rawDb.close(); driver.close();
  return "two tabs + genuine Writer and Toplist workers: update/delete/reset/guarded commit/reconcile/missed event/scoped server/Identity/Tx failure/retry/termination passed";
}
