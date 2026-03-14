import React from "react";
import {
  parseSaveStringToArray,
  parseSfJson,
  type SfJsonOwnPlayer,
  type SfJsonParseResult,
} from "../../lib/parsing";
import styles from "./UploadCenterV2JsonImport.module.css";

type FieldDefinition = {
  key: keyof SfJsonOwnPlayer;
  label: string;
};

type TableMode = "overview" | "player" | "group";

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

const normalizeLoose = (value: string) => value.trim().toLowerCase();

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
  const [jsonInput, setJsonInput] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rawJson, setRawJson] = React.useState<unknown>(null);
  const [parseResult, setParseResult] = React.useState<SfJsonParseResult | null>(null);
  const [parseStatus, setParseStatus] = React.useState<string | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [selectedIdentifier, setSelectedIdentifier] = React.useState("");
  const [tableMode, setTableMode] = React.useState<TableMode>("overview");
  const [avatarSectionOpen, setAvatarSectionOpen] = React.useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setJsonInput(text);
      setFileName(file.name);
      setParseStatus(`Loaded ${file.name}. Click parse to evaluate parser fields.`);
      setParseError(null);
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
        const parserCovered = parserCoveredSaveFields.has(index);
        const parsedValue = parsedValues.has(index) ? parsedValues.get(index) : undefined;
        return { label, fieldNumber: index, value, parsedValue, parserCovered };
      })
      .filter((entry) => entry.value !== 0 || known.has(entry.fieldNumber));
  }, [selectedRawPlayer, selectedPlayer, parserCoveredSaveFields]);

  const avatarRows = React.useMemo(
    () => playerSaveRows.filter((row) => AVATAR_FIELD_INDEXES.has(row.fieldNumber)),
    [playerSaveRows],
  );

  const otherPlayerRows = React.useMemo(
    () => playerSaveRows.filter((row) => !AVATAR_FIELD_INDEXES.has(row.fieldNumber)),
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
        const parsedValue = parsedValues.has(index) ? parsedValues.get(index) : undefined;
        const parserCovered = parsedValues.has(index);
        return { label, fieldNumber: index, value, parsedValue, parserCovered };
      })
      .filter((entry) => entry.value !== 0 || known.has(entry.fieldNumber));
  }, [selectedRawGroup]);

  return (
    <section className={styles.root}>
      <div className={styles.headerRow}>
        <div>
          <h3 className={styles.title}>Upload Center v2 - JSON Parser Preview</h3>
          <p className={styles.subtitle}>
            Frontend-only import. No DB upload is triggered. The table below lists parser output fields with value previews.
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

      {selectedPlayer ? (
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
                  <col className={styles.playerColField} />
                  <col className={styles.playerColStatus} />
                  <col className={styles.playerColParsed} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Field #</th>
                    <th>Status</th>
                    <th>Parsed</th>
                    <th>Raw</th>
                  </tr>
                </thead>
                <tbody>
                  {playerSaveRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No player save array found.</td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td colSpan={5} className={styles.groupCell}>
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
                            key={`player-save-avatar-${row.fieldNumber}`}
                            className={!row.parserCovered ? styles.rowMissing : undefined}
                          >
                            <td>{row.label}</td>
                            <td className={styles.codeCell}>{row.fieldNumber}</td>
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
                          key={`player-save-${row.fieldNumber}`}
                          className={!row.parserCovered ? styles.rowMissing : undefined}
                        >
                          <td>{row.label}</td>
                          <td className={styles.codeCell}>{row.fieldNumber}</td>
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
                  <col className={styles.playerColField} />
                  <col className={styles.playerColStatus} />
                  <col className={styles.playerColParsed} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Field #</th>
                    <th>Status</th>
                    <th>Parsed</th>
                    <th>Raw</th>
                  </tr>
                </thead>
                <tbody>
                  {groupSaveRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No group save array found.</td>
                    </tr>
                  ) : (
                    groupSaveRows.map((row) => (
                      <tr
                        key={`group-save-${row.fieldNumber}`}
                        className={!row.parserCovered ? styles.rowMissing : undefined}
                      >
                        <td>{row.label}</td>
                        <td className={styles.codeCell}>{row.fieldNumber}</td>
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
      )}
    </section>
  );
}
