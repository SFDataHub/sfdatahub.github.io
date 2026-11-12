import { getDB } from "../db";

// Only public snapshots/derived read coordination belong in this namespace.
// Reuse the existing metadata store; never inspect or clear other app records.
const prefix = "sfdatahub:public-read:v1:";
export const PUBLIC_HOUR = 3600000;
export const PUBLIC_DELAY = 120000;
export const PUBLIC_RETRY = 180000;
export type PublicCheck = { hour: number; attempts: number; retryAt: number };
export type PublicEntry<T> = { schema: 1; writtenAt: number; expiresAt: number; value: T };
type Guard = (value: unknown) => boolean | Promise<boolean>;
const memory = new Map<string, PublicEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
const revisions = new Map<string, number>();
const locked = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
let channel: BroadcastChannel | undefined;

function connect() {
  if (channel || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    channel = new BroadcastChannel(prefix);
    channel.onmessage = event => {
      if (typeof event.data !== "string" || !event.data.startsWith(prefix)) return;
      memory.delete(event.data);
      revisions.set(event.data, (revisions.get(event.data) ?? 0) + 1);
      for (const notify of listeners.get(event.data) ?? []) notify();
    };
  } catch { /* Storage/coordination denial must not block public readers. */ }
}
async function storage<T>(operation: () => Promise<T>): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  let timer: number | undefined;
  try {
    return await Promise.race([operation(), new Promise<undefined>(resolve => { timer = setTimeout(resolve, 750); })]);
  } catch { return undefined; }
  finally { clearTimeout(timer); }
}
export function validPublicCheck(value: unknown): value is PublicCheck {
  const check = value as PublicCheck;
  return !!check && Number.isSafeInteger(check.hour) && Number.isSafeInteger(check.attempts) && check.attempts >= 0 &&
    Number.isFinite(check.retryAt);
}
export function publicationCheck(publishedAt: string | undefined, previous?: PublicCheck, now = Date.now()) {
  const hour = Math.floor(now / PUBLIC_HOUR), due = hour * PUBLIC_HOUR + PUBLIC_DELAY;
  const attempts = now < due ? 0 : (previous?.hour === hour ? previous.attempts : 0) + 1;
  const check: PublicCheck = { hour, attempts, retryAt: now + PUBLIC_RETRY };
  const current = Math.floor(Date.parse(publishedAt ?? "") / PUBLIC_HOUR) >= hour;
  const expiresAt = current || attempts >= 2 ? due + PUBLIC_HOUR : now < due ? due : check.retryAt;
  return { check, expiresAt };
}
export async function readPublicCache<T>(key: string, guard: Guard, expired = false): Promise<PublicEntry<T> | undefined> {
  connect();
  const address = prefix + key;
  const local = memory.get(address);
  const disk = (!local || locked.has(address)) ? (await storage(async () => (await getDB()).get("metadata", address)))?.value : undefined;
  const entry = disk && (!local || disk.writtenAt > local.writtenAt) ? disk : local ?? disk;
  if (!entry) return undefined;
  let valid = false;
  try {
    valid = entry.schema === 1 && Number.isFinite(entry.writtenAt) && entry.writtenAt <= Date.now() + 300000 &&
      Number.isFinite(entry.expiresAt) && entry.expiresAt > entry.writtenAt && await guard(entry.value);
  } catch { /* Remove only this incompatible/corrupt public record. */ }
  if (!valid) {
    memory.delete(address);
    await storage(async () => (await getDB()).delete("metadata", address));
    return undefined;
  }
  memory.set(address, entry);
  return expired || Date.now() < entry.expiresAt ? entry as PublicEntry<T> : undefined;
}
export async function writePublicCache<T>(key: string, value: T, expiresAt: number) {
  connect();
  const address = prefix + key, writtenAt = Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= writtenAt) return;
  const entry: PublicEntry<T> = { schema: 1, writtenAt, expiresAt, value };
  revisions.set(address, (revisions.get(address) ?? 0) + 1);
  memory.set(address, entry);
  await storage(async () => (await getDB()).put("metadata", { key: address, value: entry, updatedAt: writtenAt }));
  try { channel?.postMessage(address); } catch { /* Same-tab memory remains usable. */ }
  for (const notify of listeners.get(address) ?? []) notify();
}
export function watchPublicCache(key: string, notify: () => void) {
  connect();
  const address = prefix + key, set = listeners.get(address) ?? new Set();
  listeners.set(address, set); set.add(notify);
  return () => { set.delete(notify); if (!set.size) listeners.delete(address); };
}
export function withPublicReadLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const address = prefix + key;
  if (pending.has(address)) return pending.get(address) as Promise<T>;
  const run = async () => { locked.add(address); try { return await operation(); } finally { locked.delete(address); } };
  const request = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      let entered = false;
      try {
        return await navigator.locks.request(address, { signal: AbortSignal.timeout(15000) }, async () => {
          entered = true; return run();
        });
      } catch (error) { if (entered) throw error; }
    }
    return run();
  })();
  pending.set(address, request);
  void request.finally(() => { if (pending.get(address) === request) pending.delete(address); }).catch(() => {});
  return request;
}
export function publicCacheRevision(key: string) { return revisions.get(prefix + key) ?? 0; }
export async function cachedPublicRead<T>(key: string, guard: Guard, load: () => Promise<T>, lifetime = 86400000): Promise<T> {
  return withPublicReadLock(key, async () => {
    const cached = await readPublicCache<T>(key, guard);
    if (cached) return cached.value;
    const value = await load();
    await writePublicCache(key, value, Date.now() + lifetime);
    return value;
  });
}
