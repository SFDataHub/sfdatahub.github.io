import { readPublicCache, withPublicReadLock, writePublicCache } from "../cache/publicReadCache";

// Bytes stay in the browser's CacheStorage, never in snapshots or app metadata.
const cacheName = "sfdatahub:youtube-avatars:v1";
const day = 86400000;
const images = new Map<string, { blob: Blob; expires: number }>();
type LastImage = { source: string };
type Cooldown = { retryAt: number };
const lastKey = (channel: string) => `youtube:avatar:last:${channel}`;
const failureKey = (source: string) => `youtube:avatar:failure:${source}`;
const validLast = (v: unknown) => typeof (v as LastImage)?.source === "string";
const validCooldown = (v: unknown) => Number.isFinite((v as Cooldown)?.retryAt);

async function usable(blob: Blob) {
  if (!blob.type.toLowerCase().startsWith("image/")) throw Error("Avatar is not an image");
  const bitmap = await createImageBitmap(blob);
  const valid = bitmap.width > 0 && bitmap.height > 0;
  bitmap.close();
  if (!valid) throw Error("Empty avatar");
  return blob;
}
async function stored(source: string) {
  if (images.has(source)) return images.get(source);
  try {
    const response = await (await caches.open(cacheName)).match(source);
    if (!response) return undefined;
    const item = { blob: await usable(await response.blob()), expires: Number(response.headers.get("X-Avatar-Expires")) || 0 };
    images.set(source, item);
    return item;
  } catch { return undefined; }
}
async function save(source: string, blob: Blob, expires: number) {
  images.set(source, { blob, expires });
  while (images.size > 32) images.delete(images.keys().next().value!);
  try {
    const cache = await caches.open(cacheName);
    await cache.put(source, new Response(blob, { headers: { "Content-Type": blob.type, "X-Avatar-Expires": String(expires) } }));
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - 32))) await cache.delete(key);
  } catch { /* HTTP cache and decoded in-memory images remain available. */ }
}
function retryAt(response?: Response) {
  const header = response?.headers.get("Retry-After");
  const seconds = header && /^\d+$/.test(header.trim()) ? Number(header) : NaN;
  const date = header ? Date.parse(header) : NaN;
  return Math.max(Date.now() + 60000, Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Number.isFinite(date) ? date : Date.now() + 3600000);
}
async function load(source: string) {
  return withPublicReadLock(`youtube:avatar:load:${source}`, async () => {
    const cached = await stored(source);
    if (cached && cached.expires > Date.now()) return cached.blob;
    const failed = await readPublicCache<Cooldown>(failureKey(source), validCooldown);
    if (failed && failed.value.retryAt > Date.now()) return cached?.blob;
    let response: Response | undefined;
    try {
      // CDN explicitly allows anonymous CORS and public max-age. Neither cookies
      // nor a page referrer are needed for these public, provider-issued URLs.
      response = await fetch(source, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", cache: "default" });
      if (!response.ok) throw Error("Avatar unavailable");
      const blob = await usable(await response.blob());
      const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get("Cache-Control") ?? "");
      const lifetime = maxAge ? Math.min(day, Number(maxAge[1]) * 1000) : day;
      // Respect no-store even in the explicitly bounded browser image cache.
      if (!/\bno-store\b/i.test(response.headers.get("Cache-Control") ?? "")) await save(source, blob, Date.now() + lifetime);
      return blob;
    } catch {
      const until = retryAt(response);
      await writePublicCache(failureKey(source), { retryAt: until }, until);
      return cached?.blob;
    }
  });
}

// A source change has its own failure key. There is intentionally no retry timer.
export async function loadChannelAvatar(channel: string, source: string, show: (blob: Blob) => void) {
  const previous = await readPublicCache<LastImage>(lastKey(channel), validLast, true);
  const old = previous ? await stored(previous.value.source) : undefined;
  if (old) show(old.blob);
  if (!source) return !!old;
  const blob = await load(source);
  if (!blob) return !!old;
  show(blob);
  await writePublicCache(lastKey(channel), { source }, Date.now() + 31 * day);
  return true;
}
