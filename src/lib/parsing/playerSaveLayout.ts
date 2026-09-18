import { parseSaveStringToArray } from "./extractPortrait";

export type SfPlayerSaveLayout = "currentCompact" | "legacyOwn" | "legacyOther" | "unknown";

export const CURRENT_COMPACT_SAVE_VERSION = 2;
export const CURRENT_COMPACT_SAVE_LENGTH = 70;
export const LEGACY_OWN_SAVE_MIN_LENGTH = 650;
export const LEGACY_OTHER_SAVE_MIN_LENGTH = 256;

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asSaveArray = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null);

export const readSfPlayerSaveArray = (row: Record<string, unknown>): unknown[] | null => {
  const saveField = row.save ?? row.playerSave;
  const saveArray = asSaveArray(saveField);
  if (saveArray && saveArray.length) return saveArray;

  const saveString =
    typeof saveField === "string"
      ? saveField
      : typeof row.saveString === "string"
        ? row.saveString
        : undefined;
  const fromString = saveString ? parseSaveStringToArray(saveString) : undefined;
  return fromString && fromString.length ? fromString : null;
};

export const detectSfPlayerSaveLayout = (
  row: Record<string, unknown>,
  saveArray: unknown[] | null = readSfPlayerSaveArray(row),
): SfPlayerSaveLayout => {
  if (!saveArray?.length) return "unknown";

  const saveVersion = toFiniteNumberOrNull(row.saveVersion);
  if (saveVersion === CURRENT_COMPACT_SAVE_VERSION && saveArray.length === CURRENT_COMPACT_SAVE_LENGTH) {
    return "currentCompact";
  }

  const own = toFiniteNumberOrNull(row.own);
  if (own === 1 && saveArray.length >= LEGACY_OWN_SAVE_MIN_LENGTH) return "legacyOwn";
  if (own !== 1 && saveArray.length >= LEGACY_OTHER_SAVE_MIN_LENGTH) return "legacyOther";

  return "unknown";
};

export const readSfSaveNumber = (saveArray: unknown[] | null, index: number): number | null => {
  if (!saveArray || index >= saveArray.length) return null;
  return toFiniteNumberOrNull(saveArray[index]);
};

export const hasSfSaveIndex = (saveArray: unknown[] | null, index: number): boolean =>
  Boolean(
    saveArray && index >= 0 && index < saveArray.length && Object.prototype.hasOwnProperty.call(saveArray, index),
  );

export const readSfSaveLowerShort = (saveArray: unknown[] | null, index: number): number | null => {
  const value = readSfSaveNumber(saveArray, index);
  return value == null ? null : value & 0xffff;
};

export const readSfSaveByte = (saveArray: unknown[] | null, index: number, byteOffset = 0): number | null => {
  const value = readSfSaveNumber(saveArray, index);
  return value == null ? null : (value >> (byteOffset * 8)) & 0xff;
};
