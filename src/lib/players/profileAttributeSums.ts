import type { NormalizedPlayer } from "../parsing/normalizedPlayer";
import { readFocusedPlayerStats } from "./focusedPlayerStats";

export type ProfileSumPair = { base: number | null; total: number | null };
export type ProfileAttributeSums = { "main-con": ProfileSumPair; "all-five": ProfileSumPair };
const attributes = ["strength", "dexterity", "intelligence", "constitution", "luck"] as const;
const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Profile values only: consume normalized components of one observation.
 * Generic stored sums cannot prove five attributes. Zero remains available. */
export function readProfileAllAttributeSums(core: NormalizedPlayer | null | undefined): ProfileSumPair {
  const sum = (field: "base" | "total") => {
    const values = attributes.map(key => core?.attributes[key][field]);
    if (!values.every(valid)) return null;
    const value = values.reduce((a, b) => a + b, 0);
    return valid(value) ? value : null;
  };
  return { base: sum("base"), total: sum("total") };
}

export function readProfileAttributeSums(raw: unknown, core?: NormalizedPlayer | null): ProfileAttributeSums {
  const focused = readFocusedPlayerStats(raw, core);
  return { "main-con": { base: focused.sumBaseTotal, total: focused.totalStats }, "all-five": readProfileAllAttributeSums(core) };
}

