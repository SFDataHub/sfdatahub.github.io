import { getClassMetaById } from "../../data/classes";
import type { LocalBaseStatValues, LocalPlayerProfileModel, LocalPotionSlot } from "../../components/local-player-profile/types";
import { createPortraitOptionsFromSaveArray } from "../../lib/portraitFromSave";
import { readSfPlayerSaveArray } from "../../lib/parsing/playerSaveLayout";
import { normalizeSfPlayerCharacterCore, type NormalizedPlayer } from "../../lib/parsing/normalizedPlayer";
import { normalizeSfPlayerPotions } from "../../lib/parsing/normalizedConsumables";
import { readSfPlayerStats } from "../../lib/parsing/parseSfJson";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import type { NormalizedGuildRole } from "../../lib/guilds/guildScanNormalizer";

type JsonRecord = Record<string, unknown>;

export type LocalPlayerProfileAdapterInput = {
  rawPlayer: unknown;
  sourceScanId: string;
  sourcePlayerKey: string;
  scannedAtMs: number;
  scannedAtIso: string | null;
  guild: {
    name: string | null;
    server: string | null;
    hofRank?: number | null;
  };
  guildRole?: NormalizedGuildRole;
};

const ATTRIBUTE_KEYS = ["str", "dex", "int", "con", "lck"] as const;
const NORMALIZED_ATTRIBUTE_KEYS = ["strength", "dexterity", "intelligence", "constitution", "luck"] as const;

const RACE_LABEL_BY_ID: Record<number, string> = {
  1: "Human",
  2: "Elf",
  3: "Dwarf",
  4: "Gnome",
  5: "Orc",
  6: "Dark Elf",
  7: "Goblin",
  8: "Demon",
};

const ROLE_LABELS: Record<Exclude<NormalizedGuildRole, null>, string> = {
  leader: "Leader",
  officer: "Officer",
  member: "Member",
};

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const canonicalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const pickValue = (record: JsonRecord | null, keys: string[]) => {
  if (!record) return undefined;
  const sources = [record, asRecord(record.values), asRecord(record.latest), asRecord(asRecord(record.latest)?.values)].filter(
    (entry): entry is JsonRecord => Boolean(entry),
  );

  for (const source of sources) {
    const canonical = new Map<string, unknown>();
    Object.entries(source).forEach(([key, value]) => canonical.set(canonicalizeKey(key), value));
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
      const resolved = canonical.get(canonicalizeKey(key));
      if (resolved != null) return resolved;
    }
  }
  return undefined;
};

const readString = (record: JsonRecord | null, keys: string[]) => {
  const value = pickValue(record, keys);
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
};

const readNumber = (record: JsonRecord | null, keys: string[]) => toNumber(pickValue(record, keys));

const toNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const parsed = Number(normalized.replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNumber = (value?: number | null, fallback = "-") =>
  value == null || !Number.isFinite(value) ? fallback : value.toLocaleString("de-DE");

const formatPercentFromRatio = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${(value * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })}%`;
};

const formatDaysAgo = (days?: number | null) => {
  if (days == null || !Number.isFinite(days)) return undefined;
  if (days <= 0) return "heute";
  return `${days} Tag${days === 1 ? "" : "e"} her`;
};

const daysSinceMs = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
};

const sumKnown = (values: Array<number | null | undefined>, minKnown = values.length) => {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return known.length >= minKnown ? known.reduce((sum, value) => sum + value, 0) : null;
};

const toNumberArray = (value: unknown[] | null): number[] | null =>
  value && value.length ? value.map((entry) => toNumber(entry) ?? 0) : null;

const safeNormalizePlayer = (rawPlayer: unknown): NormalizedPlayer | null => {
  try {
    return normalizeSfPlayerCharacterCore(rawPlayer);
  } catch (error) {
    console.error("[localPlayerProfileAdapter] failed to normalize local player", error);
    return null;
  }
};

const buildBaseStats = (normalized: NormalizedPlayer | null): LocalBaseStatValues | undefined => {
  if (!normalized) return undefined;
  const values = NORMALIZED_ATTRIBUTE_KEYS.map((key) => normalized.attributes[key].base);
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;
  return Object.fromEntries(ATTRIBUTE_KEYS.map((key, index) => [key, values[index] ?? 0])) as LocalBaseStatValues;
};

const buildTotalStats = (normalized: NormalizedPlayer | null): LocalBaseStatValues | undefined => {
  if (!normalized) return undefined;
  const values = NORMALIZED_ATTRIBUTE_KEYS.map((key) => normalized.attributes[key].total);
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;
  return Object.fromEntries(ATTRIBUTE_KEYS.map((key, index) => [key, values[index] ?? 0])) as LocalBaseStatValues;
};

const buildPotionSlots = (rawPlayer: unknown): LocalPotionSlot[] => {
  const normalized = normalizeSfPlayerPotions(rawPlayer);
  const bySlot = new Map<number, LocalPotionSlot>();

  normalized?.slots.forEach((slot) => {
    bySlot.set(slot.slot + 1, {
      slot: (slot.slot + 1) as 1 | 2 | 3,
      type: slot.attribute,
      size: slot.size,
    });
  });

  return [1, 2, 3].map((slot) => bySlot.get(slot) ?? { slot: slot as 1 | 2 | 3, type: null, size: null });
};

const resolveClassName = (raw: JsonRecord | null, normalized: NormalizedPlayer | null) => {
  const classId =
    normalized?.identity.class ??
    toNumber(readSfPlayerStats(raw ?? {}).classId) ??
    readNumber(raw, ["classId", "Class ID", "class", "Class"]);
  const classMeta = getClassMetaById(classId);
  return (
    classMeta?.label ??
    readString(raw, ["className", "Class Name", "class", "Class"]) ??
    (classId != null ? String(classId) : null)
  );
};

export function buildLocalPlayerProfileModel(input: LocalPlayerProfileAdapterInput): LocalPlayerProfileModel {
  const raw = asRecord(input.rawPlayer);
  const normalized = safeNormalizePlayer(input.rawPlayer);
  const stats = readSfPlayerStats(input.rawPlayer);
  const saveArray = toNumberArray(raw ? readSfPlayerSaveArray(raw) : null);
  const portrait = saveArray
    ? createPortraitOptionsFromSaveArray(saveArray, {
        own: raw?.own,
        saveVersion: raw?.saveVersion,
        save: saveArray,
      })
    : undefined;

  const className = resolveClassName(raw, normalized);
  const playerName =
    normalized?.identity.name ??
    readString(raw, ["name", "Name", "playerName", "Player Name"]) ??
    input.sourcePlayerKey;
  const server =
    normalizeServerKeyFromInput(normalized?.identity.server ?? readString(raw, ["server", "Server", "prefix", "world", "realm"])) ??
    input.guild.server;
  const guildName = normalized?.guild.name ?? readString(raw, ["guildName", "Guild Name", "groupname", "groupName", "guild", "Guild"]) ?? input.guild.name;
  const level = normalized?.progression.level ?? stats.level ?? readNumber(raw, ["level", "Level"]);
  const honor = normalized?.progression.honor ?? readNumber(raw, ["honor", "Honor", "honour", "Honour", "arenaHonor", "Ehre"]);
  const hofRank =
    normalized?.progression.rank ??
    readNumber(raw, ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank"]) ??
    input.guild.hofRank ??
    null;
  const baseStats = buildBaseStats(normalized);
  const totalStats = buildTotalStats(normalized);
  const totalBaseStats = baseStats ? sumKnown(Object.values(baseStats)) : stats.baseStats;
  const totalStatsValue = totalStats ? sumKnown(Object.values(totalStats)) : stats.totalStats;
  const scrapbook = normalized?.progressionStatus.scrapbook ?? null;
  const scrapbookRatio = scrapbook?.percentage ?? null;
  const mountPercent =
    normalized?.progressionStatus.mount.bonus ??
    readNumber(raw, ["Mount", "Mount %", "mount", "mountPct", "mountBonus", "MountBonus"]);
  const mountLabel = mountPercent != null ? `${Math.round(mountPercent)}%` : "-";
  const mountRace = normalized?.identity.race != null ? RACE_LABEL_BY_ID[normalized.identity.race] ?? null : null;
  const scanAgeDays = daysSinceMs(input.scannedAtMs);
  const scanAtLabel = formatScanDateTimeLabel(input.scannedAtIso ?? input.scannedAtMs);
  const xp = normalized?.progression.xp ?? readNumber(raw, ["xp", "XP"]);
  const xpNext = normalized?.progression.xpNext ?? readNumber(raw, ["xpNext", "XP Required", "XP Required"]);
  const levelProgress = xp != null && xpNext != null && xpNext > 0 ? Math.min(1, Math.max(0, xp / xpNext)) : 0;
  const roleLabel = input.guildRole ? ROLE_LABELS[input.guildRole] : readString(raw, ["guildRole", "role", "guildRank", "Gildenrolle"]);

  return {
    sourceScanId: input.sourceScanId,
    sourcePlayerKey: input.sourcePlayerKey,
    hero: {
      playerName,
      className,
      guild: guildName,
      server,
      levelLabel: level != null ? `Level ${formatNumber(level)}` : undefined,
      lastScanLabel: formatDaysAgo(scanAgeDays),
      lastScanAtLabel: scanAtLabel === "-" || scanAtLabel === "—" ? undefined : scanAtLabel,
      lastScanDays: scanAgeDays,
      metrics: [
        { label: "Mount", value: mountLabel },
        {
          label: "Level",
          value: level != null ? `Lvl ${formatNumber(level)}` : "Lvl -",
          gauge: {
            progress: levelProgress,
            centerTop: level != null ? `Lvl ${formatNumber(level)}` : "Lvl -",
            centerBottom: `${Math.round(levelProgress * 100)}%`,
            details: [`XP: ${formatNumber(xp)}`, `XP Required: ${formatNumber(xpNext)}`],
          },
        },
        {
          label: "Scrapbook",
          value: formatPercentFromRatio(scrapbookRatio),
          gauge: {
            progress: scrapbookRatio ?? 0,
            centerTop: formatPercentFromRatio(scrapbookRatio),
            centerBottom:
              scrapbook?.count != null ? `${formatNumber(scrapbook.count)} / ${formatNumber(scrapbook.maximum)}` : "-",
            details:
              scrapbook?.count != null
                ? [`${formatNumber(scrapbook.count)} / ${formatNumber(scrapbook.maximum)}`]
                : ["-"],
          },
        },
        { label: "Total Base Stats", value: formatNumber(totalBaseStats) },
      ],
      badges: [
        { label: "Honor", value: formatNumber(honor), tone: "success" },
        { label: "Gildenrolle", value: roleLabel ?? "-", tone: "warning" },
        { label: "HoF", value: hofRank != null ? `#${formatNumber(hofRank)}` : "-", tone: "neutral" },
      ],
      actions: [
        { key: "open-player", label: "Spielerprofil öffnen" },
        { key: "open-guild", label: "Gilde öffnen" },
        { key: "share", label: "Teilen" },
        { key: "copy-link", label: "Link kopieren" },
      ],
      portrait,
      hasPortrait: Boolean(portrait),
      portraitFallbackLabel: className ? `Klassenbild ${className}` : "Portrait-Platzhalter",
      baseStats,
      totalStats,
      totalStatsValue,
      mountRace,
      mountPercentValue: mountPercent,
      potionsSlots: buildPotionSlots(input.rawPlayer),
    },
  };
}
