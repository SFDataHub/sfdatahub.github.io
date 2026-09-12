import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { NormalizedGuildRole } from "../../lib/guilds/guildScanNormalizer";

export type FightNumber = "1" | "2";
export type FightSource = "manual" | "ocr";
export type FightMemberStatus = "ok" | "missed" | "unknown";
export type FightTrackerGuildRole = NormalizedGuildRole;

export type FightTrackerGuild = {
  id: string;
  name: string;
  server: string | null;
  source: "manual" | "guild_scan";
  linkedGuildHubGuildId: string | null;
  linkedGuildHubLogoIdentifier: string | null;
  coaString?: string | null;
  lastSyncedScanId: string | null;
  lastSyncedScanAt: string | null;
  lastSyncedNormalizerVersion?: number | null;
  importedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FightTrackerMember = {
  id: string;
  trackerId: string;
  name: string;
  active: boolean;
  source: "manual" | "scan";
  scanMemberRef: string | null;
  className: string | null;
  level: number | null;
  baseStats: number | null;
  totalStats: number | null;
  statsSeenAt: string | null;
  guildRole: FightTrackerGuildRole;
  guildRoleSeenAt: string | null;
  lastSeenScanId: string | null;
  lastSeenScanAt: string | null;
  lastConfirmedActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FightMemberSnapshot = {
  id: string;
  name: string;
  className: string | null;
  level: number | null;
  guildId: string;
  guildName: string;
  server: string;
  capturedAt: string;
};

export type GuildFight = {
  id: string;
  trackerId: string;
  guildId: string;
  type: "attack";
  date: string;
  fightNumber: FightNumber;
  opponentGuild: string;
  source: FightSource;
  createdAt: string;
  rosterSnapshot: FightMemberSnapshot[];
  missedMemberIds: string[];
};

export type FightTrackerState = {
  tracker: FightTrackerGuild | null;
  members: FightTrackerMember[];
  fights: GuildFight[];
};

export type FightTrackerTransferState = {
  tracker: FightTrackerGuild;
  members: FightTrackerMember[];
  fights: GuildFight[];
};

export type FightTrackerSummary = {
  tracker: FightTrackerGuild;
  memberCount: number;
  activeMemberCount: number;
  fightCount: number;
  missedCount: number;
};

export type FightTrackerGuildHubIdentity = {
  id: string;
  guildId: string;
  logoIdentifier: string;
  server: string;
};

export type CreateFightTrackerMemberInput = {
  name: string;
  active?: boolean;
  source: "manual" | "scan";
  scanMemberRef?: string | null;
  className?: string | null;
  level?: number | null;
  baseStats?: number | null;
  totalStats?: number | null;
  statsSeenAt?: string | null;
  guildRole?: FightTrackerGuildRole;
  guildRoleSeenAt?: string | null;
  lastSeenScanId?: string | null;
  lastSeenScanAt?: string | null;
  lastConfirmedActiveAt?: string | null;
};

export type CreateFightTrackerInput = {
  name: string;
  server?: string | null;
  source: "manual" | "guild_scan";
  linkedGuildHubGuildId?: string | null;
  linkedGuildHubLogoIdentifier?: string | null;
  coaString?: string | null;
  lastSyncedScanId?: string | null;
  lastSyncedScanAt?: string | null;
  lastSyncedNormalizerVersion?: number | null;
  members?: CreateFightTrackerMemberInput[];
};

type FightTrackerStateRecord = {
  key: string;
  value: unknown;
  updatedAt: string;
};

interface FightTrackingDb extends DBSchema {
  trackers: {
    key: string;
    value: FightTrackerGuild;
  };
  members: {
    key: string;
    value: FightTrackerMember;
    indexes: {
      by_trackerId: string;
    };
  };
  fights: {
    key: string;
    value: GuildFight;
    indexes: {
      by_trackerId: string;
    };
  };
  state: {
    key: string;
    value: FightTrackerStateRecord;
  };
}

const DB_NAME = "sfdatahub-guild-fight-tracking";
const DB_VERSION = 1;
const ACTIVE_TRACKER_STATE_KEY = "active-tracker";

let dbPromise: Promise<IDBPDatabase<FightTrackingDb>> | null = null;

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeIdentityText = (value: unknown) => normalizeText(value).toLowerCase().replace(/\s+/g, "");

const normalizeGuildRole = (value: unknown): FightTrackerGuildRole =>
  value === "leader" || value === "officer" || value === "member" ? value : null;

const normalizeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeVersion = (value: unknown) => {
  const parsed = normalizeNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
};

const timestampMs = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const createId = (prefix: string) => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}:${Date.now().toString(36)}:${random}`;
};

function getFightTrackingDb() {
  if (!dbPromise) {
    dbPromise = openDB<FightTrackingDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("trackers")) {
          db.createObjectStore("trackers", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("members")) {
          const store = db.createObjectStore("members", { keyPath: "id" });
          store.createIndex("by_trackerId", "trackerId");
        }
        if (!db.objectStoreNames.contains("fights")) {
          const store = db.createObjectStore("fights", { keyPath: "id" });
          store.createIndex("by_trackerId", "trackerId");
        }
        if (!db.objectStoreNames.contains("state")) {
          db.createObjectStore("state", { keyPath: "key" });
        }
      },
    });
  }

  return dbPromise;
}

async function setActiveTrackerId(id: string) {
  const db = await getFightTrackingDb();
  await db.put("state", {
    key: ACTIVE_TRACKER_STATE_KEY,
    value: id,
    updatedAt: new Date().toISOString(),
  });
}

async function readFightTrackerStateByTracker(tracker: FightTrackerGuild): Promise<FightTrackerState> {
  const db = await getFightTrackingDb();
  const [members, fights] = await Promise.all([
    db.getAllFromIndex("members", "by_trackerId", tracker.id),
    db.getAllFromIndex("fights", "by_trackerId", tracker.id),
  ]);

  return {
    tracker,
    members: members.sort((a, b) => a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" })),
    fights,
  };
}

async function readActiveManualTrackerState(): Promise<FightTrackerState> {
  const db = await getFightTrackingDb();
  const state = await db.get("state", ACTIVE_TRACKER_STATE_KEY);
  const trackerId = typeof state?.value === "string" ? state.value : null;
  if (!trackerId) return { tracker: null, members: [], fights: [] };

  const tracker = (await db.get("trackers", trackerId)) ?? null;
  if (!tracker || tracker.source !== "manual" || tracker.linkedGuildHubGuildId || tracker.linkedGuildHubLogoIdentifier) {
    return { tracker: null, members: [], fights: [] };
  }

  return readFightTrackerStateByTracker(tracker);
}

export const isFightTrackerLinkedToGuild = (tracker: FightTrackerGuild, guild: FightTrackerGuildHubIdentity) => {
  const trackerLogo = normalizeIdentityText(tracker.linkedGuildHubLogoIdentifier);
  const guildLogo = normalizeIdentityText(guild.logoIdentifier || guild.id);
  if (trackerLogo && guildLogo && trackerLogo === guildLogo) return true;

  const trackerGuildId = normalizeIdentityText(tracker.linkedGuildHubGuildId);
  const guildId = normalizeIdentityText(guild.guildId);
  const trackerServer = normalizeIdentityText(tracker.server);
  const guildServer = normalizeIdentityText(guild.server);
  return Boolean(trackerGuildId && guildId && trackerGuildId === guildId && trackerServer && guildServer && trackerServer === guildServer);
};

export async function readFightTrackerState(guild: FightTrackerGuildHubIdentity | null): Promise<FightTrackerState> {
  const db = await getFightTrackingDb();
  if (!guild) return readActiveManualTrackerState();

  const trackers = await db.getAll("trackers");
  const matches = trackers.filter((tracker) => isFightTrackerLinkedToGuild(tracker, guild));
  if (matches.length > 1) {
    throw new Error("Mehrere Fight Tracker passen zur aktiven Guild-Hub-Gilde. Bitte keine automatische Zuordnung vornehmen.");
  }
  if (!matches.length) return { tracker: null, members: [], fights: [] };

  await setActiveTrackerId(matches[0].id);
  return readFightTrackerStateByTracker(matches[0]);
}

export async function createFightTracker(input: CreateFightTrackerInput): Promise<FightTrackerState> {
  const now = new Date().toISOString();
  const tracker: FightTrackerGuild = {
    id: createId("fight-tracker"),
    name: normalizeText(input.name),
    server: normalizeText(input.server) || null,
    source: input.source,
    linkedGuildHubGuildId: normalizeText(input.linkedGuildHubGuildId) || null,
    linkedGuildHubLogoIdentifier: normalizeText(input.linkedGuildHubLogoIdentifier) || null,
    coaString: normalizeText(input.coaString) || null,
    lastSyncedScanId: normalizeText(input.lastSyncedScanId) || null,
    lastSyncedScanAt: normalizeText(input.lastSyncedScanAt) || null,
    lastSyncedNormalizerVersion: normalizeVersion(input.lastSyncedNormalizerVersion),
    createdAt: now,
    updatedAt: now,
  };
  const members = (input.members ?? [])
    .map((member) => createFightTrackerMemberRecord(tracker.id, member, now))
    .filter((member): member is FightTrackerMember => Boolean(member));

  const db = await getFightTrackingDb();
  const tx = db.transaction(["trackers", "members", "state"], "readwrite");
  await tx.objectStore("trackers").put(tracker);
  await Promise.all(members.map((member) => tx.objectStore("members").put(member)));
  await tx.objectStore("state").put({
    key: ACTIVE_TRACKER_STATE_KEY,
    value: tracker.id,
    updatedAt: now,
  });
  await tx.done;

  return { tracker, members, fights: [] };
}

export async function readFightTrackers(): Promise<FightTrackerGuild[]> {
  const db = await getFightTrackingDb();
  const trackers = await db.getAll("trackers");
  return trackers.sort((a, b) => a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" }));
}

export async function readFightTrackerSummaries(): Promise<FightTrackerSummary[]> {
  const db = await getFightTrackingDb();
  const trackers = await readFightTrackers();
  const summaries = await Promise.all(
    trackers.map(async (tracker) => {
      const [members, fights] = await Promise.all([
        db.getAllFromIndex("members", "by_trackerId", tracker.id),
        db.getAllFromIndex("fights", "by_trackerId", tracker.id),
      ]);
      return {
        tracker,
        memberCount: members.length,
        activeMemberCount: members.filter((member) => member.active).length,
        fightCount: fights.length,
        missedCount: fights.reduce((sum, fight) => sum + fight.missedMemberIds.length, 0),
      };
    }),
  );
  return summaries.sort((a, b) => a.tracker.name.localeCompare(b.tracker.name, "de-DE", { sensitivity: "base" }));
}

export async function readFightTrackerTransferState(trackerId: string): Promise<FightTrackerTransferState | null> {
  const db = await getFightTrackingDb();
  const tracker = (await db.get("trackers", trackerId)) ?? null;
  if (!tracker) return null;
  const [members, fights] = await Promise.all([
    db.getAllFromIndex("members", "by_trackerId", tracker.id),
    db.getAllFromIndex("fights", "by_trackerId", tracker.id),
  ]);
  return { tracker, members, fights };
}

export async function importFightTrackerTransferState(input: FightTrackerTransferState): Promise<FightTrackerState> {
  const [state] = await importFightTrackerTransferStates([input]);
  return state;
}

export async function importFightTrackerTransferStates(inputs: FightTrackerTransferState[]): Promise<FightTrackerState[]> {
  if (!inputs.length) throw new Error("Fight-Tracker-Pack enthält keine Tracker.");

  const sourceTrackerIds = new Set<string>();
  inputs.forEach((input) => {
    if (sourceTrackerIds.has(input.tracker.id)) {
      throw new Error("Fight-Tracker-Pack enthält doppelte Tracker-IDs.");
    }
    sourceTrackerIds.add(input.tracker.id);
  });

  const importedAt = new Date().toISOString();
  const states = inputs.map((input) => prepareImportedFightTrackerState(input, importedAt));
  const db = await getFightTrackingDb();
  const tx = db.transaction(["trackers", "members", "fights", "state"], "readwrite");
  await Promise.all([
    ...states.map((state) => tx.objectStore("trackers").add(state.tracker!)),
    ...states.flatMap((state) => state.members.map((member) => tx.objectStore("members").add(member))),
    ...states.flatMap((state) => state.fights.map((fight) => tx.objectStore("fights").add(fight))),
    tx.objectStore("state").put({
      key: ACTIVE_TRACKER_STATE_KEY,
      value: states[states.length - 1].tracker!.id,
      updatedAt: importedAt,
    }),
  ]);
  await tx.done;

  return states;
}

function prepareImportedFightTrackerState(input: FightTrackerTransferState, importedAt: string): FightTrackerState {
  validateFightTrackerTransferInput(input);

  const nextTrackerId = createId("fight-tracker");
  const memberIdMap = new Map(input.members.map((member) => [member.id, createId("fight-member")]));
  const nextTracker: FightTrackerGuild = {
    ...input.tracker,
    id: nextTrackerId,
    importedAt,
  };
  const nextMembers = input.members.map((member) => ({
    ...member,
    id: memberIdMap.get(member.id)!,
    trackerId: nextTrackerId,
  }));
  const nextFights = input.fights.map((fight) => ({
    ...fight,
    id: createId("fight"),
    trackerId: nextTrackerId,
    rosterSnapshot: fight.rosterSnapshot.map((member) => ({
      ...member,
      id: memberIdMap.get(member.id)!,
      guildId: nextTrackerId,
      guildName: nextTracker.name,
      server: nextTracker.server ?? "",
    })),
    missedMemberIds: fight.missedMemberIds.map((memberId) => memberIdMap.get(memberId)!),
  }));

  return { tracker: nextTracker, members: nextMembers, fights: nextFights };
}

function validateFightTrackerTransferInput(input: FightTrackerTransferState) {
  const trackerId = input.tracker.id;
  const memberIds = new Set<string>();
  input.members.forEach((member) => {
    if (member.trackerId !== trackerId) {
      throw new Error(`Fight Tracker "${input.tracker.name}" enthält Member mit falscher Tracker-Referenz.`);
    }
    if (memberIds.has(member.id)) {
      throw new Error(`Fight Tracker "${input.tracker.name}" enthält doppelte Member-IDs.`);
    }
    memberIds.add(member.id);
  });

  const fightIds = new Set<string>();
  input.fights.forEach((fight) => {
    if (fight.trackerId !== trackerId) {
      throw new Error(`Fight Tracker "${input.tracker.name}" enthält Fights mit falscher Tracker-Referenz.`);
    }
    if (fightIds.has(fight.id)) {
      throw new Error(`Fight Tracker "${input.tracker.name}" enthält doppelte Fight-IDs.`);
    }
    fightIds.add(fight.id);
    fight.rosterSnapshot.forEach((member) => {
      if (!memberIds.has(member.id)) {
        throw new Error(`Fight Tracker "${input.tracker.name}" enthält Roster-Verweise auf unbekannte Member.`);
      }
    });
    fight.missedMemberIds.forEach((memberId) => {
      if (!memberIds.has(memberId)) {
        throw new Error(`Fight Tracker "${input.tracker.name}" enthält Missed-Verweise auf unbekannte Member.`);
      }
    });
  });
}

export async function readFightTrackerStateById(trackerId: string): Promise<FightTrackerState> {
  const db = await getFightTrackingDb();
  const tracker = (await db.get("trackers", trackerId)) ?? null;
  if (!tracker) return { tracker: null, members: [], fights: [] };
  await setActiveTrackerId(tracker.id);
  return readFightTrackerStateByTracker(tracker);
}

export async function renameFightTracker(tracker: FightTrackerGuild, name: string): Promise<FightTrackerGuild> {
  const trimmedName = normalizeText(name);
  if (!trimmedName || trimmedName === tracker.name) return tracker;

  const updated: FightTrackerGuild = {
    ...tracker,
    name: trimmedName,
    updatedAt: new Date().toISOString(),
  };
  const db = await getFightTrackingDb();
  await db.put("trackers", updated);
  return updated;
}

export async function deleteFightTracker(trackerId: string): Promise<void> {
  const db = await getFightTrackingDb();
  const [members, fights, state] = await Promise.all([
    db.getAllFromIndex("members", "by_trackerId", trackerId),
    db.getAllFromIndex("fights", "by_trackerId", trackerId),
    db.get("state", ACTIVE_TRACKER_STATE_KEY),
  ]);
  const tx = db.transaction(["trackers", "members", "fights", "state"], "readwrite");
  await Promise.all([
    tx.objectStore("trackers").delete(trackerId),
    ...members.map((member) => tx.objectStore("members").delete(member.id)),
    ...fights.map((fight) => tx.objectStore("fights").delete(fight.id)),
    state?.value === trackerId ? tx.objectStore("state").delete(ACTIVE_TRACKER_STATE_KEY) : Promise.resolve(),
  ]);
  await tx.done;
}

export async function deleteFightTrackerMember(
  trackerId: string,
  memberId: string,
): Promise<{ deleted: boolean; fights: GuildFight[] }> {
  const db = await getFightTrackingDb();
  const member = (await db.get("members", memberId)) ?? null;
  if (!member || member.trackerId !== trackerId) {
    return { deleted: false, fights: await db.getAllFromIndex("fights", "by_trackerId", trackerId) };
  }

  const fights = await db.getAllFromIndex("fights", "by_trackerId", trackerId);
  const updatedFights = fights.map((fight) => ({
    ...fight,
    rosterSnapshot: fight.rosterSnapshot.filter((snapshotMember) => snapshotMember.id !== memberId),
    missedMemberIds: fight.missedMemberIds.filter((id) => id !== memberId),
  }));

  const tx = db.transaction(["members", "fights"], "readwrite");
  await Promise.all([
    tx.objectStore("members").delete(memberId),
    ...updatedFights.map((fight) => tx.objectStore("fights").put(fight)),
  ]);
  await tx.done;

  return { deleted: true, fights: updatedFights };
}

export async function deleteFightTrackerFight(
  trackerId: string,
  fightId: string,
): Promise<{ deleted: boolean; fights: GuildFight[] }> {
  const db = await getFightTrackingDb();
  const fight = (await db.get("fights", fightId)) ?? null;
  if (!fight || fight.trackerId !== trackerId) {
    return { deleted: false, fights: await db.getAllFromIndex("fights", "by_trackerId", trackerId) };
  }

  await db.delete("fights", fightId);
  return { deleted: true, fights: await db.getAllFromIndex("fights", "by_trackerId", trackerId) };
}

export async function addFightTrackerMember(
  trackerId: string,
  input: CreateFightTrackerMemberInput,
): Promise<FightTrackerMember | null> {
  const now = new Date().toISOString();
  const member = createFightTrackerMemberRecord(trackerId, input, now);
  if (!member) return null;

  const db = await getFightTrackingDb();
  await db.put("members", member);
  return member;
}

export async function putFightTrackerMember(member: FightTrackerMember): Promise<void> {
  const db = await getFightTrackingDb();
  await db.put("members", { ...member, updatedAt: new Date().toISOString() });
}

export async function putFightTrackerFight(fight: GuildFight): Promise<void> {
  const db = await getFightTrackingDb();
  await db.put("fights", fight);
}

export async function updateFightTrackerSyncMetadata(
  tracker: FightTrackerGuild,
  scanId: string | null,
  scanAt: string | null,
  normalizerVersion?: number | null,
  coaString?: string | null,
): Promise<FightTrackerGuild> {
  const scanAtMs = timestampMs(scanAt);
  const lastSyncedScanAtMs = timestampMs(tracker.lastSyncedScanAt);
  const canStoreIncomingScan = scanAtMs == null ? lastSyncedScanAtMs == null : lastSyncedScanAtMs == null || scanAtMs >= lastSyncedScanAtMs;
  const nextSyncedScanAt = canStoreIncomingScan && scanAtMs != null ? new Date(scanAtMs).toISOString() : tracker.lastSyncedScanAt;
  const nextSyncedScanId = canStoreIncomingScan ? scanId : tracker.lastSyncedScanId;
  const existingVersion = normalizeVersion(tracker.lastSyncedNormalizerVersion);
  const incomingVersion = normalizeVersion(normalizerVersion);
  const nextNormalizerVersion =
    incomingVersion == null ? existingVersion : Math.max(existingVersion ?? Number.NEGATIVE_INFINITY, incomingVersion);
  const nextCoaString = normalizeText(coaString) || tracker.coaString || null;
  const updated: FightTrackerGuild = {
    ...tracker,
    lastSyncedScanId: nextSyncedScanId,
    lastSyncedScanAt: nextSyncedScanAt,
    lastSyncedNormalizerVersion: nextNormalizerVersion,
    coaString: nextCoaString,
    updatedAt: new Date().toISOString(),
  };
  const db = await getFightTrackingDb();
  await db.put("trackers", updated);
  await setActiveTrackerId(updated.id);
  return updated;
}

function createFightTrackerMemberRecord(
  trackerId: string,
  input: CreateFightTrackerMemberInput,
  now: string,
): FightTrackerMember | null {
  const name = normalizeText(input.name);
  if (!name) return null;
  const isActive = input.active ?? true;
  const baseStats = normalizeNumber(input.baseStats);
  const totalStats = normalizeNumber(input.totalStats);
  const hasStats = baseStats != null || totalStats != null;
  return {
    id: createId("fight-member"),
    trackerId,
    name,
    active: isActive,
    source: input.source,
    scanMemberRef: normalizeText(input.scanMemberRef) || null,
    className: normalizeText(input.className) || null,
    level: normalizeNumber(input.level),
    baseStats,
    totalStats,
    statsSeenAt: hasStats ? normalizeText(input.statsSeenAt) || null : null,
    guildRole: normalizeGuildRole(input.guildRole),
    guildRoleSeenAt: normalizeGuildRole(input.guildRole)
      ? normalizeText(input.guildRoleSeenAt) || normalizeText(input.lastSeenScanAt) || null
      : null,
    lastSeenScanId: normalizeText(input.lastSeenScanId) || null,
    lastSeenScanAt: normalizeText(input.lastSeenScanAt) || null,
    lastConfirmedActiveAt:
      normalizeText(input.lastConfirmedActiveAt) ||
      normalizeText(input.lastSeenScanAt) ||
      (isActive && input.source === "manual" ? now : null),
    createdAt: now,
    updatedAt: now,
  };
}
