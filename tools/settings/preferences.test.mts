import assert from "node:assert/strict";
import { createPreferencesStore, PREFERENCES_KEY, GUILD_PROFILE_MODES } from "../../src/lib/settings/preferences";
const results: string[] = [];
function test(name: string, run: () => void) { run(); results.push(name); console.log("PASS", name); }
function fixture(initial: string | null = null) {
  let raw = initial, writes = 0, notices = 0, failRead = false, failWrite = false;
  const events = new EventTarget();
  const storage = { getItem(key: string) { assert.equal(key, PREFERENCES_KEY); if (failRead) throw Error("denied"); return raw; }, setItem(key: string, value: string) { assert.equal(key, PREFERENCES_KEY); if (failWrite) throw Error("quota"); raw = value; writes++; } };
  const store = createPreferencesStore(() => storage, events as any);
  const unsubscribe = store.subscribe(() => notices++);
  return { store, unsubscribe, raw: () => raw, writes: () => writes, notices: () => notices, setReadError: (v: boolean) => failRead = v, setWriteError: (v: boolean) => failWrite = v,
    external(value: string | null, notify = true, key: string | null = PREFERENCES_KEY) { raw = value; if (notify) { const event = new Event("storage"); Object.assign(event, { key }); events.dispatchEvent(event); } } };
}
const encoded = (mode: unknown) => JSON.stringify({ schemaVersion: 1, dataHub: { profiles: { attributeSumMode: mode } } });
test("missing default: no write; stable snapshot; no-op without notifications", () => {
 const f=fixture();const s=f.store.getSnapshot(), n=f.notices();assert.equal(s.status,"missing");assert.equal(s.attributeSumMode,"main-con");assert.equal(s,f.store.refresh());
 assert.equal(f.store.saveAttributeSumMode("main-con",s).status,"unchanged");assert.equal(f.writes(),0);assert.equal(f.notices(),n);
});
test("explicit save and fresh owner read",()=>{const f=fixture();const n=f.notices();const r=f.store.saveAttributeSumMode("all-five",f.store.getSnapshot());assert.equal(r.status,"saved");assert.equal(f.writes(),1);assert.equal(f.notices(),n+1);assert.equal(fixture(f.raw()).store.getSnapshot().attributeSumMode,"all-five");const s=r.snapshot;assert.equal(f.store.saveAttributeSumMode("all-five",s).status,"unchanged");assert.equal(f.store.getSnapshot(),s);assert.equal(f.writes(),1);assert.equal(f.notices(),n+1);});
test("invalid enums, malformed JSON and unsupported old shape never repair on read",()=>{for(const raw of [encoded("bad"),encoded(null),"{broken", "[]", "null",'{"schemaVersion":0}']){const f=fixture(raw);assert.equal(f.store.getSnapshot().status,"invalid");assert.equal(f.store.getSnapshot().attributeSumMode,"main-con");assert.equal(f.writes(),0);assert.equal(f.raw(),raw);assert.equal(f.store.saveAttributeSumMode("all-five",f.store.getSnapshot()).status,"saved");assert.equal(fixture(f.raw()).store.getSnapshot().status,"ready");}});
test("read failure differs from missing and blocks writes until retry",()=>{const f=fixture();f.setReadError(true);const s=f.store.refresh();assert.equal(s.status,"read-error");assert.equal(f.store.saveAttributeSumMode("all-five",s).status,"read-error");assert.equal(f.writes(),0);f.setReadError(false);assert.equal(f.store.refresh().status,"missing");});
test("future schema is never overwritten",()=>{const raw=JSON.stringify({schemaVersion:2,dataHub:{profiles:{attributeSumMode:"all-five"}},future:42});const f=fixture(raw);assert.equal(f.store.getSnapshot().status,"incompatible");assert.equal(f.store.saveAttributeSumMode("all-five",f.store.getSnapshot()).status,"incompatible");assert.equal(f.writes(),0);assert.equal(f.raw(),raw);});
test("supported schema retains unknown neighbors at every level",()=>{const data={schemaVersion:1,other:{array:[1,2]},dataHub:{other:true,profiles:{unknown:{x:"keep"},attributeSumMode:"bad"}}};const f=fixture(JSON.stringify(data));assert.equal(f.store.saveAttributeSumMode("all-five",f.store.getSnapshot()).status,"saved");assert.deepEqual(JSON.parse(f.raw()!),{...data,dataHub:{...data.dataHub,profiles:{...data.dataHub.profiles,attributeSumMode:"all-five"}}});});
test("failed write retains saved snapshot and draft can be retried",()=>{const f=fixture(encoded("main-con"));const s=f.store.getSnapshot(),n=f.notices();f.setWriteError(true);assert.equal(f.store.saveAttributeSumMode("all-five",s).status,"write-error");assert.equal(f.store.getSnapshot(),s);assert.equal(f.writes(),0);assert.equal(f.notices(),n);f.setWriteError(false);assert.equal(f.store.saveAttributeSumMode("all-five",s).status,"saved");});
test("storage event updates; unchanged events stay stable; remove and clear use default without write",()=>{const f=fixture();f.external(encoded("all-five"));const s=f.store.getSnapshot(),n=f.notices();assert.equal(s.attributeSumMode,"all-five");f.external(encoded("all-five"));assert.equal(f.store.getSnapshot(),s);assert.equal(f.notices(),n);f.external(null);assert.equal(f.store.getSnapshot().status,"missing");assert.equal(f.store.getSnapshot().attributeSumMode,"main-con");f.external(encoded("all-five"));f.external(null,true,null);assert.equal(f.store.getSnapshot().status,"missing");assert.equal(f.writes(),0);});
test("draft basis and delayed storage event cannot overwrite another tab",()=>{const f=fixture();const basis=f.store.getSnapshot();f.external(encoded("all-five"),false);assert.equal(f.store.saveAttributeSumMode("all-five",basis).status,"conflict");assert.equal(f.writes(),0);assert.equal(f.store.getSnapshot().attributeSumMode,"all-five");});
test("neighbor-only tab updates also conflict",()=>{const f=fixture(encoded("main-con"));const basis=f.store.getSnapshot();f.external(JSON.stringify({schemaVersion:1,other:1,dataHub:{profiles:{attributeSumMode:"main-con"}}}),false);assert.equal(f.store.saveAttributeSumMode("all-five",basis).status,"conflict");assert.equal(f.writes(),0);});
test("unrelated keys ignored; unsubscribe/re-subscribe reads latest",()=>{const f=fixture();const s=f.store.getSnapshot();f.external(encoded("all-five"),true,"unrelated");assert.equal(f.store.getSnapshot(),s);f.unsubscribe();f.external(null);f.store.subscribe(()=>{});assert.equal(f.store.getSnapshot().status,"missing");assert.equal(f.writes(),0);});
test("legacy all-five keeps its sum with the unwritten burger default",()=>{
 const f=fixture(encoded("all-five"));assert.equal(f.store.getSnapshot().navigationMode,"burger");assert.equal(f.store.getSnapshot().attributeSumMode,"all-five");assert.equal(f.store.getSnapshot().status,"ready");assert.equal(f.writes(),0);
});
test("navigation and sums save independently preserving unknown neighbors",()=>{
 const data={schemaVersion:1,neighbor:42,general:{future:[1]},dataHub:{profiles:{attributeSumMode:"all-five",future:true}}};
 const f=fixture(JSON.stringify(data));let r=f.store.saveNavigationMode("sidebar",f.store.getSnapshot());assert.equal(r.status,"saved");assert.deepEqual(JSON.parse(f.raw()!),{...data,general:{...data.general,navigationMode:"sidebar"}});
 r=f.store.saveAttributeSumMode("main-con",r.snapshot);assert.equal(r.status,"saved");assert.equal(r.snapshot.navigationMode,"sidebar");assert.equal(JSON.parse(f.raw()!).general.future[0],1);
 r=f.store.savePreferences({navigationMode:"burger",attributeSumMode:"all-five"},r.snapshot);assert.equal(r.status,"saved");assert.equal(r.snapshot.attributeSumMode,"all-five");assert.equal(r.snapshot.navigationMode,"burger");assert.equal(f.writes(),3);
});
test("invalid navigation never resets valid all-five or writes on read",()=>{
 for(const navigationMode of [null,42,"future",{}]){const f=fixture(JSON.stringify({schemaVersion:1,general:{navigationMode},dataHub:{profiles:{attributeSumMode:"all-five"}}}));const s=f.store.getSnapshot();assert.equal(s.attributeSumMode,"all-five");assert.equal(s.navigationMode,"burger");assert.equal(s.status,"invalid");assert.equal(f.writes(),0);assert.equal(f.store.saveNavigationMode("sidebar",s).snapshot.attributeSumMode,"all-five");}
});
test("navigation-only records decode and invalid sums do not reset navigation",()=>{
 const f=fixture(JSON.stringify({schemaVersion:1,general:{navigationMode:"sidebar"}}));assert.equal(f.store.getSnapshot().status,"ready");assert.equal(f.store.getSnapshot().attributeSumMode,"main-con");
 f.external(JSON.stringify({schemaVersion:1,general:{navigationMode:"sidebar"},dataHub:{profiles:{attributeSumMode:"bad"}}}));assert.equal(f.store.getSnapshot().navigationMode,"sidebar");assert.equal(f.store.getSnapshot().status,"invalid");assert.equal(f.writes(),0);
});
test("navigation saves respect conflicts, future schema and storage failures",()=>{
 const f=fixture(encoded("all-five")),basis=f.store.getSnapshot();f.external(JSON.stringify({schemaVersion:1,general:{navigationMode:"sidebar"},dataHub:{profiles:{attributeSumMode:"all-five"}}}),false);assert.equal(f.store.saveNavigationMode("sidebar",basis).status,"conflict");
 f.setWriteError(true);const current=f.store.getSnapshot();assert.equal(f.store.saveNavigationMode("burger",current).status,"write-error");assert.equal(f.store.getSnapshot(),current);f.setWriteError(false);
 f.external('{"schemaVersion":2}');assert.equal(f.store.saveNavigationMode("sidebar",f.store.getSnapshot()).status,"incompatible");assert.equal(f.writes(),0);
 f.setReadError(true);assert.equal(f.store.refresh().navigationMode,"burger");assert.equal(f.store.saveNavigationMode("sidebar",f.store.getSnapshot()).status,"read-error");assert.equal(f.writes(),0);
});
test("guild profile modes round-trip and preserve both existing settings and unknown neighbors",()=>{
 for(const guildProfileMode of GUILD_PROFILE_MODES){
  const data={schemaVersion:1,unknown:[1],general:{navigationMode:"sidebar",future:true},dataHub:{future:3,profiles:{attributeSumMode:"all-five",future:{keep:true}}}};
  const f=fixture(JSON.stringify(data));const r=f.store.savePreferences({guildProfileMode},f.store.getSnapshot());
  assert.equal(r.status,guildProfileMode==="base"?"unchanged":"saved");assert.equal(fixture(f.raw()).store.getSnapshot().guildProfileMode,guildProfileMode);
  assert.equal(r.snapshot.attributeSumMode,"all-five");assert.equal(r.snapshot.navigationMode,"sidebar");
  assert.deepEqual(JSON.parse(f.raw()!),guildProfileMode==="base"?data:{...data,dataHub:{...data.dataHub,profiles:{...data.dataHub.profiles,guildProfileMode}}});
  const next=f.store.savePreferences({attributeSumMode:"main-con",navigationMode:"burger"},r.snapshot);assert.equal(next.snapshot.guildProfileMode,guildProfileMode);
 }
});
test("missing or invalid guild view uses Base without repairs or loss of valid neighbors",()=>{
 for(const value of [undefined,null,42,"other",{},[]]){
  const raw=JSON.stringify({schemaVersion:1,general:{navigationMode:"sidebar"},dataHub:{profiles:{attributeSumMode:"all-five",guildProfileMode:value}}});
  const f=fixture(raw),s=f.store.getSnapshot();assert.equal(s.guildProfileMode,"base");assert.equal(s.status,value===undefined?"ready":"invalid");assert.equal(s.attributeSumMode,"all-five");assert.equal(s.navigationMode,"sidebar");assert.equal(f.writes(),0);assert.equal(f.raw(),raw);
 }
 assert.equal(fixture().store.getSnapshot().guildProfileMode,"base");
});
test("guild view uses existing tab concurrency, version and failure protections",()=>{
 const f=fixture(),basis=f.store.getSnapshot();f.external(JSON.stringify({schemaVersion:1,dataHub:{profiles:{guildProfileMode:"total"}}}),false);
 assert.equal(f.store.savePreferences({guildProfileMode:"fortress"},basis).status,"conflict");assert.equal(f.writes(),0);
 f.external(JSON.stringify({schemaVersion:1,dataHub:{profiles:{guildProfileMode:"progress"}}}));assert.equal(f.store.getSnapshot().guildProfileMode,"progress");
 f.setReadError(true);assert.equal(f.store.refresh().guildProfileMode,"progress");assert.equal(f.store.savePreferences({guildProfileMode:"general"},f.store.getSnapshot()).status,"read-error");f.setReadError(false);
 f.setWriteError(true);assert.equal(f.store.savePreferences({guildProfileMode:"general"},f.store.refresh()).status,"write-error");f.setWriteError(false);
 f.external('{"schemaVersion":2}');assert.equal(f.store.savePreferences({guildProfileMode:"general"},f.store.getSnapshot()).status,"incompatible");assert.equal(f.writes(),0);
});
console.log(JSON.stringify({passed:results.length,results}));

test("toplist defaults read without writes and independent custom orders survive mode changes", () => {
 const f=fixture(), basis=f.store.getSnapshot();
 assert.equal(basis.toplistViews.players.mode,"default");assert.equal(basis.toplistViews.guilds.mode,"default");assert.equal(f.writes(),0);
 const views={...basis.toplistViews,players:{mode:"custom" as const,columns:["class","name","server"]}};
 const saved=f.store.savePreferences({toplistViews:views},basis);assert.equal(saved.status,"saved");
 assert.deepEqual(saved.snapshot.toplistViews.players.columns,["class","name","server"]);
 assert.deepEqual(saved.snapshot.toplistViews.guilds,basis.toplistViews.guilds);
 const defaulted=f.store.savePreferences({toplistViews:{...views,players:{...views.players,mode:"default"}}},saved.snapshot);
 assert.deepEqual(defaulted.snapshot.toplistViews.players.columns,views.players.columns);
 const restored=fixture(f.raw()).store.getSnapshot();assert.deepEqual(restored.toplistViews,defaulted.snapshot.toplistViews);
});
test("toplist invalid identifiers normalize safely, keep Name position and preserve unknown fields", () => {
 const data={schemaVersion:1,general:{navigationMode:"sidebar"},dataHub:{profiles:{attributeSumMode:"all-five"},toplists:{future:4,players:{mode:"custom",columns:["server","bad","name","server","level"],future:true}}}};
 const f=fixture(JSON.stringify(data));let basis=f.store.getSnapshot();assert.deepEqual(basis.toplistViews.players.columns,["server","name","level"]);assert.equal(f.writes(),0);
 const r=f.store.savePreferences({toplistViews:{...basis.toplistViews,guilds:{mode:"custom",columns:["name"]}}},basis);
 const parsed=JSON.parse(f.raw()!);assert.equal(parsed.dataHub.toplists.future,4);assert.equal(parsed.dataHub.toplists.players.future,true);assert.equal(r.snapshot.navigationMode,"sidebar");assert.equal(r.snapshot.attributeSumMode,"all-five");
 basis=r.snapshot;const missingName=f.store.savePreferences({toplistViews:{...basis.toplistViews,players:{mode:"custom",columns:["level","level","bad"]}}},basis);assert.deepEqual(missingName.snapshot.toplistViews.players.columns,["level","name"]);
 f.external(JSON.stringify({...data,neighbor:5}),false);assert.equal(f.store.savePreferences({toplistViews:basis.toplistViews},basis).status,"conflict");
 f.setWriteError(true);assert.equal(f.store.savePreferences({toplistViews:basis.toplistViews},f.store.getSnapshot()).status,"write-error");
});
