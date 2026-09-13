export const SFDATAHUB_ACTION_BLUE = "#2B6DE0";
export const GUILD_ACCENT_FALLBACK = "#91B5D8";

export type GuildAccentPalette = {
  accent: string;
  candidates: string[];
  source: "image" | "fallback";
};

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };
type CandidateBucket = {
  h: number;
  s: number;
  l: number;
  weight: number;
  count: number;
};

const MAX_SAMPLE_SIZE = 56;
const paletteCache = new Map<string, Promise<GuildAccentPalette>>();

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hueDistance(a: number, b: number) {
  const delta = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return delta;
}

function rgbDistance(a: Rgb, b: Rgb) {
  const r = a.r - b.r;
  const g = a.g - b.g;
  const bDelta = a.b - b.b;
  return Math.sqrt(r * r + g * g + bDelta * bDelta);
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

function rgbToHex(rgb: Rgb) {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
  else h = 60 * ((rn - gn) / delta + 4);

  return { h: (h + 360) % 360, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];

  return {
    r: (rn + m) * 255,
    g: (gn + m) * 255,
    b: (bn + m) * 255,
  };
}

function normalizeAccent(input: Hsl): string {
  const warmHue = input.h >= 36 && input.h <= 72;
  const redHue = input.h <= 18 || input.h >= 342;
  const targetSaturation = clamp(input.s, 0.46, warmHue || redHue ? 0.58 : 0.62);
  const targetLightness = clamp(input.l, warmHue ? 0.46 : 0.48, 0.58);
  return rgbToHex(hslToRgb({ h: input.h, s: targetSaturation, l: targetLightness }));
}

function bucketKey(hsl: Hsl) {
  const h = Math.round(hsl.h / 12) * 12;
  const s = Math.round(hsl.s / 0.12) * 0.12;
  const l = Math.round(hsl.l / 0.12) * 0.12;
  return `${h}:${s.toFixed(2)}:${l.toFixed(2)}`;
}

function isUsefulColor(hsl: Hsl, alpha: number) {
  return alpha >= 48 && hsl.s >= 0.18 && hsl.l >= 0.12 && hsl.l <= 0.9;
}

function scoreColor(hsl: Hsl, alpha: number) {
  const saturationScore = clamp((hsl.s - 0.12) / 0.78, 0, 1);
  const lightnessScore = 1 - clamp(Math.abs(hsl.l - 0.52) / 0.45, 0, 1);
  return saturationScore * 1.25 + lightnessScore + alpha / 255;
}

function isReservedBlueConflict(hex: string) {
  const rgb = hexToRgb(hex);
  const addRgb = hexToRgb(SFDATAHUB_ACTION_BLUE);
  if (!rgb || !addRgb) return false;
  const hsl = rgbToHsl(rgb);
  const addHsl = rgbToHsl(addRgb);
  return hueDistance(hsl.h, addHsl.h) <= 14 && rgbDistance(rgb, addRgb) <= 78;
}

function shiftAwayFromReservedBlue(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return GUILD_ACCENT_FALLBACK;
  const hsl = rgbToHsl(rgb);
  const shiftedHue = hsl.h < 226 ? hsl.h + 28 : hsl.h - 28;
  return normalizeAccent({ ...hsl, h: (shiftedHue + 360) % 360 });
}

function toPalette(candidates: string[]): GuildAccentPalette {
  const distinctCandidates = candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
  const safeCandidates = distinctCandidates.length ? distinctCandidates : [GUILD_ACCENT_FALLBACK];
  const accent =
    safeCandidates.find((candidate) => !isReservedBlueConflict(candidate)) ?? shiftAwayFromReservedBlue(safeCandidates[0]);
  return {
    accent,
    candidates: safeCandidates,
    source: distinctCandidates.length ? "image" : "fallback",
  };
}

function fallbackPalette(): GuildAccentPalette {
  return { accent: GUILD_ACCENT_FALLBACK, candidates: [GUILD_ACCENT_FALLBACK], source: "fallback" };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Guild emblem could not be loaded"));
    image.src = src;
  });
}

async function analyzeImage(src: string): Promise<GuildAccentPalette> {
  if (typeof document === "undefined") return fallbackPalette();

  try {
    const image = await loadImage(src);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return fallbackPalette();

    const scale = Math.min(1, MAX_SAMPLE_SIZE / Math.max(width, height));
    const sampleWidth = Math.max(1, Math.round(width * scale));
    const sampleHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallbackPalette();

    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
    const buckets = new Map<string, CandidateBucket>();

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
      const hsl = rgbToHsl(rgb);
      if (!isUsefulColor(hsl, alpha)) continue;

      const key = bucketKey(hsl);
      const weight = scoreColor(hsl, alpha);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.h += hsl.h * weight;
        bucket.s += hsl.s * weight;
        bucket.l += hsl.l * weight;
        bucket.weight += weight;
        bucket.count += 1;
      } else {
        buckets.set(key, {
          h: hsl.h * weight,
          s: hsl.s * weight,
          l: hsl.l * weight,
          weight,
          count: 1,
        });
      }
    }

    const candidates = [...buckets.values()]
      .sort((a, b) => b.weight * Math.log1p(b.count) - a.weight * Math.log1p(a.count))
      .slice(0, 5)
      .map((bucket) =>
        normalizeAccent({
          h: bucket.h / bucket.weight,
          s: bucket.s / bucket.weight,
          l: bucket.l / bucket.weight,
        }),
      );

    return toPalette(candidates);
  } catch {
    return fallbackPalette();
  }
}

export function getGuildAccentPalette(src: string | null | undefined): Promise<GuildAccentPalette> {
  const key = String(src ?? "").trim();
  if (!key) return Promise.resolve(fallbackPalette());
  const cached = paletteCache.get(key);
  if (cached) return cached;

  const pending = analyzeImage(key);
  paletteCache.set(key, pending);
  return pending;
}
