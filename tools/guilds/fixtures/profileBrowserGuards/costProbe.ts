import type { GuildHubLocalScan } from '../../../../src/lib/guilds/localScanLibrary';
import type { LocalPlayerCurrentSeed } from '../../../../src/pages/GuildHub/localPlayerCurrentSeed';
export type CostEvent={kind:string;owner:string;phase:string;source?:string;generation?:string;ref?:string;at?:number;row?:number;stack?:string;valid?:boolean;hasCore?:boolean;candidates?:unknown[];observations?:unknown[];eventTimeMs?:number};
const rows=new WeakMap<object,{source:string;generation?:string;row:number}>();
export const costEvents:CostEvent[]=[];
export let phase='before';
export const phaseMarks=[{phase,timeMs:Date.now()}];
export function setCostPhase(next:string){phase=next;phaseMarks.push({phase,timeMs:Date.now()});}
function owner(stack:string){
 if(stack.includes('readRanksFromMatchedSnapshots'))return 'history-ranks';
 if(stack.includes('buildCurrentScanInsights')||stack.includes('buildPlayerVsAverage'))return 'current-insights';
 if(stack.includes('localPlayerProfileAdapter'))return 'current-adapter';
 if(stack.includes('localProfileEntry'))return 'current-entry';
 if(stack.includes('resolveLocalPlayerCurrentSeed'))return 'current-coordinator';
 if(stack.includes('deriveGuildHubLogicalScanSnapshots')||stack.includes('createGuildHubScanSummary'))return 'source-summary';
 if(stack.includes('localToplistService'))return 'toplist-service';
 if(stack.includes('buildLocalScanRecord'))return 'fixture-import';
 if(stack.includes('localToplistDerivation'))return 'toplist-derived';
 if(stack.includes('persistScanNormalizationIfNeeded')||stack.includes('normalizeGuildHubLocalScanForDerivation'))return 'source-repair';
 if(stack.includes('useDashboardScans'))return 'dashboard';
 if(stack.includes('costCases'))return 'fixture-preparation';
 if(stack.includes('Dashboard'))return 'dashboard';
 if(stack.includes('executionWork')||stack.includes('localGuildAnalyticsStore'))return 'source-derived';
 if(stack.includes('historyBasis'))return 'history-basis';
 return 'unresolved';
}
function emit(event:CostEvent){event.eventTimeMs=Date.now();if(typeof window==='undefined')event.phase='worker-realm';costEvents.push(event);if(typeof window==='undefined')void fetch('/__w15cost',{method:'POST',body:JSON.stringify(event)});}
export function registerScan(scan:GuildHubLocalScan){const raw=scan.rawData as {players?:object[]};raw?.players?.forEach((p,row)=>{if(p&&typeof p==='object')rows.set(p,{source:scan.id,generation:scan.sourceGeneration,row});});}
export function recordRead(scan:GuildHubLocalScan|null|undefined,id:string,stack:string){if(scan)registerScan(scan);emit({kind:'raw',owner:owner(stack),phase,source:id,generation:scan?.sourceGeneration,observations:(scan?.rawData as {players?:Array<{identifier?:string;timestamp?:number}>})?.players?.map((p,row)=>({ref:p.identifier,at:p.timestamp,row})),stack});}
export function recordCore(player:unknown,stack:string){const p=player as {identifier?:string;timestamp?:number};emit({kind:'core',owner:owner(stack),phase,...(player&&typeof player==='object'?rows.get(player):undefined),ref:p?.identifier,at:p?.timestamp,stack});}
export async function recordValidity(valid:Promise<boolean>,seed:LocalPlayerCurrentSeed){const result=await valid;emit({kind:'prepared-validity',owner:'current-entry',phase,source:seed.sourceScanId,generation:seed.validity.sourceGeneration,ref:seed.rawIdentifier??undefined,at:seed.scannedAtMs,valid:result,hasCore:'normalizedCore' in seed});return result;}
(globalThis as any).w15Costs={events:costEvents,phaseMarks,setPhase:setCostPhase};
export function scopedCosts(events:CostEvent[]){
 const current=events.filter(e=>['current-entry','current-coordinator','current-adapter','current-insights'].includes(e.owner));
 const unresolved=events.filter(e=>(e.kind==='raw'||e.kind==='core')&&e.owner==='unresolved');
 return {raw:current.filter(e=>e.kind==='raw').length,core:current.filter(e=>e.kind==='core').length,unresolved,events};
}
