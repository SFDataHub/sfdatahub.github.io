import type { PortraitOptions } from "../../components/player-profile/types";
import { CLASSES, getClassMetaById } from "../../data/classes";
import { createPortraitOptionsFromSaveArray } from "../portraitFromSave";
import { detectSfPlayerSaveLayout, readSfPlayerSaveArray } from "../parsing/playerSaveLayout";
import { isValidGuildCoaString } from "../guilds/guildCoa";
import { extractPortraitFromSaveArray } from "../parsing/extractPortrait";

const portraitNumbers = ["class", "race", "mouth", "hair", "hairColor", "horn", "hornColor", "brows", "eyes", "beard", "nose", "ears", "extra", "special"] as const;
export type HubSearchPortrait = Pick<PortraitOptions, "genderName" | typeof portraitNumbers[number]>;
export type HubSearchAppearance = { classId: number | null; portrait: HubSearchPortrait | null; coaString: string | null };

export function searchClassId(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const byId = getClassMetaById(value);
  if (byId) return byId.id;
  const key = String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return CLASSES.find(c => [c.key, c.label].some(label => label.toLowerCase().replace(/[^a-z0-9]/g, "") === key))?.id ?? null;
}

/** One row, during source preparation only. No character core, profile or saved save-array. */
export function readHubSearchAppearance(kind: "player" | "guild", raw: unknown, coa?: string | null): HubSearchAppearance {
  if (kind === "guild") return { classId: null, portrait: null, coaString: coa && isValidGuildCoaString(coa) ? coa : null };
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const values = record.values && typeof record.values === "object" ? record.values as Record<string, unknown> : {};
  let classId = searchClassId(record.classId ?? record.class ?? record.Class ?? record.className ?? values.Class);
  let portrait: HubSearchPortrait | null = null;
  const save = readSfPlayerSaveArray(record);
  if (save && detectSfPlayerSaveLayout(record, save) !== "unknown") {
    const numbers = save.map(value => Number(value));
    const decoded = createPortraitOptionsFromSaveArray(numbers, { own: record.own, saveVersion: record.saveVersion, save: numbers });
    const decodedClass = searchClassId(decoded.class);
    // Missing/invalid appearance evidence is a placeholder, never a fabricated default person.
    if (decodedClass && decoded.race >= 1 && decoded.race <= 8 && extractPortraitFromSaveArray(numbers, record).genderName !== null && portraitNumbers.every(key => Number.isSafeInteger(decoded[key]))) {
      portrait = { genderName: decoded.genderName, ...Object.fromEntries(portraitNumbers.map(key => [key, decoded[key]])) } as HubSearchPortrait;
      classId ??= decodedClass;
    }
  }
  return { classId, portrait, coaString: null };
}

export function validHubSearchAppearance(value: unknown): value is HubSearchAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const a = value as HubSearchAppearance;
  return (a.classId === null || typeof a.classId === "number" && searchClassId(a.classId) === a.classId) &&
    (a.coaString === null || typeof a.coaString === "string" && isValidGuildCoaString(a.coaString)) &&
    (a.portrait === null || !!a.portrait && ["male", "female"].includes(a.portrait.genderName) &&
      portraitNumbers.every(key => Number.isSafeInteger(a.portrait![key])) && searchClassId(a.portrait.class) !== null && a.portrait.race >= 1 && a.portrait.race <= 8);
}

/** Whitelist persisted display values; never retain URLs, profiles or save arrays. */
export function parseHubSearchAppearance(value: unknown): HubSearchAppearance | undefined {
  if (!validHubSearchAppearance(value)) return;
  return { classId: value.classId, coaString: value.coaString, portrait: value.portrait ? {
    genderName: value.portrait.genderName,
    ...Object.fromEntries(portraitNumbers.map(key => [key, value.portrait![key]])),
  } as HubSearchPortrait : null };
}
