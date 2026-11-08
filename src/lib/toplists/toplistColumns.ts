import { PLAYER_ATTRIBUTE_COLUMNS, playerAttributeColumn, attributeColumnLabel } from "./playerAttributeColumns";
/** Stable local table identities; labels and positions are not persisted. */
export type ToplistKind = "players" | "guilds";
export type ToplistColumn = { key: string; label: string; category: "identity" | "attributes" | "progress" | "fortress"; metric?: string; path?: string[] };
const column = (key: string, label: string, category: ToplistColumn["category"], metric?: string): ToplistColumn => ({ key, label, category, metric });
export const PLAYER_COLUMNS = [
  column("rank", "#", "identity"), column("rankDelta", "Δ Rank", "identity"),
  column("server", "Server", "identity", "server"), column("name", "Player", "identity", "name"),
  column("class", "Class", "identity", "class"), column("guild", "Guild", "identity", "guild"),
  column("level", "Level", "progress", "level"), column("main", "Main", "attributes", "main"),
  column("con", "Con", "attributes", "constitution"), column("sum", "Sum", "attributes", "sum"),
  column("statsPerDay", "Stats/Day", "progress", "statsDay"), column("ratio", "Ratio", "attributes", "ratio"),
  column("mine", "Mine", "fortress", "mine"), column("treasury", "Treasury", "fortress", "treasury"),
  column("lastScan", "Last Scan", "identity", "lastScan"),
];
export const GUILD_COLUMNS = [
  column("rank", "#", "identity"), column("server", "Server", "identity", "guildServer"), column("name", "Name", "identity", "guildName"),
  column("hofRank", "HoF Rank", "progress", "guildHofRank"), column("honor", "Honor", "progress", "guildHonor"),
  column("raids", "Raids", "progress", "guildRaids"), column("portal", "Portal", "progress", "guildPortal"),
  column("hydra", "Hydra", "progress", "guildHydra"), column("petLevel", "Pet Level", "progress", "guildPetLevel"),
  column("members", "Members", "identity", "guildMembers"), column("avgLevel", "ø Level", "attributes", "guildAvgLevel"),
  column("avgMain", "ø Main", "attributes", "guildAvgMain"), column("avgCon", "ø Con", "attributes", "guildAvgCon"),
  column("avgSum", "ø Sum", "attributes", "guildAvgSum"), column("lastScan", "Last Scan", "identity", "guildLastScan"),
];
const DYNAMIC_ATTRIBUTES = ["main", "con", "sum", "ratio"];
const OPTIONAL_PLAYER_COLUMNS: ToplistColumn[] = PLAYER_ATTRIBUTE_COLUMNS.map(c => ({ key: c.key, label: c.label, category: "attributes", metric: c.key, path: c.path }));
export const toplistColumns = (kind: ToplistKind) => kind === "players" ? [...PLAYER_COLUMNS.filter(c => !DYNAMIC_ATTRIBUTES.includes(c.key)), ...OPTIONAL_PLAYER_COLUMNS] : GUILD_COLUMNS;
const allowedColumns = (kind: ToplistKind) => kind === "players" ? [...PLAYER_COLUMNS, ...OPTIONAL_PLAYER_COLUMNS] : GUILD_COLUMNS;
export const toplistColumnDefinition = (kind: ToplistKind, key: string) => allowedColumns(kind).find(c => c.key === key);
/** The same translated title is used by local headers and the visible sort choices. */
export function toplistColumnLabel(kind: ToplistKind, key: string, translate: (key: string, fallback: string) => string) {
  const attribute = kind === "players" ? playerAttributeColumn(key) : undefined;
  return attribute ? attributeColumnLabel(attribute, translate)
    : translate(`toplists.columns.${key === "name" && kind === "players" ? "player" : key}`, toplistColumnDefinition(kind, key)?.label ?? key);
}
export const defaultToplistColumns = (kind: ToplistKind) => (kind === "players" ? PLAYER_COLUMNS : GUILD_COLUMNS).filter(c => kind !== "players" || !["server", "class"].includes(c.key)).map(c => c.key);
export type NamedToplistView = { attributeContract?: 1; playerValueMode?: "base" | "total"; id: string; name: string; columns: string[]; widths?: Record<string, number>; [key: string]: unknown };
export type ToplistColumnView = { mode: "default" | "custom"; columns: string[]; activeId: string; views: NamedToplistView[]; [key: string]: unknown };
export type ToplistViews = Record<ToplistKind, ToplistColumnView>;
export function normalizeColumnWidths(value: unknown, kind: ToplistKind): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const allowed = new Set(allowedColumns(kind).map(c => c.key));
  return Object.fromEntries(Object.entries(value).filter(([key, width]) => allowed.has(key) && typeof width === "number" && Number.isFinite(width) && width > 0)) as Record<string, number>;
}
export const activeColumnWidths = (value: ToplistColumnView) => value.views.find(v => v.id === value.activeId)?.widths;
export function insertToplistColumn(columns: string[], target: string, key: string, replace = false): string[] {
  const index = columns.indexOf(target);
  if (index < 0 || columns.includes(key) || replace && target === "name") return columns;
  const next = [...columns];
  next.splice(index + (replace ? 0 : 1), replace ? 1 : 0, key);
  return next;
}
export function editToplistWidths(value: ToplistColumnView, kind: ToplistKind, widths: Record<string, number>, copyName: string): ToplistColumnView {
  const current = activeColumnWidths(value) ?? {};
  const valid = normalizeColumnWidths(kind === "players" && value.activeId === "default"
    ? Object.fromEntries(Object.entries(widths).map(([key, width]) => [fixedPlayerColumnKey(key, value.playerValueMode === "total" ? "total" : "base"), width])) : widths, kind);
  if (!Object.entries(valid).some(([key, width]) => current[key] !== width)) return value;
  const next = value.activeId === "default" ? newToplistView(value, kind, uniqueToplistViewName(value, copyName), false) : value;
  return normalizeColumnView({ ...next, views: next.views.map(v => v.id === next.activeId ? { ...v, widths: { ...current, ...valid } } : v) }, kind);
}
/** Resolve one visible boundary; only the final boundary can change the table total. */
export function toplistBoundaryWidths(key: string, width: number, rendered: Record<string, number>, rightKey?: string): Record<string, number> {
  const start = rendered[key], right = rightKey === undefined ? undefined : rendered[rightKey];
  if (!Number.isFinite(width) || !Number.isFinite(start) || start <= 0 ||
      rightKey !== undefined && (rightKey === key || !Number.isFinite(right) || right! < 32 || start < 32)) return {};
  const end = Math.max(32, right === undefined ? width : Math.min(width, start + right - 32));
  return rightKey === undefined ? { [key]: end } : { [key]: end, [rightKey]: start + right! - end };
}
/** Commit both sides together, freezing visible Default geometry only on a real change. */
export function resizeToplistColumn(value: ToplistColumnView, kind: ToplistKind, key: string, width: number, rendered: Record<string, number>, copyName: string, rightKey?: string): ToplistColumnView {
  if (!value.columns.includes(key) || rightKey !== undefined && value.columns[value.columns.indexOf(key) + 1] !== rightKey) return value;
  const changed = toplistBoundaryWidths(key, width, rendered, rightKey);
  if (!Object.entries(changed).some(([column, end]) => Math.abs(end - rendered[column]) > 0.5)) return value;
  return editToplistWidths(value, kind, value.activeId === "default" ? { ...rendered, ...changed } : changed, copyName);
}
export function normalizeColumns(value: unknown, kind: ToplistKind): string[] {
  const allowed = new Set(allowedColumns(kind).map(c => c.key));
  const columns = Array.isArray(value) ? [...new Set(value.filter((k): k is string => typeof k === "string" && allowed.has(k)))] : defaultToplistColumns(kind);
  if (!columns.includes("name")) columns.push("name");
  return columns;
}
export function normalizeColumnView(value: unknown, kind: ToplistKind): ToplistColumnView {
  return normalizeView(value, kind, false);
}
/** Incomplete names belong to the form draft; persisted data still uses strict validation. */
export function normalizeColumnViewDraft(value: ToplistColumnView, kind: ToplistKind): ToplistColumnView {
  return normalizeView(value, kind, true);
}
function normalizeView(value: unknown, kind: ToplistKind, draft: boolean): ToplistColumnView {
  const data = value && typeof value === "object" ? value as Partial<ToplistColumnView> : {};
  const views: NamedToplistView[] = [];
  if (Array.isArray(data.views)) {
    for (const view of data.views) {
      if (!view || typeof view.id !== "string" || !view.id || view.id === "default" || views.some(v => v.id === view.id) || typeof view.name !== "string" || (!draft && !view.name.trim())) continue;
      views.push({ ...view, name: draft ? view.name : view.name.trim(), columns: normalizeColumns(view.columns, kind), ...(view.widths === undefined ? {} : { widths: normalizeColumnWidths(view.widths, kind) }) });
    }
  } else if (Array.isArray(data.columns)) {
    views.push({ id: "w149-custom", name: "Custom", columns: normalizeColumns(data.columns, kind), ...(data.widths ? { widths: normalizeColumnWidths(data.widths, kind) } : {}) });
  }
  const requested = typeof data.activeId === "string" ? data.activeId : data.mode === "custom" ? "w149-custom" : "default";
  const active = views.find(v => v.id === requested);
  return { ...data, views, activeId: active?.id ?? "default", mode: active ? "custom" : "default", columns: active ? [...active.columns] : defaultToplistColumns(kind) };
}
export function normalizeToplistViews(value: unknown, playerMode: "base" | "total" = "base"): ToplistViews {
  const data = value && typeof value === "object" ? value as Partial<ToplistViews> : {};
  return { players: freezePlayerColumnView(normalizeColumnView(data.players, "players"), playerMode), guilds: normalizeColumnView(data.guilds, "guilds") };
}
const currentPlayerViewMode = (value: ToplistColumnView): "base" | "total" => (value.views.find(v => v.id === value.activeId)?.playerValueMode ?? value.playerValueMode) === "total" ? "total" : "base";
export function newToplistView(value: ToplistColumnView, kind: ToplistKind, name: string, copyCurrent: boolean): ToplistColumnView {
  if (!name.trim()) throw new TypeError("A view needs a name");
  const id = crypto.randomUUID();
  return normalizeColumnViewDraft({ ...value, activeId: id, views: [...value.views, { id, name: name.trim(), ...(kind === "players" ? { attributeContract: 1 as const, playerValueMode: currentPlayerViewMode(value) } : {}), columns: kind === "players" ? fixedPlayerColumns(copyCurrent ? value.columns : defaultToplistColumns(kind), currentPlayerViewMode(value)) : [...(copyCurrent ? value.columns : defaultToplistColumns(kind))], ...(copyCurrent && activeColumnWidths(value) ? { widths: { ...activeColumnWidths(value) } } : {}) }] }, kind);
}
export function uniqueToplistViewName(value: ToplistColumnView, base: string): string {
  const names = new Set(value.views.map(v => v.name.trim()));
  let name = base, number = 2;
  while (names.has(name)) name = `${base} (${number++})`;
  return name;
}

/** A no-op must not create a view. Creation and the first edit form one saved state. */
export function editToplistColumns(value: ToplistColumnView, kind: ToplistKind, columns: string[], copyName: string): ToplistColumnView {
  const nextColumns = normalizeColumns(columns, kind);
  if (nextColumns.length === value.columns.length && nextColumns.every((key, i) => key === value.columns[i])) return value;
  const next = value.activeId === "default"
    ? newToplistView(value, kind, uniqueToplistViewName(value, copyName), false)
    : value;
  return normalizeColumnView({ ...next, views: next.views.map(v => v.id === next.activeId ? { ...v, columns: kind === "players" ? fixedPlayerColumns(nextColumns, next.playerValueMode === "total" ? "total" : "base") : nextColumns } : v) }, kind);
}
export type LocalTableColumnsProps = {
  localValueMode?: "base" | "total";
  localColumns?: readonly string[];
  localColumnWidths?: Record<string, number>;
  localSort?: { metricKey: string; direction: "asc" | "desc" };
  onLocalSort?: (metric: string) => void;
};

/** Dynamic Default columns follow Values; fixed Custom metrics keep their own identity. */
export function playerColumnSortMetric(metric: string, mode: "base" | "total") {
  return mode === "total" ? ({ main: "mainTotal", constitution: "conTotal", sum: "sumTotal", statsDay: "statsDayTotal" } as Record<string, string>)[metric] ?? metric : metric;
}

/** Explicit Total options refer to the same header only while Total is visible. */
export function playerColumnSortMatches(metric: string, active: string, mode: "base" | "total") {
  return active === metric || mode === "total" && active === playerColumnSortMetric(metric, mode);
}

export const fixedPlayerColumnKey = (key: string, mode: "base" | "total") => DYNAMIC_ATTRIBUTES.includes(key) ? `${mode}${key[0].toUpperCase()}${key.slice(1)}` : key;
const fixedPlayerColumns = (columns: string[], mode: "base" | "total") => columns.map(key => fixedPlayerColumnKey(key, mode));
/** Idempotent, lossless transfer of identities, order, widths and Stats/Day mode. */
export function freezePlayerColumnView(value: ToplistColumnView, mode: "base" | "total"): ToplistColumnView {
  const views = value.views.map(view => view.attributeContract === 1 ? view : {
    ...view, attributeContract: 1 as const, playerValueMode: mode,
    columns: fixedPlayerColumns(view.columns, mode),
    ...(view.widths ? { widths: Object.fromEntries(Object.entries(view.widths).map(([key, width]) => [fixedPlayerColumnKey(key, mode), width])) } : {}),
  });
  return normalizeColumnView({ ...value, views, playerValueMode: mode }, "players");
}
export type ToplistCatalogNode = { key: string; label?: string; column?: ToplistColumn; children: ToplistCatalogNode[] };
export function toplistColumnTree(kind: ToplistKind): ToplistCatalogNode[] {
  const roots: ToplistCatalogNode[] = [];
  for (const column of toplistColumns(kind)) {
    let nodes = roots;
    for (const key of column.path ?? [column.category]) {
      let node = nodes.find(n => n.key === key);
      if (!node) { node = { key, children: [] }; nodes.push(node); }
      nodes = node.children;
    }
    nodes.push({ key: column.key, label: column.label, column, children: [] });
  }
  return roots.sort((a, b) => ["identity", "attributes", "progress", "fortress"].indexOf(a.key) - ["identity", "attributes", "progress", "fortress"].indexOf(b.key));
}

/** Old dynamic sort choices follow their frozen Custom counterpart, without rewriting Default filters. */
export function fixedPlayerSortKey(metric: string, mode: "base" | "total") {
  return fixedPlayerColumnKey(metric === "constitution" ? "con" : metric, mode);
}
