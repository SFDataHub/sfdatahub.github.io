import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { buildDashboardHistory, buildDashboardMemberTrends } from "../../src/pages/GuildHub/dashboardHistory.ts";
import { loadIdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution.ts";
import { linkPlayerIdentifiers } from "../../src/lib/identities/playerIdentityStore.ts";
import { linkGuildAliases } from "../../src/lib/identities/guildIdentityStore.ts";
const day=86400000, start=Date.UTC(2026,8,1), times=[start,start+day,start+2*day];
await linkPlayerIdentifiers("f8_net_p1","f8_net_p101",{source:"manual"});
await linkGuildAliases("f8_net_g1","f8_net_g101",{source:"manual"});
const identity=await loadIdentityResolutionSnapshot();
const members=Array.from({length:50},(_,i)=>({key:'f8_net_p'+(i+1),name:'Member '+i,classLabel:'Warrior',localRef:{identifier:'f8_net_p'+(i+1)}}));
const snapshots=times.map((snapshotTimestamp,i)=>({id:'s'+i,sourceScanId:'scan'+i,sourceScanFilename:'fixture',sourceImportedAt:'2026-10-17',timestamp:new Date(snapshotTimestamp).toISOString(),snapshotTimestamp}));
const guilds=times.map((snapshotTimestamp,i)=>({id:'g'+i,snapshotId:'s'+i,sourceScanId:'scan'+i,sourceScanFilename:'fixture',snapshotTimestamp,server:'f8_net',guildSegment:'1',guildIdentifier:i===0?'f8_net_g101':'f8_net_g1',guildName:'Guild',memberCount:50,averageLevel:100,averageBaseStats:100,averageTotalStats:200}));
const rows=times.flatMap((snapshotTimestamp,i)=>members.map((m,index)=>({id:'m'+i+'-'+index,snapshotId:'s'+i,sourceScanId:'scan'+i,sourceScanFilename:'fixture',snapshotTimestamp,memberRef:index===0&&i===0?'f8_net_p101':m.key,name:m.name,classId:'1',level:100,baseStats:999,totalStats:2000,xpTotal:10000+i*100+index,focusedBaseStats:1000+i*10+index,server:'f8_net',guildSegment:'1',groupSegment:'1',guildIdentifier:i===0?'f8_net_g101':'f8_net_g1',guildName:'Guild'})));
const input={identity,data:{snapshots,guilds,members:rows}};
const all=buildDashboardHistory(input,members,'f8_net_g1',times[2]);
assert.equal(all.xp.length,50);assert.deepEqual(all.xp[0].timePoints?.map(p=>p.value),[10000,10100,10200]);
assert.deepEqual(all.base[0].timePoints?.map(p=>p.value),[1000,1010,1020],'focused main + CON metric');
assert.equal(buildDashboardHistory(input,members,'f8_net_g1',times[1]).times.length,2,'observation anchor');
assert.equal(buildDashboardHistory(input,[{key:"f8_net_p999",name:"Foreign",classLabel:null}],"f8_net_g999",times[2]).times.length,0,"foreign player pool excluded");
const moved=structuredClone(input.data);moved.members[0].guildIdentifier="f8_net_g999";
assert.equal(buildDashboardHistory({identity,data:moved},members,"f8_net_g1",times[2]).xp[0].timePoints?.[0].value,10000,"current member history includes prior guild membership");
const missing=structuredClone(input.data);missing.members=missing.members.filter(r=>!(r.memberRef==='f8_net_p2'&&r.snapshotTimestamp===times[1]));
missing.members.find(r=>r.memberRef==='f8_net_p3'&&r.snapshotTimestamp===times[1])!.xpTotal=0;
missing.members.find(r=>r.memberRef==='f8_net_p4'&&r.snapshotTimestamp===times[1])!.xpTotal=NaN;
const gaps=buildDashboardHistory({identity,data:missing},members,'f8_net_g1',times[2]);
assert.deepEqual(gaps.xp[1].timePoints?.map(p=>p.value),[10001,null,10201]);
assert.equal(gaps.xp[2].timePoints?.[1].value,0,'real observed zero retained');
assert.equal(gaps.xp[3].timePoints?.[1].value,null,'non-finite values absent');
const trend=buildDashboardMemberTrends(all,'xp');assert.equal(trend.length,50);assert.equal(trend[0].pairs.length,2);assert.equal(trend[0].pairs[0].xpDelta,100);assert.equal(trend[0].pairs[0].xpPerDay,100);
assert.deepEqual(buildDashboardHistory(undefined,members,'f8_net_g1',times[2]).times,[]);
console.log('PASS: 50 actual-value series, identity aliases, guild and time scope, focused base metric, missing gaps/real zero/nonfinite, established dated member intervals');

// W108: individual additional metrics never fall back to Base; missing actual
// observations stay as null adjacent pairs and valid zero growth survives.
const extra:any=structuredClone(input);
for(const row of extra.data.members){const index=times.indexOf(row.snapshotTimestamp);row.attrTotal=200+index*7;row.conTotal=100+index*3;row.focusedTotalStats=row.attrTotal+row.conTotal;row.mine=0;row.treasury=45;}
extra.data.members.find((r:any)=>r.memberRef==='f8_net_p2'&&r.snapshotTimestamp===times[1]).mine=null;
const more=buildDashboardHistory(extra,members,'f8_net_g1',times[2]);
for(const [metric,growth] of [['attrTotal',7],['conTotal',3],['total',10],['mine',0],['treasury',0]] as const){
 const prepared=buildDashboardMemberTrends(more,metric);assert.equal(prepared[0].pairs[0].growth,growth);assert.equal(prepared[0].pairs[0].perDay,growth);assert.equal(buildDashboardMemberTrends(more,metric),prepared,'metric projection cached');
}
assert.deepEqual(buildDashboardMemberTrends(more,'mine')[1].pairs.map(pair=>pair.perDay),[null,null],'no crossing missing middle value');
assert.equal(buildDashboardMemberTrends(more,'mine')[0].pairs[0].endValue,0);
console.log('PASS W108 individual Total/Fortress mapping, exact adjacent gaps, finite zeros and cached selection');
