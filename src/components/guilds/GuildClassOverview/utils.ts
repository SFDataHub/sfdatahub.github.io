// src/components/guilds/GuildClassOverview/utils.ts
import type { ClassMeta, GuildClassOverviewProps, MemberClassRec } from "./types";
import type { GameClassKey, ClassMeta as ClassMetaSource } from "../../../data/classes";
import { toDriveThumbProxy } from "../../../lib/urls";

/** Einheitliche Icon-Zielgröße für das Grid */
export const ICON_SIZE = 56;

/** Prozent hübsch formatieren */
export function formatPct(n: number | undefined | null): string {
  if (n == null || !isFinite(n)) return "0.0%";
  return `${Math.round(n * 10) / 10}%`;
}

/** Ganzzahl hübsch formatieren */
export function formatCount(n: number | undefined | null): string {
  if (n == null || !isFinite(n)) return "0";
  return `${Math.round(n)}`;
}

const toNum = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const strip = (s?: string | null) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Ist die URL eine Google-Drive-Ansicht? */
function isDriveViewUrl(u?: string): boolean {
  if (!u) return false;
  return /drive\.google\.com/.test(u);
}

/** Nutze exakt die Searchbar-Logik: Drive-URL -> proxied Thumbnail */
function toProxyIfDrive(url?: string, size = ICON_SIZE): string | undefined {
  if (!url) return undefined;
  return isDriveViewUrl(url) ? toDriveThumbProxy(url, size) : url;
}

/** Normalisiert String → kanonischer Klassen-Key (Bindestrich-Form) */
export function canonClassKey(raw: any): GameClassKey | null {
  if (raw == null) return null;

  // Normalize: Leer/Unterstrich -> Bindestrich, diakritikfrei, lower
  let s = String(raw)
    .trim()
    .normalize("NFD")
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  const map: Record<string, GameClassKey> = {
    "warrior": "warrior",
    "mage": "mage",
    "scout": "scout",
    "assassin": "assassin",
    "demon-hunter": "demon-hunter",
    "berserker": "berserker",
    "battle-mage": "battle-mage",
    "druid": "druid",
    "bard": "bard",
    "necromancer": "necromancer",
    "paladin": "paladin",

    // populäre Varianten/Aliasse
    "demonhunter": "demon-hunter",
    "battlemage": "battle-mage",
    "dh": "demon-hunter",
    "bm": "battle-mage",
    "war": "warrior",
    "wiz": "mage",
    "necro": "necromancer",
    "pala": "paladin",

    // DE
    "krieger": "warrior",
    "magier": "mage",
    "jaeger": "scout",
    "jäger": "scout",
    "meuchelmoerder": "assassin",
    "meuchelmörder": "assassin",
    "dämonenjäger": "demon-hunter",
    "daemonenjaeger": "demon-hunter",
    "zerker": "berserker",
    "kampfmagier": "battle-mage",
    "druide": "druid",
    "barde": "bard",
    "nekromant": "necromancer",
  };

  if (map[s]) return map[s];
  if (s.includes("demon") && s.includes("hunter")) return "demon-hunter";
  if (s.includes("battle") && s.includes("mage")) return "battle-mage";
  return null;
}

/** Adaptiert Eingabe-Stammdaten zu interner Form (unterstützt deine CLASSES-Struktur) */
export function adaptClassMeta(input: any): ClassMeta | null {
  if (!input) return null;

  // Deine Quelle: { key, label, iconUrl, fallback }
  const fromSource = input as ClassMetaSource;
  const fromGeneric = input as ClassMeta;

  const id = (fromSource as any).key ?? (fromGeneric as any).id;
  const name = (fromSource as any).label ?? (fromGeneric as any).name;
  const rawCrest = (fromGeneric as any).crestUrl ?? (fromSource as any).iconUrl ?? (fromGeneric as any).iconUrl;
  const rawIcon  = (fromSource as any).iconUrl ?? (fromGeneric as any).iconUrl;
  const fallback = (fromSource as any).fallback ?? (fromGeneric as any).fallback;

  if (!id || !name) return null;

  // WICHTIG: exakt wie in der Searchbar → proxied Drive-Thumb verwenden
  const crestUrl = toProxyIfDrive(rawCrest, ICON_SIZE);
  const iconUrl  = toProxyIfDrive(rawIcon,  ICON_SIZE);

  return {
    id: id as GameClassKey,
    name: String(name),
    crestUrl: crestUrl || iconUrl, // bevorzugt crestUrl
    iconUrl: iconUrl || crestUrl,
    fallback: fallback ? String(fallback) : undefined,
  };
}

/** Aggregationen aus Mitgliederdaten erzeugen */
export function normalizeData(
  data: GuildClassOverviewProps["data"],
  classMeta: ClassMeta[]
): {
  counts: Record<GameClassKey, number>;
  shares: Record<GameClassKey, number>;
  avg: Record<GameClassKey, number | null>;
  top: Record<GameClassKey, { id?: string; name?: string | null; level?: number | null } | null>;
} {
  const counts = {} as Record<GameClassKey, number>;
  const sums = {} as Record<GameClassKey, number>;
  const nLevels = {} as Record<GameClassKey, number>;
  const top = {} as Record<GameClassKey, { id?: string; name?: string | null; level?: number | null } | null>;

  const keys = classMeta.map((c) => c.id);
  for (const k of keys) {
    counts[k] = 0;
    sums[k] = 0;
    nLevels[k] = 0;
    top[k] = null;
  }

  for (const m of (Array.isArray(data) ? data : []) as MemberClassRec[]) {
    const raw =
      m.classId ??
      m.class ??
      m.klass ??
      m.playerClass ??
      m.cls ??
      m.values?.Class ??
      m.values?.class ??
      m.values?.Klasse ??
      m.values?.klasse;

    const key = canonClassKey(raw);
    if (!key) continue;
    if (!(keys as string[]).includes(key)) continue;

    counts[key] += 1;

    const lvl = toNum(m.level ?? m.values?.Level ?? m.values?.level);
    if (lvl != null) {
      sums[key] += lvl;
      nLevels[key] += 1;
      if (!top[key] || (top[key]?.level ?? -Infinity) < lvl) {
        top[key] = { id: m.id, name: m.name ?? m.values?.Name ?? null, level: lvl };
      }
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const shares = {} as Record<GameClassKey, number>;
  const avg = {} as Record<GameClassKey, number | null>;
  (keys as GameClassKey[]).forEach((k) => {
    shares[k] = total > 0 ? (counts[k] / total) * 100 : 0;
    avg[k] = nLevels[k] > 0 ? sums[k] / nLevels[k] : null;
  });

  return { counts, shares, avg, top };
}
