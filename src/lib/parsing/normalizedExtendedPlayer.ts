import { detectSfPlayerSaveLayout, readSfPlayerSaveArray, readSfSaveNumber, type SfPlayerSaveLayout } from "./playerSaveLayout";
import type { NormalizedPlayerFieldMetadata, NormalizedPlayerFieldProvenance, NormalizedPlayerFieldStatus } from "./normalizedPlayer";

export type NormalizedWitchScroll = {
  index: number;
  sourceIndex: number | null;
  type: number | null;
  picIndex: number | null;
  date: number | null;
  owned: boolean | null;
};

export type NormalizedWitch = {
  rawStage: number | null;
  stage: number | null;
  items: number | null;
  itemsNext: number | null;
  item: number | null;
  finish: number | null;
  scrolls: NormalizedWitchScroll[];
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

export type NormalizedIdle = {
  sacrifices: number | null;
  buildings: number[];
  money: number | null;
  readyRunes: number | null;
  runes: number | null;
  upgrades: {
    speed: number[];
    money: number[];
    moneyIncreaseFlag: number | null;
    total: number | null;
  };
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

export type NormalizedToilet = {
  aura: number | null;
  fill: number | null;
  capacity: number | null;
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

export type NormalizedPlayerExtras = {
  registeredAt: number | null;
  webshopId: string | null;
  status: {
    action: {
      status: number | null;
      index: number | null;
      startsAt: number | null;
      finishesAt: number | null;
    };
    beerMax: number | null;
    beerUsed: number | null;
    adventurePoints: number | null;
    calendarDay: number | null;
  };
  metadata: {
    layout: SfPlayerSaveLayout;
    fields: Record<string, NormalizedPlayerFieldMetadata>;
  };
};

export type NormalizedExtendedPlayerValues = {
  witch: NormalizedWitch;
  idle: NormalizedIdle;
  toilet: NormalizedToilet;
  extras: NormalizedPlayerExtras;
};

const SCROLL_MAP: Record<number, number> = {
  11: 0,
  31: 1,
  41: 2,
  51: 3,
  61: 4,
  71: 5,
  81: 6,
  91: 7,
  101: 8,
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const hasArrayIndex = (values: unknown[] | null, index: number): boolean =>
  Boolean(values && index >= 0 && index < values.length && Object.prototype.hasOwnProperty.call(values, index));

const mark = (
  fields: Record<string, NormalizedPlayerFieldMetadata>,
  path: string,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
};

const readArrayNumber = (
  values: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!hasArrayIndex(values, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(values?.[index]);
  mark(fields, path, value == null ? "invalid" : "available", value == null ? undefined : "raw");
  return value;
};

const readObjectNumber = (
  record: Record<string, unknown>,
  key: string,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(record[key]);
  mark(fields, path, value == null ? "invalid" : "available", value == null ? undefined : "raw");
  return value;
};

const emptyWitch = (layout: SfPlayerSaveLayout, fields: Record<string, NormalizedPlayerFieldMetadata>): NormalizedWitch => ({
  rawStage: null,
  stage: null,
  items: null,
  itemsNext: null,
  item: null,
  finish: null,
  scrolls: Array.from({ length: 9 }, (_, index) => ({ index, sourceIndex: null, type: null, picIndex: null, date: null, owned: null })),
  metadata: { layout, fields },
});

const emptyIdle = (layout: SfPlayerSaveLayout, fields: Record<string, NormalizedPlayerFieldMetadata>): NormalizedIdle => ({
  sacrifices: null,
  buildings: [],
  money: null,
  readyRunes: null,
  runes: null,
  upgrades: {
    speed: [],
    money: [],
    moneyIncreaseFlag: null,
    total: null,
  },
  metadata: { layout, fields },
});

const emptyToilet = (layout: SfPlayerSaveLayout, fields: Record<string, NormalizedPlayerFieldMetadata>): NormalizedToilet => ({
  aura: null,
  fill: null,
  capacity: null,
  metadata: { layout, fields },
});

const emptyExtras = (layout: SfPlayerSaveLayout, fields: Record<string, NormalizedPlayerFieldMetadata>): NormalizedPlayerExtras => ({
  registeredAt: null,
  webshopId: null,
  status: {
    action: {
      status: null,
      index: null,
      startsAt: null,
      finishesAt: null,
    },
    beerMax: null,
    beerUsed: null,
    adventurePoints: null,
    calendarDay: null,
  },
  metadata: { layout, fields },
});

const markWitchAll = (fields: Record<string, NormalizedPlayerFieldMetadata>, status: NormalizedPlayerFieldStatus) => {
  ["rawStage", "stage", "items", "itemsNext", "item", "finish"].forEach((key) => mark(fields, `witch.${key}`, status));
  for (let index = 0; index < 9; index += 1) {
    ["type", "picIndex", "date", "owned"].forEach((key) => mark(fields, `witch.scrolls.${index}.${key}`, status));
  }
};

const markIdleAll = (fields: Record<string, NormalizedPlayerFieldMetadata>, status: NormalizedPlayerFieldStatus) => {
  ["sacrifices", "money", "readyRunes", "runes"].forEach((key) => mark(fields, `idle.${key}`, status));
  ["speed", "money", "moneyIncreaseFlag", "total"].forEach((key) => mark(fields, `idle.upgrades.${key}`, status));
  mark(fields, "idle.buildings", status);
};

const markToiletAll = (fields: Record<string, NormalizedPlayerFieldMetadata>, status: NormalizedPlayerFieldStatus) => {
  ["aura", "fill", "capacity"].forEach((key) => mark(fields, `toilet.${key}`, status));
};

const markExtrasAll = (fields: Record<string, NormalizedPlayerFieldMetadata>, status: NormalizedPlayerFieldStatus) => {
  ["registeredAt", "webshopId"].forEach((key) => mark(fields, `extras.${key}`, status));
  ["status", "index", "startsAt", "finishesAt"].forEach((key) => mark(fields, `extras.status.action.${key}`, status));
  ["beerMax", "beerUsed", "adventurePoints", "calendarDay"].forEach((key) => mark(fields, `extras.status.${key}`, status));
};

const normalizeWitch = (row: Record<string, unknown>, layout: SfPlayerSaveLayout, own: boolean): NormalizedWitch => {
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const witch = emptyWitch(layout, fields);
  if (!own) {
    markWitchAll(fields, "unsupported");
    return witch;
  }

  const source = row.witch;
  const values = Array.isArray(source) ? (source as unknown[]) : null;
  const record = asRecord(source);
  if (!values && !record) {
    markWitchAll(fields, layout === "unknown" ? "unsupported" : "missing");
    return witch;
  }

  const read = (key: string, index: number, path: string) =>
    record ? readObjectNumber(record, key, path, fields) : readArrayNumber(values, index, path, fields);

  const timestamp = toFiniteNumberOrNull(row.timestamp);
  const offset = toFiniteNumberOrNull(row.offset) ?? 0;
  const rawStage = read("stage", 0, "witch.rawStage");
  const items = read("items", 1, "witch.items");
  const itemsNext = read("itemsNext", 2, "witch.itemsNext");
  const rawFinish = record ? read("finish", 6, "witch.finish") : readArrayNumber(values, 6, "witch.finishRaw", fields);

  witch.rawStage = rawStage;
  witch.itemsNext = itemsNext == null ? null : Math.max(0, itemsNext);
  witch.items = items == null || witch.itemsNext == null ? items : Math.min(items, witch.itemsNext);
  witch.item = read("item", 3, "witch.item");
  witch.finish = rawFinish == null ? null : record ? rawFinish : rawFinish * 1000 + offset;
  if (witch.finish != null && timestamp != null && witch.finish < timestamp) witch.finish = 0;
  mark(fields, "witch.finish", witch.finish == null ? fields["witch.finishRaw"]?.status ?? "missing" : "available", witch.finish == null ? undefined : record ? "raw" : "derived");

  const scrolls = Array.from({ length: 9 }, (_, index) => ({ index, sourceIndex: null, type: null, picIndex: null, date: null, owned: null } as NormalizedWitchScroll));
  if (record && Array.isArray(record.scrolls)) {
    (record.scrolls as unknown[]).forEach((entry, sourceIndex) => {
      const scroll = asRecord(entry);
      if (!scroll) return;
      const picIndex = toFiniteNumberOrNull(scroll.picIndex);
      const type = toFiniteNumberOrNull(scroll.type) ?? (picIndex == null ? null : picIndex % 1000);
      const mappedIndex = type == null ? sourceIndex : SCROLL_MAP[type] ?? sourceIndex;
      const date = toFiniteNumberOrNull(scroll.date);
      if (mappedIndex < 0 || mappedIndex >= scrolls.length) return;
      scrolls[mappedIndex] = {
        index: mappedIndex,
        sourceIndex,
        type,
        picIndex,
        date,
        owned: date == null || timestamp == null ? null : date > 0 && date <= timestamp,
      };
    });
  } else {
    for (let sourceIndex = 0; sourceIndex < 9; sourceIndex += 1) {
      const base = 8 + sourceIndex * 3;
      const picIndex = readArrayNumber(values, base + 1, `witch.scrolls.${sourceIndex}.picIndexRaw`, fields);
      const dateSeconds = readArrayNumber(values, base + 2, `witch.scrolls.${sourceIndex}.dateRaw`, fields);
      const type = picIndex == null ? null : picIndex % 1000;
      const mappedIndex = type == null ? sourceIndex : SCROLL_MAP[type] ?? sourceIndex;
      const date = dateSeconds == null ? null : dateSeconds * 1000 + offset;
      if (mappedIndex < 0 || mappedIndex >= scrolls.length) continue;
      scrolls[mappedIndex] = {
        index: mappedIndex,
        sourceIndex,
        type,
        picIndex,
        date,
        owned: date == null || timestamp == null ? null : date > 0 && date <= timestamp,
      };
    }
  }

  witch.scrolls = scrolls;
  witch.stage = scrolls.every((scroll) => scroll.owned != null)
    ? scrolls.filter((scroll) => scroll.owned).length
    : rawStage;
  mark(fields, "witch.stage", witch.stage == null ? fields["witch.rawStage"]?.status ?? "missing" : "available", witch.stage == null ? undefined : "calculated");
  witch.scrolls.forEach((scroll) => {
    mark(fields, `witch.scrolls.${scroll.index}.type`, scroll.type == null ? "missing" : "available", scroll.type == null ? undefined : "derived");
    mark(fields, `witch.scrolls.${scroll.index}.picIndex`, scroll.picIndex == null ? "missing" : "available", scroll.picIndex == null ? undefined : "raw");
    mark(fields, `witch.scrolls.${scroll.index}.date`, scroll.date == null ? "missing" : "available", scroll.date == null ? undefined : "derived");
    mark(fields, `witch.scrolls.${scroll.index}.owned`, scroll.owned == null ? "missing" : "available", scroll.owned == null ? undefined : "calculated");
  });

  return witch;
};

const normalizeIdle = (row: Record<string, unknown>, layout: SfPlayerSaveLayout, own: boolean): NormalizedIdle => {
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const idle = emptyIdle(layout, fields);
  if (!own) {
    markIdleAll(fields, "unsupported");
    return idle;
  }

  const source = row.idle;
  const values = Array.isArray(source) ? (source as unknown[]) : null;
  const record = asRecord(source);
  if (!values && !record) {
    markIdleAll(fields, layout === "unknown" ? "unsupported" : "missing");
    return idle;
  }

  if (record) {
    idle.sacrifices = readObjectNumber(record, "sacrifices", "idle.sacrifices", fields);
    idle.money = readObjectNumber(record, "money", "idle.money", fields);
    idle.readyRunes = readObjectNumber(record, "readyRunes", "idle.readyRunes", fields);
    idle.runes = readObjectNumber(record, "runes", "idle.runes", fields);
    idle.buildings = Array.isArray(record.buildings) ? (record.buildings as unknown[]).map(toFiniteNumberOrNull).filter((entry): entry is number => entry != null) : [];
    mark(fields, "idle.buildings", Array.isArray(record.buildings) ? "available" : "missing", Array.isArray(record.buildings) ? "raw" : undefined);
    const upgrades = asRecord(record.upgrades);
    idle.upgrades.speed = Array.isArray(upgrades?.speed) ? (upgrades.speed as unknown[]).map(toFiniteNumberOrNull).filter((entry): entry is number => entry != null) : [];
    idle.upgrades.money = Array.isArray(upgrades?.money) ? (upgrades.money as unknown[]).map(toFiniteNumberOrNull).filter((entry): entry is number => entry != null) : [];
    idle.upgrades.moneyIncreaseFlag = upgrades ? readObjectNumber(upgrades, "moneyIncreaseFlag", "idle.upgrades.moneyIncreaseFlag", fields) : null;
    mark(fields, "idle.upgrades.speed", idle.upgrades.speed.length ? "available" : "missing", idle.upgrades.speed.length ? "raw" : undefined);
    mark(fields, "idle.upgrades.money", idle.upgrades.money.length ? "available" : "missing", idle.upgrades.money.length ? "raw" : undefined);
  } else {
    idle.sacrifices = readArrayNumber(values, 2, "idle.sacrifices", fields);
    idle.buildings = values!.slice(3, 13).map(toFiniteNumberOrNull).filter((entry): entry is number => entry != null);
    mark(fields, "idle.buildings", idle.buildings.length === 10 ? "available" : "missing", idle.buildings.length === 10 ? "raw" : undefined);
    idle.money = readArrayNumber(values, 73, "idle.money", fields);
    idle.readyRunes = readArrayNumber(values, 75, "idle.readyRunes", fields);
    idle.runes = readArrayNumber(values, 76, "idle.runes", fields);
    idle.upgrades.speed = values!.slice(43, 53).map(toFiniteNumberOrNull).filter((entry): entry is number => entry != null);
    idle.upgrades.money = values!.slice(53, 63).map(toFiniteNumberOrNull).filter((entry): entry is number => entry != null);
    idle.upgrades.moneyIncreaseFlag = readArrayNumber(values, 77, "idle.upgrades.moneyIncreaseFlag", fields);
    mark(fields, "idle.upgrades.speed", idle.upgrades.speed.length === 10 ? "available" : "missing", idle.upgrades.speed.length === 10 ? "raw" : undefined);
    mark(fields, "idle.upgrades.money", idle.upgrades.money.length === 10 ? "available" : "missing", idle.upgrades.money.length === 10 ? "raw" : undefined);
  }

  if (idle.upgrades.moneyIncreaseFlag) {
    idle.upgrades.money = idle.upgrades.money.map((value) => value + 1);
    mark(fields, "idle.upgrades.money", "available", "derived");
  }
  idle.upgrades.total = [...idle.upgrades.speed, ...idle.upgrades.money].reduce((sum, value) => sum + value, 0);
  mark(fields, "idle.upgrades.total", "available", "calculated");

  return idle;
};

const normalizeToilet = (row: Record<string, unknown>, layout: SfPlayerSaveLayout, own: boolean): NormalizedToilet => {
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const toilet = emptyToilet(layout, fields);
  if (!own) {
    markToiletAll(fields, "unsupported");
    return toilet;
  }

  const source = row.toilet;
  const values = Array.isArray(source) ? (source as unknown[]) : null;
  const record = asRecord(source);
  if (!values && !record) {
    markToiletAll(fields, layout === "unknown" ? "unsupported" : "missing");
    return toilet;
  }

  toilet.aura = record ? readObjectNumber(record, "aura", "toilet.aura", fields) : readArrayNumber(values, 0, "toilet.aura", fields);
  toilet.fill = record ? readObjectNumber(record, "fill", "toilet.fill", fields) : readArrayNumber(values, 1, "toilet.fill", fields);
  toilet.capacity = record ? readObjectNumber(record, "capacity", "toilet.capacity", fields) : readArrayNumber(values, 3, "toilet.capacity", fields);
  return toilet;
};

const readStatus = (
  status: unknown,
  index: number,
  path: string,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  if (!Array.isArray(status) || !hasArrayIndex(status, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(status[index]);
  mark(fields, path, value == null ? "invalid" : "available", value == null ? undefined : "raw");
  return value;
};

const readCalendarDayFromStatus = (
  status: unknown,
  fields: Record<string, NormalizedPlayerFieldMetadata>,
): number | null => {
  const packed = readStatus(status, 8, "extras.status.calendarDayRaw", fields);
  const value = packed == null ? null : (packed >> 16) & 0xffff;
  mark(fields, "extras.status.calendarDay", packed == null ? fields["extras.status.calendarDayRaw"]?.status ?? "missing" : "available", packed == null ? undefined : "derived");
  return value;
};

const normalizeExtras = (
  row: Record<string, unknown>,
  layout: SfPlayerSaveLayout,
  own: boolean,
  saveArray: unknown[] | null,
): NormalizedPlayerExtras => {
  const fields: Record<string, NormalizedPlayerFieldMetadata> = {};
  const extras = emptyExtras(layout, fields);
  if (!own) {
    markExtrasAll(fields, "unsupported");
    return extras;
  }

  if (layout === "legacyOwn") {
    const registeredSeconds = readSfSaveNumber(saveArray, 3);
    extras.registeredAt = registeredSeconds == null ? null : registeredSeconds * 1000 + (toFiniteNumberOrNull(row.offset) ?? 0);
    mark(fields, "extras.registeredAt", registeredSeconds == null ? "missing" : "available", registeredSeconds == null ? undefined : "derived");
  } else {
    mark(fields, "extras.registeredAt", "unsupported");
  }

  if (typeof row.webshopId === "string" || typeof row.webshopid === "string") {
    extras.webshopId = String(row.webshopId ?? row.webshopid);
    mark(fields, "extras.webshopId", "available", "raw");
  } else {
    mark(fields, "extras.webshopId", "missing");
  }

  extras.status.action.status = readStatus(row.status, 1, "extras.status.action.status", fields);
  extras.status.action.index = readStatus(row.status, 2, "extras.status.action.index", fields);
  const finishSeconds = readStatus(row.status, 3, "extras.status.action.finishRaw", fields);
  const startSeconds = readStatus(row.status, 4, "extras.status.action.startRaw", fields);
  const offset = toFiniteNumberOrNull(row.offset) ?? 0;
  extras.status.action.finishesAt = finishSeconds == null ? null : finishSeconds * 1000 + offset;
  extras.status.action.startsAt = startSeconds == null ? null : startSeconds * 1000 + offset;
  mark(fields, "extras.status.action.finishesAt", finishSeconds == null ? fields["extras.status.action.finishRaw"]?.status ?? "missing" : "available", finishSeconds == null ? undefined : "derived");
  mark(fields, "extras.status.action.startsAt", startSeconds == null ? fields["extras.status.action.startRaw"]?.status ?? "missing" : "available", startSeconds == null ? undefined : "derived");
  extras.status.beerMax = readStatus(row.status, 5, "extras.status.beerMax", fields);
  extras.status.adventurePoints = readStatus(row.status, 6, "extras.status.adventurePoints", fields);
  extras.status.beerUsed = readStatus(row.status, 7, "extras.status.beerUsed", fields);
  extras.status.calendarDay = readCalendarDayFromStatus(row.status, fields);

  return extras;
};

export const normalizeSfPlayerExtendedValues = (
  player: unknown,
  options: { layout?: SfPlayerSaveLayout; saveArray?: unknown[] | null } = {},
): NormalizedExtendedPlayerValues => {
  const row = player && typeof player === "object" ? (player as Record<string, unknown>) : {};
  const saveArray = options.saveArray ?? readSfPlayerSaveArray(row);
  const layout = options.layout ?? detectSfPlayerSaveLayout(row, saveArray);
  const own = toFiniteNumberOrNull(row.own) === 1 || row.own === true;

  return {
    witch: normalizeWitch(row, layout, own),
    idle: normalizeIdle(row, layout, own),
    toilet: normalizeToilet(row, layout, own),
    extras: normalizeExtras(row, layout, own, saveArray),
  };
};
