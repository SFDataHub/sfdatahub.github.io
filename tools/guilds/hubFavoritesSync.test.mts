// Run with tools/codex/run.mjs; all mutable output stays in the independent external copy.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { emptyFavoritesDocument, applyFavoriteBatch, parseFavoriteBatch, parseFavoritesDocument, migrateLegacyFavorites, parsePortableFavorite, assertFavoritesBudget } = require("../../auth-api/src/lib/favoritesState.ts") as typeof import("../../auth-api/src/lib/favoritesState");
const { transactFavoritesState } = require("../../auth-api/src/lib/favoritesStateRepository.ts") as typeof import("../../auth-api/src/lib/favoritesStateRepository");

const typesOnly = process.argv.includes("--types-only");
if (!typesOnly) {
const card = (id: number, kind: "player" | "guild" = "player", at = 10) => parsePortableFavorite({ key: `${kind}:f28::${id}`, kind,
  reference: { identifier: `f28_${kind === "player" ? "p" : "g"}${id}`, serverNamespace: "f28", entityId: String(id) },
  originalReferences: [{ identifier: `f28_${kind === "player" ? "p" : "g"}${id}`, serverNamespace: "f28", entityId: String(id) }], historicalAt: null,
  display: { name: "Same name", server: "f28", observedAtMs: at, ...(kind === "player" ? { level: 700, className: "mage", guildName: "Guild", appearance: { classId: 2, coaString: null,
    portrait: { genderName: "female", class: 2, race: 1, mouth: 1, hair: 2, hairColor: 3, horn: 0, hornColor: 0, brows: 1, eyes: 2, beard: 0, nose: 3, ears: 1, extra: 0, special: 0, save: [123] } } } : { coaString: "crest", memberCount: 50, hofRank: 7 }), save: [123], profile: { secret: true } } });
const batch = (value: ReturnType<typeof card> | null, key = value!.key, baseRevision = 0, intent: "add" | "display" | "remove" = value ? "add" : "remove") => ({ changes: [{ key, baseRevision, value, intent }], baseOrderRevision: 0 });
const a = card(1), b = card(2), g = card(1, "guild");
let state = applyFavoriteBatch(emptyFavoritesDocument(), { changes: [a,b,g].map(value => ({ key: value.key, baseRevision: 0, value, intent: "add" })), baseOrderRevision: 0 });
assert.equal(state.entries.length, 3); assert.deepEqual(state.order, [a.key,b.key,g.key]);
assert.equal(JSON.stringify(state).includes('secret'), false); assert.equal(JSON.stringify(state).includes('save'), false);
assert.equal(state.entries[0].value!.display.appearance!.portrait!.hairColor, 3);
assert.deepEqual(applyFavoriteBatch(state, batch(a)), state, "idempotent add has no new revision/write");
state = applyFavoriteBatch(state, batch(null, a.key, 1));
assert.equal(applyFavoriteBatch(state, batch(a)).entries.find(e => e.key === a.key)!.value, null, "stale add cannot resurrect");
assert.equal(applyFavoriteBatch(state, batch(a, a.key, 1, "display")).entries.find(e => e.key === a.key)!.value, null);
state = applyFavoriteBatch(state, batch(card(1, "player", 20), a.key, state.revision));
assert.equal(state.entries.find(e => e.key === a.key)!.value!.display.observedAtMs, 20, "explicit re-add after observing tombstone");
assert.equal(applyFavoriteBatch(state, batch(a, a.key, state.revision, "display")).entries.find(e => e.key === a.key)!.value!.display.observedAtMs, 20);
const order = [...state.order].reverse(); const reordered = applyFavoriteBatch(state, { changes: [], order, baseOrderRevision: state.orderRevision });
assert.deepEqual(reordered.order, order); assert.deepEqual(applyFavoriteBatch(reordered, { changes: [], order: state.order, baseOrderRevision: state.orderRevision }).order, order, "stale order does not overwrite");
assert.deepEqual(parseFavoritesDocument(reordered), reordered);
assert.throws(() => parseFavoriteBatch({ changes: [{ key:a.key, value:a, baseRevision:0, intent:'remove' }], baseOrderRevision:0 }));
const legacy = { schemaVersion: 2, players: { f28_p7: true, f28_p8: { name: "Legacy", class: "mage" } }, guilds: { f28_g7: true } };
const migrated = migrateLegacyFavorites(emptyFavoritesDocument(), legacy);
assert.equal(migrated.entries.length, 3); assert.equal(migrated.entries[0].value!.display.name, null); assert.equal(migrated.entries[1].value!.display.className, "mage");
assert.deepEqual(migrateLegacyFavorites(migrated, legacy), migrated);
const removedLegacy = applyFavoriteBatch(migrated, batch(null, "player:f28::7", migrated.revision));
assert.equal(migrateLegacyFavorites(removedLegacy, legacy).entries.find(e => e.key === "player:f28::7")!.value, null);
assert.throws(() => migrateLegacyFavorites(migrated, { players: { invalid: true } }), "invalid legacy data remains recoverable");
assert.throws(() => parseFavoritesDocument({ ...state, schemaVersion: 99 }));
const many = Array.from({length:251},(_,i)=>card(i+1));
assert.throws(() => applyFavoriteBatch(emptyFavoritesDocument(), { changes: many.map(value => ({ key:value.key,value,baseRevision:0,intent:'add' })), baseOrderRevision:0 }), /limit/);
const tombstones = Array.from({length:15000},(_,i)=>({key:`removed:${i}`,revision:1,value:null}));
assert.throws(() => assertFavoritesBudget({schemaVersion:1,revision:1,orderRevision:0,order:[],entries:tombstones}), /capacity/);

// Real repository transaction function against a rollback-capable in-memory Firestore adapter.
const docs = new Map<string, any>([["users/account-A", { displayName:"Preserve", favorites:legacy, roles:["user"] }]]);
const counts = {stateReads:0, accountReads:0, stateWrites:0, accountWrites:0, other:0}; let failCommit = false;
const reference = (path: string): any => ({path,collection:(name:string)=>({doc:(id:string)=>reference(`${path}/${name}/${id}`)})});
const fake: any = {collection:(name:string)=>({doc:(id:string)=>reference(`${name}/${id}`)}), runTransaction:async(work:any)=>{
  const writes: any[]=[];const result=await work({ get:async(ref:any)=>{ counts[ref.path.endsWith('/state')?'stateReads':'accountReads']++;return {exists:docs.has(ref.path),data:()=>structuredClone(docs.get(ref.path))};},
    set:(ref:any,value:any)=>writes.push(['set',ref.path,value]),update:(ref:any,value:any)=>writes.push(['update',ref.path,value]) });
  if(failCommit)throw Error('controlled commit failure');for(const[op,path,value]of writes){counts[path.endsWith('/state')?'stateWrites':'accountWrites']++;if(op==='set')docs.set(path,value);else{assert.deepEqual(Object.keys(value),['favorites']);delete docs.get(path).favorites;}}return result;
}};
failCommit=true;await assert.rejects(transactFavoritesState(fake,'account-A',null,'DELETE'));assert.deepEqual(docs.get('users/account-A').favorites,legacy);assert(!docs.has('users/account-A/users_favorites/state'));
failCommit=false;const first=await transactFavoritesState(fake,'account-A',null,'DELETE');assert.deepEqual(first,migrated);assert.deepEqual(docs.get('users/account-A'),{displayName:'Preserve',roles:['user']});
const writes=counts.stateWrites+counts.accountWrites;await transactFavoritesState(fake,'account-A',null,'DELETE');assert.equal(counts.stateWrites+counts.accountWrites,writes);
await transactFavoritesState(fake,'account-A',batch(a),'DELETE');const afterWrite=counts.stateWrites;await transactFavoritesState(fake,'account-A',batch(a),'DELETE');assert.equal(counts.stateWrites,afterWrite);
assert.equal(counts.other,0);console.log('Favorites wire/repository cases passed', JSON.stringify(counts));

}

if (!typesOnly || process.argv.includes("--new-cases")) {
  const { LOCAL_SERVER_REGISTRY } = await import("../../src/data/serverRegistry");
  const wire = require("../../auth-api/src/lib/favoritesState.ts") as typeof import("../../auth-api/src/lib/favoritesState");
  for (const server of LOCAL_SERVER_REGISTRY) for (const alias of [server.code, ...server.aliases]) if (/^[a-z0-9_]+$/i.test(alias)) assert.equal(wire.favoriteServerNamespace(alias), server.code.toLowerCase(), alias);
  const legacy = wire.migrateLegacyFavorites(wire.emptyFavoritesDocument(), { players: { s5_eu_p12: true, f28_net_p1: { name:"Original", class:"mage" } } });
  assert(legacy.entries.some(e=>e.key==='player:eu5::12'));
  const original = legacy.entries.find(e=>e.key==='player:f28::1')!.value!;
  const incomplete = { ...original, display: { name:null, server:'f28', observedAtMs:10 } };
  assert.deepEqual(wire.applyFavoriteBatch(legacy,{changes:[{key:original.key,value:incomplete,baseRevision:1,intent:'display'}],baseOrderRevision:0}).entries.find(e=>e.key===original.key)!.value!.display,original.display);
  console.log('Server alias and incomplete-observation regressions passed');
}

if (!typesOnly || process.argv.includes("--bound-cases")) {
  const wire = require("../../auth-api/src/lib/favoritesState.ts") as typeof import("../../auth-api/src/lib/favoritesState");
  const value = wire.migrateLegacyFavorites(wire.emptyFavoritesDocument(), {players:{f28_p1:{name:"Bound",class:"mage",observedAtMs:10}}}).entries[0].value!;
  value.historicalAt=10;
  const original=wire.applyFavoriteBatch(wire.emptyFavoritesDocument(),{changes:[{key:value.key,value,baseRevision:0,intent:'add'}],baseOrderRevision:0});
  const newer={...value,historicalAt:null,display:{...value.display,name:'Different stand',observedAtMs:20}};
  assert.deepEqual(wire.applyFavoriteBatch(original,{changes:[{key:value.key,value:newer,baseRevision:original.revision,intent:'display'}],baseOrderRevision:0}),original);
  assert.equal(wire.migrateLegacyFavorites(wire.emptyFavoritesDocument(),{players:{f28_p1:{name:'Legacy',class:''}}}).entries[0].value!.display.className,null);
  console.log('Historical cloud observation and legacy empty-class guards passed');
}

if (!typesOnly || process.argv.includes("--portrait-cases")) {
  const wire = require("../../auth-api/src/lib/favoritesState.ts") as typeof import("../../auth-api/src/lib/favoritesState");
  const portrait = {genderName:'male',class:2,race:1,mouth:0,hair:0,hairColor:-1,horn:0,hornColor:0,brows:0,eyes:0,beard:0,nose:0,ears:0,extra:0,special:0};
  const value=wire.parsePortableFavorite({key:'player:f28::1',kind:'player',reference:{identifier:'f28_net_p1',serverNamespace:'f28',entityId:'1'},originalReferences:[],historicalAt:null,display:{name:'Checked portrait',server:'f28',observedAtMs:1,appearance:{classId:2,coaString:null,portrait}}});
  assert.equal(value.display.appearance!.portrait!.hairColor,-1);
  console.log('Checked signed portrait features preserved');
}

// Syntax and targeted type diagnostics; no build output or broad test suite.
const ts = await import('typescript');const fs=await import('node:fs');const path=await import('node:path');
const touched = ['auth-api/src/routes/auth.ts','auth-api/src/app.ts','src/pages/DataHub/Toplist.tsx','src/pages/Toplists/playertoplists.tsx','src/pages/Toplists/guildtoplists.tsx','src/pages/players/PlayerProfileScreen.tsx','src/components/local-player-profile/LocalPlayerFavoriteAction.tsx','src/lib/data-hub/hubFavoritesProjection.ts','src/lib/data-hub/hubFavoritesContract.ts','src/lib/data-hub/hubGuildFavoriteObservation.ts','src/pages/DataHub/OverviewEntry.tsx','src/components/data-hub/LocalGuildFavorites.tsx','auth-api/src/lib/favoritesState.ts','auth-api/src/lib/favoritesStateRepository.ts','src/lib/data-hub/hubFavoritesPortable.ts','src/lib/data-hub/hubFavoritesSync.ts','src/lib/data-hub/hubFavoriteDisplayUpdates.ts','src/lib/data-hub/useFavoriteMembership.ts','src/lib/data-hub/useHubFavorites.ts','src/lib/data-hub/hubFavoritesStore.ts','src/context/AuthContext.tsx','src/components/Topbar/Topbar.tsx','src/components/data-hub/LocalFavoritesMenu.tsx','src/components/data-hub/LocalPlayerFavoriteCard.tsx'];
for(const file of touched){const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});assert.deepEqual(result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error),[],file);}
const config=ts.readConfigFile('tsconfig.app.json',ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent({...config.config,include:undefined},ts.sys,process.cwd());
const program=ts.createProgram([...touched.filter(f=>f.startsWith('src/')),'src/env.d.ts'], {...parsed.options,incremental:false,composite:false});
const own=new Set(touched.map(f=>path.resolve(f).toLowerCase()));const diagnostics=ts.getPreEmitDiagnostics(program).filter(d=>d.file&&own.has(path.resolve(d.file.fileName).toLowerCase()));
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));assert.equal(diagnostics.length,0,'targeted changed-file type diagnostics');
console.log('Targeted changed-file syntax/types passed');
