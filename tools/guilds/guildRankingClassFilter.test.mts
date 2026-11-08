import assert from 'node:assert/strict';
import { CLASSES } from '../../src/data/classes.ts';
import { buildLocalGuildRanking, filterGuildRankingClass, selectGuildRankingClass, selectCompactGuildRanking, guildModeCategories } from '../../src/pages/GuildHub/localGuildRanking.ts';
import type { LocalGuildStatsMember } from '../../src/pages/GuildHub/localGuildPlayerStats.ts';
const members:LocalGuildStatsMember[]=CLASSES.map((meta,index)=>({key:'f8_net_p'+index,name:'Player '+index,classLabel:meta.label,
 playerStats:{baseMain:100-index,conBase:30,sumBaseTotal:130-index,attrTotal:200-index,conTotal:60,totalStats:260-index,level:500-index,xpTotal:10000-index,hofRank:20+index,mine:100-index,treasury:40-index}}));
members.push({...members[0],key:'f8_net_p900',classLabel:null},{...members[0],key:'f8_net_p901',classLabel:'Unknown Warrior'});
const historical=members.map(member=>({...member,playerStats:{...member.playerStats,attrTotal:member.playerStats.attrTotal!-10,totalStats:member.playerStats.totalStats!-10}})).reverse();
for(const mode of ['general','progress','base','total','fortress'] as const)for(const category of guildModeCategories(mode)){
 const rows=buildLocalGuildRanking(members,historical,category,mode,null,{players:historical,rosterComplete:true});
 const original=structuredClone(rows);
 assert.equal(filterGuildRankingClass(rows,null),rows,'All retains reference/order');
 for(const meta of CLASSES){
  const filtered=filterGuildRankingClass(rows,meta.key);const expected=rows.filter(row=>row.classLabel===meta.label);
  assert.deepEqual(filtered,expected);assert.equal(filtered.length,1);
  assert.equal(filtered[0],rows.find(row=>row.key===filtered[0].key),'same prepared row, ranks and comparison unchanged');
  assert.equal(filtered[0].rank,rows.find(row=>row.key===filtered[0].key)!.rank);
  assert(selectCompactGuildRanking(filtered,null).filter(Boolean).every(row=>row!.classLabel===meta.label));
 }
 assert.deepEqual(rows,original,'filter has no mutation');
 assert.equal(filterGuildRankingClass(rows.slice(0,0),'mage').length,0);
}
assert.equal(filterGuildRankingClass([{classLabel:'warrior'},{classLabel:'1'},{classLabel:null},{classLabel:'Unknown Warrior'}],'warrior').length,2);
console.log('PASS: all supported classes and ranking modes, unknown/empty, original ranks/deltas/order, current/history assignment and compact selection');

const multi=filterGuildRankingClass(members,['Warrior','Mage']);assert.deepEqual(multi.map(m=>m.classLabel),['Warrior','Mage']);
assert.deepEqual(filterGuildRankingClass(members,['Unknown Warrior']),[],'unknown selection never becomes all classes');
assert.equal(filterGuildRankingClass(members,[]),members,'empty existing pie selection means All');

// Both stands use the same union of classes, including historical members who
// have left. Value matching outside the guild remains identity based.
const member = (id: number, cls: string | null, value: number): LocalGuildStatsMember => ({
 key: `f8_net_p${id}`, name: `Member ${id}`, classLabel: cls,
 playerStats: {baseMain:value, conBase:value, sumBaseTotal:value, attrTotal:value, conTotal:value, totalStats:value, level:value, xpTotal:value, hofRank:1000-value, mine:value, treasury:value},
});
const current = [member(1,'Warrior',100),member(2,'Warrior',90),member(3,'Warrior',80),member(4,'Mage',70),member(5,'Mage',60),member(6,'Mage',50),member(7,'Scout',0),member(8,'Druid',10)];
const past = [member(1,'Warrior',95),member(2,'Warrior',85),member(3,'Warrior',75),member(4,'Mage',40),member(5,'Mage',65),member(6,'Mage',45),member(9,'Mage',55),member(7,'Scout',0)];
for (const mode of ['general','progress','base','total','fortress'] as const) for(const category of guildModeCategories(mode)) {
 const prepared=buildLocalGuildRanking(current,past,category,mode,null,{players:past,rosterComplete:true});
 const snapshot=structuredClone(prepared);
 assert.equal(selectGuildRankingClass(prepared,[]),prepared);
 for(const selection of [['Mage'],['Mage','Warrior'],['Scout'],['Druid'],['Plague Doctor'],['Mage','Mage']]) {
  const filtered=selectGuildRankingClass(prepared,selection);
  const expected=buildLocalGuildRanking(filterGuildRankingClass(current,selection),filterGuildRankingClass(past,selection),category,mode,null,{players:filterGuildRankingClass(past,selection),rosterComplete:true});
  const publicFields = (rows: readonly typeof prepared[number][]) => rows.map(({classComparison,...row})=>row);
  assert.deepEqual(publicFields(filtered),publicFields(expected),`${mode}/${category}/${selection}: ranks, deltas and averages from full selected pools`);
  assert.deepEqual(filtered.map(row=>row.rank), filtered.map((_,i)=>i+1));
 }
 assert.equal(selectGuildRankingClass(prepared,['Scout']).length,1,'less than three never filled with another class');
 assert.equal(selectGuildRankingClass(prepared,['Plague Doctor']).length,0);
 assert.deepEqual(prepared,snapshot,'projection leaves worker result untouched');
 const mage=selectGuildRankingClass(prepared,['Mage']);
 assert(mage.length===3 && mage.every(row=>row.rank!<=3),'class leaders outside unfiltered top three are promoted');
}
const moved=buildLocalGuildRanking([member(4,'Mage',70)],[member(4,'Warrior',60)],'main','total',null,{players:[member(4,'Warrior',60)],rosterComplete:true});
assert.equal(selectGuildRankingClass(moved,['Mage'])[0].valueDelta,null,'historical class outside the pool has no value delta');
assert.equal(selectGuildRankingClass(moved,['Mage'])[0].rankDelta,null);
assert.equal(selectGuildRankingClass(moved,['Mage','Warrior'])[0].valueDelta,10);
const ambiguous=buildLocalGuildRanking([member(4,'Mage',70)],[member(4,'Mage',60),member(4,'Warrior',65)],'main','total',null);
assert.equal(selectGuildRankingClass(ambiguous,['Mage'])[0].valueDelta,null,'class selection cannot resolve an ambiguous identity');
assert.equal(selectGuildRankingClass(ambiguous,['Mage'])[0].rankDelta,null);
const outside=buildLocalGuildRanking([member(4,'Mage',70)],[],'main','total',null,{players:[member(4,'Mage',60)],rosterComplete:true});
assert.equal(selectGuildRankingClass(outside,['Mage'])[0].valueDelta,10,'outside-guild history still contributes identity-matched values');
assert.equal(selectGuildRankingClass(outside,['Mage'])[0].rankStatus,'new');
const missing=member(4,'Mage',70);missing.playerStats.attrTotal=null;
assert.equal(selectGuildRankingClass(buildLocalGuildRanking([missing],[],'main','total',null),['Mage'])[0].rank,null);
console.log('PASS: shared multi-class pools in all categories, filtered current/history ranks and deltas, promoted Top 3, departures, class changes, empty/short/missing/zero and ambiguous/outside-guild identities');
