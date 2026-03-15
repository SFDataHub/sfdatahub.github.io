import React from "react";
import {
  parseSaveStringToArray,
  parseSfJson,
  type SfJsonOwnPlayer,
  type SfJsonParseResult,
} from "../../lib/parsing";
import PortraitPreview from "../avatar/PortraitPreview";
import {
  createPortraitOptionsFromAvatarSnapshot,
  saveAvatarSnapshotForIdentifier,
} from "../../lib/firebase/avatarSnapshots";
import { mergeCoaStringIntoMembersSummaryLatest } from "../../lib/import/importer";
import {
  isFirestoreReadTraceEnabled,
  isFirestoreWriteTraceEnabled,
  reportReadSummary,
  reportWriteSummary,
  startReadTraceSession,
} from "../../lib/debug/firestoreReadTrace";
import { useAuth } from "../../context/AuthContext";
import { CoaRenderer } from "https://sf-libs.12hp.de/coa-lib/coa-lib-1.0.0.min.js";
import styles from "./UploadCenterV2JsonImport.module.css";

type FieldDefinition = {
  key: keyof SfJsonOwnPlayer;
  label: string;
};

type TableMode = "overview" | "player" | "group";
type ImportMode = "mapping" | "coa_import" | "avatar_import";
type CoaPreviewCandidate = {
  key: string;
  source: string;
  coaString: string;
  guildName: string | null;
};
type CoaBatchTarget = {
  guildId: string;
  guildName: string | null;
  coaString: string;
  source: string;
};
type CoaBatchExtraction = {
  recognizedGuilds: number;
  recognizedGuildEntries: number;
  duplicateGuildEntries: number;
  skippedMissingCoa: number;
  skippedInvalidCoa: number;
  targets: CoaBatchTarget[];
};

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: "identifier", label: "Identifier" },
  { key: "playerId", label: "Player ID" },
  { key: "server", label: "Server" },
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
  { key: "guildName", label: "Guild Name" },
  { key: "portrait", label: "Portrait" },
  { key: "saveArray", label: "Save Array" },
  { key: "saveString", label: "Save String" },
  { key: "saveModel", label: "Save Model" },
  { key: "dungeons", label: "Dungeons" },
  { key: "groupTournament", label: "Group Tournament" },
  { key: "resources", label: "Resources" },
  { key: "underworld", label: "Underworld" },
  { key: "equippedItems", label: "Equipped Items" },
  { key: "backpackItems", label: "Backpack Items" },
  { key: "companionItems", label: "Companion Items" },
  { key: "dummyItems", label: "Dummy Items" },
  { key: "shakesItems", label: "Shakes Items" },
  { key: "fidgetItems", label: "Fidget Items" },
  { key: "pets", label: "Pets" },
  { key: "scrapbook", label: "Scrapbook" },
  { key: "legendaryScrapbook", label: "Legendary Scrapbook" },
  { key: "idle", label: "Idle" },
  { key: "dailyTasks", label: "Daily Tasks" },
  { key: "achievements", label: "Achievements" },
  { key: "calendar", label: "Calendar" },
  { key: "units", label: "Units" },
  { key: "witch", label: "Witch" },
  { key: "timestamp", label: "Timestamp" },
  { key: "fortressRank", label: "Fortress Rank" },
  { key: "version", label: "Version" },
  { key: "webshopId", label: "Webshop ID" },
];

// Verified from:
// - sfdatahub-discord-bot/model.txt (#initOwn / #initOther / loadAttributes)
// - sfdatahub-discord-bot/src/scanMapping.ts (CONVERT_PLAYER_SAVE source indexes)
// - frame index from src/lib/parsing/extractPortrait.ts.
const PLAYER_SAVE_FIELD_LABELS: Record<number, string> = {
  1: "Player ID",
  2: "Last Online",
  7: "Level",
  8: "XP",
  9: "XP Next",
  10: "Honor",
  11: "Rank",
  17: "Mouth",
  18: "Hair",
  19: "Brows",
  20: "Eyes",
  21: "Beard",
  22: "Nose",
  23: "Ears",
  24: "Special",
  25: "Special 2",
  26: "Portrait",
  27: "Race (packed)",
  28: "Gender/Mirror/Server (packed)",
  29: "Class ID (packed)",
  30: "Strength Base",
  31: "Dexterity Base",
  32: "Intelligence Base",
  33: "Constitution Base",
  34: "Luck Base",
  35: "Strength Bonus",
  36: "Dexterity Bonus",
  37: "Intelligence Bonus",
  38: "Constitution Bonus",
  39: "Luck Bonus",
  286: "Mount",
  433: "Tower Field",
  435: "Raid Field",
  438: "Scrapbook Field",
  443: "Group Field",
  444: "Flags Field",
  445: "Dungeon Field",
  447: "Armor",
  448: "Damage Min",
  449: "Damage Max",
  493: "Potion Field A",
  494: "Potion Field B",
  495: "Potion Field C",
  499: "Potion Field D",
  500: "Potion Field E",
  501: "Potion Field F",
  502: "Potion Field G",
  517: "Flags Field A",
  521: "Flags Field B",
  524: "Fortress",
  525: "Laborer Quarters",
  526: "Woodcutter Guild",
  527: "Quarry",
  528: "Gem Mine",
  529: "Academy",
  530: "Archery Guild",
  531: "Barracks",
  532: "Mage Tower",
  533: "Treasury",
  534: "Smithy",
  535: "Fortifications",
  581: "Fortress Upgrades",
  582: "Fortress Honor",
  583: "Fortress Rank",
  705: "Frame ID",
};

for (let slot = 0; slot < 10; slot += 1) {
  const slotNumber = slot + 1;
  const slotStart = 48 + slot * 12;
  for (let fieldOffset = 0; fieldOffset < 12; fieldOffset += 1) {
    const index = slotStart + fieldOffset;
    PLAYER_SAVE_FIELD_LABELS[index] = `Item Slot ${slotNumber} Field ${fieldOffset + 1}`;
  }
}

const AVATAR_FIELD_INDEXES = new Set<number>([
  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 705,
]);

const GROUP_SAVE_FIELD_LABELS: Record<number, string> = {
  0: "Group ID",
  13: "Honor",
  364: "Under Attack ID",
  366: "Attacking ID",
  370: "Total Knights",
  371: "Total Knights 15",
  377: "Pet ID",
  378: "Pet",
  379: "Hydra",
  380: "Hydra Max",
  385: "Pet Strength",
  386: "Pet Dexterity",
  387: "Pet Intelligence",
  388: "Pet Constitution",
  389: "Pet Luck",
};

for (let i = 0; i < 50; i += 1) {
  GROUP_SAVE_FIELD_LABELS[14 + i] = `Member ${i + 1} ID`;
  GROUP_SAVE_FIELD_LABELS[64 + i] = `Member ${i + 1} State/Level`;
  GROUP_SAVE_FIELD_LABELS[114 + i] = `Member ${i + 1} Last Active`;
  GROUP_SAVE_FIELD_LABELS[214 + i] = `Member ${i + 1} Treasure`;
  GROUP_SAVE_FIELD_LABELS[264 + i] = `Member ${i + 1} Instructor`;
  GROUP_SAVE_FIELD_LABELS[314 + i] = `Member ${i + 1} Role`;
  GROUP_SAVE_FIELD_LABELS[390 + i] = `Member ${i + 1} Pet`;
  GROUP_SAVE_FIELD_LABELS[445 + i] = `Member ${i + 1} Action`;
}

const mapPlayerOwnToOtherFieldIndex = (ownIndex: number): number | null => {
  if (ownIndex === 1) return 0;
  if (ownIndex === 2) return 1;
  if (ownIndex >= 7 && ownIndex <= 11) return ownIndex - 5;
  if (ownIndex >= 17 && ownIndex <= 39) return ownIndex - 9;
  if (ownIndex >= 48 && ownIndex <= 167) return ownIndex - 9;
  if (ownIndex === 286) return 159;
  if (ownIndex === 433) return 160;
  if (ownIndex === 435) return 161;
  if (ownIndex === 438) return 163;
  if (ownIndex === 443) return 166;
  if (ownIndex === 444) return 167;
  if (ownIndex === 445) return 252;
  if (ownIndex === 447) return 168;
  if (ownIndex === 448) return 169;
  if (ownIndex === 449) return 170;
  if (ownIndex === 493) return 194;
  if (ownIndex === 494) return 195;
  if (ownIndex === 495) return 196;
  if (ownIndex === 499) return 200;
  if (ownIndex === 500) return 201;
  if (ownIndex === 501) return 202;
  if (ownIndex === 502) return 203;
  if (ownIndex === 517) return 204;
  if (ownIndex === 521) return 205;
  if (ownIndex >= 524 && ownIndex <= 535) return ownIndex - 316;
  if (ownIndex === 581) return 247;
  if (ownIndex === 582) return 248;
  return null;
};

const toPreviewString = (value: unknown): string => {
  if (value === undefined) return "(missing)";
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 0 ? value : '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    const preview = JSON.stringify(value.slice(0, 20));
    if (value.length > 20) {
      const prefix = preview.endsWith("]") ? preview.slice(0, -1) : preview;
      return `${prefix}, ...] (length=${value.length})`;
    }
    return preview;
  }

  try {
    const json = JSON.stringify(value);
    if (!json) return String(value);
    if (json.length > 500) return `${json.slice(0, 500)}...`;
    return json;
  } catch {
    return String(value);
  }
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const readString = (obj: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const readIdentifierString = (obj: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  }
  return null;
};

const normalizeLoose = (value: string) => value.trim().toLowerCase();
const isValidCoaString = (value: string) => value === "0" || /^[0-9a-f]{22}$/i.test(value);

const toNumberArray = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => {
    const num = typeof entry === "number" ? entry : Number(entry);
    return Number.isFinite(num) ? num : 0;
  });
};

const readNumber = (obj: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = obj[key];
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const findSelectedRawPlayer = (
  rawJson: unknown,
  selectedIdentifier: string,
  selectedPlayer: SfJsonOwnPlayer | null,
): Record<string, unknown> | null => {
  const root = asObject(rawJson);
  if (!root) return null;

  const playersRaw = Array.isArray(root.players) ? root.players : [];
  const candidates = playersRaw
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .filter((record) => {
      const identifier = readString(record, ["identifier"]);
      if (!identifier || !selectedIdentifier) return false;
      return normalizeLoose(identifier) === normalizeLoose(selectedIdentifier);
    });

  if (candidates.length === 0) return null;

  const ownMatch = candidates.find((record) => readNumber(record, ["own"]) === 1);
  if (ownMatch) return ownMatch;

  if (selectedPlayer) {
    const byPlayerId = candidates.find(
      (record) => readNumber(record, ["playerId", "id"]) === selectedPlayer.playerId,
    );
    if (byPlayerId) return byPlayerId;
  }

  return candidates[0];
};

const extractCoaFromGroup = (group: Record<string, unknown>): string | null => {
  const direct = readString(group, [
    "coaString",
    "coa",
    "coa_string",
    "coatOfArms",
    "coat_of_arms",
    "emblem",
    "emblemString",
  ]);
  if (direct) return direct;

  const save = group.save;
  if (Array.isArray(save)) {
    const maybe = save[1];
    if (typeof maybe === "string" && maybe.trim()) return maybe.trim();
  }

  return null;
};

const COA_SOURCE_KEYS = [
  "coaString",
  "coa",
  "coa_string",
  "coatOfArms",
  "coat_of_arms",
  "emblem",
  "emblemString",
] as const;

const findMatchedRawGroup = (
  rawJson: unknown,
  selectedRawObj: Record<string, unknown> | null,
  selectedPlayer: SfJsonOwnPlayer | null,
): Record<string, unknown> | null => {
  const root = asObject(rawJson);
  if (!root) return null;

  const groupsRaw = Array.isArray(root.groups) ? root.groups : [];
  const groups = groupsRaw
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  if (groups.length === 0) return null;

  const groupIdentifier = selectedRawObj
    ? readString(selectedRawObj, ["group", "groupIdentifier", "groupId", "guildId", "guildIdentifier"])
    : null;
  const groupName = selectedRawObj
    ? readString(selectedRawObj, ["groupname", "groupName", "guildName", "guild"])
    : selectedPlayer?.guildName ?? null;

  if (groupIdentifier) {
    const wanted = normalizeLoose(groupIdentifier);
    const byIdentifier = groups.find((group) => {
      const candidate = readString(group, ["identifier", "id", "group", "groupIdentifier", "groupId", "guildId"]);
      return candidate ? normalizeLoose(candidate) === wanted : false;
    });
    if (byIdentifier) return byIdentifier;
  }

  if (groupName) {
    const wanted = normalizeLoose(groupName);
    const byName = groups.find((group) => {
      const candidate = readString(group, ["name", "groupname", "groupName", "guildName", "guild"]);
      return candidate ? normalizeLoose(candidate) === wanted : false;
    });
    if (byName) return byName;
  }

  return groups[0] ?? null;
};

const extractCoaString = (
  rawJson: unknown,
  selectedRawObj: Record<string, unknown> | null,
  selectedPlayer: SfJsonOwnPlayer | null,
): string | null => {
  if (selectedRawObj) {
    const direct = readString(selectedRawObj, [
      "coaString",
      "coa",
      "coa_string",
      "coatOfArms",
      "coat_of_arms",
      "emblem",
      "emblemString",
    ]);
    if (direct) return direct;
  }

  const matchedGroup = findMatchedRawGroup(rawJson, selectedRawObj, selectedPlayer);
  if (!matchedGroup) return null;
  const coa = extractCoaFromGroup(matchedGroup);
  if (coa) return coa;

  return null;
};

const extractGuildName = (
  selectedRawObj: Record<string, unknown> | null,
  selectedGroup: Record<string, unknown> | null,
  selectedPlayer: SfJsonOwnPlayer | null,
): string | null => {
  const fromGroup = selectedGroup
    ? readString(selectedGroup, ["name", "groupname", "groupName", "guildName", "guild"])
    : null;
  if (fromGroup) return fromGroup;

  const fromPlayer = selectedRawObj
    ? readString(selectedRawObj, ["groupname", "groupName", "guildName", "guild"])
    : null;
  if (fromPlayer) return fromPlayer;

  if (typeof selectedPlayer?.guildName === "string" && selectedPlayer.guildName.trim()) {
    return selectedPlayer.guildName.trim();
  }

  return null;
};

const extractGuildNameFromRecord = (obj: Record<string, unknown> | null): string | null => {
  if (!obj) return null;
  return readString(obj, ["name", "groupname", "groupName", "guildName", "guild"]);
};

const collectCoaCandidatesFromObject = (
  obj: Record<string, unknown> | null,
  sourcePrefix: string,
  guildName: string | null,
): CoaPreviewCandidate[] => {
  if (!obj) return [];

  const candidates: CoaPreviewCandidate[] = [];
  for (const key of COA_SOURCE_KEYS) {
    const value = obj[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    candidates.push({
      key: `${sourcePrefix}.${key}:${trimmed}`,
      source: `${sourcePrefix}.${key}`,
      coaString: trimmed,
      guildName,
    });
  }

  const saveValue = Array.isArray(obj.save) ? obj.save[1] : null;
  if (typeof saveValue === "string" && saveValue.trim()) {
    const trimmed = saveValue.trim();
    candidates.push({
      key: `${sourcePrefix}.save[1]:${trimmed}`,
      source: `${sourcePrefix}.save[1]`,
      coaString: trimmed,
      guildName,
    });
  }

  return candidates;
};

const extractAllCoaCandidates = (
  rawJson: unknown,
  selectedRawPlayer: Record<string, unknown> | null,
  selectedGuildName: string | null,
): CoaPreviewCandidate[] => {
  const root = asObject(rawJson);
  const rawGroups = root && Array.isArray(root.groups) ? root.groups : [];
  const groups = rawGroups
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  const playerGuildName = extractGuildNameFromRecord(selectedRawPlayer) ?? selectedGuildName;
  const groupCandidates = groups.flatMap((group, index) => {
    const identifier = readIdentifierString(group, [
      "identifier",
      "id",
      "group",
      "groupIdentifier",
      "groupId",
      "guildId",
      "guildIdentifier",
    ]);
    const groupGuildName = extractGuildNameFromRecord(group) ?? selectedGuildName;
    const sourcePrefix = identifier ? `groups[${index}] (${identifier})` : `groups[${index}]`;
    return collectCoaCandidatesFromObject(group, sourcePrefix, groupGuildName);
  });

  const rawCandidates = [
    ...collectCoaCandidatesFromObject(selectedRawPlayer, "player", playerGuildName),
    ...groupCandidates,
  ];

  if (rawCandidates.length === 0) return [];

  const unique = new Map<string, CoaPreviewCandidate>();
  rawCandidates.forEach((candidate) => {
    if (unique.has(candidate.key)) return;
    unique.set(candidate.key, candidate);
  });
  return Array.from(unique.values());
};

const extractCoaBatchTargets = (rawJson: unknown, fallbackGuildName: string | null): CoaBatchExtraction => {
  const root = asObject(rawJson);
  const rawGroups = root && Array.isArray(root.groups) ? root.groups : [];
  const groups = rawGroups
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  const seenGuildIds = new Set<string>();
  const targetsByGuildId = new Map<string, CoaBatchTarget>();
  let recognizedGuildEntries = 0;
  let duplicateGuildEntries = 0;
  let skippedMissingCoa = 0;
  let skippedInvalidCoa = 0;

  groups.forEach((group, index) => {
    const guildId = readIdentifierString(group, [
      "identifier",
      "id",
      "group",
      "groupIdentifier",
      "groupId",
      "guildId",
      "guildIdentifier",
    ]);
    if (!guildId) return;

    recognizedGuildEntries += 1;
    if (seenGuildIds.has(guildId)) {
      duplicateGuildEntries += 1;
    } else {
      seenGuildIds.add(guildId);
    }

    const guildName = extractGuildNameFromRecord(group) ?? fallbackGuildName;
    const sourcePrefix = `groups[${index}] (${guildId})`;
    const coaCandidates = collectCoaCandidatesFromObject(group, sourcePrefix, guildName);

    if (coaCandidates.length === 0) {
      skippedMissingCoa += 1;
      return;
    }

    const validCandidate = coaCandidates.find((candidate) => isValidCoaString(candidate.coaString));
    if (!validCandidate) {
      skippedInvalidCoa += 1;
      return;
    }

    if (!targetsByGuildId.has(guildId)) {
      targetsByGuildId.set(guildId, {
        guildId,
        guildName,
        coaString: validCandidate.coaString,
        source: validCandidate.source,
      });
    }
  });

  return {
    recognizedGuilds: seenGuildIds.size,
    recognizedGuildEntries,
    duplicateGuildEntries,
    skippedMissingCoa,
    skippedInvalidCoa,
    targets: Array.from(targetsByGuildId.values()),
  };
};

function CoaPreviewCanvas({
  coaString,
  guildName,
}: {
  coaString: string;
  guildName: string | null;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<CoaRenderer | null>(null);
  const isValid = isValidCoaString(coaString);

  React.useEffect(() => {
    return () => {
      if (!rendererRef.current) return;
      rendererRef.current.dispose();
      rendererRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clearCanvas = () => {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    if (!isValid) {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      clearCanvas();
      return;
    }

    let isCancelled = false;
    const guildNameForRender = guildName ?? undefined;

    const bindRendererCallbacks = (renderer: CoaRenderer) => {
      renderer.onError = (error: Error) => {
        if (isCancelled) return;
        console.warn("[UploadCenterV2][COA Preview] Renderer onError", error);
      };
      renderer.onFinish = () => {
        if (isCancelled) return;
      };
    };

    if (!rendererRef.current) {
      try {
        const renderer = new CoaRenderer(canvas, coaString, guildNameForRender);
        bindRendererCallbacks(renderer);
        rendererRef.current = renderer;
      } catch (error) {
        console.warn("[UploadCenterV2][COA Preview] new CoaRenderer failed", error);
        clearCanvas();
      }

      return () => {
        isCancelled = true;
      };
    }

    const renderer = rendererRef.current;
    bindRendererCallbacks(renderer);
    renderer.updateCOA(coaString, guildNameForRender).catch((error) => {
      if (isCancelled) return;
      console.warn("[UploadCenterV2][COA Preview] updateCOA failed", error);
      clearCanvas();
    });

    return () => {
      isCancelled = true;
    };
  }, [coaString, guildName, isValid]);

  return (
    <>
      {isValid ? (
        <canvas
          ref={canvasRef}
          className={styles.coaPreviewCanvas}
          width={240}
          height={240}
        />
      ) : (
        <p className={styles.coaPreviewHint}>
          Invalid coaString. Expected "0" or a 22-character hex value.
        </p>
      )}
    </>
  );
}

const extractPlayerSaveArray = (
  selectedRawObj: Record<string, unknown> | null,
  selectedPlayer: SfJsonOwnPlayer | null,
): number[] => {
  if (Array.isArray(selectedPlayer?.saveArray) && selectedPlayer.saveArray.length) {
    return selectedPlayer.saveArray;
  }

  if (typeof selectedPlayer?.saveString === "string" && selectedPlayer.saveString.trim()) {
    return parseSaveStringToArray(selectedPlayer.saveString);
  }

  if (selectedRawObj) {
    const saveArr = toNumberArray(selectedRawObj.save ?? selectedRawObj.playerSave);
    if (saveArr && saveArr.length) return saveArr;

    const saveString = readString(selectedRawObj, ["saveString"]);
    if (saveString) return parseSaveStringToArray(saveString);
  }

  return [];
};

const getPlayerLabel = (player: SfJsonOwnPlayer): string => {
  const parts = [
    player.name || "Unnamed",
    player.server || "unknown-server",
    `#${player.playerId}`,
  ];
  return parts.join(" - ");
};

const buildParsedSaveFieldValues = (player: SfJsonOwnPlayer | null): Map<number, unknown> => {
  const parsed = new Map<number, unknown>();
  if (!player) return parsed;

  (player.saveModel?.fields ?? []).forEach((field) => {
    parsed.set(field.index, field.value);
  });

  parsed.set(1, player.playerId);
  if (typeof player.fortressRank === "number") {
    parsed.set(583, player.fortressRank);
  }

  const portrait = player.portrait;
  if (portrait) {
    parsed.set(17, portrait.mouth);
    parsed.set(18, { hair: portrait.hair, hairColor: portrait.hairColor });
    parsed.set(19, portrait.brows);
    parsed.set(20, portrait.eyes);
    parsed.set(21, portrait.beard);
    parsed.set(22, portrait.nose);
    parsed.set(23, portrait.ears);
    parsed.set(24, portrait.extra);
    parsed.set(25, { horn: portrait.horn, hornColor: portrait.hornColor });
    parsed.set(26, portrait.special);
    parsed.set(27, portrait.raceId);
    parsed.set(28, { gender: portrait.genderName });
    parsed.set(29, portrait.classId);
    parsed.set(705, portrait.frameId);
  }

  return parsed;
};

const extractGroupSaveArray = (group: Record<string, unknown> | null): number[] => {
  if (!group) return [];
  const saveArr = toNumberArray(group.save ?? group.groupSave);
  if (saveArr && saveArr.length) return saveArr;
  const saveString = readString(group, ["saveString"]);
  if (saveString) return parseSaveStringToArray(saveString);
  return [];
};

const buildParsedGroupSaveFieldValues = (
  group: Record<string, unknown> | null,
  saveArray: number[],
): Map<number, unknown> => {
  const parsed = new Map<number, unknown>();
  if (!group || saveArray.length === 0) return parsed;

  Object.keys(GROUP_SAVE_FIELD_LABELS).forEach((key) => {
    const index = Number(key);
    if (index >= saveArray.length) return;
    parsed.set(index, saveArray[index]);
  });

  const identifier = readString(group, ["identifier"]);
  if (identifier) {
    const match = identifier.match(/_g(\d+)$/i);
    if (match?.[1]) {
      const parsedGroupId = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsedGroupId)) parsed.set(0, parsedGroupId);
    }
  }

  if (saveArray.length > 364) {
    parsed.set(364, { id: saveArray[364], isUnderAttack: saveArray[364] > 0 });
  }
  if (saveArray.length > 366) {
    parsed.set(366, { id: saveArray[366], isAttacking: saveArray[366] > 0 });
  }

  return parsed;
};

export default function UploadCenterV2JsonImport() {
  const { user } = useAuth();
  const [jsonInput, setJsonInput] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rawJson, setRawJson] = React.useState<unknown>(null);
  const [parseResult, setParseResult] = React.useState<SfJsonParseResult | null>(null);
  const [parseStatus, setParseStatus] = React.useState<string | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [importMode, setImportMode] = React.useState<ImportMode>("mapping");
  const [selectedIdentifier, setSelectedIdentifier] = React.useState("");
  const [tableMode, setTableMode] = React.useState<TableMode>("overview");
  const [avatarSectionOpen, setAvatarSectionOpen] = React.useState(false);
  const [coaImportStatus, setCoaImportStatus] = React.useState<string | null>(null);
  const [coaImportError, setCoaImportError] = React.useState<string | null>(null);
  const [isCoaImporting, setIsCoaImporting] = React.useState(false);
  const [avatarImportStatus, setAvatarImportStatus] = React.useState<string | null>(null);
  const [avatarImportError, setAvatarImportError] = React.useState<string | null>(null);
  const [isAvatarImporting, setIsAvatarImporting] = React.useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setJsonInput(text);
      setFileName(file.name);
      setParseStatus(`Loaded ${file.name}. Click parse to evaluate parser fields.`);
      setParseError(null);
      setCoaImportStatus(null);
      setCoaImportError(null);
      setAvatarImportStatus(null);
      setAvatarImportError(null);
    } catch (error) {
      console.error("[UploadCenterV2] Could not read JSON file", error);
      setParseError("Could not read the selected JSON file.");
      setParseStatus(null);
    } finally {
      event.target.value = "";
    }
  };

  const handleParse = () => {
    if (!jsonInput.trim()) {
      setParseError("Paste JSON or choose a JSON file first.");
      setParseStatus(null);
      setParseResult(null);
      return;
    }

    try {
      const parsedJson = JSON.parse(jsonInput);
      const parsed = parseSfJson(parsedJson);
      setRawJson(parsedJson);
      setParseResult(parsed);
      setParseError(null);
      setCoaImportStatus(null);
      setCoaImportError(null);
      setAvatarImportStatus(null);
      setAvatarImportError(null);

      if (parsed.ownPlayers.length === 0) {
        setParseStatus(`Parsed ${parsed.playersCount} players. No own player found (expected \"own\": 1).`);
        setSelectedIdentifier("");
        return;
      }

      const nextIdentifier = parsed.ownPlayers[0].identifier;
      setSelectedIdentifier(nextIdentifier);
      setParseStatus(
        `Parsed ${parsed.playersCount} players. Own players found: ${parsed.ownPlayers.length}.`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setParseError(`Invalid JSON: ${message}`);
      setParseStatus(null);
      setRawJson(null);
      setParseResult(null);
      setSelectedIdentifier("");
      setCoaImportStatus(null);
      setCoaImportError(null);
      setAvatarImportStatus(null);
      setAvatarImportError(null);
    }
  };

  const selectedPlayer = React.useMemo(() => {
    if (!parseResult || parseResult.ownPlayers.length === 0) return null;
    if (!selectedIdentifier) return parseResult.ownPlayers[0] ?? null;
    return parseResult.ownPlayers.find((player) => player.identifier === selectedIdentifier) ?? parseResult.ownPlayers[0] ?? null;
  }, [parseResult, selectedIdentifier]);

  React.useEffect(() => {
    if (!parseResult || parseResult.ownPlayers.length === 0) return;
    if (parseResult.ownPlayers.some((player) => player.identifier === selectedIdentifier)) return;
    setSelectedIdentifier(parseResult.ownPlayers[0].identifier);
  }, [parseResult, selectedIdentifier]);

  const selectedRawPlayer = React.useMemo(
    () => findSelectedRawPlayer(rawJson, selectedIdentifier, selectedPlayer),
    [rawJson, selectedIdentifier, selectedPlayer],
  );

  const coaString = React.useMemo(
    () => extractCoaString(rawJson, selectedRawPlayer, selectedPlayer),
    [rawJson, selectedRawPlayer, selectedPlayer],
  );
  const selectedRawGroup = React.useMemo(
    () => findMatchedRawGroup(rawJson, selectedRawPlayer, selectedPlayer),
    [rawJson, selectedRawPlayer, selectedPlayer],
  );
  const selectedGuildName = React.useMemo(
    () => extractGuildName(selectedRawPlayer, selectedRawGroup, selectedPlayer),
    [selectedRawPlayer, selectedRawGroup, selectedPlayer],
  );
  const coaPreviewCandidates = React.useMemo(
    () => extractAllCoaCandidates(rawJson, selectedRawPlayer, selectedGuildName),
    [rawJson, selectedRawPlayer, selectedGuildName],
  );
  const coaBatchExtraction = React.useMemo(
    () => extractCoaBatchTargets(rawJson, selectedGuildName),
    [rawJson, selectedGuildName],
  );
  const coaBatchTargets = coaBatchExtraction.targets;

  const handleCoaImport = React.useCallback(async () => {
    const traceSession = `UploadCenterV2:CoaImportBatch:${coaBatchExtraction.recognizedGuilds}`;
    startReadTraceSession(traceSession);
    setCoaImportStatus(null);
    setCoaImportError(null);

    if (!isFirestoreReadTraceEnabled() && !isFirestoreWriteTraceEnabled()) {
      console.info(
        "[UploadCenterV2][COA Import] Firestore trace disabled. Enable via localStorage keys sfh:debug:firestoreReads=1 and/or sfh:debug:firestoreWrites=1.",
      );
    }

    if (!parseResult) {
      setCoaImportError("Parse JSON first.");
      reportReadSummary(traceSession);
      reportWriteSummary(traceSession);
      return;
    }

    if (coaBatchTargets.length === 0) {
      setCoaImportError("No importable guild COA targets found in the loaded JSON.");
      reportReadSummary(traceSession);
      reportWriteSummary(traceSession);
      return;
    }

    setIsCoaImporting(true);
    try {
      let updated = 0;
      let skippedSameValue = 0;
      let skippedMissingLatest = 0;
      let failed = 0;
      const failedEntries: string[] = [];

      for (const target of coaBatchTargets) {
        try {
          const result = await mergeCoaStringIntoMembersSummaryLatest({
            guildId: target.guildId,
            coaString: target.coaString,
          });

          if (result.status === "updated") {
            updated += 1;
          } else if (result.status === "skipped_missing_latest") {
            skippedMissingLatest += 1;
          } else {
            skippedSameValue += 1;
          }
        } catch (error: unknown) {
          failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          failedEntries.push(`${target.guildId}: ${message}`);
        }
      }

      const summary = [
        `COA batch finished.`,
        `Guilds recognized: ${coaBatchExtraction.recognizedGuilds} (${coaBatchExtraction.recognizedGuildEntries} entries).`,
        `Processed targets: ${coaBatchTargets.length}.`,
        `Imported: ${updated}.`,
        `Unchanged/skipped: ${skippedSameValue}.`,
        `Skipped missing latest: ${skippedMissingLatest}.`,
        `Skipped missing/invalid coaString: ${coaBatchExtraction.skippedMissingCoa + coaBatchExtraction.skippedInvalidCoa}.`,
      ].join(" ");

      setCoaImportStatus(summary);

      if (failed > 0) {
        const failedPreview = failedEntries.slice(0, 3).join(" | ");
        const extra = failedEntries.length > 3 ? ` (+${failedEntries.length - 3} more)` : "";
        setCoaImportError(`COA batch had ${failed} failed writes. ${failedPreview}${extra}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setCoaImportError(`COA import failed: ${message}`);
    } finally {
      setIsCoaImporting(false);
      reportReadSummary(traceSession);
      reportWriteSummary(traceSession);
    }
  }, [parseResult, coaBatchExtraction, coaBatchTargets]);

  const handleAvatarImport = React.useCallback(async () => {
    setAvatarImportStatus(null);
    setAvatarImportError(null);

    if (!parseResult) {
      setAvatarImportError("Parse JSON first.");
      return;
    }

    if (!selectedPlayer) {
      setAvatarImportError("No own player available in parsed JSON.");
      return;
    }

    if (!selectedPlayer.portrait) {
      setAvatarImportError("Selected own player has no portrait save data.");
      return;
    }

    if (!user?.id) {
      setAvatarImportError("Missing authenticated user id.");
      return;
    }

    setIsAvatarImporting(true);
    try {
      await saveAvatarSnapshotForIdentifier({
        userId: user.id,
        identifier: selectedPlayer.identifier,
        playerId: selectedPlayer.playerId,
        server: selectedPlayer.server,
        source: "scanUpload",
        portrait: selectedPlayer.portrait,
      });
      setAvatarImportStatus(
        `Avatar imported for ${selectedPlayer.name || selectedPlayer.identifier} (${selectedPlayer.server}).`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setAvatarImportError(`Avatar import failed: ${message}`);
    } finally {
      setIsAvatarImporting(false);
    }
  }, [parseResult, selectedPlayer, user?.id]);
  const avatarPreviewConfig = React.useMemo(() => {
    if (!selectedPlayer?.portrait) return null;
    return createPortraitOptionsFromAvatarSnapshot({
      playerId: selectedPlayer.playerId,
      server: selectedPlayer.server,
      portrait: selectedPlayer.portrait,
      updatedAt: null,
      hasPortraitData: true,
    });
  }, [selectedPlayer]);

  const parserCoveredSaveFields = React.useMemo(() => {
    const covered = new Set<number>();

    (selectedPlayer?.saveModel?.modeledIndexes ?? []).forEach((index) => covered.add(index));

    if (selectedPlayer?.portrait) {
      AVATAR_FIELD_INDEXES.forEach((index) => covered.add(index));
    }

    if (typeof selectedPlayer?.fortressRank === "number") {
      covered.add(583);
    }

    return covered;
  }, [selectedPlayer]);

  const playerSaveRows = React.useMemo(() => {
    const saveArray = extractPlayerSaveArray(selectedRawPlayer, selectedPlayer);
    if (!saveArray.length) return [];
    const parsedValues = buildParsedSaveFieldValues(selectedPlayer);

    const known = new Set<number>([
      ...Object.keys(PLAYER_SAVE_FIELD_LABELS).map((key) => Number(key)),
      ...Array.from(parserCoveredSaveFields),
    ]);
    return saveArray
      .map((value, index) => {
        const label = PLAYER_SAVE_FIELD_LABELS[index] ?? `Field ${index}`;
        const ownFieldNumber = index;
        const otherFieldNumber = mapPlayerOwnToOtherFieldIndex(index);
        const parserCovered = parserCoveredSaveFields.has(index);
        const parsedValue = parsedValues.has(index) ? parsedValues.get(index) : undefined;
        return { label, ownFieldNumber, otherFieldNumber, value, parsedValue, parserCovered };
      })
      .filter((entry) => entry.value !== 0 || known.has(entry.ownFieldNumber));
  }, [selectedRawPlayer, selectedPlayer, parserCoveredSaveFields]);

  const avatarRows = React.useMemo(
    () => playerSaveRows.filter((row) => AVATAR_FIELD_INDEXES.has(row.ownFieldNumber)),
    [playerSaveRows],
  );

  const otherPlayerRows = React.useMemo(
    () => playerSaveRows.filter((row) => !AVATAR_FIELD_INDEXES.has(row.ownFieldNumber)),
    [playerSaveRows],
  );
  const groupSaveRows = React.useMemo(() => {
    const saveArray = extractGroupSaveArray(selectedRawGroup);
    if (!saveArray.length) return [];
    const parsedValues = buildParsedGroupSaveFieldValues(selectedRawGroup, saveArray);

    const known = new Set<number>([
      ...Object.keys(GROUP_SAVE_FIELD_LABELS).map((key) => Number(key)),
      ...Array.from(parsedValues.keys()),
    ]);

    return saveArray
      .map((value, index) => {
        const label = GROUP_SAVE_FIELD_LABELS[index] ?? `Field ${index}`;
        const ownFieldNumber = index;
        const otherFieldNumber = index;
        const parsedValue = parsedValues.has(index) ? parsedValues.get(index) : undefined;
        const parserCovered = parsedValues.has(index);
        return { label, ownFieldNumber, otherFieldNumber, value, parsedValue, parserCovered };
      })
      .filter((entry) => entry.value !== 0 || known.has(entry.ownFieldNumber));
  }, [selectedRawGroup]);

  return (
    <section className={styles.root}>
      <div className={styles.headerRow}>
        <div>
          <h3 className={styles.title}>Upload Center v2 - JSON Importer</h3>
          <p className={styles.subtitle}>
            Mapping mode keeps the existing parser preview. COA Import and Avatar Import write through existing import paths.
          </p>
        </div>

        <label className={styles.fileButton}>
          <input
            type="file"
            accept=".json,application/json"
            className={styles.fileInput}
            onChange={handleFileChange}
          />
          Choose JSON
        </label>
      </div>

      <textarea
        className={styles.textarea}
        value={jsonInput}
        onChange={(event) => {
          setJsonInput(event.target.value);
          setParseError(null);
          setParseStatus(null);
          setCoaImportStatus(null);
          setCoaImportError(null);
          setAvatarImportStatus(null);
          setAvatarImportError(null);
        }}
        placeholder='Paste full SF JSON here (requires "players" with at least one entry where "own": 1).'
        rows={10}
      />

      <div className={styles.actionRow}>
        <button type="button" className={styles.parseButton} onClick={handleParse}>
          Parse JSON
        </button>
        {fileName && <span className={styles.fileName}>File: {fileName}</span>}
      </div>

      <div className={styles.modeToggleRow}>
        <button
          type="button"
          className={`${styles.modeToggleBtn} ${importMode === "mapping" ? styles.modeToggleBtnActive : ""}`}
          onClick={() => setImportMode("mapping")}
        >
          Mapping
        </button>
        <button
          type="button"
          className={`${styles.modeToggleBtn} ${importMode === "coa_import" ? styles.modeToggleBtnActive : ""}`}
          onClick={() => setImportMode("coa_import")}
        >
          COA Import
        </button>
        <button
          type="button"
          className={`${styles.modeToggleBtn} ${importMode === "avatar_import" ? styles.modeToggleBtnActive : ""}`}
          onClick={() => setImportMode("avatar_import")}
        >
          Avatar Import
        </button>
      </div>

      {parseStatus && <p className={styles.statusOk}>{parseStatus}</p>}
      {parseError && <p className={styles.statusError}>{parseError}</p>}

      {parseResult && (
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Players in JSON</div>
            <div className={styles.summaryValue}>{parseResult.playersCount}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Own Players Found</div>
            <div className={styles.summaryValue}>{parseResult.ownPlayers.length}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Selected Player</div>
            <div className={styles.summaryValue}>
              {selectedPlayer ? getPlayerLabel(selectedPlayer) : "none"}
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>COA String</div>
            <div className={styles.summaryValueMono}>{coaString ?? "(missing)"}</div>
          </div>
        </div>
      )}

      {parseResult && parseResult.ownPlayers.length > 1 && (
        <div className={styles.selectionRow}>
          <label htmlFor="uc-v2-player-select" className={styles.selectionLabel}>
            Own player
          </label>
          <select
            id="uc-v2-player-select"
            className={styles.selectionSelect}
            value={selectedIdentifier}
            onChange={(event) => setSelectedIdentifier(event.target.value)}
          >
            {parseResult.ownPlayers.map((player) => (
              <option key={player.identifier} value={player.identifier}>
                {getPlayerLabel(player)}
              </option>
            ))}
          </select>
        </div>
      )}

      {importMode === "mapping" ? (
        selectedPlayer ? (
          <div>
            <div className={styles.tableToggleRow}>
              <button
                type="button"
                className={`${styles.tableToggleBtn} ${tableMode === "overview" ? styles.tableToggleBtnActive : ""}`}
                onClick={() => setTableMode("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                className={`${styles.tableToggleBtn} ${tableMode === "player" ? styles.tableToggleBtnActive : ""}`}
                onClick={() => setTableMode("player")}
              >
                Player
              </button>
              <button
                type="button"
                className={`${styles.tableToggleBtn} ${tableMode === "group" ? styles.tableToggleBtnActive : ""}`}
                onClick={() => setTableMode("group")}
              >
                Group
              </button>
            </div>

            <div className={styles.tableWrap}>
              {tableMode === "overview" ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Parser Key</th>
                      <th>Status</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={!coaString ? styles.rowMissing : undefined}>
                      <td>COA String</td>
                      <td className={styles.codeCell}>coaString (derived)</td>
                      <td>
                        <span className={!coaString ? styles.badgeMissing : styles.badgeOk}>
                          {!coaString ? "missing" : "ok"}
                        </span>
                      </td>
                      <td className={styles.valueCell}>{coaString ?? "(missing)"}</td>
                    </tr>
                    {FIELD_DEFINITIONS.map((field) => {
                      const value = selectedPlayer[field.key];
                      const isMissing = value === undefined;

                      return (
                        <tr key={String(field.key)} className={isMissing ? styles.rowMissing : undefined}>
                          <td>{field.label}</td>
                          <td className={styles.codeCell}>{String(field.key)}</td>
                          <td>
                            <span className={isMissing ? styles.badgeMissing : styles.badgeOk}>
                              {isMissing ? "missing" : "ok"}
                            </span>
                          </td>
                          <td className={styles.valueCell}>{toPreviewString(value)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : tableMode === "player" ? (
                <table className={`${styles.table} ${styles.playerTable}`}>
                  <colgroup>
                    <col className={styles.playerColLabel} />
                    <col className={styles.playerColOwn} />
                    <col className={styles.playerColOther} />
                    <col className={styles.playerColStatus} />
                    <col className={styles.playerColParsed} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Own #</th>
                      <th>Other #</th>
                      <th>Status</th>
                      <th>Parsed</th>
                      <th>Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerSaveRows.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No player save array found.</td>
                      </tr>
                    ) : (
                      <>
                        <tr>
                          <td colSpan={6} className={styles.groupCell}>
                            <button
                              type="button"
                              className={styles.groupToggleBtn}
                              onClick={() => setAvatarSectionOpen((prev) => !prev)}
                              aria-expanded={avatarSectionOpen}
                            >
                              <span className={styles.groupChevron}>{avatarSectionOpen ? "▼" : "▶"}</span>
                              <span>Avatar</span>
                              <span className={styles.groupMeta}>{avatarRows.length} fields</span>
                            </button>
                          </td>
                        </tr>

                        {avatarSectionOpen &&
                          avatarRows.map((row) => (
                            <tr
                              key={`player-save-avatar-${row.ownFieldNumber}`}
                              className={!row.parserCovered ? styles.rowMissing : undefined}
                            >
                              <td>{row.label}</td>
                              <td className={styles.codeCell}>{row.ownFieldNumber}</td>
                              <td className={styles.codeCell}>{row.otherFieldNumber ?? "-"}</td>
                              <td>
                                <span className={row.parserCovered ? styles.badgeOk : styles.badgeMissing}>
                                  {row.parserCovered ? "ok" : "missing"}
                                </span>
                              </td>
                              <td className={styles.valueCell}>{toPreviewString(row.parsedValue)}</td>
                              <td className={styles.valueCell}>{toPreviewString(row.value)}</td>
                            </tr>
                          ))}

                        {otherPlayerRows.map((row) => (
                          <tr
                            key={`player-save-${row.ownFieldNumber}`}
                            className={!row.parserCovered ? styles.rowMissing : undefined}
                          >
                            <td>{row.label}</td>
                            <td className={styles.codeCell}>{row.ownFieldNumber}</td>
                            <td className={styles.codeCell}>{row.otherFieldNumber ?? "-"}</td>
                            <td>
                              <span className={row.parserCovered ? styles.badgeOk : styles.badgeMissing}>
                                {row.parserCovered ? "ok" : "missing"}
                              </span>
                            </td>
                            <td className={styles.valueCell}>{toPreviewString(row.parsedValue)}</td>
                            <td className={styles.valueCell}>{toPreviewString(row.value)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className={`${styles.table} ${styles.playerTable}`}>
                  <colgroup>
                    <col className={styles.playerColLabel} />
                    <col className={styles.playerColOwn} />
                    <col className={styles.playerColOther} />
                    <col className={styles.playerColStatus} />
                    <col className={styles.playerColParsed} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Own #</th>
                      <th>Other #</th>
                      <th>Status</th>
                      <th>Parsed</th>
                      <th>Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupSaveRows.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No group save array found.</td>
                      </tr>
                    ) : (
                      groupSaveRows.map((row) => (
                        <tr
                          key={`group-save-${row.ownFieldNumber}`}
                          className={!row.parserCovered ? styles.rowMissing : undefined}
                        >
                          <td>{row.label}</td>
                          <td className={styles.codeCell}>{row.ownFieldNumber}</td>
                          <td className={styles.codeCell}>{row.otherFieldNumber}</td>
                          <td>
                            <span className={row.parserCovered ? styles.badgeOk : styles.badgeMissing}>
                              {row.parserCovered ? "ok" : "missing"}
                            </span>
                          </td>
                          <td className={styles.valueCell}>{toPreviewString(row.parsedValue)}</td>
                          <td className={styles.valueCell}>{toPreviewString(row.value)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          parseResult && (
            <div className={styles.emptyState}>
              No parser field list available until at least one own player is found.
            </div>
          )
        )
      ) : importMode === "coa_import" ? (
        parseResult ? (
          <div className={styles.importCard}>
            <div className={styles.importRow}>
              <span className={styles.importLabel}>Recognized Guilds</span>
              <span className={styles.summaryValueMono}>
                {coaBatchExtraction.recognizedGuilds} ({coaBatchExtraction.recognizedGuildEntries} entries)
              </span>
            </div>
            <div className={styles.importRow}>
              <span className={styles.importLabel}>Importable Targets</span>
              <span className={styles.summaryValueMono}>{coaBatchTargets.length}</span>
            </div>
            <div className={styles.importRow}>
              <span className={styles.importLabel}>Skipped Before Import</span>
              <span className={styles.summaryValueMono}>
                missing coaString: {coaBatchExtraction.skippedMissingCoa}, invalid coaString:{" "}
                {coaBatchExtraction.skippedInvalidCoa}, duplicate guild entries:{" "}
                {coaBatchExtraction.duplicateGuildEntries}
              </span>
            </div>
            <div className={styles.importRow}>
              <span className={styles.importLabel}>Guild Name</span>
              <span className={styles.summaryValue}>{selectedGuildName ?? "(missing)"}</span>
            </div>
            <div className={styles.importPreviewWrap}>
              <span className={styles.importLabel}>Preview</span>
              <div className={styles.coaPreviewBox}>
                {coaPreviewCandidates.length === 0 ? (
                  <p className={styles.coaPreviewHint}>
                    No coaString candidates found in player/group fields for the selected record.
                  </p>
                ) : (
                  <div className={styles.coaPreviewList}>
                    {coaPreviewCandidates.map((candidate) => (
                      <div key={candidate.key} className={styles.coaPreviewItem}>
                        <div className={styles.coaPreviewSource}>{candidate.source}</div>
                        <div className={styles.coaPreviewGuildName}>
                          {candidate.guildName ? `Name: ${candidate.guildName}` : "Name: (missing)"}
                        </div>
                        <div className={styles.coaPreviewValue}>{candidate.coaString}</div>
                        <CoaPreviewCanvas coaString={candidate.coaString} guildName={candidate.guildName} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {!!coaImportStatus && <p className={styles.statusOk}>{coaImportStatus}</p>}
            {!!coaImportError && <p className={styles.statusError}>{coaImportError}</p>}
            <div className={styles.importActions}>
              <button
                type="button"
                className={styles.parseButton}
                onClick={handleCoaImport}
                disabled={isCoaImporting || coaBatchTargets.length === 0}
              >
                {isCoaImporting ? "Importing..." : "Import COA for All Recognized Guilds"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>Parse JSON first to run COA import.</div>
        )
      ) : parseResult ? (
        <div className={styles.importCard}>
          <div className={styles.importRow}>
            <span className={styles.importLabel}>Selected Player</span>
            <span className={styles.summaryValue}>{selectedPlayer ? getPlayerLabel(selectedPlayer) : "(missing)"}</span>
          </div>
          <div className={styles.importRow}>
            <span className={styles.importLabel}>Avatar Identifier</span>
            <span className={styles.summaryValueMono}>{selectedPlayer?.identifier ?? "(missing)"}</span>
          </div>
          <div className={styles.importRow}>
            <span className={styles.importLabel}>Portrait Data</span>
            <span className={selectedPlayer?.portrait ? styles.badgeOk : styles.badgeMissing}>
              {selectedPlayer?.portrait ? "ok" : "missing"}
            </span>
          </div>
          {selectedPlayer?.portrait && avatarPreviewConfig && (
            <div className={styles.importPreviewWrap}>
              <span className={styles.importLabel}>Preview</span>
              <div className={styles.importPreviewBox}>
                <PortraitPreview
                  config={avatarPreviewConfig}
                  label={selectedPlayer.name || selectedPlayer.identifier}
                  fallbackLabel={selectedPlayer.name || selectedPlayer.identifier}
                />
              </div>
            </div>
          )}
          {!!avatarImportStatus && <p className={styles.statusOk}>{avatarImportStatus}</p>}
          {!!avatarImportError && <p className={styles.statusError}>{avatarImportError}</p>}
          <div className={styles.importActions}>
            <button
              type="button"
              className={styles.parseButton}
              onClick={handleAvatarImport}
              disabled={isAvatarImporting || !selectedPlayer?.portrait || !selectedPlayer || !user?.id}
            >
              {isAvatarImporting ? "Importing..." : "Import Avatar"}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.emptyState}>Parse JSON first to run avatar import.</div>
      )}
    </section>
  );
}
