import assert from 'node:assert/strict';
import { PLAYER_ATTRIBUTE_COLUMNS, projectPlayerAttributeValues, playerAttributeColumn, playerAttributeValue, playerAttributeRatio } from '../../../../src/lib/toplists/playerAttributeColumns';
import { normalizeToplistViews, newToplistView, editToplistColumns, editToplistWidths, defaultToplistColumns, toplistColumnTree, resizeToplistColumn } from '../../../../src/lib/toplists/toplistColumns';
import { createPreferencesStore, PREFERENCES_KEY } from '../../../../src/lib/settings/preferences';
import { normalizeSfPlayerCharacterCore } from '../../../../src/lib/parsing/normalizedPlayer';
import { deriveLocalToplistsFromConfirmedScans } from '../../../../src/lib/toplists/localToplistDerivation';
import { buildLocalPlayerToplistView } from '../../../../src/lib/toplists/localToplistView';
let checks=0;
const check=(name:string, fn:()=>void)=>{fn();checks++;console.log('PASS '+name)};
const defaults=['rank','rankDelta','name','guild','level','main','con','sum','statsPerDay','ratio','mine','treasury','lastScan'];
check('Catalog: exact order, hierarchy, distinct keys, unchanged Default',()=>{
 assert.deepEqual(defaultToplistColumns('players'),defaults);
 assert.equal(PLAYER_ATTRIBUTE_COLUMNS.length,70);assert.equal(new Set(PLAYER_ATTRIBUTE_COLUMNS.map(c=>c.key)).size,70);
 assert.deepEqual(toplistColumnTree('players').find(n=>n.key==='attributes')!.children.map(n=>n.key),['baseStats','totalStats','bonuses']);
 for(const component of ['base','total'])assert.deepEqual(PLAYER_ATTRIBUTE_COLUMNS.filter(c=>c.component===component).map(c=>c.stat),['Main','Con','Dex','Int','Str','Lck','Sum','Ratio']);
});
const old={players:{activeId:'a',views:[{id:'a',name:'First',columns:['name','main','sum','statsPerDay','ratio'],widths:{main:122,sum:144,name:222},future:42},{id:'b',name:'Second',columns:['con','name'],widths:{con:88}}]},guilds:{mode:'default'}};
let raw=JSON.stringify({schemaVersion:1,neighbor:99,dataHub:{unknown:3,toplists:old}});
let mode='total',writes=0,quota=false;
const storage={getItem:(key:string)=>key===PREFERENCES_KEY?raw:JSON.stringify({localTable:{playerValueMode:mode}}),setItem:(_k:string,v:string)=>{writes++;if(quota&&!v.startsWith('sfh:z2:'))throw Object.assign(Error(),{name:'QuotaExceededError'});raw=v}};
const store=createPreferencesStore(()=>storage);
check('Automatic persisted migration: IDs, order, inactive views, widths, Stats/Day mode and unknown fields',()=>{
 const v=store.getSnapshot().toplistViews.players;assert.equal(writes,1);assert.equal(v.activeId,'a');assert.deepEqual(v.columns,['name','totalMain','totalSum','statsPerDay','totalRatio']);assert.deepEqual(v.views[0].widths,{totalMain:122,totalSum:144,name:222});assert.equal(v.views[0].future,42);assert.equal(v.views[1].playerValueMode,'total');assert.equal(JSON.parse(raw).neighbor,99);
 mode='base';assert.deepEqual(store.refresh().toplistViews.players.views,v.views);assert.equal(writes,1);
});
check('Default copy and first edits freeze visible types, no-op stays Default, active-copy Stats/Day retained',()=>{
 const base=normalizeToplistViews(undefined,'total').players;
 assert.equal(editToplistColumns(base,'players',base.columns,'Copy'),base);
 const copy=newToplistView(base,'players','Copy',true);assert.ok(copy.columns.includes('totalMain'));assert.equal(copy.views[0].playerValueMode,'total');
 const edited=editToplistColumns(base,'players',[...base.columns,'baseDex'],'Copy');assert.ok(edited.columns.includes('totalMain'));assert.ok(edited.columns.includes('baseDex'));
 const resized=resizeToplistColumn(base,'players','main',130,{main:120,con:120},'Copy','con');assert.equal(resized.views[0].widths?.totalMain,130);assert.equal(resized.views[0].widths?.totalCon,110);
 const mixed=store.refresh().toplistViews.players;assert.equal(newToplistView(mixed,'players','Copy',true).views.at(-1)!.playerValueMode,'total');
 assert.equal(editToplistWidths(base,'players',{},'Copy'),base);
});
check('Migration uses existing lossless quota fallback and preserves neighboring data',()=>{
 raw=JSON.stringify({schemaVersion:1,neighbor:'repeat'.repeat(500),dataHub:{toplists:old}});quota=true;
 const s=createPreferencesStore(()=>storage).getSnapshot();assert.equal(s.status,'ready');assert.ok(raw.startsWith('sfh:z2:'));assert.equal(s.toplistViews.players.views[0].attributeContract,1);quota=false;
});
function rich(classId:number,id:number){const save=Array(70).fill(0);save[1]=id;save[3]=100;save[20]=classId;[100,200,300,400,0].forEach((v,i)=>save[30+i]=v);[10,20,30,40,0].forEach((v,i)=>save[35+i]=v);return {identifier:`f8_net_p${id}`,prefix:'f8_net',timestamp:Date.UTC(2026,9,6),saveVersion:2,save,class:classId,name:'Player '+id,baseMain:900+id,conBase:500,strengthTotal:800+id,dexterityTotal:700+id,intelligenceTotal:600+id,constitutionTotal:550};}
check('Strength, dexterity, intelligence Main components; fixed attributes, zero and missing status',()=>{
 for(const [id,expected] of [[1,10],[3,20],[2,30]]){
 const core=normalizeSfPlayerCharacterCore(rich(id,id));const values=projectPlayerAttributeValues(core,id);assert.equal(values.bonus_bonus_main,expected);assert.equal(values.baseLck,0);assert.equal(values.baseStr,100);
 assert.equal(values.bonus_bonus_lck,0);assert.equal(values.bonus_pet_main,null);
 core.metadata.fields['attributes.luck.base']={status:'invalid'};assert.equal(projectPlayerAttributeValues(core,id).baseLck,null);
 }
 assert.equal(playerAttributeRatio(null,20),null);assert.equal(playerAttributeRatio(0,20),0);assert.equal(playerAttributeRatio(100,200),33);
});
check('Derivation preserves legacy Main/Con/Sum priority and projects scalars; sorting uses clicked variant and null-last',()=>{
 const timestamp=Date.UTC(2026,9,6);const rows=deriveLocalToplistsFromConfirmedScans([{server:'f8_net',scanTimestamp:timestamp,manifestYear:2026,archiveScanId:'test',archiveSha256:'a'.repeat(64),localScanId:'test',confirmation:{kind:'archiveSource',archiveScanId:'test',archiveSha256:'a'.repeat(64)},rawScan:{players:[rich(1,1),rich(3,2),rich(2,3)],groups:[]}}] as any).players;
 assert.equal(rows.length,3);assert.equal(rows[0].attributeValues?.baseStr,100);
 for(const row of rows){assert.equal(playerAttributeValue(row,playerAttributeColumn('baseMain')!),row.main);assert.equal(playerAttributeValue(row,playerAttributeColumn('totalMain')!),row.mainTotal);assert.equal(row.sum,(row.main??0)+(row.con??0));}
 const a={...rows[0],rowKey:'a',main:100,mainTotal:900},b={...rows[1],rowKey:'b',main:200,mainTotal:300},c={...rows[2],rowKey:'c',main:null,mainTotal:null};
 for(const mode of ['base','total'] as const){
 const base=buildLocalPlayerToplistView([a,b,c],{sort:{metricKey:'baseMain',direction:'desc'},playerAverageMode:mode});assert.deepEqual(base.rows.map(r=>r.rowKey),['b','a','c']);
 const total=buildLocalPlayerToplistView([a,b,c],{sort:{metricKey:'totalMain',direction:'desc'},playerAverageMode:mode});assert.deepEqual(total.rows.map(r=>r.rowKey),['a','b','c']);
 }
});
console.log(`${checks} attribute contract groups passed`);
