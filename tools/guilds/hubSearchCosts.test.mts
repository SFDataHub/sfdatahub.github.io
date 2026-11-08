import { artifactPath } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { buildHubSearchProjection } from "../../src/lib/data-hub/hubSearchProjection.ts";
import { readGuildHubSearchRows, type GuildHubLocalScan } from "../../src/lib/guilds/localScanLibrary.ts";
import { aggregateHubSearchHits, defaultHubSearchQuery, HUB_SEARCH_LIMIT } from "../../src/lib/data-hub/hubSearchService.ts";
const at=Date.UTC(2026,9,6);const samples=[];
for(const count of [1000,10000]){
 const scan:GuildHubLocalScan={id:`cost-${count}`,contentHash:"hash",filename:"cost.json",importedAt:new Date(at).toISOString(),scannedAt:null,servers:["f8_net"],playerCount:count,groupCount:0,sourceGeneration:"generation",normalizerVersion:1,coreNormalizerVersion:1,rawData:{players:Array.from({length:count},(_,i)=>({identifier:`f8_net_p${i}`,name:`Cost Player ${i}`,prefix:"f8_net",timestamp:at})),groups:[]}};
 const start=performance.now();const projection=buildHubSearchProjection(scan,readGuildHubSearchRows(scan),"[]");const preparationMs=performance.now()-start;
 const occurrences=projection.documents.map(local=>({...local,local}));const queryMs=[];
 for(const text of ["Cost","Player 8","f8_net_p999","Player 99","Player"]){const q=performance.now();const result=aggregateHubSearchHits(occurrences,undefined,{...defaultHubSearchQuery,text},1,1);queryMs.push(performance.now()-q);assert.ok(result.hits.length<=HUB_SEARCH_LIMIT);}
 samples.push({count,projectionBytes:new TextEncoder().encode(JSON.stringify(projection)).length,projectionBuildMs:preparationMs,queryMs});
}
writeFileSync(artifactPath("tools/guilds/fixtures/hubSearch/cost-results.json"),JSON.stringify({samples,note:"Synthetic parser/projection and aggregation CPU; serialized UTF-8 size. No Raw transport/DB commit, RAM/heap or clone measurement."},null,2)+"\n");console.log("PASS measured 1k/10k slim projection and warm-query budgets",JSON.stringify(samples));
