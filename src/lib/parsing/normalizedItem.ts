import { detectSfPlayerSaveLayout, readSfPlayerSaveArray, readSfSaveLowerShort, type SfPlayerSaveLayout } from "./playerSaveLayout";

export type NormalizedItemFieldStatus = "available" | "missing" | "unsupported" | "invalid";
export type NormalizedItemFieldProvenance = "raw" | "derived" | "calculated";

export type NormalizedItemFieldMetadata = {
  status: NormalizedItemFieldStatus;
  provenance?: NormalizedItemFieldProvenance;
};

export type NormalizedItemFormat = "modern19" | "legacy12";
export type NormalizedEquipmentSlotKey =
  | "head"
  | "body"
  | "hand"
  | "feet"
  | "neck"
  | "belt"
  | "ring"
  | "misc"
  | "weapon1"
  | "weapon2";

export type NormalizedItemAttributeName =
  | "strength"
  | "dexterity"
  | "intelligence"
  | "constitution"
  | "luck"
  | "all"
  | "strengthConstitutionLuck"
  | "dexterityConstitutionLuck"
  | "intelligenceConstitutionLuck"
  | "unknown";

export type NormalizedItemRuneKind =
  | "gold"
  | "epicChance"
  | "itemQuality"
  | "xp"
  | "health"
  | "resistanceFire"
  | "resistanceCold"
  | "resistanceLightning"
  | "resistanceAll"
  | "damageFire"
  | "damageCold"
  | "damageLightning"
  | "unknown";

export type NormalizedItemAttribute = {
  slot: 1 | 2 | 3;
  typeId: number;
  type: NormalizedItemAttributeName;
  value: number;
  affectedAttributes: Array<"strength" | "dexterity" | "intelligence" | "constitution" | "luck">;
};

export type NormalizedItem = {
  format: NormalizedItemFormat;
  slot: NormalizedEquipmentSlotKey | null;
  slotIndex: number;
  inventoryType: number;
  type: number | null;
  class: number | null;
  picIndex: number | null;
  index: number | null;
  isEpic: boolean | null;
  armor: number | null;
  damage: {
    min: number | null;
    max: number | null;
  } | null;
  attributes: NormalizedItemAttribute[];
  socket: {
    hasSocket: boolean | null;
    hasGem: boolean | null;
    gemType: number | null;
    gemValue: number | null;
  };
  rune: {
    hasRune: boolean | null;
    type: number | null;
    kind: NormalizedItemRuneKind | null;
    value: number | null;
  };
  enchantment: {
    hasEnchantment: boolean | null;
    type: number | null;
  };
  upgrades: number | null;
  upgradeMultiplier: number | null;
  itemLevel: number | null;
  sellPrice: {
    gold: number | null;
    mushrooms: number | null;
  };
  metadata: {
    fields: Record<string, NormalizedItemFieldMetadata>;
  };
};

export type NormalizedEquipment = {
  source: "equippedItems" | "save";
  format: NormalizedItemFormat;
  slots: Partial<Record<NormalizedEquipmentSlotKey, NormalizedItem>>;
  metadata: {
    fields: Record<string, NormalizedItemFieldMetadata>;
  };
};

export type NormalizedPlayerItems = {
  equipped?: NormalizedEquipment;
};

const MODERN_ITEM_SIZE = 19;
const LEGACY_ITEM_SIZE = 12;
const LEGACY_EQUIPPED_SAVE_START = 48;
const EQUIPPED_SLOT_KEYS: NormalizedEquipmentSlotKey[] = [
  "head",
  "body",
  "hand",
  "feet",
  "neck",
  "belt",
  "ring",
  "misc",
  "weapon1",
  "weapon2",
];
const WARRIOR_CLASS = 1;
const ASSASSIN_CLASS = 4;

type RawItemValues = {
  type: number | null;
  socket: number | null;
  enchantmentType: number | null;
  picIndex: number | null;
  damageMin: number | null;
  damageMax: number | null;
  attributeTypes: Array<number | null>;
  attributeValues: Array<number | null>;
  gold: number | null;
  coins: number | null;
  upgradeLevel: number | null;
  socketPower: number | null;
  itemLevel: number | null;
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

export const normalizeSfItemRuneKind = (type: number | null): NormalizedItemRuneKind | null => {
  if (type == null) return null;
  if (type === 1) return "gold";
  if (type === 2) return "epicChance";
  if (type === 3) return "itemQuality";
  if (type === 4) return "xp";
  if (type === 5) return "health";
  if (type === 6) return "resistanceFire";
  if (type === 7) return "resistanceCold";
  if (type === 8) return "resistanceLightning";
  if (type === 9) return "resistanceAll";
  if (type === 10) return "damageFire";
  if (type === 11) return "damageCold";
  if (type === 12) return "damageLightning";
  return "unknown";
};

const mark = (
  fields: Record<string, NormalizedItemFieldMetadata>,
  path: string,
  status: NormalizedItemFieldStatus,
  provenance?: NormalizedItemFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
};

const hasArrayIndex = (values: unknown[] | null, index: number) =>
  Boolean(values && index >= 0 && index < values.length && Object.prototype.hasOwnProperty.call(values, index));

const readModernField = (
  values: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedItemFieldMetadata>,
): number | null => {
  if (!hasArrayIndex(values, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(values?.[index]);
  if (value == null) {
    mark(fields, path, "invalid");
    return null;
  }

  mark(fields, path, "available", "raw");
  return value;
};

const readLegacyWord = (
  values: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedItemFieldMetadata>,
): number | null => readModernField(values, index, path, fields);

const readLegacyShort = (
  values: unknown[] | null,
  index: number,
  byteOffset: 0 | 2,
  path: string,
  fields: Record<string, NormalizedItemFieldMetadata>,
): number | null => {
  const word = readLegacyWord(values, index, path, fields);
  return word == null ? null : (word >> (byteOffset * 8)) & 0xffff;
};

const readLegacyByte = (
  values: unknown[] | null,
  index: number,
  byteOffset: 0 | 1 | 2 | 3,
  path: string,
  fields: Record<string, NormalizedItemFieldMetadata>,
): number | null => {
  const word = readLegacyWord(values, index, path, fields);
  return word == null ? null : (word >> (byteOffset * 8)) & 0xff;
};

const decodeModernValues = (
  values: unknown[] | null,
  fields: Record<string, NormalizedItemFieldMetadata>,
): RawItemValues => ({
  type: readModernField(values, 0, "type", fields),
  socket: readModernField(values, 1, "socket.raw", fields),
  enchantmentType: readModernField(values, 2, "enchantment.type", fields),
  picIndex: readModernField(values, 3, "picIndex", fields),
  damageMin: readModernField(values, 5, "damage.minOrArmor", fields),
  damageMax: readModernField(values, 6, "damage.max", fields),
  attributeTypes: [
    readModernField(values, 7, "attributes.1.type", fields),
    readModernField(values, 8, "attributes.2.type", fields),
    readModernField(values, 9, "attributes.3.type", fields),
  ],
  attributeValues: [
    readModernField(values, 10, "attributes.1.value", fields),
    readModernField(values, 11, "attributes.2.value", fields),
    readModernField(values, 12, "attributes.3.value", fields),
  ],
  gold: readModernField(values, 13, "sellPrice.goldRaw", fields),
  coins: readModernField(values, 14, "sellPrice.mushrooms", fields),
  upgradeLevel: readModernField(values, 15, "upgrades", fields),
  socketPower: readModernField(values, 16, "socket.gemValue", fields),
  itemLevel: readModernField(values, 17, "itemLevel", fields),
});

const decodeLegacyValues = (
  values: unknown[] | null,
  fields: Record<string, NormalizedItemFieldMetadata>,
): RawItemValues => ({
  type: readLegacyShort(values, 0, 0, "type", fields),
  socket: readLegacyByte(values, 0, 2, "socket.raw", fields),
  enchantmentType: readLegacyByte(values, 0, 3, "enchantment.type", fields),
  picIndex: readLegacyShort(values, 1, 0, "picIndex", fields),
  damageMin: readLegacyWord(values, 2, "damage.minOrArmor", fields),
  damageMax: readLegacyWord(values, 3, "damage.max", fields),
  attributeTypes: [
    readLegacyWord(values, 4, "attributes.1.type", fields),
    readLegacyWord(values, 5, "attributes.2.type", fields),
    readLegacyWord(values, 6, "attributes.3.type", fields),
  ],
  attributeValues: [
    readLegacyWord(values, 7, "attributes.1.value", fields),
    readLegacyWord(values, 8, "attributes.2.value", fields),
    readLegacyWord(values, 9, "attributes.3.value", fields),
  ],
  gold: readLegacyWord(values, 10, "sellPrice.goldRaw", fields),
  coins: readLegacyByte(values, 11, 0, "sellPrice.mushrooms", fields),
  upgradeLevel: readLegacyByte(values, 11, 1, "upgrades", fields),
  socketPower: readLegacyShort(values, 11, 2, "socket.gemValue", fields),
  itemLevel: null,
});

const attributeInfo = (
  typeId: number,
): Pick<NormalizedItemAttribute, "type" | "affectedAttributes"> => {
  if (typeId === 1) return { type: "strength", affectedAttributes: ["strength"] };
  if (typeId === 2) return { type: "dexterity", affectedAttributes: ["dexterity"] };
  if (typeId === 3) return { type: "intelligence", affectedAttributes: ["intelligence"] };
  if (typeId === 4) return { type: "constitution", affectedAttributes: ["constitution"] };
  if (typeId === 5) return { type: "luck", affectedAttributes: ["luck"] };
  if (typeId === 6) {
    return {
      type: "all",
      affectedAttributes: ["strength", "dexterity", "intelligence", "constitution", "luck"],
    };
  }
  if (typeId === 21) {
    return { type: "strengthConstitutionLuck", affectedAttributes: ["strength", "constitution", "luck"] };
  }
  if (typeId === 22) {
    return { type: "dexterityConstitutionLuck", affectedAttributes: ["dexterity", "constitution", "luck"] };
  }
  if (typeId === 23) {
    return { type: "intelligenceConstitutionLuck", affectedAttributes: ["intelligence", "constitution", "luck"] };
  }
  return { type: "unknown", affectedAttributes: [] };
};

const normalizeAttributes = (rawTypes: Array<number | null>, rawValues: Array<number | null>): NormalizedItemAttribute[] => {
  const attributeTypes = [...rawTypes];
  const attributeValues = [...rawValues];

  if (attributeTypes[1] === 4 && attributeTypes[2] === 5 && attributeTypes[0] != null) {
    attributeTypes[0] = 20 + attributeTypes[0];
    attributeTypes[1] = 0;
    attributeTypes[2] = 0;
    attributeValues[1] = 0;
    attributeValues[2] = 0;
  }

  return attributeTypes.flatMap((typeId, index) => {
    const value = attributeValues[index];
    if (typeId == null || value == null || typeId <= 0 || typeId > 30 || value === 0) return [];

    return [
      {
        slot: (index + 1) as 1 | 2 | 3,
        typeId,
        ...attributeInfo(typeId),
        value,
      },
    ];
  });
};

const normalizeRawItem = (
  format: NormalizedItemFormat,
  values: unknown[] | null,
  slot: NormalizedEquipmentSlotKey | null,
  slotIndex: number,
  inventoryType: number,
): NormalizedItem => {
  const fields: Record<string, NormalizedItemFieldMetadata> = {};
  const raw = format === "modern19" ? decodeModernValues(values, fields) : decodeLegacyValues(values, fields);
  const attributeTypes = [...raw.attributeTypes];
  const attributeValues = [...raw.attributeValues];

  if (attributeTypes[1] === 4 && attributeTypes[2] === 5 && attributeTypes[0] != null) {
    attributeTypes[0] = 20 + attributeTypes[0];
    attributeTypes[1] = 0;
    attributeTypes[2] = 0;
    attributeValues[1] = 0;
    attributeValues[2] = 0;
  }

  const itemClass = raw.picIndex == null ? null : Math.trunc(raw.picIndex / 1000) + 1;
  const itemIndex = raw.picIndex == null ? null : raw.picIndex % 1000;
  const isWeapon = raw.type === 1;
  const hasRune = attributeTypes[2] == null ? null : attributeTypes[2] > 30;
  const runeType = hasRune ? Math.max(0, (attributeTypes[2] ?? 0) - 30) : null;
  const runeKind = normalizeSfItemRuneKind(runeType);
  const runeValue = hasRune ? attributeValues[2] : null;
  const hasSocket = raw.socket == null ? null : raw.socket > 0;
  const hasGem = raw.socket == null ? null : raw.socket > 1;
  const gemType = raw.socket != null && raw.socket >= 10 ? 1 + (raw.socket % 10) : null;
  const hasEnchantment = raw.enchantmentType == null ? null : raw.enchantmentType > 0;

  if (format === "legacy12") {
    mark(fields, "itemLevel", "unsupported");
  }

  mark(fields, "class", itemClass == null ? "invalid" : "available", itemClass == null ? undefined : "derived");
  mark(fields, "index", itemIndex == null ? "invalid" : "available", itemIndex == null ? undefined : "derived");
  mark(fields, "isEpic", raw.type == null || itemIndex == null ? "invalid" : "available", "derived");
  mark(fields, "socket.hasSocket", hasSocket == null ? "invalid" : "available", hasSocket == null ? undefined : "derived");
  mark(fields, "socket.hasGem", hasGem == null ? "invalid" : "available", hasGem == null ? undefined : "derived");
  mark(fields, "socket.gemType", gemType == null ? "missing" : "available", gemType == null ? undefined : "derived");
  mark(fields, "rune.hasRune", hasRune == null ? "invalid" : "available", hasRune == null ? undefined : "derived");
  mark(fields, "rune.type", runeType == null ? "missing" : "available", runeType == null ? undefined : "derived");
  mark(
    fields,
    "rune.kind",
    runeKind == null ? "missing" : runeKind === "unknown" ? "invalid" : "available",
    runeKind == null ? undefined : "derived",
  );
  mark(
    fields,
    "rune.value",
    runeValue == null ? fields["attributes.3.value"]?.status ?? "missing" : "available",
    runeValue == null ? undefined : "raw",
  );
  mark(
    fields,
    "upgradeMultiplier",
    raw.upgradeLevel == null ? "invalid" : "available",
    raw.upgradeLevel == null ? undefined : "calculated",
  );
  mark(
    fields,
    "enchantment.hasEnchantment",
    hasEnchantment == null ? "invalid" : "available",
    hasEnchantment == null ? undefined : "derived",
  );

  return {
    format,
    slot,
    slotIndex,
    inventoryType,
    type: raw.type,
    class: itemClass,
    picIndex: raw.picIndex,
    index: itemIndex,
    isEpic: raw.type == null || itemIndex == null ? null : raw.type < 11 && itemIndex >= 50,
    armor: raw.type != null && raw.type > 1 ? raw.damageMin : null,
    damage: isWeapon ? { min: raw.damageMin, max: raw.damageMax } : null,
    attributes: normalizeAttributes(raw.attributeTypes, raw.attributeValues),
    socket: {
      hasSocket,
      hasGem,
      gemType,
      gemValue: hasGem ? raw.socketPower : null,
    },
    rune: {
      hasRune,
      type: runeType,
      kind: runeKind,
      value: runeValue,
    },
    enchantment: {
      hasEnchantment,
      type: raw.enchantmentType,
    },
    upgrades: raw.upgradeLevel,
    upgradeMultiplier: raw.upgradeLevel == null ? null : Math.pow(1.03, raw.upgradeLevel),
    itemLevel: raw.itemLevel,
    sellPrice: {
      gold: raw.gold == null ? null : raw.gold / 100,
      mushrooms: raw.coins,
    },
    metadata: {
      fields,
    },
  };
};

export const normalizeSfItem = (
  format: NormalizedItemFormat,
  values: unknown[] | null,
  options: {
    slot?: NormalizedEquipmentSlotKey | null;
    slotIndex?: number;
    inventoryType?: number;
  } = {},
): NormalizedItem =>
  normalizeRawItem(format, values, options.slot ?? null, options.slotIndex ?? 0, options.inventoryType ?? 0);

const readArrayField = (row: Record<string, unknown>, key: string): unknown[] | null =>
  Array.isArray(row[key]) ? (row[key] as unknown[]) : null;

const readChunk = (values: unknown[] | null, start: number, size: number): unknown[] | null =>
  values == null ? null : values.slice(start, start + size);

const canUseWeapon2 = (characterClass: number | null): boolean =>
  characterClass == null || characterClass === WARRIOR_CLASS || characterClass === ASSASSIN_CLASS;

const readCharacterClass = (layout: SfPlayerSaveLayout, saveArray: unknown[] | null): number | null => {
  if (layout === "currentCompact" || layout === "legacyOther") return readSfSaveLowerShort(saveArray, 20);
  if (layout === "legacyOwn") return readSfSaveLowerShort(saveArray, 29);
  return null;
};

const normalizeEquipmentFromValues = (
  values: unknown[] | null,
  format: NormalizedItemFormat,
  source: NormalizedEquipment["source"],
  characterClass: number | null,
): NormalizedEquipment => {
  const fields: Record<string, NormalizedItemFieldMetadata> = {};
  const size = format === "modern19" ? MODERN_ITEM_SIZE : LEGACY_ITEM_SIZE;
  const slots: Partial<Record<NormalizedEquipmentSlotKey, NormalizedItem>> = {};

  EQUIPPED_SLOT_KEYS.forEach((slot, index) => {
    const start = index * size;
    const slotPath = `slots.${slot}`;
    const supported = slot !== "weapon2" || canUseWeapon2(characterClass);

    if (!supported) {
      mark(fields, slotPath, "unsupported");
      return;
    }

    if (!values || start + size > values.length) {
      mark(fields, slotPath, "missing");
      return;
    }

    const item = normalizeRawItem(format, readChunk(values, start, size), slot, index + 1, 1);
    if ((item.type ?? 0) > 0) {
      slots[slot] = item;
      mark(fields, slotPath, "available", "raw");
    } else {
      mark(fields, slotPath, "missing");
    }
  });

  return {
    source,
    format,
    slots,
    metadata: {
      fields,
    },
  };
};

export const normalizeSfPlayerItems = (
  player: unknown,
  options: {
    layout?: SfPlayerSaveLayout;
    saveArray?: unknown[] | null;
    characterClass?: number | null;
  } = {},
): NormalizedPlayerItems | undefined => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const saveArray = options.saveArray ?? readSfPlayerSaveArray(row);
  const layout = options.layout ?? detectSfPlayerSaveLayout(row, saveArray);
  const characterClass = options.characterClass ?? readCharacterClass(layout, saveArray);
  const equippedItems = readArrayField(row, "equippedItems");

  if (equippedItems) {
    return {
      equipped: normalizeEquipmentFromValues(equippedItems, "modern19", "equippedItems", characterClass),
    };
  }

  if (layout === "legacyOwn" || layout === "legacyOther") {
    return {
      equipped: normalizeEquipmentFromValues(
        readChunk(saveArray, LEGACY_EQUIPPED_SAVE_START, LEGACY_ITEM_SIZE * EQUIPPED_SLOT_KEYS.length),
        "legacy12",
        "save",
        characterClass,
      ),
    };
  }

  return undefined;
};
