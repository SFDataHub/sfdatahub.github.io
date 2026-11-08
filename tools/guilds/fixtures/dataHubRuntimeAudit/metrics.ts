export {};
const proofGlobal:any=globalThis;
// Loaded before production modules. Native IDB requests, including index and
// cursor reads, are observed without changing their return values or scheduling.
proofGlobal.w14Metrics = { active: null, windows: [], hits: {}, workers: [] };
proofGlobal.w14Hit = (name:string) => {
  const m = proofGlobal.w14Metrics;
  if (m.active) m.active.calls[name] = (m.active.calls[name] ?? 0) + 1;
};
proofGlobal.w14Timing = (name:string, started:number) => {
  const window = proofGlobal.w14Metrics.active;
  if (window) (window.timings[name] ??= []).push(performance.now() - started);
};
for (const proto of [IDBObjectStore.prototype as any, IDBIndex.prototype as any]) {
  for (const method of ['get', 'getAll', 'getKey', 'getAllKeys', 'count', 'openCursor', 'openKeyCursor', 'put', 'add', 'delete', 'clear']) {
    const original = proto[method];
    if (!original) continue;
    proto[method] = function (this:any, ...args:any[]) {
      const window = proofGlobal.w14Metrics.active;
      const request = original.apply(this, args);
      if (!window) return request;
      const store = this.objectStore ?? this;
      const event:any = { db: store.transaction.db.name, store: store.name, index: this.objectStore ? this.name : null, method,
        key: typeof args[0] === 'string' ? args[0] : null, stack: new Error().stack, started: performance.now(), responses: 0, rows: 0, rawRows: 0 };
      window.idb.push(event);
      request.addEventListener('success', () => {
        event.responses++;
        event.finished = performance.now();
        const result = request.result;
        const rows = Array.isArray(result) ? result : result == null ? [] : [result];
        event.rows += rows.length;
        if (store.name === 'scans' && !['getKey', 'getAllKeys', 'count', 'openKeyCursor'].includes(method))
          event.rawRows += rows.filter((row:any) => row && (row.rawData || row.value?.rawData)).length;
      });
      request.addEventListener('error', () => { event.error = String(request.error); });
      return request;
    };
  }
}
const NativeWorker = Worker;
globalThis.Worker = class extends NativeWorker {
  constructor(url:string|URL, options?:WorkerOptions) {
    super(url, options);
    const worker = { url: String(url), started: performance.now(), messages: 0, replies: 0, terminated: false };
    proofGlobal.w14Metrics.workers.push(worker);
    this.addEventListener('message', () => worker.replies++);
    const send:any = this.postMessage.bind(this), stop = this.terminate.bind(this);
    this.postMessage = (...args:any[]) => { worker.messages++; return send(...args); };
    this.terminate = () => { worker.terminated = true; return stop(); };
  }
};
proofGlobal.w14Begin = (name:string) => {
  if (proofGlobal.w14Metrics.active) throw Error('overlapping measurement');
  const window:any = { name, started: performance.now(), calls: {}, timings: {}, idb: [], longtasks: [], frames: [], eventloop: [], readiness: {}, workersAtStart: proofGlobal.w14Metrics.workers.length };
  proofGlobal.w14Metrics.active = window;
  window.observer = PerformanceObserver.supportedEntryTypes.includes('longtask') ? new PerformanceObserver(list => {
    window.longtasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration, name: e.name })));
  }) : null;
  window.observer?.observe({ type: 'longtask' });
  let lastFrame = performance.now(), lastTick = performance.now();
  const frame = (now:number) => { window.frames.push(now - lastFrame); lastFrame = now; window.raf = requestAnimationFrame(frame); };
  window.raf = requestAnimationFrame(frame);
  window.interval = setInterval(() => { const now = performance.now(); window.eventloop.push(now - lastTick - 16); lastTick = now; }, 16);
  return window;
};
proofGlobal.w14End = () => {
  const window = proofGlobal.w14Metrics.active;
  window.finished = performance.now();
  window.observer?.disconnect(); cancelAnimationFrame(window.raf); clearInterval(window.interval);
  delete window.observer; delete window.raf; delete window.interval;
  window.elapsedMs = window.finished - window.started;
  window.summary = { rawRequests: window.idb.filter((e:any) => e.store === 'scans' && ['get', 'getAll', 'openCursor'].includes(e.method)).length,
    rawPayloadRows: window.idb.reduce((n:number, e:any) => n + e.rawRows, 0), keyReads: window.idb.filter((e:any) => ['getKey', 'getAllKeys', 'openKeyCursor', 'count'].includes(e.method)).length,
    metadataReads: window.idb.filter((e:any) => e.store !== 'scans' && ['get', 'getAll', 'openCursor'].includes(e.method)).length,
    writes: window.idb.filter((e:any) => ['put', 'add', 'delete', 'clear'].includes(e.method)).length,
    longtaskCount: window.longtasks.length, maxLongtaskMs: Math.max(0, ...window.longtasks.map((e:any) => e.duration)),
    maxFrameGapMs: Math.max(0, ...window.frames), maxEventloopDelayMs: Math.max(0, ...window.eventloop) };
  const groups = new Map();
  for (const event of window.idb) {
    const caller = event.stack?.split('\n').filter((line:string) => line.includes('/src/') && !line.includes('/deps/')).slice(0, 4).map((line:string) => line.trim().replace(/http:\/\/127\.0\.0\.1:\d+/g, '').replace(/\?t=\d+/g, '')).join(' <- ') ?? 'not attributed';
    const key = JSON.stringify([event.db, event.store, event.index, event.method, caller]);
    const group = groups.get(key) ?? { db:event.db, store:event.store, index:event.index, method:event.method, caller, requests:0, rows:0, rawRows:0, requestElapsedSumMs:0, errors:0 };
    group.requests++; group.rows+=event.rows; group.rawRows+=event.rawRows; group.requestElapsedSumMs+=(event.finished??event.started)-event.started; group.errors+=event.error?1:0;
    groups.set(key,group);
  }
  window.idbGroups=[...groups.values()];delete window.idb;
  proofGlobal.w14Metrics.windows.push(window); proofGlobal.w14Metrics.active = null;
  return window;
};
