import { flushSync } from 'react-dom';
import { openDB } from 'idb';
import * as scans from '../../../../src/lib/guilds/localScanLibrary';
import { buildHubSearchProjection, HUB_SEARCH_KEY_PREFIX } from '../../../../src/lib/data-hub/hubSearchProjection';
import { HUB_SEARCH_RECENTS_KEY, hubSearchRecents, recentFromHubHit, type HubRecentEntity } from '../../../../src/lib/data-hub/hubSearchRecents';

const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
const pause=(ms=20)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean,message:string){for(let i=0;i<1500;i++){if(check())return;await pause();}throw Error(`${message}: ${document.body.innerText.slice(-2000)}`);}
const at=Date.UTC(2026,9,9),oldAt=at-86400000;
const reference:HubRecentEntity={kind:'entity',entityKind:'player',identifier:'f8_net_p139',serverNamespace:'f8',name:'Old display name',anchor:null};
let api:any;
let source='';
const proof:{results:string[];costs:Record<string,unknown>;pixels?:unknown}={results:[],costs:{}};
const counts=()=>({rawSearch:api.searchReads.length,targetRawReaderCalls:api.reads.length,commitReads:api.projectionCommitReads,appearanceRows:api.appearanceRows,projectionBuilds:api.projectionBuilds,projectionWrites:api.projectionWrites,archivePayloadRequests:api.indexTimings.length,cores:api.cores.length,profiles:api.builds.length});
const delta=(before:ReturnType<typeof counts>)=>Object.fromEntries(Object.entries(counts()).map(([key,value])=>[key,value-before[key as keyof typeof before]]));
const controller=()=>api.searchControllers.filter((c:any)=>!c.inspect().stopped).at(-1);
const field=()=>document.querySelector<HTMLInputElement>('[data-dashboard-search] input')!;
function text(value:string){const input=field();input.focus();flushSync(()=>{input.click();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function query(value:string){text(value);await pause(250);await until(()=>!document.querySelector<HTMLElement>('[data-search-loading]'),'settled query');}
async function ready(){await until(()=>!!controller()&&!controller().getSnapshot().local.preparing&&!controller().getSnapshot().archive.preparing,'prepared controller');}
async function go(path:string){api.navigate(path);await pause();if(path==='/data-hub')await until(()=>!!field(),'Dashboard search mounted');}
async function back(){history.back();await until(()=>api.location.pathname==='/data-hub'&&!!field(),'back to Dashboard');flushSync(()=>{field().blur();field().focus();field().click();});await ready();await pause(250);}
async function click(element:HTMLElement|undefined|null){assert(element,'click target exists');flushSync(()=>{element!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));element!.focus();element!.click();});await pause();}
function key(key:string){field().dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));}
const recentOption=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('[data-search-option]')].find(button=>button.textContent?.includes(label));
const hero=()=>document.querySelector('.local-hero')?.textContent??document.querySelector('.player-profile')?.textContent??'';
async function recentView(){await query('');assert(field().getAttribute('aria-expanded')==='true','Recent dropdown visible');}
function pixelCount(canvas:HTMLCanvasElement){const bytes=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i]>0)count++;return count;}
async function imagePixels(image:HTMLImageElement){await until(()=>image.complete&&image.naturalWidth>0,'CoA image complete');const canvas=document.createElement('canvas');canvas.width=240;canvas.height=240;canvas.getContext('2d')!.drawImage(image,0,0,240,240);return pixelCount(canvas);}
async function recentImages(){
 const portrait=()=>recentOption('Earlier Visual Portrait')?.querySelector('canvas');
 await until(()=>!!portrait()&&pixelCount(portrait()!)>1000,'actual Recent PortraitMaker pixels');
 const coa=()=>recentOption('Visual CoA Guild')?.querySelector<HTMLImageElement>('[data-search-coa]');
 await until(()=>!!coa()&&coa()!.src.length>6000,'actual Recent CoA data URL');const coaPixels=await imagePixels(coa()!);assert(coaPixels>1000,'actual Recent CoA pixels');
 return {portrait:pixelCount(portrait()!),coa:coaPixels};
}

export async function preparePresentation(testApi:any){
 api=testApi;
 api.appearanceRows=0;api.projectionBuilds=0;api.projectionWrites=0;
 if(!sessionStorage.getItem('w24-presentation-seeded')){
  const save=Array<number>(70).fill(0);save[8]=1;save[9]=403;save[10]=2;save[11]=3;save[13]=2;save[14]=1;save[18]=1;save[19]=1;save[20]=1;
  const players=Array.from({length:40},(_,i)=>({identifier:`f8_net_p${100+i}`,prefix:'f8_net',timestamp:at,name:`Batch ${String(i).padStart(2,'0')}`,class:1,level:101,rank:i+1,...i===0?{save,saveVersion:2}:{}}));
  const result=await scans.importGuildHubLocalScan('w24-visual.json',JSON.stringify({players:[...players,{...players[0],name:'Visual Portrait',timestamp:at},{...players[0],name:'Earlier Visual Portrait',timestamp:oldAt},{identifier:'f8_net_p140',prefix:'f8_net',timestamp:at,name:'Visual Class Only',class:2},{identifier:'f8_net_p141',prefix:'f8_net',timestamp:at,name:'Visual Missing Appearance'}],groups:[{identifier:'f8_net_g100',prefix:'f8_net',name:'Visual CoA Guild',timestamp:at,coaString:'0000000000000000010203'},{identifier:'f8_net_g101',prefix:'f8_net',name:'Visual Missing Guild',timestamp:at,coaString:'invalid'}]}));
  source=result.scan.id;sessionStorage.setItem('w24-presentation-source',source);
  const db=await openDB('sfdatahub-local-data');const inventory=await scans.readHubSearchProjectionInventory();const metadata=await scans.readDataHubLocalScanMetadata({includeContentHashes:true});
  const originals:Record<string,unknown>={};
  for(const id of metadata.sourceIds){const scan=await scans.readGuildHubLocalScanForSearch(id);assert(scan,'seed Raw');const projection=buildHubSearchProjection(scan!,scans.readGuildHubSearchRows(scan!),inventory.resetFor(id));await db.put('metadata',{key:HUB_SEARCH_KEY_PREFIX+id,value:{...projection,version:1,documents:projection.documents.map(({appearance:_appearance,...d})=>d)},updatedAt:new Date().toISOString()});originals[id]={source:await db.get('scans',id),summary:await db.get('scanSummaries',id)};}
  sessionStorage.setItem('w24-originals',JSON.stringify(originals));db.close();
  localStorage.setItem(HUB_SEARCH_RECENTS_KEY,JSON.stringify({version:1,entries:[reference,...Array.from({length:24},(_,i)=>({kind:'query',text:`Stored Query ${i}`})),{kind:'entity',entityKind:'player',identifier:'f8_net_p1',serverNamespace:'f9'}]}));
  sessionStorage.setItem('sfdatahub:hub-search:v1',JSON.stringify({text:'',kind:'guild',mode:'toplist',scope:{kind:'historical',from:'2026-01',to:'2026-09',server:'F8'}}));
  sessionStorage.setItem('w24-presentation-seeded','1');api.searchReads=[];api.cores=[];api.builds=[];api.projectionCommitReads=0;api.appearanceRows=0;api.projectionBuilds=0;api.projectionWrites=0;
 }else source=sessionStorage.getItem('w24-presentation-source')!;
 (globalThis as any).w24={run,showImages,showRecents:recentView,reload,proof};
}

async function showImages(){await query('Visual');document.querySelector<HTMLElement>('[data-dashboard-search]')!.scrollIntoView({block:'start'});await pause(400);}
async function run(){
 let release!:()=>void;api.preparationGate=new Promise<void>(resolve=>{release=resolve;});
 await go('/data-hub');await pause(400);assert(api.searchControllers.length===0,'before first interaction 0 Dashboard search pipeline starts');assert(!document.querySelector('[data-search-loading]'),'mount no spinner');proof.costs.beforeInteraction={starts:0,...counts()};field().focus();await pause();assert(!document.querySelector('[data-search-loading]'),'empty focus no spinner');assert(document.querySelector('[role=listbox]')?.getAttribute('aria-busy')==='false','empty focus no visible loading');
 text('x');await pause();assert(!!document.querySelector('[data-search-loading]'),'typing one character shows actual held preparation');text('Visual');await pause(220);const generation=controller().getSnapshot().queryGeneration;text('');await pause();assert(!document.querySelector('[data-search-loading]'),'clearing hides spinner immediately');assert(controller().getSnapshot().queryGeneration>generation&&controller().query.text==='','clearing immediately invalidates old query');assert(!controller().inspect().stopped,'focused preparation consumer retained');release();api.preparationGate=undefined;await ready();assert(controller().getSnapshot().hits.length===0,'late preparation cannot publish cleared old query hits');proof.results.push('Before first interaction 0 starts; empty focus has no loading; typing held preparation shows spinner; clear invalidates query and preserves preparation');
 assert(field().placeholder==='Search player or guild','exact placeholder');assert(document.querySelectorAll('[data-dashboard-search] select').length===1,'single Open in control');
 const restored=JSON.parse(sessionStorage.getItem('sfdatahub:hub-search:v1')!);assert(restored.kind==='both'&&restored.scope.kind==='current'&&restored.mode==='toplist','stale session constrained before controller');assert(controller().query.kind==='both'&&controller().query.scope.kind==='current','controller never sees historical Dashboard scope');
 assert(hubSearchRecents.getSnapshot().entries.length===20,'mixed max20 persisted Recents');
 assert(!!recentOption('Old display name')?.querySelector('[data-search-portrait-fallback]'),'legacy Recent without images remains valid with placeholder');
 const db=await openDB('sfdatahub-local-data');const originals=JSON.parse(sessionStorage.getItem('w24-originals')!);const inventory=await scans.readHubSearchProjectionInventory();
 for(const [id,original] of Object.entries(originals) as [string,any][]){assert(inventory.projections.get(id)?.version===2,'normal opening auto migrates stored version1');assert(JSON.stringify(await db.get('scans',id))===JSON.stringify(original.source),'migration source unchanged');assert(JSON.stringify(await db.get('scanSummaries',id))===JSON.stringify(original.summary),'migration summary unchanged');}db.close();
 proof.costs.coldMigration={...counts(),sources:Object.keys(originals).length,bytes:controller().costs.projectionBytes};proof.results.push('Actual stored v1/unchanged Rawhash migrates on normal opening; Raw/Summary unchanged; Dashboard starts both/current');
 await go('/origin');const warm=counts();await go('/data-hub');field().focus();await ready();assert(api.searchReads.length===warm.rawSearch&&api.projectionCommitReads===warm.commitReads,'warm mount zero Raw/projection commit reads');proof.costs.warmMount=delta(warm);
 const typing=counts();for(const value of ['Visual','Batch','f8_net_p100','No such match','Visual'])await query(value);assert(api.searchReads.length===typing.rawSearch&&api.cores.length===typing.cores&&api.builds.length===typing.profiles,'five queries no Raw/core/profile');proof.costs.fiveQueries=delta(typing);
 await until(()=>!!document.querySelector<HTMLElement>('[data-hub-search-hit="f8_net_p100"] canvas')&&pixelCount(document.querySelector<HTMLCanvasElement>('[data-hub-search-hit="f8_net_p100"] canvas')!)>1000,'actual PortraitMaker pixels');
 await until(()=>!!document.querySelector<HTMLElement>('[data-hub-search-hit="f8_net_g100"] [data-search-coa]'),'actual CoA URL');
 const coa=document.querySelector<HTMLImageElement>('[data-hub-search-hit="f8_net_g100"] [data-search-coa]')!;await until(()=>coa.src.length>6000,'actual CoA composed data URL');const coaPixels=await imagePixels(coa);assert(coaPixels>1000,'real CoaRenderer painted pixels');
 const classImage=document.querySelector<HTMLImageElement>('[data-hub-search-hit="f8_net_p140"] [data-search-class="2"]')!;await until(()=>!!classImage&&classImage.complete&&classImage.naturalWidth>0,'existing real class icon asset');
 assert(!!document.querySelector<HTMLElement>('[data-hub-search-hit="f8_net_p141"] [data-search-portrait-fallback]'),'missing local portrait placeholder');assert(!!document.querySelector<HTMLElement>('[data-hub-search-hit="f8_net_g101"] [data-search-coa-fallback]'),'invalid CoA placeholder, no Drive fallback');
 proof.pixels={portrait:pixelCount(document.querySelector<HTMLCanvasElement>('[data-hub-search-hit="f8_net_p100"] canvas')!),coa:coaPixels,classIcon:{naturalWidth:classImage.naturalWidth,url:classImage.src}};proof.results.push('Real PortraitPreview/PortraitMaker canvas and CoaRenderer WebGL composed images; production class mapping; missing player/guild placeholders');
 await query('Archive Player 3');assert(!!document.querySelector<HTMLElement>('[data-hub-search-hit="f8_net_p3"] [data-search-portrait-fallback]'),'archive-only no portrait fabricated');assert(api.searchReads.length===typing.rawSearch,'archive art no Raw acquisition');
 await query('Batch');assert(controller().getSnapshot().hits.length===30&&!controller().getSnapshot().hits.some((h:any)=>h.reference?.identifier===reference.identifier),'Recent reference outside top30');
 const viewing=counts();const storage=localStorage.getItem(HUB_SEARCH_RECENTS_KEY);await recentView();key('Escape');await pause();assert(field().getAttribute('aria-expanded')==='false','Escape closes');field().blur();field().focus();await pause();assert(localStorage.getItem(HUB_SEARCH_RECENTS_KEY)===storage,'display no Recent writes');proof.costs.recentDisplay=delta(viewing);
 // Fresh reference lookup while the field has one character, followed by the real Profile recipient.
 const mode=document.querySelector<HTMLSelectElement>('[data-dashboard-search] select')!;flushSync(()=>{mode.value='profile';mode.dispatchEvent(new Event('change',{bubbles:true}));});await query('x');const opening=counts();await click(recentOption('Old display name'));await until(()=>api.location.pathname.includes('/player-hub/')&&hero().includes('Batch 39'),'Recent beyond top30 actual profile');assert(!api.location.search,'free reference stays Current');proof.costs.recentProfileAction=delta(opening);await back();proof.results.push('One-character input: old-name reference beyond top30 resolves fresh local data and actual local Profile');
 // Explicit observation Recents retain the individual locator and cannot turn into Current.
 await query('Visual Portrait');await click(document.querySelector<HTMLElement>('[data-hub-search-hit="f8_net_p100"] > button[aria-expanded]'));const historical=[...document.querySelectorAll<HTMLButtonElement>('[data-hub-search-hit="f8_net_p100"] > button[role=option]')].find(button=>button.textContent?.includes(new Date(oldAt).toLocaleString('en')));await click(historical);await until(()=>new URLSearchParams(api.location.search).get('at')===String(oldAt),'explicit historical Profile');await back();await recentView();const exact=hubSearchRecents.getSnapshot().entries.find(e=>e.kind==='entity'&&e.anchor?.kind==='local'&&e.anchor.at===oldAt);assert(exact,'exact Recent persisted');await click(recentOption('Earlier Visual Portrait'));await until(()=>new URLSearchParams(api.location.search).get('at')===String(oldAt),'Recent exact anchor retained');await back();
 proof.results.push('Explicit local observation -> stored compact exact anchor -> actual historical Profile; no silent Current');
 // Query confirmation and Recent removal are native, independent controls.
 await query('Visual');key('Enter');await pause();assert(hubSearchRecents.getSnapshot().entries[0].kind==='query','Enter without active item stores query');await recentView();await click(recentOption('Visual'));assert(field().value==='Visual','query Recent restores text');await recentView();const removal=document.querySelector<HTMLButtonElement>('button[aria-label="Remove Visual from recent searches"]');await click(removal);assert(!hubSearchRecents.getSnapshot().entries.some(e=>e.kind==='query'&&e.text==='Visual'),'remove exactly one Recent');
 await query('No result whatsoever');assert(document.querySelector<HTMLElement>('[role=status]')?.textContent!==null,'honest empty state');assert(document.querySelector<HTMLElement>('[data-search-dropdown]')!.textContent?.includes('No results'),'confirmed empty');
 await query('Visual');key('ArrowDown');await pause();const active=field().getAttribute('aria-activedescendant');assert(active&&document.getElementById(active)?.getAttribute('aria-selected')==='true','ArrowDown highlights and links option');key('ArrowUp');await pause();assert(field().getAttribute('aria-activedescendant')!==active,'ArrowUp wraps');key('Escape');await pause();assert(!document.querySelector<HTMLElement>('[data-search-dropdown]'),'Escape closes dropdown');
 field().blur();field().focus();await pause();await click(document.querySelector<HTMLElement>('[data-inventory-toggle]'));assert(!document.querySelector<HTMLElement>('[data-search-dropdown]'),'outside click closes');await until(()=>!!document.querySelector<HTMLElement>('[data-inventory-kpi]'),'KPI opens');await click(document.querySelector<HTMLElement>('[data-inventory-toggle]'));
 proof.results.push('Enter query confirmation; removable query Recent; ArrowDown/ArrowUp active-descendant; Escape, outside click and lazy KPI remain separate');
 // Missing reference is readable and cannot navigate by stale name.
 hubSearchRecents.add({...reference,identifier:'f8_net_p9999',name:'Missing reference'});await recentView();await click(recentOption('Missing reference'));await until(()=>document.querySelector<HTMLElement>('[data-search-action]')?.getAttribute('data-search-action')==='missing','missing Recent status');assert(api.location.pathname==='/data-hub','missing Recent does not navigate');
 // Storage write failure leaves actual target success intact.
 const native=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===HUB_SEARCH_RECENTS_KEY)throw new DOMException('controlled quota','QuotaExceededError');return native.call(this,key,value);};
 try{await query('Current Player 1');await click(document.querySelector<HTMLElement>('[data-hub-search-hit="f8_net_p1"] > button'));await until(()=>api.location.pathname.includes('/player-hub/')&&hero().includes('Current Player 1'),'actual Profile despite Recent quota failure');}finally{Storage.prototype.setItem=native;}await back();
 proof.results.push('Missing reference stays local with explanation; quota failure cannot block actual Profile navigation');
 // A Recent uses the presently selected Toplist action, even before its debounce.
 await recentView();const targetMode=document.querySelector<HTMLSelectElement>('[data-dashboard-search] select')!;flushSync(()=>{targetMode.value='toplist';targetMode.dispatchEvent(new Event('change',{bubbles:true}));});
 const toplistAction=counts();await click(recentOption('Current Player 1'));await until(()=>document.querySelector('[data-toplist-target-status]')?.getAttribute('data-toplist-target-status')==='visibleAck'&&!!document.querySelector('[data-sfh-identifier="f8_net_p1"]'),'Recent actual Toplist row and DOM ACK');proof.costs.recentToplistAction=delta(toplistAction);await back();
 const profileMode=document.querySelector<HTMLSelectElement>('[data-dashboard-search] select')!;flushSync(()=>{profileMode.value='profile';profileMode.dispatchEvent(new Event('change',{bubbles:true}));});
 proof.results.push('Current Open in selection on entity Recent reaches full actual Toplist dataset and genuine DOM ACK, independent of pending text debounce');
 // Keep a valid mixed record for persisted reload proof and screenshot.
 await query('Visual CoA Guild');await click(document.querySelector<HTMLElement>('[data-hub-search-hit="f8_net_g100"] > button'));await until(()=>api.location.pathname.includes('/guild/f8/f8_net_g100/dashboard'),'actual local CoA Guild target');await back();
 hubSearchRecents.add({kind:'query',text:'Visual'});const displayImages=counts();await recentView();const recentPixels=await recentImages();proof.costs.recentImagesDisplay=delta(displayImages);assert(api.searchReads.length===displayImages.rawSearch&&api.cores.length===displayImages.cores&&api.builds.length===displayImages.profiles,'Recent images display no Raw/core/profile');proof.costs.recentPixels=recentPixels;
 proof.results.push('Entity saves compact image metadata; same real PortraitMaker/CoaRenderer in Recents; legacy placeholders; zero extra display Raw/core/profile work; persisted reload pixels');sessionStorage.setItem('w24-expected-recents',JSON.stringify(hubSearchRecents.getSnapshot().entries));return proof;
}
async function reload(){await until(()=>!!document.querySelector<HTMLElement>('[data-dashboard-search]'),'reload Dashboard');assert(api.searchControllers.length===0,'reload mount 0 pipeline starts');field().focus();await ready();assert(JSON.stringify(hubSearchRecents.getSnapshot().entries)===sessionStorage.getItem('w24-expected-recents'),'fresh document restores exact mixed Recents');const pixels=await recentImages();assert(api.searchReads.length===0&&api.projectionCommitReads===0,'real reload warm no Raw/commit');return {entries:hubSearchRecents.getSnapshot().entries.length,costs:counts(),pixels};}
