import React from "react";
import html2canvas from "html2canvas";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  ListChecks,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Swords,
  Trash2,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import ContentShell from "../../components/ContentShell";
import GuildContextBar from "../../components/guilds/GuildContextBar";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import { getClassMetaById } from "../../data/classes";
import { guildIconByIdentifier } from "../../data/guilds";
import {
  listGuildHubLocalGuildsForServerFromScanSummaries,
  listGuildHubLocalServersFromScanSummaries,
  listGuildHubScanSummaries,
  subscribeToSfDataHubLocalScanChanges,
} from "../../lib/guilds/localScanLibrary";
import type { FightReportScanProgress } from "./fightReportOcr";
import {
  addFightTrackerMember,
  createFightTracker,
  deleteFightTrackerFight,
  deleteFightTracker,
  deleteFightTrackerMember,
  isFightTrackerLinkedToGuild,
  putFightTrackerFight,
  putFightTrackerMember,
  readFightTrackerStateById,
  readFightTrackerSummaries,
  renameFightTracker,
  updateFightTrackerSyncMetadata,
  type CreateFightTrackerMemberInput,
  type FightMemberSnapshot,
  type FightMemberStatus,
  type FightNumber,
  type FightSource,
  type FightTrackerGuild,
  type FightTrackerMember,
  type FightTrackerSummary,
  type GuildFight,
} from "./fightTrackingStore";
import {
  buildFightTrackerSyncPlan,
  loadLatestScanSnapshotForGuild,
  type FightTrackerScanMember,
  type FightTrackerScanSnapshot,
  type FightTrackerSyncPlan,
} from "./fightTrackingScanSource";
import {
  buildGuildLogoIdentifier,
  mapLocalGuildIdentityToSelection,
  useGuildHubSelection,
  type GuildHubSelectedGuild,
} from "./hooks/useGuildHubSelection";
import styles from "./FightTracking.module.css";

type TrackerRow = FightTrackerMember & {
  isCurrentMember: boolean;
};

type ParticipationSortKey = "guildRole" | "name" | "baseStats" | "totalStats" | "level" | "missed";
type ParticipationSortDirection = "asc" | "desc";
type ParticipationStatusDrafts = Record<string, { fightId: string; memberId: string; status: FightMemberStatus }>;
type MobileFightWindowDirection = "older" | "newer";
type MobileFightSwipeState = {
  memberId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  swiped: boolean;
};
type ParticipationMouseDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  startedOnInteractiveTarget: boolean;
  hasPointerCapture: boolean;
  didDrag: boolean;
};

type FightTrackerReadonlyStats = {
  level: number | null;
  baseStatsSum: number | null;
  totalStats: number | null;
};

type ParticipationDerivedRow = {
  member: TrackerRow;
  missed: number;
  evaluated: number;
  lastMissedFight: GuildFight | null;
  streakStatus: Exclude<FightMemberStatus, "unknown"> | null;
  streakCount: number;
  level: number | null;
  baseStatsSum: number | null;
  totalStats: number | null;
};

type FightParticipationLookup = {
  missedMemberIds: Set<string>;
  rosterMemberIds: Set<string>;
};

type FightCreationTarget = {
  date: string;
  fightNumber: FightNumber;
};

type ReviewRecognitionState = "confirmed" | "uncertain" | "not_detected";

type ParticipationExportType = "simple" | "detailed";
type ParticipationExportBusyAction = "preview" | "download";
type ParticipationExportPreview = {
  blob: Blob;
  cacheKey: string;
  fileBaseName: string;
  height: number;
  url: string;
  width: number;
};
type GuildParticipationSummary = {
  ok: number;
  missed: number;
  evaluated: number;
  rate: number | null;
};
type GuildActivityLevel = "empty" | "low" | "mid" | "high" | "max";
type GuildActivityFightSlot = GuildParticipationSummary & {
  date: string;
  day: number;
  fightNumber: FightNumber;
  hasFight: boolean;
  level: GuildActivityLevel;
};
type GuildActivityDay = {
  date: string;
  day: number;
  fights: Record<FightNumber, GuildActivityFightSlot>;
};

const PARTICIPATION_EXPORT_PREVIEW_ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const PARTICIPATION_EXPORT_PREVIEW_MIN_ZOOM = PARTICIPATION_EXPORT_PREVIEW_ZOOM_LEVELS[0];
const PARTICIPATION_EXPORT_PREVIEW_MAX_ZOOM =
  PARTICIPATION_EXPORT_PREVIEW_ZOOM_LEVELS[PARTICIPATION_EXPORT_PREVIEW_ZOOM_LEVELS.length - 1];

type LocalScreenshotPreview = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl: string;
};

type ImportReviewState = {
  date: string;
  fightNumber: FightNumber;
  fightType: "attack";
  reportType: "attack" | "uncertain" | "unsupported_defense";
  opponentGuild: string;
  source: FightSource;
  memberStates: Record<string, ReviewRecognitionState>;
  unknownNames: string[];
  uncertainNames: string[];
  ocrNotice: string | null;
};

type LocalScreenshotImportSession = {
  id: string;
  screenshots: LocalScreenshotPreview[];
  review: ImportReviewState;
};

type ScanState = {
  status: "idle" | "scanning" | "complete" | "error";
  progress: number;
  message: string;
};

type TrackerManagerState = {
  trackerId: string;
  mode: "closed" | "rename" | "delete";
  renameValue: string;
};

type MobileFunctionPanelId = "sync" | "member" | "memberList" | "fight" | "screenshots" | "tracklist";

type TrackerGuildSource = GuildHubSelectedGuild;

const formatInputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const todayInputValue = () => formatInputDate(new Date());

const createFightId = () => `fight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const createImportSessionId = () => `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const createScreenshotId = () => `shot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const createParticipationDraftKey = (fightId: string, memberId: string) => `${fightId}::${memberId}`;
const PARTICIPATION_MOUSE_DRAG_THRESHOLD_PX = 6;
const PARTICIPATION_FIGHT_COLUMN_WIDTH_PX = 132;
const PARTICIPATION_STICKY_COLUMN_WIDTH_PX = 240 + 82 + 82 + 142 + 126;
const PARTICIPATION_STICKY_COLUMN_VARS = [
  "--participation-member-column",
  "--participation-missed-column",
  "--participation-quote-column",
  "--participation-last-missed-column",
  "--participation-streak-column",
] as const;
const FIGHT_SLOTS: FightNumber[] = ["1", "2"];
const EXPORT_ACTIVITY_DAY_WIDTH_PX = 20;
const EXPORT_SIMPLE_BASE_WIDTH_PX = 1240;
const EXPORT_SIMPLE_FIGHT_BLOCK_WIDTH_PX = 54;
const EXPORT_SIMPLE_FIGHT_BLOCK_GAP_PX = 4;
const EXPORT_SIMPLE_REPORT_HORIZONTAL_CHROME_PX = 80;

const normalizeFightNumber = (value: unknown): FightNumber => (value === "2" ? "2" : "1");

const normalizeString = (value: unknown) => String(value ?? "").trim();

const isValidFightNumber = (value: unknown): value is FightNumber => value === "1" || value === "2";

const getFightDateKey = (value: string) => {
  const normalized = normalizeString(value);
  const dateMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch?.[1]) return dateMatch[1];
  const germanDateMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (germanDateMatch) {
    const [, dayValue, monthValue, yearValue] = germanDateMatch;
    return `${yearValue}-${monthValue.padStart(2, "0")}-${dayValue.padStart(2, "0")}`;
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : normalized.slice(0, 10);
};

const getFightSlotKey = (date: string, fightNumber: FightNumber) => `${getFightDateKey(date)}::${fightNumber}`;

const getFightsForSlot = (fights: GuildFight[], date: string, fightNumber: FightNumber) =>
  fights.filter((fight) => getFightDateKey(fight.date) === getFightDateKey(date) && fight.fightNumber === fightNumber);

const getNextAvailableFightNumber = (fights: GuildFight[], date: string): FightNumber | null => {
  const dateKey = getFightDateKey(date);
  const occupiedSlots = new Set(
    fights.filter((fight) => getFightDateKey(fight.date) === dateKey && isValidFightNumber(fight.fightNumber)).map((fight) => fight.fightNumber),
  );
  if (!occupiedSlots.has("1")) return "1";
  if (!occupiedSlots.has("2")) return "2";
  return null;
};

const addDaysToInputDate = (dateValue: string, days: number) => {
  const dateKey = getFightDateKey(dateValue);
  const dateMatch = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return todayInputValue();
  const [, yearValue, monthValue, dayValue] = dateMatch;
  const date = new Date(Number(yearValue), Number(monthValue) - 1, Number(dayValue));
  if (Number.isNaN(date.getTime())) return todayInputValue();
  date.setDate(date.getDate() + days);
  return formatInputDate(date);
};

const getFightCreationOrderIssue = (fights: GuildFight[]) => {
  if (!fights.length) return null;
  const createdAtValues = fights.map((fight) => timestampMs(fight.createdAt));
  if (createdAtValues.some((value) => value == null)) {
    return "Mindestens ein gespeicherter Fight hat keine gueltige Erstellzeit.";
  }
  const newest = Math.max(...createdAtValues.filter((value): value is number => value != null));
  const newestCount = createdAtValues.filter((value) => value === newest).length;
  if (newestCount > 1) {
    return "Mehrere gespeicherte Fights teilen sich dieselbe neueste Erstellzeit.";
  }
  return null;
};

const getLatestSavedFight = (fights: GuildFight[]) => {
  const orderIssue = getFightCreationOrderIssue(fights);
  if (orderIssue) return null;
  return fights.reduce<GuildFight | null>((latest, fight) => {
    if (!latest) return fight;
    return (timestampMs(fight.createdAt) ?? 0) > (timestampMs(latest.createdAt) ?? 0) ? fight : latest;
  }, null);
};

const getNextFightCreationTarget = (fights: GuildFight[], latestFightOverride?: GuildFight): FightCreationTarget => {
  const latestFight = latestFightOverride ?? getLatestSavedFight(fights);
  if (!latestFight) return { date: todayInputValue(), fightNumber: "1" };
  const date = getFightDateKey(latestFight.date);

  const availableSlot = getNextAvailableFightNumber(fights, date);
  if (availableSlot) return { date, fightNumber: availableSlot };

  return { date: addDaysToInputDate(date, 1), fightNumber: "1" };
};

const getDuplicateFightSlots = (fights: GuildFight[]) => {
  const slots = new Map<string, GuildFight[]>();
  fights.forEach((fight) => {
    if (!isValidFightNumber(fight.fightNumber)) return;
    const key = getFightSlotKey(fight.date, fight.fightNumber);
    slots.set(key, [...(slots.get(key) ?? []), fight]);
  });
  return [...slots.values()].filter((slotFights) => slotFights.length > 1);
};

const getMonthInputValue = () => todayInputValue().slice(0, 7);

const getMonthDays = (monthValue: string) => {
  const [yearValue, monthPart] = monthValue.split("-");
  const year = Number(yearValue);
  const monthIndex = Number(monthPart) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return 0;
  return new Date(year, monthIndex + 1, 0).getDate();
};

const getDateForMonthDay = (monthValue: string, day: number) => `${monthValue}-${String(day).padStart(2, "0")}`;

const formatMonthLabel = (monthValue: string) => {
  const [yearValue, monthPart] = monthValue.split("-");
  const year = Number(yearValue);
  const monthIndex = Number(monthPart) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) return monthValue;
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(year, monthIndex, 1));
};

const sortFightsByDateAndSlot = (fights: GuildFight[]) =>
  [...fights].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.fightNumber.localeCompare(b.fightNumber) || a.createdAt.localeCompare(b.createdAt);
  });

const getFightsForMonth = (fights: GuildFight[], monthValue: string) =>
  sortFightsByDateAndSlot(fights.filter((fight) => fight.date.startsWith(`${monthValue}-`)));

const getParticipationStickyWidth = (wrapper: HTMLDivElement) => {
  const table = wrapper.querySelector("table");
  if (!table) return 0;
  const tableStyle = window.getComputedStyle(table);
  return PARTICIPATION_STICKY_COLUMN_VARS.reduce((sum, propertyName) => {
    const value = Number.parseFloat(tableStyle.getPropertyValue(propertyName));
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
};

const normalizeNameKey = (value: unknown) =>
  normalizeString(value)
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\p{Z}+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");

const createEmptyReviewState = (date: string, fightNumber: FightNumber): ImportReviewState => ({
  date,
  fightNumber,
  fightType: "attack",
  reportType: "attack",
  opponentGuild: "",
  source: "manual",
  memberStates: {},
  unknownNames: [],
  uncertainNames: [],
  ocrNotice: null,
});

const formatDate = (value: string) => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
};

const formatShortDate = (value: string) => {
  if (!value) return "-";
  const date = new Date(`${getFightDateKey(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date);
};

const formatFightLabel = (fight: GuildFight) =>
  [`Fight ${fight.fightNumber}`, formatDate(fight.date), fight.opponentGuild].filter(Boolean).join(" · ");

const formatQuote = (missed: number, eligible: number) => {
  if (!eligible) return "—";
  return `${Math.round((missed / eligible) * 100)}%`;
};

const formatParticipationRate = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 1000) / 10}%`);

const getGuildActivityLevel = (rate: number | null): GuildActivityLevel => {
  if (rate == null) return "empty";
  if (rate >= 0.95) return "max";
  if (rate >= 0.85) return "high";
  if (rate >= 0.7) return "mid";
  return "low";
};

const getGuildParticipationSummary = (fights: GuildFight[], rows: ParticipationDerivedRow[]): GuildParticipationSummary => {
  const counts = fights.reduce(
    (sum, fight) => {
      rows.forEach((row) => {
        const status = getFightMemberStatus(fight, row.member.id);
        if (status === "ok") sum.ok += 1;
        if (status === "missed") sum.missed += 1;
      });
      return sum;
    },
    { ok: 0, missed: 0 },
  );
  const evaluated = counts.ok + counts.missed;
  return {
    ...counts,
    evaluated,
    rate: evaluated ? counts.ok / evaluated : null,
  };
};

const getGuildActivityDays = (month: string, fights: GuildFight[], rows: ParticipationDerivedRow[]): GuildActivityDay[] => {
  const dayCount = getMonthDays(month);
  const fightBySlot = new Map(fights.map((fight) => [getFightSlotKey(fight.date, fight.fightNumber), fight]));
  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const date = getDateForMonthDay(month, day);
    return {
      date,
      day,
      fights: FIGHT_SLOTS.reduce(
        (slots, fightNumber) => {
          const fight = fightBySlot.get(getFightSlotKey(date, fightNumber)) ?? null;
          const summary = getGuildParticipationSummary(fight ? [fight] : [], rows);
          slots[fightNumber] = {
            ...summary,
            date,
            day,
            fightNumber,
            hasFight: Boolean(fight),
            level: fight ? getGuildActivityLevel(summary.rate) : "empty",
          };
          return slots;
        },
        {} as Record<FightNumber, GuildActivityFightSlot>,
      ),
    };
  });
};

const hasPerfectMonthParticipation = (row: ParticipationDerivedRow) => row.evaluated > 0 && row.missed === 0;

const getFightTrackerGuildLogoIdentifier = (tracker: FightTrackerGuild) =>
  tracker.linkedGuildHubLogoIdentifier ?? buildGuildLogoIdentifier(tracker.server, tracker.linkedGuildHubGuildId);

const getSimpleExportWidth = (fightCount: number) => {
  const fightTimelineWidth =
    fightCount * EXPORT_SIMPLE_FIGHT_BLOCK_WIDTH_PX + Math.max(0, fightCount - 1) * EXPORT_SIMPLE_FIGHT_BLOCK_GAP_PX;
  return Math.max(EXPORT_SIMPLE_BASE_WIDTH_PX, EXPORT_SIMPLE_REPORT_HORIZONTAL_CHROME_PX + fightTimelineWidth);
};

const getFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const formatMemberClassName = (value: string | null | undefined) => getClassMetaById(value)?.label ?? "Unknown";

const timestampMs = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const getMemberPositiveConfirmationAt = (member: FightTrackerMember) =>
  normalizeString(member.lastConfirmedActiveAt) ||
  normalizeString(member.lastSeenScanAt) ||
  (member.source === "manual" ? normalizeString(member.createdAt) : null);

const pickNewestTimestamp = (existing: string | null | undefined, candidate: string | null | undefined) => {
  const candidateMs = timestampMs(candidate);
  if (candidateMs == null) return normalizeString(existing) || null;
  const existingMs = timestampMs(existing);
  if (existingMs == null || candidateMs >= existingMs) return new Date(candidateMs).toISOString();
  return normalizeString(existing) || null;
};

const pickGuildRoleFromScan = (
  member: FightTrackerMember,
  input: CreateFightTrackerMemberInput,
  scanAt: string | null,
): Pick<FightTrackerMember, "guildRole" | "guildRoleSeenAt"> => {
  const existingRole = member.guildRole ?? null;
  const existingSeenAt = normalizeString(member.guildRoleSeenAt) || null;
  const incomingRole = input.guildRole ?? null;
  if (!incomingRole) return { guildRole: existingRole, guildRoleSeenAt: existingSeenAt };

  const scanMs = timestampMs(scanAt);
  if (scanMs == null) {
    return existingRole
      ? { guildRole: existingRole, guildRoleSeenAt: existingSeenAt }
      : { guildRole: incomingRole, guildRoleSeenAt: existingSeenAt };
  }

  const roleSeenMs = timestampMs(existingSeenAt);
  if (roleSeenMs != null && scanMs < roleSeenMs) {
    return { guildRole: existingRole, guildRoleSeenAt: existingSeenAt };
  }

  return { guildRole: incomingRole, guildRoleSeenAt: new Date(scanMs).toISOString() };
};

const hasGuildRolePatchFromScan = (member: FightTrackerMember, input: CreateFightTrackerMemberInput, scanAt: string | null) => {
  const next = pickGuildRoleFromScan(member, input, scanAt);
  return next.guildRole !== (member.guildRole ?? null) || next.guildRoleSeenAt !== (normalizeString(member.guildRoleSeenAt) || null);
};

const readIncomingBaseStats = (input: CreateFightTrackerMemberInput | FightTrackerScanMember) =>
  ("baseStatsSum" in input ? getFiniteNumber(input.baseStatsSum) : null) ?? getFiniteNumber(input.baseStats);

const pickStatsFromScan = (
  member: FightTrackerMember,
  input: CreateFightTrackerMemberInput | FightTrackerScanMember,
  scanAt: string | null,
): Pick<FightTrackerMember, "baseStats" | "totalStats" | "statsSeenAt"> => {
  const existingBaseStats = getFiniteNumber(member.baseStats);
  const existingTotalStats = getFiniteNumber(member.totalStats);
  const existingSeenAt = normalizeString(member.statsSeenAt) || null;
  const incomingBaseStats = readIncomingBaseStats(input);
  const incomingTotalStats = getFiniteNumber(input.totalStats);
  const hasIncomingStats = incomingBaseStats != null || incomingTotalStats != null;
  if (!hasIncomingStats) {
    return { baseStats: existingBaseStats, totalStats: existingTotalStats, statsSeenAt: existingSeenAt };
  }

  const scanMs = timestampMs(scanAt);
  const hasExistingStats = existingBaseStats != null || existingTotalStats != null;
  if (scanMs == null) {
    return hasExistingStats
      ? { baseStats: existingBaseStats, totalStats: existingTotalStats, statsSeenAt: existingSeenAt }
      : { baseStats: incomingBaseStats, totalStats: incomingTotalStats, statsSeenAt: existingSeenAt };
  }

  const statsSeenMs = timestampMs(existingSeenAt);
  if (statsSeenMs != null && scanMs < statsSeenMs) {
    return { baseStats: existingBaseStats, totalStats: existingTotalStats, statsSeenAt: existingSeenAt };
  }

  return {
    baseStats: incomingBaseStats ?? existingBaseStats,
    totalStats: incomingTotalStats ?? existingTotalStats,
    statsSeenAt: new Date(scanMs).toISOString(),
  };
};

const hasStatsPatchFromScan = (
  member: FightTrackerMember,
  input: CreateFightTrackerMemberInput | FightTrackerScanMember,
  scanAt: string | null,
) => {
  const next = pickStatsFromScan(member, input, scanAt);
  return (
    next.baseStats !== getFiniteNumber(member.baseStats) ||
    next.totalStats !== getFiniteNumber(member.totalStats) ||
    next.statsSeenAt !== (normalizeString(member.statsSeenAt) || null)
  );
};

const canUseScanConfirmationForMember = (member: FightTrackerMember, scanAt: string | null) => {
  const scanMs = timestampMs(scanAt);
  if (scanMs == null) return false;
  const confirmedMs = timestampMs(getMemberPositiveConfirmationAt(member));
  return confirmedMs == null || scanMs >= confirmedMs;
};

const toFightMemberSnapshot = (
  member: Pick<FightTrackerMember, "id" | "name" | "className" | "level">,
  tracker: FightTrackerGuild,
  capturedAt: string,
): FightMemberSnapshot => ({
  id: member.id,
  name: member.name,
  className: member.className,
  level: member.level,
  guildId: tracker.id,
  guildName: tracker.name,
  server: tracker.server ?? "",
  capturedAt,
});

const sortMembers = <T extends { name: string; active?: boolean }>(members: T[]) =>
  [...members].sort((a, b) => a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" }));

const withoutName = (names: string[], name: string) => names.filter((entry) => normalizeNameKey(entry) !== normalizeNameKey(name));

const loadTrackerGuildSources = async (selectedGuilds: GuildHubSelectedGuild[]): Promise<TrackerGuildSource[]> => {
  const guilds = new Map<string, TrackerGuildSource>();
  selectedGuilds.forEach((guild) => guilds.set(guild.id, guild));

  const summaries = await listGuildHubScanSummaries();
  const serverOptions = listGuildHubLocalServersFromScanSummaries(summaries);
  serverOptions.forEach((server) => {
    listGuildHubLocalGuildsForServerFromScanSummaries(summaries, server.id).forEach((guild) => {
      const selection = mapLocalGuildIdentityToSelection(guild);
      if (selection) guilds.set(selection.id, selection);
    });
  });

  return [...guilds.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" }) ||
      a.server.localeCompare(b.server, "de-DE", { sensitivity: "base" }),
  );
};

const getFightMemberStatus = (fight: GuildFight, memberId: string): FightMemberStatus => {
  if (fight.missedMemberIds.includes(memberId)) return "missed";
  if (fight.rosterSnapshot.some((snapshotMember) => snapshotMember.id === memberId)) return "ok";
  return "unknown";
};

const buildFightParticipationLookup = (fights: GuildFight[]) => {
  const lookup = new Map<string, FightParticipationLookup>();
  fights.forEach((fight) => {
    lookup.set(fight.id, {
      missedMemberIds: new Set(fight.missedMemberIds),
      rosterMemberIds: new Set(fight.rosterSnapshot.map((member) => member.id)),
    });
  });
  return lookup;
};

const getFightMemberStatusFromLookup = (
  fight: GuildFight,
  memberId: string,
  lookupByFightId: Map<string, FightParticipationLookup>,
): FightMemberStatus => {
  const lookup = lookupByFightId.get(fight.id);
  if (!lookup) return getFightMemberStatus(fight, memberId);
  if (lookup.missedMemberIds.has(memberId)) return "missed";
  if (lookup.rosterMemberIds.has(memberId)) return "ok";
  return "unknown";
};

const setFightMemberStatus = (
  fight: GuildFight,
  member: TrackerRow | null | undefined,
  tracker: FightTrackerGuild,
  status: FightMemberStatus,
): GuildFight => {
  const memberId = member?.id;
  if (!memberId) return fight;

  const missed = new Set(fight.missedMemberIds);
  let nextRoster = fight.rosterSnapshot;

  if (status === "unknown") {
    nextRoster = fight.rosterSnapshot.filter((snapshotMember) => snapshotMember.id !== memberId);
    missed.delete(memberId);
  } else {
    if (!nextRoster.some((snapshotMember) => snapshotMember.id === memberId)) {
      nextRoster = [...nextRoster, toFightMemberSnapshot(member, tracker, fight.createdAt)];
    }
    if (status === "missed") {
      missed.add(memberId);
    } else {
      missed.delete(memberId);
    }
  }

  return {
    ...fight,
    rosterSnapshot: nextRoster,
    missedMemberIds: [...missed],
  };
};

const deriveParticipationRows = (
  rows: TrackerRow[],
  fights: GuildFight[],
  getParticipationStatus: (fight: GuildFight, memberId: string) => FightMemberStatus,
  readonlyStatsByMemberId: Map<string, FightTrackerReadonlyStats>,
): ParticipationDerivedRow[] =>
  rows.map((member) => {
    const statuses = fights.map((fight) => getParticipationStatus(fight, member.id));
    const missed = statuses.filter((status) => status === "missed").length;
    const evaluated = statuses.filter((status) => status !== "unknown").length;
    let lastMissedFight: GuildFight | null = null;
    let streakStatus: Exclude<FightMemberStatus, "unknown"> | null = null;
    let streakCount = 0;
    for (let index = statuses.length - 1; index >= 0; index -= 1) {
      const status = statuses[index];
      if (!lastMissedFight && status === "missed") lastMissedFight = fights[index] ?? null;
      if (status === "unknown") continue;
      if (!streakStatus) streakStatus = status;
      if (status !== streakStatus) break;
      streakCount += 1;
    }
    const readonlyStats = readonlyStatsByMemberId.get(member.id);
    return {
      member,
      missed,
      evaluated,
      lastMissedFight,
      streakStatus,
      streakCount,
      level: getFiniteNumber(member.level) ?? readonlyStats?.level ?? null,
      baseStatsSum: getFiniteNumber(member.baseStats) ?? readonlyStats?.baseStatsSum ?? null,
      totalStats: getFiniteNumber(member.totalStats) ?? readonlyStats?.totalStats ?? null,
    };
  });

const sortParticipationRows = (
  rows: ParticipationDerivedRow[],
  sortKey: ParticipationSortKey,
  sortDirection: ParticipationSortDirection,
) => {
  const byName = (a: ParticipationDerivedRow, b: ParticipationDerivedRow) =>
    a.member.name.localeCompare(b.member.name, "de-DE", { sensitivity: "base" });
  const byGuildRole = (a: ParticipationDerivedRow, b: ParticipationDerivedRow) => {
    const roleOrder = { leader: 0, officer: 1, member: 2 } as const;
    const aRole = a.member.guildRole ? roleOrder[a.member.guildRole] : 3;
    const bRole = b.member.guildRole ? roleOrder[b.member.guildRole] : 3;
    if (aRole !== bRole) {
      if (aRole === 3 || bRole === 3) return aRole - bRole;
      return sortDirection === "asc" ? bRole - aRole : aRole - bRole;
    }

    const aLevel = a.level;
    const bLevel = b.level;
    const aLevelMissing = aLevel == null;
    const bLevelMissing = bLevel == null;
    if (aLevelMissing || bLevelMissing) {
      if (aLevelMissing && bLevelMissing) return byName(a, b);
      return aLevelMissing ? 1 : -1;
    }

    const levelCompare = sortDirection === "asc" ? aLevel - bLevel : bLevel - aLevel;
    return levelCompare || byName(a, b);
  };
  const numericValue = (row: ParticipationDerivedRow) => {
    switch (sortKey) {
      case "baseStats":
        return row.baseStatsSum;
      case "totalStats":
        return row.totalStats;
      case "level":
        return row.level;
      case "missed":
        return row.missed;
      default:
        return null;
    }
  };

  return [...rows].sort((a, b) => {
    if (sortKey === "guildRole") return byGuildRole(a, b);

    if (sortKey === "name") {
      const nameCompare = byName(a, b);
      return sortDirection === "asc" ? nameCompare : -nameCompare;
    }

    const aValue = numericValue(a);
    const bValue = numericValue(b);
    const aMissing = aValue == null;
    const bMissing = bValue == null;
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return byName(a, b);
      return aMissing ? 1 : -1;
    }

    const diff = sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    return diff || byName(a, b);
  });
};

const formatStreak = (status: Exclude<FightMemberStatus, "unknown"> | null, count: number) =>
  status ? `${count}x ${status === "ok" ? "dabei" : "fehlt"}` : "-";

const sanitizeFileBaseName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "") || "fight-participation";

const waitForAnimationFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const waitForStableLayout = async (node: HTMLElement) => {
  let previous = "";
  for (let index = 0; index < 6; index += 1) {
    await waitForAnimationFrame();
    const rect = node.getBoundingClientRect();
    const current = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    if (current === previous) return;
    previous = current;
  }
};

const waitForExportAssets = async (node: HTMLElement) => {
  for (let index = 0; index < 90; index += 1) {
    const coaState = node.dataset.fightParticipationExportCoaState;
    if (coaState !== "loading") break;
    await waitForAnimationFrame();
  }

  const images = [...node.querySelectorAll("img")];
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
    }),
  );
};

const renderExportNodeToPngBlob = async (node: HTMLElement, options: { preserveCssPixelSize?: boolean } = {}) => {
  await waitForAnimationFrame();
  await waitForAnimationFrame();
  if (document.fonts?.ready) await document.fonts.ready;
  await waitForExportAssets(node);
  await waitForStableLayout(node);

  const rect = node.getBoundingClientRect();
  const targetWidth = Math.max(1, Math.ceil(rect.width));
  const targetHeight = Math.max(1, Math.ceil(rect.height));
  const scale = options.preserveCssPixelSize ? 1 : Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  if (targetWidth * scale > 32000 || targetHeight * scale > 32000 || targetWidth * targetHeight * scale * scale > 268000000) {
    throw new Error("Der Report ist fuer einen einzelnen PNG-Export zu gross. Inhalte wurden nicht gekuerzt.");
  }
  const viewportWidth = Math.max(1, Math.ceil(document.documentElement.clientWidth || window.innerWidth));
  const viewportHeight = Math.max(1, Math.ceil(document.documentElement.clientHeight || window.innerHeight));
  const canvas = await html2canvas(node, {
    backgroundColor: null,
    scale,
    foreignObjectRendering: false,
    useCORS: true,
    allowTaint: false,
    logging: false,
    width: targetWidth,
    height: targetHeight,
    windowWidth: Math.max(viewportWidth, targetWidth),
    windowHeight: Math.max(viewportHeight, targetHeight),
    onclone: (clonedDoc) => {
      const clonedExportNode = clonedDoc.querySelector<HTMLElement>("[data-fight-participation-export-root='true']");
      if (!clonedExportNode) return;
      clonedExportNode.style.width = `${targetWidth}px`;
      clonedExportNode.style.minWidth = `${targetWidth}px`;
      clonedExportNode.style.maxWidth = `${targetWidth}px`;
      clonedExportNode.style.minHeight = "0";
      clonedExportNode.style.height = "auto";
      clonedExportNode.style.overflow = "visible";
    },
  });
  if (options.preserveCssPixelSize && (canvas.width !== targetWidth || canvas.height !== targetHeight)) {
    throw new Error(
      `PNG konnte nicht in Originalgroesse erzeugt werden (${canvas.width}x${canvas.height} statt ${targetWidth}x${targetHeight}). Inhalte wurden nicht verkleinert.`,
    );
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("PNG konnte nicht erzeugt werden."));
          return;
        }
        resolve(blob);
      },
      "image/png",
      1,
    );
  });

  return { blob, height: canvas.height, width: canvas.width };
};

const downloadPngUrl = (url: string, fileBaseName: string) => {
  const link = document.createElement("a");
  link.download = `${sanitizeFileBaseName(fileBaseName)}.png`;
  link.href = url;
  link.click();
};

function useMediaQuery(query: string) {
  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return false;
    return window.matchMedia(query).matches;
  }, [query]);
  const [matches, setMatches] = React.useState(getSnapshot);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return undefined;
    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

export default function GuildHubFightTracking() {
  const { activeGuild, selectedGuilds, isLoading: guildSelectionLoading } = useGuildHubSelection();
  const isCompactLayout = useMediaQuery("(max-width: 1024px)");
  const [overviewLoading, setOverviewLoading] = React.useState(true);
  const [guildSourcesLoading, setGuildSourcesLoading] = React.useState(false);
  const [trackerDetailLoading, setTrackerDetailLoading] = React.useState(false);
  const [syncLoading, setSyncLoading] = React.useState(false);
  const [storeError, setStoreError] = React.useState<string | null>(null);
  const [guildSourcesError, setGuildSourcesError] = React.useState<string | null>(null);
  const [trackerSummaries, setTrackerSummaries] = React.useState<FightTrackerSummary[]>([]);
  const [trackerGuildSources, setTrackerGuildSources] = React.useState<TrackerGuildSource[]>([]);
  const [tracker, setTracker] = React.useState<FightTrackerGuild | null>(null);
  const [trackerMembers, setTrackerMembers] = React.useState<FightTrackerMember[]>([]);
  const [fights, setFights] = React.useState<GuildFight[]>([]);
  const [setupGuildName, setSetupGuildName] = React.useState("");
  const [setupGuildServer, setSetupGuildServer] = React.useState("");
  const [selectedScanGuildId, setSelectedScanGuildId] = React.useState("");
  const [isAddPanelOpen, setIsAddPanelOpen] = React.useState(false);
  const [managerState, setManagerState] = React.useState<TrackerManagerState | null>(null);
  const [manualMemberName, setManualMemberName] = React.useState("");
  const [date, setDate] = React.useState(todayInputValue);
  const [fightNumber, setFightNumber] = React.useState<FightNumber>("1");
  const [opponentGuild, setOpponentGuild] = React.useState("");
  const [trackerScanSnapshot, setTrackerScanSnapshot] = React.useState<FightTrackerScanSnapshot | null>(null);
  const [syncPlan, setSyncPlan] = React.useState<FightTrackerSyncPlan | null>(null);
  const [scanImportStatus, setScanImportStatus] = React.useState<string | null>(null);
  const [importSession, setImportSession] = React.useState<LocalScreenshotImportSession | null>(null);
  const [activeMobilePanel, setActiveMobilePanel] = React.useState<MobileFunctionPanelId | null>(null);
  const [participationStatusDrafts, setParticipationStatusDrafts] = React.useState<ParticipationStatusDrafts>({});
  const [isApplyingParticipationDrafts, setIsApplyingParticipationDrafts] = React.useState(false);
  const [scanState, setScanState] = React.useState<ScanState>({
    status: "idle",
    progress: 0,
    message: "",
  });

  const resetTrackerView = React.useCallback(() => {
    setTracker(null);
    setTrackerMembers([]);
    setFights([]);
    setSyncPlan(null);
    setTrackerScanSnapshot(null);
    setScanImportStatus(null);
    setActiveMobilePanel(null);
    setParticipationStatusDrafts({});
    setIsApplyingParticipationDrafts(false);
    setImportSession((prev) => {
      prev?.screenshots.forEach((screenshot) => URL.revokeObjectURL(screenshot.previewUrl));
      return null;
    });
    setScanState({ status: "idle", progress: 0, message: "" });
  }, []);

  const refreshTrackerSummaries = React.useCallback(async () => {
    const summaries = await readFightTrackerSummaries();
    setTrackerSummaries(summaries);
  }, []);

  const refreshGuildSources = React.useCallback(async () => {
    const guildSources = await loadTrackerGuildSources(selectedGuilds);
    setTrackerGuildSources(guildSources);
  }, [selectedGuilds]);

  React.useEffect(() => {
    let cancelled = false;
    if (guildSelectionLoading) return undefined;

    const load = () => {
      setOverviewLoading(true);
      refreshTrackerSummaries()
        .then(() => {
          if (!cancelled) setStoreError(null);
        })
        .catch(() => {
          if (!cancelled) setStoreError("Fight-Tracker-Daten konnten nicht geladen werden.");
        })
        .finally(() => {
          if (!cancelled) setOverviewLoading(false);
        });
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [guildSelectionLoading, refreshTrackerSummaries]);

  React.useEffect(() => {
    let cancelled = false;
    if (guildSelectionLoading) return undefined;

    const load = (showLoading: boolean) => {
      if (showLoading) setGuildSourcesLoading(true);
      refreshGuildSources()
        .then(() => {
          if (!cancelled) setGuildSourcesError(null);
        })
        .catch(() => {
          if (!cancelled) setGuildSourcesError("Scan-Quellen konnten nicht geladen werden.");
        })
        .finally(() => {
          if (!cancelled && showLoading) setGuildSourcesLoading(false);
        });
    };

    load(true);
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(() => load(false));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [guildSelectionLoading, refreshGuildSources]);

  React.useEffect(() => {
    return () => {
      importSession?.screenshots.forEach((screenshot) => URL.revokeObjectURL(screenshot.previewUrl));
    };
  }, [importSession?.id]);

  React.useEffect(() => {
    if (!isCompactLayout && activeMobilePanel === "tracklist") setActiveMobilePanel(null);
  }, [activeMobilePanel, isCompactLayout]);

  React.useEffect(() => {
    setSyncPlan(null);
    setTrackerScanSnapshot(null);
    setSyncLoading(false);
  }, [tracker?.id]);

  const activeRoster = React.useMemo(() => trackerMembers.filter((member) => member.active), [trackerMembers]);

  const rowMembers = React.useMemo<TrackerRow[]>(() => {
    const rows = new Map<string, TrackerRow>();
    trackerMembers.forEach((member) => rows.set(member.id, { ...member, isCurrentMember: member.active }));

    fights.forEach((fight) => {
      fight.rosterSnapshot.forEach((member) => {
        if (rows.has(member.id)) return;
        rows.set(member.id, {
          id: member.id,
          trackerId: fight.trackerId,
          name: member.name,
          active: false,
          source: "manual",
          scanMemberRef: null,
          className: member.className,
          level: member.level,
          baseStats: null,
          totalStats: null,
          statsSeenAt: null,
          guildRole: null,
          guildRoleSeenAt: null,
          lastSeenScanId: null,
          lastSeenScanAt: null,
          lastConfirmedActiveAt: null,
          createdAt: member.capturedAt,
          updatedAt: member.capturedAt,
          isCurrentMember: false,
        });
      });
    });

    return sortMembers([...rows.values()]);
  }, [fights, trackerMembers]);

  const rosterLookup = React.useMemo(() => {
    const map = new Map<string, TrackerRow>();
    rowMembers.forEach((member) => map.set(member.id, member));
    return map;
  }, [rowMembers]);

  const sortedFights = React.useMemo(
    () => sortFightsByDateAndSlot(fights),
    [fights],
  );
  const fightCreationOrderIssue = React.useMemo(() => getFightCreationOrderIssue(fights), [fights]);
  const manualDefaultFightNumber = React.useMemo(() => getNextAvailableFightNumber(fights, date), [date, fights]);
  const manualSelectedSlotFights = React.useMemo(() => getFightsForSlot(fights, date, fightNumber), [date, fightNumber, fights]);
  const hasInvalidFightSlots = React.useMemo(() => fights.some((fight) => !isValidFightNumber(fight.fightNumber)), [fights]);

  const scanImportPlan = React.useMemo(
    () => (tracker ? buildFightTrackerSyncPlan(tracker, trackerMembers, trackerScanSnapshot) : null),
    [tracker, trackerMembers, trackerScanSnapshot],
  );

  const visibleScanImportPlan = syncPlan ?? scanImportPlan;
  const hasGuildScanLink = Boolean(tracker?.linkedGuildHubGuildId || tracker?.linkedGuildHubLogoIdentifier);

  const readonlyStatsByMemberId = React.useMemo(() => {
    const map = new Map<string, FightTrackerReadonlyStats>();
    if (!visibleScanImportPlan) return map;

    [
      ...visibleScanImportPlan.existingMembers,
      ...visibleScanImportPlan.confirmedManualMembers,
      ...visibleScanImportPlan.reactivatedMembers,
    ].forEach(({ member, scanMember }) => {
      map.set(member.id, {
        level: getFiniteNumber(scanMember.level),
        baseStatsSum: getFiniteNumber(scanMember.baseStatsSum),
        totalStats: getFiniteNumber(scanMember.totalStats),
      });
    });

    return map;
  }, [visibleScanImportPlan]);

  const scanSourceOptions = React.useMemo(
    () =>
      trackerGuildSources.filter(
        (source) => !trackerSummaries.some((summary) => isFightTrackerLinkedToGuild(summary.tracker, source)),
      ),
    [trackerGuildSources, trackerSummaries],
  );

  const activeGuildTrackerId = React.useMemo(
    () =>
      activeGuild
        ? trackerSummaries.find((summary) => isFightTrackerLinkedToGuild(summary.tracker, activeGuild))?.tracker.id ?? null
        : null,
    [activeGuild, trackerSummaries],
  );
  const applyFightCreationTarget = (targetFights: GuildFight[]) => {
    const orderIssue = getFightCreationOrderIssue(targetFights);
    if (orderIssue) return;
    const target = getNextFightCreationTarget(targetFights);
    setDate(target.date);
    setFightNumber(target.fightNumber);
  };

  const openTracker = async (trackerId: string) => {
    setTrackerDetailLoading(true);
    try {
      const state = await readFightTrackerStateById(trackerId);
      setTracker(state.tracker);
      setTrackerMembers(state.members);
      setFights(state.fights);
      applyFightCreationTarget(state.fights);
      setSyncPlan(null);
      setScanImportStatus(null);
      setStoreError(null);
      setIsAddPanelOpen(false);
      setActiveMobilePanel(null);
      setParticipationStatusDrafts({});
      setIsApplyingParticipationDrafts(false);
    } catch {
      setStoreError("Fight Tracker konnte nicht geoeffnet werden.");
    } finally {
      setTrackerDetailLoading(false);
    }
  };

  const backToSelection = async () => {
    resetTrackerView();
    try {
      await refreshTrackerSummaries();
      void refreshGuildSources().catch(() => setGuildSourcesError("Scan-Quellen konnten nicht geladen werden."));
      setStoreError(null);
    } catch {
      setStoreError("Fight-Tracker-Auswahl konnte nicht aktualisiert werden.");
    }
  };

  const createTrackerFromGuildSource = async (guild: TrackerGuildSource) => {
    const state = await createFightTracker({
      name: guild.name,
      server: guild.server,
      source: "guild_scan",
      linkedGuildHubGuildId: guild.guildId,
      linkedGuildHubLogoIdentifier: guild.logoIdentifier,
    });
    await refreshTrackerSummaries();
    void refreshGuildSources().catch(() => setGuildSourcesError("Scan-Quellen konnten nicht geladen werden."));
    setTracker(state.tracker);
    setTrackerMembers(state.members);
    setFights(state.fights);
    applyFightCreationTarget(state.fights);
    setSyncPlan(null);
    setScanImportStatus(null);
    setIsAddPanelOpen(false);
    setActiveMobilePanel(null);
    setSelectedScanGuildId("");
    setParticipationStatusDrafts({});
    setIsApplyingParticipationDrafts(false);
  };

  const createSelectedScanTracker = async () => {
    const source = scanSourceOptions.find((guild) => guild.id === selectedScanGuildId) ?? scanSourceOptions[0];
    if (!source) return;
    await createTrackerFromGuildSource(source);
  };

  const createManualTracker = async () => {
    const name = setupGuildName.trim();
    if (!name) return;
    const state = await createFightTracker({ name, server: setupGuildServer, source: "manual" });
    await refreshTrackerSummaries();
    void refreshGuildSources().catch(() => setGuildSourcesError("Scan-Quellen konnten nicht geladen werden."));
    setTracker(state.tracker);
    setTrackerMembers(state.members);
    setFights(state.fights);
    applyFightCreationTarget(state.fights);
    setSetupGuildName("");
    setSetupGuildServer("");
    setScanImportStatus(null);
    setIsAddPanelOpen(false);
    setActiveMobilePanel(null);
    setParticipationStatusDrafts({});
    setIsApplyingParticipationDrafts(false);
  };

  const startTrackerManagement = (summary: FightTrackerSummary, mode: TrackerManagerState["mode"]) => {
    setManagerState({
      trackerId: summary.tracker.id,
      mode,
      renameValue: summary.tracker.name,
    });
  };

  const saveTrackerRename = async () => {
    if (!managerState || managerState.mode !== "rename") return;
    const summary = trackerSummaries.find((entry) => entry.tracker.id === managerState.trackerId);
    if (!summary) return;
    const updated = await renameFightTracker(summary.tracker, managerState.renameValue);
    setTrackerSummaries((prev) =>
      prev.map((entry) => (entry.tracker.id === updated.id ? { ...entry, tracker: updated } : entry)),
    );
    setTracker((prev) => (prev?.id === updated.id ? updated : prev));
    setManagerState(null);
  };

  const confirmTrackerDelete = async () => {
    if (!managerState || managerState.mode !== "delete") return;
    await deleteFightTracker(managerState.trackerId);
    if (tracker?.id === managerState.trackerId) resetTrackerView();
    setManagerState(null);
    await refreshTrackerSummaries();
    void refreshGuildSources().catch(() => setGuildSourcesError("Scan-Quellen konnten nicht geladen werden."));
  };

  const addMember = async (input: CreateFightTrackerMemberInput, options?: { markMissingInReview?: boolean }) => {
    if (!tracker) return null;
    const name = input.name.trim();
    if (!name) return null;
    const existing = trackerMembers.find((member) => normalizeNameKey(member.name) === normalizeNameKey(name));
    if (existing) {
      if (!existing.active) {
        const confirmedAt = normalizeString(input.lastConfirmedActiveAt) || normalizeString(input.lastSeenScanAt) || new Date().toISOString();
        const updated: FightTrackerMember = {
          ...existing,
          active: true,
          className: normalizeString(input.className) || existing.className,
          level: typeof input.level === "number" && Number.isFinite(input.level) ? input.level : existing.level,
          ...pickGuildRoleFromScan(existing, input, input.lastSeenScanAt ?? null),
          ...pickStatsFromScan(existing, input, input.lastSeenScanAt ?? null),
          lastConfirmedActiveAt: pickNewestTimestamp(getMemberPositiveConfirmationAt(existing), confirmedAt),
        };
        await putFightTrackerMember(updated);
        setTrackerMembers((prev) => sortMembers(prev.map((member) => (member.id === updated.id ? updated : member))));
        setSyncPlan(null);
        setTrackerScanSnapshot(null);
        void refreshTrackerSummaries();
        if (options?.markMissingInReview) markReviewMember(updated.id, name);
        return updated;
      }
      if (options?.markMissingInReview) markReviewMember(existing.id, name);
      return existing;
    }

    const member = await addFightTrackerMember(tracker.id, input);
    if (!member) return null;
    setTrackerMembers((prev) => sortMembers([...prev, member]));
    setSyncPlan(null);
    setTrackerScanSnapshot(null);
    void refreshTrackerSummaries();
    if (options?.markMissingInReview) markReviewMember(member.id, name);
    return member;
  };

  const markReviewMember = (memberId: string, ocrName: string) => {
    setImportSession((prev) =>
      prev
        ? {
            ...prev,
            review: {
              ...prev.review,
              memberStates: { ...prev.review.memberStates, [memberId]: "confirmed" },
              unknownNames: withoutName(prev.review.unknownNames, ocrName),
              uncertainNames: withoutName(prev.review.uncertainNames, ocrName),
            },
          }
        : prev,
    );
  };

  const handleAddManualMember = async () => {
    await addMember({ name: manualMemberName, source: "manual", active: true });
    setManualMemberName("");
  };

  const handleMemberActiveChange = async (memberId: string, active: boolean) => {
    const member = trackerMembers.find((entry) => entry.id === memberId);
    if (!member || member.active === active) return;
    const changedAt = new Date().toISOString();
    const updated: FightTrackerMember = {
      ...member,
      active,
      lastConfirmedActiveAt: active ? pickNewestTimestamp(member.lastConfirmedActiveAt, changedAt) : member.lastConfirmedActiveAt,
      updatedAt: changedAt,
    };
    await putFightTrackerMember(updated);
    setTrackerMembers((prev) => sortMembers(prev.map((entry) => (entry.id === memberId ? updated : entry))));
    setSyncPlan(null);
    setTrackerScanSnapshot(null);
    void refreshTrackerSummaries();
  };

  const handleMemberDelete = async (memberId: string) => {
    if (!tracker) return;
    const result = await deleteFightTrackerMember(tracker.id, memberId);
    if (!result.deleted) return;
    setTrackerMembers((prev) => sortMembers(prev.filter((entry) => entry.id !== memberId)));
    setFights(result.fights);
    setSyncPlan(null);
    setTrackerScanSnapshot(null);
    void refreshTrackerSummaries();
    setImportSession((prev) => {
      if (!prev || !(memberId in prev.review.memberStates)) return prev;
      const memberStates = { ...prev.review.memberStates };
      delete memberStates[memberId];
      return {
        ...prev,
        review: {
          ...prev.review,
          memberStates,
        },
      };
    });
  };

  const handleFightDelete = async (fightId: string) => {
    if (!tracker) return;
    const result = await deleteFightTrackerFight(tracker.id, fightId);
    if (!result.deleted) return;
    setFights(result.fights);
    applyFightCreationTarget(result.fights);
    setTrackerSummaries((prev) =>
      prev.map((entry) =>
        entry.tracker.id === tracker.id
          ? {
              ...entry,
              fightCount: result.fights.length,
              missedCount: result.fights.reduce((sum, fight) => sum + fight.missedMemberIds.length, 0),
            }
          : entry,
      ),
    );
  };

  const handleFightOpponentGuildChange = async (fightId: string, opponentGuild: string) => {
    const fight = fights.find((entry) => entry.id === fightId);
    if (!fight) return;
    const updatedFight: GuildFight = { ...fight, opponentGuild: normalizeString(opponentGuild) };
    await putFightTrackerFight(updatedFight);
    setFights((prev) => prev.map((entry) => (entry.id === fightId ? updatedFight : entry)));
  };

  const saveFightInDailySlot = async (fightInput: Omit<GuildFight, "id">) => {
    if (fightCreationOrderIssue) {
      window.alert(`${fightCreationOrderIssue} Der naechste Fight kann nicht sicher bestimmt werden.`);
      return false;
    }
    if (hasInvalidFightSlots) {
      window.alert("Mindestens ein gespeicherter Fight hat keinen gueltigen Fight-1/Fight-2-Slot. Bitte Daten pruefen, bevor neue Fights angelegt werden.");
      return false;
    }

    const slotFights = getFightsForSlot(fights, fightInput.date, fightInput.fightNumber);
    if (slotFights.length > 1) {
      window.alert(
        `Mehrere gespeicherte Fights belegen Fight ${fightInput.fightNumber} am ${formatDate(fightInput.date)}. Der Slot kann nicht automatisch ersetzt werden.`,
      );
      return false;
    }

    const existingFight = slotFights[0] ?? null;
    if (existingFight) {
      const shouldOverwrite = window.confirm(
        `Fight ${fightInput.fightNumber} fuer den ${formatDate(fightInput.date)} existiert bereits. Wirklich ueberschreiben?`,
      );
      if (!shouldOverwrite) return false;
    }

    const nextFight: GuildFight = {
      ...fightInput,
      id: existingFight?.id ?? createFightId(),
    };
    const nextFights = existingFight ? fights.map((fight) => (fight.id === existingFight.id ? nextFight : fight)) : [...fights, nextFight];
    await putFightTrackerFight(nextFight);
    setFights(nextFights);
    setTrackerSummaries((summaries) =>
      summaries.map((summary) =>
        summary.tracker.id === fightInput.trackerId
          ? {
              ...summary,
              fightCount: nextFights.length,
              missedCount: nextFights.reduce((sum, fight) => sum + fight.missedMemberIds.length, 0),
            }
          : summary,
      ),
    );
    const nextTarget = getNextFightCreationTarget(nextFights, nextFight);
    setDate(nextTarget.date);
    setFightNumber(nextTarget.fightNumber);
    if (existingFight) {
      setParticipationStatusDrafts((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (next[key]?.fightId === existingFight.id) delete next[key];
        });
        return next;
      });
    }
    return true;
  };

  const applyMemberMergePlan = async (plan: FightTrackerSyncPlan) => {
    if (!tracker) return { newCount: 0, formerCount: 0, existingCount: 0, inactiveCount: 0 };
    const updatedMembers: FightTrackerMember[] = [];
    let addedCount = 0;
    let formerCount = 0;
    let inactiveCount = 0;
    const knownNames = new Set(trackerMembers.map((member) => normalizeNameKey(member.name)));
    const knownScanRefs = new Set(trackerMembers.map((member) => normalizeString(member.scanMemberRef)).filter(Boolean));

    for (const scanMember of plan.newMembers) {
      const scanMemberName = normalizeNameKey(scanMember.name);
      const scanMemberRef = normalizeString(scanMember.scanMemberRef);
      if ((scanMemberName && knownNames.has(scanMemberName)) || (scanMemberRef && knownScanRefs.has(scanMemberRef))) continue;
      const member = await addFightTrackerMember(tracker.id, scanMember);
      if (!member) continue;
      updatedMembers.push(member);
      if (scanMember.active === false) {
        formerCount += 1;
      } else {
        addedCount += 1;
      }
      if (scanMemberName) knownNames.add(scanMemberName);
      if (scanMemberRef) knownScanRefs.add(scanMemberRef);
    }

    const linkEntries = new Map<string, { member: FightTrackerMember; scanMember: FightTrackerScanMember }>();
    [
      ...plan.existingMembers.filter(
        (entry) =>
          (entry.member.active && canUseScanConfirmationForMember(entry.member, plan.snapshot.scanAt)) ||
          hasGuildRolePatchFromScan(entry.member, entry.scanMember, plan.snapshot.scanAt) ||
          hasStatsPatchFromScan(entry.member, entry.scanMember, plan.snapshot.scanAt),
      ),
      ...plan.confirmedManualMembers,
      ...plan.reactivatedMembers,
    ].forEach((entry) => {
      linkEntries.set(entry.member.id, entry);
    });

    for (const entry of linkEntries.values()) {
      const canUseScanDetails = canUseScanConfirmationForMember(entry.member, plan.snapshot.scanAt);
      const nextLastSeenScanAt = pickNewestTimestamp(entry.member.lastSeenScanAt, plan.snapshot.scanAt);
      const nextLastSeenScanId =
        plan.snapshot.scanAt && nextLastSeenScanAt === new Date(Date.parse(plan.snapshot.scanAt)).toISOString()
          ? plan.snapshot.scanId
          : entry.member.lastSeenScanId;
      const guildRoleUpdate = pickGuildRoleFromScan(entry.member, entry.scanMember, plan.snapshot.scanAt);
      const statsUpdate = pickStatsFromScan(entry.member, entry.scanMember, plan.snapshot.scanAt);
      const updated: FightTrackerMember = {
        ...entry.member,
        active: entry.member.active || canUseScanDetails,
        scanMemberRef: canUseScanDetails ? normalizeString(entry.scanMember.scanMemberRef) || entry.member.scanMemberRef : entry.member.scanMemberRef,
        className: canUseScanDetails ? entry.scanMember.className ?? entry.member.className : entry.member.className,
        level: canUseScanDetails ? entry.scanMember.level ?? entry.member.level : entry.member.level,
        guildRole: guildRoleUpdate.guildRole,
        guildRoleSeenAt: guildRoleUpdate.guildRoleSeenAt,
        baseStats: statsUpdate.baseStats,
        totalStats: statsUpdate.totalStats,
        statsSeenAt: statsUpdate.statsSeenAt,
        lastSeenScanId: nextLastSeenScanId,
        lastSeenScanAt: nextLastSeenScanAt,
        lastConfirmedActiveAt: canUseScanDetails
          ? pickNewestTimestamp(getMemberPositiveConfirmationAt(entry.member), plan.snapshot.scanAt)
          : entry.member.lastConfirmedActiveAt,
        updatedAt: new Date().toISOString(),
      };
      await putFightTrackerMember(updated);
      updatedMembers.push(updated);
    }

    for (const member of plan.missingMembers) {
      const updated: FightTrackerMember = {
        ...member,
        active: false,
        updatedAt: new Date().toISOString(),
      };
      await putFightTrackerMember(updated);
      updatedMembers.push(updated);
      inactiveCount += 1;
    }

    const nextSyncedScanAt = pickNewestTimestamp(tracker.lastSyncedScanAt, plan.snapshot.scanAt);
    const nextSyncedScanId =
      plan.snapshot.scanAt && nextSyncedScanAt === new Date(Date.parse(plan.snapshot.scanAt)).toISOString()
        ? plan.snapshot.scanId
        : tracker.lastSyncedScanId;
    const nextTracker = await updateFightTrackerSyncMetadata(
      tracker,
      nextSyncedScanId,
      nextSyncedScanAt,
      plan.snapshot.normalizerVersion,
      plan.snapshot.coaString,
    );
    setTracker(nextTracker);
    setTrackerMembers((prev) => {
      const next = new Map(prev.map((member) => [member.id, member]));
      updatedMembers.forEach((member) => next.set(member.id, member));
      return sortMembers([...next.values()]);
    });
    setSyncPlan(null);
    setTrackerScanSnapshot(null);
    void refreshTrackerSummaries();

    return {
      newCount: addedCount,
      formerCount,
      existingCount: plan.existingMemberCount,
      inactiveCount,
    };
  };

  const handleImportScanMembers = async () => {
    if (!visibleScanImportPlan?.hasChanges) return;
    const result = await applyMemberMergePlan(visibleScanImportPlan);
    const parts = [];
    if (result.newCount) parts.push(`${result.newCount} neue Mitglieder ergaenzt`);
    if (result.formerCount) parts.push(`${result.formerCount} ehemalige Gildenmitglieder ergaenzt`);
    if (result.existingCount) parts.push(`${result.existingCount} bereits vorhanden`);
    if (result.inactiveCount) parts.push(`${result.inactiveCount} nicht mehr im Scan`);
    setScanImportStatus(parts.length ? parts.join(", ") : "Keine neuen Mitglieder gefunden");
  };

  const handleCreateFight = async () => {
    const opponent = opponentGuild.trim();
    if (!tracker || !date) return;
    const createdAt = new Date().toISOString();
    const didSave = await saveFightInDailySlot({
      trackerId: tracker.id,
      guildId: tracker.id,
      type: "attack",
      date,
      fightNumber,
      opponentGuild: opponent,
      source: "manual",
      createdAt,
      rosterSnapshot: activeRoster.map((member) => toFightMemberSnapshot(member, tracker, createdAt)),
      missedMemberIds: [],
    });
    if (didSave) setOpponentGuild("");
  };

  const handleScreenshotsSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!selectedFiles.length) return;

    const screenshots = selectedFiles.map((file) => ({
      id: createScreenshotId(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      previewUrl: URL.createObjectURL(file),
    }));

    setImportSession((prev) => {
      prev?.screenshots.forEach((screenshot) => URL.revokeObjectURL(screenshot.previewUrl));
      return {
        id: createImportSessionId(),
        screenshots,
        review: createEmptyReviewState(date, manualDefaultFightNumber ?? fightNumber),
      };
    });
    setScanState({ status: "idle", progress: 0, message: "" });
  };

  const handleClearImportSession = () => {
    setImportSession((prev) => {
      prev?.screenshots.forEach((screenshot) => URL.revokeObjectURL(screenshot.previewUrl));
      return null;
    });
    setScanState({ status: "idle", progress: 0, message: "" });
  };

  const handleRemoveScreenshot = (screenshotId: string) => {
    setImportSession((prev) => {
      if (!prev) return prev;
      const removed = prev.screenshots.find((screenshot) => screenshot.id === screenshotId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const screenshots = prev.screenshots.filter((screenshot) => screenshot.id !== screenshotId);
      return screenshots.length ? { ...prev, screenshots } : null;
    });
    setScanState({ status: "idle", progress: 0, message: "" });
  };

  const handleReviewChange = (partial: Partial<ImportReviewState>) => {
    setImportSession((prev) => {
      if (!prev) return prev;
      const nextReview = { ...prev.review, ...partial };
      if (partial.date && partial.fightNumber == null) {
        nextReview.fightNumber = getNextAvailableFightNumber(fights, partial.date) ?? nextReview.fightNumber;
      }
      return { ...prev, review: nextReview };
    });
  };

  const handleReviewMemberStateChange = (memberId: string, state: ReviewRecognitionState) => {
    setImportSession((prev) =>
      prev
        ? {
            ...prev,
            review: {
              ...prev.review,
              memberStates: {
                ...prev.review.memberStates,
                [memberId]: state,
              },
            },
          }
        : prev,
    );
  };

  const handleAddUnknownName = async (name: string) => {
    await addMember({ name, source: "manual", active: true }, { markMissingInReview: true });
  };

  const handleScanScreenshot = async () => {
    if (!importSession) return;
    const screenshot = importSession.screenshots[0];
    if (!screenshot) return;

    setScanState({ status: "scanning", progress: 0, message: "OCR wird lokal vorbereitet..." });

    try {
      const { scanFightReportScreenshot } = await import("./fightReportOcr");
      const scanResult = await scanFightReportScreenshot(
        screenshot.file,
        trackerMembers.map((member) => ({ id: member.id, name: member.name })),
        (progress: FightReportScanProgress) => {
          const percent = Math.round(progress.progress * 100);
          setScanState({
            status: "scanning",
            progress: progress.progress,
            message: progress.status ? `${progress.status} ${percent}%` : `OCR laeuft ${percent}%`,
          });
        },
      );

      setImportSession((prev) => {
        if (!prev || prev.id !== importSession.id) return prev;
        const memberStates: Record<string, ReviewRecognitionState> = {};
        scanResult.confirmedMemberIds.forEach((memberId) => {
          memberStates[memberId] = "confirmed";
        });

        return {
          ...prev,
          review: {
            ...prev.review,
            opponentGuild: scanResult.opponentGuild || prev.review.opponentGuild,
            reportType:
              scanResult.reportKind === "defense"
                ? "unsupported_defense"
                : scanResult.reportKind === "uncertain"
                  ? "uncertain"
                  : "attack",
            source: "ocr",
            memberStates,
            unknownNames: scanResult.unknownNames,
            uncertainNames: scanResult.uncertainNames,
            ocrNotice: scanResult.notices.join(" "),
          },
        };
      });

      setScanState({ status: "complete", progress: 1, message: "Screenshot lokal gescannt." });
    } catch (scanError) {
      setScanState({
        status: "error",
        progress: 0,
        message: scanError instanceof Error ? scanError.message : "OCR konnte nicht ausgefuehrt werden.",
      });
    }
  };

  const handleApplyImportReview = async () => {
    if (!tracker || !importSession?.review.date) return;
    if (importSession.review.reportType === "unsupported_defense") return;
    const createdAt = new Date().toISOString();
    const missedMemberIds = Object.entries(importSession.review.memberStates)
      .filter(([, state]) => state === "confirmed")
      .map(([memberId]) => memberId);
    const snapshotMembers = new Map<string, FightMemberSnapshot>();
    activeRoster.forEach((member) => snapshotMembers.set(member.id, toFightMemberSnapshot(member, tracker, createdAt)));
    missedMemberIds.forEach((memberId) => {
      const member = rosterLookup.get(memberId);
      if (member && !snapshotMembers.has(memberId)) {
        snapshotMembers.set(memberId, toFightMemberSnapshot(member, tracker, createdAt));
      }
    });
    const didSave = await saveFightInDailySlot({
      trackerId: tracker.id,
      guildId: tracker.id,
      type: "attack",
      date: importSession.review.date,
      fightNumber: importSession.review.fightNumber,
      opponentGuild: importSession.review.opponentGuild.trim(),
      source: importSession.review.source,
      createdAt,
      rosterSnapshot: [...snapshotMembers.values()],
      missedMemberIds,
    });
    if (didSave) handleClearImportSession();
  };

  const handleParticipationStatusDraftChange = (fightId: string, memberId: string, status: FightMemberStatus) => {
    const fight = fights.find((entry) => entry.id === fightId);
    if (!fight) return;
    const persistedStatus = getFightMemberStatus(fight, memberId);
    const draftKey = createParticipationDraftKey(fightId, memberId);
    setParticipationStatusDrafts((prev) => {
      const next = { ...prev };
      if (status === persistedStatus) {
        delete next[draftKey];
      } else {
        next[draftKey] = { fightId, memberId, status };
      }
      return next;
    });
  };

  const applyParticipationStatusDrafts = async () => {
    if (!tracker || isApplyingParticipationDrafts) return;
    const draftEntries = Object.values(participationStatusDrafts);
    if (!draftEntries.length) return;

    setIsApplyingParticipationDrafts(true);
    try {
      let nextFights = fights;
      const changedFights = new Map<string, GuildFight>();

      draftEntries.forEach((draft) => {
        nextFights = nextFights.map((fight) => {
          if (fight.id !== draft.fightId) return fight;
          if (getFightMemberStatus(fight, draft.memberId) === draft.status) return fight;
          const updatedFight = setFightMemberStatus(fight, rosterLookup.get(draft.memberId), tracker, draft.status);
          if (updatedFight !== fight) changedFights.set(updatedFight.id, updatedFight);
          return updatedFight;
        });
      });

      if (!changedFights.size) {
        setParticipationStatusDrafts({});
        return;
      }

      setFights(nextFights);
      for (const fight of changedFights.values()) {
        await putFightTrackerFight(fight);
      }
      setParticipationStatusDrafts({});
    } finally {
      setIsApplyingParticipationDrafts(false);
    }
  };

  const handleSetMemberFightStatus = async (fightId: string, memberId: string, status: FightMemberStatus) => {
    if (!tracker) return;
    let updatedFight: GuildFight | null = null;
    const nextFights = fights.map((fight) => {
      if (fight.id !== fightId) return fight;
      updatedFight = setFightMemberStatus(fight, rosterLookup.get(memberId), tracker, status);
      return updatedFight;
    });
    if (!updatedFight) return;
    setFights(nextFights);
    await putFightTrackerFight(updatedFight);
  };

  const totalMissed = fights.reduce((sum, fight) => sum + fight.missedMemberIds.length, 0);
  const canCreateFight = Boolean(tracker && date && !hasInvalidFightSlots && !fightCreationOrderIssue);
  const hasParticipationStatusDrafts = Object.keys(participationStatusDrafts).length > 0;
  const canApplyImportReview = Boolean(
    importSession && tracker && importSession.review.date && importSession.review.reportType !== "unsupported_defense" && !fightCreationOrderIssue,
  );
  const loadSyncPlan = React.useCallback(async () => {
    if (!tracker || !hasGuildScanLink || syncLoading) return;
    setSyncLoading(true);
    setScanImportStatus(null);
    try {
      const snapshot = await loadLatestScanSnapshotForGuild(tracker);
      setTrackerScanSnapshot(snapshot);
      setSyncPlan(buildFightTrackerSyncPlan(tracker, trackerMembers, snapshot));
    } catch {
      setTrackerScanSnapshot(null);
      setSyncPlan(null);
      setScanImportStatus("Scan-Synchronisierung konnte nicht vorbereitet werden.");
    } finally {
      setSyncLoading(false);
    }
  }, [hasGuildScanLink, syncLoading, tracker, trackerMembers]);
  const openFunctionPanel = (panelId: MobileFunctionPanelId) => {
    setActiveMobilePanel(panelId);
    if (panelId === "sync") void loadSyncPlan();
  };
  const syncPanel = hasGuildScanLink ? (
    <ScanMemberImportPanel
      plan={visibleScanImportPlan}
      snapshot={trackerScanSnapshot}
      loading={syncLoading}
      status={scanImportStatus}
      trackerMemberCount={trackerMembers.length}
      onImport={handleImportScanMembers}
    />
  ) : null;
  const mobileSyncPanel = hasGuildScanLink ? (
    <ScanMemberImportPanel
      plan={visibleScanImportPlan}
      snapshot={trackerScanSnapshot}
      loading={syncLoading}
      status={scanImportStatus}
      trackerMemberCount={trackerMembers.length}
      onImport={handleImportScanMembers}
      detailMode="inline"
    />
  ) : null;
  const memberPanel = (
    <MemberAddPanel
      value={manualMemberName}
      onChange={setManualMemberName}
      onAdd={handleAddManualMember}
      canAdd={Boolean(manualMemberName.trim())}
    />
  );
  const memberStatusPanel = (
    <MemberStatusPanel
      members={trackerMembers}
      fights={fights}
      onMemberActiveChange={handleMemberActiveChange}
      onMemberDelete={handleMemberDelete}
      onFightStatusChange={handleSetMemberFightStatus}
      onFightDelete={handleFightDelete}
      onFightOpponentGuildChange={handleFightOpponentGuildChange}
    />
  );
  const fightCreatePanel = (
    <section className={styles.createPanel}>
      <div className={styles.createHeading}>
        <div className={styles.createIcon} aria-hidden>
          <Swords size={18} />
        </div>
        <div>
          <h2>Neuer Angriff</h2>
          <p>{tracker?.name ?? ""}</p>
        </div>
      </div>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Datum</span>
          <span className={styles.inputWrap}>
            <CalendarDays size={16} aria-hidden />
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </span>
        </label>
        <label className={styles.field}>
          <span>Fight</span>
          <select value={fightNumber} onChange={(event) => setFightNumber(normalizeFightNumber(event.target.value))}>
            <option value="1">Fight 1</option>
            <option value="2">Fight 2</option>
          </select>
        </label>
        {fightCreationOrderIssue ? (
          <div className={styles.slotWarning}>
            <AlertTriangle size={16} aria-hidden />
            <span>{fightCreationOrderIssue} Der naechste Fight kann nicht sicher bestimmt werden.</span>
          </div>
        ) : manualSelectedSlotFights.length ? (
          <div className={styles.slotWarning}>
            <AlertTriangle size={16} aria-hidden />
            <span>
              Fight {fightNumber} fuer den {formatDate(date)} existiert bereits
              {manualSelectedSlotFights[0]?.opponentGuild ? ` (${manualSelectedSlotFights[0].opponentGuild})` : ""}.
              Speichern ersetzt diesen Fight nach Bestaetigung.
            </span>
          </div>
        ) : manualDefaultFightNumber ? (
          <div className={styles.slotHint}>Freier Slot: Fight {manualDefaultFightNumber}</div>
        ) : (
          <div className={styles.slotWarning}>
            <AlertTriangle size={16} aria-hidden />
            <span>Beide Fight-Slots an diesem Tag sind belegt. Waehle Fight 1 oder Fight 2 zum Ueberschreiben.</span>
          </div>
        )}
        <label className={styles.field}>
          <span>Gegner</span>
          <input
            type="text"
            value={opponentGuild}
            placeholder="Gegnergilde"
            onChange={(event) => setOpponentGuild(event.target.value)}
          />
        </label>
        <button type="button" className={styles.primaryAction} disabled={!canCreateFight} onClick={handleCreateFight}>
          <Plus size={16} aria-hidden />
          Anlegen
        </button>
      </div>
    </section>
  );
  const screenshotPanel = (
    <ScreenshotImportPanel
      session={importSession}
      rows={rowMembers}
      fights={fights}
      fightCreationOrderIssue={fightCreationOrderIssue}
      onSelectScreenshots={handleScreenshotsSelected}
      onRemoveScreenshot={handleRemoveScreenshot}
      onClearSession={handleClearImportSession}
      onScanScreenshot={handleScanScreenshot}
      onReviewChange={handleReviewChange}
      onMemberStateChange={handleReviewMemberStateChange}
      onAddUnknownName={handleAddUnknownName}
      onApplyReview={handleApplyImportReview}
      canApplyReview={canApplyImportReview}
      scanState={scanState}
    />
  );
  const tracklistPanel = tracker ? (
    <FightTable
      tracker={tracker}
      fights={sortedFights}
      rows={rowMembers}
      isCompactLayout={isCompactLayout}
      readonlyStatsByMemberId={readonlyStatsByMemberId}
      statusDrafts={participationStatusDrafts}
      hasStatusDrafts={hasParticipationStatusDrafts}
      isApplyingStatusDrafts={isApplyingParticipationDrafts}
      onStatusDraftChange={handleParticipationStatusDraftChange}
      onApplyStatusDrafts={applyParticipationStatusDrafts}
    />
  ) : null;
  const desktopToolPanels: Array<{
    id: MobileFunctionPanelId;
    title: string;
    subtitle?: string;
    description: string;
    icon: React.ReactNode;
    content: React.ReactNode;
  }> = [
    {
      id: "fight",
      title: "Neuer Angriff",
      subtitle: tracker?.name ?? "Fight Tracker",
      description: "Fight manuell erfassen",
      icon: <Swords size={22} aria-hidden />,
      content: fightCreatePanel,
    },
    {
      id: "screenshots",
      title: "Screenshots scannen",
      subtitle: tracker?.name ?? "Fight Tracker",
      description: "Kampf per Screenshot erfassen",
      icon: <FileImage size={22} aria-hidden />,
      content: screenshotPanel,
    },
    {
      id: "member",
      title: "Member hinzufuegen",
      subtitle: tracker?.name ?? "Fight Tracker",
      description: "Spieler manuell zur Trackliste hinzufuegen",
      icon: <UserPlus size={22} aria-hidden />,
      content: memberPanel,
    },
    {
      id: "memberList",
      title: "Liste bearbeiten",
      subtitle: tracker?.name ?? "Fight Tracker",
      description: "Tracker-Mitglieder aktivieren oder deaktivieren",
      icon: <Pencil size={22} aria-hidden />,
      content: memberStatusPanel,
    },
    ...(hasGuildScanLink
      ? [
          {
            id: "sync" as const,
            title: "Scan & Synchronisation",
            subtitle: tracker?.name ?? "Fight Tracker",
            description: "Mitglieder mit Guild-Scan abgleichen",
            icon: <UserPlus size={22} aria-hidden />,
            content: syncPanel,
          },
        ]
      : []),
  ];
  const mobilePanels: Array<{
    id: MobileFunctionPanelId;
    title: string;
    subtitle?: string;
    description: string;
    icon: React.ReactNode;
    content: React.ReactNode;
  }> = [
    {
      id: "tracklist",
      title: "Participation",
      description: "Teilnahmen, Fehlzeiten & Quoten",
      icon: <ListChecks size={22} aria-hidden />,
      content: tracklistPanel,
    },
    ...desktopToolPanels.map((panel) => ({
      ...panel,
      content: panel.id === "sync" ? mobileSyncPanel : panel.content,
    })),
  ];
  const activePanelConfig = (isCompactLayout ? mobilePanels : desktopToolPanels).find((panel) => panel.id === activeMobilePanel) ?? null;
  const closeActiveFunctionPanel = () => {
    if (activeMobilePanel === "tracklist" && hasParticipationStatusDrafts) {
      const shouldDiscard = typeof window === "undefined" || window.confirm("Ungespeicherte Änderungen verwerfen?");
      if (!shouldDiscard) return;
      setParticipationStatusDrafts({});
    }
    setActiveMobilePanel(null);
  };

  if (overviewLoading && !trackerSummaries.length && !tracker && !trackerDetailLoading) {
    return (
      <ContentShell centerFramed={false}>
        <div className={styles.page}>
          <DataHubLoadingState
            variant="page"
            title="Fight Tracker wird geladen"
            message="Lokale Fight-Tracker-Übersicht wird gelesen."
          />
        </div>
      </ContentShell>
    );
  }

  return (
    <ContentShell centerFramed={false}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerLeading}>
            <div>
              <p className={styles.kicker}>Guild Hub</p>
              <h1 className={styles.title}>Fight Tracking</h1>
            </div>
            <GuildContextBar />
            {tracker ? (
              <button type="button" className={styles.selectionBackButton} onClick={backToSelection}>
                <ArrowLeft size={16} aria-hidden />
                Zur Gildenauswahl
              </button>
            ) : null}
          </div>
        </header>

        {storeError ? <section className={styles.emptyState}>{storeError}</section> : null}

        {trackerDetailLoading ? (
          <DataHubLoadingState
            title="Tracker wird geladen"
            message="Lokale Fight-Tracker-Details werden gelesen."
          />
        ) : !tracker ? (
          <TrackerSelectionPanel
            summaries={trackerSummaries}
            activeGuild={activeGuild}
            activeGuildTrackerId={activeGuildTrackerId}
            scanSourceOptions={scanSourceOptions}
            scanSourceLoading={guildSourcesLoading}
            scanSourceError={guildSourcesError}
            selectedScanGuildId={selectedScanGuildId}
            onSelectedScanGuildIdChange={setSelectedScanGuildId}
            isAddPanelOpen={isAddPanelOpen}
            onToggleAddPanel={() => setIsAddPanelOpen((prev) => !prev)}
            setupGuildName={setupGuildName}
            onSetupGuildNameChange={setSetupGuildName}
            setupGuildServer={setupGuildServer}
            onSetupGuildServerChange={setSetupGuildServer}
            managerState={managerState}
            onOpenTracker={openTracker}
            onStartManagement={startTrackerManagement}
            onCloseManagement={() => setManagerState(null)}
            onManagerRenameValueChange={(value) =>
              setManagerState((prev) => (prev ? { ...prev, renameValue: value } : prev))
            }
            onSaveRename={saveTrackerRename}
            onConfirmDelete={confirmTrackerDelete}
            onCreateFromSelectedScan={createSelectedScanTracker}
            onCreateManualTracker={createManualTracker}
          />
        ) : (
          <>
            <section className={styles.infoStrip}>
              <InfoPill label="Tracker-Gilde" value={tracker.name} hint={tracker.server ?? "eigene Tracker-Daten"} />
              <InfoPill label="Members" value={String(trackerMembers.length)} hint={`${activeRoster.length} aktiv`} />
              <InfoPill label="Fights" value={String(fights.length)} hint="IndexedDB gespeichert" />
              <InfoPill label="Missed" value={String(totalMissed)} hint="manuell/OCR markiert" />
            </section>

	            {isCompactLayout ? (
	              <>
	                <section className={styles.mobileFunctionGrid} aria-label="Fight-Tracker-Funktionen">
	                  {mobilePanels.map((panel) => (
	                    <FunctionTile
                        key={panel.id}
                        title={panel.title}
                        description={panel.description}
                        icon={panel.icon}
                        onOpen={() => openFunctionPanel(panel.id)}
                      />
	                  ))}
	                </section>

                {activePanelConfig ? (
                  <FunctionOverlay title={activePanelConfig.title} onClose={closeActiveFunctionPanel}>
                    {activePanelConfig.content}
                  </FunctionOverlay>
                ) : null}
              </>
	            ) : (
	              <>
	                <section className={styles.toolGrid} aria-label="Fight-Tracker-Werkzeuge">
	                  {desktopToolPanels.map((panel) => (
	                    <FunctionTile
                        key={panel.id}
                        title={panel.title}
                        description={panel.description}
                        icon={panel.icon}
                        onOpen={() => openFunctionPanel(panel.id)}
                      />
	                  ))}
	                </section>

                {activePanelConfig ? (
                  <FunctionOverlay
                  title={activePanelConfig.title}
                  subtitle={activePanelConfig.subtitle}
                  onClose={closeActiveFunctionPanel}
                >
                    {activePanelConfig.content}
                  </FunctionOverlay>
                ) : null}

                {tracklistPanel}
              </>
            )}
          </>
        )}
      </div>
    </ContentShell>
  );
}

function InfoPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={styles.infoPill}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function TrackerSelectionPanel({
  summaries,
  activeGuild,
  activeGuildTrackerId,
  scanSourceOptions,
  scanSourceLoading,
  scanSourceError,
  selectedScanGuildId,
  onSelectedScanGuildIdChange,
  isAddPanelOpen,
  onToggleAddPanel,
  setupGuildName,
  onSetupGuildNameChange,
  setupGuildServer,
  onSetupGuildServerChange,
  managerState,
  onOpenTracker,
  onStartManagement,
  onCloseManagement,
  onManagerRenameValueChange,
  onSaveRename,
  onConfirmDelete,
  onCreateFromSelectedScan,
  onCreateManualTracker,
}: {
  summaries: FightTrackerSummary[];
  activeGuild: GuildHubSelectedGuild | null;
  activeGuildTrackerId: string | null;
  scanSourceOptions: TrackerGuildSource[];
  scanSourceLoading: boolean;
  scanSourceError: string | null;
  selectedScanGuildId: string;
  onSelectedScanGuildIdChange: (value: string) => void;
  isAddPanelOpen: boolean;
  onToggleAddPanel: () => void;
  setupGuildName: string;
  onSetupGuildNameChange: (value: string) => void;
  setupGuildServer: string;
  onSetupGuildServerChange: (value: string) => void;
  managerState: TrackerManagerState | null;
  onOpenTracker: (trackerId: string) => void;
  onStartManagement: (summary: FightTrackerSummary, mode: TrackerManagerState["mode"]) => void;
  onCloseManagement: () => void;
  onManagerRenameValueChange: (value: string) => void;
  onSaveRename: () => void;
  onConfirmDelete: () => void;
  onCreateFromSelectedScan: () => void;
  onCreateManualTracker: () => void;
}) {
  const selectedScanValue = selectedScanGuildId || scanSourceOptions[0]?.id || "";

  return (
    <section className={styles.setupGrid}>
      <div className={styles.selectionIntro}>
        <div>
          <h2>Fight-Tracker-Gilden</h2>
          <p>
            {activeGuild
              ? `${activeGuild.name} ist aktuell im Guild Hub aktiv.`
              : "Keine Guild-Hub-Gilde aktiv ausgewaehlt."}
          </p>
        </div>
        {activeGuild && activeGuildTrackerId ? (
          <span className={styles.activeGuildBadge}>Aktiver Guild-Hub-Tracker markiert</span>
        ) : null}
      </div>

      <div className={styles.trackerGrid}>
        {summaries.map((summary) => {
          const isActiveGuildTracker = summary.tracker.id === activeGuildTrackerId;
          const isManaged = managerState?.trackerId === summary.tracker.id && managerState.mode !== "closed";
          return (
            <article
              key={summary.tracker.id}
              className={`${styles.trackerCard} ${isActiveGuildTracker ? styles.trackerCardActive : ""}`}
            >
              <button type="button" className={styles.trackerCardMain} onClick={() => onOpenTracker(summary.tracker.id)}>
                <span className={styles.trackerCardKicker}>
                  {summary.tracker.source === "guild_scan" ? "Guild-Hub-Scan" : "Manuell"}
                </span>
                <span className={styles.trackerCardTitleRow}>
                  <strong>{summary.tracker.name}</strong>
                  {summary.tracker.importedAt ? <span className={styles.importedTrackerBadge}>Importiert</span> : null}
                </span>
                <small>{summary.tracker.server || "ohne Server"}</small>
                <span className={styles.trackerCardStats}>
                  {summary.memberCount} Member · {summary.fightCount} Fights · {summary.missedCount} Missed
                </span>
              </button>
              <div className={styles.trackerCardActions}>
                <button
                  type="button"
                  className={styles.iconOnlyButton}
                  aria-label={`${summary.tracker.name} verwalten`}
                  title="Verwalten"
                  onClick={() => onStartManagement(summary, isManaged ? "closed" : "rename")}
                >
                  <MoreVertical size={17} aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.iconOnlyButton}
                  aria-label={`${summary.tracker.name} umbenennen`}
                  title="Umbenennen"
                  onClick={() => onStartManagement(summary, "rename")}
                >
                  <Pencil size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${styles.iconOnlyButton} ${styles.dangerIconButton}`}
                  aria-label={`${summary.tracker.name} loeschen`}
                  title="Loeschen"
                  onClick={() => onStartManagement(summary, "delete")}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
              {isManaged && managerState.mode === "rename" ? (
                <div className={styles.managerPanel}>
                  <label className={styles.field}>
                    <span>Tracker-Name</span>
                    <input value={managerState.renameValue} onChange={(event) => onManagerRenameValueChange(event.target.value)} />
                  </label>
                  <div className={styles.managerActions}>
                    <button type="button" className={styles.primaryAction} onClick={onSaveRename}>
                      <Check size={16} aria-hidden />
                      Speichern
                    </button>
                    <button type="button" className={styles.secondaryAction} onClick={onCloseManagement}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : null}
              {isManaged && managerState.mode === "delete" ? (
                <div className={styles.managerPanel}>
                  <div className={styles.deleteNotice}>
                    <AlertTriangle size={16} aria-hidden />
                    <span>Loescht nur diesen Fight Tracker samt Membern, Fights und Tracker-State. Guild-Hub-Scans bleiben unveraendert.</span>
                  </div>
                  <div className={styles.managerActions}>
                    <button type="button" className={styles.dangerAction} onClick={onConfirmDelete}>
                      <Trash2 size={16} aria-hidden />
                      Tracker loeschen
                    </button>
                    <button type="button" className={styles.secondaryAction} onClick={onCloseManagement}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}

        <button type="button" className={styles.addTrackerCard} onClick={onToggleAddPanel}>
          <Plus size={22} aria-hidden />
          <strong>Gilde hinzufuegen</strong>
          <span>Scan-verknuepft oder manuell</span>
        </button>
      </div>

      {!summaries.length ? <section className={styles.emptyState}>Noch keine Fight-Tracker-Gilden vorhanden.</section> : null}

      {activeGuild && !activeGuildTrackerId ? (
        <div className={styles.syncPanel}>
          <div className={styles.createHeading}>
            <div className={styles.createIcon} aria-hidden>
              <Swords size={18} />
            </div>
            <div>
              <h2>{activeGuild.name}</h2>
              <p>Fuer die aktive Guild-Hub-Gilde existiert noch kein Fight Tracker.</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.primaryAction}
            onClick={() => {
              onSelectedScanGuildIdChange(activeGuild.id);
              if (!isAddPanelOpen) onToggleAddPanel();
            }}
          >
            <Plus size={16} aria-hidden />
            Aus Guild-Hub-Daten anlegen
          </button>
        </div>
      ) : null}

	      {isAddPanelOpen ? (
	        <div className={styles.setupPanel}>
        <div className={styles.createHeading}>
          <div className={styles.createIcon} aria-hidden>
            <Swords size={18} />
          </div>
          <div>
            <h2>Gilde hinzufuegen</h2>
            <p>Ein Tracker mit 0 Membern ist gueltig.</p>
          </div>
        </div>
	        <div className={styles.setupActions}>
	          <div className={styles.setupOption}>
	            <strong>Aus Guild-Hub-Daten</strong>
	            <span>
	              {scanSourceLoading
	                ? "Scan-Quellen werden geladen."
	                : scanSourceError ?? "Verknuepfung erstellen, Memberimport bleibt optional."}
	            </span>
            <label className={styles.field}>
              <span>Guild-Hub-Gilde</span>
              <select
                value={selectedScanValue}
                disabled={!scanSourceOptions.length}
                onChange={(event) => onSelectedScanGuildIdChange(event.target.value)}
              >
                {scanSourceOptions.length ? (
                  scanSourceOptions.map((guild) => (
                    <option key={guild.id} value={guild.id}>
                      {guild.name} · {guild.server}
                    </option>
                  ))
                ) : (
                  <option value="">Keine freien Guild-Hub-Gilden</option>
                )}
              </select>
            </label>
            <button type="button" className={styles.primaryAction} disabled={!scanSourceOptions.length} onClick={onCreateFromSelectedScan}>
              <Plus size={16} aria-hidden />
              Tracker erstellen
            </button>
          </div>
          <div className={styles.setupOption}>
            <strong>Ohne Scan</strong>
            <label className={styles.field}>
              <span>Gildenname</span>
              <input value={setupGuildName} placeholder="Gildenname" onChange={(event) => onSetupGuildNameChange(event.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Server optional</span>
              <input value={setupGuildServer} placeholder="z. B. S1" onChange={(event) => onSetupGuildServerChange(event.target.value)} />
            </label>
            <button type="button" className={styles.secondaryAction} disabled={!setupGuildName.trim()} onClick={onCreateManualTracker}>
              <Plus size={16} aria-hidden />
              Eigene Gilde erstellen
            </button>
          </div>
        </div>
      </div>
      ) : null}
    </section>
  );
}

function ScanMemberImportPanel({
  plan,
  snapshot,
  loading,
  status,
  trackerMemberCount,
  onImport,
  detailMode = "overlay",
}: {
  plan: FightTrackerSyncPlan | null;
  snapshot: FightTrackerScanSnapshot | null;
  loading: boolean;
  status: string | null;
  trackerMemberCount: number;
  onImport: () => void;
  detailMode?: "overlay" | "inline";
}) {
  const [openCategory, setOpenCategory] = React.useState<string | null>(null);
  const meta = snapshot
    ? [
        snapshot.guildName,
        snapshot.server,
        snapshot.scanAt ? `Scan ${formatDate(snapshot.scanAt.slice(0, 10))}` : "Scan ohne Snapshot-Datum",
        `${snapshot.members.length} Mitglieder`,
      ]
        .filter(Boolean)
        .join(" - ")
    : loading
      ? "Scan-Synchronisierung wird vorbereitet..."
      : "Kein passender lokaler Guild-Hub-Scan gefunden";
  const isInitialImport = trackerMemberCount === 0;
  const actionLabel = isInitialImport
    ? plan?.newMembers.length
      ? `${plan.newMembers.length} Mitglieder uebernehmen`
      : "Mitglieder aus letztem Scan uebernehmen"
    : "Mit Fight Tracker synchronisieren";
  const categories = React.useMemo(
    () =>
      plan
        ? [
            {
              id: "new",
              title: "Neue Spieler",
              hint: "neu im Scan",
              items: plan.newMembers.filter((member) => member.active !== false).map((member) => member.name),
            },
            {
              id: "confirmed",
              title: "Bereits im Tracker / im Scan gefunden",
              hint: "im Scan bestaetigt",
              items: plan.existingMembers.map((entry) => entry.member.name),
            },
            {
              id: "reactivated",
              title: "Reaktiviert",
              hint: "wieder im Scan gefunden",
              items: plan.reactivatedMembers.map((entry) => entry.member.name),
            },
            {
              id: "missing",
              title: "Nicht mehr im aktuellen Scan",
              hint: "wird inaktiv",
              items: plan.missingMembers.map((member) => member.name),
            },
            {
              id: "former",
              title: "Ehemalige Gildenmitglieder",
              hint: "nur in aelterem Scan gefunden",
              items: plan.newMembers.filter((member) => member.active === false).map((member) => member.name),
            },
          ]
        : [],
    [plan],
  );
  const selectedCategory = categories.find((category) => category.id === openCategory) ?? null;

  if (detailMode === "inline" && selectedCategory) {
    return <SyncInlineDetail category={selectedCategory} onBack={() => setOpenCategory(null)} />;
  }

  return (
    <section className={styles.syncPanel}>
      <div className={styles.createHeading}>
        <div className={styles.createIcon} aria-hidden>
          <UserPlus size={18} />
        </div>
        <div>
          <h2>Guild-Scan & Synchronisation</h2>
          <p>{meta}</p>
        </div>
      </div>
      {snapshot && plan && !plan.hasChanges && !status ? (
        <span className={styles.scanNotice}>Tracker-Mitglieder entsprechen diesem Scan.</span>
      ) : null}
      {loading ? (
        <span className={styles.scanNotice}>Passender Scan wird geladen und abgeglichen.</span>
      ) : !snapshot ? (
        <span className={styles.scanNotice}>Importiere im Guild Hub zuerst einen passenden lokalen Scan fuer diese Gilde.</span>
      ) : null}
      {plan ? (
        <div className={styles.syncLists}>
          {categories.map((category) => (
            <SyncSummaryTile
              key={category.id}
              title={category.title}
              count={category.items.length}
              hint={category.hint}
              onOpen={() => setOpenCategory(category.id)}
            />
          ))}
        </div>
      ) : null}
      <div className={styles.reviewActions}>
        {status ? <span className={styles.scanNotice}>{status}</span> : null}
        <button type="button" className={styles.primaryAction} disabled={loading || !plan?.hasChanges} onClick={onImport}>
          <Check size={16} aria-hidden />
          {actionLabel}
        </button>
      </div>
      {selectedCategory ? (
        <SyncDetailOverlay category={selectedCategory} onClose={() => setOpenCategory(null)} />
      ) : null}
    </section>
  );
}
function SyncInlineDetail({
  category,
  onBack,
}: {
  category: { title: string; items: string[] };
  onBack: () => void;
}) {
  return (
    <section className={styles.syncPanel}>
      <div className={styles.syncDialogHeader}>
        <div>
          <h2>{category.title}</h2>
          <p>{category.items.length} Eintraege</p>
        </div>
        <button type="button" className={styles.secondaryAction} onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
          Zurueck
        </button>
      </div>
      <div className={styles.syncDialogBody}>
        {category.items.length ? (
          <ul>
            {category.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <span>Keine Spieler in dieser Kategorie.</span>
        )}
      </div>
    </section>
  );
}

function FunctionTile({
  title,
  description,
  icon,
  onOpen,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={styles.functionTile} onClick={onOpen} aria-haspopup="dialog">
      <span className={styles.functionTileIcon}>{icon}</span>
      <span className={styles.functionTileTitle}>{title}</span>
      <span className={styles.functionTileDesc}>{description}</span>
    </button>
  );
}

function FunctionOverlay({
  title,
  subtitle = "Fight Tracker",
  children,
  dialogClassName = "",
  bodyClassName = "",
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  dialogClassName?: string;
  bodyClassName?: string;
  onClose: () => void;
}) {
  const titleId = React.useId();
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className={`${styles.syncOverlay} ${styles.functionOverlay}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`${styles.syncDialog} ${styles.functionDialog} ${dialogClassName}`}>
        <div className={styles.syncDialogHeader}>
          <div>
            <h2 id={titleId}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className={styles.iconOnlyButton} aria-label="Ansicht schliessen" onClick={onClose}>
            <X size={17} aria-hidden />
          </button>
        </div>
        <div className={`${styles.functionDialogBody} ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}

function SyncSummaryTile({
  title,
  count,
  hint,
  onOpen,
}: {
  title: string;
  count: number;
  hint: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={styles.syncList} onClick={onOpen} aria-haspopup="dialog">
      <h3>{title}</h3>
      <strong>{count}</strong>
      <span>{hint}</span>
      <small>Klicken fuer Details</small>
    </button>
  );
}

function SyncDetailOverlay({
  category,
  onClose,
}: {
  category: { title: string; items: string[] };
  onClose: () => void;
}) {
  return (
    <div className={styles.syncOverlay} role="presentation" onMouseDown={onClose}>
      <div
        className={styles.syncDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fight-sync-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.syncDialogHeader}>
          <div>
            <h2 id="fight-sync-detail-title">{category.title}</h2>
            <p>{category.items.length} Eintraege</p>
          </div>
          <button type="button" className={styles.iconOnlyButton} aria-label="Details schliessen" onClick={onClose}>
            <X size={17} aria-hidden />
          </button>
        </div>
        <div className={styles.syncDialogBody}>
          {category.items.length ? (
            <ul>
              {category.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <span>Keine Spieler in dieser Kategorie.</span>
          )}
        </div>
        <div className={styles.syncDialogActions}>
          <button type="button" className={styles.secondaryAction} onClick={onClose}>
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberAddPanel({
  value,
  onChange,
  onAdd,
  canAdd,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <section className={styles.createPanel}>
      <div className={styles.createHeading}>
        <div className={styles.createIcon} aria-hidden>
          <UserPlus size={18} />
        </div>
        <div>
          <h2>Member hinzufuegen</h2>
          <p>Nur in der Fight-Tracker-Liste gespeichert</p>
        </div>
      </div>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Name</span>
          <input value={value} placeholder="Membername" onChange={(event) => onChange(event.target.value)} />
        </label>
        <button type="button" className={styles.secondaryAction} disabled={!canAdd} onClick={onAdd}>
          <Plus size={16} aria-hidden />
          Hinzufuegen
        </button>
      </div>
    </section>
  );
}

function MemberStatusPanel({
  members,
  fights,
  onMemberActiveChange,
  onMemberDelete,
  onFightStatusChange,
  onFightDelete,
  onFightOpponentGuildChange,
}: {
  members: FightTrackerMember[];
  fights: GuildFight[];
  onMemberActiveChange: (memberId: string, active: boolean) => Promise<void>;
  onMemberDelete: (memberId: string) => Promise<void>;
  onFightStatusChange: (fightId: string, memberId: string, status: FightMemberStatus) => Promise<void>;
  onFightDelete: (fightId: string) => Promise<void>;
  onFightOpponentGuildChange: (fightId: string, opponentGuild: string) => Promise<void>;
}) {
  const [viewMode, setViewMode] = React.useState<"members" | "fights">("members");
  const [pendingMemberId, setPendingMemberId] = React.useState<string | null>(null);
  const [memberToDelete, setMemberToDelete] = React.useState<FightTrackerMember | null>(null);
  const [pendingDeleteMemberId, setPendingDeleteMemberId] = React.useState<string | null>(null);
  const [fightToDelete, setFightToDelete] = React.useState<GuildFight | null>(null);
  const [pendingDeleteFightId, setPendingDeleteFightId] = React.useState<string | null>(null);
  const [editingOpponentFightId, setEditingOpponentFightId] = React.useState<string | null>(null);
  const [editingOpponentGuild, setEditingOpponentGuild] = React.useState("");
  const [pendingOpponentFightId, setPendingOpponentFightId] = React.useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = React.useState<string | null>(null);
  const [selectedFightIds, setSelectedFightIds] = React.useState<Record<string, string>>({});
  const [pendingFightStatusKey, setPendingFightStatusKey] = React.useState<string | null>(null);
  const sortedFights = React.useMemo(
    () =>
      [...fights].sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.createdAt.localeCompare(a.createdAt) || b.fightNumber.localeCompare(a.fightNumber);
      }),
    [fights],
  );
  const statusOptions: Array<{ status: FightMemberStatus; label: string }> = [
    { status: "unknown", label: "?" },
    { status: "ok", label: "OK" },
    { status: "missed", label: "Fehlt" },
  ];

  React.useEffect(() => {
    const validFightIds = new Set(fights.map((fight) => fight.id));
    setSelectedFightIds((current) => {
      let changed = false;
      const next: Record<string, string> = {};
      Object.entries(current).forEach(([memberId, fightId]) => {
        if (validFightIds.has(fightId)) {
          next[memberId] = fightId;
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [fights]);

  React.useEffect(() => {
    if (editingOpponentFightId && !fights.some((fight) => fight.id === editingOpponentFightId)) {
      setEditingOpponentFightId(null);
      setEditingOpponentGuild("");
    }
  }, [editingOpponentFightId, fights]);

  const toggleMemberFightEditor = (memberId: string) => {
    setExpandedMemberId((current) => (current === memberId ? null : memberId));
    setSelectedFightIds((current) => {
      if (current[memberId] || !sortedFights[0]) return current;
      return { ...current, [memberId]: sortedFights[0].id };
    });
  };

  const handleChange = async (member: FightTrackerMember) => {
    setPendingMemberId(member.id);
    try {
      await onMemberActiveChange(member.id, !member.active);
    } finally {
      setPendingMemberId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!memberToDelete) return;
    setPendingDeleteMemberId(memberToDelete.id);
    try {
      await onMemberDelete(memberToDelete.id);
      setMemberToDelete(null);
    } finally {
      setPendingDeleteMemberId(null);
    }
  };

  const startFightOpponentEdit = (fight: GuildFight) => {
    setEditingOpponentFightId(fight.id);
    setEditingOpponentGuild(fight.opponentGuild);
  };

  const cancelFightOpponentEdit = () => {
    setEditingOpponentFightId(null);
    setEditingOpponentGuild("");
  };

  const handleSaveFightOpponent = async (fight: GuildFight) => {
    setPendingOpponentFightId(fight.id);
    try {
      await onFightOpponentGuildChange(fight.id, editingOpponentGuild);
      cancelFightOpponentEdit();
    } finally {
      setPendingOpponentFightId(null);
    }
  };

  const handleConfirmFightDelete = async () => {
    if (!fightToDelete) return;
    const deletedFightId = fightToDelete.id;
    const replacementFightId = sortedFights.find((fight) => fight.id !== deletedFightId)?.id ?? null;
    setPendingDeleteFightId(fightToDelete.id);
    try {
      await onFightDelete(deletedFightId);
      setSelectedFightIds((current) => {
        let changed = false;
        const next: Record<string, string> = {};
        Object.entries(current).forEach(([memberId, fightId]) => {
          if (fightId === deletedFightId) {
            changed = true;
            if (replacementFightId) next[memberId] = replacementFightId;
            return;
          }
          next[memberId] = fightId;
        });
        return changed ? next : current;
      });
      setFightToDelete(null);
    } finally {
      setPendingDeleteFightId(null);
    }
  };

  const handleFightStatusChange = async (fight: GuildFight, member: FightTrackerMember, status: FightMemberStatus) => {
    const key = `${fight.id}:${member.id}`;
    setPendingFightStatusKey(key);
    try {
      await onFightStatusChange(fight.id, member.id, status);
    } finally {
      setPendingFightStatusKey(null);
    }
  };

  return (
    <section className={styles.createPanel}>
      <div className={`${styles.createHeading} ${styles.createHeadingWithAction}`}>
        <div>
          {viewMode === "members" ? (
            <div className={styles.headingInline}>
              <div className={styles.createIcon} aria-hidden>
                <Pencil size={18} />
              </div>
              <div>
                <h2>Liste bearbeiten</h2>
                <p>Tracker-Mitglieder aktivieren oder deaktivieren</p>
              </div>
            </div>
          ) : (
            <div className={styles.headingInline}>
              <button type="button" className={styles.iconOnlyButton} aria-label="Zur Memberliste zurueck" onClick={() => setViewMode("members")}>
                <ArrowLeft size={16} aria-hidden />
              </button>
              <div>
                <h2>Fights verwalten</h2>
                <p>Komplette Fight-Eintraege dieses Trackers loeschen</p>
              </div>
            </div>
          )}
        </div>
        {viewMode === "members" ? (
          <button type="button" className={styles.secondaryAction} onClick={() => setViewMode("fights")}>
            <Swords size={16} aria-hidden />
            Fights
          </button>
        ) : null}
      </div>
      {viewMode === "fights" ? (
        sortedFights.length ? (
          <div className={styles.fightManageList}>
            {sortedFights.map((fight) => (
              <div key={fight.id} className={styles.fightManageRow}>
                <div className={styles.fightManageInfo}>
                  <strong>Fight {fight.fightNumber}</strong>
                  <span>{formatDate(fight.date)}</span>
                  {fight.opponentGuild ? <span>{fight.opponentGuild}</span> : null}
                </div>
                {editingOpponentFightId === fight.id ? (
                  <form
                    className={styles.fightInlineEditForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSaveFightOpponent(fight);
                    }}
                  >
                    <input
                      value={editingOpponentGuild}
                      placeholder="Gegner"
                      aria-label={`${formatFightLabel(fight)} Gegner`}
                      disabled={pendingOpponentFightId === fight.id}
                      onChange={(event) => setEditingOpponentGuild(event.target.value)}
                    />
                    <button type="submit" className={styles.iconOnlyButton} aria-label="Gegner speichern" disabled={pendingOpponentFightId === fight.id}>
                      <Check size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={styles.iconOnlyButton}
                      aria-label="Gegner-Bearbeitung abbrechen"
                      disabled={pendingOpponentFightId === fight.id}
                      onClick={cancelFightOpponentEdit}
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </form>
                ) : (
                  <div className={styles.fightManageActions}>
                    <button
                      type="button"
                      className={styles.iconOnlyButton}
                      aria-label={`${formatFightLabel(fight)} Gegner bearbeiten`}
                      title="Gegner bearbeiten"
                      disabled={pendingDeleteFightId === fight.id}
                      onClick={() => startFightOpponentEdit(fight)}
                    >
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconOnlyButton} ${styles.dangerIconButton}`}
                      aria-label={`${formatFightLabel(fight)} endgueltig aus dem Fight Tracker loeschen`}
                      title="Fight endgueltig loeschen"
                      disabled={pendingDeleteFightId === fight.id}
                      onClick={() => setFightToDelete(fight)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.reviewEmpty}>Noch keine Fights angelegt.</div>
        )
      ) : members.length ? (
        <div className={styles.memberManageList}>
          {members.map((member) => {
            const pending = pendingMemberId === member.id;
            const expanded = expandedMemberId === member.id;
            const selectedFight =
              sortedFights.find((fight) => fight.id === selectedFightIds[member.id]) ?? sortedFights[0] ?? null;
            const selectedStatus = selectedFight ? getFightMemberStatus(selectedFight, member.id) : null;
            const pendingFight = selectedFight ? pendingFightStatusKey === `${selectedFight.id}:${member.id}` : false;
            return (
              <React.Fragment key={member.id}>
                <div className={styles.memberManageRow}>
                  <div className={styles.memberManageInfo}>
                    <strong>{member.name}</strong>
                    <span>{formatMemberClassName(member.className)}</span>
                  </div>
                  <span className={`${styles.memberStatusBadge} ${member.active ? styles.memberStatusActive : styles.memberStatusInactive}`}>
                    {member.active ? "Aktiv" : "Inaktiv"}
                  </span>
                  <div className={styles.memberManageActions}>
                    <button
                      type="button"
                      className={styles.iconOnlyButton}
                      aria-label={`${member.name} Fight-Zuordnungen bearbeiten`}
                      title="Fight-Zuordnungen bearbeiten"
                      aria-expanded={expanded}
                      onClick={() => toggleMemberFightEditor(member.id)}
                    >
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={member.active ? styles.dangerAction : styles.secondaryAction}
                      disabled={pending || pendingDeleteMemberId === member.id}
                      onClick={() => handleChange(member)}
                    >
                      {member.active ? <XCircle size={16} aria-hidden /> : <Check size={16} aria-hidden />}
                      {member.active ? "Deaktivieren" : "Reaktivieren"}
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconOnlyButton} ${styles.dangerIconButton}`}
                      aria-label={`${member.name} endgueltig aus dem Fight Tracker loeschen`}
                      title="Endgueltig aus dem Fight Tracker loeschen"
                      disabled={pending || pendingDeleteMemberId === member.id}
                      onClick={() => setMemberToDelete(member)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
                {expanded ? (
                  <div className={styles.memberFightEditor}>
                    {selectedFight ? (
                      <div className={styles.memberFightRow}>
                        <label className={styles.memberFightSelect}>
                          <span>Fight auswaehlen</span>
                          <select
                            value={selectedFight.id}
                            onChange={(event) =>
                              setSelectedFightIds((current) => ({ ...current, [member.id]: event.target.value }))
                            }
                          >
                            {sortedFights.map((fight) => (
                              <option key={fight.id} value={fight.id}>
                                {formatFightLabel(fight)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div
                          className={styles.memberFightStatusButtons}
                          role="group"
                          aria-label={`${member.name} ${formatFightLabel(selectedFight)} Status`}
                        >
                          {statusOptions.map((option) => (
                            <button
                              key={option.status}
                              type="button"
                              className={`${styles.reviewStateButton} ${selectedStatus === option.status ? styles.reviewStateActive : ""}`}
                              disabled={pendingFight}
                              onClick={() => handleFightStatusChange(selectedFight, member, option.status)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.reviewEmpty}>Noch keine Fights angelegt.</div>
                    )}
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div className={styles.reviewEmpty}>Noch keine Fight-Tracker-Member vorhanden.</div>
      )}
      {memberToDelete ? (
        <div className={styles.memberDeleteConfirmOverlay} role="presentation">
          <div
            className={styles.memberDeleteConfirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="fight-member-delete-title"
          >
            <div>
              <h3 id="fight-member-delete-title">Spieler endgültig aus dem Fight Tracker löschen?</h3>
              <p>
                <strong>{memberToDelete.name}</strong> wird vollständig aus diesem Fight Tracker entfernt.
              </p>
              <p>Dabei werden auch alle im Fight Tracker gespeicherten Fight-/Participation-Daten dieses Spielers gelöscht.</p>
              <p>Der Guild Hub und alle Scan-Daten bleiben unverändert.</p>
              <p>Diese Aktion kann nicht rückgängig gemacht werden.</p>
            </div>
            <div className={styles.memberDeleteConfirmActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={pendingDeleteMemberId === memberToDelete.id}
                onClick={() => setMemberToDelete(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className={styles.dangerAction}
                disabled={pendingDeleteMemberId === memberToDelete.id}
                onClick={handleConfirmDelete}
              >
                <Trash2 size={16} aria-hidden />
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {fightToDelete ? (
        <div className={styles.memberDeleteConfirmOverlay} role="presentation">
          <div
            className={styles.memberDeleteConfirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="fight-delete-title"
          >
            <div>
              <h3 id="fight-delete-title">Fight endgültig löschen?</h3>
              <p>
                <strong>{formatFightLabel(fightToDelete)}</strong> wird vollständig aus diesem Fight Tracker entfernt.
              </p>
              <p>Dabei werden auch alle Participation-Daten dieses Fights für alle Spieler gelöscht.</p>
              <p>Diese Aktion kann nicht rückgängig gemacht werden.</p>
            </div>
            <div className={styles.memberDeleteConfirmActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={pendingDeleteFightId === fightToDelete.id}
                onClick={() => setFightToDelete(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className={styles.dangerAction}
                disabled={pendingDeleteFightId === fightToDelete.id}
                onClick={handleConfirmFightDelete}
              >
                <Trash2 size={16} aria-hidden />
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ScreenshotImportPanel({
  session,
  rows,
  fights,
  fightCreationOrderIssue,
  onSelectScreenshots,
  onRemoveScreenshot,
  onClearSession,
  onScanScreenshot,
  onReviewChange,
  onMemberStateChange,
  onAddUnknownName,
  onApplyReview,
  canApplyReview,
  scanState,
}: {
  session: LocalScreenshotImportSession | null;
  rows: TrackerRow[];
  fights: GuildFight[];
  fightCreationOrderIssue: string | null;
  onSelectScreenshots: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveScreenshot: (screenshotId: string) => void;
  onClearSession: () => void;
  onScanScreenshot: () => void;
  onReviewChange: (partial: Partial<ImportReviewState>) => void;
  onMemberStateChange: (memberId: string, state: ReviewRecognitionState) => void;
  onAddUnknownName: (name: string) => void;
  onApplyReview: () => void;
  canApplyReview: boolean;
  scanState: ScanState;
}) {
  const confirmedCount = session
    ? Object.values(session.review.memberStates).filter((state) => state === "confirmed").length
    : 0;
  const uncertainCount = session
    ? Object.values(session.review.memberStates).filter((state) => state === "uncertain").length
    : 0;
  const hasScanResult = Boolean(session?.review.source === "ocr");
  const highlightedRows = session
    ? rows.filter((member) => {
        const state = session.review.memberStates[member.id] ?? "not_detected";
        return state === "confirmed" || state === "uncertain";
      })
    : [];
  const canScan = Boolean(session?.screenshots.length && scanState.status !== "scanning");
  const reviewSlotFights = session ? getFightsForSlot(fights, session.review.date, session.review.fightNumber) : [];
  const reviewDefaultFightNumber = session ? getNextAvailableFightNumber(fights, session.review.date) : null;
  const reportTypeLabel =
    session?.review.reportType === "unsupported_defense"
      ? "Defense nicht unterstuetzt"
      : session?.review.reportType === "uncertain"
        ? "Unklar"
        : "Angriff";

  const renderMemberReviewRows = (members: TrackerRow[]) =>
    members.map((member) => {
      const state = session?.review.memberStates[member.id] ?? "not_detected";
      return (
        <div key={member.id} className={styles.memberReviewRow}>
          <div className={styles.memberReviewName}>
            <strong>{member.name}</strong>
            <span>{member.className || "Unknown"}{member.active ? "" : " - inaktiv"}</span>
          </div>
          <div className={styles.reviewStateButtons} role="group" aria-label={`${member.name} Review-Status`}>
            <button
              type="button"
              className={`${styles.reviewStateButton} ${state === "confirmed" ? styles.reviewStateActive : ""}`}
              onClick={() => onMemberStateChange(member.id, "confirmed")}
            >
              Sicher
            </button>
            <button
              type="button"
              className={`${styles.reviewStateButton} ${state === "uncertain" ? styles.reviewStateActive : ""}`}
              onClick={() => onMemberStateChange(member.id, "uncertain")}
            >
              Unsicher
            </button>
            <button
              type="button"
              className={`${styles.reviewStateButton} ${state === "not_detected" ? styles.reviewStateActive : ""}`}
              onClick={() => onMemberStateChange(member.id, "not_detected")}
            >
              Nicht erkannt
            </button>
          </div>
        </div>
      );
    });

  return (
    <section className={styles.importPanel}>
      <div className={styles.importHeader}>
        <div className={styles.createHeading}>
          <div className={styles.createIcon} aria-hidden>
            <FileImage size={18} />
          </div>
          <div>
            <h2>Fight-Report Screenshots</h2>
            <p>Lokale Import-Session fuer denselben Fight-Report</p>
          </div>
        </div>
        {session ? (
          <button type="button" className={styles.secondaryAction} onClick={onClearSession}>
            <RotateCcw size={15} aria-hidden />
            Zuruecksetzen
          </button>
        ) : null}
      </div>

      <label className={styles.filePicker}>
        <FileImage size={18} aria-hidden />
        <span>Bilder auswaehlen</span>
        <input type="file" accept="image/*" multiple onChange={onSelectScreenshots} />
      </label>

      {session ? (
        <>
          <div className={styles.scanBar}>
            <button type="button" className={styles.secondaryAction} disabled={!canScan} onClick={onScanScreenshot}>
              <Search size={15} aria-hidden />
              Screenshot scannen
            </button>
            {session.screenshots.length > 1 ? (
              <span className={styles.scanNotice}>OCR V1 scannt nur das erste ausgewaehlte Bild.</span>
            ) : null}
            {scanState.message ? (
              <span className={`${styles.scanNotice} ${scanState.status === "error" ? styles.scanError : ""}`}>
                {scanState.message}
              </span>
            ) : null}
          </div>
          {scanState.status === "scanning" ? (
            <div className={styles.scanProgress} aria-label="OCR Fortschritt">
              <span style={{ width: `${Math.max(4, Math.min(100, Math.round(scanState.progress * 100)))}%` }} />
            </div>
          ) : null}

          <div className={styles.previewGrid}>
            {session.screenshots.map((screenshot) => (
              <figure key={screenshot.id} className={styles.previewCard}>
                <img src={screenshot.previewUrl} alt={screenshot.name} />
                <figcaption>
                  <span>{screenshot.name}</span>
                  <small>{formatFileSize(screenshot.size)}</small>
                </figcaption>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`${screenshot.name} entfernen`}
                  onClick={() => onRemoveScreenshot(screenshot.id)}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </figure>
            ))}
          </div>

          <div className={styles.reviewPanel}>
            <div className={styles.reviewHeader}>
              <div>
                <h2>Import Review</h2>
                <p>{confirmedCount} sicher fehlend, {uncertainCount} unsicher</p>
              </div>
            </div>

            {session.review.ocrNotice ? (
              <div className={session.review.reportType === "unsupported_defense" ? styles.warningBanner : styles.scanResultBanner}>
                {session.review.reportType === "unsupported_defense" ? <AlertTriangle size={16} aria-hidden /> : <Check size={16} aria-hidden />}
                <span>{session.review.ocrNotice}</span>
              </div>
            ) : null}

            <div className={styles.reviewGrid}>
              <label className={styles.field}>
                <span>Datum</span>
                <span className={styles.inputWrap}>
                  <CalendarDays size={16} aria-hidden />
                  <input
                    type="date"
                    value={session.review.date}
                    onChange={(event) => onReviewChange({ date: event.target.value })}
                  />
                </span>
              </label>
              <label className={styles.field}>
                <span>Fight</span>
                <select
                  value={session.review.fightNumber}
                  onChange={(event) => onReviewChange({ fightNumber: normalizeFightNumber(event.target.value) })}
                >
                  <option value="1">Fight 1</option>
                  <option value="2">Fight 2</option>
                </select>
              </label>
              {fightCreationOrderIssue ? (
                <div className={styles.slotWarning}>
                  <AlertTriangle size={16} aria-hidden />
                  <span>{fightCreationOrderIssue} Der naechste Fight kann nicht sicher bestimmt werden.</span>
                </div>
              ) : reviewSlotFights.length ? (
                <div className={styles.slotWarning}>
                  <AlertTriangle size={16} aria-hidden />
                  <span>
                    Fight {session.review.fightNumber} fuer den {formatDate(session.review.date)} existiert bereits
                    {reviewSlotFights[0]?.opponentGuild ? ` (${reviewSlotFights[0].opponentGuild})` : ""}. Speichern ersetzt diesen Fight
                    nach Bestaetigung.
                  </span>
                </div>
              ) : reviewDefaultFightNumber ? (
                <div className={styles.slotHint}>Freier Slot: Fight {reviewDefaultFightNumber}</div>
              ) : (
                <div className={styles.slotWarning}>
                  <AlertTriangle size={16} aria-hidden />
                  <span>Beide Fight-Slots an diesem Tag sind belegt. Waehle Fight 1 oder Fight 2 zum Ueberschreiben.</span>
                </div>
              )}
              <div className={styles.reviewReadOnly}>
                <span>Kampftyp</span>
                <strong>{reportTypeLabel}</strong>
              </div>
              <label className={styles.field}>
                <span>Gegnerische Gilde</span>
                <input
                  type="text"
                  value={session.review.opponentGuild}
                  placeholder="—"
                  onChange={(event) => onReviewChange({ opponentGuild: event.target.value })}
                />
              </label>
            </div>

            <div className={styles.reviewColumns}>
              <div className={styles.reviewSection}>
                <h3>Fehlende Mitglieder</h3>
                {rows.length ? (
                  <>
                    {hasScanResult ? (
                      highlightedRows.length ? (
                        <div className={styles.memberReviewList}>{renderMemberReviewRows(highlightedRows)}</div>
                      ) : (
                        <div className={styles.reviewEmpty}>Keine sicher fehlenden Mitglieder im Tracker-Roster erkannt.</div>
                      )
                    ) : null}
                    <details className={styles.manualReviewDetails} open={!hasScanResult}>
                      <summary>Manuelle Korrektur</summary>
                      <div className={styles.memberReviewList}>{renderMemberReviewRows(rows)}</div>
                    </details>
                  </>
                ) : (
                  <div className={styles.reviewEmpty}>Noch keine Fight-Tracker-Member vorhanden.</div>
                )}
              </div>

              <div className={styles.reviewSection}>
                <h3>OCR-Namen ohne sicheren Match</h3>
                {session.review.unknownNames.length || session.review.uncertainNames.length ? (
                  <ul className={styles.unknownList}>
                    {session.review.uncertainNames.map((name) => (
                      <li key={`uncertain-${name}`}>
                        <span>{name} (unsicher)</span>
                        <button type="button" className={styles.inlineButton} onClick={() => onAddUnknownName(name)}>
                          Hinzufuegen
                        </button>
                      </li>
                    ))}
                    {session.review.unknownNames.map((name) => (
                      <li key={name}>
                        <span>{name}</span>
                        <button type="button" className={styles.inlineButton} onClick={() => onAddUnknownName(name)}>
                          Hinzufuegen
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.reviewEmpty}>—</div>
                )}
              </div>
            </div>

            <div className={styles.reviewActions}>
              <button type="button" className={styles.primaryAction} disabled={!canApplyReview} onClick={onApplyReview}>
                <Plus size={16} aria-hidden />
                Review als Fight anlegen
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.importEmpty}>Keine lokale Screenshot-Session aktiv.</div>
      )}
    </section>
  );
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function FightTable({
  tracker,
  rows,
  fights,
  isCompactLayout,
  readonlyStatsByMemberId,
  statusDrafts,
  hasStatusDrafts,
  isApplyingStatusDrafts,
  onStatusDraftChange,
  onApplyStatusDrafts,
}: {
  tracker: FightTrackerGuild;
  rows: TrackerRow[];
  fights: GuildFight[];
  isCompactLayout: boolean;
  readonlyStatsByMemberId: Map<string, FightTrackerReadonlyStats>;
  statusDrafts: ParticipationStatusDrafts;
  hasStatusDrafts: boolean;
  isApplyingStatusDrafts: boolean;
  onStatusDraftChange: (fightId: string, memberId: string, status: FightMemberStatus) => void;
  onApplyStatusDrafts: () => void | Promise<void>;
}) {
  const [sortKey, setSortKey] = React.useState<ParticipationSortKey>("guildRole");
  const [sortDirection, setSortDirection] = React.useState<ParticipationSortDirection>("desc");
  const [showInactiveMembers, setShowInactiveMembers] = React.useState(true);
  const [swipeTogether, setSwipeTogether] = React.useState(false);
  const [sharedFightWindowOffset, setSharedFightWindowOffset] = React.useState(0);
  const [memberFightWindowOffsets, setMemberFightWindowOffsets] = React.useState<Record<string, number>>({});
  const [sharedFightWindowDirection, setSharedFightWindowDirection] = React.useState<MobileFightWindowDirection | null>(null);
  const [memberFightWindowDirections, setMemberFightWindowDirections] = React.useState<Record<string, MobileFightWindowDirection | null>>({});
  const [isExportOverlayOpen, setIsExportOverlayOpen] = React.useState(false);
  const [exportType, setExportType] = React.useState<ParticipationExportType>("simple");
  const [exportMonth, setExportMonth] = React.useState(getMonthInputValue);
  const [showFormerMembersInExport, setShowFormerMembersInExport] = React.useState(false);
  const [exportBusyAction, setExportBusyAction] = React.useState<ParticipationExportBusyAction | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [participationExportPreview, setParticipationExportPreview] = React.useState<ParticipationExportPreview | null>(null);
  const [isExportPreviewOpen, setIsExportPreviewOpen] = React.useState(false);
  const exportRef = React.useRef<HTMLDivElement | null>(null);
  const participationExportPreviewUrlRef = React.useRef<string | null>(null);
  const participationMouseDragStateRef = React.useRef<ParticipationMouseDragState | null>(null);
  const suppressNextParticipationClickRef = React.useRef(false);
  const suppressParticipationClickTimerRef = React.useRef<number | null>(null);
  const mobileSwipeStateRef = React.useRef<MobileFightSwipeState | null>(null);
  const suppressedMobileClickMembersRef = React.useRef<Set<string>>(new Set());
  const subtitle = fights.length ? `${fights.length} gespeicherte Fights` : "Noch keine Fights angelegt";
  const emptyMessage = fights.length
    ? `${fights.length} Fights gespeichert. Noch keine Member im Fight Tracker vorhanden.`
    : "Noch keine Member im Fight Tracker vorhanden.";
  const sortOptions: Array<{ key: ParticipationSortKey; label: string }> = [
    { key: "guildRole", label: "Gildenrang" },
    { key: "name", label: "Name" },
    { key: "baseStats", label: "Base Stats" },
    { key: "totalStats", label: "Total Stats" },
    { key: "level", label: "Level" },
    { key: "missed", label: "Missed Fights" },
  ];
  const fightParticipationLookup = React.useMemo(() => buildFightParticipationLookup(fights), [fights]);
  const getParticipationStatus = React.useCallback(
    (fight: GuildFight, memberId: string) =>
      statusDrafts[createParticipationDraftKey(fight.id, memberId)]?.status ??
      getFightMemberStatusFromLookup(fight, memberId, fightParticipationLookup),
    [fightParticipationLookup, statusDrafts],
  );
  const cycleParticipationStatus = (fight: GuildFight, memberId: string) => {
    const status = getParticipationStatus(fight, memberId);
    const nextStatus: FightMemberStatus = status === "unknown" ? "ok" : status === "ok" ? "missed" : "unknown";
    onStatusDraftChange(fight.id, memberId, nextStatus);
  };
  const maxFightWindowOffset = Math.max(0, fights.length - 7);
  const clampFightWindowOffset = React.useCallback(
    (offset: number) => Math.min(Math.max(0, offset), maxFightWindowOffset),
    [maxFightWindowOffset],
  );
  const getFightWindowOffset = React.useCallback(
    (memberId: string) => clampFightWindowOffset(swipeTogether ? sharedFightWindowOffset : memberFightWindowOffsets[memberId] ?? sharedFightWindowOffset),
    [clampFightWindowOffset, memberFightWindowOffsets, sharedFightWindowOffset, swipeTogether],
  );
  const getMobileFightWindow = React.useCallback(
    (memberId: string) => {
      const offset = getFightWindowOffset(memberId);
      const startIndex = Math.max(0, fights.length - 7 - offset);
      return fights.slice(startIndex, startIndex + 7);
    },
    [fights, getFightWindowOffset],
  );
  const updateFightWindowOffset = React.useCallback(
    (memberId: string, delta: number) => {
      if (!delta || maxFightWindowOffset <= 0) return;
      const direction: MobileFightWindowDirection = delta > 0 ? "older" : "newer";
      const currentOffset = getFightWindowOffset(memberId);
      const nextOffset = clampFightWindowOffset(currentOffset + delta);
      if (nextOffset === currentOffset) return;
      if (swipeTogether) {
        setSharedFightWindowDirection(direction);
        setSharedFightWindowOffset(nextOffset);
        return;
      }
      setMemberFightWindowDirections((current) => ({ ...current, [memberId]: direction }));
      setMemberFightWindowOffsets((current) => ({ ...current, [memberId]: nextOffset }));
    },
    [clampFightWindowOffset, getFightWindowOffset, maxFightWindowOffset, swipeTogether],
  );
  const handleSwipeTogetherChange = (checked: boolean) => {
    if (checked) {
      setSwipeTogether(true);
      setSharedFightWindowOffset(0);
      setSharedFightWindowDirection(null);
      return;
    }
    const nextOffset = clampFightWindowOffset(sharedFightWindowOffset);
    setSwipeTogether(false);
    setMemberFightWindowOffsets(Object.fromEntries(rows.map((member) => [member.id, nextOffset])));
    setMemberFightWindowDirections({});
  };
  const clearSuppressedParticipationClick = () => {
    suppressNextParticipationClickRef.current = false;
    if (suppressParticipationClickTimerRef.current != null) {
      window.clearTimeout(suppressParticipationClickTimerRef.current);
      suppressParticipationClickTimerRef.current = null;
    }
  };
  const suppressNextParticipationClick = () => {
    clearSuppressedParticipationClick();
    suppressNextParticipationClickRef.current = true;
    suppressParticipationClickTimerRef.current = window.setTimeout(clearSuppressedParticipationClick, 350);
  };
  const isParticipationInteractiveTarget = (target: Element) =>
    Boolean(target.closest("button, a, input, select, textarea, [role='button'], [contenteditable='true']"));
  const captureParticipationPointer = (wrapper: HTMLDivElement, state: ParticipationMouseDragState) => {
    if (state.hasPointerCapture) return;
    wrapper.setPointerCapture(state.pointerId);
    wrapper.classList.add(styles.tableWrapperDragging);
    state.hasPointerCapture = true;
  };
  const finishParticipationMouseDrag = (wrapper: HTMLDivElement, suppressClick: boolean) => {
    const state = participationMouseDragStateRef.current;
    if (!state) return;
    if (state.hasPointerCapture && wrapper.hasPointerCapture(state.pointerId)) {
      wrapper.releasePointerCapture(state.pointerId);
    }
    wrapper.classList.remove(styles.tableWrapperDragging);
    participationMouseDragStateRef.current = null;
    if (state.didDrag) {
      if (suppressClick) suppressNextParticipationClick();
    }
  };
  const handleParticipationPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType !== "mouse") return;
    if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const tableCell = target.closest("td, th");
    if (!tableCell || !event.currentTarget.contains(tableCell) || tableCell.classList.contains(styles.stickyColumn)) return;

    const wrapperRect = event.currentTarget.getBoundingClientRect();
    if (event.clientX - wrapperRect.left <= getParticipationStickyWidth(event.currentTarget)) return;

    clearSuppressedParticipationClick();
    const dragState: ParticipationMouseDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      startedOnInteractiveTarget: isParticipationInteractiveTarget(target),
      hasPointerCapture: false,
      didDrag: false,
    };
    participationMouseDragStateRef.current = dragState;
    if (!dragState.startedOnInteractiveTarget) {
      captureParticipationPointer(event.currentTarget, dragState);
    }
  };
  const handleParticipationPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = participationMouseDragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (Math.abs(deltaX) <= Math.abs(deltaY) || deltaX === 0) return;

    const didPassClickThreshold = Math.abs(deltaX) >= PARTICIPATION_MOUSE_DRAG_THRESHOLD_PX;
    if (didPassClickThreshold) state.didDrag = true;
    if (!state.startedOnInteractiveTarget || state.didDrag) {
      captureParticipationPointer(event.currentTarget, state);
      event.preventDefault();
    }
    event.currentTarget.scrollLeft = state.scrollLeft - deltaX;
  };
  const handleParticipationPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    finishParticipationMouseDrag(event.currentTarget, true);
  };
  const handleParticipationPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    finishParticipationMouseDrag(event.currentTarget, true);
  };
  const handleParticipationPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = participationMouseDragStateRef.current;
    if (state && event.currentTarget.hasPointerCapture(state.pointerId)) return;
    finishParticipationMouseDrag(event.currentTarget, true);
  };
  const handleParticipationClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressNextParticipationClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    clearSuppressedParticipationClick();
  };
  const handleMobileFightTouchStart = (event: React.TouchEvent, memberId: string) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    mobileSwipeStateRef.current = {
      memberId,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      swiped: false,
    };
  };
  const handleMobileFightTouchMove = (event: React.TouchEvent) => {
    const state = mobileSwipeStateRef.current;
    if (!state || event.touches.length !== 1) return;
    const touch = event.touches[0];
    state.currentX = touch.clientX;
    state.currentY = touch.clientY;
    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;
    if (Math.abs(deltaX) > 18 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) state.swiped = true;
  };
  const handleMobileFightTouchEnd = (event: React.TouchEvent) => {
    const state = mobileSwipeStateRef.current;
    if (!state) return;
    const touch = event.changedTouches[0];
    const endX = touch?.clientX ?? state.currentX;
    const endY = touch?.clientY ?? state.currentY;
    const deltaX = endX - state.startX;
    const deltaY = endY - state.startY;
    mobileSwipeStateRef.current = null;
    if (!state.swiped || Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;

    suppressedMobileClickMembersRef.current.add(state.memberId);
    window.setTimeout(() => suppressedMobileClickMembersRef.current.delete(state.memberId), 350);
    updateFightWindowOffset(state.memberId, deltaX < 0 ? 1 : -1);
  };
  const handleMobileFightTouchCancel = () => {
    mobileSwipeStateRef.current = null;
  };
  const handleMobileStatusClick = (event: React.MouseEvent, fight: GuildFight, memberId: string) => {
    if (suppressedMobileClickMembersRef.current.has(memberId)) {
      event.preventDefault();
      return;
    }
    cycleParticipationStatus(fight, memberId);
  };

  React.useEffect(
    () => () => {
      if (suppressParticipationClickTimerRef.current != null) {
        window.clearTimeout(suppressParticipationClickTimerRef.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    setSharedFightWindowOffset((current) => clampFightWindowOffset(current));
    setMemberFightWindowOffsets((current) => {
      let changed = false;
      const knownMemberIds = new Set(rows.map((member) => member.id));
      const next: Record<string, number> = {};
      Object.entries(current).forEach(([memberId, offset]) => {
        if (!knownMemberIds.has(memberId)) {
          changed = true;
          return;
        }
        const nextOffset = clampFightWindowOffset(offset);
        next[memberId] = nextOffset;
        if (nextOffset !== offset) changed = true;
      });
      return changed ? next : current;
    });
    setMemberFightWindowDirections((current) => {
      let changed = false;
      const knownMemberIds = new Set(rows.map((member) => member.id));
      const next: Record<string, MobileFightWindowDirection | null> = {};
      Object.entries(current).forEach(([memberId, direction]) => {
        if (!knownMemberIds.has(memberId)) {
          changed = true;
          return;
        }
        next[memberId] = direction;
      });
      return changed ? next : current;
    });
  }, [clampFightWindowOffset, rows]);

  const participationRows = React.useMemo(
    () => deriveParticipationRows(rows, fights, getParticipationStatus, readonlyStatsByMemberId),
    [fights, getParticipationStatus, readonlyStatsByMemberId, rows],
  );

  const visibleParticipationRows = React.useMemo(
    () => participationRows.filter((row) => showInactiveMembers || row.member.active !== false),
    [participationRows, showInactiveMembers],
  );
  const tableEmptyMessage =
    !showInactiveMembers && participationRows.length ? "Keine aktiven Member sichtbar." : emptyMessage;

  const sortedRows = React.useMemo(
    () => sortParticipationRows(visibleParticipationRows, sortKey, sortDirection),
    [sortDirection, sortKey, visibleParticipationRows],
  );
  const exportMonthFights = React.useMemo(
    () =>
      fights
        .filter((fight) => fight.date.startsWith(`${exportMonth}-`))
        .sort((a, b) => a.date.localeCompare(b.date) || a.fightNumber.localeCompare(b.fightNumber)),
    [exportMonth, fights],
  );
  const exportDuplicateSlots = React.useMemo(() => getDuplicateFightSlots(exportMonthFights), [exportMonthFights]);
  const exportMonthFightLookup = React.useMemo(() => buildFightParticipationLookup(exportMonthFights), [exportMonthFights]);
  const exportRows = React.useMemo(() => {
    const memberRows = rows.filter((member) => showFormerMembersInExport || member.active !== false);
    return sortParticipationRows(
      deriveParticipationRows(
        memberRows,
        exportMonthFights,
        (fight, memberId) => getFightMemberStatusFromLookup(fight, memberId, exportMonthFightLookup),
        readonlyStatsByMemberId,
      ),
      sortKey,
      sortDirection,
    );
  }, [exportMonthFightLookup, exportMonthFights, readonlyStatsByMemberId, rows, showFormerMembersInExport, sortDirection, sortKey]);
  const canExportParticipation = Boolean(exportMonth && exportRows.length && !exportDuplicateSlots.length);
  const isExportingParticipation = exportBusyAction !== null;
  const exportFileBaseName = React.useMemo(
    () => `${tracker.name}-${exportMonth}-fight-participation-${exportType}`,
    [exportMonth, exportType, tracker.name],
  );
  const exportCacheKey = React.useMemo(
    () =>
      JSON.stringify({
        exportMonth,
        exportType,
        fights: exportMonthFights.map((fight) => ({
          date: fight.date,
          fightNumber: fight.fightNumber,
          id: fight.id,
          missedMemberIds: [...fight.missedMemberIds].sort(),
          opponentGuild: fight.opponentGuild,
        })),
        rows: exportRows.map((row) => ({
          active: row.member.active,
          baseStatsSum: row.baseStatsSum,
          className: row.member.className,
          evaluated: row.evaluated,
          guildRole: row.member.guildRole,
          id: row.member.id,
          lastMissedFightId: row.lastMissedFight?.id ?? null,
          level: row.level,
          missed: row.missed,
          name: row.member.name,
          streakCount: row.streakCount,
          streakStatus: row.streakStatus,
          totalStats: row.totalStats,
        })),
        showFormerMembersInExport,
        sortDirection,
        sortKey,
        trackerId: tracker.id,
        trackerLogoIdentifier: getFightTrackerGuildLogoIdentifier(tracker),
        trackerName: tracker.name,
      }),
    [
      exportMonth,
      exportMonthFights,
      exportRows,
      exportType,
      showFormerMembersInExport,
      sortDirection,
      sortKey,
      tracker.id,
      tracker.linkedGuildHubLogoIdentifier,
      tracker.linkedGuildHubGuildId,
      tracker.server,
      tracker.name,
    ],
  );
  const discardParticipationExportPreview = React.useCallback(() => {
    if (participationExportPreviewUrlRef.current) {
      URL.revokeObjectURL(participationExportPreviewUrlRef.current);
      participationExportPreviewUrlRef.current = null;
    }
    setParticipationExportPreview(null);
  }, []);
  const storeParticipationExportPreview = React.useCallback((nextPreview: ParticipationExportPreview) => {
    setParticipationExportPreview((current) => {
      if (current && current.url !== nextPreview.url) URL.revokeObjectURL(current.url);
      participationExportPreviewUrlRef.current = nextPreview.url;
      return nextPreview;
    });
  }, []);
  const renderParticipationExportPreview = React.useCallback(async () => {
    if (!exportRef.current) throw new Error("Export-Vorschau konnte nicht vorbereitet werden.");
    const rendered = await renderExportNodeToPngBlob(exportRef.current, { preserveCssPixelSize: exportType === "simple" });
    return {
      ...rendered,
      cacheKey: exportCacheKey,
      fileBaseName: exportFileBaseName,
      url: URL.createObjectURL(rendered.blob),
    };
  }, [exportCacheKey, exportFileBaseName, exportType]);
  const getCurrentParticipationExportPreview = React.useCallback(async () => {
    if (participationExportPreview?.cacheKey === exportCacheKey) return participationExportPreview;
    const nextPreview = await renderParticipationExportPreview();
    storeParticipationExportPreview(nextPreview);
    return nextPreview;
  }, [exportCacheKey, participationExportPreview, renderParticipationExportPreview, storeParticipationExportPreview]);
  React.useEffect(() => {
    setExportError(null);
    setIsExportPreviewOpen(false);
    setParticipationExportPreview((current) => {
      if (!current || current.cacheKey === exportCacheKey) return current;
      URL.revokeObjectURL(current.url);
      if (participationExportPreviewUrlRef.current === current.url) participationExportPreviewUrlRef.current = null;
      return null;
    });
  }, [exportCacheKey]);
  React.useEffect(
    () => () => {
      if (participationExportPreviewUrlRef.current) {
        URL.revokeObjectURL(participationExportPreviewUrlRef.current);
        participationExportPreviewUrlRef.current = null;
      }
    },
    [],
  );
  const handlePreviewParticipationExport = async () => {
    if (isExportingParticipation || !canExportParticipation) return;
    setExportBusyAction("preview");
    setExportError(null);
    try {
      await getCurrentParticipationExportPreview();
      setIsExportPreviewOpen(true);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "PNG-Vorschau konnte nicht erzeugt werden.");
      setIsExportPreviewOpen(false);
    } finally {
      setExportBusyAction(null);
    }
  };
  const handleExportParticipation = async () => {
    if (isExportingParticipation || !canExportParticipation) return;
    setExportBusyAction("download");
    setExportError(null);
    try {
      const currentPreview = await getCurrentParticipationExportPreview();
      downloadPngUrl(currentPreview.url, currentPreview.fileBaseName);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "PNG konnte nicht erzeugt werden.");
    } finally {
      setExportBusyAction(null);
    }
  };
  const participationTableStyle = {
    "--participation-table-width": `${PARTICIPATION_STICKY_COLUMN_WIDTH_PX + fights.length * PARTICIPATION_FIGHT_COLUMN_WIDTH_PX}px`,
  } as React.CSSProperties;

  return (
    <section className={styles.tablePanel}>
      <div className={styles.tableHeader}>
        <div>
          <h2>Participation</h2>
          <p>{subtitle}</p>
        </div>
        <div className={styles.tableHeaderActions}>
          <div className={styles.tableSortControls}>
            <label className={styles.tableSortField}>
              <span>Sortieren</span>
              <select
                value={sortKey}
                onChange={(event) => {
                  const nextSortKey = event.target.value as ParticipationSortKey;
                  setSortKey(nextSortKey);
                  setSortDirection(nextSortKey === "name" ? "asc" : "desc");
                }}
              >
                {sortOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.sortDirectionButton}
              aria-label={sortDirection === "asc" ? "Aufsteigend sortieren" : "Absteigend sortieren"}
              title={sortDirection === "asc" ? "Aufsteigend" : "Absteigend"}
              onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
            >
              {sortDirection === "asc" ? "↑" : "↓"}
            </button>
            <label className={styles.tableToggleField}>
              <input
                type="checkbox"
                checked={showInactiveMembers}
                onChange={(event) => setShowInactiveMembers(event.target.checked)}
              />
              <span>Ehemalige Gildenmitglieder</span>
            </label>
            {isCompactLayout ? (
              <label className={styles.tableToggleField}>
                <input
                  type="checkbox"
                  checked={swipeTogether}
                  onChange={(event) => handleSwipeTogetherChange(event.target.checked)}
                />
                <span>Gemeinsam swipen</span>
              </label>
            ) : null}
          </div>
          <button type="button" className={styles.secondaryAction} onClick={() => setIsExportOverlayOpen(true)}>
            <Download size={16} aria-hidden />
            Exportieren
          </button>
          <button
            type="button"
            className={styles.applyDraftButton}
            disabled={!hasStatusDrafts || isApplyingStatusDrafts}
            onClick={() => void onApplyStatusDrafts()}
          >
            Änderung übernehmen
          </button>
        </div>
      </div>
      {sortedRows.length ? (
        <>
          <div
            className={`${styles.tableWrapper} ${styles.tableWrapperDesktopDrag}`}
            onPointerDown={handleParticipationPointerDown}
            onPointerMove={handleParticipationPointerMove}
            onPointerUp={handleParticipationPointerUp}
            onPointerCancel={handleParticipationPointerCancel}
            onPointerLeave={handleParticipationPointerLeave}
            onClickCapture={handleParticipationClickCapture}
          >
            <table className={styles.table} style={participationTableStyle}>
              <colgroup>
                <col className={styles.stickyMemberColumn} />
                <col className={styles.stickyMissedColumn} />
                <col className={styles.stickyQuoteColumn} />
                <col className={styles.stickyLastMissedColumn} />
                <col className={styles.stickyStreakColumn} />
                {fights.map((fight) => (
                  <col key={fight.id} className={styles.fightColumn} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className={`${styles.stickyColumn} ${styles.stickyMemberColumn}`}>Member</th>
                  <th className={`${styles.stickyColumn} ${styles.stickyMissedColumn}`}>Missed</th>
                  <th className={`${styles.stickyColumn} ${styles.stickyQuoteColumn}`}>Quote</th>
                  <th className={`${styles.stickyColumn} ${styles.stickyLastMissedColumn}`}>Letzter Fehlkampf</th>
                  <th className={`${styles.stickyColumn} ${styles.stickyStreakColumn}`}>Serie</th>
                  {fights.map((fight) => (
                    <th key={fight.id} className={styles.fightHead}>
                      <span>Fight {fight.fightNumber}</span>
                      <small>{formatDate(fight.date)}</small>
                      <small>{fight.opponentGuild || "—"}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(({ member, missed, evaluated, lastMissedFight, streakStatus, streakCount, level }) => {
                  const memberMetaParts = [
                    formatMemberClassName(member.className),
                    level != null ? `Level ${level.toLocaleString("de-DE")}` : null,
                    !member.active ? "nicht mehr in aktueller Gilde" : null,
                  ].filter((entry): entry is string => Boolean(entry));

                  return (
                    <tr key={member.id} className={member.active ? undefined : styles.inactiveRow}>
                      <td className={`${styles.stickyColumn} ${styles.stickyMemberColumn} ${styles.memberCell}`}>
                        <div className={styles.memberName}>{member.name}</div>
                        <div className={styles.memberMeta}>{memberMetaParts.join(" · ")}</div>
                      </td>
                      <td className={`${styles.stickyColumn} ${styles.stickyMissedColumn}`}>{missed}</td>
                      <td className={`${styles.stickyColumn} ${styles.stickyQuoteColumn}`}>{formatQuote(missed, evaluated)}</td>
                      <td className={`${styles.stickyColumn} ${styles.stickyLastMissedColumn}`}>
                        {lastMissedFight ? formatDate(lastMissedFight.date) : "—"}
                      </td>
                      <td className={`${styles.stickyColumn} ${styles.stickyStreakColumn}`}>
                        {streakStatus ? `${streakCount}× ${streakStatus === "ok" ? "dabei" : "fehlt"}` : "—"}
                      </td>
                      {fights.map((fight) => {
                        const status = getParticipationStatus(fight, member.id);
                        const hasDraft = Boolean(statusDrafts[createParticipationDraftKey(fight.id, member.id)]);
                        return (
                          <td key={`${member.id}-${fight.id}`}>
                            <button
                              type="button"
                              className={`${styles.statusButton} ${
                                status === "missed" ? styles.statusMissed : status === "ok" ? styles.statusOk : styles.statusUnknown
                              } ${hasDraft ? styles.statusDraft : ""}`}
                              disabled={isApplyingStatusDrafts}
                              onClick={() => cycleParticipationStatus(fight, member.id)}
                              aria-label={`${member.name} ${formatDate(fight.date)} Status ${status}`}
                            >
                              {status === "unknown" ? (
                                "?"
                              ) : (
                                <>
                                  {status === "missed" ? <XCircle size={15} aria-hidden /> : <Check size={15} aria-hidden />}
                                  {status === "missed" ? "Fehlt" : "OK"}
                                </>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.mobileParticipationList}>
            {sortedRows.map(({ member, missed, evaluated, lastMissedFight, streakStatus, streakCount, level }) => {
              const visibleMemberFights = getMobileFightWindow(member.id);
              const fightWindowOffset = getFightWindowOffset(member.id);
              const canShowOlderFights = fightWindowOffset < maxFightWindowOffset;
              const canShowNewerFights = fightWindowOffset > 0;
              const fightWindowDirection = swipeTogether ? sharedFightWindowDirection : memberFightWindowDirections[member.id] ?? null;
              const streakLabel = streakStatus ? `${streakCount}× ${streakStatus === "ok" ? "dabei" : "fehlt"}` : null;
              const memberMetaParts = [
                formatMemberClassName(member.className),
                level != null ? `Level ${level.toLocaleString("de-DE")}` : null,
                streakLabel,
                !member.active ? "nicht mehr in aktueller Gilde" : null,
              ].filter((entry): entry is string => Boolean(entry));

              return (
                <article key={member.id} className={`${styles.mobileParticipationMember} ${member.active ? "" : styles.mobileParticipationInactive}`}>
                  <div className={styles.mobileParticipationSummary}>
                    <div className={styles.mobileParticipationName}>
                      <strong>{member.name}</strong>
                      <span>{memberMetaParts.join(" · ")}</span>
                    </div>
                    <div className={styles.mobileParticipationMetric}>
                      <span>Missed</span>
                      <strong>{missed}</strong>
                    </div>
                    <div className={styles.mobileParticipationMetric}>
                      <span>Quote</span>
                      <strong>{formatQuote(missed, evaluated)}</strong>
                    </div>
                    <div className={styles.mobileParticipationMetric}>
                      <span>Fehlkampf</span>
                      <strong>{lastMissedFight ? formatDate(lastMissedFight.date) : "—"}</strong>
                    </div>
                  </div>
                  {visibleMemberFights.length ? (
                    <div className={styles.mobileFightNavigator}>
                      <button
                        type="button"
                        className={styles.mobileFightNavButton}
                        disabled={!canShowOlderFights}
                        onClick={() => updateFightWindowOffset(member.id, 1)}
                        aria-label={`${member.name} ältere Fights anzeigen`}
                        title="Ältere Fights"
                      >
                        <ChevronLeft size={14} aria-hidden />
                      </button>
                      <div
                        key={`${member.id}-${fightWindowOffset}-${fightWindowDirection ?? "still"}`}
                        className={`${styles.mobileFightBar} ${
                          fightWindowDirection === "older"
                            ? styles.mobileFightBarSlideOlder
                            : fightWindowDirection === "newer"
                              ? styles.mobileFightBarSlideNewer
                              : ""
                        }`}
                        style={{ gridTemplateColumns: `repeat(${visibleMemberFights.length}, minmax(0, 1fr))` }}
                        onTouchStart={(event) => handleMobileFightTouchStart(event, member.id)}
                        onTouchMove={handleMobileFightTouchMove}
                        onTouchEnd={handleMobileFightTouchEnd}
                        onTouchCancel={handleMobileFightTouchCancel}
                      >
                        {visibleMemberFights.map((fight) => {
                          const status = getParticipationStatus(fight, member.id);
                          const hasDraft = Boolean(statusDrafts[createParticipationDraftKey(fight.id, member.id)]);
                          return (
                            <div key={`${member.id}-${fight.id}`} className={styles.mobileFightSlot}>
                              <small title={fight.opponentGuild || undefined}>{fight.opponentGuild || ""}</small>
                              <button
                                type="button"
                                className={`${styles.statusButton} ${styles.mobileStatusButton} ${
                                  status === "missed" ? styles.statusMissed : status === "ok" ? styles.statusOk : styles.statusUnknown
                                } ${hasDraft ? styles.statusDraft : ""}`}
                                disabled={isApplyingStatusDrafts}
                                title={formatFightLabel(fight)}
                                onClick={(event) => handleMobileStatusClick(event, fight, member.id)}
                                aria-label={`${member.name} ${formatDate(fight.date)} Status ${status}`}
                              >
                                {status === "unknown" ? "?" : status === "missed" ? "Fehlt" : "OK"}
                              </button>
                              <span>{formatDate(fight.date)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className={styles.mobileFightNavButton}
                        disabled={!canShowNewerFights}
                        onClick={() => updateFightWindowOffset(member.id, -1)}
                        aria-label={`${member.name} neuere Fights anzeigen`}
                        title="Neuere Fights"
                      >
                        <ChevronRight size={14} aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className={styles.tableEmpty}>{tableEmptyMessage}</div>
      )}
      {isExportOverlayOpen ? (
        <ParticipationExportOverlay
          exportType={exportType}
          exportMonth={exportMonth}
          showFormerMembers={showFormerMembersInExport}
          fightCount={exportMonthFights.length}
          memberCount={exportRows.length}
          duplicateSlotCount={exportDuplicateSlots.length}
          canExport={canExportParticipation}
          isExporting={isExportingParticipation}
          exportError={exportError}
          exportBusyAction={exportBusyAction}
          onExportTypeChange={setExportType}
          onExportMonthChange={(value) => {
            setExportMonth(value);
            setExportError(null);
          }}
          onShowFormerMembersChange={setShowFormerMembersInExport}
          onPreview={() => void handlePreviewParticipationExport()}
          onExport={() => void handleExportParticipation()}
          onClose={() => {
            setIsExportOverlayOpen(false);
            setIsExportPreviewOpen(false);
            discardParticipationExportPreview();
          }}
        />
      ) : null}
      {isExportPreviewOpen && participationExportPreview?.cacheKey === exportCacheKey ? (
        <ParticipationExportPreviewOverlay
          preview={participationExportPreview}
          subtitle={`${formatMonthLabel(exportMonth)} · ${exportMonthFights.length} Fights`}
          onDownload={() => downloadPngUrl(participationExportPreview.url, participationExportPreview.fileBaseName)}
          onClose={() => {
            setIsExportPreviewOpen(false);
            discardParticipationExportPreview();
          }}
        />
      ) : null}
      <div className={styles.exportStage} aria-hidden>
        <ParticipationExportReport
          ref={exportRef}
          tracker={tracker}
          exportType={exportType}
          month={exportMonth}
          fights={exportMonthFights}
          rows={exportRows}
        />
      </div>
    </section>
  );
}

function ParticipationExportOverlay({
  exportType,
  exportMonth,
  showFormerMembers,
  fightCount,
  memberCount,
  duplicateSlotCount,
  canExport,
  isExporting,
  exportError,
  exportBusyAction,
  onExportTypeChange,
  onExportMonthChange,
  onShowFormerMembersChange,
  onPreview,
  onExport,
  onClose,
}: {
  exportType: ParticipationExportType;
  exportMonth: string;
  showFormerMembers: boolean;
  fightCount: number;
  memberCount: number;
  duplicateSlotCount: number;
  canExport: boolean;
  isExporting: boolean;
  exportError: string | null;
  exportBusyAction: ParticipationExportBusyAction | null;
  onExportTypeChange: (value: ParticipationExportType) => void;
  onExportMonthChange: (value: string) => void;
  onShowFormerMembersChange: (value: boolean) => void;
  onPreview: () => void;
  onExport: () => void;
  onClose: () => void;
}) {
  return (
    <FunctionOverlay title="Participation exportieren" subtitle={`${formatMonthLabel(exportMonth)} · ${fightCount} Fights`} onClose={onClose}>
      <section className={styles.exportPanel}>
        <div className={styles.exportModeControl} role="group" aria-label="Exporttyp">
          <button
            type="button"
            className={`${styles.exportModeButton} ${exportType === "simple" ? styles.exportModeButtonActive : ""}`}
            onClick={() => onExportTypeChange("simple")}
          >
            Einfach
          </button>
          <button
            type="button"
            className={`${styles.exportModeButton} ${exportType === "detailed" ? styles.exportModeButtonActive : ""}`}
            onClick={() => onExportTypeChange("detailed")}
          >
            Detailliert
          </button>
        </div>

        <div className={styles.exportOptionsGrid}>
          <label className={styles.field}>
            <span>Monat</span>
            <input type="month" value={exportMonth} onChange={(event) => onExportMonthChange(event.target.value)} />
          </label>
          <label className={styles.tableToggleField}>
            <input
              type="checkbox"
              checked={showFormerMembers}
              onChange={(event) => onShowFormerMembersChange(event.target.checked)}
            />
            <span>Ehemalige Gildenmitglieder anzeigen</span>
          </label>
        </div>

        <div className={styles.exportSummaryStrip}>
          <InfoPill label="Fights im Monat" value={String(fightCount)} />
          <InfoPill label="Mitglieder im Export" value={String(memberCount)} />
        </div>

        {duplicateSlotCount ? (
          <div className={styles.slotWarning}>
            <AlertTriangle size={16} aria-hidden />
            <span>
              Im gewaehlten Monat belegen mehrere gespeicherte Fights denselben Tages-Slot. Der Export wird blockiert, damit kein Fight
              still ausgeblendet wird.
            </span>
          </div>
        ) : null}
        {exportError ? <div className={styles.warningBanner}>{exportError}</div> : null}

        <div className={styles.exportActions}>
          <button type="button" className={styles.secondaryAction} onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className={styles.secondaryAction} disabled={!canExport || isExporting} onClick={onPreview}>
            <FileImage size={16} aria-hidden />
            {exportBusyAction === "preview" ? "Vorschau wird erstellt..." : "Vorschau"}
          </button>
          <button type="button" className={styles.primaryAction} disabled={!canExport || isExporting} onClick={onExport}>
            <Download size={16} aria-hidden />
            {exportBusyAction === "download" ? "Export wird erzeugt..." : "Export erzeugen"}
          </button>
        </div>
      </section>
    </FunctionOverlay>
  );
}

function ParticipationExportPreviewOverlay({
  preview,
  subtitle,
  onDownload,
  onClose,
}: {
  preview: ParticipationExportPreview;
  subtitle: string;
  onDownload: () => void;
  onClose: () => void;
}) {
  const viewerRef = React.useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const fitWidth = React.useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !preview.width) return;
    const nextZoom = Math.max(
      PARTICIPATION_EXPORT_PREVIEW_MIN_ZOOM,
      Math.min(PARTICIPATION_EXPORT_PREVIEW_MAX_ZOOM, (viewer.clientWidth - 32) / preview.width),
    );
    setZoom(nextZoom);
    viewer.scrollTo({ left: 0, top: 0 });
  }, [preview.width]);
  React.useLayoutEffect(() => {
    fitWidth();
  }, [fitWidth, preview.url]);
  const stepZoom = (direction: "in" | "out") => {
    const levels = PARTICIPATION_EXPORT_PREVIEW_ZOOM_LEVELS;
    if (direction === "in") {
      setZoom((current) => levels.find((level) => level > current + 0.01) ?? PARTICIPATION_EXPORT_PREVIEW_MAX_ZOOM);
      return;
    }
    setZoom((current) => [...levels].reverse().find((level) => level < current - 0.01) ?? PARTICIPATION_EXPORT_PREVIEW_MIN_ZOOM);
  };
  const displayWidth = Math.max(1, Math.round(preview.width * zoom));

  return (
    <FunctionOverlay
      title="Participation Vorschau"
      subtitle={subtitle}
      dialogClassName={styles.exportPreviewDialog}
      bodyClassName={styles.exportPreviewDialogBody}
      onClose={onClose}
    >
      <section className={styles.exportPreviewPanel}>
        <div className={styles.exportPreviewControls}>
          <button type="button" className={styles.secondaryAction} onClick={() => stepZoom("out")} disabled={zoom <= PARTICIPATION_EXPORT_PREVIEW_MIN_ZOOM}>
            -
          </button>
          <button type="button" className={styles.secondaryAction} onClick={() => stepZoom("in")} disabled={zoom >= PARTICIPATION_EXPORT_PREVIEW_MAX_ZOOM}>
            +
          </button>
          <button type="button" className={styles.secondaryAction} onClick={() => setZoom(1)}>
            100 %
          </button>
          <button type="button" className={styles.secondaryAction} onClick={fitWidth}>
            An Breite anpassen
          </button>
          <button type="button" className={styles.primaryAction} onClick={onDownload}>
            <Download size={16} aria-hidden />
            Export herunterladen
          </button>
        </div>
        <div className={styles.exportPreviewViewer} ref={viewerRef}>
          <img
            alt="Participation Export Vorschau"
            className={styles.exportPreviewImage}
            height={preview.height}
            src={preview.url}
            style={{ width: `${displayWidth}px` }}
            width={preview.width}
          />
        </div>
      </section>
    </FunctionOverlay>
  );
}

const ParticipationExportReport = React.forwardRef<
  HTMLDivElement,
  {
    tracker: FightTrackerGuild;
    exportType: ParticipationExportType;
    month: string;
    fights: GuildFight[];
    rows: ParticipationDerivedRow[];
  }
>(function ParticipationExportReport({ tracker, exportType, month, fights, rows }, ref) {
  const dayCount = getMonthDays(month);
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const fightBySlot = new Map(fights.map((fight) => [getFightSlotKey(fight.date, fight.fightNumber), fight]));
  const monthLabel = formatMonthLabel(month);
  const exportClassName = `${styles.exportReport} ${exportType === "detailed" ? styles.exportReportDetailed : styles.exportReportSimple}`;
  const exportStyle = exportType === "simple" ? ({ width: `${getSimpleExportWidth(fights.length)}px` } as React.CSSProperties) : undefined;
  const guildEmblemUrl = exportType === "simple" ? guildIconByIdentifier(getFightTrackerGuildLogoIdentifier(tracker), 160).thumb : null;
  const guildSummary = getGuildParticipationSummary(fights, rows);
  const guildActivityDays = getGuildActivityDays(month, fights, rows);

  const perfectRows = rows.filter((row) => row.evaluated > 0 && row.missed === 0);
  const maxMissed = Math.max(0, ...rows.map((row) => row.missed));
  const mostMissedRows = maxMissed > 0 ? rows.filter((row) => row.missed === maxMissed) : [];
  const bestStreak = Math.max(0, ...rows.map((row) => (row.streakStatus === "ok" ? row.streakCount : 0)));
  const bestStreakRows = bestStreak > 0 ? rows.filter((row) => row.streakStatus === "ok" && row.streakCount === bestStreak) : [];

  return (
    <div
      ref={ref}
      className={exportClassName}
      style={exportStyle}
      data-fight-participation-export-root="true"
    >
      {exportType === "simple" ? (
        <ExportSimpleGuildInfo
          activityDays={guildActivityDays}
          emblemUrl={guildEmblemUrl}
          fightCount={fights.length}
          guildName={tracker.name}
          monthLabel={monthLabel}
          participationRate={guildSummary.rate}
        />
      ) : (
        <header className={styles.exportReportHeader}>
          <div>
            <p>Fight Participation</p>
            <h2>{tracker.name}</h2>
            <span>{monthLabel}</span>
          </div>
          <div className={styles.exportReportStats}>
            <strong>{fights.length}</strong>
            <span>Fights</span>
            {exportType === "detailed" ? (
              <>
                <strong>{rows.length}</strong>
                <span>Member</span>
              </>
            ) : null}
          </div>
        </header>
      )}

      {exportType === "detailed" ? (
        <>
          <section className={styles.exportBlock}>
            <div className={styles.exportBlockHeader}>
              <h3>Gilden-Activity</h3>
              <span>{monthLabel}</span>
            </div>
            <ExportCalendarGrid days={days}>
              {days.map((day) => (
                <ExportFightDayCells
                  key={day}
                  date={getDateForMonthDay(month, day)}
                  fightBySlot={fightBySlot}
                  rows={rows}
                  mode="guild"
                />
              ))}
            </ExportCalendarGrid>
          </section>

          <section className={styles.exportHighlights}>
            <ExportHighlightCard title="Meiste verpasste Kaempfe" value={maxMissed ? `${maxMissed} Missed` : "-"} rows={mostMissedRows} />
            <ExportHighlightCard title="Laengste Teilnahme-Serie" value={bestStreak ? `${bestStreak}x dabei` : "-"} rows={bestStreakRows} />
            <ExportHighlightCard title="Keinen Kampf verpasst" value={String(perfectRows.length)} rows={perfectRows} />
          </section>
        </>
      ) : null}

      <section className={`${styles.exportMemberList} ${exportType === "simple" ? styles.exportSimpleTable : ""}`}>
        {exportType === "simple" ? <ExportSimpleMemberHeader /> : null}
        {rows.map((row) =>
          exportType === "simple" ? (
            <ExportSimpleMemberRow key={row.member.id} row={row} fights={fights} />
          ) : (
            <article key={row.member.id} className={`${styles.exportMemberRow} ${styles.exportMemberDetailedRow} ${row.member.active ? "" : styles.exportMemberInactive}`}>
              <ExportMemberSummary row={row} />
              <div className={styles.exportMemberActivity}>
                <ExportCalendarGrid days={days}>
                  {days.map((day) => (
                    <ExportFightDayCells
                      key={day}
                      date={getDateForMonthDay(month, day)}
                      fightBySlot={fightBySlot}
                      rows={rows}
                      memberId={row.member.id}
                      mode="member"
                    />
                  ))}
                </ExportCalendarGrid>
              </div>
            </article>
          ),
        )}
      </section>
    </div>
  );
});

function ExportSimpleGuildInfo({
  activityDays,
  emblemUrl,
  fightCount,
  guildName,
  monthLabel,
  participationRate,
}: {
  activityDays: GuildActivityDay[];
  emblemUrl: string | null;
  fightCount: number;
  guildName: string;
  monthLabel: string;
  participationRate: number | null;
}) {
  return (
    <header className={`${styles.exportReportHeader} ${styles.exportSimpleGuildInfo}`}>
      <div className={styles.exportSimpleGuildMain}>
        <div className={styles.exportGuildEmblem}>
          {emblemUrl ? <img src={emblemUrl} alt={`${guildName} Wappen`} /> : <span aria-hidden />}
        </div>
        <div className={styles.exportSimpleGuildText}>
          <p>Fight Participation</p>
          <h2>{guildName}</h2>
          <span>{monthLabel}</span>
        </div>
      </div>
      <ExportSimpleGuildActivity days={activityDays} />
      <div className={styles.exportSimpleGuildMetrics}>
        <div>
          <strong>{fightCount}</strong>
          <span>Fights</span>
        </div>
        <div>
          <strong>{formatParticipationRate(participationRate)}</strong>
          <span>Ø Beteiligung</span>
        </div>
      </div>
    </header>
  );
}

function ExportSimpleGuildActivity({ days }: { days: GuildActivityDay[] }) {
  const gridStyle = { gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, 16px)` } as React.CSSProperties;

  return (
    <div
      className={styles.exportGuildActivity}
      aria-label="Guild Activity im Monat"
    >
      <div className={styles.exportGuildActivityTitle}>Guild Activity</div>
      <div className={styles.exportGuildActivityTimeline}>
        <div className={styles.exportGuildActivityDays} style={gridStyle}>
          {days.map((day) => (
            <span key={day.date}>{String(day.day).padStart(2, "0")}</span>
          ))}
        </div>
        {FIGHT_SLOTS.map((slot) => (
          <React.Fragment key={slot}>
            <span className={styles.exportGuildActivityFightLabel}>F{slot}</span>
            <div className={styles.exportGuildActivityCells} style={gridStyle}>
              {days.map((day) => {
                const fight = day.fights[slot];
                const levelClass =
                  fight.level === "max"
                    ? styles.exportGuildActivityMax
                    : fight.level === "high"
                      ? styles.exportGuildActivityHigh
                      : fight.level === "mid"
                        ? styles.exportGuildActivityMid
                        : fight.level === "low"
                          ? styles.exportGuildActivityLow
                          : styles.exportGuildActivityEmpty;
                const valueLabel = fight.hasFight
                  ? fight.evaluated
                    ? `${formatParticipationRate(fight.rate)} (${fight.ok}/${fight.evaluated})`
                    : "keine Bewertung"
                  : "kein Fight";
                return (
                  <span
                    key={`${day.date}-${slot}`}
                    className={`${styles.exportGuildActivityDay} ${levelClass}`}
                    title={`Fight ${slot} ${formatDate(day.date)}: ${valueLabel}`}
                  />
                );
              })}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ExportSimpleMemberHeader() {
  return (
    <div className={`${styles.exportSimpleRow} ${styles.exportSimpleHeader}`}>
      <span>Member</span>
      <span>Missed</span>
      <span>Quote</span>
      <span>Letzter Fehlkampf</span>
      <span>Serie</span>
    </div>
  );
}

function ExportSimpleMemberRow({
  row,
  fights,
}: {
  row: ParticipationDerivedRow;
  fights: GuildFight[];
}) {
  const memberMetaParts = [
    formatMemberClassName(row.member.className),
    row.level != null ? `Level ${row.level.toLocaleString("de-DE")}` : null,
    !row.member.active ? "nicht mehr in aktueller Gilde" : null,
  ].filter((entry): entry is string => Boolean(entry));

  return (
    <article className={`${styles.exportSimpleMemberBlock} ${row.member.active ? "" : styles.exportMemberInactive}`}>
      <div className={styles.exportSimpleRow}>
        <div className={`${styles.exportMemberIdentity} ${styles.exportSimpleMemberIdentity}`}>
          <strong>
            {row.member.name}
            {hasPerfectMonthParticipation(row) ? (
              <span className={styles.exportPerfectMarker} title="Keinen Fight verpasst">
                ★
              </span>
            ) : null}
          </strong>
          {memberMetaParts.length ? <span>{memberMetaParts.join(" · ")}</span> : null}
        </div>
        <strong>{row.missed}</strong>
        <strong>{formatQuote(row.missed, row.evaluated)}</strong>
        <strong>{row.lastMissedFight ? formatDate(row.lastMissedFight.date) : "-"}</strong>
        <strong>{formatStreak(row.streakStatus, row.streakCount)}</strong>
      </div>
      <ExportSimpleFightTimeline fights={fights} memberId={row.member.id} />
    </article>
  );
}

function ExportSimpleFightTimeline({ fights, memberId }: { fights: GuildFight[]; memberId: string }) {
  if (!fights.length) return null;
  const gridStyle = { gridTemplateColumns: `repeat(${fights.length}, ${EXPORT_SIMPLE_FIGHT_BLOCK_WIDTH_PX}px)` };
  return (
    <div className={styles.exportSimpleFightTimeline} style={gridStyle}>
      {fights.map((fight) => {
        const status = getFightMemberStatus(fight, memberId);
        const statusClass =
          status === "ok" ? styles.exportActivityOk : status === "missed" ? styles.exportActivityMissed : styles.exportActivityUnknown;
        const statusLabel = status === "ok" ? "OK" : status === "missed" ? "Fehlt" : "?";
        return (
          <div
            key={fight.id}
            className={styles.exportSimpleFightBlock}
            title={`Fight ${fight.fightNumber} ${formatDate(fight.date)}: ${statusLabel}`}
          >
            <span className={`${styles.exportSimpleFightCell} ${statusClass}`} />
            <strong>{formatShortDate(fight.date)} · F{fight.fightNumber}</strong>
          </div>
        );
      })}
    </div>
  );
}

function ExportMemberSummary({ row }: { row: ParticipationDerivedRow }) {
  const memberMetaParts = [
    formatMemberClassName(row.member.className),
    row.level != null ? `Level ${row.level.toLocaleString("de-DE")}` : null,
    !row.member.active ? "nicht mehr in aktueller Gilde" : null,
  ].filter((entry): entry is string => Boolean(entry));

  return (
    <div className={styles.exportMemberSummary}>
      <div className={styles.exportMemberIdentity}>
        <strong>{row.member.name}</strong>
        <span>{memberMetaParts.join(" · ")}</span>
      </div>
      <ExportMetric label="Missed" value={String(row.missed)} />
      <ExportMetric label="Quote" value={formatQuote(row.missed, row.evaluated)} />
      <ExportMetric label="Letzter Fehlkampf" value={row.lastMissedFight ? formatDate(row.lastMissedFight.date) : "-"} />
      <ExportMetric label="Serie" value={formatStreak(row.streakStatus, row.streakCount)} />
    </div>
  );
}

function ExportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.exportMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExportCalendarHeader({ days }: { days: number[] }) {
  return (
    <div className={styles.exportCalendarHeader} style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, ${EXPORT_ACTIVITY_DAY_WIDTH_PX}px)` }}>
      {days.map((day) => (
        <span key={day}>{String(day).padStart(2, "0")}</span>
      ))}
    </div>
  );
}

function ExportCalendarGrid({ days, children }: { days: number[]; children: React.ReactNode }) {
  const gridStyle = { gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, ${EXPORT_ACTIVITY_DAY_WIDTH_PX}px)` };
  return (
    <div className={styles.exportCalendar}>
      <ExportCalendarHeader days={days} />
      <div className={styles.exportCalendarGrid} style={gridStyle}>
        {children}
      </div>
    </div>
  );
}

function ExportFightDayCells({
  date,
  fightBySlot,
  rows,
  memberId,
  mode,
}: {
  date: string;
  fightBySlot: Map<string, GuildFight>;
  rows: ParticipationDerivedRow[];
  memberId?: string;
  mode: "guild" | "member";
}) {
  return (
    <div className={styles.exportDayCellGroup}>
      {FIGHT_SLOTS.map((slot) => {
        const fight = fightBySlot.get(getFightSlotKey(date, slot)) ?? null;
        if (!fight) return <span key={slot} className={`${styles.exportActivityCell} ${styles.exportActivityEmpty}`} />;

        if (mode === "guild") {
          const statusCounts = rows.reduce(
            (counts, row) => {
              const status = getFightMemberStatus(fight, row.member.id);
              if (status === "ok") counts.ok += 1;
              if (status === "missed") counts.missed += 1;
              return counts;
            },
            { ok: 0, missed: 0 },
          );
          const evaluated = statusCounts.ok + statusCounts.missed;
          const rate = evaluated ? statusCounts.ok / evaluated : null;
          const rateClass =
            rate == null
              ? styles.exportActivityUnknown
              : rate >= 0.8
                ? styles.exportActivityHigh
                : rate >= 0.5
                  ? styles.exportActivityMid
                  : styles.exportActivityLow;
          return (
            <span
              key={slot}
              className={`${styles.exportActivityCell} ${rateClass}`}
              title={`Fight ${slot} ${formatDate(date)}: ${rate == null ? "keine Bewertung" : `${Math.round(rate * 100)}%`}`}
            />
          );
        }

        const status = memberId ? getFightMemberStatus(fight, memberId) : "unknown";
        const statusClass =
          status === "ok" ? styles.exportActivityOk : status === "missed" ? styles.exportActivityMissed : styles.exportActivityUnknown;
        return (
          <span
            key={slot}
            className={`${styles.exportActivityCell} ${statusClass}`}
            title={`Fight ${slot} ${formatDate(date)}: ${status === "ok" ? "OK" : status === "missed" ? "Fehlt" : "?"}`}
          />
        );
      })}
    </div>
  );
}

function ExportHighlightCard({ title, value, rows }: { title: string; value: string; rows: ParticipationDerivedRow[] }) {
  const names = rows.map((row) => row.member.name).join(", ");
  return (
    <article className={styles.exportHighlightCard}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{names || "-"}</small>
    </article>
  );
}
