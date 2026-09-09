import type { SfDataHubLocalScan } from "../guilds/localScanLibrary";
import type { FightTrackerGuild, FightTrackerMember, GuildFight } from "../../pages/GuildHub/fightTrackingStore";

export const SFDATAHUB_TRANSFER_FORMAT = "sfdatahub-transfer";
export const SFDATAHUB_TRANSFER_VERSION = 1;

export type SfDataHubTransferType = "scan" | "scanpack" | "fighttracker" | "fighttrackerpack";

export type SfDataHubScanpackPayload = {
  scans: SfDataHubLocalScan[];
};

export type SfDataHubFightTrackerPayload = {
  tracker: FightTrackerGuild;
  members: FightTrackerMember[];
  fights: GuildFight[];
};

export type SfDataHubFightTrackerPackPayload = {
  trackers: SfDataHubFightTrackerPayload[];
};

export type SfDataHubTransferPayloadByType = {
  scan: SfDataHubLocalScan;
  scanpack: SfDataHubScanpackPayload;
  fighttracker: SfDataHubFightTrackerPayload;
  fighttrackerpack: SfDataHubFightTrackerPackPayload;
};

export type SfDataHubTransferEnvelope<T extends SfDataHubTransferType = SfDataHubTransferType> = {
  format: typeof SFDATAHUB_TRANSFER_FORMAT;
  version: typeof SFDATAHUB_TRANSFER_VERSION;
  type: T;
  createdAt: string;
  source: "sfdatahub";
  payload: SfDataHubTransferPayloadByType[T];
};

export type SfDataHubAnyTransferEnvelope = {
  [Type in SfDataHubTransferType]: SfDataHubTransferEnvelope<Type>;
}[SfDataHubTransferType];

type JsonRecord = Record<string, unknown>;

export function createSfDataHubTransferEnvelope<T extends SfDataHubTransferType>(
  type: T,
  payload: SfDataHubTransferPayloadByType[T],
): SfDataHubTransferEnvelope<T> {
  return {
    format: SFDATAHUB_TRANSFER_FORMAT,
    version: SFDATAHUB_TRANSFER_VERSION,
    type,
    createdAt: new Date().toISOString(),
    source: "sfdatahub",
    payload,
  };
}

export function parseSfDataHubTransferEnvelope(content: string): SfDataHubAnyTransferEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Transferdatei ist kein gültiges JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Transferdatei muss ein JSON-Objekt sein.");
  }
  if (parsed.format !== SFDATAHUB_TRANSFER_FORMAT) {
    throw new Error("Unbekanntes Transferformat.");
  }
  if (parsed.version !== SFDATAHUB_TRANSFER_VERSION) {
    throw new Error("Diese Transferformat-Version wird nicht unterstützt.");
  }
  if (!isTransferType(parsed.type)) {
    throw new Error("Unbekannter Transfer-Datentyp.");
  }
  if (typeof parsed.createdAt !== "string" || !parsed.createdAt.trim()) {
    throw new Error("Transferdatei enthält kein gültiges Erstellungsdatum.");
  }
  if (parsed.source !== "sfdatahub") {
    throw new Error("Transferdatei enthält keine gültige Quelle.");
  }

  validatePayload(parsed.type, parsed.payload);

  return parsed as SfDataHubAnyTransferEnvelope;
}

export function stringifySfDataHubTransfer(envelope: SfDataHubAnyTransferEnvelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function createSfDataFileName(type: SfDataHubTransferType, name?: string | null, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  if (type === "fighttracker") {
    const safeName = sanitizeFileSegment(name || "tracker");
    return `sfdatahub-fighttracker-${safeName}-${day}.sfdata`;
  }
  if (type === "fighttrackerpack") {
    return `sfdatahub-fighttrackerpack-${day}.sfdata`;
  }
  return `sfdatahub-${type}-${day}.sfdata`;
}

function validatePayload(type: SfDataHubTransferType, payload: unknown) {
  if (type === "scan") {
    validateScanPayload(payload);
    return;
  }
  if (type === "scanpack") {
    if (!isRecord(payload) || !Array.isArray(payload.scans)) {
      throw new Error("Scanpack-Payload muss scans[] enthalten.");
    }
    payload.scans.forEach(validateScanPayload);
    return;
  }

  if (type === "fighttrackerpack") {
    if (!isRecord(payload) || !Array.isArray(payload.trackers)) {
      throw new Error("Fight-Tracker-Pack-Payload muss trackers[] enthalten.");
    }
    if (!payload.trackers.length) {
      throw new Error("Fight-Tracker-Pack enthält keine Tracker.");
    }
    payload.trackers.forEach(validateFightTrackerPayload);
    return;
  }

  validateFightTrackerPayload(payload);
}

function validateScanPayload(payload: unknown): asserts payload is SfDataHubLocalScan {
  if (!isRecord(payload)) {
    throw new Error("Scan-Payload muss ein Objekt sein.");
  }
  requireString(payload, "id", "Scan");
  requireString(payload, "contentHash", "Scan");
  requireString(payload, "filename", "Scan");
  requireString(payload, "importedAt", "Scan");
  requireNullableString(payload, "scannedAt", "Scan");
  requireArray(payload, "servers", "Scan");
  requireNumber(payload, "playerCount", "Scan");
  requireNumber(payload, "groupCount", "Scan");
  if (!Object.prototype.hasOwnProperty.call(payload, "rawData")) {
    throw new Error("Scan-Payload enthält keine rawData.");
  }
}

function validateFightTrackerPayload(payload: unknown): asserts payload is SfDataHubFightTrackerPayload {
  if (!isRecord(payload)) {
    throw new Error("Fight-Tracker-Payload muss ein Objekt sein.");
  }
  const tracker = payload.tracker;
  if (!isRecord(tracker)) {
    throw new Error("Fight-Tracker-Payload enthält keinen Tracker.");
  }
  requireString(tracker, "id", "Fight Tracker");
  requireString(tracker, "name", "Fight Tracker");
  requireString(tracker, "source", "Fight Tracker");
  requireNullableString(tracker, "server", "Fight Tracker");
  requireNullableString(tracker, "linkedGuildHubGuildId", "Fight Tracker");
  requireNullableString(tracker, "linkedGuildHubLogoIdentifier", "Fight Tracker");
  requireNullableString(tracker, "lastSyncedScanId", "Fight Tracker");
  requireNullableString(tracker, "lastSyncedScanAt", "Fight Tracker");
  requireString(tracker, "createdAt", "Fight Tracker");
  requireString(tracker, "updatedAt", "Fight Tracker");

  const members = payload.members;
  const fights = payload.fights;
  if (!Array.isArray(members) || !Array.isArray(fights)) {
    throw new Error("Fight-Tracker-Payload muss members[] und fights[] enthalten.");
  }

  members.forEach((member) => {
    if (!isRecord(member)) throw new Error("Fight-Tracker-Member muss ein Objekt sein.");
    requireString(member, "id", "Fight-Tracker-Member");
    requireString(member, "trackerId", "Fight-Tracker-Member");
    requireString(member, "name", "Fight-Tracker-Member");
    if (member.trackerId !== tracker.id) {
      throw new Error("Fight-Tracker-Member verweist auf einen anderen Tracker.");
    }
  });

  fights.forEach((fight) => {
    if (!isRecord(fight)) throw new Error("Fight-Tracker-Fight muss ein Objekt sein.");
    requireString(fight, "id", "Fight-Tracker-Fight");
    requireString(fight, "trackerId", "Fight-Tracker-Fight");
    requireArray(fight, "rosterSnapshot", "Fight-Tracker-Fight");
    requireArray(fight, "missedMemberIds", "Fight-Tracker-Fight");
    if (fight.trackerId !== tracker.id) {
      throw new Error("Fight-Tracker-Fight verweist auf einen anderen Tracker.");
    }
  });
}

function isTransferType(value: unknown): value is SfDataHubTransferType {
  return value === "scan" || value === "scanpack" || value === "fighttracker" || value === "fighttrackerpack";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(record: JsonRecord, key: string, label: string) {
  if (typeof record[key] !== "string" || !String(record[key]).trim()) {
    throw new Error(`${label}: Pflichtfeld ${key} fehlt oder ist ungültig.`);
  }
}

function requireNullableString(record: JsonRecord, key: string, label: string) {
  if (record[key] !== null && typeof record[key] !== "string") {
    throw new Error(`${label}: Feld ${key} ist ungültig.`);
  }
}

function requireNumber(record: JsonRecord, key: string, label: string) {
  if (typeof record[key] !== "number" || !Number.isFinite(record[key])) {
    throw new Error(`${label}: Feld ${key} ist ungültig.`);
  }
}

function requireArray(record: JsonRecord, key: string, label: string) {
  if (!Array.isArray(record[key])) {
    throw new Error(`${label}: Feld ${key} muss eine Liste sein.`);
  }
}

function sanitizeFileSegment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "daten";
}
