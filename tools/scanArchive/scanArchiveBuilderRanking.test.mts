import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync, strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { CLASSES } from "../../src/data/classes.ts";
import { buildScanArchiveBatches, createScanArchiveBuildPlanCore, type ScanArchiveBuilderCoreOptions } from "../../src/lib/scanArchive/archiveBuilderCore.ts";
import { PLAYER_RANKING_KEYS, GUILD_RANKING_KEYS, validateMonthlyRanking, rankingPoolForMonth, type MonthlyRankingPayload } from "../../src/lib/scanArchive/monthlyRanking.ts";
import { validateScanArchiveManifest } from "../../src/lib/scanArchive/validation.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";
const deps = {
  gzip: (s: string) => gzipSync(strToU8(s), { level:9,mtime:0 }), gunzip: (b: Uint8Array) => strFromU8(gunzipSync(b)),
  sha256: (b: Uint8Array) => createHash("sha256").update(b).digest("hex"),
  byteLength: (b: Uint8Array) => b.length, utf8ByteLength: (s: string) => strToU8(s).length,
};
const empty: ScanArchiveManifest = {schemaVersion:1,archiveYear:2026,revision:0,updatedAt:"2026-01-01",scanCount:0,serverCount:0,scans:[]};
const t = Date.UTC(2026,8,5), later=t+86400000;
const player = (server: string, id: number, level: number | null, baseMain: unknown = id*10, conBase: unknown = id, classId: number | null = 1, timestamp=t) => ({prefix:server,identifier:`${server}_p${id}`,name:`P${id}`,timestamp,level,xpTotal:100,baseMain,conBase,attrTotal:typeof baseMain === "number" ? baseMain*2 : baseMain,conTotal:conBase,class:classId,group:`${server}_g1`,mine:0,treasury:0});
const guild = (server: string, ids: number[], timestamp=t, id=1) => {
  const save: number[]=[];save[0]=id;
  ids.forEach((n,i)=>{save[14+i]=n;save[64+i]=100;save[314+i]=1;});
  return {prefix:server,identifier:`${server}_g${id}`,name:`G${id}`,timestamp,save};
};
const archive = new Map<string,Uint8Array>();
const build = async (opts: Omit<ScanArchiveBuilderCoreOptions<Uint8Array>,"year">) => {
  const plan = await createScanArchiveBuildPlanCore({year:2026,loadMonthlyRawScan:async scan=>JSON.parse(deps.gunzip(archive.get(scan.sha256)!)),loadMonthlyRankingBytes:async ref=>archive.get(ref.sha256)!,...opts},deps);
  if (!plan.conflicts.length) for (const file of plan.files) if (file.bytes) archive.set(file.sha256,file.bytes);
  return plan;
};
const rankings = (plan: Awaited<ReturnType<typeof build>>) => plan.files.filter(f=>f.kind==="ranking").map(f=>JSON.parse(deps.gunzip(f.bytes!)) as MonthlyRankingPayload);
const a="s1_eu",b="s2_eu";
const raw = {players:[player(a,1,100,100,10),player(a,2,90,20,null),player(a,3,90,0,0),{...player(a,4,90,null,9,999),xpTotal:50}, {...player(a,5,null,"invalid",null),xpTotal:null}],groups:[guild(a,[1,2,3,4,5])]};
const base = await build({manifest:empty,usageMode:"create-monthly",inputContent:JSON.stringify({players:[...raw.players,player(b,1,80,15,5,12)],groups:[...raw.groups,guild(b,[1])]})});
assert.deepEqual(base.conflicts,[]);
const rows=rankings(base), aa=rows.find(r=>r.server===a)!, bb=rows.find(r=>r.server===b)!;
assert.equal(rows.length,2);
assert.equal(aa.players.length,5);assert.equal(aa.guilds.length,1);
const p=(id:number)=>aa.players.find(p=>p.identifier===`${a}_p${id}`)!;
assert.deepEqual([p(1),p(2),p(3),p(4)].map(p=>p.ranks.level.server),[1,2,2,4]);
assert.equal(p(3).values.baseSum,0);assert.equal(p(3).ranks.baseSum.server,2);
assert.equal(p(4).ranks.level.globalClass,null);assert.equal(p(4).classId,999);assert.equal(p(4).ranks.level.global,4);
assert.equal(p(5).ranks.level.global,null);assert.equal(p(5).statuses.baseMain,"invalid");assert.equal(p(5).statuses.baseCon,"missing");
assert.equal(aa.guilds[0].memberBasisStatus,"complete");
assert.equal(aa.guilds[0].populations.baseMain,3);assert.equal(aa.guilds[0].populations.baseCon,3);assert.equal(aa.guilds[0].populations.baseSum,2);
assert.equal(aa.guilds[0].values.baseMain,40);assert.equal(aa.guilds[0].values.baseCon,19/3);assert.equal(aa.guilds[0].values.baseSum,55);assert.equal(aa.guilds[0].values.totalSum,105);
assert.equal(bb.players[0].ranks.level.global,5);assert.equal(bb.players[0].ranks.level.globalClass,1);
for (const payload of rows) validateMonthlyRanking(payload,{month:"2026-09",server:payload.server,pool:rankingPoolForMonth(base.manifestAfter,"2026-09"),metadata:base.manifestAfter.rankings!["2026-09"][payload.server]});
// Independent competition ranks: number of strictly better complete bases + one.
function reference(payloads: MonthlyRankingPayload[]) {
  for (const kind of ["players","guilds"] as const) {
    const all=payloads.flatMap(p=>p[kind]);
    for (const row of all) for (const key of kind==="players"?PLAYER_RANKING_KEYS:GUILD_RANKING_KEYS) {
      const v=row.values[key as keyof typeof row.values];
      const missing=v===null||(kind==="players"&&key==="level"&&(row as any).values.xpTotal===null);
      const better=(other:any)=>other.values[key]!==null&&(kind!=="players"||key!=="level"||other.values.xpTotal!==null)&&(other.values[key]>v!||(kind==="players"&&key==="level"&&other.values[key]===v&&other.values.xpTotal>(row as any).values.xpTotal));
      const ranks=(row as any).ranks[key];
      assert.equal(ranks.global,missing?null:1+all.filter(better).length);
      assert.equal(ranks.server,missing?null:1+all.filter(r=>r.server===row.server).filter(better).length);
      if(kind==="players") for(const [scope,filter] of [["globalClass",(r:any)=>r.classKey===(row as any).classKey],["serverClass",(r:any)=>r.classKey===(row as any).classKey&&r.server===row.server]] as const) assert.equal(ranks[scope],missing||(row as any).classKey===null?null:1+all.filter(filter).filter(better).length);
    }
  }
}
reference(rows);
const beforeOther=base.manifestAfter.rankings!["2026-09"][b];
const addRaw={players:[{...player(a,6,85,30,30,12,later),group:`${a}_g2`}],groups:[guild(a,[6],later,2)]};
const added=await build({manifest:base.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify(addRaw),loadMonthlyRawScan:async()=>{throw new Error("No renormalization of ranked baselines");}});
assert.deepEqual(added.conflicts,[]);const addedRows=rankings(added);reference(addedRows);
assert.equal(addedRows.find(r=>r.server===b)!.players[0].ranks.level.global,6);
assert.equal(addedRows.find(r=>r.server===b)!.players[0].ranks.level.globalClass,2);
assert.equal(addedRows.find(r=>r.server===b)!.guilds[0].ranks.level.global,3);
assert.equal(addedRows.find(r=>r.server===b)!.guilds[0].ranks.baseSum.global,3);
assert.equal(added.files.filter(f=>f.kind==="ranking").length,2);
assert.notEqual(added.manifestAfter.rankings!["2026-09"][b].cohortId,beforeOther.cohortId);
assert.notEqual(added.manifestAfter.rankings!["2026-09"][b].sha256,beforeOther.sha256);
// Exact observation winner and full guild source promotion are retained.
const update=await build({manifest:added.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify({players:raw.players.map(p=>({...p,timestamp:later+1,level:120})),groups:[guild(a,[1,2,3,4,5],later+1)]})});
assert.deepEqual(update.conflicts,[]);assert.equal(rankings(update).find(r=>r.server===a)!.players.find(p=>p.identifier===`${a}_p1`)!.values.level,120);
const repeated=await build({manifest:added.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify(addRaw),loadMonthlyRankingBytes:async ref=>{
  const file=added.files.find(f=>f.relativePath===ref.path)!;return file.bytes!;
}});
assert(repeated.conflicts.some(c=>c.code==="add_no_new_ids"));assert.equal(repeated.files.length,0);
const user=await build({manifest:added.manifestAfter,usageMode:"archive-only",inputContent:JSON.stringify({players:[player(b,20,130,200,100,1,later+2)],groups:[]})});
assert.deepEqual(user.conflicts,[]);assert.equal(rankings(user).length,0);assert.deepEqual(user.manifestAfter.rankings,added.manifestAfter.rankings);
const legacy=structuredClone(base.manifestAfter);delete legacy.rankings;
const legacyAdd=await build({manifest:legacy,usageMode:"add-monthly",inputContent:JSON.stringify(addRaw)});
assert.deepEqual(legacyAdd.conflicts,[]);reference(rankings(legacyAdd));assert.deepEqual(rankings(legacyAdd).map(r=>r.players.map(p=>[p.identifier,p.values,p.ranks])),addedRows.map(r=>r.players.map(p=>[p.identifier,p.values,p.ranks])));
const unavailable=await build({manifest:legacy,usageMode:"add-monthly",inputContent:JSON.stringify(addRaw),loadMonthlyRawScan:async()=>{throw new Error("required source missing");}});
assert(unavailable.conflicts.length>0);assert.equal(rankings(unavailable).length,0);
const broken=await build({manifest:base.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify(addRaw),loadMonthlyRankingBytes:async()=>new Uint8Array([1,2,3])});
assert(broken.conflicts.some(c=>c.code==="ranking_basis_unavailable"));assert.equal(rankings(broken).length,0);
const mixed=structuredClone(base.manifestAfter);mixed.rankings!["2026-09"][b].cohortId="f".repeat(64);assert.throws(()=>validateScanArchiveManifest(mixed,2026),/gemischte/);
const invalid=structuredClone(aa);invalid.players[0].values.baseSum=999;assert.throws(()=>validateMonthlyRanking(invalid,{month:"2026-09",server:a,pool:aa.pool,metadata:base.manifestAfter.rankings!["2026-09"][a]}),/ungueltig/);
assert.equal(validateScanArchiveManifest(legacy,2026).rankings,undefined);
// Every registry class participates; valid zero XP and missing tie breakers differ.
const classes=await build({manifest:empty,usageMode:"create-monthly",inputContent:JSON.stringify({players:CLASSES.map(c=>({...player(a,c.id,0,0,0,c.id),xpTotal:0})),groups:[guild(a,CLASSES.map(c=>c.id))]})});
assert.deepEqual(classes.conflicts,[]);for(const p of rankings(classes)[0].players){assert.equal(p.ranks.level.global,1);assert.equal(p.ranks.level.globalClass,1);}
const noXP=await build({manifest:empty,usageMode:"create-monthly",inputContent:JSON.stringify({players:[{...player(a,1,100),xpTotal:null}],groups:[guild(a,[1])]})});assert.equal(rankings(noXP)[0].players[0].ranks.level.global,null);
// Monthly replacement retains other official servers, rebuilding their common stand.
const replacement=await build({manifest:base.manifestAfter,usageMode:"create-monthly",inputContent:JSON.stringify({players:[player(a,10,101,40,40,1,later+3)],groups:[guild(a,[10],later+3)]}),loadMonthlyRankingBytes:async ref=>base.files.find(f=>f.relativePath===ref.path)!.bytes!});assert.deepEqual(replacement.conflicts,[]);assert.equal(rankings(replacement).find(r=>r.server===b)!.players.length,1);
// Real ZIP round trip checks actual bytes, metadata and replacement paths.
const mtime=new Date(1980,0,1);const zip=zipSync(Object.fromEntries([["manifest.json",strToU8(JSON.stringify(added.manifestAfter))],...added.files.filter(f=>f.bytes).map(f=>[f.relativePath,f.bytes!])] as Array<[string,Uint8Array]>),{mtime});
const entries=unzipSync(zip), manifest=validateScanArchiveManifest(JSON.parse(strFromU8(entries["manifest.json"])),2026);
for(const file of added.files.filter(f=>f.bytes)){assert.equal(deps.sha256(entries[file.relativePath]),file.sha256);assert.equal(entries[file.relativePath].length,file.compressedBytes);}
for(const ref of Object.values(manifest.rankings!["2026-09"])){assert.equal(deps.sha256(entries[ref.path]),ref.sha256);assert.equal(strToU8(deps.gunzip(entries[ref.path])).length,ref.uncompressedBytes);}
console.log("W59 rankings: monthly, winners, ties, populations, all classes, global Add, legacy, corruption, User and ZIP passed");

// A replaced guild can release a promoted member: restore another selected guild's
// exact member observation, then the earliest observation when both release it.
const releaseInputs = { players: [
  { ...player(a,1,100,10,10,1,t), group: null },
  player(a,1,200,20,20,1,t+1),
  { ...player(a,1,300,30,30,1,t+2), group: `${a}_g2` },
], groups: [guild(a,[1],t+1), guild(a,[1],t+2,2)] };
const promoted = await build({manifest:empty,usageMode:"create-monthly",inputContent:JSON.stringify(releaseInputs)});
assert.deepEqual(promoted.conflicts,[]);assert.equal(rankings(promoted)[0].players[0].values.level,300);
assert.equal(rankings(promoted)[0].players[0].observations.length,3);
const releaseSecond = await build({manifest:promoted.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify({players:[{...player(a,2,400,40,40,1,t+3),group:`${a}_g2`}],groups:[guild(a,[2],t+3,2)]}),loadMonthlyRawScan:async()=>{throw new Error("stored observations required");}});
assert.deepEqual(releaseSecond.conflicts,[]);assert.equal(rankings(releaseSecond)[0].players.find(p=>p.identifier===`${a}_p1`)!.values.level,200);
const releaseFirst = await build({manifest:releaseSecond.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify({players:[player(a,3,500,50,50,1,t+4)],groups:[guild(a,[3],t+4)]}),loadMonthlyRawScan:async()=>{throw new Error("stored observations required");}});
assert.deepEqual(releaseFirst.conflicts,[]);assert.equal(rankings(releaseFirst)[0].players.find(p=>p.identifier===`${a}_p1`)!.values.level,100);
console.log("W59 stored observations preserve release/promotion winners across repeated Adds");

// Fail closed on structurally valid but false stored ranks, stale source pools,
// and mismatching months even if a caller supplies matching byte metadata.
const corruptRank=structuredClone(aa);corruptRank.players.find(p=>p.identifier===`${a}_p2`)!.ranks.level.global=1;
const corruptBytes=deps.gzip(JSON.stringify(corruptRank));const falseRankManifest=structuredClone(base.manifestAfter);
falseRankManifest.rankings!["2026-09"][a]={...falseRankManifest.rankings!["2026-09"][a],sha256:deps.sha256(corruptBytes),compressedBytes:corruptBytes.length,uncompressedBytes:deps.utf8ByteLength(JSON.stringify(corruptRank))};
const falseRankAdd=await build({manifest:falseRankManifest,usageMode:"add-monthly",inputContent:JSON.stringify(addRaw),loadMonthlyRankingBytes:async ref=>ref.path.includes(`/${a}/`)?corruptBytes:base.files.find(f=>f.relativePath===ref.path)!.bytes!});
assert(falseRankAdd.conflicts.some(c=>/gespeicherte Raenge/.test(c.message)));assert.equal(falseRankAdd.files.length,0);
const stale=structuredClone(aa);stale.pool[0].sources[0].sha256="f".repeat(64);assert.throws(()=>validateMonthlyRanking(stale,{month:"2026-09",server:a,pool:rankingPoolForMonth(base.manifestAfter,"2026-09"),metadata:base.manifestAfter.rankings!["2026-09"][a]}),/Eingabesets/);
assert.throws(()=>validateMonthlyRanking({...aa,month:"2026-10"},{month:"2026-09",server:a,pool:aa.pool,metadata:base.manifestAfter.rankings!["2026-09"][a]}),/Format\/Monat/);
const partialPool=structuredClone(base.manifestAfter);delete partialPool.rankings!["2026-09"][b];assert.throws(()=>validateScanArchiveManifest(partialPool,2026),/unvollstaendiger/);
// Guild averages retain their exact, unrounded comparison value.
const precise=await build({manifest:empty,usageMode:"create-monthly",inputContent:JSON.stringify({players:[player(a,1,100,1.0001,0),{...player(a,2,100,1.0002,0),group:`${a}_g2`}],groups:[guild(a,[1]),guild(a,[2],t,2)]})});
assert.deepEqual(precise.conflicts,[]);const preciseRows=rankings(precise)[0];assert.equal(preciseRows.guilds.find(g=>g.guildIdentifier===`${a}_g2`)!.ranks.baseMain.server,1);assert.equal(preciseRows.guilds.find(g=>g.guildIdentifier===`${a}_g1`)!.ranks.baseMain.server,2);assert(preciseRows.players.every(p=>p.ranks.mine.server===1&&p.ranks.treasury.global===1));
console.log("W59 stale/malformed bases, false ranks, precise averages and zero fortress values passed");

// W59-N01: an identical partial upload initializes the whole official legacy month.
const backfill = await build({manifest:legacy,usageMode:"add-monthly",inputContent:JSON.stringify(raw)});
assert.deepEqual(backfill.conflicts, [], "identical legacy Add must emit rankings");
assert.equal(backfill.batches.length, 0);
assert.equal(backfill.summary.newScans, 0);
assert(backfill.monthlyTargets.every(t => t.addedPlayers === 0 && t.addedGuilds === 0 && t.updatedPlayers === 0 && t.updatedGuilds === 0));
assert.deepEqual(backfill.manifestAfter.scans, legacy.scans);
assert.deepEqual(backfill.manifestAfter.toplists, legacy.toplists);
assert.deepEqual(backfill.toplistChanges, {current:[],monthly:[]});
assert.equal(backfill.manifestAfter.revision, legacy.revision + 1);
assert.deepEqual(backfill.files.map(f => f.kind), ["ranking", "ranking"]);
assert.deepEqual(rankings(backfill), rows);
reference(rankings(backfill));
const backfillRepeat = await build({manifest:backfill.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify(raw),updatedAt:"2026-10-14T12:00:00Z",loadMonthlyRawScan:async()=>{throw new Error("repeat must use validated rankings");}});
assert(backfillRepeat.conflicts.some(c => c.code === "add_no_new_ids"));
assert.equal(backfillRepeat.files.length, 0);
assert.deepEqual(backfillRepeat.manifestAfter, backfill.manifestAfter);
const missingOther = await build({manifest:legacy,usageMode:"add-monthly",inputContent:JSON.stringify(raw),loadMonthlyRawScan:async scan=>{if(scan.server===b)throw new Error(`required official member ${scan.id} missing`);return JSON.parse(deps.gunzip(archive.get(scan.sha256)!));}});
assert(missingOther.conflicts.some(c => c.code === "ranking_basis_unavailable" && c.message.includes("required official member")));
assert.equal(missingOther.files.length, 0);
const missingTarget = await build({manifest:legacy,usageMode:"add-monthly",inputContent:JSON.stringify(raw),loadMonthlyRawScan:async()=>{throw new Error("required target member missing");}});
assert(missingTarget.conflicts.length > 0);
assert.equal(missingTarget.files.length, 0);
const corruptRepeat = await build({manifest:backfill.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify(raw),loadMonthlyRankingBytes:async()=>new Uint8Array([1,2,3])});
assert(corruptRepeat.conflicts.some(c => c.code === "ranking_basis_unavailable"));
assert.equal(corruptRepeat.files.length, 0);
console.log("W59-N01 identical Add: complete legacy month, zero data changes, validated repeat and missing/corrupt bases passed");

// W123: independent five-attribute fixtures, wire compatibility and normal Add migration.
const fivePlayer = (server: string, id: number, bases: unknown[], bonuses: unknown[] = [1,2,3,4,5], classId = 1, timestamp = t) => {
  const save: unknown[] = Array(70).fill(0);
  save[1]=id; save[3]=100; save[4]=100; save[5]=200; save[20]=classId;
  bases.forEach((v,i)=>save[30+i]=v); bonuses.forEach((v,i)=>save[35+i]=v);
  return {...player(server,id,100,99999,99999,classId,timestamp), own:1,saveVersion:2,save};
};
const fiveRaw = {players:[
  fivePlayer(a,1,[100,1,1,100,1]), // Main+CON 200; five 203
  fivePlayer(a,2,[90,100,100,90,100]), // Main+CON 180; five 480
  fivePlayer(a,3,[0,0,0,0,0]),
  {...player(a,4,100,10,20),baseStats:123456,totalStats:654321}, // generic sums prove no individual off-attributes
  fivePlayer(a,5,[10,"invalid",3,20,4]),
  fivePlayer(a,6,[1,2,3,4,5],[0,0,0,0,0]),
  fivePlayer(a,7,[1,2,3,4,5],[1,"invalid",1,1,1]),
  fivePlayer(a,8,[1,2,3,4,5],[1,1,1,1,1],999),
  fivePlayer(a,9,[100,1,1,100,1]),
  fivePlayer(b,1,[100,1,1,100,1]),
],groups:[guild(a,[1,2,3,4,5,6,7,8,9]),guild(b,[1])]};
const five = await build({manifest:empty,usageMode:"create-monthly",inputContent:JSON.stringify(fiveRaw)});
assert.deepEqual(five.conflicts,[]); const fiveRows=rankings(five); reference(fiveRows);
const f=fiveRows.find(r=>r.server===a)!;const fp=(id:number)=>f.players.find(p=>p.identifier===`${a}_p${id}`)!;
assert.equal(f.schemaVersion,2);assert.equal(f.projection,"monthly-ranking.v2");
assert.deepEqual([fp(1).values.baseAllSum,fp(1).values.totalAllSum],[203,218]);
assert.deepEqual([fp(2).values.baseAllSum,fp(2).values.totalAllSum],[480,495]);
assert(fp(1).ranks.baseSum.server!<fp(2).ranks.baseSum.server!);
assert(fp(1).ranks.baseAllSum.server!>fp(2).ranks.baseAllSum.server!);
assert.deepEqual(fp(1).ranks.baseAllSum, {server:2,global:2,serverClass:2,globalClass:2});
assert.deepEqual(fp(9).ranks.baseAllSum,fp(1).ranks.baseAllSum);
assert.equal(fp(3).values.baseAllSum,0);assert.equal(fp(3).statuses.baseAllSum,"available");
assert.equal(fp(4).values.baseAllSum,null);assert.equal(fp(4).statuses.baseAllSum,"missing");
assert.equal(fp(5).values.baseAllSum,null);assert.equal(fp(5).statuses.baseAllSum,"invalid");
assert.equal(fp(6).values.baseAllSum,15);assert.equal(fp(6).values.totalAllSum,null);assert.equal(fp(6).statuses.totalAllSum,"missing");
assert.equal(fp(7).values.baseAllSum,15);assert.equal(fp(7).values.totalAllSum,null);assert.equal(fp(7).statuses.totalAllSum,"invalid");
assert.equal(fp(8).ranks.baseAllSum.globalClass,null);assert.equal(fp(8).values.baseAllSum,15);
assert.equal(f.guilds[0].populations.baseAllSum,7);assert.equal(f.guilds[0].populations.totalAllSum,5);
assert.equal(f.guilds[0].values.baseAllSum,(203+480+0+15+15+15+203)/7);
assert.equal(f.guilds[0].values.totalAllSum,(218+495+15+20+218)/5);
const incompleteFive=await build({manifest:empty,usageMode:"create-monthly",inputContent:JSON.stringify({players:[fivePlayer(a,1,[1,2,3,4,5])],groups:[guild(a,[1,2])]})});
assert.deepEqual(incompleteFive.conflicts,[]);const ig=rankings(incompleteFive)[0].guilds[0];
assert.equal(ig.memberBasisStatus,"incomplete");assert.equal(ig.populations.baseAllSum,1);assert.equal(ig.values.baseAllSum,null);assert.equal(ig.ranks.baseAllSum.global,null);
const allFiveClasses=await build({manifest:empty,usageMode:"create-monthly",inputContent:JSON.stringify({players:CLASSES.map(c=>fivePlayer(a,c.id,[1,2,3,4,5],undefined,c.id)),groups:[guild(a,CLASSES.map(c=>c.id))]})});
for(const p of rankings(allFiveClasses)[0].players){assert.equal(p.values.baseAllSum,15);assert.equal(p.values.totalAllSum,30);assert.equal(p.ranks.baseAllSum.globalClass,1);assert.equal(p.ranks.totalAllSum.serverClass,1);}
const expectedFive={month:"2026-09",server:a,pool:f.pool,metadata:five.manifestAfter.rankings!["2026-09"][a]};
for(const change of [(v:any)=>delete v.players[0].values.baseAllSum,(v:any)=>delete v.players[0].observations[0].statuses.totalAllSum,(v:any)=>delete v.guilds[0].populations.totalAllSum,(v:any)=>v.schemaVersion=3,(v:any)=>v.projection="monthly-ranking.v1"]) {
  const bad=structuredClone(f);change(bad);assert.throws(()=>validateMonthlyRanking(bad,expectedFive),/ungueltig/);
}
// Construct genuine v1 wire fixtures with the old keys AND the old cohort bytes.
const stripAll=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,v)=>["baseAllSum","totalAllSum"].includes(key)?undefined:v));
async function v1Fixture(plan:Awaited<ReturnType<typeof build>>) {
 const manifest=structuredClone(plan.manifestAfter);
 for(const [month,refs] of Object.entries(manifest.rankings!)) {
  const pool=rankingPoolForMonth(manifest,month), sample=rankings(plan).find(p=>p.month===month)!;
  const cohortId=deps.sha256(deps.gzip(JSON.stringify({projection:"monthly-ranking.v1",coreNormalizerVersion:sample.coreNormalizerVersion,guildNormalizerVersion:sample.guildNormalizerVersion,month,pool})));
  for(const [server,ref] of Object.entries(refs)) {
   const payload=stripAll(rankings(plan).find(p=>p.server===server&&p.month===month));payload.schemaVersion=1;payload.projection="monthly-ranking.v1";payload.cohortId=cohortId;
   const json=JSON.stringify(payload),bytes=deps.gzip(json);
   refs[server]={...ref,schemaVersion:1,cohortId,sha256:deps.sha256(bytes),compressedBytes:bytes.length,uncompressedBytes:deps.utf8ByteLength(json)};
   archive.set(refs[server].sha256,bytes);
  }
 }
 return manifest;
}
const v1Five=await v1Fixture(five);validateScanArchiveManifest(v1Five,2026);
for(const [server,ref] of Object.entries(v1Five.rankings!["2026-09"])) {
 const v1=validateMonthlyRanking(JSON.parse(deps.gunzip(archive.get(ref.sha256)!)),{month:"2026-09",server,pool:rankingPoolForMonth(v1Five,"2026-09"),metadata:ref});
 assert.equal(v1.schemaVersion,1);assert.equal(v1.projection,"monthly-ranking.v1");
 for(const p of v1.players){assert.equal(p.values.baseAllSum,null);assert.equal(p.statuses.totalAllSum,"missing");assert.equal(p.ranks.baseAllSum.global,null);}
 assert.deepEqual(stripAll(v1.players),stripAll(fiveRows.find(p=>p.server===server)!.players));
}
const loads=new Map<string,number>();
const migrated=await build({manifest:v1Five,usageMode:"add-monthly",inputContent:JSON.stringify({players:fiveRaw.players.filter(p=>p.prefix===a),groups:[fiveRaw.groups[0]]}),loadMonthlyRawScan:async scan=>{loads.set(scan.id,(loads.get(scan.id)??0)+1);return JSON.parse(deps.gunzip(archive.get(scan.sha256)!));}});
assert.deepEqual(migrated.conflicts,[]);assert.equal(migrated.batches.length,0);assert.equal(migrated.summary.newScans,0);assert.equal(loads.size,2);assert([...loads.values()].every(n=>n===1));
assert.deepEqual(migrated.manifestAfter.scans,v1Five.scans);assert.deepEqual(migrated.manifestAfter.toplists,v1Five.toplists);assert(migrated.files.every(f=>f.kind==="ranking"));
assert.deepEqual(rankings(migrated),fiveRows);reference(rankings(migrated));
const migratedRepeat=await build({manifest:migrated.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify(fiveRaw),loadMonthlyRawScan:async()=>{throw new Error("v2 must reuse stored observations");}});
assert(migratedRepeat.conflicts.some(c=>c.code==="add_no_new_ids"));assert.equal(migratedRepeat.files.length,0);assert.deepEqual(migratedRepeat.manifestAfter,migrated.manifestAfter);
const missingV1=await build({manifest:v1Five,usageMode:"add-monthly",inputContent:JSON.stringify(fiveRaw),loadMonthlyRawScan:async scan=>{if(scan.server===b)throw new Error("missing original");return JSON.parse(deps.gunzip(archive.get(scan.sha256)!));}});
assert(missingV1.conflicts.some(c=>c.message.includes(v1Five.scans.find(s=>s.server===b)!.path)&&c.message.includes("missing original")));assert.equal(missingV1.files.length,0);assert.deepEqual(missingV1.manifestAfter,v1Five);
const allAdd=await build({manifest:migrated.manifestAfter,usageMode:"add-monthly",inputContent:JSON.stringify({players:[{...fivePlayer(a,10,[1000,1000,1000,1000,1000],undefined,1,later),group:`${a}_g2`}],groups:[guild(a,[10],later,2)]}),loadMonthlyRawScan:async()=>{throw new Error("v2 reuse");}});
assert.deepEqual(allAdd.conflicts,[]);reference(rankings(allAdd));assert.equal(rankings(allAdd).find(r=>r.server===b)!.players[0].ranks.baseAllSum.global,3);assert.equal(rankings(allAdd).find(r=>r.server===b)!.guilds[0].ranks.baseAllSum.global,2);
// Multipart sets retain non-winning observations, not merely the displayed row.
const v1Promoted=await v1Fixture(promoted);
const observationMigration=await build({manifest:v1Promoted,usageMode:"add-monthly",inputContent:JSON.stringify(releaseInputs)});
assert.deepEqual(observationMigration.conflicts,[]);assert.equal(observationMigration.batches.length,0);assert.equal(rankings(observationMigration)[0].players[0].observations.length,3);
assert.deepEqual(stripAll(rankings(observationMigration)[0].players),stripAll(rankings(promoted)[0].players));
console.log("W123: five components, statuses, classes, all rank scopes, v1 own cohort, no-ID Add, multipart observations, v2 reuse/repeat and missing-source blocker passed");

const absentClassRaw=fivePlayer(a,1,[1,2,3,4,5],undefined,null as any);
const absentClass=await build({manifest:empty,usageMode:"create-monthly",inputContent:JSON.stringify({players:[absentClassRaw],groups:[guild(a,[1])]})});
assert.deepEqual(absentClass.conflicts,[]);const absent=rankings(absentClass)[0].players[0];
assert.equal(absent.classKey,null);assert.equal(absent.values.baseAllSum,15);assert.equal(absent.ranks.baseAllSum.global,1);assert.equal(absent.ranks.baseAllSum.serverClass,null);
assert.equal(absent.values.totalAllSum,30);assert.equal(absent.ranks.totalAllSum.globalClass,null);
const futureMetadata=structuredClone(five.manifestAfter);(futureMetadata.rankings!["2026-09"][a] as any).schemaVersion=3;
assert.throws(()=>validateScanArchiveManifest(futureMetadata,2026),/Rankingreferenz/);
const mixedVersions=structuredClone(five.manifestAfter);mixedVersions.rankings!["2026-09"][a].schemaVersion=1;
assert.throws(()=>validateScanArchiveManifest(mixedVersions,2026),/gemischte Gesamtstaende/);
console.log("W123 generic sums, absent class information and strict manifest version validation passed");
