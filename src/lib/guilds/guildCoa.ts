export type JsonRecord = Record<string, unknown>;

export type GuildCoaCandidate = {
  rawValue: string;
  coaString: string | null;
  source: string;
};

export type RawGuildSaveToken = {
  index: number;
  arrayKey: "groups" | "guilds";
  saveSlot1: string | null;
};

export type DerivedGuildCoaMetadata = {
  guildCoaByIdentifier: Record<string, string>;
};

export const GUILD_COA_SOURCE_KEYS = [
  "coaString",
  "coa",
  "coa_string",
  "coatOfArms",
  "coat_of_arms",
  "emblem",
  "emblemString",
] as const;

const FINAL_COA_PATTERN = /^[0-9a-f]{22}$/i;
const NUMERIC_COA_WITH_DROPPED_LEADING_ZERO_PATTERN = /^[0-9]{21}$/;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickFirst(record: JsonRecord, keys: readonly string[]) {
  const lookup = new Map<string, string>();
  for (const key of Object.keys(record)) {
    const canon = canonKey(key);
    if (canon && !lookup.has(canon)) lookup.set(canon, key);
  }

  for (const key of keys) {
    const resolvedKey = lookup.get(canonKey(key));
    const value = resolvedKey ? record[resolvedKey] : undefined;
    if (value != null && String(value).trim()) return { key: resolvedKey ?? key, value };
  }

  return null;
}

function toSafeIntegerString(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return null;
  if (!Number.isSafeInteger(value)) return null;
  return String(value);
}

function readIdentifierString(group: JsonRecord): string | null {
  const value = pickFirst(group, [
    "guildIdentifier",
    "Guild Identifier",
    "identifier",
    "Identifier",
    "groupIdentifier",
    "Group Identifier",
    "group",
    "guildId",
    "guildid",
    "Guild ID",
    "id",
    "ID",
    "gid",
    "groupId",
    "groupid",
    "Group ID",
  ]);
  if (!value) return null;
  if (typeof value.value === "string") return value.value.trim() || null;
  return toSafeIntegerString(value.value);
}

export function normalizeGuildCoaStringCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "0") return "0";
  if (FINAL_COA_PATTERN.test(trimmed)) return trimmed;

  if (NUMERIC_COA_WITH_DROPPED_LEADING_ZERO_PATTERN.test(trimmed)) {
    const padded = `0${trimmed}`;
    return FINAL_COA_PATTERN.test(padded) ? padded : null;
  }

  return null;
}

export function isValidGuildCoaString(value: string) {
  const trimmed = value.trim();
  return trimmed === "0" || FINAL_COA_PATTERN.test(trimmed);
}

export function collectGuildCoaCandidates(
  group: JsonRecord | null,
  sourcePrefix: string,
  rawSaveSlot1?: string | null,
): GuildCoaCandidate[] {
  if (!group) return [];

  const candidates: GuildCoaCandidate[] = [];
  const pushCandidate = (rawValue: string | null, source: string) => {
    const trimmed = rawValue?.trim();
    if (!trimmed) return false;
    candidates.push({
      source,
      rawValue: trimmed,
      coaString: normalizeGuildCoaStringCandidate(trimmed),
    });
    return true;
  };

  for (const key of GUILD_COA_SOURCE_KEYS) {
    const value = pickFirst(group, [key]);
    if (!value || typeof value.value !== "string") continue;
    pushCandidate(value.value, `${sourcePrefix}.${value.key}`);
  }

  const saveSource = `${sourcePrefix}.save[1]`;
  const saveValue = Array.isArray(group.save) ? group.save[1] : null;
  let hasParsedSaveCandidate = false;
  if (typeof saveValue === "string") {
    hasParsedSaveCandidate = pushCandidate(saveValue, saveSource);
  } else {
    hasParsedSaveCandidate = pushCandidate(toSafeIntegerString(saveValue), saveSource);
  }

  if (!hasParsedSaveCandidate && rawSaveSlot1 != null) {
    pushCandidate(rawSaveSlot1, saveSource);
  }

  return candidates;
}

export function extractGuildCoaString(group: JsonRecord, rawSaveSlot1?: string | null): string | null {
  return collectGuildCoaCandidates(group, "guild", rawSaveSlot1).find((candidate) => candidate.coaString)?.coaString ?? null;
}

function skipWhitespace(text: string, index: number) {
  let next = index;
  while (next < text.length && /\s/.test(text[next])) next += 1;
  return next;
}

function readJsonString(text: string, index: number): { value: string; end: number } | null {
  if (text[index] !== '"') return null;
  let cursor = index + 1;
  let escaped = false;
  while (cursor < text.length) {
    const char = text[cursor];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      const raw = text.slice(index, cursor + 1);
      try {
        return { value: JSON.parse(raw) as string, end: cursor + 1 };
      } catch {
        return null;
      }
    }
    cursor += 1;
  }
  return null;
}

function skipJsonValue(text: string, index: number): number {
  const start = skipWhitespace(text, index);
  const first = text[start];
  if (first === '"') return readJsonString(text, start)?.end ?? start;

  if (first === "{" || first === "[") {
    const close = first === "{" ? "}" : "]";
    const stack = [close];
    let cursor = start + 1;
    while (cursor < text.length && stack.length) {
      const char = text[cursor];
      if (char === '"') {
        cursor = readJsonString(text, cursor)?.end ?? cursor + 1;
        continue;
      }
      if (char === "{") stack.push("}");
      if (char === "[") stack.push("]");
      if (char === stack[stack.length - 1]) stack.pop();
      cursor += 1;
    }
    return cursor;
  }

  let cursor = start;
  while (cursor < text.length && !/[\s,\]}]/.test(text[cursor])) cursor += 1;
  return cursor;
}

function findObjectPropertyValue(text: string, objectStart: number, propertyName: string) {
  let cursor = skipWhitespace(text, objectStart);
  if (text[cursor] !== "{") return null;
  cursor += 1;

  while (cursor < text.length) {
    cursor = skipWhitespace(text, cursor);
    if (text[cursor] === "}") return null;

    const key = readJsonString(text, cursor);
    if (!key) return null;
    cursor = skipWhitespace(text, key.end);
    if (text[cursor] !== ":") return null;
    cursor = skipWhitespace(text, cursor + 1);

    const valueStart = cursor;
    const valueEnd = skipJsonValue(text, valueStart);
    if (key.value === propertyName) return { start: valueStart, end: valueEnd };

    cursor = skipWhitespace(text, valueEnd);
    if (text[cursor] === ",") cursor += 1;
  }

  return null;
}

function readArrayValueRanges(text: string, arrayStart: number, limit?: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = skipWhitespace(text, arrayStart);
  if (text[cursor] !== "[") return ranges;
  cursor += 1;

  while (cursor < text.length) {
    cursor = skipWhitespace(text, cursor);
    if (text[cursor] === "]") return ranges;

    const valueStart = cursor;
    const valueEnd = skipJsonValue(text, valueStart);
    ranges.push({ start: valueStart, end: valueEnd });
    if (limit != null && ranges.length >= limit) return ranges;

    cursor = skipWhitespace(text, valueEnd);
    if (text[cursor] === ",") cursor += 1;
  }

  return ranges;
}

function readRawJsonValueAsCandidate(text: string, start: number, end: number): string | null {
  const valueStart = skipWhitespace(text, start);
  const valueEnd = skipWhitespace(text, end);
  if (text[valueStart] === '"') {
    const parsed = readJsonString(text, valueStart);
    return parsed && skipWhitespace(text, parsed.end) === valueEnd ? parsed.value.trim() || null : null;
  }

  const token = text.slice(valueStart, valueEnd).trim();
  return /^(?:0|[1-9]\d*)$/.test(token) ? token : null;
}

function extractSaveSlot1TokenFromGroupSource(text: string, groupStart: number) {
  const saveRange = findObjectPropertyValue(text, groupStart, "save");
  if (!saveRange) return null;
  const saveStart = skipWhitespace(text, saveRange.start);
  if (text[saveStart] !== "[") return null;

  const saveValues = readArrayValueRanges(text, saveStart, 2);
  const slot = saveValues[1];
  if (!slot) return null;
  return readRawJsonValueAsCandidate(text, slot.start, slot.end);
}

function extractRawGuildSaveTokensForArray(
  text: string,
  arrayKey: "groups" | "guilds",
): RawGuildSaveToken[] | null {
  const rootStart = skipWhitespace(text, 0);
  if (text[rootStart] !== "{") return null;
  const groupsRange = findObjectPropertyValue(text, rootStart, arrayKey);
  if (!groupsRange) return null;
  const arrayStart = skipWhitespace(text, groupsRange.start);
  if (text[arrayStart] !== "[") return null;

  return readArrayValueRanges(text, arrayStart).map((range, index) => ({
    index,
    arrayKey,
    saveSlot1: text[skipWhitespace(text, range.start)] === "{" ? extractSaveSlot1TokenFromGroupSource(text, range.start) : null,
  }));
}

export function extractRawGuildSaveTokens(rawJsonText: string): RawGuildSaveToken[] {
  const trimmed = rawJsonText.trim();
  if (!trimmed) return [];
  return extractRawGuildSaveTokensForArray(trimmed, "groups") ?? extractRawGuildSaveTokensForArray(trimmed, "guilds") ?? [];
}

export function extractDerivedGuildCoaMetadata(root: unknown, rawJsonText: string): DerivedGuildCoaMetadata | null {
  if (!isRecord(root)) return null;

  const tokens = extractRawGuildSaveTokens(rawJsonText);
  if (!tokens.length) return null;

  const arrayKey = tokens[0].arrayKey;
  const groups = root[arrayKey];
  if (!Array.isArray(groups)) return null;

  const guildCoaByIdentifier: Record<string, string> = {};
  for (const [index, group] of groups.entries()) {
    if (!isRecord(group)) continue;
    const identifier = readIdentifierString(group);
    if (!identifier) continue;

    const coaString = extractGuildCoaString(group, tokens[index]?.saveSlot1);
    if (coaString) guildCoaByIdentifier[identifier] = coaString;
  }

  return Object.keys(guildCoaByIdentifier).length ? { guildCoaByIdentifier } : null;
}
