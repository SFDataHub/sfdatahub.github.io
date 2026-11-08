import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { performancePlugin } from './fixtures/localToplistPerformance/plugin.mts';
const text=`function buildLocalScanRecord(input){if(input<0)return;const next=input+1;return next;}
function handleView(input){if(input.stop)return;return [1,2].map(x=>{return x+input.offset;});}
async function createGuildHubLocalScanImportPreview(input){if(input===undefined)return;await Promise.resolve();return input;}
function acquireArchiveEntry(input){return input;}
function buildSearchIndex(input){try{if(input.fail)throw Error('expected');return input;}finally{input.finally=true;}}
this.api={buildLocalScanRecord,handleView,createGuildHubLocalScanImportPreview,acquireArchiveEntry,buildSearchIndex};`;
const hooks=performancePlugin();const transform=hooks.transform as any;
const output=await transform.call({},text,'D:/SFDataHub/sfdatahub.github.io/src/lib/guilds/localScanLibrary.ts');
const probe={start(){return {};},end(){},ret(_span:any,value:any){return value;}};
const context:any={__w29:probe};vm.createContext(context);vm.runInContext(ts.transpile(output.code,{target:ts.ScriptTarget.ES2022}),context);
assert.equal(context.api.buildLocalScanRecord(-1),undefined);assert.equal(context.api.buildLocalScanRecord(2),3);
assert.equal(context.api.handleView({stop:true}),undefined);assert.equal(JSON.stringify(context.api.handleView({offset:5})),'[6,7]');
assert.equal(await context.api.createGuildHubLocalScanImportPreview(undefined),undefined);assert.equal(await context.api.createGuildHubLocalScanImportPreview('value'),'value');
const promise=Promise.resolve('unchanged');assert.equal(context.api.acquireArchiveEntry(promise),promise);
const input={fail:true,finally:false};assert.throws(()=>context.api.buildSearchIndex(input),/expected/);assert(input.finally);
console.log('Observation preserves guarded returns, nested callbacks, promise identity and try/finally.');
