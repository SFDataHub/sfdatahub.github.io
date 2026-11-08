import type { NormalizedPlayer } from "../parsing/normalizedPlayer";
import { getClassMetaById } from "../../data/classes";

export const ATTRIBUTE_NAMES = ["Main", "Con", "Dex", "Int", "Str", "Lck"] as const;
export const STAT_NAMES = [...ATTRIBUTE_NAMES, "Sum", "Ratio"] as const;
export const ATTRIBUTE_BONUSES = [
  ["pet", "Pet Bonus"], ["potion", "Potion Bonus"], ["classBonus", "Class Bonus"],
  ["gems", "Gem Bonus"], ["items", "Item Bonus"], ["upgrades", "Upgrade Bonus"],
  ["itemsBase", "Item Bonus without Upgrades"], ["equipment", "Equipment Bonus"], ["bonus", "Total Bonus"],
] as const;
export type PlayerAttributeColumn = { key: string; label: string; path: string[]; stat: string; component: string; field?: string; delta?: string };
const legacyFields: Record<string, string> = { Main: "main", Con: "con", Sum: "sum", Ratio: "ratio" };
export const PLAYER_ATTRIBUTE_COLUMNS: PlayerAttributeColumn[] = [
  ...(["base", "total"] as const).flatMap(mode => STAT_NAMES.map(stat => ({
    key: `${mode}${stat}`, label: `${mode === "base" ? "Base" : "Total"} ${stat}`,
    path: ["attributes", mode === "base" ? "baseStats" : "totalStats"], stat, component: mode,
    ...(legacyFields[stat] ? { field: mode === "base" ? (stat === "Ratio" ? "ratioBase" : legacyFields[stat]) : stat === "Ratio" ? "ratioTotal" : `${legacyFields[stat]}Total`,
      ...(["Main", "Con", "Sum"].includes(stat) ? { delta: `${legacyFields[stat]}${mode === "total" ? "Total" : ""}` } : {}) } : {}),
  }))),
  ...ATTRIBUTE_BONUSES.flatMap(([component, label]) => ATTRIBUTE_NAMES.map(stat => ({
    key: `bonus_${component}_${stat.toLowerCase()}`, label: `${label} ${stat}`,
    path: ["attributes", "bonuses", component], stat, component,
  }))),
];
export const playerAttributeColumn = (key: string) => PLAYER_ATTRIBUTE_COLUMNS.find(c => c.key === key);
export type PlayerAttributeValues = Record<string, number | null>;
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
/** Project only scalar components, reusing the single normalization done by derivation. */
export function projectPlayerAttributeValues(core: NormalizedPlayer | null, classId: unknown): PlayerAttributeValues {
  const keys = { Main: getClassMetaById(Number(classId))?.primaryAttribute, Con: "constitution", Dex: "dexterity", Int: "intelligence", Str: "strength", Lck: "luck" };
  return Object.fromEntries(PLAYER_ATTRIBUTE_COLUMNS.filter(c => !c.field).map(c => {
    const attribute = keys[c.stat as keyof typeof keys];
    const status = core?.metadata.fields[`attributes.${attribute}.${c.component}`]?.status;
    const value = attribute && core?.attributes[attribute as keyof NormalizedPlayer["attributes"]]?.[c.component as keyof NormalizedPlayer["attributes"]["strength"]];
    return [c.key, status === "available" ? finite(value) : null];
  }));
}
export function playerAttributeValue(row: { attributeValues?: PlayerAttributeValues }, column: PlayerAttributeColumn): number | null {
  const scalars = row as unknown as Record<string, unknown>;
  const value = finite(column.field ? scalars[column.field] : row.attributeValues?.[column.key]);
  if (value != null || column.stat !== "Ratio") return value;
  // Older prepared rows can omit the ratio scalars while retaining both inputs.
  const total = column.component === "total";
  return playerAttributeRatio(finite(scalars[total ? "mainTotal" : "main"]), finite(scalars[total ? "conTotal" : "con"]));
}
export const playerAttributeRatio = (main: number | null, con: number | null) =>
  main == null || con == null || main + con <= 0 ? null : Math.round(main / (main + con) * 100);
export const playerRatioLabel = (ratio: number | null) => ratio == null ? "—" : `${ratio}/${100 - ratio}`;
/** Translation composition keeps menu leaves short, headers and selected columns explicit. */
export function attributeColumnLabel(column: PlayerAttributeColumn, translate: (key: string, fallback: string) => string, leaf = false) {
  const stat = translate(`toplists.attributeCatalog.stats.${column.stat}`, column.stat);
  if (leaf) return stat;
  const group = column.path[column.path.length - 1];
  const fallback = column.component === "base" ? "Base" : column.component === "total" ? "Total" : ATTRIBUTE_BONUSES.find(b => b[0] === group)?.[1] ?? group;
  return `${translate(`toplists.attributeCatalog.types.${column.component}`, fallback)} ${stat}`;
}
