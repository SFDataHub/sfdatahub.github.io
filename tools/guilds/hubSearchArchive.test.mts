import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { loadHubSearchArchiveBasis, type HubSearchScope } from "../../src/lib/data-hub/hubSearchService.ts";
const requests:string[]=[];let offline=false,brokenYear=0;const now=Date.UTC(2026,9,6);
const scan=(id:string,year:number)=>({id,server:"f8_net",timestamp:Date.UTC(year,8,6),path:`${id}.json.gz`,format:"sftools.raw.v1",compression:"gzip",sha256:"a".repeat(64),compressedBytes:20,uncompressedBytes:100,playerCount:1,groupCount:1,searchIndex:{schemaVersion:1,path:`search/${id}.search.json.gz`,sha256:"b".repeat(64),compressedBytes:20,uncompressedBytes:100,playerCount:1,groupCount:1}});
const manifests=Object.fromEntries([2024,2025,2026].map(year=>{const scans=year===2026?[scan('current-a',year),scan('current-b',year)]:[scan(`year-${year}`,year)];return [year,{schemaVersion:1,archiveYear:year,revision:1,updatedAt:new Date(now).toISOString(),scanCount:scans.length,serverCount:1,scans,toplists:{schemaVersion:1,current:{f8_net:{scanIds:scans.map(s=>s.id)}},monthly:{[`${year}-09`]:{f8_net:{scanIds:scans.map(s=>s.id)}}}}}];}));
const catalog={schemaVersion:1,archives:[2024,2025,2026].map(year=>({year,active:year!==2024,manifestUrl:`https://fixture.invalid/${year}/manifest.json`}))};
const original=globalThis.fetch;
globalThis.fetch=(async input=>{const url=String(input);requests.push(url);if(offline)throw Error('offline');const match=/\/(202\d)\/manifest/.exec(url);const year=Number(match?.[1]);if(year===brokenYear)throw Error('one year failed');return new Response(JSON.stringify(url.includes('catalog')?catalog:manifests[year]),{status:200});}) as typeof fetch;
const load=(scope:HubSearchScope,signal:AbortSignal)=>loadHubSearchArchiveBasis(scope,signal,{catalogUrl:"https://fixture.invalid/catalog.json"});
try{
 const current=await load({kind:'current'},new AbortController().signal);assert.deepEqual(current.entries.map(e=>e.id),['current-a','current-b']);assert.ok(!requests.some(r=>r.includes('/2024/')));assert.ok(requests.every(r=>r.endsWith('.json')));
 requests.length=0;const history=await load({kind:'historical',from:'2024-09',to:'2024-09',server:'F8'},new AbortController().signal);assert.equal(history.entries[0].id,'year-2024');assert.deepEqual(history.monthsByEntryId?.['year-2024'],['2024-09']);assert.ok(!requests.some(r=>r.includes('/2025/')||r.includes('/2026/')));
 console.log('PASS default active years only, full latest Currentset, inactive year available only in declared monthly scope; metadata-only requests');
 brokenYear=2026;const partial=await load({kind:'current'},new AbortController().signal);assert.equal(partial.failed,1);assert.equal(partial.entries[0].id,'year-2025');brokenYear=0;
 offline=true;const cached=await load({kind:'current'},new AbortController().signal);assert.deepEqual(cached.entries.map(e=>e.id),['current-a','current-b']);assert.equal(cached.failed,1);assert.ok(cached.unknown>0);
 await assert.rejects(load({kind:'historical',from:'2023-01',to:'2023-02',server:''},new AbortController().signal),/offline/);
 offline=false;const retried=await load({kind:'current'},new AbortController().signal);assert.equal(retried.failed,0);assert.equal(retried.entries.length,2);
 console.log('PASS independent year failures, validated same-scope offline expectations, unknown uncached scope and retry without permanent veto');
}finally{globalThis.fetch=original;}
