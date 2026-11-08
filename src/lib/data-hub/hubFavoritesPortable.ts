import { applyFavoriteBatch, parsePortableFavorite, type PortableFavorite, type FavoritesDocument, type FavoriteBatch } from "../../../auth-api/src/lib/favoritesState";
import { favoriteReference, guildFavorite, referenceKey, type HubFavorite } from "./hubFavoritesContract";
import { parseHubSearchAppearance, searchClassId } from "./hubSearchAppearance";

export type FavoritesSyncJournal = { base: FavoritesDocument | null; pending: FavoriteBatch; guestImports: Record<string, string>; orderConflict?: boolean };
export const emptySyncJournal = (): FavoritesSyncJournal => ({ base: null, pending: { changes: [], baseOrderRevision: 0 }, guestImports: {} });
export function portableKey(f: HubFavorite) { return f.reference && !f.referenceIssue ? `${f.kind}:${referenceKey(f.reference)}` : f.id; }
export function portableFavorite(f: HubFavorite): PortableFavorite {
  const { name, server, observedAtMs, className, guildName, coaString, hofRank, memberCount } = f.display;
  const appearance = parseHubSearchAppearance(f.display.appearance);
  const level = f.display.level ?? (() => {
    const label = f.display.levelLabel?.replace(/^Level\s+/i, "").trim(); return label && /^\d+$/.test(label) ? Number(label) : null;
  })();
  return parsePortableFavorite({ key: portableKey(f), kind: f.kind, reference: f.reference, originalReferences: f.originalReferences,
    historicalAt: f.kind === "guild" && f.observationHint?.sourceScanId ? f.observationHint.observedAtMs : f.historicalAt ?? null,
    display: { name, server, observedAtMs, ...(f.kind === "player" ? { className: searchClassId(className)?.toString() ?? (className || null), guildName: guildName || null, level, ...(appearance ? { appearance } : {}) }
      : { coaString: coaString || null, hofRank: hofRank ?? null, memberCount: memberCount ?? null }) } });
}
/** Imported references are hints only. No local identity, source, scan hash or revision is copied. */
export function localPortableFavorite(value: PortableFavorite, index: number, existing?: HubFavorite): HubFavorite {
  const f = value.kind === "guild" ? guildFavorite({ id: value.key, guildId: value.reference?.identifier ?? "", ...value.display, server: value.display.server ?? "" }, index, null, false)
    : { id: value.key, kind: value.kind, reference: null, originalReferences: [], identityHint: null, referenceIssue: "incomplete", display: value.display, order: index, recordRevision: 1 } as HubFavorite;
  const refs = value.originalReferences.map(r => favoriteReference(value.kind, r.identifier)).filter(r => !!r);
  const reference = value.reference ? favoriteReference(value.kind, value.reference.identifier) : null;
  // Retain existing device evidence only when updating that exact local favorite.
  return { ...f, ...(existing ?? {}), id: existing?.id ?? value.key, reference: existing?.reference ?? reference,
    originalReferences: existing?.originalReferences ?? refs, identityHint: existing?.identityHint ?? null,
    referenceIssue: existing?.referenceIssue ?? (reference ? null : "incomplete"),
    historicalAt: value.historicalAt, display: { ...value.display, appearance: parseHubSearchAppearance(value.display.appearance), level: value.display.level,
      levelLabel: value.display.level == null ? undefined : String(value.display.level) }, order: index };
}
export function journalFavoriteChange(journal: FavoritesSyncJournal, before: readonly HubFavorite[], after: readonly HubFavorite[]): FavoritesSyncJournal {
  const next = structuredClone(journal), old = new Map(before.map(f => [portableKey(f), portableFavorite(f)])), current = new Map(after.map(f => [portableKey(f), portableFavorite(f)]));
  const changes = new Map(next.pending.changes.map(c => [c.key, c]));
  for (const key of new Set([...old.keys(), ...current.keys()])) {
    const value = current.get(key) ?? null;
    if (JSON.stringify(value) === JSON.stringify(old.get(key) ?? null)) continue;
    const prior = changes.get(key), base = next.base?.entries.find(e => e.key === key);
    const intent = !value ? "remove" : prior?.intent === "add" || !old.has(key) ? "add" : "display";
    // A removed unsent add has no cloud effect.
    if (!value && prior?.intent === "add" && !base?.value) changes.delete(key);
    else if (JSON.stringify(value) === JSON.stringify(base?.value ?? null)) changes.delete(key);
    else changes.set(key, { key, value, intent, baseRevision: prior?.baseRevision ?? base?.revision ?? 0 });
  }
  next.pending.changes = [...changes.values()];
  const oldOrder = before.map(portableKey), order = after.map(portableKey);
  if (JSON.stringify(oldOrder) !== JSON.stringify(order)) { next.pending.order = order; next.pending.baseOrderRevision = next.base?.orderRevision ?? 0; }
  if (next.pending.order && JSON.stringify(next.pending.order) === JSON.stringify(next.base?.order ?? [])) delete next.pending.order;
  return next;
}

export type CloudFavoriteOperation = { type: "cloud"; document: FavoritesDocument; ack?: FavoriteBatch;
  additions?: FavoriteBatch["changes"]; guestImports?: Record<string, string>; retained?: readonly HubFavorite[] };

/** Called inside the same local writer lease/IDB transaction as the current record and outbox read. */
export function reconcileCloudFavorites(before: readonly HubFavorite[], original: FavoritesSyncJournal, operation: CloudFavoriteOperation) {
  const journal = structuredClone(original), doc = operation.document, ack = operation.ack;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  journal.orderConflict = false;
  if (ack) {
    journal.pending.changes = journal.pending.changes.filter(c => !ack.changes.some(sent => same(c, sent)));
    for (const change of journal.pending.changes) if (change.intent === "add" && ack.changes.some(sent => sent.key === change.key && sent.intent === "remove")) {
      const tombstone = doc.entries.find(e => e.key === change.key);
      if (tombstone && !tombstone.value) change.baseRevision = tombstone.revision;
    }
    if (ack.order && same(journal.pending.order, ack.order)) {
      const live = new Set(doc.entries.filter(e => e.value).map(e => e.key)), desired = ack.order.filter(k => live.has(k));
      const selected = new Set(desired);
      if (same(doc.order.filter(k => selected.has(k)), desired)) delete journal.pending.order;
      else journal.orderConflict = true;
    }
  }
  for (const addition of operation.additions ?? []) if (!journal.pending.changes.some(c => c.key === addition.key)) journal.pending.changes.push(addition);
  journal.guestImports = { ...journal.guestImports, ...operation.guestImports };
  journal.pending.baseOrderRevision = doc.orderRevision;
  journal.base = doc;
  const effective = applyFavoriteBatch(doc, journal.pending), previous = [...before, ...(operation.retained ?? [])];
  const favorites = effective.order.map((key, index) => localPortableFavorite(effective.entries.find(e => e.key === key)!.value!, index, previous.find(f => portableKey(f) === key)));
  return { favorites, journal };
}
