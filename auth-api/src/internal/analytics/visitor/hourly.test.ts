import { db } from "../../../firebase";
import { hashBits } from "../../../storage/bundles";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

const storedPage = (path: string): any => {
  const id = pathId(path), manifest = state.store.get("visitor_metrics_public/bundled");
  if (manifest.inlineEntries !== undefined) return manifest.inlineEntries[id];
  const prefix = manifest.bundles.find((bundle: any) => hashBits(id).startsWith(bundle.prefix)).prefix;
  return state.store.get("visitor_metrics_public/bundled/pages/b_" + (prefix || "root")).entries[id];
};
const state = vi.hoisted(() => ({ store: new Map<string, any>(), writes: [] as string[], reads: [] as string[], deletes: [] as string[], failCommit: false, transactions: 0, failCheckpoint: false, retryPublication: false, retried: 0, writtenSizes: [] as number[] }));
vi.mock("../../../firebase", () => {
  function merge(target: any, patch: any): any {
    const result = { ...target };
    for (const [key, value] of Object.entries(patch)) result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? merge(result[key], value) : structuredClone(value);
    return result;
  }
  let queue = Promise.resolve();
  const ref = (path: string): any => ({
    path, id: path.split("/").at(-1), collection: (name: string) => collection(path + "/" + name),
    get: async () => { state.reads.push(path); return { exists: state.store.has(path), data: () => state.store.get(path) }; },
    set: async (data: unknown) => { state.writes.push(path); state.store.set(path, data); },
  });
  const collection = (path: string): any => ({
    path, doc: (id: string) => ref(path + "/" + id),
    get: async () => {
      const docs = [...state.store].filter(([key]) => key.startsWith(path + "/") && key.split("/").length === path.split("/").length + 1).map(([key, value]) => ({ id: key.split("/").at(-1), ref: ref(key), data: () => value }));
      state.reads.push(...(docs.length ? docs.map(doc => doc.ref.path) : [path + " (empty query)"]));
      return { docs };
    },
  });
  return { admin: { firestore: { FieldValue: { serverTimestamp: () => null } } }, db: {
    collection,
    runTransaction: (work: any) => {
      state.transactions++;
      const operation = queue.then(async () => {
      const pending: Array<() => void> = [];
      let publishing = false;
      const attempt = () => work({ get: (r: any) => r.get(), set: (r: any, value: any, options: any) => {
        if (state.failCheckpoint && r.path === "analytics/visitor_work" && value.pages > (state.store.get(r.path)?.pages ?? 0)) throw Error("Checkpoint interrupted between data and cursor");
        publishing ||= r.path === "visitor_metrics_public/bundled";
        pending.push(() => { state.writes.push(r.path); const stored=options?.merge ? merge(state.store.get(r.path), value) : structuredClone(value); state.writtenSizes.push(documentBytes(r.path,stored)); state.store.set(r.path,stored); });
      }, delete: (r: any) => pending.push(() => { state.deletes.push(r.path); state.store.delete(r.path); }) });
      let result = await attempt();
      if (publishing && state.retryPublication) { state.retryPublication=false;state.retried++;pending.length=0;result=await attempt(); }
      if (publishing && state.failCommit) throw Error("Commit interrupted");
      for (const write of pending) write();
      return result;
      }); queue = operation.catch(() => {}); return operation;
    },
  } };
});
vi.mock("../../../config", () => ({ GOATCOUNTER_API_BASE_URL: "https://test.goatcounter.com/api/v0/api/v0/", GOATCOUNTER_API_TOKEN: "private-test-key", UPLOAD_INBOX_TOKEN: "private-internal", AUTH_JWT_SECRET: "private-jwt", FRONTEND_BASE_URL: "http://localhost", SESSION_COOKIE_DOMAIN: "" }));

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathId, WEBSITE_VISIT_PATH, PAGE_VIEW_PREFIX, settingsHash, publishMetrics, type Hit } from "./metrics";
import { syncVisitorAnalytics, refreshVisitorAnalyticsDetails, syncVisitorAnalyticsDetails, syncVisitorAnalyticsSnapshotHandler } from "./syncSnapshot.handler";
import { createGoatCounterReader, type VisitorReader } from "./goatCounter";
import { prepareVisitorWorkStorage } from "./continuation";
import { clearVisitorReadCache, readVisitorSnapshot } from "./readSnapshot";
import { TOOL_CLICK_PREFIX, COLLECTION_DISPLAY } from "./events";
import visitorRoutes from "../../../routes/visitorAnalytics";
import { createSessionToken } from "../../../session";
import { documentBytes, digest } from "../../../storage/bundles";
const configPath = "analytics/visitor_config", privatePath = "analytics/visitor_analytics", publicPath = "visitor_metrics_public/bundled";
const now = new Date("2026-11-14T16:00:00Z");
const rows: Hit[] = [
  { path: WEBSITE_VISIT_PATH, count: 11, event: true, path_id: 1 },
  { path: PAGE_VIEW_PREFIX + "/help", count: 9, event: true, path_id: 2 },
  { path: "/player/eu1_p1", count: 8, event: false, path_id: 3 },
  { path: TOOL_CLICK_PREFIX + "https://example.org/new-tool", title: "Dynamic Hourly Tool", count: 4, event: true, path_id: 4 },
  { path: COLLECTION_DISPLAY, count: 3, event: true, path_id: 5 },
  { path: "datahub/favorites/open", count: 2, event: true, path_id: 6 },
];
let clock: number;
beforeEach(() => {
  state.failCheckpoint=false;state.failCommit=false;state.retryPublication=false;state.retried=0;state.writtenSizes.length=0;state.store.clear(); state.reads.length = state.writes.length = state.deletes.length = 0; state.transactions = 0;
  vi.useRealTimers(); vi.restoreAllMocks(); clearVisitorReadCache(); clock = now.getTime(); vi.spyOn(Date, "now").mockImplementation(() => clock);
  state.store.set(configPath, { startDate: "2026-11-14", sessionsVerified: true, revision: "one", legacyPublicClients: false,
    collectionTrackingStartedAt: "2026-11-14T00:00:00Z", syncLease: {version:1,id:"",until:0} });
});
const reader = () => {
  const read: VisitorReader = vi.fn(async () => rows);
  read.sizes = vi.fn(async () => ({small:1, medium:2, large:3, unknown:4}));
  return read;
};
const ledger = () => ({reads:state.reads.length,writes:state.writes.length,deletes:state.deletes.length,transactions:state.transactions});
const resetLedger = () => {state.writtenSizes.length=0;state.reads.length=state.writes.length=state.deletes.length=state.transactions=0;};
const hold = () => { let release!:()=>void;const wait=new Promise<void>(r=>release=r);return {wait,release}; };
const begun = async () => { for(let i=0;i<25&&!state.store.get(configPath).privateSync?.owner;i++)await Promise.resolve();expect(state.store.get(configPath).privateSync.owner).toBeTruthy(); };
describe("shared hourly visitor publication", () => {
  it("publishes both areas including names and sizes, invalidates cached GET, and skips a completed hour", async () => {
    await readVisitorSnapshot(now); resetLedger();
    const read=reader();const result=await syncVisitorAnalytics(read,now);
    expect(result.ok).toBe(true);expect(result.public.skipped).toBe(false);expect(result.private.skipped).toBe(false);
    expect(state.store.get(privatePath).toolClicks.last30d.targets[0].toolName).toBe("Dynamic Hourly Tool");
    expect(state.store.get(privatePath).screenSizes.last30d.overall.counts.small).toBe(1);
    expect(documentBytes(privatePath,{...state.store.get(privatePath),updatedAt:0})).toBeLessThanOrEqual(819200);
    expect(documentBytes(publicPath,state.store.get(publicPath))).toBeLessThanOrEqual(524288);
    const first=ledger();const saved=await readVisitorSnapshot(now);expect(saved.details.asOf).toBe(now.toISOString());
    expect(saved.website.data?.website.today).toBe(11);
    if(process.env.W305_OUTPUT)fs.writeFileSync(path.join(process.env.W305_OUTPUT,"snapshot-hourly.json"),JSON.stringify(saved,null,2));
    resetLedger();const repeated=await syncVisitorAnalytics(reader(),now);expect(repeated.ok).toBe(true);
    expect(repeated.public.skipped).toBe(true);expect(repeated.private.skipped).toBe(true);expect(state.writes).toHaveLength(0);
    console.log("ACCESS_COUNTS",JSON.stringify({first,repeated:ledger()}));
  });
  it.each(["private","public"])("retains %s errors independently and retries only unfinished work", async area => {
    const read=reader(); let calls=0;
    const failing: VisitorReader = async (start,end) => { calls++; if(area==="public"?calls===1:start!=="2026-11-13T23:00:00.000Z")throw Error("provider");return read(start,end); };
    failing.sizes=read.sizes;
    const first=await syncVisitorAnalytics(failing,now);expect(first.ok).toBe(false);
    expect(first[area].ok).toBe(false);expect(first[area==="private"?"public":"private"].ok).toBe(true);
    const retry=reader();const second=await syncVisitorAnalytics(retry,now);expect(second.ok).toBe(true);
    expect(second[area==="private"?"public":"private"].skipped).toBe(true);
    expect(retry).toHaveBeenCalledTimes(area==="private"?3:1);
  });
  it("still updates absent private data when public is current", async () => {
    await syncVisitorAnalytics(reader(),now);state.store.delete(privatePath);
    const read=reader();const result=await syncVisitorAnalytics(read,now);
    expect(result.public.skipped).toBe(true);expect(result.private.skipped).toBe(false);expect(read).toHaveBeenCalledTimes(3);
  });
  it.each([true,false])("fences overlapping automatic/manual refresh (first automatic=%s)", async automatic => {
    const gate=hold(), read=reader();let first=true;
    const blocked: VisitorReader = async (...args) => { if(first){first=false;await gate.wait;}return read(...args); };blocked.sizes=read.sizes;
    const older=automatic?syncVisitorAnalyticsDetails(blocked,now):refreshVisitorAnalyticsDetails(blocked,now);
    await begun();
    if(automatic)await expect(refreshVisitorAnalyticsDetails(reader(),now)).rejects.toThrow("busy");
    else expect(await syncVisitorAnalyticsDetails(reader(),now)).toMatchObject({skipped:true,reason:"busy"});
    gate.release();await older;expect(state.store.get(privatePath).lastRefresh.state).toBe("ok");
  });
  it.each(["commit","failure"])("an expired replaced owner cannot alter success or unlock its successor (%s)", async mode => {
    const gate=hold(), read=reader(); let first=true;
    const blocked: VisitorReader=async (...args)=>{if(first){first=false;await gate.wait;if(mode==="failure")throw Error("old failure");}return read(...args);};blocked.sizes=read.sizes;
    const older=refreshVisitorAnalyticsDetails(blocked,now);const rejection=expect(older).rejects.toThrow();await begun();
    clock+=240001;const newerTime=new Date(clock);await refreshVisitorAnalyticsDetails(reader(),newerTime);
    const newer=structuredClone(state.store.get(privatePath));
    state.store.get(configPath).privateSync={owner:"third-owner",until:clock+240000};
    gate.release();await rejection;expect(state.store.get(privatePath)).toEqual(newer);
    expect(state.store.get(configPath).privateSync.owner).toBe("third-owner");
  });
  it.each(["settings","tracking","lease-only","public-lease","expired"])("checks %s immediately before private commit", async mode => {
    await refreshVisitorAnalyticsDetails(reader(),now);const previous=structuredClone(state.store.get(privatePath));clock+=3600000;
    const read=reader();let changed=false;
    const altering: VisitorReader=async (...args)=>{if(!changed){changed=true;const config=state.store.get(configPath);
      if(mode==="settings")config.sessionsVerified=false;
      if(mode==="tracking")config.collectionTrackingStartedAt="2026-11-13T00:00:00Z";
      if(mode==="lease-only")config.privateSync.until+=100;
      if(mode==="public-lease")config.syncLease={version:1,id:"other",until:clock+240000};
      if(mode==="expired")clock+=240001;
    }return read(...args);};altering.sizes=read.sizes;
    if(["lease-only","public-lease"].includes(mode))await expect(refreshVisitorAnalyticsDetails(altering,new Date(clock))).resolves.toMatchObject({ok:true});
    else {await expect(refreshVisitorAnalyticsDetails(altering,new Date(clock))).rejects.toThrow("configuration or private sync lease");expect(state.store.get(privatePath)).toEqual(previous);}
  });
  it("does not treat lease-only changes as configuration, but rebuilds both areas after relevant settings change", async () => {
    await syncVisitorAnalytics(reader(),now);const cfg=state.store.get(configPath),hash=settingsHash(cfg);cfg.privateSync.until=0;cfg.syncLease.until=0;
    expect(settingsHash(cfg)).toBe(hash);cfg.collectionTrackingStartedAt="2026-11-13T00:00:00Z";
    const result=await syncVisitorAnalytics(reader(),now);expect(result.public.skipped).toBe(false);expect(result.private.skipped).toBe(false);
  });
  it("keeps valid dates and metrics after oversized private work and permits a same-hour retry", async () => {
    await syncVisitorAnalytics(reader(),now);const previous=structuredClone(state.store.get(privatePath));clock+=3600000;
    const giant: VisitorReader=async()=>Array.from({length:1800},(_,i)=>({path:TOOL_CLICK_PREFIX+"https://x.example/"+i+"/"+"x".repeat(220),path_id:i+1,event:true,count:1}));
    await expect(syncVisitorAnalyticsDetails(giant,new Date(clock))).rejects.toThrow();
    expect(state.store.get(privatePath).updatedAtIso).toBe(previous.updatedAtIso);expect(state.store.get(privatePath).totals).toEqual(previous.totals);
    expect(await syncVisitorAnalyticsDetails(reader(),new Date(clock))).toMatchObject({skipped:false});
  });
  it("memoizes only identical requests, including sizes ID sets, and shares one request budget", async () => {
    vi.spyOn(globalThis,"setTimeout").mockImplementation(((cb:any)=>{queueMicrotask(cb);return 0;}) as any);
    const fetch=vi.spyOn(globalThis,"fetch").mockImplementation(async input=>new Response(JSON.stringify(String(input).includes("stats/sizes")?{stats:["phone","tablet","desktop","desktophd","unknown"].map(id=>({id,count:1})),more:false}:{hits:rows,more:false})));
    const read=createGoatCounterReader();expect((await syncVisitorAnalytics(read,now)).ok).toBe(true);
    expect(read.stats?.()).toMatchObject({requests:5,cacheHits:1});
    await read.sizes!("a","b",[3,7]);await read.sizes!("a","b",[7,3,3]);expect(read.stats?.().cacheHits).toBe(2);
    for(let i=fetch.mock.calls.length;i<240;i++)await read("start"+i,"end");
    await expect(read("extra","end")).rejects.toThrow("request budget");expect(fetch).toHaveBeenCalledTimes(240);
  });
  it("honors 429 backoff and a deadline shared with the other area without losing saved data", async () => {
    vi.spyOn(globalThis,"setTimeout").mockImplementation(((cb:any,ms:number)=>{clock+=ms;queueMicrotask(cb);return 0;}) as any);
    const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(new Response("",{status:429,headers:{"retry-after":"1"}})).mockImplementation(async()=>new Response(JSON.stringify({hits:rows,more:false})));
    const read=createGoatCounterReader();await read("a","b");expect(fetch).toHaveBeenCalledTimes(2);expect(clock-now.getTime()).toBeGreaterThanOrEqual(1000);
    clock=now.getTime()+180000;await expect(read("new","end")).rejects.toThrow("time budget");expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("fails long Retry-After instead of retrying early", async () => {
    const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response("",{status:429,headers:{"retry-after":"120"}}));
    await expect(createGoatCounterReader()("a","b")).rejects.toThrow("Retry-After");expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("hourly request planning and protected endpoint", () => {
  const immediate = () => vi.spyOn(globalThis,"setTimeout").mockImplementation(((cb:any)=>{queueMicrotask(cb);return 0;}) as any);
  const provider = (hits: Hit[]) => vi.spyOn(globalThis,"fetch").mockImplementation(async input => {
    const url=new URL(String(input));
    if(url.pathname.endsWith("stats/sizes"))return new Response(JSON.stringify({stats:["phone","tablet","desktop","desktophd","unknown"].map(id=>({id,count:1})),more:false}));
    const excluded=new Set((url.searchParams.get("exclude_paths")??"").split(",").map(Number));const remaining=hits.filter(hit=>!excluded.has(hit.path_id));
    return new Response(JSON.stringify({hits:remaining.slice(0,100),more:remaining.length>100}));
  });
  it("measures one complete 30-day-public hourly run with shared today and bounded size requests", async () => {
    immediate();state.store.get(configPath).startDate="2026-10-01";const fetch=provider(rows);const read=createGoatCounterReader();const start=performance.now();
    expect((await syncVisitorAnalytics(read,now)).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(35);expect(read.stats?.()).toMatchObject({requests:35,cacheHits:1});
    console.log("FULL_HOURLY_PLAN",JSON.stringify({http:35,hits:33,sizes:2,cacheHits:1,...ledger(),localCpuMs:performance.now()-start}));
  });
  it("bounds full top-25 pagination under the shared hourly budget while preserving the last private measurement", async () => {
    immediate();state.store.get(configPath).startDate="2026-10-01";
    const full=[...rows.filter(hit=>hit.event),...Array.from({length:25},(_,i)=>[
      "/a-page-"+i,"/player/"+i,"/guild/"+i,"/guidehub-v2/"+i]).flat().map((path,i)=>({path,count:1,event:false,path_id:100+i}))];
    const previous={schemaVersion:2,updatedAtIso:"2026-11-14T15:00:00Z",totals:{today:{visits:42}},lastRefresh:{state:"ok"}};state.store.set(privatePath,previous);
    const fetch=provider(full),read=createGoatCounterReader();const start=performance.now();const result=await syncVisitorAnalytics(read,now);
    expect(result.public.ok).toBe(true);expect(result.private.ok).toBe(false);expect(fetch).toHaveBeenCalledTimes(240);
    expect(state.store.get(privatePath).updatedAtIso).toBe(previous.updatedAtIso);expect(state.store.get(privatePath).totals).toEqual(previous.totals);
    console.log("PAGINATED_HOURLY_LIMIT",JSON.stringify({uncappedHits:66,uncappedSizes:200,uncappedTotal:266,http:240,lastPrivateDate:previous.updatedAtIso,...ledger(),localCpuMs:performance.now()-start}));
  });
  it("does not replace a newer public or private sample when an older hourly request arrives late", async () => {
    await syncVisitorAnalytics(reader(),now);const old=new Date(now.getTime()-3600000),before=structuredClone([...state.store]);
    const read=reader();expect((await syncVisitorAnalytics(read,old)).ok).toBe(true);expect(read).not.toHaveBeenCalled();expect([...state.store]).toEqual(before);
  });
  it("uses the existing protected endpoint for both publications and retries a failed private area", async () => {
    const app=express();app.post("/sync",syncVisitorAnalyticsSnapshotHandler);
    expect((await request(app).post("/sync")).status).toBe(401);
    const fetch=provider(rows);
    const response=await request(app).post("/sync").set("x-internal-token","private-internal");
    expect(response.status).toBe(200);expect(response.body.public.ok).toBe(true);expect(response.body.private.ok).toBe(true);
    const n=fetch.mock.calls.length;const repeated=await request(app).post("/sync").set("x-internal-token","private-internal");
    expect(repeated.status).toBe(200);expect(repeated.body.public.skipped).toBe(true);expect(repeated.body.private.skipped).toBe(true);expect(fetch).toHaveBeenCalledTimes(n);
  });
});


// Original W305/W301 inputs retained byte for byte; external provenance proof
// compares the full arrays to the unchanged historical sources.
describe("W308 batched automatic continuation", () => {
  const fullW305 = () => [...rows.filter(hit=>hit.event),...Array.from({length:25},(_,i)=>[
    "/a-page-"+i,"/player/"+i,"/guild/"+i,"/guidehub-v2/"+i]).flat().map((path,i)=>({path,count:1,event:false,path_id:100+i}))];
  const fullW301 = (): Hit[] => {
    const row = (path: string, count: number, event = true): Hit => ({ path, count, event, path_id: 1 });
    const pageRows = [row("/", 30, false), row("/data-hub?source=a", 12, false), row("/data-hub?source=b", 8, false),
      row("/player/one", 9, false), row("/player/two", 7, false), row("/guild/one", 6, false), row("/guild/two", 4, false),
      row("/guidehub-v2?tab=general&sub=quests", 3, false), row("/guidehub-v2?sub=quests&tab=general&other=x", 2, false),
      ...Array.from({ length: 30 }, (_, i) => row("/other-" + i, 1, false))];
    const eventRows = [row(WEBSITE_VISIT_PATH, 91), row(PAGE_VIEW_PREFIX + "/", 80), row(COLLECTION_DISPLAY, 12), row(TOOL_CLICK_PREFIX + "https://future.example/new", 4), row("datahub/analytics/overview", 6)];
    const original = [...pageRows, ...eventRows].map((x, i) => ({ ...x, path_id: i + 1 }));
    const events=Array.from({length:720},(_,i)=>({...row("help/qa/question-open/q-"+i+"-"+"x".repeat(40),1),path_id:1000+i}));
    const ranked=[...Array.from({length:25},(_,i)=>row("/popular-"+i,1000,false)),...Array.from({length:25},(_,i)=>row("/player/full-"+i,500,false)),...Array.from({length:25},(_,i)=>row("/guild/full-"+i,400,false)),...Array.from({length:25},(_,i)=>row("/guidehub-v2/full-"+i,300,false))].map((hit,i)=>({...hit,path_id:2000+i}));
    const tools=Array.from({length:50},(_,i)=>({...row(TOOL_CLICK_PREFIX+"https://stress.example/"+i+"/"+"x".repeat(300),1),path_id:3000+i,title:"Tool "+"N".repeat(115)}));
    return [...ranked,...original,...events,...tools];
  };
  const app = () => {
    const server = express(); server.use(cookieParser());
    server.post("/internal/analytics/visitor/sync-snapshot", syncVisitorAnalyticsSnapshotHandler);
    server.use("/api/admin/stats/visitor", visitorRoutes); return server;
  };
  const previous = {schemaVersion:2,updatedAtIso:"2026-11-14T15:00:00Z",totals:{today:{visits:42}},lastRefresh:{state:"ok"}};
  const workPath = "analytics/visitor_work";
  const setup = (hits: Hit[], extraLatency = 0) => {
    state.store.get(configPath).startDate="2026-10-01";state.store.set(privatePath,structuredClone(previous));
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(now);
    vi.spyOn(Date,"now").mockImplementation(()=>clock);
    vi.spyOn(globalThis,"setTimeout").mockImplementation(((cb:any,ms:number)=>{clock+=ms;queueMicrotask(cb);return 0;}) as any);
    const successes: string[] = []; let faultAt = -1;
    const fetch = vi.spyOn(globalThis,"fetch").mockImplementation(async input=>{
      clock+=extraLatency; const url=new URL(String(input));
      if (fetch.mock.calls.length === faultAt) return new Response("provider failure",{status:503});
      successes.push(url.href);
      if(url.pathname.endsWith("stats/sizes"))return new Response(JSON.stringify({stats:["phone","tablet","desktop","desktophd","unknown"].map((id,i)=>({id,count:(i+1)*url.searchParams.get("include_paths")!.split(",").length})),more:false}));
      const excluded=new Set((url.searchParams.get("exclude_paths")??"").split(",").map(Number));const remaining=hits.filter(hit=>!excluded.has(hit.path_id));
      return new Response(JSON.stringify({hits:remaining.slice(0,100),more:remaining.length>100}));
    });
    return {fetch,successes, failAt:(n:number)=>{faultAt=n;}};
  };
  const invoke = async (server: ReturnType<typeof app>, fetch: ReturnType<typeof vi.spyOn>) => {
    vi.setSystemTime(clock);resetLedger();const n=fetch.mock.calls.length,start=performance.now(),modelStart=clock;
    const response=await request(server).post("/internal/analytics/visitor/sync-snapshot").set("x-internal-token","private-internal");
    const urls=fetch.mock.calls.slice(n).map(([input]:any)=>new URL(String(input)));
    return {response,urls,stats:{status:response.status,...response.body.requests,...ledger(),hits:urls.filter(u=>u.pathname.endsWith("stats/hits")).length,sizes:urls.filter(u=>u.pathname.endsWith("stats/sizes")).length,modelMs:clock-modelStart,localMs:performance.now()-start,
      workDocuments:[...state.store].filter(([p])=>p===workPath||p.startsWith(workPath+"/")).map(([p,v])=>({path:p,bytes:documentBytes(p,v)})),maxWrittenBytes:Math.max(0,...state.writtenSizes),retried:state.retried,
      accesses:[...new Set([...state.reads,...state.writes])].map(p=>({path:p,reads:state.reads.filter(x=>x===p).length,writes:state.writes.filter(x=>x===p).length}))}};
  };
  const save = (name:string,value:unknown) => {if(process.env.W308_OUTPUT)fs.writeFileSync(path.join(process.env.W308_OUTPUT,name+".json"),JSON.stringify(value,null,2));};
  // Same finite, status-driven policy recommended for the existing Cloud job:
  // three retries, constant 60s backoff, no acknowledged pending response.
  const scheduled = async (server:ReturnType<typeof app>, fetch:ReturnType<typeof vi.spyOn>) => {
    const runs=[];for(let attempt=0;attempt<4;attempt++){
      runs.push(await invoke(server,fetch));if(runs.at(-1)!.response.status===200)break;
      if(attempt<3)clock+=60000;
    }return runs;
  };
  it.each(["W305","W301","W301-slow"])("fully completes unchanged %s with durable status-driven stages", async name=>{
    const hits=name==="W305"?fullW305():fullW301(),control=setup(hits,name==="W301-slow"?800:0),server=app();
    const runs=await scheduled(server,control.fetch);expect(runs.at(-1)!.response.status).toBe(200);
    expect(runs).toHaveLength(name==="W305"?2:3);
    for(const run of runs.slice(0,-1)){expect(run.response.status).toBe(503);expect(run.response.body.pending).toBe(true);}
    expect(runs.reduce((n,r)=>n+r.stats.reads,0)).toBeLessThanOrEqual(30);expect(runs.reduce((n,r)=>n+r.stats.writes,0)).toBeLessThanOrEqual(30);
    for(const run of runs){expect(run.stats.workDocuments.every(d=>d.path===workPath)).toBe(true);expect(run.stats.requests).toBeLessThanOrEqual(240);expect(run.stats.elapsedMs).toBeLessThan(180000);expect(run.stats.modelMs).toBeLessThan(240000);}
    expect(new Set(control.successes).size).toBe(control.successes.length);
    expect(control.successes).toHaveLength(name==="W305"?266:532);
    const stored=state.store.get(privatePath),publicStored=state.store.get(publicPath);
    expect(stored.updatedAtIso).toBe(now.toISOString());expect(publicStored.asOf).toBe(now.toISOString());
    for(const key of ["today","last7d","last30d"]){expect(stored.ranges[key].endDateTime).toBe(stored.updatedAtIso);expect(stored.totals[key].visits).toBe(hits.filter(hit=>!hit.event).reduce((n,hit)=>n+hit.count,0));}
    for(const key of ["last7d","last30d"]){for(const list of [stored.topPages,stored.topPlayers,stored.topGuilds,stored.topGuides])expect(list[key]).toHaveLength(25);expect(Object.keys(stored.screenSizes[key].byPath)).toHaveLength(100);expect(stored.screenSizes[key].overall.state).toBe("observed");expect(stored.screenSizes[key].overall.counts.small).toBe(hits.filter(hit=>!hit.event).length);}
    if(name!=="W305"){expect(hits).toHaveLength(914);expect(stored.eventUsage.last30d.events).toHaveLength(721);expect(stored.toolClicks.last30d.targets).toHaveLength(51);expect(stored.toolClicks.last30d.targets.some((t:any)=>t.toolName==="Tool "+"N".repeat(115))).toBe(true);}
    else expect(stored.toolClicks.last30d.targets[0].toolName).toBe("Dynamic Hourly Tool");
    expect(documentBytes(privatePath,{...stored,updatedAt:0})).toBeLessThanOrEqual(819200);expect(documentBytes(publicPath,publicStored)).toBeLessThanOrEqual(524288);
    expect(state.store.get(workPath).phase).toBe("complete");
    const repeated=await invoke(server,control.fetch);expect(repeated.response.status).toBe(200);expect(repeated.stats.requests??0).toBe(0);expect(repeated.stats.writes).toBe(0);expect(state.store.get(privatePath)).toEqual(stored);
    clearVisitorReadCache();resetLedger();const n=control.fetch.mock.calls.length;const saved=await request(server).get("/api/admin/stats/visitor/snapshot").set("Cookie",`sfdatahub_session=${createSessionToken({userId:"don-continuation",roles:["user","don"]})}`);
    expect(saved.status).toBe(200);expect(saved.body.details.data).toEqual(stored);expect(control.fetch.mock.calls.length).toBe(n);const get=ledger();expect(get.reads).toBe(2);expect(get.writes).toBe(0);expect(state.reads.some(p=>p.startsWith(workPath))).toBe(false);
    expect((await request(server).post("/api/admin/stats/visitor/refresh").set("Cookie",`sfdatahub_session=${createSessionToken({userId:"don-continuation",roles:["user","don"]})}`)).status).toBe(403);
    expect((await request(server).put("/api/admin/stats/visitor/config").set("Cookie",`sfdatahub_session=${createSessionToken({userId:"don-continuation",roles:["user","don"]})}`).send({startDate:"2026-11-01",sessionsVerified:true})).status).toBe(403);
    save(name+"-completion",{input:hits,inputRows:hits.length,normalRows:hits.filter(hit=>!hit.event).length,runs:runs.map(run=>run.stats),repeated:repeated.stats,get,privateBytes:documentBytes(privatePath,{...stored,updatedAt:0}),publicBytes:documentBytes(publicPath,publicStored),requests:control.successes.length,repeatedSuccessfulRequests:0,persistedReuses:runs.reduce((n,r)=>n+(r.stats.persistedQueries??0),0),retry:{count:3,backoffMs:60000},completeModelMs:runs.reduce((n,r)=>n+r.stats.modelMs,0)+(runs.length-1)*60000});
    save(name+"-snapshot",saved.body);console.log("W308_COMPLETE",JSON.stringify({name,runs:runs.map(run=>run.stats),get}));
  });
  it("does not access progress storage per query and publishes phase progress atomically",async()=>{
    const control=setup(fullW305()),server=app(),gate=hold(),original=control.fetch.getMockImplementation()!;let blocked=false;
    control.fetch.mockImplementation(async(...args:any[])=>{if(control.fetch.mock.calls.length===50){blocked=true;await gate.wait;}return original(...args);});
    const pending=invoke(server,control.fetch);for(let i=0;i<1000&&!blocked;i++)await new Promise(resolve=>setImmediate(resolve));expect(blocked).toBe(true);
    expect(state.reads).toHaveLength(4);expect(state.writes).toHaveLength(3);expect(state.store.get(workPath).pages).toBe(0);
    gate.release();expect((await pending).response.status).toBe(503);expect(state.store.get(workPath).phase).toBe("private");expect(state.store.get(workPath).inlineEntries).toBeTruthy();expect(state.store.get(workPath).bundles).toEqual([]);
    clock+=60000;expect((await invoke(server,control.fetch)).response.status).toBe(200);save("memory-only",{first50Requests:{reads:4,writes:3,persistedPages:0},phaseAndPublicAtomic:true,noExternalBundles:true});
  });
  it("measures small first/repeated hours, unchanged data, reader GETs and transaction retries",async()=>{
    const control=setup(rows),server=app();state.store.get(configPath).startDate="2026-11-14";
    const first=await invoke(server,control.fetch);expect(first.response.status).toBe(200);expect(first.stats.requests).toBe(5);expect(first.stats.workDocuments).toHaveLength(1);
    const duplicate=await invoke(server,control.fetch);expect(duplicate.stats.writes).toBe(0);expect(duplicate.stats.reads).toBe(2);
    clock+=3600000;const next=await invoke(server,control.fetch);expect(next.response.status).toBe(200);expect(next.stats.requests).toBe(5);
    clock+=3600000;state.retryPublication=true;const retry=await invoke(server,control.fetch);expect(retry.response.status).toBe(200);expect(retry.stats.requests).toBe(5);expect(retry.stats.retried).toBe(1);expect(retry.stats.reads).toBe(next.stats.reads+1);expect(retry.stats.writes).toBe(next.stats.writes);
    clearVisitorReadCache();resetLedger();await readVisitorSnapshot(new Date(clock));const cold=ledger();resetLedger();await readVisitorSnapshot(new Date(clock));const warm=ledger();expect(cold.reads).toBe(2);expect(warm.reads).toBe(0);
    resetLedger();await db.collection("visitor_metrics_public").doc("bundled").get();const publicCold=ledger();expect(publicCold.reads).toBe(1);
    save("small-and-repeated",{first:first.stats,duplicate:duplicate.stats,next:next.stats,retry:retry.stats,coldPrivateGet:cold,warmPrivateGet:warm,publicCold,publicReader:"existing inline public document contract"});
  });
  it("uses common bundles only for overflow and skips unchanged leaves",async()=>{
    const control=setup(fullW305()),server=app();expect((await invoke(server,control.fetch)).response.status).toBe(503);
    const base=state.store.get(workPath),entries={...base.inlineEntries};
    const savedInline=prepareVisitorWorkStorage(base,entries,base),probe=digest("unsaved-next-stage");entries[probe]="unsaved";
    expect(savedInline.root.inlineEntries?.[probe]).toBeUndefined();delete entries[probe];
    for(let i=0;i<6;i++)entries[digest("extra"+i)]=randomBytes(125000).toString("base64");
    const prepared=prepareVisitorWorkStorage(base,entries,base);expect(prepared.root.inlineEntries).toBeUndefined();expect(prepared.root.bundles.length).toBeGreaterThan(1);
    for(const write of prepared.writes){expect(documentBytes(write.ref.path,write.value)).toBeLessThanOrEqual(524288);state.store.set(write.ref.path,structuredClone(write.value));}
    const unchanged=prepareVisitorWorkStorage(prepared.root,entries,prepared.root);expect(unchanged.writes).toHaveLength(0);
    const changedEntries={...entries,[Object.keys(entries)[0]]:entries[Object.keys(entries)[0]]+"x"};
    const changed=prepareVisitorWorkStorage(prepared.root,changedEntries,prepared.root);expect(changed.writes.filter(w=>w.ref.path!==workPath).length).toBeLessThan(prepared.root.bundles.length);
    // Keep valid query payloads for the real reader; unused padding entries are
    // exact opaque strings and never read as queried responses.
    const publishedPaths=prepared.writes.map(w=>w.ref.path);clock+=60000;control.failAt(control.fetch.mock.calls.length+1);
    const failed=await invoke(server,control.fetch);expect(failed.response.status).toBe(500);expect(failed.stats.accesses.filter(a=>a.path.startsWith(workPath+"/")).every(a=>a.writes===0)).toBe(true);
    clock+=60000;expect((await invoke(server,control.fetch)).response.status).toBe(200);expect(state.store.get(privatePath).totals.today.visits).toBe(100);
    expect(state.store.get(workPath).inlineEntries).toEqual({});expect(control.successes).toHaveLength(266);
    save("external-work",{prepared:prepared.writes.map(w=>({path:w.ref.path,bytes:documentBytes(w.ref.path,w.value)})),unchangedWrites:0,changedWrites:changed.writes.map(w=>w.ref.path),failure:failed.stats,retiredDocumentsPreserved:publishedPaths.every(p=>state.store.has(p))});
  });
  it("commits actual oversized work through common bundles and preserves them on completion",async()=>{
    const extra=Array.from({length:4},(_,i)=>({path:"unknown/"+randomBytes(6000).toString("base64"),path_id:500+i,count:1,event:true}));
    const control=setup([...rows,...extra]),server=app();const run=await invoke(server,control.fetch);expect(run.response.status).toBe(200);expect(run.stats.requests).toBe(35);
    const external=run.stats.accesses.filter(a=>a.path.startsWith(workPath+"/"));expect(external.length).toBeGreaterThan(1);expect(external.every(a=>a.writes===1)).toBe(true);
    expect(run.stats.workDocuments.filter(d=>d.path!==workPath).every(d=>d.bytes<=524288)).toBe(true);
    expect(state.store.get(privatePath).totals.today.visits).toBe(8);expect(state.store.get(workPath).inlineEntries).toEqual({});
    save("actual-overflow",{run:run.stats,externalWorkWrites:external.reduce((n,a)=>n+a.writes,0),emptyBundleRewrites:0,syntheticExtraEvents:4,sourceRequests:35});
  });
  it.skipIf(!process.env.W308_LEGACY_INPUT)("resumes an actual W307 checkpoint without rewriting its legacy slots",async()=>{
    const control=setup(fullW301(),800),server=app(),legacy=JSON.parse(fs.readFileSync(process.env.W308_LEGACY_INPUT!,"utf8"));
    state.store.clear();for(const[p,v]of legacy.documents)state.store.set(p,v);clock=legacy.clock+60000;
    const id=state.store.get(workPath).id,slotBefore=structuredClone(state.store.get(workPath+"/bundles/w_0"));
    const runs=await scheduled(server,control.fetch);expect(runs.at(-1)!.response.status).toBe(200);expect(state.store.get(workPath).id).toBe(id);expect(state.store.get(workPath).version).toBe(2);expect(state.store.get(workPath+"/bundles/w_0")).toEqual(slotBefore);
    expect(runs.flatMap(r=>r.stats.accesses).filter(a=>a.path.endsWith("/w_0")).reduce((n,a)=>n+a.writes,0)).toBe(0);
    const all=[...legacy.successfulUrls,...control.successes];expect(all).toHaveLength(532);expect(new Set(all).size).toBe(532);save("W307-compatibility",{id,runs:runs.map(r=>r.stats),totalRequests:532,legacySlotUnchanged:true});
  });
  it("resumes sizes offsets and seen IDs without repeating successful pages",async()=>{
    const control=setup(fullW305()),server=app(),original=control.fetch.getMockImplementation()!;
    control.fetch.mockImplementation(async(input:any)=>{
      const url=new URL(String(input));if(!url.pathname.endsWith("stats/sizes"))return original(input);
      control.successes.push(url.href);const offset=Number(url.searchParams.get("offset"));
      const stats=["phone","tablet","desktop","desktophd","unknown"].map(id=>({id,count:1}));
      return new Response(JSON.stringify({stats:stats.slice(offset,offset+2),more:offset+2<stats.length}));
    });
    const runs=await scheduled(server,control.fetch);expect(runs.at(-1)!.response.status).toBe(200);expect(runs).toHaveLength(3);
    expect(new Set(control.successes).size).toBe(666);expect(control.successes).toHaveLength(666);
    const sizes=state.store.get(privatePath).screenSizes.last30d;expect(sizes.overall.counts).toEqual({small:100,medium:100,large:200,unknown:100});
    expect(runs[1].stats.reusedPages).toBeGreaterThan(0);save("sizes-pagination",{runs:runs.map(r=>r.stats),requests:666,repeatedSuccessfulRequests:0});
  });
  it("checks the full work wrapper and rejects an oversized query without publishing or growing slots",async()=>{
    const control=setup([{path:randomBytes(420000).toString("base64"),path_id:1,count:1,event:true}]),server=app();
    const run=await invoke(server,control.fetch);expect(run.response.status).toBe(500);expect(state.store.get(privatePath)).toEqual(previous);
    expect(state.store.get(publicPath)?.complete).not.toBe(true);expect(state.store.get(publicPath)?.website).toBeUndefined();expect(state.store.get(workPath).pages).toBe(0);
    expect([...state.store.keys()].filter(p=>p.startsWith(workPath+"/"))).toHaveLength(0);save("work-size-limit",{run:run.stats,slotsWritten:0,previousRetained:true,limit:524288});
  });
  it("fails closed on corrupted inline integrity and preserves its cursor",async()=>{
    const control=setup(fullW301()),server=app();expect((await invoke(server,control.fetch)).response.status).toBe(503);
    const before=structuredClone(state.store.get(workPath));state.store.get(workPath).entriesHash="invalid";clock+=60000;
    const run=await invoke(server,control.fetch);expect(run.response.status).toBe(500);expect(run.urls).toHaveLength(0);expect(state.store.get(workPath).pages).toBe(before.pages);expect(state.store.get(workPath).inlineEntries).toEqual(before.inlineEntries);expect(state.store.get(privatePath)).toEqual(previous);
    save("missing-bundle",{run:run.stats,refusedPublication:true,cursorRetained:true});
  });
  it.skipIf(!process.env.W308_PROCESS_STAGE)("runs a continuation stage in an actual fresh Node process",async()=>{
    const name=process.env.W308_PROCESS_CASE!,stage=Number(process.env.W308_PROCESS_STAGE),control=setup(name==="W305"?fullW305():fullW301(),name==="W301-slow"?800:0),server=app();
    let previousUrls:string[]=[];
    if(stage>1){const persisted=JSON.parse(fs.readFileSync(process.env.W308_PROCESS_INPUT!,"utf8"));state.store.clear();for(const[p,v]of persisted.documents)state.store.set(p,v);clock=persisted.clock+60000;previousUrls=persisted.successfulUrls;}
    const expected=name==="W305"?[232,34]:name==="W301"?[232,232,68]:[188,188,156];
    const run=await invoke(server,control.fetch);expect(run.response.status).toBe(stage<expected.length?503:200);
    expect(run.stats.requests).toBe(expected[stage-1]);const successfulUrls=[...previousUrls,...control.successes];expect(new Set(successfulUrls).size).toBe(successfulUrls.length);
    if(stage===expected.length){expect(successfulUrls).toHaveLength(name==="W305"?266:532);expect(state.store.get(workPath).phase).toBe("complete");expect(state.store.get(privatePath).updatedAtIso).toBe(now.toISOString());clearVisitorReadCache();
      const saved=await request(server).get("/api/admin/stats/visitor/snapshot").set("Cookie",`sfdatahub_session=${createSessionToken({userId:"don-process-restart",roles:["user","don"]})}`);expect(saved.status).toBe(200);expect(saved.body.details.data).toEqual(state.store.get(privatePath));}
    fs.writeFileSync(process.env.W308_PROCESS_OUTPUT!,JSON.stringify({pid:process.pid,stage,clock,documents:[...state.store],successfulUrls,stats:run.stats},null,2));
  });
  it("retains and resumes checkpointed private work after a provider error and an empty-process restart",async()=>{
    const control=setup(fullW305()),server=app();const first=await invoke(server,control.fetch);expect(first.response.status).toBe(503);
    const id=state.store.get(workPath).id;clock+=60000;control.failAt(control.fetch.mock.calls.length+10);
    const second=await invoke(server,control.fetch);expect(second.response.status).toBe(500);expect(state.store.get(privatePath).updatedAtIso).toBe(previous.updatedAtIso);
    const checkpoint=structuredClone(state.store.get(workPath));expect(checkpoint.pages).toBeGreaterThan(232);
    // Serialize all Firestore data, discard module caches and reload handlers.
    const persisted=JSON.stringify([...state.store]);state.store.clear();for(const[p,v]of JSON.parse(persisted))state.store.set(p,v);
    vi.resetModules();const fresh=await import("./syncSnapshot.handler");const restarted=express();restarted.use(cookieParser());restarted.post("/internal/analytics/visitor/sync-snapshot",fresh.syncVisitorAnalyticsSnapshotHandler);restarted.use("/api/admin/stats/visitor",visitorRoutes);
    clock+=60000;const third=await invoke(restarted,control.fetch);expect(third.response.status).toBe(200);expect(state.store.get(workPath).id).toBe(id);expect(state.store.get(privatePath).lastRefresh.state).toBe("ok");
    expect(new Set(control.successes).size).toBe(control.successes.length);expect(control.successes).toHaveLength(266);
    save("provider-restart",{runs:[first.stats,second.stats,third.stats],persistedCheckpoint:checkpoint,repeatedSuccessfulRequests:0,failedRequests:1,emptyModuleCache:true});
  });
  it("atomically retains data and progress after interruption between staged slot and root writes",async()=>{
    const control=setup(fullW305()),server=app();const first=await invoke(server,control.fetch);expect(first.response.status).toBe(503);
    const before=structuredClone([...state.store].filter(([p])=>p===workPath||p.startsWith(workPath+"/")));
    state.failCheckpoint=true;clock+=60000;const failed=await invoke(server,control.fetch);expect(failed.response.status).toBe(500);
    expect([...state.store].filter(([p])=>p.startsWith(workPath+"/"))).toEqual(before.filter(([p])=>p.startsWith(workPath+"/")));
    expect(state.store.get(workPath).pages).toBe(before.find(([p])=>p===workPath)![1].pages);
    state.failCheckpoint=false;state.failCommit=false;state.retryPublication=false;state.retried=0;clock+=240001;const final=await invoke(server,control.fetch);expect(final.response.status).toBe(200);
    const repeats=control.successes.length-new Set(control.successes).size;expect(repeats).toBe(34);
    expect(state.store.get(privatePath).totals.today.visits).toBe(100);save("atomic-interruption",{runs:[first.stats,failed.stats,final.stats],repeatedUnsavedRequests:repeats,lastSavedTransition:before.find(([p])=>p===workPath)![1].pages,duplicatedAggregation:false});
  });
  it("continues a fixed sample across a new hour without discarding saved public pagination",async()=>{
    const control=setup(fullW301()),server=app();expect((await invoke(server,control.fetch)).response.status).toBe(503);
    const first=structuredClone(state.store.get(workPath));expect(first.phase).toBe("public");expect(first.cursor.page).toBe(2);
    clock+=3600000;const runs=await scheduled(server,control.fetch);expect(runs.at(-1)!.response.status).toBe(200);
    expect(state.store.get(workPath).id).toBe(first.id);expect(state.store.get(privatePath).updatedAtIso).toBe(first.asOf);expect(new Set(control.successes).size).toBe(532);
    save("new-hour",{original:first.asOf,finish:state.store.get(privatePath).updatedAtIso,runs:runs.map(r=>r.stats),sameEvaluation:true});
  });
  it("coordinates duplicate delivery, paused manual refresh and an already active admin writer",async()=>{
    const control=setup(fullW305()),server=app(),gate=hold();let blocked=false;
    const original=control.fetch.getMockImplementation()!;control.fetch.mockImplementation(async(...args:any[])=>{if(!blocked){blocked=true;await gate.wait;}return original(...args);});
    const pending=invoke(server,control.fetch);for(let i=0;i<1000&&!blocked;i++)await new Promise(resolve=>setImmediate(resolve));expect(blocked).toBe(true);
    const duplicate=await invoke(server,control.fetch);expect(duplicate.response.status).toBe(503);expect(duplicate.urls).toHaveLength(0);
    await expect(refreshVisitorAnalyticsDetails(reader(),new Date(clock))).rejects.toThrow("busy");gate.release();expect((await pending).response.status).toBe(503);
    await expect(refreshVisitorAnalyticsDetails(reader(),new Date(clock))).rejects.toThrow("busy");clock+=60000;expect((await invoke(server,control.fetch)).response.status).toBe(200);
    clock+=3600000;const manualGate=hold(),read=reader();const manual:VisitorReader=async(...args)=>{await manualGate.wait;return read(...args);};manual.sizes=read.sizes;
    const manualPending=refreshVisitorAnalyticsDetails(manual,new Date(clock));await begun();expect((await invoke(server,control.fetch)).response.status).toBe(503);manualGate.release();await manualPending;
    save("coordination",{duplicateRequests:0,activeAndPausedAdminBlocked:true,activeAdminBlocksHourly:true});
  });
  it.each(["settings","takeover"])("fences a delayed old owner after %s and keeps the successor lease",async mode=>{
    const control=setup(fullW305()),server=app();expect((await invoke(server,control.fetch)).response.status).toBe(503);clock+=60000;
    const gate=hold(),original=control.fetch.getMockImplementation()!;let blocked=false;
    control.fetch.mockImplementation(async(...args:any[])=>{if(!blocked){blocked=true;await gate.wait;}return original(...args);});
    const pending=invoke(server,control.fetch);for(let i=0;i<1000&&!blocked;i++)await new Promise(resolve=>setImmediate(resolve));expect(blocked).toBe(true);
    const previousWork=structuredClone(state.store.get(workPath));clock+=240001;
    if(mode==="settings"){state.store.get(configPath).revision="new-settings";state.store.get(configPath).collectionTrackingStartedAt="2026-11-13T00:00:00Z";}
    expect((await scheduled(server,control.fetch)).at(-1)!.response.status).toBe(200);
    const completed=structuredClone(state.store.get(privatePath)),newWork=structuredClone(state.store.get(workPath));
    state.store.get(configPath).visitorWork={...state.store.get(configPath).visitorWork,owner:"future-owner",until:clock+240000};
    const expected=structuredClone([...state.store]);gate.release();expect((await pending).response.status).toBe(500);expect([...state.store]).toEqual(expected);expect(state.store.get(privatePath)).toEqual(completed);
    expect(newWork.id===previousWork.id).toBe(mode==="takeover");save("fence-"+mode,{oldId:previousWork.id,newId:newWork.id,staleWrites:0,successorOwner:state.store.get(configPath).visitorWork.owner});
  });
  it("invalidates paused work after settings changes, but ignores coordination-only changes",async()=>{
    const control=setup(fullW301()),server=app();expect((await invoke(server,control.fetch)).response.status).toBe(503);
    const first=structuredClone(state.store.get(workPath));state.store.get(configPath).privateSync={owner:"",until:0};state.store.get(configPath).syncLease.until=0;
    clock+=60000;expect((await invoke(server,control.fetch)).response.status).toBe(503);expect(state.store.get(workPath).id).toBe(first.id);
    state.store.get(configPath).startDate="2026-11-14";state.store.get(configPath).revision="replacement";clock+=60000;
    expect((await invoke(server,control.fetch)).response.status).toBe(200);expect(state.store.get(workPath).id).not.toBe(first.id);expect(state.store.get(publicPath).startDate).toBe("2026-11-14");
    save("settings-reset",{oldId:first.id,newId:state.store.get(workPath).id,coordinationPreserved:true,incompatibleDataReused:false});
  });
});
