import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import { importGuildHubLocalScan } from "../../src/lib/guilds/localScanLibrary.ts";
import { materializeGuildAnalyticsSource, readGuildAnalyticsDerivedSource } from "../../src/lib/guilds/localGuildAnalyticsStore.ts";

const timestamp = Date.UTC(2026, 8, 19, 21, 31, 54, 199);
const players = Array.from({length:1201}, (_,i)=>({ identifier:`f28_net_p${i+1}`, name:`Member ${i+1}`,
  prefix:"f28_net", timestamp, class:1, level:100, xpTotal:1000+i, baseMain:100+i, conBase:50,
  guildIdentifier:"f28_net_g9108", guildName:"Welten im Wandel" }));
const {scan} = await importGuildHubLocalScan("atomic-member-writes.json", JSON.stringify({players,
  groups:[{identifier:"f28_net_g9108",prefix:"f28_net",name:"Welten im Wandel",timestamp,memberCount:players.length}]}));
const expected = await readGuildAnalyticsDerivedSource(scan.id);
assert.equal(expected.members.length,1201);
const db = await openDB("sfdatahub-guild-analytics");
const marker = await db.get("sources",scan.id);
const originalPut = IDBObjectStore.prototype.put;
const originalAdd = IDBObjectStore.prototype.add;
for (const failAt of [600,1201]) {
  let count=0, firstId:string|undefined;
  IDBObjectStore.prototype.put = function(value:any,...rest:any[]) {
    if(this.name!=="members") return originalPut.call(this,value,...rest);
    count++; firstId ??= value.id;
    // Real asynchronous ConstraintError after one or more successful groups.
    // Changed attempted XP makes a partial write observable after rollback.
    const attempted={...value,xpTotal:value.xpTotal+999};
    if(count===failAt) return originalAdd.call(this,{...attempted,id:firstId});
    return originalPut.call(this,attempted,...rest);
  };
  try {
    await assert.rejects(materializeGuildAnalyticsSource(scan),error=>
      error instanceof Error && ["ConstraintError","AbortError"].includes(error.name));
    assert.ok(count>=failAt,"Failure request actually issued");
  } finally { IDBObjectStore.prototype.put = originalPut; }
  assert.deepEqual(await readGuildAnalyticsDerivedSource(scan.id),expected,"All previous observations preserved on abort");
  assert.deepEqual(await db.get("sources",scan.id),marker,"Source marker preserved on abort");
}
const phases:string[]=[];
await materializeGuildAnalyticsSource(scan,{onCommitPhase:phase=>phases.push(phase)});
assert.deepEqual(await readGuildAnalyticsDerivedSource(scan.id),expected,"Every original observation retained after successful multi-group write");
assert.equal((await db.get("sources",scan.id)).snapshotCount,1);
assert.equal(phases.at(-1),"analytics-transaction-committed");
db.close();
console.log("PASS 1201 complete observations, XP/base/time anchors and source marker; asynchronous middle/final write errors roll back the entire replacement");
