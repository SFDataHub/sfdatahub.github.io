export type HubChannel =
  | { platform: "youtube"; channelId: string; handle?: string; name: string; url: string }
  | { platform: "twitch"; login: string; userId?: string; name: string; url: string };
export type HubCreator = { id: string; name: string; languages: string[]; avatarUrl?: string; channels: HubChannel[] };
export type CreatorCatalog = { schemaVersion: 1; creators: HubCreator[] };
export type CatalogResponse = CreatorCatalog & { stale: boolean };

const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
function https(v: unknown): v is string {
  if (!text(v)) return false;
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}
/** Rebuild the public allowlist: never forward additional stored/admin fields. */
export function parseCatalog(input: unknown): CreatorCatalog {
  const raw = input as CreatorCatalog;
  if (raw?.schemaVersion !== 1 || !Array.isArray(raw.creators)) throw Error("Invalid creator catalog");
  const ids = new Set<string>(), accounts = new Set<string>();
  const creators = raw.creators.map(c => {
    if (!c || !text(c.id) || !/^[a-zA-Z0-9_-]+$/.test(c.id) || ids.has(c.id) || !text(c.name) ||
      !Array.isArray(c.languages) || !c.languages.every(l => typeof l === "string" && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(l)) ||
      !Array.isArray(c.channels) || !c.channels.length || (c.avatarUrl !== undefined && !https(c.avatarUrl))) throw Error("Invalid creator");
    ids.add(c.id);
    const channels: HubChannel[] = c.channels.map(a => {
      if (!a || !text(a.name) || !https(a.url)) throw Error("Invalid account");
      let result: HubChannel, key: string;
      if (a.platform === "youtube" && /^UC[\w-]{22}$/.test(a.channelId) && a.url === `https://www.youtube.com/channel/${a.channelId}` &&
        (a.handle === undefined || /^@[\p{L}\p{N}_.-]+$/u.test(a.handle))) {
        key = `youtube:${a.channelId}`;
        result = { platform: "youtube", channelId: a.channelId, name: a.name, url: a.url, ...(a.handle ? { handle: a.handle } : {}) };
      } else if (a.platform === "twitch" && /^[a-z0-9_]+$/.test(a.login) && a.url === `https://www.twitch.tv/${a.login}` &&
        (a.userId === undefined || /^\d+$/.test(a.userId))) {
        key = `twitch:${a.login}`;
        result = { platform: "twitch", login: a.login, name: a.name, url: a.url, ...(a.userId ? { userId: a.userId } : {}) };
      } else throw Error("Invalid platform account");
      if (accounts.has(key)) throw Error("Duplicate platform account");
      accounts.add(key); return result;
    });
    return { id: c.id, name: c.name, languages: [...new Set(c.languages)], ...(c.avatarUrl ? { avatarUrl: c.avatarUrl } : {}), channels };
  });
  creators.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { schemaVersion: 1, creators };
}
export function isCatalogResponse(value: unknown): value is CatalogResponse {
  try { parseCatalog(value); return typeof (value as CatalogResponse).stale === "boolean"; } catch { return false; }
}
