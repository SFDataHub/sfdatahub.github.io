export type PlayerStatCode = "str" | "dex" | "int" | "con" | "lck";

type Rgb = { r: number; g: number; b: number };

// Shared stat accents aligned to the hero stat potion/icon palette.
export const PLAYER_STAT_ACCENT_COLORS: Record<PlayerStatCode, string> = {
  str: "#5C8BC6",
  dex: "#C79A3A",
  int: "#4FA36A",
  con: "#8A64C7",
  lck: "#B85762",
};

export const ATTRIBUTE_COMPOSITION_SHADE_ACCENT_WEIGHTS = [0.4, 0.5, 0.6, 0.7, 0.78, 0.85] as const;

export const ATTRIBUTE_COMPOSITION_SHADE_MIX_BG = "#152A42";

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = hex.trim().replace(/^#/, "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex(rgb: Rgb): string {
  const toHex = (value: number) => clampByte(value).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function mixHexColors(backgroundHex: string, accentHex: string, accentWeight: number): string {
  const bg = hexToRgb(backgroundHex);
  const accent = hexToRgb(accentHex);
  if (!bg && !accent) return ATTRIBUTE_COMPOSITION_SHADE_MIX_BG;
  if (!bg) return accentHex;
  if (!accent) return backgroundHex;
  const weight = Math.max(0, Math.min(1, accentWeight));
  const bgWeight = 1 - weight;
  return rgbToHex({
    r: bg.r * bgWeight + accent.r * weight,
    g: bg.g * bgWeight + accent.g * weight,
    b: bg.b * bgWeight + accent.b * weight,
  });
}

export function getPlayerStatAccentColor(statCode: string | null | undefined): string {
  if (!statCode) return PLAYER_STAT_ACCENT_COLORS.str;
  const key = statCode.toLowerCase() as PlayerStatCode;
  return PLAYER_STAT_ACCENT_COLORS[key] ?? PLAYER_STAT_ACCENT_COLORS.str;
}

export function getPlayerStatAccentRgbString(statCode: string | null | undefined): string {
  const rgb = hexToRgb(getPlayerStatAccentColor(statCode));
  if (!rgb) return "92, 139, 198";
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}
