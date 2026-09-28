import { getClassMetaById } from "../../data/classes";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import {
  normalizeGuildScanMembers,
  normalizeGuildSegmentForScan,
  type NormalizedGuildMember,
} from "../../lib/guilds/guildScanNormalizer";
import { normalizeSfPlayerCharacterCore, type NormalizedPlayer } from "../../lib/parsing/normalizedPlayer";
import { readSfPlayerStats } from "../../lib/parsing/parseSfJson";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";

type JsonRecord = Record<string, unknown>;

export type ProgressRadarMode = "current" | "development";
export type ProgressRadarPeriodKey = "short" | "medium" | "long";
export type ProgressRadarAxisKey = "xpTotal" | "primaryBase" | "constitutionBase";
export type ProgressRadarAxisStatus = "ok" | "missing-player" | "missing-reference" | "zero-reference" | "negative";

export type ProgressRadarAxis = {
  key: ProgressRadarAxisKey;
  label: string;
  fieldLabel: string;
  playerValue: number | null;
  median: number | null;
  ratio: number | null;
  sampleSize: number;
  status: ProgressRadarAxisStatus;
};

export type ProgressRadarView = {
  mode: ProgressRadarMode;
  period?: ProgressRadarPeriodKey;
  label: string;
  description: string;
  currentScanId: string;
  comparisonScanId?: string;
  currentScanLabel: string;
  comparisonScanLabel?: string;
  days?: number;
  axes: ProgressRadarAxis[];
  usableAxes: ProgressRadarAxis[];
  referenceMemberCount: number;
  notes: string[];
};

export type ProgressRadarPlayerSummary = {
  name: string;
  server: string | null;
  guildName: string | null;
  memberKey: string;
  guildKey: string;
};

export type ProgressRadarBuildResult = {
  status: "ready" | "empty" | "missing-player" | "missing-guild";
  message?: string;
  player: ProgressRadarPlayerSummary | null;
  current: ProgressRadarView | null;
  development: Partial<Record<ProgressRadarPeriodKey, ProgressRadarView>>;
  scanCount: number;
  loadedScanCount: number;
  fieldSources: Array<{ axis: ProgressRadarAxisKey; fieldLabel: string; source: string }>;
  audit: Array<{ view: string; axis: ProgressRadarAxisKey; playerValue: number | null; median: number | null; sampleSize: number }>;
};

export type ProgressRadarScanInput = {
  scan: GuildHubLocalScan;
  summary: GuildHubScanSummary;
};

type Entry = {
  sourceScanId: string;
  sourceFilename: string;
  scannedAtMs: number;
  memberKey: string;
  guildKey: string | null;
  guildDeclaredMemberCount: number | null;
  name: string;
  server: string | null;
  guildName: string | null;
  xpTotal: number | null;
  primaryBase: number | null;
  constitutionBase: number | null;
};

type ComparisonCandidate = {
  entry: Entry;
  elapsedDays: number;
  fullDays: number;
};

const TARGET_NAME = "Darth Monk";
const TARGET_SERVER = "F28";
const MIN_REFERENCE_SAMPLE_SIZE = 5;
const DAY_MS = 86_400_000;
const XP_TOTAL_AFTER_LEVEL_393_STEP = 1_500_000_000;

// Same level-total curve as SFTools Calculations.experienceTotalLevel().
const EXPERIENCE_TOTAL_BY_LEVEL = [
  0, 0, 400, 1300, 2700, 4500, 6700, 9590, 13170, 17575, 22930, 29365, 36880, 45805, 56140,
  68115, 81830, 97560, 115305, 135555, 158310, 183930, 212590, 244650, 280110, 319645, 363255,
  411410, 464345, 522605, 586190, 655950, 731885, 814670, 904575, 1002270, 1107755, 1222220,
  1345665, 1478925, 1622350, 1776895, 1942560, 2120770, 2311525, 2515955, 2734495, 2968280,
  3217310, 3483450, 3766700, 4068415, 4389100, 4730270, 5091925, 5476285, 5883350, 6314895,
  6771545, 7255075, 7765485, 8305550, 8875270, 9476705, 10110615, 10779285, 11482715, 12224125,
  13003515, 13823485, 14684885, 15590310, 16539760, 17537245, 18582765, 19679315, 20827915,
  22031835, 23291075, 24610160, 25989090, 27431570, 28938795, 30514470, 32158595, 33876685,
  35668740, 37538945, 39488630, 41522350, 43640105, 45848145, 48146470, 50540160, 53030760,
  55623350, 58317930, 61121915, 64035305, 67063805, 70209195, 73477630, 76869110, 80391905,
  84046015, 87838270, 91770615, 95849880, 100076065, 104458985, 108998640, 113702595, 118573095,
  123618300, 128838210, 134243650, 139834620, 145620080, 151602570, 157791050, 164185520,
  170798645, 177630425, 184690745, 191982385, 199515915, 207291335, 215322610, 223609740,
  232164310, 240989455, 250096760, 259486225, 269173930, 279159875, 289456720, 300067995,
  311007225, 322274410, 333887170, 345845505, 358164090, 370846740, 383908130, 397348260,
  411187420, 425425610, 440078840, 455151385, 470660255, 486605450, 503008935, 519870710,
  537209215, 555029195, 573349090, 592168900, 611513695, 631383475, 651798190, 672762960,
  694298965, 716406205, 739111940, 762416170, 786341715, 810894250, 836096590, 861948735,
  888481460, 915694765, 943613305, 972243355, 1001610965, 1031716135, 1062592080, 1094238800,
  1126684305, 1159935315, 1194019845, 1228937895, 1264726970, 1301387070, 1338948290, 1377418045,
  1416828125, 1457178530, 1498509490, 1540821005, 1584147070, 1628495805, 1673901210, 1720363285,
  1767927185, 1816592910, 1866396930, 1917347935, 1969484295, 2022806010, 2077361540, 2133150885,
  2190215060, 2248563560, 2308237400, 2369236580, 2431615015, 2495372705, 2560553420, 2627167520,
  2695261055, 2764834025, 2835944130, 2908591370, 2982824720, 3058655185, 3136131740, 3215254385,
  3296087370, 3378630695, 3462936605, 3549017110, 3636926980, 3726666215, 3818303085, 3911837590,
  4007327965, 4104787225, 4204273605, 4305787105, 4409403395, 4515122475, 4623006190, 4733068370,
  4845373845, 4959922615, 5076795315, 5195991945, 5317581170, 5441577950, 5568050950, 5697000170,
  5828514385, 5962593595, 6099310685, 6238681840, 6380783240, 6525614885, 6673270990, 6823751555,
  6977137210, 7133445070, 7292755765, 7455069295, 7620489435, 7789016185, 7960734830, 8135663860,
  8313892425, 8495420525, 8680357890, 8868704520, 9060554465, 9255927595, 9454917965, 9657525575,
  9863870850, 10073953790, 10287873805, 10505651905, 10727391720, 10953093250, 11182883880,
  11416763610, 11654841760, 11897140900, 12143770345, 12394730095, 12650159185, 12910057615,
  13174540575, 13443632295, 13717452860, 13996002270, 14279427375, 14567728175, 14861030915,
  15159361095, 15462844960, 15771482510, 16085434105, 16404699745, 16729412440, 17059599545,
  17395399405, 17736812020, 18084005940, 18436981165, 18795883135, 19160741075, 19531700425,
  19908761185, 20292106880, 20681737510, 21077805835, 21480342620, 21889506775, 22305298300,
  22727910515, 23157343420, 23593763650, 24037204035, 24487831215, 24945645190, 25410855490,
  25883462115, 26363640060, 26851424350, 27346996630, 27850356900, 28361725240, 28881101650,
  29408676540, 29944486640, 30488722365, 31041383715, 31602709370, 32172699330, 32751553095,
  33339309845, 33936176685, 34542153615, 35157490710, 35782187970, 36416461995, 37060354425,
  37714081860, 38377644300, 39051312280, 39735085800, 40429191720, 41133673715, 41848766865,
  42574471170, 43311070185, 44058563910, 44817198195, 45587019425, 46368273450, 47160960270,
  47965385435, 48781548945, 49609707725, 50449911030, 51302425125, 52167250010, 53044705685,
  53934792150, 54837787245, 55753742465, 56682935650, 57625366800, 58581380920, 59550978010,
  60534448410, 61531846785, 62543473510, 63569328585, 64609771990, 65664803725, 66734737230,
  67819630335, 68919796485, 70035235680, 71166335240, 72313095165, 73475842310, 74654637145,
  75849817855, 77061384440, 78289741750, 79534889785, 80797180770, 82076678670, 83373735710,
  84688351890, 86020961345, 87371564075, 88740527355, 90127918825, 91534117920, 92959124640,
  94403391850, 95866919550, 97350102860,
];

const PERIODS: Array<{
  key: ProgressRadarPeriodKey;
  label: string;
  minDays: number;
  maxDays: number | null;
  select: "youngest" | "nearest-30" | "oldest";
}> = [
  { key: "short", label: "Kurzfristig", minDays: 1, maxDays: 14, select: "youngest" },
  { key: "medium", label: "Mittelfristig", minDays: 15, maxDays: 45, select: "nearest-30" },
  { key: "long", label: "Langfristig", minDays: 46, maxDays: null, select: "oldest" },
];

const AXES: Array<{ key: ProgressRadarAxisKey; label: string; fieldLabel: string }> = [
  { key: "xpTotal", label: "XP Total", fieldLabel: "XP Total" },
  { key: "primaryBase", label: "Hauptbasisattribut", fieldLabel: "Base Main" },
  { key: "constitutionBase", label: "Basis-Ausdauer", fieldLabel: "Base Constitution" },
];

export function buildProgressRadarModel(inputs: ProgressRadarScanInput[]): ProgressRadarBuildResult {
  const entries = inputs.flatMap(({ scan, summary }) => buildEntriesFromScan(scan, summary));
  const targetEntries = entries
    .filter((entry) => normalizeSearch(entry.name) === normalizeSearch(TARGET_NAME))
    .filter((entry) => normalizeServer(entry.server) === normalizeServer(TARGET_SERVER))
    .sort(compareByScanTime);

  if (!inputs.length) {
    return emptyResult("empty", "Keine lokalen F28-Scans gefunden.", inputs.length, inputs.length);
  }
  if (!targetEntries.length) {
    return emptyResult("missing-player", "Darth Monk wurde im lokalen F28-Scanpool nicht gefunden.", inputs.length, inputs.length);
  }

  const currentPlayer = targetEntries[targetEntries.length - 1];
  if (!currentPlayer.guildKey) {
    return {
      ...emptyResult("missing-guild", "Darth Monks aktuelle Gilde konnte nicht eindeutig bestimmt werden.", inputs.length, entries.length),
      player: toPlayerSummary(currentPlayer),
    };
  }

  const grouped = buildScanGuildLookup(entries);
  const current = buildCurrentView(currentPlayer, grouped);
  const development: Partial<Record<ProgressRadarPeriodKey, ProgressRadarView>> = {};
  const audit: ProgressRadarBuildResult["audit"] = [];

  current.axes.forEach((axis) => {
    audit.push({ view: "Ausbaustand", axis: axis.key, playerValue: axis.playerValue, median: axis.median, sampleSize: axis.sampleSize });
  });

  for (const period of PERIODS) {
    const comparison = findComparisonEntry(targetEntries, currentPlayer, period, grouped);
    if (!comparison) continue;
    const view = buildDevelopmentView(currentPlayer, comparison.entry, comparison.fullDays, period.label, grouped);
    development[period.key] = view;
    view.axes.forEach((axis) => {
      audit.push({
        view: `${period.label} ${comparison.fullDays} Tage`,
        axis: axis.key,
        playerValue: axis.playerValue,
        median: axis.median,
        sampleSize: axis.sampleSize,
      });
    });
  }

  return {
    status: "ready",
    player: toPlayerSummary(currentPlayer),
    current,
    development,
    scanCount: inputs.length,
    loadedScanCount: inputs.length,
    fieldSources: [
      { axis: "xpTotal", fieldLabel: "XP Total", source: "XP Total, sonst SFtools-Kurve: Level-Gesamt-XP + aktuelles Level-XP" },
      { axis: "primaryBase", fieldLabel: "Base Main", source: "normalisierte Attribute je Spielerklasse, Fallback readSfPlayerStats().baseMain" },
      { axis: "constitutionBase", fieldLabel: "Base Constitution", source: "normalisierte Attribute constitution.base, Fallback readSfPlayerStats().conBase" },
    ],
    audit,
  };
}

function emptyResult(
  status: ProgressRadarBuildResult["status"],
  message: string,
  scanCount: number,
  loadedScanCount: number,
): ProgressRadarBuildResult {
  return {
    status,
    message,
    player: null,
    current: null,
    development: {},
    scanCount,
    loadedScanCount,
    fieldSources: [],
    audit: [],
  };
}

function buildCurrentView(currentPlayer: Entry, grouped: Map<string, Map<string, Entry>>): ProgressRadarView {
  const members = [...(grouped.get(scanGuildKey(currentPlayer.sourceScanId, currentPlayer.guildKey ?? ""))?.values() ?? [])];
  const quality = buildRadarSnapshotQuality(members);
  const axes = AXES.map((axis) => buildCurrentAxis(axis, currentPlayer, members, quality));
  return {
    mode: "current",
    label: "Ausbaustand",
    description: "Aktuelle Werte von Darth Monk relativ zum aktuellen Median seiner Gilde.",
    currentScanId: currentPlayer.sourceScanId,
    currentScanLabel: currentPlayer.sourceFilename,
    axes,
    usableAxes: axes.filter((axis) => axis.status === "ok"),
    referenceMemberCount: members.length,
    notes: buildViewNotes(axes, quality.exclusionReason ? [`Ausbaustand-Snapshot ausgeschlossen: ${quality.exclusionReason}`] : []),
  };
}

function buildDevelopmentView(
  currentPlayer: Entry,
  comparisonPlayer: Entry,
  days: number,
  label: string,
  grouped: Map<string, Map<string, Entry>>,
): ProgressRadarView {
  const currentMembers = grouped.get(scanGuildKey(currentPlayer.sourceScanId, currentPlayer.guildKey ?? ""));
  const comparisonMembers =
    comparisonPlayer.guildKey === currentPlayer.guildKey
      ? grouped.get(scanGuildKey(comparisonPlayer.sourceScanId, comparisonPlayer.guildKey ?? ""))
      : null;
  const currentSnapshotMembers = [...(currentMembers?.values() ?? [])];
  const comparisonSnapshotMembers = [...(comparisonMembers?.values() ?? [])];
  const currentQuality = buildRadarSnapshotQuality(currentSnapshotMembers);
  const comparisonQuality = buildRadarSnapshotQuality(comparisonSnapshotMembers);
  const axes = AXES.map((axis) =>
    buildDevelopmentAxis(axis, currentPlayer, comparisonPlayer, currentSnapshotMembers, comparisonSnapshotMembers, currentQuality, comparisonQuality),
  );
  const qualityNotes = [
    currentQuality.exclusionReason ? `Endsnapshot ausgeschlossen: ${currentQuality.exclusionReason}` : null,
    comparisonQuality.exclusionReason ? `Startsnapshot ausgeschlossen: ${comparisonQuality.exclusionReason}` : null,
  ].filter((note): note is string => Boolean(note));

  return {
    mode: "development",
    period: PERIODS.find((period) => period.label === label)?.key,
    label,
    description: "Zuwachs zwischen exakt diesem Scanpaar relativ zum Durchschnitt vollständiger Gildensnapshots.",
    currentScanId: currentPlayer.sourceScanId,
    comparisonScanId: comparisonPlayer.sourceScanId,
    currentScanLabel: currentPlayer.sourceFilename,
    comparisonScanLabel: comparisonPlayer.sourceFilename,
    days,
    axes,
    usableAxes: axes.filter((axis) => axis.status === "ok"),
    referenceMemberCount: Math.min(currentSnapshotMembers.length, comparisonSnapshotMembers.length),
    notes: buildViewNotes(axes, qualityNotes),
  };
}

function buildCurrentAxis(
  axis: (typeof AXES)[number],
  player: Entry,
  members: Entry[],
  quality: RadarSnapshotQuality,
): ProgressRadarAxis {
  const playerValue = player[axis.key];
  if (quality.exclusionReason) {
    return { ...emptyAxis(axis), playerValue, sampleSize: quality.foundUniqueMemberCount, status: "missing-reference" };
  }
  const values = members.map((member) => member[axis.key]).filter(isFiniteNumber);
  if (values.length !== quality.declaredMemberCount) {
    return { ...emptyAxis(axis), playerValue, sampleSize: values.length, status: "missing-reference" };
  }
  return buildAxisFromValues(axis, playerValue, values);
}

function buildDevelopmentAxis(
  axis: (typeof AXES)[number],
  currentPlayer: Entry,
  comparisonPlayer: Entry,
  currentMembers: Entry[],
  comparisonMembers: Entry[],
  currentQuality: RadarSnapshotQuality,
  comparisonQuality: RadarSnapshotQuality,
): ProgressRadarAxis {
  const playerDelta = delta(currentPlayer[axis.key], comparisonPlayer[axis.key]);
  if (currentQuality.exclusionReason || comparisonQuality.exclusionReason) {
    return { ...emptyAxis(axis), playerValue: playerDelta, sampleSize: 0, status: "missing-reference" };
  }
  const currentValues = currentMembers.map((member) => member[axis.key]).filter(isFiniteNumber);
  const comparisonValues = comparisonMembers.map((member) => member[axis.key]).filter(isFiniteNumber);
  if (currentValues.length !== currentQuality.declaredMemberCount || comparisonValues.length !== comparisonQuality.declaredMemberCount) {
    return { ...emptyAxis(axis), playerValue: playerDelta, sampleSize: Math.min(currentValues.length, comparisonValues.length), status: "missing-reference" };
  }
  const currentAverage = average(currentValues);
  const comparisonAverage = average(comparisonValues);
  const reference = currentAverage != null && comparisonAverage != null ? currentAverage - comparisonAverage : null;
  const sampleSize = Math.min(currentValues.length, comparisonValues.length);

  if (!isFiniteNumber(playerDelta)) {
    return { ...emptyAxis(axis), median: reference, sampleSize, status: "missing-player" };
  }
  if (!isFiniteNumber(reference)) {
    return { ...emptyAxis(axis), playerValue: playerDelta, sampleSize, status: "missing-reference" };
  }
  if (playerDelta < 0) {
    return { ...emptyAxis(axis), playerValue: playerDelta, median: reference, sampleSize, status: "negative" };
  }
  if (reference <= 0) {
    return { ...emptyAxis(axis), playerValue: playerDelta, median: reference, sampleSize, status: "zero-reference" };
  }
  return {
    key: axis.key,
    label: axis.label,
    fieldLabel: axis.fieldLabel,
    playerValue: playerDelta,
    median: reference,
    ratio: playerDelta / reference,
    sampleSize,
    status: "ok",
  };
}

function buildAxisFromValues(
  axis: (typeof AXES)[number],
  playerValue: number | null,
  values: number[],
  statusOverride?: ProgressRadarAxisStatus,
): ProgressRadarAxis {
  const sampleSize = values.length;
  const reference = sampleSize >= MIN_REFERENCE_SAMPLE_SIZE ? median(values) : null;
  if (!isFiniteNumber(playerValue)) {
    return { ...emptyAxis(axis), median: reference, sampleSize, status: "missing-player" };
  }
  if (values.length < MIN_REFERENCE_SAMPLE_SIZE) {
    return { ...emptyAxis(axis), playerValue, sampleSize: values.length, status: "missing-reference" };
  }
  if (!isFiniteNumber(reference)) {
    return { ...emptyAxis(axis), playerValue, sampleSize: values.length, status: "missing-reference" };
  }
  if (reference <= 0) {
    return { ...emptyAxis(axis), playerValue, median: reference, sampleSize: values.length, status: "zero-reference" };
  }
  return {
    key: axis.key,
    label: axis.label,
    fieldLabel: axis.fieldLabel,
    playerValue,
    median: reference,
    ratio: statusOverride ? null : playerValue / reference,
    sampleSize: values.length,
    status: statusOverride ?? "ok",
  };
}

function emptyAxis(axis: (typeof AXES)[number]): ProgressRadarAxis {
  return {
    key: axis.key,
    label: axis.label,
    fieldLabel: axis.fieldLabel,
    playerValue: null,
    median: null,
    ratio: null,
    sampleSize: 0,
    status: "missing-reference",
  };
}

function buildViewNotes(axes: ProgressRadarAxis[], initialNotes: string[] = []) {
  const notes: string[] = [...initialNotes];
  axes.forEach((axis) => {
    if (axis.status === "missing-player") notes.push(`${axis.label}: Darth-Monk-Wert fehlt.`);
    if (axis.status === "missing-reference") notes.push(`${axis.label}: zu wenige gültige Gildenwerte.`);
    if (axis.status === "zero-reference") notes.push(`${axis.label}: Gildenreferenz ist null oder negativ.`);
    if (axis.status === "negative") notes.push(`${axis.label}: negativer Verlauf.`);
  });
  if (axes.filter((axis) => axis.status === "ok").length < 3) {
    notes.unshift("Weniger als drei belastbare Achsen verfügbar; Radarfläche wird nicht gezeichnet.");
  }
  return notes;
}

function buildEntriesFromScan(scan: GuildHubLocalScan, summary: GuildHubScanSummary): Entry[] {
  const raw = asRecord(scan.rawData);
  const players = raw ? getRecordArray(raw.players) : [];
  if (!players.length) return [];

  const groups = raw ? getRecordArray(raw.groups).concat(getRecordArray(raw.guilds)) : [];
  const groupsBySegment = buildGroupLookup(groups);
  const normalizedMembers = Array.isArray(scan.normalizedMembers)
    ? scan.normalizedMembers
    : normalizeGuildScanMembers(scan.rawData);
  const normalizedByRef = new Map(normalizedMembers.map((member) => [member.memberRef.toLowerCase(), member]));
  const scanMs = scanTimestampMs(scan, summary);

  return players.map((player) => toEntry(player, scan, summary, scanMs, normalizedByRef, groupsBySegment)).filter(Boolean) as Entry[];
}

function toEntry(
  player: JsonRecord,
  scan: GuildHubLocalScan,
  summary: GuildHubScanSummary,
  fallbackScannedAtMs: number,
  normalizedByRef: Map<string, NormalizedGuildMember>,
  groupsBySegment: Map<string, GroupInfo>,
): Entry | null {
  const identifier = readString(player, ["identifier", "Identifier"]);
  const playerId = readString(player, ["playerId", "Player ID", "id", "ID"]);
  const server = normalizeServer(
    readString(player, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(identifier),
  );
  if (normalizeServer(server) !== normalizeServer(TARGET_SERVER)) return null;

  const ref = identifier ? identifier.toLowerCase() : playerId && server ? `${server.toLowerCase()}_p${playerId}` : null;
  const normalized = ref ? normalizedByRef.get(ref) ?? null : null;
  const normalizedPlayer = safeNormalizePlayer(player);
  const stats = readSfPlayerStats(player);
  const name =
    normalizedPlayer?.identity.name ??
    normalized?.name ??
    readString(player, ["name", "Name", "playerName", "Player Name"]);
  if (!name) return null;

  const identity = resolveIdentityKey({ identifier, playerId, server, name, sourceScanId: scan.id });
  const groupInfo = findGroupInfo(normalized, player, groupsBySegment);
  const guildName =
    normalizedPlayer?.guild.name ??
    normalized?.guildName ??
    readString(player, ["guildName", "Guild Name", "groupname", "groupName", "guild", "Guild"]) ??
    groupInfo?.name ??
    null;
  const classId = normalizedPlayer?.identity.class ?? normalized?.classId ?? stats.classId ?? readString(player, ["classId", "Class ID", "class", "Class"]);
  const classMeta = getClassMetaById(classId);
  const baseAttributes = readBaseAttributes(normalizedPlayer, classMeta?.primaryAttribute ?? null, stats);
  const serverDisplay = server ?? normalizedPlayer?.identity.server ?? normalized?.server ?? null;

  return {
    sourceScanId: scan.id,
    sourceFilename: summary.displayName || summary.filename,
    scannedAtMs: getEntryTimestampMs(player) ?? fallbackScannedAtMs,
    memberKey: identity,
    guildKey: resolveGuildKey({ normalized, normalizedPlayer, player, server: serverDisplay, guildName, groupInfo }),
    guildDeclaredMemberCount: groupInfo?.memberCount ?? null,
    name,
    server: serverDisplay,
    guildName,
    xpTotal: readTotalXp(player, normalizedPlayer, stats),
    primaryBase: baseAttributes.primaryBase,
    constitutionBase: baseAttributes.constitutionBase,
  };
}

type GroupInfo = { name: string | null; server: string | null; segment: string | null; memberCount: number | null };

type RadarSnapshotQuality = {
  declaredMemberCount: number | null;
  foundUniqueMemberCount: number;
  exclusionReason: string | null;
};

function buildGroupLookup(groups: JsonRecord[]) {
  const lookup = new Map<string, GroupInfo>();
  groups.forEach((group) => {
    const info: GroupInfo = {
      name: readString(group, ["name", "Name", "groupname", "groupName", "guildName", "guild"]),
      server: normalizeServer(
        readString(group, ["server", "Server", "prefix", "world", "realm"]) ??
          parseServerFromIdentifier(readString(group, ["identifier", "guildIdentifier"])),
      ),
      segment: normalizeGuildSegmentForScan(
        readString(group, ["guildIdentifier", "Guild Identifier", "identifier", "Identifier", "groupIdentifier", "groupId", "guildId", "id"]),
      ),
      memberCount: readNumber(group, ["guildMemberCount", "Guild Member Count", "memberCount", "members", "count"]),
    };
    if (!info.segment) return;
    lookup.set(groupLookupKey(info.segment, info.server), info);
    lookup.set(groupLookupKey(info.segment, null), info);
  });
  return lookup;
}

function findGroupInfo(normalized: NormalizedGuildMember | null, player: JsonRecord, groupsBySegment: Map<string, GroupInfo>) {
  const server = normalizeServer(normalized?.server ?? readString(player, ["server", "Server", "prefix", "world", "realm"]));
  const segment =
    normalized?.guildSegment ??
    normalized?.groupSegment ??
    normalizeGuildSegmentForScan(readString(player, ["guildIdentifier", "Guild Identifier", "group", "groupIdentifier", "groupId", "guildId"]));
  if (!segment) return null;
  return groupsBySegment.get(groupLookupKey(segment, server)) ?? groupsBySegment.get(groupLookupKey(segment, null)) ?? null;
}

function resolveGuildKey({
  normalized,
  normalizedPlayer,
  player,
  server,
  guildName,
  groupInfo,
}: {
  normalized: NormalizedGuildMember | null;
  normalizedPlayer: NormalizedPlayer | null;
  player: JsonRecord;
  server: string | null;
  guildName: string | null;
  groupInfo: GroupInfo | null;
}) {
  const normalizedServer = normalizeServer(server ?? normalized?.server ?? normalizedPlayer?.guild.server ?? groupInfo?.server);
  const guildIdentifier =
    normalizedPlayer?.guild.identifier ??
    readString(player, ["guildIdentifier", "Guild Identifier", "groupIdentifier", "groupId", "guildId"]) ??
    null;
  const guildSegment =
    normalizeGuildSegmentForScan(guildIdentifier) ??
    normalized?.guildSegment ??
    normalized?.groupSegment ??
    groupInfo?.segment;
  if (normalizedServer && guildSegment) return `${normalizedServer.toLowerCase()}:${guildSegment.toLowerCase()}`;
  const nameKey = normalizeSearch(guildName ?? groupInfo?.name);
  if (normalizedServer && nameKey) return `${normalizedServer.toLowerCase()}:name:${nameKey}`;
  return null;
}

function buildScanGuildLookup(entries: Entry[]) {
  const lookup = new Map<string, Map<string, Entry>>();
  entries.forEach((entry) => {
    if (!entry.guildKey) return;
    const groupKey = scanGuildKey(entry.sourceScanId, entry.guildKey);
    const members = lookup.get(groupKey) ?? new Map<string, Entry>();
    const previous = members.get(entry.memberKey);
    if (!previous || scoreCompleteness(entry) >= scoreCompleteness(previous)) {
      members.set(entry.memberKey, entry);
      lookup.set(groupKey, members);
    }
  });
  return lookup;
}

function findComparisonEntry(
  entries: Entry[],
  current: Entry,
  period: (typeof PERIODS)[number],
  grouped: Map<string, Map<string, Entry>>,
) {
  const currentMembers = [...(grouped.get(scanGuildKey(current.sourceScanId, current.guildKey ?? ""))?.values() ?? [])];
  if (!isRadarSnapshotComplete(currentMembers)) return null;
  return (
    entries
      .map((entry) => toComparisonCandidate(entry, current))
      .filter((candidate): candidate is ComparisonCandidate => Boolean(candidate))
      .filter((candidate) => {
        const members = [...(grouped.get(scanGuildKey(candidate.entry.sourceScanId, candidate.entry.guildKey ?? ""))?.values() ?? [])];
        return isRadarSnapshotComplete(members);
      })
      .filter((candidate) => candidate.fullDays >= period.minDays && (period.maxDays == null || candidate.fullDays <= period.maxDays))
      .sort(comparePeriodCandidates(period))[0] ?? null
  );
}

function isRadarSnapshotComplete(members: Entry[]) {
  return buildRadarSnapshotQuality(members).exclusionReason == null;
}

function buildRadarSnapshotQuality(members: Entry[]): RadarSnapshotQuality {
  const declaredMemberCount = members.find((member) => isPlausibleMemberCount(member.guildDeclaredMemberCount))?.guildDeclaredMemberCount ?? null;
  const foundUniqueMemberCount = members.length;
  if (declaredMemberCount == null) {
    return {
      declaredMemberCount,
      foundUniqueMemberCount,
      exclusionReason: "Deklarierter Member Count fehlt oder ist ungültig.",
    };
  }
  if (foundUniqueMemberCount !== declaredMemberCount) {
    return {
      declaredMemberCount,
      foundUniqueMemberCount,
      exclusionReason: `Gefundene eindeutige Member (${foundUniqueMemberCount}) weichen vom deklarierten Member Count (${declaredMemberCount}) ab.`,
    };
  }
  return { declaredMemberCount, foundUniqueMemberCount, exclusionReason: null };
}

function isPlausibleMemberCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function toComparisonCandidate(entry: Entry, current: Entry): ComparisonCandidate | null {
  if (entry.scannedAtMs >= current.scannedAtMs) return null;
  if (!entry.guildKey || entry.guildKey !== current.guildKey) return null;
  const elapsedDays = (current.scannedAtMs - entry.scannedAtMs) / DAY_MS;
  if (!Number.isFinite(elapsedDays)) return null;
  const fullDays = Math.floor(elapsedDays);
  if (fullDays < 1) return null;
  return { entry, elapsedDays, fullDays };
}

function comparePeriodCandidates(period: (typeof PERIODS)[number]) {
  return (a: ComparisonCandidate, b: ComparisonCandidate) => {
    if (period.select === "oldest") return a.entry.scannedAtMs - b.entry.scannedAtMs;
    if (period.select === "nearest-30") {
      const distance = Math.abs(a.fullDays - 30) - Math.abs(b.fullDays - 30);
      if (distance !== 0) return distance;
      return b.entry.scannedAtMs - a.entry.scannedAtMs;
    }
    return b.entry.scannedAtMs - a.entry.scannedAtMs;
  };
}

function scoreCompleteness(entry: Entry) {
  return Number(entry.xpTotal != null) + Number(entry.primaryBase != null) + Number(entry.constitutionBase != null);
}

function readTotalXp(
  player: JsonRecord,
  normalizedPlayer: NormalizedPlayer | null,
  stats: ReturnType<typeof readSfPlayerStats>,
) {
  const directTotal = readNumber(player, ["xpTotal", "XP Total", "totalXp", "Total XP", "XP_Total"]);
  if (directTotal != null) return directTotal;

  const level = toFiniteNumber(normalizedPlayer?.progression.level) ?? toFiniteNumber(stats.level) ?? readNumber(player, ["level", "Level"]);
  const currentLevelXp = toFiniteNumber(normalizedPlayer?.progression.xp) ?? readNumber(player, ["xp", "XP"]);
  if (level == null || currentLevelXp == null) return null;

  return experienceTotalLevel(level) + currentLevelXp;
}

function experienceTotalLevel(level: number) {
  const normalizedLevel = Math.max(0, Math.trunc(level));
  const maxCurveLevel = EXPERIENCE_TOTAL_BY_LEVEL.length - 1;
  const curveLevel = Math.min(normalizedLevel, maxCurveLevel);
  return (
    EXPERIENCE_TOTAL_BY_LEVEL[curveLevel] +
    Math.max(0, normalizedLevel - maxCurveLevel) * XP_TOTAL_AFTER_LEVEL_393_STEP
  );
}

function readBaseAttributes(
  normalized: NormalizedPlayer | null,
  primaryAttribute: "strength" | "dexterity" | "intelligence" | null,
  stats: ReturnType<typeof readSfPlayerStats>,
) {
  const primaryBase =
    normalized && primaryAttribute
      ? toFiniteNumber(normalized.attributes[primaryAttribute]?.base) ?? toFiniteNumber(stats.baseMain)
      : toFiniteNumber(stats.baseMain);
  const constitutionBase = toFiniteNumber(normalized?.attributes.constitution.base) ?? toFiniteNumber(stats.conBase);
  return { primaryBase, constitutionBase };
}

export function readProgressRadarTotalXpForPlayer(player: JsonRecord) {
  const normalizedPlayer = safeNormalizePlayer(player);
  return readTotalXp(player, normalizedPlayer, readSfPlayerStats(player));
}

export function readProgressRadarBaseAttributesForPlayer(player: JsonRecord) {
  const normalizedPlayer = safeNormalizePlayer(player);
  const stats = readSfPlayerStats(player);
  const classMeta = getClassMetaById(normalizedPlayer?.identity.class ?? stats.classId ?? readString(player, ["classId", "Class ID", "class", "Class"]));
  return readBaseAttributes(normalizedPlayer, classMeta?.primaryAttribute ?? null, stats);
}

export function readProgressRadarCombinedBaseStatsForPlayer(player: JsonRecord) {
  const { primaryBase, constitutionBase } = readProgressRadarBaseAttributesForPlayer(player);
  return primaryBase != null && constitutionBase != null ? primaryBase + constitutionBase : null;
}

function resolveIdentityKey({
  identifier,
  playerId,
  server,
  name,
  sourceScanId,
}: {
  identifier: string | null;
  playerId: string | null;
  server: string | null;
  name: string;
  sourceScanId: string;
}) {
  if (identifier) return `identifier:${identifier.toLowerCase()}`;
  if (server && playerId) return `server-player-id:${server.toLowerCase()}:p${playerId}`;
  return `scan-name:${sourceScanId}:${normalizeSearch(name)}`;
}

function scanTimestampMs(scan: GuildHubLocalScan, summary: GuildHubScanSummary) {
  const scannedAt = scan.scannedAt ? Date.parse(scan.scannedAt) : NaN;
  if (Number.isFinite(scannedAt)) return scannedAt;
  if (summary.lastSnapshotTimestamp != null && Number.isFinite(summary.lastSnapshotTimestamp)) return summary.lastSnapshotTimestamp;
  return summary.importedAt || Date.parse(scan.importedAt) || 0;
}

function getEntryTimestampMs(entry: JsonRecord) {
  return readTimestampMs(entry, ["scannedAt", "scanAt", "timestamp", "timestampSec", "timestampRaw"]);
}

function readTimestampMs(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = pickFirst(record, [key]);
    const parsed = toTimestampMillis(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function toTimestampMillis(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{13}$/.test(trimmed)) return Number(trimmed);
    if (/^\d{10}$/.test(trimmed)) return Number(trimmed) * 1000;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function groupLookupKey(segment: string, server: string | null) {
  return `${server?.toLowerCase() ?? "*"}:${segment.toLowerCase()}`;
}

function scanGuildKey(sourceScanId: string, guildKey: string) {
  return `${sourceScanId}::${guildKey}`;
}

function compareByScanTime(a: Entry, b: Entry) {
  return a.scannedAtMs - b.scannedAtMs || a.sourceScanId.localeCompare(b.sourceScanId);
}

function toPlayerSummary(entry: Entry): ProgressRadarPlayerSummary {
  return {
    name: entry.name,
    server: entry.server,
    guildName: entry.guildName,
    memberKey: entry.memberKey,
    guildKey: entry.guildKey ?? "",
  };
}

function median(values: number[]) {
  const sorted = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]) {
  const validValues = values.filter(isFiniteNumber);
  if (!validValues.length) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function delta(current: number | null, comparison: number | null) {
  if (!isFiniteNumber(current) || !isFiniteNumber(comparison)) return null;
  return current - comparison;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeNormalizePlayer(player: JsonRecord) {
  try {
    return normalizeSfPlayerCharacterCore(player);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord).filter((entry): entry is JsonRecord => Boolean(entry)) : [];
}

function pickFirst(record: JsonRecord, keys: string[]) {
  const values = asRecord(record.values);
  const latest = asRecord(record.latest);
  const sources = [
    record,
    values,
    asRecord(values?.latestValues),
    latest,
    asRecord(latest?.values),
    asRecord(record.latestValues),
  ].filter((entry): entry is JsonRecord => Boolean(entry));

  for (const source of sources) {
    const lookup = new Map<string, string>();
    Object.keys(source).forEach((key) => {
      const canonical = canonicalizeKey(key);
      if (canonical && !lookup.has(canonical)) lookup.set(canonical, key);
    });
    for (const key of keys) {
      const direct = source[key];
      if (direct != null && String(direct).trim()) return direct;
      const resolved = lookup.get(canonicalizeKey(key));
      const value = resolved ? source[resolved] : undefined;
      if (value != null && String(value).trim()) return value;
    }
  }
  return undefined;
}

function readString(record: JsonRecord | null, keys: string[]) {
  if (!record) return null;
  const value = pickFirst(record, keys);
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function readNumber(record: JsonRecord | null, keys: string[]) {
  if (!record) return null;
  const value = pickFirst(record, keys);
  if (value == null || value === "") return null;
  const parsed = parseLocaleNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLocaleNumber(value: unknown) {
  if (typeof value === "number") return value;
  let raw = String(value ?? "").trim().replace(/\s+/g, "");
  if (!raw) return Number.NaN;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    raw = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    raw = /^-?\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  }
  return Number(raw);
}

function canonicalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toFiniteNumber(value: unknown) {
  return isFiniteNumber(value) ? value : null;
}

function normalizeServer(value: unknown) {
  return normalizeServerKeyFromInput(value);
}

function parseServerFromIdentifier(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(.+)_[gp][^_]+$/i);
  return match?.[1] ?? null;
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}
