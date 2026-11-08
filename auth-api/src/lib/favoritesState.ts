/** Portable wire contract, shared by the API and frontend. No local evidence. */
export type Ref = { identifier: string; serverNamespace: string; entityId: string };
export type Display = { name: string | null; server: string | null; observedAtMs: number | null;
  className?: string | null; level?: number | null; guildName?: string | null;
  coaString?: string | null; hofRank?: number | null; memberCount?: number | null;
  appearance?: { classId: number | null; coaString: string | null; portrait: null | ({ genderName: "male" | "female" } & Record<string, number | string>) } };
export type PortableFavorite = { key: string; kind: "player" | "guild"; reference: Ref | null; originalReferences: Ref[];
  display: Display; historicalAt: number | null };
export type FavoriteEntry = { key: string; revision: number; value: PortableFavorite | null };
export type FavoritesDocument = { schemaVersion: 1; revision: number; orderRevision: number; order: string[]; entries: FavoriteEntry[] };
export type FavoriteChange = { key: string; baseRevision: number; value: PortableFavorite | null; intent: "add" | "remove" | "display" };
export type FavoriteBatch = { changes: FavoriteChange[]; order?: string[]; baseOrderRevision: number };
export const emptyFavoritesDocument = (): FavoritesDocument => ({ schemaVersion: 1, revision: 0, orderRevision: 0, order: [], entries: [] });
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
function fail(message = "Invalid favorites format"): never { throw Object.assign(Error(message), { code: "FAVORITES_INVALID" }); }
function str(v: unknown, max = 256): string { if (typeof v !== "string" || !v || v.length > max) fail(); return v; }
function nullableText(v: unknown, max = 256): string | null { return v === null || v === undefined || typeof v === "string" && !v.trim() ? null : str(v, max); }
function number(v: unknown, nullable = true): number | null { if (nullable && (v === null || v === undefined)) return null; if (!Number.isSafeInteger(v) || Number(v) < 0) fail(); return Number(v); }
const parts = ["class", "race", "mouth", "hair", "hairColor", "horn", "hornColor", "brows", "eyes", "beard", "nose", "ears", "extra", "special"];
/** Literal server aliases only; this never follows fusion/identity relationships. */
export function favoriteServerNamespace(value: string): string {
  const raw = value.toLowerCase();
  const named: Record<string, string> = { black_forest: "blackforest", granogrim: "gnarogrim", granogrim_net: "gnarogrim", mearwynn: "maerwynn", stumplesteppe: "stumblesteppe", stumplesteppe_net: "stumblesteppe" };
  return named[raw] ?? raw.replace(/(?:_?net)$/, "").replace(/^int(\d+)$/, "w$1")
    .replace(/^s(\d+)(?:_?eu)?$/, "eu$1").replace(/^s(\d+)_?([a-z]{2})$/, "$2$1")
    .replace(/^([a-z]+\d+)(?:_[a-z]+|[a-z]{2})$/, "$1").replace(/_[a-z]+$/, "");
}
function ref(v: unknown, kind: string): Ref {
  if (!obj(v)) fail(); const identifier = str(v.identifier).toLowerCase(), serverNamespace = str(v.serverNamespace).toLowerCase(), entityId = str(v.entityId, 24);
  if (!new RegExp(`^[a-z0-9_]+_${kind === "player" ? "p" : "g"}${entityId}$`).test(identifier) || !/^\d+$/.test(entityId) || !/^[a-z0-9_]+$/.test(serverNamespace)) fail();
  const prefix = identifier.slice(0, identifier.lastIndexOf(kind === "player" ? "_p" : "_g"));
  if (favoriteServerNamespace(prefix) !== serverNamespace) fail("Conflicting favorite server reference");
  return { identifier, serverNamespace, entityId };
}
export function parsePortableFavorite(v: unknown): PortableFavorite {
  if (!obj(v) || !["player", "guild"].includes(v.kind) || !obj(v.display) || !Array.isArray(v.originalReferences) || v.originalReferences.length > 32) fail();
  const d = v.display, display: Display = { name: nullableText(d.name), server: nullableText(d.server), observedAtMs: number(d.observedAtMs) };
  for (const k of ["className", "guildName", "coaString"] as const) if (d[k] !== undefined) display[k] = nullableText(d[k], k === "coaString" ? 2048 : 256);
  for (const k of ["level", "hofRank", "memberCount"] as const) if (d[k] !== undefined) display[k] = number(d[k]);
  if (d.appearance !== undefined) {
    const a = d.appearance; if (!obj(a)) fail();
    const classId = number(a.classId), coaString = nullableText(a.coaString, 2048);
    let portrait: NonNullable<Display["appearance"]>["portrait"] = null;
    if (a.portrait !== null) {
      if (!obj(a.portrait) || !["male", "female"].includes(a.portrait.genderName)) fail();
      portrait = { genderName: a.portrait.genderName };
      for (const k of parts) { const n = a.portrait[k]; if (!Number.isSafeInteger(n)) fail(); portrait[k] = n; }
      if (Number(portrait.race) < 1 || Number(portrait.race) > 8 || Number(portrait.class) < 1 || Number(portrait.class) > 20) fail();
    }
    display.appearance = { classId, coaString, portrait };
    if (classId !== null) display.className = String(classId);
  }
  const result: PortableFavorite = { key: str(v.key), kind: v.kind, reference: v.reference === null ? null : ref(v.reference, v.kind),
    originalReferences: v.originalReferences.map((r: unknown) => ref(r, v.kind)), display, historicalAt: number(v.historicalAt) };
  if (JSON.stringify(result).length > 12000) fail("Favorite card is too large");
  return result;
}
export function assertFavoritesBudget(doc: FavoritesDocument) {
  const counts = { player: 0, guild: 0 };
  for (const e of doc.entries) if (e.value) counts[e.value.kind]++;
  if (counts.player > 250 || counts.guild > 250) throw Object.assign(Error("Favorites limit reached"), { code: "FAVORITES_LIMIT" });
  // JSON bytes plus conservative per-field/index overhead and document path reserve.
  // Tombstones are included. Refuse with the old document intact; never truncate.
  const json = JSON.stringify(doc), fields = (json.match(/:/g) ?? []).length;
  if (new TextEncoder().encode(json).length + fields * 32 + 2048 > 900 * 1024) throw Object.assign(Error("Favorites document capacity reached"), { code: "FAVORITES_SIZE" });
}
export function parseFavoritesDocument(v: unknown): FavoritesDocument {
  if (!obj(v) || v.schemaVersion !== 1 || !Array.isArray(v.entries) || !Array.isArray(v.order)) fail("Unsupported favorites document; original preserved");
  const result: FavoritesDocument = { schemaVersion: 1, revision: number(v.revision, false)!, orderRevision: number(v.orderRevision, false)!,
    order: v.order.map((k: unknown) => str(k)), entries: v.entries.map((e: any) => {
      if (!obj(e)) fail(); const key = str(e.key), value = e.value === null ? null : parsePortableFavorite(e.value);
      if (value && value.key !== key) fail(); return { key, revision: number(e.revision, false)!, value };
    }) };
  const keys = new Set(result.entries.map(e => e.key)), live = new Set(result.entries.filter(e => e.value).map(e => e.key));
  if (keys.size !== result.entries.length || new Set(result.order).size !== result.order.length || result.order.length !== live.size || result.order.some(k => !live.has(k)) || result.entries.some(e => e.revision > result.revision) || result.orderRevision > result.revision) fail();
  assertFavoritesBudget(result); return result;
}
export function parseFavoriteBatch(v: unknown): FavoriteBatch {
  if (!obj(v) || !Array.isArray(v.changes) || v.changes.length > 1000) fail();
  const result: FavoriteBatch = { baseOrderRevision: number(v.baseOrderRevision, false)!, changes: v.changes.map((c: any) => {
    if (!obj(c) || !["add", "remove", "display"].includes(c.intent)) fail();
    const key = str(c.key), value = c.value === null ? null : parsePortableFavorite(c.value);
    if (value && value.key !== key || c.intent === "remove" && value !== null || c.intent !== "remove" && !value) fail();
    return { key, baseRevision: number(c.baseRevision, false)!, value, intent: c.intent };
  }) };
  if (v.order !== undefined) { if (!Array.isArray(v.order)) fail(); result.order = v.order.map((k: unknown) => str(k)); if (new Set(result.order).size !== result.order.length) fail(); }
  if (new Set(result.changes.map(c => c.key)).size !== result.changes.length) fail(); return result;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Removal wins over stale adds/display updates. Explicit re-add must have seen the tombstone. */
export function applyFavoriteBatch(before: FavoritesDocument, batch: FavoriteBatch): FavoritesDocument {
  const next = structuredClone(before), revision = before.revision + 1;
  for (const change of batch.changes) {
    let entry = next.entries.find(e => e.key === change.key);
    if (change.intent !== "remove" && entry && !entry.value && change.baseRevision < entry.revision) continue;
    if (change.intent === "display" && !entry?.value) continue;
    let value = change.value;
    if (entry?.value && value) {
      if (entry.value.historicalAt !== null && value.display.observedAtMs !== entry.value.historicalAt) continue;
      if ((entry.value.display.observedAtMs ?? 0) > (value.display.observedAtMs ?? 0) ||
        Object.entries(entry.value.display).some(([k, v]) => k !== "server" && v != null && (value!.display as Record<string, unknown>)[k] == null) ||
        entry.value.display.appearance?.portrait && !value.display.appearance?.portrait) value = { ...value, display: entry.value.display };
      // References/anchors cannot be changed by an unrelated stale metadata update.
      value = { ...entry.value, display: value.display, historicalAt: entry.value.historicalAt ??
        (value.historicalAt === value.display.observedAtMs ? value.historicalAt : null) };
    }
    if (entry && same(entry.value, value)) continue;
    if (!entry) { entry = { key: change.key, revision, value }; next.entries.push(entry); } else { entry.value = value; entry.revision = revision; }
  }
  const live = next.entries.filter(e => e.value).map(e => e.key), liveSet = new Set(live);
  next.order = next.order.filter(k => liveSet.has(k)); next.order.push(...live.filter(k => !next.order.includes(k)));
  if (batch.order && batch.baseOrderRevision === before.orderRevision) next.order = [...batch.order.filter(k => liveSet.has(k)), ...next.order.filter(k => !batch.order!.includes(k))];
  if (!same(next.order, before.order)) next.orderRevision = revision;
  if (!same({ ...next, revision: before.revision }, before)) next.revision = revision;
  assertFavoritesBudget(next); return next;
}
export function migrateLegacyFavorites(before: FavoritesDocument, raw: unknown): FavoritesDocument {
  if (raw === undefined) return before;
  if (!obj(raw) || Object.keys(raw).some(k => !["schemaVersion", "players", "guilds"].includes(k))) fail("Unrecognized legacy favorites; original preserved");
  const changes: FavoriteChange[] = [];
  for (const [bucket, kind] of [["players", "player"], ["guilds", "guild"]] as const) {
    if (raw[bucket] === undefined) continue;
    if (!obj(raw[bucket])) fail();
    for (const [identifier, old] of Object.entries(raw[bucket])) {
      const match = identifier.toLowerCase().match(new RegExp(`^([a-z0-9_]+)_${kind === "player" ? "p" : "g"}(\\d+)$`));
      if (!match || old !== true && !obj(old)) fail("Unrecognized legacy entry; original preserved");
      const meta = obj(old) ? old : {}, reference = { identifier: identifier.toLowerCase(), serverNamespace: favoriteServerNamespace(match[1]), entityId: match[2] };
      const key = `${kind}:${reference.serverNamespace}::${reference.entityId}`;
      if (before.entries.some(e => e.key === key)) continue; // includes synchronized removals
      const value = parsePortableFavorite({ key, kind, reference, originalReferences: [reference], historicalAt: null,
        display: { ...meta, name: meta.name ?? meta.displayName ?? null, server: reference.serverNamespace,
          className: meta.className ?? meta.class ?? null, observedAtMs: meta.observedAtMs ?? null } });
      changes.push({ key, baseRevision: 0, value, intent: "add" });
    }
  }
  return applyFavoriteBatch(before, { changes, baseOrderRevision: before.orderRevision });
}
