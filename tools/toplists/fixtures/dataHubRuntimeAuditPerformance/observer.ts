// Diagnosis only: events contain counts/identities, never serialized payloads.
const g = globalThis as any;
const isWindow = typeof document !== 'undefined';
const events: any[] = [];
const now = () => performance.timeOrigin + performance.now();
let seq = 0, pendingFlush = false;
const nativePost = !isWindow ? g.postMessage.bind(g) : undefined;
function emit(event: any) {
  events.push(event);
  if (!isWindow && !pendingFlush) {
    pendingFlush = true;
    queueMicrotask(() => { pendingFlush = false; if(events.length)nativePost({ __w29Diag: events.splice(0) }); });
  }
}
function meta(value: any): any {
  if (typeof value === 'string') return {argument:value.slice(0,140),argumentChars:value.length};
  if (!value || typeof value !== 'object') return {};
  const x = value.data ?? value;
  const out: any = {};
  for (const k of ['requestId', 'type', 'tab', 'datasetId', 'archiveScanId', 'localScanId', 'id', 'server', 'nameFilter', 'windowStart', 'totalRows', 'status', 'playerCount', 'groupCount']) if (typeof x[k] === 'string' || typeof x[k] === 'number') out[k] = x[k];
  for (const k of ['playerRows', 'guildRows', 'players', 'groups', 'sources', 'normalizedMembers', 'entries']) if (Array.isArray(x[k])) out[k] = x[k].length;
  if (Array.isArray(x)) out.items = x.length;
  if (x.entry) Object.assign(out, meta(x.entry));
  if (Array.isArray(x.sources)) out.sourceIdentities=x.sources.map((s:any)=>({id:s.archiveScanId,localScanId:s.localScanId,players:s.rawScan?.players?.length,groups:s.rawScan?.groups?.length}));
  if (typeof x.content === 'string') out.contentChars = x.content.length;
  return out;
}
const observer = {
  events, now, meta,
  start(name: string, async: boolean, value?: any) { if(!isWindow&&name.endsWith(':runRequest'))observer.note('worker-request-received',meta(value));return { id: ++seq, name, async, start: now(), realm: isWindow ? 'window' : location.pathname, ...meta(value) }; },
  end(span: any, extra?: any) { if (!span || span.ended) return; span.ended = true; emit({ ...span, end: now(), ...extra }); },
  ret(span: any, value: any) { if (value && typeof value.then === 'function') { if(span) span.promise=true; value.then((v: any) => observer.end(span, { result: meta(v) }), () => observer.end(span, { rejected: true })); } else observer.end(span, { result: meta(value) }); return value; },
  call(name: string, callback: () => any) { const s = observer.start(name, false); try { return observer.ret(s, callback()); } catch (error) { observer.end(s, { thrown: true }); throw error; } },
  note(name: string, value?: any) { emit({ name, start: now(), end: now(), realm: isWindow ? 'window' : location.pathname, ...value }); },
};
g.__w29 = observer;
if (g.navigator?.locks) {
  const locks = g.navigator.locks, request = locks.request.bind(locks);
  locks.request = (name: string, options: any, callback: any) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    const requested = now();
    return request(name, options, (lock: any) => {
      const granted = now(); const s = observer.start('lock-hold:' + name, true);
      observer.note('lock-wait:' + name, { requested, granted, waitMs: granted - requested });
      return observer.ret(s, callback(lock));
    });
  };
}
if (isWindow) {
  const nativeTimeout = window.setTimeout.bind(window);
  window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: any[]) => {
    if (typeof callback !== 'function' || !delay || delay < 100 || delay > 500) return nativeTimeout(callback, delay, ...args);
    const scheduled = now();
    return nativeTimeout((...values: any[]) => { observer.note('timer-fired', { delay, scheduled, actualWaitMs: now() - scheduled }); callback(...values); }, delay, ...args);
  }) as typeof window.setTimeout;
}
export default observer;

// Detail-profile-only native IDB observations; native results and transactions are preserved.
if(isWindow){
 for(const method of ['getAll','getAllKeys','get','put'] as const){
  const original=IDBObjectStore.prototype[method] as (...args:any[])=>IDBRequest;
  (IDBObjectStore.prototype as any)[method]=function(...args:any[]){
   if(!g.__w29Detail||!this.transaction.db.name.startsWith('sfdatahub-'))return original.apply(this,args);
   const start=now(),store=this.name;const request=original.apply(this,args);const sent=now();
   request.addEventListener('success',()=>{const received=now();const result=request.result;observer.note('IDB.'+method,{requested:start,store,key:typeof args[0] === 'string' ? args[0] : undefined,sendMs:sent-start,elapsedMs:received-start,resultReadMs:now()-received,resultCount:Array.isArray(result)?result.length:result==null?0:1});});return request;
  };
 }
}

if(!isWindow){
 g.postMessage=(message:any,...args:any[])=>{
  observer.note('worker-native-send',meta(message));
  if(events.length)nativePost({__w29Diag:events.splice(0)});
  return nativePost(message,...args);
 };
}
