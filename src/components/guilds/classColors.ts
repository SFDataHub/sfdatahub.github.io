export const GUILD_CLASS_ACCENTS: Record<string, string> = {
  warrior: "#4F86C6",      // Steel Blue
  mage: "#8B5CF6",         // Arcane Violet
  scout: "#5FAE6D",        // Forest Green
  assassin: "#C9A227",     // Amber Gold
  demonhunter: "#C95AAE",  // Cursed Magenta
  berserker: "#D96A2B",    // Inferno Orange
  battlemage: "#9B4D6E",   // Runic Crimson-Violet
  druid: "#4FAF5F",        // Nature Emerald
  bard: "#4C8FD9",         // Royal Cyan-Blue
  necromancer: "#5E7FD6",  // Spectral Blue
  paladin: "#D4AF37",      // Holy Gold
  plaguedoctor: "#6E9F3A", // Toxic Green
};

const GUILD_BAR_MIX_BG = "#152A42";

type Rgb = { r: number; g: number; b: number };

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): Rgb | null {
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

function rgbToHex(rgb: Rgb): string {
  const toHex = (value: number) => clampByte(value).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function mixHexColors(backgroundHex: string, accentHex: string, accentWeight: number): string {
  const bg = hexToRgb(backgroundHex);
  const accent = hexToRgb(accentHex);
  if (!bg && !accent) return GUILD_BAR_MIX_BG;
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

export function normalizeClassColorToken(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function getGuildClassAccent(value?: string | null): string | undefined {
  const token = normalizeClassColorToken(value);
  if (!token) return undefined;
  return GUILD_CLASS_ACCENTS[token];
}

export function getGuildMutedAccent(value?: string | null, accentWeight = 0.38): string | undefined {
  const raw = String(value ?? "").trim();
  const directHex = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : undefined;
  const accent = directHex ?? getGuildClassAccent(value);
  if (!accent) return undefined;
  return mixHexColors(GUILD_BAR_MIX_BG, accent, accentWeight);
}
