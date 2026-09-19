import { extractGuildCoaString } from "../guilds/guildCoa";
import { normalizeGuildScanServer, normalizeGuildSegmentForScan } from "../guilds/guildScanNormalizer";
import { parseSaveStringToArray } from "./extractPortrait";
import type {
  NormalizedPlayer,
  NormalizedPlayerGuildReference,
  NormalizedPlayerFieldMetadata,
  NormalizedPlayerFieldProvenance,
  NormalizedPlayerFieldStatus,
} from "./normalizedPlayer";

type JsonRecord = Record<string, unknown>;

export type NormalizedGuildRole = "leader" | "officer" | "member" | null;
export type NormalizedGuildFieldMetadata = NormalizedPlayerFieldMetadata;

export type NormalizedGuildMemberActions = {
  hydra: boolean | null;
  attack: boolean | null;
  defense: boolean | null;
  raid: boolean | null;
};

export type NormalizedGuildMember = {
  identity: {
    playerIdentifier: string | null;
    playerId: number | null;
    name: string | null;
    level: number | null;
    slot: number;
    index: number;
  };
  link: {
    playerIdentifier: string | null;
  };
  role: {
    id: number | null;
    name: NormalizedGuildRole;
  };
  activity: {
    state: number | null;
    lastActive: number | null;
    joined: null;
  };
  actions: NormalizedGuildMemberActions;
  readyAttack: boolean | null;
  readyDefense: boolean | null;
  bonuses: {
    treasure: number | null;
    instructor: number | null;
    pet: number | null;
  };
  contributions: {
    knights: number | null;
  };
  metadata: {
    fields: Record<string, NormalizedGuildFieldMetadata>;
  };
};

export type NormalizedGuild = {
  identity: {
    id: number | null;
    identifier: string | null;
    name: string | null;
    server: string | null;
    prefix: string | null;
    coa: string | null;
    own: boolean | null;
    timestamp: number | null;
    description: string | null;
  };
  progression: {
    rank: number | null;
    honor: number | null;
  };
  bonuses: {
    totalTreasure: number | null;
    totalInstructor: number | null;
  };
  totals: {
    membersTotal: number | null;
    totalKnights: number | null;
    totalKnights15: number | null;
  };
  combatProgress: {
    raid: number | null;
    portal: {
      life: number | null;
      percent: number | null;
      floor: number | null;
    };
    hydra: {
      level: number | null;
      max: number | null;
    };
    pet: {
      id: number | null;
      level: number | null;
      class: number | null;
      stats: {
        strength: number | null;
        dexterity: number | null;
        intelligence: number | null;
        constitution: number | null;
        luck: number | null;
      };
    };
    combatState: {
      isUnderAttack: boolean | null;
      underAttackId: number | null;
      isAttacking: boolean | null;
      attackingId: number | null;
    };
  };
  members: NormalizedGuildMember[];
  tournament: {
    rank: number | null;
    tokens: number | null;
  } | null;
  metadata: {
    format: "modernActions" | "legacyActions" | "unknown";
    fields: Record<string, NormalizedGuildFieldMetadata>;
  };
};

export type NormalizedGuildMemberLinkTarget = {
  guild: NormalizedGuild;
  member: NormalizedGuildMember;
  guildKey: string;
  playerIdentifier: string;
};

export type NormalizedGuildIndexes = {
  guildByIdentifier: Map<string, NormalizedGuild>;
  memberByPlayerIdentifier: Map<string, NormalizedGuildMember>;
  memberTargetsByPlayerIdentifier: Map<string, NormalizedGuildMemberLinkTarget[]>;
};

export type NormalizedPlayerGuildMemberLink = {
  playerIdentifier: string | null;
  guildReference: NormalizedPlayerGuildReference | null;
  guild: NormalizedGuild | null;
  guildMember: NormalizedGuildMember | null;
  linked: boolean;
  ambiguous: boolean;
  role: NormalizedGuildRole;
  lastActive: number | null;
  joined: null;
  actions: NormalizedGuildMemberActions;
  readyAttack: boolean | null;
  readyDefense: boolean | null;
  guildBonuses: {
    treasure: number | null;
    instructor: number | null;
    pet: number | null;
  };
  knightsContribution: number | null;
};

export type NormalizeSfGuildOptions = {
  fallbackServer?: string | null;
  derivedGuildCoaByIdentifier?: Record<string, string> | null;
  rawSaveSlot1?: string | null;
};

const GUILD_ROLE_NONE = 0;
const GUILD_ROLE_LEADER = 1;
const GUILD_ROLE_OFFICER = 2;
const GUILD_ROLE_MEMBER = 3;
const GUILD_ROLE_INVITED = 4;

const MEMBER_SLOT_COUNT = 50;
const MODERN_ACTION_SAVE_LENGTH = 502;

const PET_CLASSES = [
  2, 0, 0, 1, 1, 1, 2, 2, 2, 0, 1, 1, 2, 2, 0, 0, 1, 0, 0, 2, 0, 0, 1, 1, 2, 2, 1, 0, 0, 1, 1,
  2, 2, 1, 1, 0, 0, 0, 1, 2, 0, 0, 2, 2, 0, 2, 1, 1, 0, 0, 2, 0, 2, 2, 1, 1, 1, 0, 0, 0, 2, 2,
  0, 1, 1, 2, 2, 1, 0, 1, 1, 2, 2, 2, 2, 2, 1, 0, 1, 0, 1, 0, 0, 0, 0, 2, 0, 2, 2, 0, 1, 1,
  1, 0, 1, 1, 0, 1, 0, 2,
];

const DESCRIPTION_ENCODING: Record<string, string> = {
  d: "$",
  P: "%",
  c: ":",
  C: ",",
  S: ";",
  p: "|",
  s: "/",
  "+": "&",
  q: '"',
  r: "#",
  b: "\n",
};

const asRecord = (value: unknown): JsonRecord | null =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const canonicalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const pickFirst = (record: JsonRecord, keys: readonly string[]) => {
  const lookup = new Map<string, string>();
  Object.keys(record).forEach((key) => {
    const canonical = canonicalizeKey(key);
    if (canonical && !lookup.has(canonical)) lookup.set(canonical, key);
  });

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
    const resolvedKey = lookup.get(canonicalizeKey(key));
    if (!resolvedKey) continue;
    const value = record[resolvedKey];
    if (value != null && String(value).trim() !== "") return value;
  }

  return undefined;
};

const toTrimmedString = (value: unknown): string | null => {
  if (value == null) return null;
  const text = String(value).replace(/\u00a0/g, " ").trim();
  return text || null;
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

const toBooleanFlag = (value: number | null): boolean | null => (value == null ? null : value > 0);

const mark = (
  fields: Record<string, NormalizedGuildFieldMetadata>,
  path: string,
  status: NormalizedPlayerFieldStatus,
  provenance?: NormalizedPlayerFieldProvenance,
) => {
  fields[path] = provenance ? { status, provenance } : { status };
};

const hasIndex = (values: unknown[] | null, index: number) =>
  Boolean(values && index >= 0 && index < values.length && Object.prototype.hasOwnProperty.call(values, index));

const readSaveNumber = (
  saveArray: unknown[] | null,
  index: number,
  path: string,
  fields: Record<string, NormalizedGuildFieldMetadata>,
): number | null => {
  if (!hasIndex(saveArray, index)) {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(saveArray?.[index]);
  if (value == null) {
    mark(fields, path, "invalid");
    return null;
  }

  mark(fields, path, "available", "raw");
  return value;
};

const readOptionalNumber = (
  record: JsonRecord,
  keys: readonly string[],
  path: string,
  fields: Record<string, NormalizedGuildFieldMetadata>,
): number | null => {
  const raw = pickFirst(record, keys);
  if (raw == null || String(raw).trim() === "") {
    mark(fields, path, "missing");
    return null;
  }

  const value = toFiniteNumberOrNull(raw);
  if (value == null) {
    mark(fields, path, "invalid");
    return null;
  }

  mark(fields, path, "available", "raw");
  return value;
};

const markString = (
  value: string | null,
  path: string,
  fields: Record<string, NormalizedGuildFieldMetadata>,
  provenance: NormalizedPlayerFieldProvenance = "raw",
) => mark(fields, path, value == null ? "missing" : "available", value == null ? undefined : provenance);

const readGroupSaveArray = (record: JsonRecord): unknown[] | null => {
  const save = record.save ?? record.groupSave;
  if (Array.isArray(save) && save.length) return save;
  if (typeof save === "string" && save.trim()) return parseSaveStringToArray(save);
  const saveString = pickFirst(record, ["saveString", "groupSaveString"]);
  return typeof saveString === "string" && saveString.trim() ? parseSaveStringToArray(saveString) : null;
};

const readString = (record: JsonRecord, keys: readonly string[]) => toTrimmedString(pickFirst(record, keys));

const parseServerFromIdentifier = (value: unknown) => {
  const identifier = toTrimmedString(value);
  if (!identifier) return null;
  const match = identifier.match(/^(.+)_[pg][^_]+$/i);
  return match?.[1] ? normalizeGuildScanServer(match[1]) : null;
};

const parseGuildIdFromIdentifier = (value: unknown) => {
  const identifier = toTrimmedString(value);
  if (!identifier) return null;
  const match = identifier.match(/_g(\d+)$/i) ?? identifier.match(/^g(\d+)$/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePlayerIdFromIdentifier = (value: unknown) => {
  const identifier = toTrimmedString(value);
  if (!identifier) return null;
  const match = identifier.match(/_p(\d+)$/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const decodeRole = (roleId: number | null): NormalizedGuildRole => {
  if (roleId === GUILD_ROLE_LEADER) return "leader";
  if (roleId === GUILD_ROLE_OFFICER) return "officer";
  if (roleId === GUILD_ROLE_MEMBER) return "member";
  return null;
};

const upperShort = (value: number | null) => (value == null ? null : Math.trunc(value / 0x10000) & 0xffff);

const decodeDescription = (value: string | null) => {
  if (value == null) return null;
  return Object.entries(DESCRIPTION_ENCODING).reduce(
    (text, [encoded, decoded]) => text.split(`$${encoded}`).join(decoded),
    value,
  );
};

const sumKnownAsSfTools = (values: Array<number | null>) =>
  values.reduce<number>((sum, value) => sum + (value == null ? 0 : value), 0);

const calculateTotalBonus = (values: Array<number | null>) => Math.trunc(Math.min(sumKnownAsSfTools(values), 500) / 5);

const indexKey = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

const normalizePlayerGuildReference = (player: NormalizedPlayer): NormalizedPlayerGuildReference | null => {
  const identifier = player.guild.identifier ?? null;
  const name = player.guild.name ?? null;
  const server = player.guild.server ?? null;
  return identifier || name ? { identifier, name, server } : null;
};

export function createNormalizedGuildIndexes(guilds: NormalizedGuild[]): NormalizedGuildIndexes {
  const guildByIdentifier = new Map<string, NormalizedGuild>();
  const memberByPlayerIdentifier = new Map<string, NormalizedGuildMember>();
  const memberTargetsByPlayerIdentifier = new Map<string, NormalizedGuildMemberLinkTarget[]>();

  for (const guild of guilds) {
    const guildKey = indexKey(guild.identity.identifier);
    if (guildKey && !guildByIdentifier.has(guildKey)) guildByIdentifier.set(guildKey, guild);

    for (const member of guild.members) {
      const playerKey = indexKey(member.identity.playerIdentifier);
      if (!playerKey) continue;
      if (!memberByPlayerIdentifier.has(playerKey)) memberByPlayerIdentifier.set(playerKey, member);
      const target = {
        guild,
        member,
        guildKey: guildKey ?? "",
        playerIdentifier: member.identity.playerIdentifier ?? "",
      };
      const existing = memberTargetsByPlayerIdentifier.get(playerKey);
      if (existing) existing.push(target);
      else memberTargetsByPlayerIdentifier.set(playerKey, [target]);
    }
  }

  return { guildByIdentifier, memberByPlayerIdentifier, memberTargetsByPlayerIdentifier };
}

export function linkNormalizedPlayerToGuildMember(
  player: NormalizedPlayer,
  source: NormalizedGuildIndexes | NormalizedGuild[],
): NormalizedPlayerGuildMemberLink {
  const indexes = Array.isArray(source) ? createNormalizedGuildIndexes(source) : source;
  const playerKey = indexKey(player.identity.identifier);
  const playerGuildKey = indexKey(player.guild.identifier);
  const targets = playerKey ? indexes.memberTargetsByPlayerIdentifier.get(playerKey) ?? [] : [];
  const filteredTargets = playerGuildKey ? targets.filter((target) => target.guildKey === playerGuildKey) : targets;
  const target = filteredTargets.length === 1 ? filteredTargets[0] : null;
  const ambiguous = filteredTargets.length > 1 || (!playerGuildKey && targets.length > 1);
  const guild = target?.guild ?? (playerGuildKey ? indexes.guildByIdentifier.get(playerGuildKey) ?? null : null);
  const member = target?.member ?? null;
  const guildReference =
    guild != null
      ? {
          identifier: guild.identity.identifier,
          name: guild.identity.name,
          server: guild.identity.server,
        }
      : normalizePlayerGuildReference(player);

  return {
    playerIdentifier: player.identity.identifier,
    guildReference,
    guild,
    guildMember: member,
    linked: member != null,
    ambiguous,
    role: member?.role.name ?? null,
    lastActive: member?.activity.lastActive ?? null,
    joined: null,
    actions: member?.actions ?? { hydra: null, attack: null, defense: null, raid: null },
    readyAttack: member?.readyAttack ?? null,
    readyDefense: member?.readyDefense ?? null,
    guildBonuses: member?.bonuses ?? player.progressionStatus.guildBonuses,
    knightsContribution: member?.contributions.knights ?? null,
  };
}

const readMemberActions = (
  saveArray: unknown[] | null,
  slot: number,
  state: number | null,
  fields: Record<string, NormalizedGuildFieldMetadata>,
): { actions: NormalizedGuildMemberActions; modern: boolean } => {
  const actionIndex = 445 + slot;
  const actionValue = hasIndex(saveArray, actionIndex) ? toFiniteNumberOrNull(saveArray?.[actionIndex]) : null;

  if (saveArray && saveArray.length >= MODERN_ACTION_SAVE_LENGTH && actionValue != null) {
    mark(fields, "actions.hydra", "available", "raw");
    mark(fields, "actions.attack", "available", "raw");
    mark(fields, "actions.defense", "available", "raw");
    mark(fields, "actions.raid", state == null ? "missing" : "available", state == null ? undefined : "derived");
    return {
      modern: true,
      actions: {
        hydra: Math.trunc(actionValue / 100) === 1,
        attack: Math.trunc((actionValue % 100) / 10) === 1,
        defense: Math.trunc(actionValue % 10) === 1,
        raid: state == null ? null : state === 3,
      },
    };
  }

  const stateStatus = state == null ? "missing" : "available";
  mark(fields, "actions.hydra", "available", "calculated");
  mark(fields, "actions.attack", stateStatus, state == null ? undefined : "derived");
  mark(fields, "actions.defense", stateStatus, state == null ? undefined : "derived");
  mark(fields, "actions.raid", stateStatus, state == null ? undefined : "derived");
  return {
    modern: false,
    actions: {
      hydra: false,
      attack: state == null ? null : state === 1,
      defense: state == null ? null : state === 2,
      raid: state == null ? null : state === 3,
    },
  };
};

const readMemberNumber = (
  saveArray: unknown[] | null,
  index: number,
  fields: Record<string, NormalizedGuildFieldMetadata>,
  path: string,
) => readSaveNumber(saveArray, index, path, fields);

const normalizeMember = (
  saveArray: unknown[] | null,
  group: JsonRecord,
  slot: number,
  index: number,
  server: string | null,
  offset: number,
): { member: NormalizedGuildMember | null; usedModernActions: boolean } => {
  const fields: Record<string, NormalizedGuildFieldMetadata> = {};
  const playerId = readMemberNumber(saveArray, 14 + slot, fields, "identity.playerId");
  const roleId = readMemberNumber(saveArray, 314 + slot, fields, "role.id");

  if (roleId === GUILD_ROLE_NONE || roleId === GUILD_ROLE_INVITED) {
    return { member: null, usedModernActions: false };
  }

  if (playerId == null || playerId <= 0) {
    mark(fields, "identity.playerIdentifier", "invalid");
    return { member: null, usedModernActions: false };
  }

  const levelAndState = readMemberNumber(saveArray, 64 + slot, fields, "identity.levelStateRaw");
  const state = levelAndState == null ? null : Math.trunc(levelAndState / 1000);
  const level = levelAndState == null ? null : levelAndState % 1000;
  mark(fields, "activity.state", state == null ? "missing" : "available", state == null ? undefined : "derived");
  mark(fields, "identity.level", level == null ? "missing" : "available", level == null ? undefined : "derived");

  const playerIdentifier = server ? `${server}_p${playerId}` : null;
  mark(fields, "identity.playerIdentifier", playerIdentifier == null ? "missing" : "available", playerIdentifier == null ? undefined : "derived");

  const names = Array.isArray(group.names) ? group.names : Array.isArray(group.members) ? group.members : null;
  const name = toTrimmedString(names?.[slot]);
  markString(name, "identity.name", fields);

  const rawLastActive = readMemberNumber(saveArray, 114 + slot, fields, "activity.lastActiveRaw");
  const lastActive = rawLastActive == null ? null : rawLastActive * 1000 + offset;
  mark(fields, "activity.lastActive", lastActive == null ? "missing" : "available", lastActive == null ? undefined : "derived");
  mark(fields, "activity.joined", "unsupported");

  const { actions, modern } = readMemberActions(saveArray, slot, state, fields);
  const readyAttack = actions.attack == null || actions.raid == null ? null : actions.attack || actions.raid;
  const readyDefense = actions.defense;
  mark(fields, "readyAttack", readyAttack == null ? "missing" : "available", readyAttack == null ? undefined : "derived");
  mark(fields, "readyDefense", readyDefense == null ? "missing" : "available", readyDefense == null ? undefined : "derived");

  const treasure = readMemberNumber(saveArray, 214 + slot, fields, "bonuses.treasure");
  const instructor = readMemberNumber(saveArray, 264 + slot, fields, "bonuses.instructor");
  const pet = readMemberNumber(saveArray, 390 + slot, fields, "bonuses.pet");
  const knights = Array.isArray(group.knights) ? toFiniteNumberOrNull(group.knights[slot]) : null;
  if (Array.isArray(group.knights)) {
    mark(fields, "contributions.knights", knights == null ? "invalid" : "available", knights == null ? undefined : "raw");
  } else {
    mark(fields, "contributions.knights", "unsupported");
  }

  return {
    usedModernActions: modern,
    member: {
      identity: {
        playerIdentifier,
        playerId,
        name,
        level,
        slot,
        index,
      },
      link: {
        playerIdentifier,
      },
      role: {
        id: roleId,
        name: decodeRole(roleId),
      },
      activity: {
        state,
        lastActive,
        joined: null,
      },
      actions,
      readyAttack,
      readyDefense,
      bonuses: {
        treasure,
        instructor,
        pet,
      },
      contributions: {
        knights,
      },
      metadata: {
        fields,
      },
    },
  };
};

const resolveIdentifier = (group: JsonRecord, saveArray: unknown[] | null, server: string | null, id: number | null) =>
  readString(group, ["guildIdentifier", "Guild Identifier", "identifier", "Identifier", "groupIdentifier", "Group Identifier"]) ??
  (server && id != null ? `${server}_g${id}` : null);

const resolveCoa = (
  group: JsonRecord,
  identifier: string | null,
  options: NormalizeSfGuildOptions,
  fields: Record<string, NormalizedGuildFieldMetadata>,
) => {
  const derived = identifier ? options.derivedGuildCoaByIdentifier?.[identifier] : null;
  const coa = derived ?? extractGuildCoaString(group, options.rawSaveSlot1);
  mark(fields, "identity.coa", coa == null ? "missing" : "available", coa == null ? undefined : derived ? "derived" : "raw");
  return coa;
};

const readTournament = (
  group: JsonRecord,
  fields: Record<string, NormalizedGuildFieldMetadata>,
): NormalizedGuild["tournament"] => {
  const gtsave = asRecord(group.gtsave);
  if (!gtsave) {
    mark(fields, "tournament.rank", "missing");
    mark(fields, "tournament.tokens", "missing");
    return null;
  }

  const rank = readOptionalNumber(gtsave, ["rank", "Rank"], "tournament.rank", fields);
  const tokens = readOptionalNumber(gtsave, ["tokens", "Tokens"], "tournament.tokens", fields);
  return { rank, tokens };
};

export function normalizeSfGuild(input: unknown, options: NormalizeSfGuildOptions = {}): NormalizedGuild | null {
  const group = asRecord(input);
  if (!group) return null;

  const saveArray = readGroupSaveArray(group);
  const fields: Record<string, NormalizedGuildFieldMetadata> = {};
  const explicitServer = readString(group, ["server", "Server", "prefix", "world", "realm", "srv", "shard"]);
  const idFromSave = readSaveNumber(saveArray, 0, "identity.id", fields);
  const id = idFromSave ?? parseGuildIdFromIdentifier(pickFirst(group, ["identifier", "Identifier", "guildIdentifier"]));
  const server =
    normalizeGuildScanServer(explicitServer) ??
    parseServerFromIdentifier(readString(group, ["identifier", "Identifier", "guildIdentifier", "Guild Identifier"])) ??
    normalizeGuildScanServer(options.fallbackServer);
  const prefix = explicitServer ?? server;
  const identifier = resolveIdentifier(group, saveArray, server, id);
  const name = readString(group, ["name", "Name", "guildName", "Guild Name", "groupName", "groupname"]);
  const ownRaw = pickFirst(group, ["own", "Own"]);
  const ownNumber = toFiniteNumberOrNull(ownRaw);
  const own = ownRaw == null ? null : Boolean(ownNumber ?? ownRaw);
  const timestamp = readOptionalNumber(group, ["timestamp", "Timestamp"], "identity.timestamp", fields);
  const description = decodeDescription(readString(group, ["description", "Description"]));
  const offset = toFiniteNumberOrNull(group.offset) ?? 0;

  markString(identifier, "identity.identifier", fields, idFromSave == null && identifier != null ? "raw" : "derived");
  markString(name, "identity.name", fields);
  markString(server, "identity.server", fields, explicitServer ? "raw" : "derived");
  markString(prefix, "identity.prefix", fields);
  mark(fields, "identity.own", own == null ? "missing" : "available", own == null ? undefined : "raw");
  markString(description, "identity.description", fields);

  const coa = resolveCoa(group, identifier, options, fields);
  const rank = readOptionalNumber(group, ["rank", "Rank", "guildRank", "Guild Rank"], "progression.rank", fields);
  const honor = readSaveNumber(saveArray, 13, "progression.honor", fields);

  const portalWord4 = readSaveNumber(saveArray, 4, "combatProgress.portal.word4", fields);
  const portalWord5 = readSaveNumber(saveArray, 5, "combatProgress.portal.word5", fields);
  const portalWord6 = readSaveNumber(saveArray, 6, "combatProgress.portal.word6", fields);
  const portalWord7 = readSaveNumber(saveArray, 7, "combatProgress.portal.word7", fields);
  const raid = readSaveNumber(saveArray, 8, "combatProgress.raid", fields);
  const portalLifeLow = upperShort(portalWord4);
  const portalLifeHigh = upperShort(portalWord5);
  const portalLife = portalLifeLow == null || portalLifeHigh == null ? null : portalLifeLow + portalLifeHigh * 0x10000;
  const portalPercent = upperShort(portalWord6);
  const portalFloor = upperShort(portalWord7);
  mark(fields, "combatProgress.portal.life", portalLife == null ? "missing" : "available", portalLife == null ? undefined : "derived");
  mark(fields, "combatProgress.portal.percent", portalPercent == null ? "missing" : "available", portalPercent == null ? undefined : "derived");
  mark(fields, "combatProgress.portal.floor", portalFloor == null ? "missing" : "available", portalFloor == null ? undefined : "derived");

  const petId = readSaveNumber(saveArray, 377, "combatProgress.pet.id", fields);
  const petLevel = readSaveNumber(saveArray, 378, "combatProgress.pet.level", fields);
  const hydra = readSaveNumber(saveArray, 379, "combatProgress.hydra.level", fields);
  const hydraMax = readSaveNumber(saveArray, 380, "combatProgress.hydra.max", fields);
  const petClassIndex = petId ? PET_CLASSES[petId - 1] : undefined;
  const petClass = petClassIndex == null ? null : petClassIndex + 1;
  mark(fields, "combatProgress.pet.class", petClass == null ? (petId == null ? "missing" : "invalid") : "available", petClass == null ? undefined : "derived");

  const members: NormalizedGuildMember[] = [];
  let usedModernActions = false;
  for (let slot = 0; slot < MEMBER_SLOT_COUNT; slot += 1) {
    const { member, usedModernActions: memberUsedModernActions } = normalizeMember(
      saveArray,
      group,
      slot,
      members.length,
      server,
      offset,
    );
    if (memberUsedModernActions) usedModernActions = true;
    if (member) members.push(member);
  }

  const totalTreasure = saveArray ? calculateTotalBonus(members.map((member) => member.bonuses.treasure)) : null;
  const totalInstructor = saveArray ? calculateTotalBonus(members.map((member) => member.bonuses.instructor)) : null;
  mark(fields, "bonuses.totalTreasure", totalTreasure == null ? "missing" : "available", totalTreasure == null ? undefined : "calculated");
  mark(fields, "bonuses.totalInstructor", totalInstructor == null ? "missing" : "available", totalInstructor == null ? undefined : "calculated");
  const membersTotal = saveArray ? members.length : null;
  mark(fields, "totals.membersTotal", membersTotal == null ? "missing" : "available", membersTotal == null ? undefined : "derived");

  const totalKnights = readSaveNumber(saveArray, 370, "totals.totalKnights", fields);
  const totalKnights15 = readSaveNumber(saveArray, 371, "totals.totalKnights15", fields);
  const underAttackId = readSaveNumber(saveArray, 364, "combatProgress.combatState.underAttackId", fields);
  const attackingId = readSaveNumber(saveArray, 366, "combatProgress.combatState.attackingId", fields);
  mark(fields, "combatProgress.combatState.isUnderAttack", underAttackId == null ? "missing" : "available", underAttackId == null ? undefined : "derived");
  mark(fields, "combatProgress.combatState.isAttacking", attackingId == null ? "missing" : "available", attackingId == null ? undefined : "derived");

  const tournament = readTournament(group, fields);

  return {
    identity: {
      id,
      identifier,
      name,
      server,
      prefix,
      coa,
      own,
      timestamp,
      description,
    },
    progression: {
      rank,
      honor,
    },
    bonuses: {
      totalTreasure,
      totalInstructor,
    },
    totals: {
      membersTotal,
      totalKnights,
      totalKnights15,
    },
    combatProgress: {
      raid,
      portal: {
        life: portalLife,
        percent: portalPercent,
        floor: portalFloor,
      },
      hydra: {
        level: hydra,
        max: hydraMax,
      },
      pet: {
        id: petId,
        level: petLevel,
        class: petClass,
        stats: {
          strength: readSaveNumber(saveArray, 385, "combatProgress.pet.stats.strength", fields),
          dexterity: readSaveNumber(saveArray, 386, "combatProgress.pet.stats.dexterity", fields),
          intelligence: readSaveNumber(saveArray, 387, "combatProgress.pet.stats.intelligence", fields),
          constitution: readSaveNumber(saveArray, 388, "combatProgress.pet.stats.constitution", fields),
          luck: readSaveNumber(saveArray, 389, "combatProgress.pet.stats.luck", fields),
        },
      },
      combatState: {
        isUnderAttack: toBooleanFlag(underAttackId),
        underAttackId,
        isAttacking: toBooleanFlag(attackingId),
        attackingId,
      },
    },
    members,
    tournament,
    metadata: {
      format: saveArray ? (usedModernActions ? "modernActions" : "legacyActions") : "unknown",
      fields,
    },
  };
}

const findArrayInRawScan = (value: JsonRecord, keys: readonly string[]): unknown[] => {
  for (const key of keys) {
    const direct = value[key];
    if (Array.isArray(direct)) return direct;
  }

  const nested = asRecord(value.data);
  if (nested) {
    for (const key of keys) {
      const direct = nested[key];
      if (Array.isArray(direct)) return direct;
    }
  }

  return [];
};

export function normalizeSfGuildsFromScan(scan: unknown): NormalizedGuild[] {
  const record = asRecord(scan);
  if (!record) return [];
  const fallbackServer = normalizeGuildScanServer(pickFirst(record, ["prefix", "server", "Server", "world", "realm"]));
  const derivedGuildCoaByIdentifier = asRecord(record.derivedGuildCoa)?.guildCoaByIdentifier as
    | Record<string, string>
    | undefined;

  return findArrayInRawScan(record, ["groups", "guilds"])
    .map((group) => normalizeSfGuild(group, { fallbackServer, derivedGuildCoaByIdentifier }))
    .filter((guild): guild is NormalizedGuild => Boolean(guild));
}
