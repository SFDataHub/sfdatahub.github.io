import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import request from "supertest";
const state = vi.hoisted(() => ({ store: new Map<string, any>(), reads: [] as string[], writes: [] as string[], failRead: false }));
vi.mock("../../../firebase", () => {
  const ref = (path: string): any => ({ path, id: path.split("/").pop(),
    get: async () => { if (state.failRead) throw Error("offline"); state.reads.push(path); return { id: path.split("/").pop(), exists: state.store.has(path), data: () => state.store.get(path) }; },
    set: async (value: any, options?: any) => { state.writes.push(path); state.store.set(path, options?.merge ? { ...state.store.get(path), ...value } : value); },
  });
  const collection = (path: string): any => ({ doc: (id: string) => ref(path + "/" + id), add: async (value: any) => { state.writes.push(path); return value; } });
  return { admin: { auth: () => ({ createCustomToken: vi.fn() }), firestore: { FieldValue: { serverTimestamp: () => null } } }, db: { collection,
    runTransaction: async (fn: any) => fn({ get: (r: any) => r.get(), set: (r: any, v: any, options: any) => r.set(v, options) }),
  } };
});
vi.mock("../../../config", () => ({ GOATCOUNTER_API_BASE_URL: "https://private-test.invalid", GOATCOUNTER_API_TOKEN: "test", UPLOAD_INBOX_TOKEN: "test", AUTH_JWT_SECRET: "test-secret", FRONTEND_BASE_URL: "http://localhost", SESSION_COOKIE_DOMAIN: "" }));
import { COLLECTION_DISPLAY, TOOL_CLICK_PREFIX, eventNames, normalizeToolTarget, usageEvent } from "./events";
import { buildEventStats, collectionTrackingStart } from "./eventStats";
import { buildDateRanges, refreshVisitorAnalyticsDetails } from "./syncSnapshot.handler";
import { clearVisitorReadCache, readVisitorSnapshot, invalidateVisitorReadCache } from "./readSnapshot";
import { PAGE_VIEW_PREFIX, WEBSITE_VISIT_PATH, type Hit } from "./metrics";
import visitor from "../../../routes/visitorAnalytics";
import admin from "../../../routes/admin";
import auth from "../../../routes/auth";
import { createSessionToken, verifySessionToken, createRefreshToken } from "../../../session";
const now = new Date("2026-11-14T16:00:00Z");
const row = (path: string, count: number, event = true): Hit => ({ path, count, event, path_id: 1 });
const range = buildDateRanges(now).today;
const app = express(); app.use(express.json(), cookieParser()); app.use("/api/admin/stats/visitor", visitor); app.use("/admin", admin); app.use("/auth", auth);
const cookie = (roles: string[]) => `sfdatahub_session=${createSessionToken({ userId: "operator", roles })}`;
beforeEach(() => { state.store.clear(); state.reads.length = state.writes.length = 0; state.failRead = false; clearVisitorReadCache(); vi.restoreAllMocks(); });


import { createGoatCounterReader } from "./goatCounter";
import { buildScreenSizes, summarizeSizes } from "./screenSizes";
import { assertAtomicSize, documentBytes, SAFE_DOCUMENT_BYTES } from "../../../storage/bundles";
import { buildMetrics } from "./metrics";
const counts = (factor = 1) => ["phone", "tablet", "desktop", "desktophd", "unknown"].map((id, i) => ({ id, name: "", count: (i + 1) * factor }));
const pageRows = [row("/", 30, false), row("/data-hub?source=a", 12, false), row("/data-hub?source=b", 8, false),
  row("/player/one", 9, false), row("/player/two", 7, false), row("/guild/one", 6, false), row("/guild/two", 4, false),
  row("/guidehub-v2?tab=general&sub=quests", 3, false), row("/guidehub-v2?sub=quests&tab=general&other=x", 2, false),
  ...Array.from({ length: 30 }, (_, i) => row("/other-" + i, 1, false))];
const eventRows = [row(WEBSITE_VISIT_PATH, 91), row(PAGE_VIEW_PREFIX + "/", 80), row(COLLECTION_DISPLAY, 12), row(TOOL_CLICK_PREFIX + "https://future.example/new", 4), row("datahub/analytics/overview", 6)];
const rows = [...pageRows, ...eventRows].map((x, i) => ({ ...x, path_id: i + 1 }));
const factor = (start: string) => start.startsWith("2026-10-15") ? 3 : start.startsWith("2026-11-07") ? 2 : 1;
const out = process.env.W301_OUTPUT;
const save = (name: string, value: unknown) => { if(out) fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2)); };
function upstream(paginated = false) {
  let tick = 0; vi.spyOn(Date, "now").mockImplementation(() => 1900000000000 + tick++ * 100);
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const u = new URL(String(input)); const f = factor(u.searchParams.get("start")!);
    if (u.pathname.endsWith("stats/hits")) {
      const excluded = u.searchParams.get("exclude_paths");
      const all = rows.map(x => ({ ...x, count: x.count * f }));
      return new Response(JSON.stringify({ hits: paginated ? excluded ? all.slice(20) : all.slice(0, 20) : all, more: paginated && !excluded }));
    }
    const ids = u.searchParams.get("include_paths")!.split(",").map(Number);
    expect(ids.every(id => rows.some(x => x.path_id === id && !x.event))).toBe(true);
    const all = counts(ids.length * f), offset = Number(u.searchParams.get("offset"));
    return new Response(JSON.stringify({ stats: paginated ? offset ? all.slice(2) : all.slice(0, 2) : all, more: paginated && offset === 0 }));
  });
}
describe("screen sizes private snapshot", () => {
  it("refreshes through the real admin POST and serves the new stored sizes to Don", async () => {
    const fetch = upstream();
    const refreshed = await request(app).post("/api/admin/stats/visitor/refresh").set("Cookie", cookie(["admin"]));
    expect(refreshed.status).toBe(200);expect(refreshed.body.screenSizes.last30d.overall.counts).not.toBeNull();
    const n = fetch.mock.calls.length;
    const saved = await request(app).get("/api/admin/stats/visitor/snapshot").set("Cookie", cookie(["don", "user"]));
    expect(saved.status).toBe(200);expect(saved.body.details.data.screenSizes).toEqual(refreshed.body.screenSizes);expect(fetch).toHaveBeenCalledTimes(n);
    save("admin-post-chain.json", {adminPost:200,donStoredGet:200,providerRequests:n,extraGetProviderRequests:0});
  });
  it("keeps an exactly full private document untouched when an error marker would overflow it", async () => {
    const value:any = {schemaVersion:2,updatedAt:0,updatedAtIso:now.toISOString(),totals:{today:{visits:42}},lastRefresh:{state:"ok",attemptedAt:now.toISOString()},padding:""};
    const p="analytics/visitor_analytics";value.padding="x".repeat(819200-documentBytes(p,value));state.store.set(p,value);
    await expect(refreshVisitorAnalyticsDetails(async()=>{throw Error("provider");},new Date("2026-11-15T10:00:00Z"))).rejects.toThrow("provider");
    expect(state.store.get(p)).toEqual(value);expect(state.writes.every(p => p === "analytics/visitor_config")).toBe(true);
    save("full-document-error-marker.json", {bytes:documentBytes(p,value),metric:42,originalDateRetained:true,noOversizeMerge:true});
  });

  it("keeps native 600/1000/1920 classes whole and unknown explicit; rejects missing, duplicate and future classes", () => {
    expect(summarizeSizes(counts())).toEqual({ small: 1, medium: 2, large: 7, unknown: 5 });
    expect(summarizeSizes([])).toBeNull();
    expect(summarizeSizes(counts(0))).toEqual({ small: 0, medium: 0, large: 0, unknown: 0 });
    for (const input of [counts().slice(1), [...counts(), counts()[0]], [...counts().slice(0, 4), {id:"future",count:1}], [{id:"phone",count:-1}]]) expect(() => summarizeSizes(input)).toThrow();
  });
  it("processes pagination, reuses original IDs across rankings, excludes all event streams and roundtrips protected GET", async () => {
    const baseline = await refreshVisitorAnalyticsDetails(async (start) => rows.map(x => ({ ...x, count: x.count * factor(start) })), now);
    state.store.set("visitor_metrics_public/bundled", JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../tools/analytics/fixtures/visitor-public-w283.json"), "utf8")).website);
    const fetch = upstream(true);
    const result = await refreshVisitorAnalyticsDetails(createGoatCounterReader(), now);
    for (const key of ["totals", "topPages", "topPlayers", "topGuilds", "topGuides", "eventUsage", "toolClicks", "pageViewEvents", "collectionDisplays"] as const) expect(result[key]).toEqual(baseline[key]);
    for (const key of ["last7d", "last30d"] as const) {
      const window = result.screenSizes[key], f = factor(window.startDateTime);
      expect(window.byPath["/data-hub"]).toMatchObject({counts:{small:2*f, medium:4*f,large:14*f,unknown:10*f},pageVisits:20*f,total:30*f});
      expect(window.byPath["/player/one"].pageVisits).toBe(9*f); expect(window.byPath["/player/two"].pageVisits).toBe(7*f);
      expect(window.byPath["/guidehub-v2?tab=general&sub=quests"].pageVisits).toBe(5*f);
      expect(window.overall.total).toBe(pageRows.length * 15 * f);
      const urls = fetch.mock.calls.map(([input]) => new URL(String(input))).filter(u => u.pathname.endsWith("sizes") && u.searchParams.get("start") === window.startDateTime && u.searchParams.get("offset") === "0");
      const ids = urls.flatMap(u => u.searchParams.get("include_paths")!.split(","));
      expect(new Set(ids).size).toBe(ids.length);expect(ids.length).toBe(pageRows.length);
      expect(urls.length).toBe(Object.keys(window.byPath).length + 1);
      expect(result.topPages[key]).toHaveLength(25);
    }
    invalidateVisitorReadCache();
    const saved = await request(app).get("/api/admin/stats/visitor/snapshot").set("Cookie", cookie(["user", "don"]));
    expect(saved.status).toBe(200);expect(saved.body.details.data.screenSizes).toEqual(result.screenSizes);
    const countBefore = fetch.mock.calls.length;
    expect((await request(app).get("/api/admin/stats/visitor/snapshot").set("Cookie", cookie(["admin"]))).status).toBe(200);
    expect(fetch.mock.calls).toHaveLength(countBefore);
    expect((await request(app).post("/api/admin/stats/visitor/refresh").set("Cookie", cookie(["don"]))).status).toBe(403);
    save("snapshot-filled.json",saved.body);
    save("reader-chain.json",{requests:fetch.mock.calls.map(([input])=>String(input)),countUnchanged:true,stored:true,protectedGet:200});
    expect(saved.body.website.data.website).toEqual(state.store.get("visitor_metrics_public/bundled").website);
  });
  it("bounds include lists, preserves missing versus measured zero and partial coverage", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({...row("/same?x="+i,1,false),path_id:i+1}));
    const read = vi.fn(async (_s:string,_e:string,ids:number[]) => ids[0] === 101 ? null : {small:0,medium:0,large:0,unknown:0});
    const result=await buildScreenSizes(many,["/same"],()=>"/same",range,read);
    expect(read.mock.calls.map(call=>call[2].length)).toEqual([100,100,50]);
    expect(result.byPath["/same"]).toMatchObject({state:"partial",total:0,counts:{unknown:0},pageVisits:250});
    const absent=await buildScreenSizes(many,["/same"],()=>"/same",range,async()=>null);
    expect(absent.overall).toMatchObject({state:"not_recorded",total:null,counts:null});
    expect((await buildScreenSizes([],[],()=>null,range,read)).overall.total).toBeNull();
  });
  it("rejects incomplete pagination and provider errors without replacing the last good date or counters", async () => {
    const old=await refreshVisitorAnalyticsDetails(async()=>rows,now);
    for(const payload of [{stats:counts().slice(0,2),more:false},{stats:[],more:true},{stats:counts().slice(0,1),more:true}]){
      vi.spyOn(globalThis,"fetch").mockImplementation(async()=>new Response(JSON.stringify(payload)));
      await expect(createGoatCounterReader().sizes!(range.startDateTime,range.endDateTime,[1])).rejects.toThrow();
      vi.restoreAllMocks();
    }
    const read=Object.assign(async()=>rows,{sizes:async()=>{throw Error("provider failure")}});
    await expect(refreshVisitorAnalyticsDetails(read,new Date("2026-11-15T10:00:00Z"))).rejects.toThrow("provider failure");
    const retained=state.store.get("analytics/visitor_analytics");expect(retained.totals).toEqual(old.totals);expect(retained.updatedAtIso).toBe(old.updatedAtIso);expect(retained.screenSizes).toEqual(old.screenSizes);
    expect((await readVisitorSnapshot(now)).details.state).toBe("error");
  });
  it("retains retry, URL, shared request budget and provider response guards for sizes", async () => {
    let tick=0;vi.spyOn(Date,"now").mockImplementation(()=>1900000000000+tick++);
    const timeout=globalThis.setTimeout;vi.spyOn(globalThis,"setTimeout").mockImplementation(((fn:any,_ms:any,...args:any[])=>timeout(fn,0,...args)) as typeof setTimeout);
    const mock=vi.spyOn(globalThis,"fetch").mockImplementation(async()=>new Response(JSON.stringify({stats:counts(),more:false})));
    mock.mockResolvedValueOnce(new Response("{}",{status:429,headers:{"retry-after":"0"}}));
    const reader=createGoatCounterReader();await reader.sizes!(range.startDateTime,range.endDateTime,[1]);expect(mock).toHaveBeenCalledTimes(2);
    await expect(reader.sizes!("x".repeat(14000),"end",[1])).rejects.toThrow("URL limit");
    for(let i=2;i<240;i++)await reader.sizes!(range.startDateTime,range.endDateTime,[i]);
    await expect(reader.sizes!(range.startDateTime,range.endDateTime,[240])).rejects.toThrow("budget");
    expect(mock).toHaveBeenCalledTimes(240);
  });
  it("raises only the opt-in private document limit, measures real payloads and rejects overflow atomically", async () => {
    expect(SAFE_DOCUMENT_BYTES).toBe(512*1024);
    const privatePath="analytics/visitor_analytics";
    const measurements:any[]=[];
    const measure=(name:string,value:any)=>{const sized={...value,updatedAt:0}; const result={name,jsonBytes:Buffer.byteLength(JSON.stringify(value)),documentBytes:documentBytes(privatePath,sized)};measurements.push(result);return result};
    const {ok:_initialOk,...initial}=await refreshVisitorAnalyticsDetails(async()=>rows,now);
    const {ok:_fullOk,...full}=await refreshVisitorAnalyticsDetails(Object.assign(async()=>rows,{sizes:async()=>({small:1,medium:2,large:7,unknown:5})}),now);
    const {screenSizes:_sizes,...base}=initial; measure("controlled-base-without-sizes",base);
    measure("representative-complete",full);
    const events=Array.from({length:720},(_,i)=>({...row("help/qa/question-open/q-"+i+"-"+"x".repeat(40),1),path_id:1000+i}));
    const ranked=[...Array.from({length:25},(_,i)=>row("/popular-"+i,1000,false)),...Array.from({length:25},(_,i)=>row("/player/full-"+i,500,false)),...Array.from({length:25},(_,i)=>row("/guild/full-"+i,400,false)),...Array.from({length:25},(_,i)=>row("/guidehub-v2/full-"+i,300,false))].map((hit,i)=>({...hit,path_id:2000+i}));
    const tools=Array.from({length:50},(_,i)=>({...row(TOOL_CLICK_PREFIX+"https://stress.example/"+i+"/"+"x".repeat(300),1),path_id:3000+i,title:"Tool "+"N".repeat(115)}));
    const readSizes=vi.fn(async(_s:string,_e:string,ids:number[])=>({small:ids.length,medium:ids.length*2,large:ids.length*7,unknown:ids.length*5}));
    const {ok:_largeOk,...large}=await refreshVisitorAnalyticsDetails(Object.assign(async()=>[...ranked,...rows,...events,...tools],{sizes:readSizes}),now);
    for(const key of ["last7d","last30d"] as const){expect(Object.keys(large.screenSizes[key].byPath)).toHaveLength(100);for(const list of [large.topPages,large.topPlayers,large.topGuilds,large.topGuides])expect(list[key]).toHaveLength(25);}
    expect(readSizes).toHaveBeenCalledTimes(202);
    save("full-top25-request-proof.json",{windows:2,uniqueSelectedPerWindow:100,sizeQueries:readSizes.mock.calls.map(c=>({start:c[0],ids:c[2]})),usageEvents:721});
    expect(large.eventUsage.last30d.events).toHaveLength(721);measure("large-720-events",large);
    if(out){const historical=JSON.parse(fs.readFileSync(path.resolve(out,"../w300/snapshot-filled.json"),"utf8"));measure("authentic-W300-controlled-private-base",historical.details.data);}
    for(const delta of [-1,0,1]){
      const value:any={...full,padding:"",updatedAt:0};value.padding="a".repeat(819200+delta-documentBytes(privatePath,value));
      expect(documentBytes(privatePath,value)).toBe(819200+delta);measure("boundary"+delta,value);
      const writes=[{path:privatePath,value}];
      if(delta<=0)assertAtomicSize(writes,{visitorAnalytics:true});else expect(()=>assertAtomicSize(writes,{visitorAnalytics:true})).toThrow();
      expect(()=>assertAtomicSize(writes)).toThrow();
      expect(()=>assertAtomicSize([{path:"analytics/other",value}],{visitorAnalytics:true})).toThrow();
    }
    expect(()=>assertAtomicSize(Array.from({length:12},()=>({path:privatePath,value:{padding:"a".repeat(750000)}})),{visitorAnalytics:true})).toThrow("Atomic publication");
    const retained=state.store.get(privatePath);
    await expect(refreshVisitorAnalyticsDetails(async()=>[...rows,...Array.from({length:1400},(_,i)=>row(TOOL_CLICK_PREFIX+"https://long.example/"+i+"x".repeat(400),1))],new Date("2026-11-15T10:00:00Z"))).rejects.toThrow("size");
    expect(state.store.get(privatePath).updatedAtIso).toBe(retained.updatedAtIso);expect(state.store.get(privatePath).eventUsage).toEqual(retained.eventUsage);
    save("document-sizes.json",measurements);
  });
});
