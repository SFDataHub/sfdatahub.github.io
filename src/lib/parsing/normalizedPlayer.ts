import {
  detectSfPlayerSaveLayout,
  hasSfSaveIndex,
  readSfPlayerSaveArray,
  readSfSaveByte,
  readSfSaveLowerShort,
  readSfSaveNumber,
  type SfPlayerSaveLayout,
} from "./playerSaveLayout";
import { normalizeSfPlayerItems, type NormalizedPlayerItems } from "./normalizedItem";
import {
  normalizeSfPlayerPets,
  normalizeSfPlayerPotions,
  type NormalizedPets,
  type NormalizedPotions,
} from "./normalizedConsumables";
import { calculateSfPlayerAttributes } from "./normalizedAttributes";
import { calculateSfPlayerRunes, type NormalizedPlayerRunes } from "./normalizedRunes";
import { calculateSfPlayerCombat, type NormalizedPlayerCombat } from "./normalizedCombat";
import { normalizeSfPlayerFortress, type NormalizedFortress } from "./normalizedFortress";
import { normalizeSfPlayerProgressionStatus, type NormalizedPlayerProgressionStatus } from "./normalizedProgressionStatus";
import { normalizeSfPlayerDungeons, type NormalizedDungeons } from "./normalizedDungeons";
import { normalizeSfPlayerResources, type NormalizedPlayerResources } from "./normalizedResources";
import { normalizeSfPlayerUnderworld, type NormalizedUnderworld } from "./normalizedUnderworld";
import { normalizeSfPlayerExtendedValues, type NormalizedExtendedPlayerValues } from "./normalizedExtendedPlayer";

export type NormalizedPlayerFieldStatus = "available" | "missing" | "unsupported" | "invalid";
export type NormalizedPlayerFieldProvenance = "raw" | "derived" | "calculated";

export type NormalizedPlayerFieldMetadata = {
  status: NormalizedPlayerFieldStatus;
  provenance?: NormalizedPlayerFieldProvenance;
};

export type NormalizedPlayerAttribute = {
  base: number | null;
  bonus: number | null;
  purchased: number | null;
  items: number | null;
  gems: number | null;
  itemsBase: number | null;
  upgrades: number | null;
  equipment: number | null;
  classBonus: number | null;
  potion: number | null;
  pet: number | null;
  total: number | null;
};

export type NormalizedPlayerGuildReference = {
  identifier: string | null;
  name: string | null;
  server: string | null;
};

export type NormalizedPlayer = {
  identity: {
    id: number | null;
    identifier: string | null;
    name: string | null;
    server: string | null;
    prefix: string | null;
    class: number | null;
    race: number | null;
    gender: "male" | "female" | null;
    own: boolean;
  };
  guild: NormalizedPlayerGuildReference;
  progression: {
    level: number | null;
    xp: number | null;
    xpNext: number | null;
    honor: number | null;
    rank: number | null;
  };
  attributes: {
    strength: NormalizedPlayerAttribute;
    dexterity: NormalizedPlayerAttribute;
    intelligence: NormalizedPlayerAttribute;
    constitution: NormalizedPlayerAttribute;
    luck: NormalizedPlayerAttribute;
  };
  combat: NormalizedPlayerCombat;
  dungeons: NormalizedDungeons;
  fortress: NormalizedFortress;
  resources: NormalizedPlayerResources;
  underworld: NormalizedUnderworld;
  progressionStatus: NormalizedPlayerProgressionStatus;
  extended: NormalizedExtendedPlayerValues;
  items?: NormalizedPlayerItems;
  potions?: NormalizedPotions;
  pets?: NormalizedPets;
  runes: NormalizedPlayerRunes;
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

const ATTRIBUTE_KEYS = ["strength", "dexterity", "intelligence", "constitution", "luck"] as const;

type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

type FieldReader = {
  read(saveArray: unknown[] | null, index: number): number | null;
};

const numberReader: FieldReader = {
  read: readSfSaveNumber,
};

const lowerShortReader: FieldReader = {
  read: readSfSaveLowerShort,
};

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

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

const parsePlayerIdFromIdentifier = (identifier: string | null): number | null => {
  const match = String(identifier ?? "").trim().match(/_p(\d+)$/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseServerFromGuildIdentifier = (identifier: string | null): string | null => {
  const match = String(identifier ?? "").trim().match(/^(.+)_g\d+$/i);
  return match?.[1] ? match[1] : null;
};

const createEmptyAttributes = (): NormalizedPlayer["attributes"] => ({
  strength: {
    base: null,
    bonus: null,
    purchased: null,
    items: null,
    gems: null,
    itemsBase: null,
    upgrades: null,
    equipment: null,
    classBonus: null,
    potion: null,
    pet: null,
    total: null,
  },
  dexterity: {
    base: null,
    bonus: null,
    purchased: null,
    items: null,
    gems: null,
    itemsBase: null,
    upgrades: null,
    equipment: null,
    classBonus: null,
    potion: null,
    pet: null,
    total: null,
  },
  intelligence: {
    base: null,
    bonus: null,
    purchased: null,
    items: null,
    gems: null,
    itemsBase: null,
    upgrades: null,
    equipment: null,
    classBonus: null,
    potion: null,
    pet: null,
    total: null,
  },
  constitution: {
    base: null,
    bonus: null,
    purchased: null,
    items: null,
    gems: null,
    itemsBase: null,
    upgrades: null,
    equipment: null,
    classBonus: null,
    potion: null,
    pet: null,
    total: null,
  },
  luck: {
    base: null,
    bonus: null,
    purchased: null,
    items: null,
    gems: null,
    itemsBase: null,
    upgrades: null,
    equipment: null,
    classBonus: null,
    potion: null,
    pet: null,
    total: null,
  },
});

const mark = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  path: string,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
};

const readField = (
  saveArray: unknown[] | null,
  index: number | null,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  reader: FieldReader = numberReader,
): number | null => {
  if (index == null) {
    mark(fields, path, "unsupported");
    return null;
  }

  if (!hasSfSaveIndex(saveArray, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = reader.read(saveArray, index);
  if (value == null) {
    mark(fields, path, "invalid");
    return null;
  }

  mark(fields, path, "available", "raw");
  return value;
};

const markStringField = (
  value: string | null,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
) => {
  mark(fields, path, value == null ? "missing" : "available", value == null ? undefined : "raw");
};

const genderFromByte = (value: number | null): "male" | "female" | null => {
  if (value == null) return null;
  return value === 1 || value === 2 ? "female" : "male";
};

const progressionIndexesByLayout: Record<
  Exclude<SfPlayerSaveLayout, "unknown">,
  { level: number; xp: number; xpNext: number; honor: number; rank: number }
> = {
  currentCompact: { level: 3, xp: 4, xpNext: 5, honor: 6, rank: 7 },
  legacyOwn: { level: 7, xp: 8, xpNext: 9, honor: 10, rank: 11 },
  legacyOther: { level: 2, xp: 3, xpNext: 4, honor: 5, rank: 6 },
};

const identityIndexesByLayout: Record<
  Exclude<SfPlayerSaveLayout, "unknown">,
  { id: number; class: number; race: number; gender: number }
> = {
  currentCompact: { id: 1, class: 20, race: 18, gender: 19 },
  legacyOwn: { id: 1, class: 29, race: 27, gender: 28 },
  legacyOther: { id: 0, class: 20, race: 18, gender: 19 },
};

const combatIndexesByLayout: Record<
  Exclude<SfPlayerSaveLayout, "unknown">,
  { armor: number; damageMin: number; damageMax: number }
> = {
  currentCompact: { armor: 23, damageMin: 24, damageMax: 25 },
  legacyOwn: { armor: 447, damageMin: 448, damageMax: 449 },
  legacyOther: { armor: 168, damageMin: 169, damageMax: 170 },
};

const attributeIndexesByLayout: Record<
  Exclude<SfPlayerSaveLayout, "unknown">,
  {
    baseStart: number;
    bonusStart: number;
    purchasedStart: number | null;
  }
> = {
  currentCompact: { baseStart: 30, bonusStart: 35, purchasedStart: 40 },
  legacyOwn: { baseStart: 30, bonusStart: 35, purchasedStart: 40 },
  legacyOther: { baseStart: 21, bonusStart: 26, purchasedStart: null },
};

export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const saveArray = readSfPlayerSaveArray(row);
  const layout = detectSfPlayerSaveLayout(row, saveArray);
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const indexes = layout === "unknown" ? null : identityIndexesByLayout[layout];

  const directIdentifier = toTrimmedString(row.identifier);
  const directName = toTrimmedString(row.name);
  const prefix = toTrimmedString(row.prefix);
  const guildIdentifier = toTrimmedString(row.guildIdentifier ?? row["Guild Identifier"] ?? row.groupIdentifier ?? row["Group Identifier"]);
  const guildName = toTrimmedString(row.guildName ?? row["Guild Name"] ?? row.groupName ?? row.groupname ?? row.group ?? row.Group);
  const guildServer = parseServerFromGuildIdentifier(guildIdentifier) ?? prefix;
  const directOwn = toFiniteNumberOrNull(row.own);
  const saveId = indexes ? readField(saveArray, indexes.id, "identity.id", fields) : null;
  const identifier = directIdentifier ?? (prefix && saveId != null ? `${prefix}_p${saveId}` : null);
  const identifierId = parsePlayerIdFromIdentifier(identifier);
  const id = saveId ?? identifierId;

  if (saveId == null && identifierId != null) {
    mark(fields, "identity.id", "available", "derived");
  } else if (layout === "unknown") {
    mark(fields, "identity.id", "unsupported");
  }

  markStringField(identifier, "identity.identifier", fields);
  markStringField(directName, "identity.name", fields);
  markStringField(prefix, "identity.server", fields);
  if (prefix != null) mark(fields, "identity.prefix", "available", "raw");
  else mark(fields, "identity.prefix", "missing");
  markStringField(guildIdentifier, "guild.identifier", fields);
  markStringField(guildName, "guild.name", fields);
  markStringField(guildServer, "guild.server", fields);

  const classId = indexes ? readField(saveArray, indexes.class, "identity.class", fields, lowerShortReader) : null;
  const race = indexes ? readField(saveArray, indexes.race, "identity.race", fields, lowerShortReader) : null;
  const genderByte = indexes ? readField(saveArray, indexes.gender, "identity.gender", fields, { read: readSfSaveByte }) : null;
  const gender = genderFromByte(genderByte);

  const progressionIndexes = layout === "unknown" ? null : progressionIndexesByLayout[layout];
  const progression = {
    level: readField(saveArray, progressionIndexes?.level ?? null, "progression.level", fields, lowerShortReader),
    xp: readField(saveArray, progressionIndexes?.xp ?? null, "progression.xp", fields),
    xpNext: readField(saveArray, progressionIndexes?.xpNext ?? null, "progression.xpNext", fields),
    honor: readField(saveArray, progressionIndexes?.honor ?? null, "progression.honor", fields),
    rank: readField(saveArray, progressionIndexes?.rank ?? null, "progression.rank", fields),
  };

  const rawAttributes = createEmptyAttributes();
  const attributeIndexes = layout === "unknown" ? null : attributeIndexesByLayout[layout];
  ATTRIBUTE_KEYS.forEach((attribute, attributeIndex) => {
    rawAttributes[attribute].base = readField(
      saveArray,
      attributeIndexes == null ? null : attributeIndexes.baseStart + attributeIndex,
      `attributes.${attribute}.base`,
      fields,
    );
    rawAttributes[attribute].bonus = readField(
      saveArray,
      attributeIndexes == null ? null : attributeIndexes.bonusStart + attributeIndex,
      `attributes.${attribute}.bonus`,
      fields,
    );
    rawAttributes[attribute].purchased = readField(
      saveArray,
      attributeIndexes?.purchasedStart == null ? null : attributeIndexes.purchasedStart + attributeIndex,
      `attributes.${attribute}.purchased`,
      fields,
    );
  });

  const combatIndexes = layout === "unknown" ? null : combatIndexesByLayout[layout];
  const sourceCombat = {
    armor: readField(saveArray, combatIndexes?.armor ?? null, "combat.source.armor", fields),
    damage: {
      min: readField(saveArray, combatIndexes?.damageMin ?? null, "combat.source.damage.min", fields),
      max: readField(saveArray, combatIndexes?.damageMax ?? null, "combat.source.damage.max", fields),
    },
  };
  const items = normalizeSfPlayerItems(row, { layout, saveArray, characterClass: classId });
  const potions = normalizeSfPlayerPotions(row, { layout, saveArray });
  const pets = normalizeSfPlayerPets(row, { layout });
  const dungeons = normalizeSfPlayerDungeons(row, { layout, saveArray });
  const fortress = normalizeSfPlayerFortress(row, { layout, saveArray });
  const resources = normalizeSfPlayerResources(row, { layout });
  const underworld = normalizeSfPlayerUnderworld(row, { layout });
  const progressionStatus = normalizeSfPlayerProgressionStatus(row, { layout, saveArray });
  const extended = normalizeSfPlayerExtendedValues(row, { layout, saveArray });
  const attributes = calculateSfPlayerAttributes(rawAttributes, {
    characterClass: classId,
    items,
    potions,
    pets,
    fields,
  });
  const runes = calculateSfPlayerRunes(items, { characterClass: classId });
  const combat = calculateSfPlayerCombat({
    characterClass: classId,
    level: progression.level,
    source: sourceCombat,
    attributes,
    items,
    potions,
    runes,
    fields,
  });

  return {
    identity: {
      id,
      identifier,
      name: directName,
      server: prefix,
      prefix,
      class: classId,
      race,
      gender,
      own: directOwn === 1,
    },
    guild: {
      identifier: guildIdentifier,
      name: guildName,
      server: guildServer,
    },
    progression,
    attributes,
    combat,
    dungeons,
    fortress,
    resources,
    underworld,
    progressionStatus,
    extended,
    ...(items ? { items } : {}),
    ...(potions ? { potions } : {}),
    ...(pets ? { pets } : {}),
    runes,
    metadata: {
      layout,
      fields,
    },
  };
};
