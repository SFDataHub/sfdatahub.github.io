import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../../src/i18n/en.json';
import LocalPlayerProfileOverlay from '../../../../src/components/local-player-profile/LocalPlayerProfileOverlay';
import * as scans from '../../../../src/lib/guilds/localScanLibrary';
import { openDB } from 'idb';
import { linkPlayerIdentifiers } from '../../../../src/lib/identities/playerIdentityStore';
import { linkGuildAliases } from '../../../../src/lib/identities/guildIdentityStore';
import { resolveLocalPlayerCurrentSeed } from '../../../../src/pages/GuildHub/localPlayerCurrentSeed';
import { buildLocalPlayerProfileModel } from '../../../../src/pages/GuildHub/localPlayerProfileAdapter';
import { acquireLocalPlayerProfile } from '../../../../src/lib/local-player-profile/coordinator';
import type { LocalPlayerProfileModel } from '../../../../src/components/local-player-profile/types';
import { inputs, anchor, start, DAY, player, group, richInputs } from './inputs';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
void i18n.use(initReactI18next).init({ lng:'en', resources:{en:{translation:en}}, interpolation:{escapeValue:false}, initImmediate:false });
const assert = (condition: unknown, message: string) => { if(!condition)throw Error(message); };
const deferred = () => { let release!:()=>void, entered!:()=>void; const promise=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);return{promise,started,release,entered}; };
type Gate=ReturnType<typeof deferred> & {phase:'history'|'rank'|'current';id?:string};
const w06 = {ready:true, uiWrites:0, requestStarts:0, requestEnds:0, failRanks:false, raw:[] as Array<{id:string;phase:string}>,gates:[] as Gate[], unhandled:[] as string[],run:undefined as undefined|(()=>Promise<string[]>), result:undefined as undefined|string[]};
(globalThis as any).w06=w06;
window.addEventListener('unhandledrejection',event=>w06.unhandled.push(String(event.reason)));
(globalThis as any).w06AfterRaw=async(id:string,stack:string)=>{
 const phase=stack.includes('readRanksFromMatchedSnapshots')?'rank':stack.includes('resolveLocalPlayerCurrentSeed')?'current':'history';
 w06.raw.push({id,phase});
 const index=w06.gates.findIndex(g=>g.phase===phase&&(!g.id||g.id===id));
 if(index>=0){const [gate]=w06.gates.splice(index,1);gate.entered();await gate.promise;}
 if(phase==='rank'&&w06.failRanks)throw Error('controlled browser rank failure');
};
const frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()));
async function until(check:()=>boolean,message:string){const end=Date.now()+15000;while(!check()){if(Date.now()>end)throw Error(`${message}; ${document.body.innerText}`);await act(async()=>{await frame();});}}
const root=createRoot(document.getElementById('root')!);
let mountGeneration=0;
function Host({profile}:{profile:LocalPlayerProfileModel}){const[open,setOpen]=React.useState(true);return <LocalPlayerProfileOverlay isOpen={open} profile={profile} onClose={()=>setOpen(false)}/>;}
async function mount(profile:LocalPlayerProfileModel){await act(async()=>root.render(<Host key={++mountGeneration} profile={profile}/>));}
async function click(selector:string){const control=document.querySelector<HTMLElement>(selector);assert(control,`control ${selector}`);await act(async()=>control!.click());}
async function compare(time:number){const select=document.querySelector<HTMLSelectElement>('.local-player-analytics__range-select select');assert(select,'actual comparison select');await act(async()=>{select!.value=String(time);select!.dispatchEvent(new Event('change',{bubbles:true}));});}
const text=(selector:string)=>document.querySelector(selector)?.textContent??'';
const contextCount=()=>(globalThis as any).w06Coordinator.activeContextCount();
async function profile(source:string,ref:string,time=anchor){const observation={sourceScanId:source,sourcePlayerKey:ref,sourceMemberRef:ref,scannedAtMs:time,scannedAtIso:new Date(time).toISOString(),guild:{name:'Fixture Guild',server:ref.split('_p')[0],identifier:ref.replace(/_p\d+$/,'_g1')}};const seed=await resolveLocalPlayerCurrentSeed(observation);assert(seed,'fixture exact seed');return buildLocalPlayerProfileModel({...observation,rawPlayer:seed!.rawPlayer,currentSeed:seed!});}
async function setup(){
 await scans.ensureSfDataHubLocalDataReady();const db=await openDB('sfdatahub-local-data');
 for(const input of [...inputs, ...richInputs]){await db.put('scans',scans.normalizeGuildHubLocalScanForDerivation({...input,filename:input.id+'.json',contentHash:input.id,importedAt:new Date(anchor).toISOString(),scannedAt:new Date(anchor).toISOString(),servers:[],playerCount:input.rawData.players.length,groupCount:input.rawData.groups.length}));await scans.getGuildHubLocalScan(input.id);}
 db.close();await linkPlayerIdentifiers('f7_net_p1','f8_net_p1',{source:'manual'});await linkGuildAliases('f7_net_g1','f8_net_g1',{source:'manual'});
}
w06.run=async()=>{
 const passed:string[]=[];await setup();const a=await profile('w06-current','f8_net_p1');w06.raw=[];
 const historyGate:Gate={...deferred(),phase:'history'},rankGate:Gate={...deferred(),phase:'rank'};w06.gates.push(historyGate,rankGate);
 const observer=acquireLocalPlayerProfile(a);await mount(a);await historyGate.started;
 await until(()=>text('.local-player-insights--rankings').includes('#10'),'current Insights before held history');
 assert(text('.player-profile__player-name').includes('Hero'),'real Hero stays early ready');
 assert(text('.local-player-insights--player-average').includes('Strength') && text('.local-player-insights--player-average').includes('—'),'current attributes are rendered');
 assert(observer.counters.indexBuilds===0&&observer.counters.currentRawReads===0,'Current independent, valid seed adds no Raw');
 const duplicate=observer.request('analytics');await act(async()=>historyGate.release());await rankGate.started;
 await until(()=>Boolean(document.querySelector('.local-player-analytics__range-select select')),'actual Analytics before held ranks');
 assert(text('.local-player-insights--rankings').includes('#10'),'held ranks preserve current Insights');
 assert(observer.counters.preparation===1&&observer.counters.indexBuilds===1&&observer.counters.performanceBuilds===1,'actual consumers share preparation and indices');
 assert(observer.counters.sourceBuilds===6,'only relevant source scopes prepared');
 w06.failRanks=true;await act(async()=>rankGate.release());await duplicate;
 await until(()=>text('.local-player-insights--personal-bests').includes('Some historical data'),'rank failure produces partial in existing Bests panel');
 assert(text('.local-player-insights--personal-bests').includes('210'),'valid XP best survives rank failure');
 assert(text('.local-player-insights--rankings').includes('#10')&&document.querySelector('.local-player-analytics__range-select select'),'rank failure keeps independent views');
 w06.failRanks=false;await click('.local-player-insights--personal-bests button');
 await until(()=>text('.local-player-insights--personal-bests').includes('#3'),'actual Bests retry succeeds with same key');
 assert(observer.counters.bestsProjections===2&&observer.counters.preparation===1,'rank retry reuses history');
 const original=await observer.request('analytics');const initialProjects=observer.counters.analyticsProjections;
 await compare(start+10*DAY);await until(()=>document.querySelector<HTMLSelectElement>('.local-player-analytics__range-select select')?.value===String(start+10*DAY),'comparison B');
 const b=await observer.request('analytics',start+10*DAY);assert(b.value!==original.value,'different pair own projection');
 await compare(start+30*DAY);await until(()=>document.querySelector<HTMLSelectElement>('.local-player-analytics__range-select select')?.value===String(start+30*DAY),'comparison A return');
 assert((await observer.request('analytics')).value===original.value,'actual A → B → A finished projection hit');
 assert(observer.counters.analyticsProjections===initialProjects+1&&observer.counters.preparation===1,'comparison keeps history');
 passed.push('actual Overlay/Hero/Analytics/Insights: held history + ranks, separate rank partial + same-key UI retry, comparison A → B → A');
 passed.push('measured active context counts '+JSON.stringify(observer.counters));
 const builds=observer.counters.preparation;
 await act(async()=>{await scans.importGuildHubLocalScan('ForeignBrowser.json',JSON.stringify({players:[player(anchor,1,'s30_net')],groups:[group(anchor,'s30_net',1)]}));});
 await observer.revalidate();assert(observer.counters.preparation===builds,'foreign server leaves displayed profile valid');
 await act(async()=>{await scans.importGuildHubLocalScan('RelevantBrowser.json',JSON.stringify({players:[player(anchor+30*DAY),player(anchor+30*DAY,2)],groups:[group(anchor+30*DAY)]}));});
 await until(()=>text('.local-player-analytics--career').includes('6 snapshots')||document.body.innerText.includes('6 snapshots'),'new relevant source refreshes actual Analytics');
 assert(text('.local-player-insights--rankings').includes('#10'),'history invalidation retains current Insights');
 observer.release();await click('.profile-overlay__close');assert(!document.querySelector('[role="dialog"]')&&contextCount()===0,'actual Close frees all leases');
 passed.push('actual finished display: relevant source refresh, foreign scope unchanged, Close releases context');
 // Historical selected observation and later History remain the old business rule.
 const historical=await profile('w06-mid','f8_net_p1',start+30*DAY);const held:Gate={...deferred(),phase:'rank'};w06.gates.push(held);
 await mount(historical);await held.started;
 await until(()=>text('.local-player-insights--rankings').includes('#12'),'historical Current rank remains selected');
 await until(()=>document.body.innerText.includes('End: 01 Jul 26'),'historical anchor shown by actual Analytics');
 const writes=w06.uiWrites;await click('.profile-overlay__close');assert(contextCount()===0,'Close while ranks pending releases registry');
 const afterClose=w06.uiWrites;await act(async()=>held.release());await until(()=>w06.requestStarts===w06.requestEnds,'all closed requests settle');
 assert(!document.querySelector('[role="dialog"]')&&w06.uiWrites===afterClose&&afterClose>=writes,'no late UI writes or reopen after held read');
 passed.push('historical anchor + later history, pending rank Close, no late writes, no retained registry');
 // Source revalidation refreshes the same selected row, then treats deletion as missing.
 const refreshed=await profile('w06-current','f8_net_p1');await mount(refreshed);await until(()=>text('.local-player-insights--rankings').includes('#10'),'reopen A after released history');
 const currentGate:Gate={...deferred(),phase:'current'};w06.gates.push(currentGate);
 await act(async()=>{await scans.updateGuildHubLocalScan('w06-current','BrowserChanged.json',JSON.stringify({players:[player(anchor,1,'f8_net',900,130,7),player(anchor,2),player(anchor+20*DAY,1,'f8_net',9999,999,1)],groups:[group(anchor),group(anchor+20*DAY,'f8_net',1)]}));});
 await currentGate.started;await until(()=>text('.local-hero').includes('Loading'),'source-changed Current has its own loading status');assert(!text('.local-hero').includes('no longer available'),'loading must not claim missing');await act(async()=>currentGate.release());
 await until(()=>text('.local-player-insights--rankings').includes('#7'),'same selected Current row reloads');
 assert(!text('.local-player-insights--rankings').includes('#1Guild'),'does not advance to later rank');
 await act(async()=>{await scans.deleteGuildHubLocalScans(['w06-current']);});
 await until(()=>document.body.innerText.includes('selected local observation is no longer available'),'missing observation replaces old Hero');
 assert(!text('.local-player-insights--rankings').includes('#7'),'deleted current Insights not displayed as valid');
 await click('.profile-overlay__close');
 const rich=await profile('w06-rich-1','s50_net_p1');const richHistory:Gate={...deferred(),phase:'history'};w06.gates.push(richHistory);await mount(rich);await richHistory.started;
 await until(()=>text('.local-player-insights--rankings').includes('#3'),'complete-core current before held history');
 const values=[...document.querySelectorAll('.local-player-insights--player-average .local-player-insights__attribute-row')].map(row=>[...row.querySelectorAll('strong')].map(node=>node.textContent));
 assert(values[0][0]==='0'&&values[0][1]==='150','actual Current keeps real zero and valid-member guild mean');
 assert(values[1][0]==='—'&&values[1][1]==='50','actual Current per-attribute missing is distinct from zero');
 await click('.profile-overlay__close');const richWrites=w06.uiWrites;await act(async()=>richHistory.release());await until(()=>w06.requestStarts===w06.requestEnds,'rich closed preparation settles');assert(w06.uiWrites===richWrites,'no late writes after history Close');
 passed.push('actual full-core Current attributes: zero vs missing, per-attribute guild mean, ready before held history');
 await act(async()=>root.unmount());assert(contextCount()===0&&(globalThis as any).w06Coordinator.activeHistoryCount()===0,'Unmount releases final context and history basis');
 assert(w06.unhandled.length===0,'no unhandled errors');
 passed.push('actual Current refresh keeps exact observation; deletion missing; Unmount clears registry; no unhandled errors');
 return passed;
};
