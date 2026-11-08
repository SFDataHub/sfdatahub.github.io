import { hubLocale, hubMessage, hubNumber, hubPercent, hubText } from "../../lib/i18n/dataHubPresentation";
import { profileClassLabel } from "../../lib/i18n/profilePresentation";
import { fightViewEvents, useAnalyticsView } from "../../lib/analytics/localEvents";
import { loadIdentityResolutionSnapshot, type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { subscribeToLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import { useRuntimeAuditCommit } from "../../lib/data-hub/useRuntimeAuditCommit";
import { auditAccept, auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditDiscard, auditFields, auditObserveInputs, auditDependencyId, auditId, auditLink, type AuditFields } from "../../lib/data-hub/runtimeAudit";
import type { HubFavorite } from "../../lib/data-hub/hubFavoritesContract";
import { Trans, useTranslation } from "react-i18next";
import { useLocalFavoritePageAction } from "../../components/data-hub/LocalFavoritesMenu";
import LocalTitleNavigation from "../../components/ui/shared/LocalTitleNavigation";
import { useLocation, useNavigate } from "react-router-dom";
import { DATA_HUB, safeLocalReturn } from "../../lib/data-hub/routes";
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
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
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
  useGuildHubSelection,
  type GuildHubSelectedGuild,
} from "./hooks/useGuildHubSelection";
import { mapLocalGuildIdentityToSelection } from "../../lib/data-hub/useGuildFavoritesSelection";
import type { LocalDependencyNotification } from "../../lib/local-data/localDataDependencies";
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
  locale: string;
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

type ScanImportStatus = string | { newCount: number; formerCount: number; existingCount: number; inactiveCount: number };

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
  return new Intl.DateTimeFormat(hubLocale(), { month: "long", year: "numeric" }).format(new Date(year, monthIndex, 1));
};

const sortFightsByDateAndSlot = (fights: GuildFight[]) =>
  [...fights].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.fightNumber.localeCompare(b.fightNumber) || a.createdAt.localeCompare(b.createdAt);
  });


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
  return new Intl.DateTimeFormat(hubLocale(), { day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
};

const formatShortDate = (value: string) => {
  if (!value) return "-";
  const date = new Date(`${getFightDateKey(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat(hubLocale(), { day: "2-digit", month: "2-digit" }).format(date);
};

const formatFightLabel = (fight: GuildFight) =>
  [hubText("fightTrackerI18n.fightNumber", { number: fight.fightNumber }), formatDate(fight.date), fight.opponentGuild].filter(Boolean).join(" · ");

const formatQuote = (missed: number, eligible: number) => {
  if (!eligible) return "—";
  return hubPercent(missed / eligible);
};

const formatParticipationRate = (rate: number | null) => (rate == null ? "—" : hubPercent(rate, 1));

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

const formatMemberClassName = (value: string | null | undefined) => profileClassLabel(value);

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

const loadTrackerGuildSources = async (
  selectedGuilds: GuildHubSelectedGuild[], cause: LocalDependencyNotification | undefined, origin: AuditFields,
  acceptance: { current: () => boolean; accept: (sources: TrackerGuildSource[]) => void },
): Promise<TrackerGuildSource[]> => {
    const __audit1 = auditBegin("F26", "loadTrackerGuildSources");
    const context: AuditFields = { consumer: "fight-tracker-guild-sources", selectionDependencyId: auditDependencyId(selectedGuilds), ...origin, ...cause, trigger: cause?.trigger ?? origin?.trigger ?? "unknown" };
    auditFields(__audit1, context);
    if (typeof context.dependencyAuditId === "string") auditLink(__audit1, context.dependencyAuditId, "dependency-trigger");
    try {
  const guilds = new Map<string, TrackerGuildSource>();
  selectedGuilds.forEach((guild) => guilds.set(guild.id, guild));

  const summaries = await (auditValue(__audit1, auditEnter(__audit1, "listGuildHubScanSummaries"), (listGuildHubScanSummaries({ auditContext: context }))));
  const serverOptions = listGuildHubLocalServersFromScanSummaries(summaries);
  serverOptions.forEach((server) => {
    listGuildHubLocalGuildsForServerFromScanSummaries(summaries, server.id).forEach((guild) => {
      const selection = mapLocalGuildIdentityToSelection(guild);
      if (selection) guilds.set(selection.id, selection);
    });
  });

  const sources = [...guilds.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" }) ||
      a.server.localeCompare(b.server, "de-DE", { sensitivity: "base" }),
  );
  if (acceptance.current()) {
    acceptance.accept(sources);
    auditFields(__audit1, { consumerDecision: "accepted" });
    auditAccept(__audit1, sources);
  } else {
    auditFields(__audit1, { consumerDecision: "superseded" });
    if (__audit1) auditDiscard(__audit1);
  }
  return auditReturn(__audit1, sources);

    } catch (__auditError) {
      auditError(__audit1, __auditError);
      auditFields(__audit1, { consumerDecision: acceptance.current() ? "not-accepted" : "superseded" });
      if (__audit1 && !acceptance.current()) auditDiscard(__audit1);
      throw __auditError;
    }
    finally { auditLeave(__audit1); }
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
  {
 const __w32Run0=auditBegin("F31","deriveParticipationRows");
 const __w32Sync=auditEnter(__w32Run0,"deriveParticipationRows","sync-elapsed");
 try {return auditReturn(__w32Run0, rows.map((member) => {
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
  }));
} catch (__w32Error) { auditError(__w32Run0,__w32Error); throw __w32Error; } finally {auditValue(__w32Run0,__w32Sync,undefined);auditLeave(__w32Run0);}
};

const sortParticipationRows = (
  rows: ParticipationDerivedRow[],
  sortKey: ParticipationSortKey,
  sortDirection: ParticipationSortDirection,
) => {
    const __audit2 = auditBegin("F31", "sortParticipationRows");
    auditObserveInputs(__audit2, [rows]);
    auditFields(__audit2, { sortKey, sortDirection });
    try {
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

  return auditReturn(__audit2, [...rows].sort((a, b) => {
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
  }));

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
};

const formatStreak = (status: Exclude<FightMemberStatus, "unknown"> | null, count: number) =>
  status ? hubText(status === "ok" ? "fightTrackerI18n.streakPresent" : "fightTrackerI18n.streakMissed", { count }) : "-";

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
    const __audit3 = auditBegin("F25", "renderExportNodeToPngBlob");
  auditFields(__audit3, { consumerArea: "Kampftracking", trigger: "export-render-call" });
    try {
  await (auditValue(__audit3, auditEnter(__audit3, "waitForAnimationFrame"), (waitForAnimationFrame())));
  await (auditValue(__audit3, auditEnter(__audit3, "waitForAnimationFrame"), (waitForAnimationFrame())));
  if (document.fonts?.ready) await (auditValue(__audit3, auditEnter(__audit3, "document.fonts.ready"), (document.fonts.ready)));
  await (auditValue(__audit3, auditEnter(__audit3, "waitForExportAssets"), (waitForExportAssets(node))));
  await (auditValue(__audit3, auditEnter(__audit3, "waitForStableLayout"), (waitForStableLayout(node))));

  const rect = node.getBoundingClientRect();
  const targetWidth = Math.max(1, Math.ceil(rect.width));
  const targetHeight = Math.max(1, Math.ceil(rect.height));
  const scale = options.preserveCssPixelSize ? 1 : Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  if (targetWidth * scale > 32000 || targetHeight * scale > 32000 || targetWidth * targetHeight * scale * scale > 268000000) {
    throw new Error("Der Report ist fuer einen einzelnen PNG-Export zu gross. Inhalte wurden nicht gekuerzt.");
  }
  const viewportWidth = Math.max(1, Math.ceil(document.documentElement.clientWidth || window.innerWidth));
  const viewportHeight = Math.max(1, Math.ceil(document.documentElement.clientHeight || window.innerHeight));
  const canvas = await (auditValue(__audit3, auditEnter(__audit3, "html2canvas"), (html2canvas(node, {
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
  }))));
  if (options.preserveCssPixelSize && (canvas.width !== targetWidth || canvas.height !== targetHeight)) {
    throw new Error(
      `PNG konnte nicht in Originalgroesse erzeugt werden (${canvas.width}x${canvas.height} statt ${targetWidth}x${targetHeight}). Inhalte wurden nicht verkleinert.`,
    );
  }

  const blob = await (auditValue(__audit3, auditEnter(__audit3, "new Promise<Blob>((resolve, reject) => {\r\n    canvas.toBlob(\r\n      (blob) => {\r\n        if (!blob) {\r\n          reject(new Error("), (new Promise<Blob>((resolve, reject) => {
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
  }))));

  return auditReturn(__audit3, { blob, height: canvas.height, width: canvas.width });

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
};

const downloadPngUrl = (url: string, fileBaseName: string) => {
 const __w32Run0=auditBegin("F25","downloadPngUrl");
  auditFields(__w32Run0, { consumerArea: "Kampftracking", trigger: "download-call" });
 const __w32Sync=auditEnter(__w32Run0,"downloadPngUrl","sync-elapsed");
 try {
  const link = document.createElement("a");
  link.download = `${sanitizeFileBaseName(fileBaseName)}.png`;
  link.href = url;
  link.click();

} catch (__w32Error) { auditError(__w32Run0,__w32Error); throw __w32Error; } finally {auditValue(__w32Run0,__w32Sync,undefined);auditLeave(__w32Run0);}
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
  const { t } = useTranslation();
  const [identities, setIdentities] = React.useState<IdentityResolutionSnapshot | null>(null);
  React.useEffect(() => {
    let stopped = false, generation = 0;
    const refresh = async () => {
      const own = ++generation;
      const snapshot = await loadIdentityResolutionSnapshot();
      if (!stopped && own === generation) setIdentities(previous =>
        previous?.revisions && snapshot.revisions && previous.revisions.players === snapshot.revisions.players && previous.revisions.guilds === snapshot.revisions.guilds ? previous : snapshot);
    };
    void refresh().catch(console.error);
    const stop = subscribeToLocalDataDependencies({ allIdentities: true }, () => { void refresh().catch(console.error); });
    return () => { stopped = true; generation++; stop(); };
  }, []);
  const location = useLocation(), navigate = useNavigate();
  const returnTo = safeLocalReturn(location.state?.returnTo, location.pathname);
  const selection = useGuildHubSelection("fight-tracking");
  const handlePageFavorite = React.useCallback((favorite: HubFavorite) => { if (favorite.guild) selection.chooseGuild(favorite.guild); }, [selection.chooseGuild]);
  useLocalFavoritePageAction(t("hubNavigation.useTracker"), handlePageFavorite);
  const { activeGuild, selectedGuilds, isLoading: guildSelectionLoading } = selection;
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
  const syncContextRef = React.useRef({ tracker, identities });
  syncContextRef.current = { tracker, identities };
  React.useEffect(() => { setSyncPlan(null); }, [identities]);
  const [scanImportStatus, setScanImportStatus] = React.useState<ScanImportStatus | null>(null);
  const [importSession, setImportSession] = React.useState<LocalScreenshotImportSession | null>(null);
  const [activeMobilePanel, setActiveMobilePanel] = React.useState<MobileFunctionPanelId | null>(null);
  const [participationStatusDrafts, setParticipationStatusDrafts] = React.useState<ParticipationStatusDrafts>({});
  const [isApplyingParticipationDrafts, setIsApplyingParticipationDrafts] = React.useState(false);
  const [scanState, setScanState] = React.useState<ScanState>({
    status: "idle",
    progress: 0,
    message: "",
  });

  const guildSourcesRequest = React.useRef(0);
  const guildSourcesLifecycle = React.useRef<{ selection: GuildHubSelectedGuild[]; active: boolean }>();
  // Retire the old selection at commit, before a pending response can race the
  // passive effect cleanup. Each setup owns a distinct lifetime, including ABA.
  React.useLayoutEffect(() => {
    const lifetime = { selection: selectedGuilds, active: !guildSelectionLoading };
    guildSourcesLifecycle.current = lifetime;
    guildSourcesRequest.current++;
    return () => { lifetime.active = false; guildSourcesRequest.current++; };
  }, [selectedGuilds, guildSelectionLoading]);

  const invalidateGuildSources = React.useCallback(() => {
    guildSourcesRequest.current++;
    setGuildSourcesLoading(false);
    setGuildSourcesError(null);
  }, []);
  const clearGuildSelection = React.useCallback(() => {
    invalidateGuildSources();
    selection.chooseGuild(null);
  }, [invalidateGuildSources, selection.chooseGuild]);

  const resetTrackerView = React.useCallback(() => {
    invalidateGuildSources();
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
  }, [invalidateGuildSources]);

  useRuntimeAuditCommit(tracker, !!tracker && !trackerDetailLoading, "fight-tracker-detail");
  useRuntimeAuditCommit(trackerGuildSources, trackerGuildSources.length > 0, "fight-tracker-inventory");
  const refreshTrackerSummaries = React.useCallback(async () => {
    const summaries = await readFightTrackerSummaries();
    setTrackerSummaries(summaries);
  }, []);

  const guildSourcesConsumer = React.useRef<string>();
  const previousSourceSelection = React.useRef<GuildHubSelectedGuild[]>();
  const refreshGuildSources = React.useCallback(async (cause?: LocalDependencyNotification, origin?: AuditFields, showLoading = false) => {
    const lifetime = guildSourcesLifecycle.current;
    if (!lifetime?.active || lifetime.selection !== selectedGuilds) return;
    const request = ++guildSourcesRequest.current;
    const current = () => lifetime.active && guildSourcesLifecycle.current === lifetime &&
      lifetime.selection === selectedGuilds && guildSourcesRequest.current === request;
    guildSourcesConsumer.current ??= auditId("tracker-source-consumer");
    if (showLoading) setGuildSourcesLoading(true);
    try {
      await loadTrackerGuildSources(selectedGuilds, cause, { ...origin, consumerId: guildSourcesConsumer.current, requestGeneration: request }, {
        current,
        accept: sources => { setTrackerGuildSources(sources); setGuildSourcesError(null); },
      });
    } catch {
      if (current()) setGuildSourcesError("Scan-Quellen konnten nicht geladen werden.");
    } finally {
      // A background refresh can supersede a visible load and inherits its
      // loading state; only the latest request may finish that state.
      if (current()) setGuildSourcesLoading(false);
    }
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
    let stopped = false;
    if (guildSelectionLoading) return undefined;
    const lifetime = guildSourcesLifecycle.current;

    const previous = previousSourceSelection.current;
    const selectionReferenceChanged = !!previous && previous !== selectedGuilds;
    const setupTrigger = !previous ? "tracker-first-effect-setup" : selectionReferenceChanged
      ? "tracker-selection-reference-changed" : "tracker-effect-setup-unchanged-selection";
    previousSourceSelection.current = selectedGuilds;
    const load = (showLoading: boolean, cause?: LocalDependencyNotification) => {
      if (stopped) return;
      void refreshGuildSources(cause, { trigger: setupTrigger, triggerKind: cause ? "dependency-callback" : "effect-setup",
        selectionReferenceChanged: cause ? false : selectionReferenceChanged }, showLoading);
    };

    load(true);
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(cause => load(false, cause), { consumer: "fight-tracker-guild-sources" });

    return () => {
      stopped = true;
      if (lifetime && guildSourcesLifecycle.current === lifetime) {
        lifetime.active = false;
        guildSourcesRequest.current++;
      }
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
    () => (tracker ? buildFightTrackerSyncPlan(tracker, trackerMembers, trackerScanSnapshot, identities) : null),
    [tracker, trackerMembers, trackerScanSnapshot, identities],
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
        (source) => !trackerSummaries.some((summary) => isFightTrackerLinkedToGuild(summary.tracker, source, identities)),
      ),
    [trackerGuildSources, trackerSummaries, identities],
  );

  const activeGuildTrackerId = React.useMemo(
    () =>
      activeGuild
        ? (() => { const matches = trackerSummaries.filter(summary => isFightTrackerLinkedToGuild(summary.tracker, activeGuild, identities)); return matches.length === 1 ? matches[0].tracker.id : null; })()
        : null,
    [activeGuild, trackerSummaries, identities],
  );
  const applyFightCreationTarget = (targetFights: GuildFight[]) => {
    const orderIssue = getFightCreationOrderIssue(targetFights);
    if (orderIssue) return;
    const target = getNextFightCreationTarget(targetFights);
    setDate(target.date);
    setFightNumber(target.fightNumber);
  };

  const openTracker = async (trackerId: string) => {
    const __audit4 = auditBegin("F27", "openTracker");
    try {
    setTrackerDetailLoading(true);
    try {
      const state = await (auditValue(__audit4, auditEnter(__audit4, "readFightTrackerStateById"), (readFightTrackerStateById(trackerId))));
      auditAccept(__audit4, state.tracker);
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

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
};

  const backToSelection = async () => {
    resetTrackerView();
    try {
      await refreshTrackerSummaries();
      void refreshGuildSources(undefined, { trigger: "tracker-list-return", triggerKind: "explicit-refresh" });
      setStoreError(null);
    } catch {
      setStoreError("Fight-Tracker-Auswahl konnte nicht aktualisiert werden.");
    }
  };

  const createTrackerFromGuildSource = async (guild: TrackerGuildSource) => {
    const __audit5 = auditBegin("F29", "createTrackerFromGuildSource");
    try {
    const state = await (auditValue(__audit5, auditEnter(__audit5, "createFightTracker"), (createFightTracker({
      name: guild.name,
      server: guild.server,
      source: "guild_scan",
      linkedGuildHubGuildId: guild.guildId,
      linkedGuildHubLogoIdentifier: guild.logoIdentifier,
    }))));
    await (auditValue(__audit5, auditEnter(__audit5, "refreshTrackerSummaries"), (refreshTrackerSummaries())));
    void refreshGuildSources(undefined, { trigger: "tracker-created-from-guild", triggerKind: "explicit-refresh" });
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

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
};

  const createSelectedScanTracker = async () => {
    const source = scanSourceOptions.find((guild) => guild.id === selectedScanGuildId) ?? scanSourceOptions[0];
    if (!source) return;
    await createTrackerFromGuildSource(source);
  };

  const createManualTracker = async () => {
    const __audit6 = auditBegin("F29", "createManualTracker");
    try {
    const name = setupGuildName.trim();
    if (!name) return auditReturn(__audit6, undefined);
    const state = await (auditValue(__audit6, auditEnter(__audit6, "createFightTracker"), (createFightTracker({ name, server: setupGuildServer, source: "manual" }))));
    await (auditValue(__audit6, auditEnter(__audit6, "refreshTrackerSummaries"), (refreshTrackerSummaries())));
    void refreshGuildSources(undefined, { trigger: "tracker-created-manually", triggerKind: "explicit-refresh" });
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

    } catch (__auditError) { auditError(__audit6, __auditError); throw __auditError; }
    finally { auditLeave(__audit6); }
};

  const startTrackerManagement = (summary: FightTrackerSummary, mode: TrackerManagerState["mode"]) => {
    setManagerState({
      trackerId: summary.tracker.id,
      mode,
      renameValue: summary.tracker.name,
    });
  };

  const saveTrackerRename = async () => {
    const __audit7 = auditBegin("F29", "saveTrackerRename");
    try {
    if (!managerState || managerState.mode !== "rename") return auditReturn(__audit7, undefined);
    const summary = trackerSummaries.find((entry) => entry.tracker.id === managerState.trackerId);
    if (!summary) return auditReturn(__audit7, undefined);
    const updated = await (auditValue(__audit7, auditEnter(__audit7, "renameFightTracker"), (renameFightTracker(summary.tracker, managerState.renameValue))));
    setTrackerSummaries((prev) =>
      prev.map((entry) => (entry.tracker.id === updated.id ? { ...entry, tracker: updated } : entry)),
    );
    setTracker((prev) => (prev?.id === updated.id ? updated : prev));
    setManagerState(null);

    } catch (__auditError) { auditError(__audit7, __auditError); throw __auditError; }
    finally { auditLeave(__audit7); }
};

  const confirmTrackerDelete = async () => {
    const __audit8 = auditBegin("F29", "confirmTrackerDelete");
    try {
    if (!managerState || managerState.mode !== "delete") return auditReturn(__audit8, undefined);
    await (auditValue(__audit8, auditEnter(__audit8, "deleteFightTracker"), (deleteFightTracker(managerState.trackerId))));
    if (tracker?.id === managerState.trackerId) resetTrackerView();
    setManagerState(null);
    await (auditValue(__audit8, auditEnter(__audit8, "refreshTrackerSummaries"), (refreshTrackerSummaries())));
    void refreshGuildSources(undefined, { trigger: "tracker-deleted", triggerKind: "explicit-refresh" });

    } catch (__auditError) { auditError(__audit8, __auditError); throw __auditError; }
    finally { auditLeave(__audit8); }
};

  const addMember = async (input: CreateFightTrackerMemberInput, options?: { markMissingInReview?: boolean }) => {
    const __audit9 = auditBegin("F29", "addMember");
    try {
    if (!tracker) return auditReturn(__audit9, null);
    const name = input.name.trim();
    if (!name) return auditReturn(__audit9, null);
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
        await (auditValue(__audit9, auditEnter(__audit9, "putFightTrackerMember"), (putFightTrackerMember(updated))));
        setTrackerMembers((prev) => sortMembers(prev.map((member) => (member.id === updated.id ? updated : member))));
        setSyncPlan(null);
        setTrackerScanSnapshot(null);
        void refreshTrackerSummaries();
        if (options?.markMissingInReview) markReviewMember(updated.id, name);
        return auditReturn(__audit9, updated);
      }
      if (options?.markMissingInReview) markReviewMember(existing.id, name);
      return auditReturn(__audit9, existing);
    }

    const member = await (auditValue(__audit9, auditEnter(__audit9, "addFightTrackerMember"), (addFightTrackerMember(tracker.id, input))));
    if (!member) return auditReturn(__audit9, null);
    setTrackerMembers((prev) => sortMembers([...prev, member]));
    setSyncPlan(null);
    setTrackerScanSnapshot(null);
    void refreshTrackerSummaries();
    if (options?.markMissingInReview) markReviewMember(member.id, name);
    return auditReturn(__audit9, member);

    } catch (__auditError) { auditError(__audit9, __auditError); throw __auditError; }
    finally { auditLeave(__audit9); }
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
    const __audit10 = auditBegin("F29", "handleMemberActiveChange");
    try {
    const member = trackerMembers.find((entry) => entry.id === memberId);
    if (!member || member.active === active) return auditReturn(__audit10, undefined);
    const changedAt = new Date().toISOString();
    const updated: FightTrackerMember = {
      ...member,
      active,
      lastConfirmedActiveAt: active ? pickNewestTimestamp(member.lastConfirmedActiveAt, changedAt) : member.lastConfirmedActiveAt,
      updatedAt: changedAt,
    };
    await (auditValue(__audit10, auditEnter(__audit10, "putFightTrackerMember"), (putFightTrackerMember(updated))));
    setTrackerMembers((prev) => sortMembers(prev.map((entry) => (entry.id === memberId ? updated : entry))));
    setSyncPlan(null);
    setTrackerScanSnapshot(null);
    void refreshTrackerSummaries();

    } catch (__auditError) { auditError(__audit10, __auditError); throw __auditError; }
    finally { auditLeave(__audit10); }
};

  const handleMemberDelete = async (memberId: string) => {
    const __audit11 = auditBegin("F29", "handleMemberDelete");
    try {
    if (!tracker) return auditReturn(__audit11, undefined);
    const result = await (auditValue(__audit11, auditEnter(__audit11, "deleteFightTrackerMember"), (deleteFightTrackerMember(tracker.id, memberId))));
    if (!result.deleted) return auditReturn(__audit11, undefined);
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

    } catch (__auditError) { auditError(__audit11, __auditError); throw __auditError; }
    finally { auditLeave(__audit11); }
};

  const handleFightDelete = async (fightId: string) => {
    const __audit12 = auditBegin("F29", "handleFightDelete");
    try {
    if (!tracker) return auditReturn(__audit12, undefined);
    const result = await (auditValue(__audit12, auditEnter(__audit12, "deleteFightTrackerFight"), (deleteFightTrackerFight(tracker.id, fightId))));
    if (!result.deleted) return auditReturn(__audit12, undefined);
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

    } catch (__auditError) { auditError(__audit12, __auditError); throw __auditError; }
    finally { auditLeave(__audit12); }
};

  const handleFightOpponentGuildChange = async (fightId: string, opponentGuild: string) => {
    const __audit13 = auditBegin("F29", "handleFightOpponentGuildChange");
    try {
    const fight = fights.find((entry) => entry.id === fightId);
    if (!fight) return auditReturn(__audit13, undefined);
    const updatedFight: GuildFight = { ...fight, opponentGuild: normalizeString(opponentGuild) };
    await (auditValue(__audit13, auditEnter(__audit13, "putFightTrackerFight"), (putFightTrackerFight(updatedFight))));
    setFights((prev) => prev.map((entry) => (entry.id === fightId ? updatedFight : entry)));

    } catch (__auditError) { auditError(__audit13, __auditError); throw __auditError; }
    finally { auditLeave(__audit13); }
};

  const saveFightInDailySlot = async (fightInput: Omit<GuildFight, "id">) => {
    const __audit14 = auditBegin("F29", "saveFightInDailySlot");
    try {
    if (fightCreationOrderIssue) {
      window.alert(hubText("fightTrackerI18n.orderIssue", { issue: hubMessage(fightCreationOrderIssue) }));
      return auditReturn(__audit14, false);
    }
    if (hasInvalidFightSlots) {
      window.alert(hubText("fightTrackerI18n.invalidSlot"));
      return auditReturn(__audit14, false);
    }

    const slotFights = getFightsForSlot(fights, fightInput.date, fightInput.fightNumber);
    if (slotFights.length > 1) {
      window.alert(
        hubText("fightTrackerI18n.slotDuplicate", { number: fightInput.fightNumber, date: formatDate(fightInput.date) }),
      );
      return auditReturn(__audit14, false);
    }

    const existingFight = slotFights[0] ?? null;
    if (existingFight) {
      const shouldOverwrite = window.confirm(
        hubText("fightTrackerI18n.slotConfirm", { number: fightInput.fightNumber, date: formatDate(fightInput.date) }),
      );
      if (!shouldOverwrite) return auditReturn(__audit14, false);
    }

    const nextFight: GuildFight = {
      ...fightInput,
      id: existingFight?.id ?? createFightId(),
    };
    const nextFights = existingFight ? fights.map((fight) => (fight.id === existingFight.id ? nextFight : fight)) : [...fights, nextFight];
    await (auditValue(__audit14, auditEnter(__audit14, "putFightTrackerFight"), (putFightTrackerFight(nextFight))));
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
    return auditReturn(__audit14, true);

    } catch (__auditError) { auditError(__audit14, __auditError); throw __auditError; }
    finally { auditLeave(__audit14); }
};

  const applyMemberMergePlan = async (plan: FightTrackerSyncPlan) => {
    const __audit15 = auditBegin("F28", "applyMemberMergePlan");
    try {
    if (!tracker) return auditReturn(__audit15, { newCount: 0, formerCount: 0, existingCount: 0, inactiveCount: 0 });
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
      const member = await (auditValue(__audit15, auditEnter(__audit15, "addFightTrackerMember"), (addFightTrackerMember(tracker.id, scanMember))));
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
      await (auditValue(__audit15, auditEnter(__audit15, "putFightTrackerMember"), (putFightTrackerMember(updated))));
      updatedMembers.push(updated);
    }

    for (const member of plan.missingMembers) {
      const updated: FightTrackerMember = {
        ...member,
        active: false,
        updatedAt: new Date().toISOString(),
      };
      await (auditValue(__audit15, auditEnter(__audit15, "putFightTrackerMember"), (putFightTrackerMember(updated))));
      updatedMembers.push(updated);
      inactiveCount += 1;
    }

    const nextSyncedScanAt = pickNewestTimestamp(tracker.lastSyncedScanAt, plan.snapshot.scanAt);
    const nextSyncedScanId =
      plan.snapshot.scanAt && nextSyncedScanAt === new Date(Date.parse(plan.snapshot.scanAt)).toISOString()
        ? plan.snapshot.scanId
        : tracker.lastSyncedScanId;
    const nextTracker = await (auditValue(__audit15, auditEnter(__audit15, "updateFightTrackerSyncMetadata"), (updateFightTrackerSyncMetadata(
      tracker,
      nextSyncedScanId,
      nextSyncedScanAt,
      plan.snapshot.normalizerVersion,
      plan.snapshot.coaString,
    ))));
    setTracker(nextTracker);
    setTrackerMembers((prev) => {
      const next = new Map(prev.map((member) => [member.id, member]));
      updatedMembers.forEach((member) => next.set(member.id, member));
      return sortMembers([...next.values()]);
    });
    setSyncPlan(null);
    setTrackerScanSnapshot(null);
    void refreshTrackerSummaries();

    return auditReturn(__audit15, {
      newCount: addedCount,
      formerCount,
      existingCount: plan.existingMemberCount,
      inactiveCount,
    });

    } catch (__auditError) { auditError(__audit15, __auditError); throw __auditError; }
    finally { auditLeave(__audit15); }
};

  const handleImportScanMembers = async () => {
    const __audit16 = auditBegin("F28", "handleImportScanMembers");
    try {
    if (!visibleScanImportPlan?.hasChanges) return auditReturn(__audit16, undefined);
    const result = await (auditValue(__audit16, auditEnter(__audit16, "applyMemberMergePlan"), (applyMemberMergePlan(visibleScanImportPlan))));
    setScanImportStatus(result.newCount || result.formerCount || result.existingCount || result.inactiveCount
      ? result
      : "Keine neuen Mitglieder gefunden");

    } catch (__auditError) { auditError(__audit16, __auditError); throw __auditError; }
    finally { auditLeave(__audit16); }
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
          setScanState({
            status: "scanning",
            progress: progress.progress,
            message: progress.status,
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
    const __audit17 = auditBegin("F29", "handleApplyImportReview");
    try {
    if (!tracker || !importSession?.review.date) return auditReturn(__audit17, undefined);
    if (importSession.review.reportType === "unsupported_defense") return auditReturn(__audit17, undefined);
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
    const didSave = await (auditValue(__audit17, auditEnter(__audit17, "saveFightInDailySlot"), (saveFightInDailySlot({
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
    }))));
    if (didSave) handleClearImportSession();

    } catch (__auditError) { auditError(__audit17, __auditError); throw __auditError; }
    finally { auditLeave(__audit17); }
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
    const __audit18 = auditBegin("F29", "applyParticipationStatusDrafts");
    try {
    if (!tracker || isApplyingParticipationDrafts) return auditReturn(__audit18, undefined);
    const draftEntries = Object.values(participationStatusDrafts);
    if (!draftEntries.length) return auditReturn(__audit18, undefined);

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
        return auditReturn(__audit18, undefined);
      }

      setFights(nextFights);
      for (const fight of changedFights.values()) {
        await (auditValue(__audit18, auditEnter(__audit18, "putFightTrackerFight"), (putFightTrackerFight(fight))));
      }
      setParticipationStatusDrafts({});
    } finally {
      setIsApplyingParticipationDrafts(false);
    }

    } catch (__auditError) { auditError(__audit18, __auditError); throw __auditError; }
    finally { auditLeave(__audit18); }
};

  const handleSetMemberFightStatus = async (fightId: string, memberId: string, status: FightMemberStatus) => {
    const __audit19 = auditBegin("F29", "handleSetMemberFightStatus");
    try {
    if (!tracker) return auditReturn(__audit19, undefined);
    let updatedFight: GuildFight | null = null;
    const nextFights = fights.map((fight) => {
      if (fight.id !== fightId) return fight;
      updatedFight = setFightMemberStatus(fight, rosterLookup.get(memberId), tracker, status);
      return updatedFight;
    });
    if (!updatedFight) return auditReturn(__audit19, undefined);
    setFights(nextFights);
    await (auditValue(__audit19, auditEnter(__audit19, "putFightTrackerFight"), (putFightTrackerFight(updatedFight))));

    } catch (__auditError) { auditError(__audit19, __auditError); throw __auditError; }
    finally { auditLeave(__audit19); }
};

  const totalMissed = fights.reduce((sum, fight) => sum + fight.missedMemberIds.length, 0);
  const canCreateFight = Boolean(tracker && date && !hasInvalidFightSlots && !fightCreationOrderIssue);
  const hasParticipationStatusDrafts = Object.keys(participationStatusDrafts).length > 0;
  const canApplyImportReview = Boolean(
    importSession && tracker && importSession.review.date && importSession.review.reportType !== "unsupported_defense" && !fightCreationOrderIssue,
  );
  const loadSyncPlan = React.useCallback(async () => {
    const __audit20 = auditBegin("F28", "loadSyncPlan");
    try {
    if (!tracker || !hasGuildScanLink || syncLoading || !identities) return auditReturn(__audit20, undefined);
    setSyncLoading(true);
    setScanImportStatus(null);
    try {
      const snapshot = await (auditValue(__audit20, auditEnter(__audit20, "loadLatestScanSnapshotForGuild"), (loadLatestScanSnapshotForGuild(tracker))));
      if (syncContextRef.current.tracker?.id !== tracker.id || syncContextRef.current.identities !== identities) return auditReturn(__audit20, undefined);
      setTrackerScanSnapshot(snapshot);
      setSyncPlan((auditValue(__audit20, auditEnter(__audit20, "buildFightTrackerSyncPlan", "sync-elapsed"), (buildFightTrackerSyncPlan(tracker, trackerMembers, snapshot, identities)))));
    } catch {
      setTrackerScanSnapshot(null);
      setSyncPlan(null);
      setScanImportStatus("Scan-Synchronisierung konnte nicht vorbereitet werden.");
    } finally {
      setSyncLoading(false);
    }

    } catch (__auditError) { auditError(__audit20, __auditError); throw __auditError; }
    finally { auditLeave(__audit20); }
}, [hasGuildScanLink, syncLoading, tracker, trackerMembers, identities]);
  const openFunctionPanel = (panelId: MobileFunctionPanelId) => {
    setActiveMobilePanel(panelId);
    if (panelId === "sync") void loadSyncPlan();
  };
  const syncPanel = hasGuildScanLink ? (
    <ScanMemberImportPanel
      plan={visibleScanImportPlan}
      snapshot={trackerScanSnapshot}
      loading={syncLoading || !identities}
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
          <h2>{hubText("fightTrackerI18n.newAttack")}</h2>
          <p>{tracker?.name ?? ""}</p>
        </div>
      </div>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>{hubText("fightTrackerI18n.date")}</span>
          <span className={styles.inputWrap}>
            <CalendarDays size={16} aria-hidden />
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </span>
        </label>
        <label className={styles.field}>
          <span>{hubText("fightTrackerI18n.fight")}</span>
          <select value={fightNumber} onChange={(event) => setFightNumber(normalizeFightNumber(event.target.value))}>
            <option value="1">{hubText("fightTrackerI18n.fight1")}</option>
            <option value="2">{hubText("fightTrackerI18n.fight2")}</option>
          </select>
        </label>
        {fightCreationOrderIssue ? (
          <div className={styles.slotWarning}>
            <AlertTriangle size={16} aria-hidden />
            <span>{hubText("fightTrackerI18n.orderIssue", { issue: hubMessage(fightCreationOrderIssue) })}</span>
          </div>
        ) : manualSelectedSlotFights.length ? (
          <div className={styles.slotWarning}>
            <AlertTriangle size={16} aria-hidden />
            <span>
              {hubText("fightTrackerI18n.slotExists", { number: fightNumber, date: formatDate(date), opponent: manualSelectedSlotFights[0]?.opponentGuild ? ` (${manualSelectedSlotFights[0].opponentGuild})` : "" })}
            </span>
          </div>
        ) : manualDefaultFightNumber ? (
          <div className={styles.slotHint}>{hubText("fightTrackerI18n.freeSlot", { number: manualDefaultFightNumber })}</div>
        ) : (
          <div className={styles.slotWarning}>
            <AlertTriangle size={16} aria-hidden />
            <span>{hubText("fightTrackerI18n.bothFightSlotsForThisDayAreOccupiedSelectFight1OrFight2ToReplace")}</span>
          </div>
        )}
        <label className={styles.field}>
          <span>{hubText("fightTrackerI18n.opponent")}</span>
          <input
            type="text"
            value={opponentGuild}
            placeholder={hubText("fightTrackerI18n.opponentGuild")}
            onChange={(event) => setOpponentGuild(event.target.value)}
          />
        </label>
        <button type="button" className={styles.primaryAction} disabled={!canCreateFight} onClick={handleCreateFight}>
          <Plus size={16} aria-hidden />
          {hubText("fightTrackerI18n.create")}
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
      title: hubText("fightTrackerI18n.newAttack"),
      subtitle: tracker?.name ?? hubText("fightTrackerI18n.fightTracker"),
      description: hubText("fightTrackerI18n.addAFightManually"),
      icon: <Swords size={22} aria-hidden />,
      content: fightCreatePanel,
    },
    {
      id: "screenshots",
      title: hubText("fightTrackerI18n.scanScreenshots"),
      subtitle: tracker?.name ?? hubText("fightTrackerI18n.fightTracker"),
      description: hubText("fightTrackerI18n.addAFightFromAScreenshot"),
      icon: <FileImage size={22} aria-hidden />,
      content: screenshotPanel,
    },
    {
      id: "member",
      title: hubText("fightTrackerI18n.addMember"),
      subtitle: tracker?.name ?? hubText("fightTrackerI18n.fightTracker"),
      description: hubText("fightTrackerI18n.addAPlayerToTheTrackerManually"),
      icon: <UserPlus size={22} aria-hidden />,
      content: memberPanel,
    },
    {
      id: "memberList",
      title: hubText("fightTrackerI18n.editList"),
      subtitle: tracker?.name ?? hubText("fightTrackerI18n.fightTracker"),
      description: hubText("fightTrackerI18n.activateOrDeactivateTrackerMembers"),
      icon: <Pencil size={22} aria-hidden />,
      content: memberStatusPanel,
    },
    ...(hasGuildScanLink
      ? [
          {
            id: "sync" as const,
            title: hubText("fightTrackerI18n.scanSync"),
            subtitle: tracker?.name ?? hubText("fightTrackerI18n.fightTracker"),
            description: hubText("fightTrackerI18n.compareMembersWithAGuildScan"),
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
      title: hubText("fightTrackerI18n.participation"),
      description: hubText("fightTrackerI18n.attendanceAbsencesRates"),
      icon: <ListChecks size={22} aria-hidden />,
      content: tracklistPanel,
    },
    ...desktopToolPanels.map((panel) => ({
      ...panel,
      content: panel.id === "sync" ? mobileSyncPanel : panel.content,
    })),
  ];
  const activePanelConfig = (isCompactLayout ? mobilePanels : desktopToolPanels).find((panel) => panel.id === activeMobilePanel) ?? null;
  useAnalyticsView(tracker && !trackerDetailLoading && activePanelConfig && activePanelConfig.id !== "tracklist" ? fightViewEvents[activePanelConfig.id] : null);
  useAnalyticsView(!tracker && !trackerDetailLoading && managerState && managerState.mode !== "closed" ? "datahub/fight/manager" : null);
  useAnalyticsView(tracker && !trackerDetailLoading && activeMobilePanel === "screenshots" && importSession ? "datahub/fight/screenshot-review" : null);
  const closeActiveFunctionPanel = () => {
    if (activeMobilePanel === "tracklist" && hasParticipationStatusDrafts) {
      const shouldDiscard = typeof window === "undefined" || window.confirm(hubText("fightTrackerI18n.discardUnsavedChanges"));
      if (!shouldDiscard) return;
      setParticipationStatusDrafts({});
    }
    setActiveMobilePanel(null);
  };

  const pageHeader = <LocalTitleNavigation title={hubText("fightTrackerI18n.fightTracking")}
    onBack={() => navigate(returnTo ?? DATA_HUB,
      { replace: true, state: returnTo ? location.state?.profileReturnState : undefined })} />;

  if (overviewLoading && !trackerSummaries.length && !tracker && !trackerDetailLoading) {
    return (
      <ContentShell centerFramed={false}>
        <div className={styles.page}>
          {pageHeader}
          <DataHubLoadingState
            variant="page"
            title={hubText("fightTrackerI18n.loadingFightTrackers")}
            message={hubText("fightTrackerI18n.readingTheLocalFightTrackerOverview")}
          />
        </div>
      </ContentShell>
    );
  }

  return (
    <ContentShell centerFramed={false}>
      <div className={styles.page}>
        <header className={styles.header}>
          {pageHeader}
          {tracker ? (
            <button type="button" className={styles.selectionBackButton} onClick={backToSelection}>
              <ArrowLeft size={16} aria-hidden />
              {hubText("fightTrackerI18n.backToGuildSelection")}
            </button>
          ) : null}
        </header>
        {(selection.contextIssue || selection.context.guild) && <section data-page-guild-context>
          {selection.contextIssue && <p role="alert">{t(`pageContext.${selection.contextIssue}`)}</p>}
          {selection.context.guild && <button type="button" onClick={clearGuildSelection}>{t("pageContext.clear")}</button>}
        </section>}

        {storeError ? <section className={styles.emptyState}>{hubMessage(storeError)}</section> : null}

        {trackerDetailLoading ? (
          <DataHubLoadingState
            title={hubText("fightTrackerI18n.loadingTracker")}
            message={hubText("fightTrackerI18n.readingLocalFightTrackerDetails")}
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
              <InfoPill label={hubText("fightTrackerI18n.trackerGuild")} value={tracker.name} hint={tracker.server ?? hubText("fightTrackerI18n.customTrackerData")} />
              <InfoPill label={hubText("fightTrackerI18n.members")} value={hubNumber(trackerMembers.length)} hint={hubText("fightTrackerI18n.activeCount", { count: activeRoster.length })} />
              <InfoPill label={hubText("fightTrackerI18n.fights")} value={hubNumber(fights.length)} hint={hubText("fightTrackerI18n.savedInIndexedDB")} />
              <InfoPill label={hubText("fightTrackerI18n.missed")} value={hubNumber(totalMissed)} hint={hubText("fightTrackerI18n.markedManuallybyOCR")} />
            </section>

	            {isCompactLayout ? (
	              <>
	                <section className={styles.mobileFunctionGrid} aria-label={hubText("fightTrackerI18n.fightTrackerActions")}>
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
	                <section className={styles.toolGrid} aria-label={hubText("fightTrackerI18n.fightTrackerTools")}>
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
          <h2>{hubText("fightTrackerI18n.fightTrackerGuilds")}</h2>
          <p>
            {activeGuild
              ? hubText("fightTrackerI18n.guildSuggestion", { name: activeGuild.name })
              : hubText("fightTrackerI18n.selectAGuildAboveAsAFightTrackingSuggestion")}
          </p>
        </div>
        {activeGuild && activeGuildTrackerId ? (
          <span className={styles.activeGuildBadge}>{hubText("fightTrackerI18n.trackerForTheSelectedSuggestionHighlighted")}</span>
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
                  {summary.tracker.source === "guild_scan" ? hubText("fightTrackerI18n.guildHubScan") : hubText("fightTrackerI18n.manual")}
                </span>
                <span className={styles.trackerCardTitleRow}>
                  <strong>{summary.tracker.name}</strong>
                  {summary.tracker.importedAt ? <span className={styles.importedTrackerBadge}>{hubText("fightTrackerI18n.imported")}</span> : null}
                </span>
                <small>{summary.tracker.server || hubText("fightTrackerI18n.noServer")}</small>
                <span className={styles.trackerCardStats}>
                  {hubText("fightTrackerI18n.memberCount", { count: summary.memberCount })} · {hubText("fightTrackerI18n.fightCount", { count: summary.fightCount })} · {hubText("fightTrackerI18n.missedCount", { count: summary.missedCount })}
                </span>
              </button>
              <div className={styles.trackerCardActions}>
                <button
                  type="button"
                  className={styles.iconOnlyButton}
                  aria-label={hubText("fightTrackerI18n.manageName", { name: summary.tracker.name })}
                  title={hubText("fightTrackerI18n.manage")}
                  onClick={() => onStartManagement(summary, isManaged ? "closed" : "rename")}
                >
                  <MoreVertical size={17} aria-hidden />
                </button>
                <button
                  type="button"
                  className={styles.iconOnlyButton}
                  aria-label={hubText("fightTrackerI18n.renameName", { name: summary.tracker.name })}
                  title={hubText("fightTrackerI18n.rename")}
                  onClick={() => onStartManagement(summary, "rename")}
                >
                  <Pencil size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${styles.iconOnlyButton} ${styles.dangerIconButton}`}
                  aria-label={hubText("fightTrackerI18n.deleteName", { name: summary.tracker.name })}
                  title={hubText("fightTrackerI18n.delete")}
                  onClick={() => onStartManagement(summary, "delete")}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
              {isManaged && managerState.mode === "rename" ? (
                <div className={styles.managerPanel}>
                  <label className={styles.field}>
                    <span>{hubText("fightTrackerI18n.trackerName")}</span>
                    <input value={managerState.renameValue} onChange={(event) => onManagerRenameValueChange(event.target.value)} />
                  </label>
                  <div className={styles.managerActions}>
                    <button type="button" className={styles.primaryAction} onClick={onSaveRename}>
                      <Check size={16} aria-hidden />
                      {hubText("fightTrackerI18n.save")}
                    </button>
                    <button type="button" className={styles.secondaryAction} onClick={onCloseManagement}>
                      {hubText("fightTrackerI18n.cancel")}
                    </button>
                  </div>
                </div>
              ) : null}
              {isManaged && managerState.mode === "delete" ? (
                <div className={styles.managerPanel}>
                  <div className={styles.deleteNotice}>
                    <AlertTriangle size={16} aria-hidden />
                    <span>{hubText("fightTrackerI18n.deletesOnlyThisTrackerItsMembersFightsAndTrackerStateGuildHubScansArePreserved")}</span>
                  </div>
                  <div className={styles.managerActions}>
                    <button type="button" className={styles.dangerAction} onClick={onConfirmDelete}>
                      <Trash2 size={16} aria-hidden />
                      {hubText("fightTrackerI18n.deleteTracker")}
                    </button>
                    <button type="button" className={styles.secondaryAction} onClick={onCloseManagement}>
                      {hubText("fightTrackerI18n.cancel")}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}

        <button type="button" className={styles.addTrackerCard} onClick={onToggleAddPanel}>
          <Plus size={22} aria-hidden />
          <strong>{hubText("fightTrackerI18n.addGuild")}</strong>
          <span>{hubText("fightTrackerI18n.linkedToAScanOrManual")}</span>
        </button>
      </div>

      {!summaries.length ? <section className={styles.emptyState}>{hubText("fightTrackerI18n.noFightTrackerGuildsYet")}</section> : null}

      {activeGuild && !activeGuildTrackerId ? (
        <div className={styles.syncPanel}>
          <div className={styles.createHeading}>
            <div className={styles.createIcon} aria-hidden>
              <Swords size={18} />
            </div>
            <div>
              <h2>{activeGuild.name}</h2>
              <p>{hubText("fightTrackerI18n.noFightTrackerExistsForTheSuggestedGuildYet")}</p>
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
            {hubText("fightTrackerI18n.createFromGuildHubData")}
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
            <h2>{hubText("fightTrackerI18n.addGuild")}</h2>
            <p>{hubText("fightTrackerI18n.aTrackerWithNoMembersIsValid")}</p>
          </div>
        </div>
	        <div className={styles.setupActions}>
	          <div className={styles.setupOption}>
	            <strong>{hubText("fightTrackerI18n.fromGuildHubData")}</strong>
	            <span>
	              {scanSourceLoading
	                ? hubText("fightTrackerI18n.loadingScanSources")
	                : (scanSourceError ? hubMessage(scanSourceError) : null) ?? hubText("fightTrackerI18n.createALinkImportingMembersIsOptional")}
	            </span>
            <label className={styles.field}>
              <span>{hubText("fightTrackerI18n.guildHubGuild")}</span>
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
                  <option value="">{hubText("fightTrackerI18n.noUnlinkedGuildHubGuilds")}</option>
                )}
              </select>
            </label>
            <button type="button" className={styles.primaryAction} disabled={!scanSourceOptions.length} onClick={onCreateFromSelectedScan}>
              <Plus size={16} aria-hidden />
              {hubText("fightTrackerI18n.createTracker")}
            </button>
          </div>
          <div className={styles.setupOption}>
            <strong>{hubText("fightTrackerI18n.withoutAScan")}</strong>
            <label className={styles.field}>
              <span>{hubText("fightTrackerI18n.guildName")}</span>
              <input value={setupGuildName} placeholder={hubText("fightTrackerI18n.guildName")} onChange={(event) => onSetupGuildNameChange(event.target.value)} />
            </label>
            <label className={styles.field}>
              <span>{hubText("fightTrackerI18n.serverOptional")}</span>
              <input value={setupGuildServer} placeholder={hubText("fightTrackerI18n.egS1")} onChange={(event) => onSetupGuildServerChange(event.target.value)} />
            </label>
            <button type="button" className={styles.secondaryAction} disabled={!setupGuildName.trim()} onClick={onCreateManualTracker}>
              <Plus size={16} aria-hidden />
              {hubText("fightTrackerI18n.createCustomGuild")}
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
  status: ScanImportStatus | null;
  trackerMemberCount: number;
  onImport: () => void;
  detailMode?: "overlay" | "inline";
}) {
  const { i18n } = useTranslation();
  const [openCategory, setOpenCategory] = React.useState<string | null>(null);
  useAnalyticsView(openCategory ? "datahub/fight/sync-details" : null);
  const meta = snapshot
    ? [
        snapshot.guildName,
        snapshot.server,
        snapshot.scanAt ? hubText("fightTrackerI18n.scanDate", { date: formatDate(snapshot.scanAt.slice(0, 10)) }) : hubText("fightTrackerI18n.scanWithoutASnapshotDate"),
        hubText("fightTrackerI18n.memberCount", { count: snapshot.members.length }),
      ]
        .filter(Boolean)
        .join(" - ")
    : loading
      ? hubText("fightTrackerI18n.preparingScanSynchronization")
      : hubText("fightTrackerI18n.noMatchingLocalGuildHubScanFound");
  const isInitialImport = trackerMemberCount === 0;
  const actionLabel = isInitialImport
    ? plan?.newMembers.length
      ? hubText("fightTrackerI18n.importMembers", { count: plan.newMembers.length })
      : hubText("fightTrackerI18n.importMembersFromTheLatestScan")
    : hubText("fightTrackerI18n.syncWithFightTracker");
  const categories = React.useMemo(
    () =>
      plan
        ? [
            {
              id: "new",
              title: hubText("fightTrackerI18n.newPlayers"),
              hint: hubText("fightTrackerI18n.newInScan"),
              items: plan.newMembers.filter((member) => member.active !== false).map((member) => member.name),
            },
            {
              id: "confirmed",
              title: hubText("fightTrackerI18n.alreadyTrackedFoundInScan"),
              hint: hubText("fightTrackerI18n.confirmedInScan"),
              items: plan.existingMembers.map((entry) => entry.member.name),
            },
            {
              id: "reactivated",
              title: hubText("fightTrackerI18n.reactivated"),
              hint: hubText("fightTrackerI18n.foundInScanAgain"),
              items: plan.reactivatedMembers.map((entry) => entry.member.name),
            },
            {
              id: "missing",
              title: hubText("fightTrackerI18n.noLongerInCurrentScan"),
              hint: hubText("fightTrackerI18n.becomesInactive"),
              items: plan.missingMembers.map((member) => member.name),
            },
            {
              id: "former",
              title: hubText("fightTrackerI18n.formerGuildMembers"),
              hint: hubText("fightTrackerI18n.onlyFoundInAnOlderScan"),
              items: plan.newMembers.filter((member) => member.active === false).map((member) => member.name),
            },
          ]
        : [],
    [plan, i18n.language],
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
          <h2>{hubText("fightTrackerI18n.guildScanSync")}</h2>
          <p>{meta}</p>
        </div>
      </div>
      {snapshot && plan && !plan.hasChanges && !status ? (
        <span className={styles.scanNotice}>{hubText("fightTrackerI18n.trackerMembersMatchThisScan")}</span>
      ) : null}
      {loading ? (
        <span className={styles.scanNotice}>{hubText("fightTrackerI18n.loadingAndComparingTheMatchingScan")}</span>
      ) : !snapshot ? (
        <span className={styles.scanNotice}>{hubText("fightTrackerI18n.firstImportAMatchingLocalScanForThisGuildInTheGuildHub")}</span>
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
        {status ? <span className={styles.scanNotice}>{typeof status === "string" ? hubMessage(status) : hubText("fightTrackerI18n.syncSummary", status)}</span> : null}
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
          <p>{hubText("fightTrackerI18n.entryCount", { count: category.items.length })}</p>
        </div>
        <button type="button" className={styles.secondaryAction} onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
          {hubText("fightTrackerI18n.back")}
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
          <span>{hubText("fightTrackerI18n.noPlayersInThisCategory")}</span>
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
  subtitle = hubText("fightTrackerI18n.fightTracker"),
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
          <button type="button" className={styles.iconOnlyButton} aria-label={hubText("fightTrackerI18n.closeView")} onClick={onClose}>
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
      <strong>{hubNumber(count)}</strong>
      <span>{hint}</span>
      <small>{hubText("fightTrackerI18n.clickForDetails")}</small>
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
            <p>{hubText("fightTrackerI18n.entryCount", { count: category.items.length })}</p>
          </div>
          <button type="button" className={styles.iconOnlyButton} aria-label={hubText("fightTrackerI18n.closeDetails")} onClick={onClose}>
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
            <span>{hubText("fightTrackerI18n.noPlayersInThisCategory")}</span>
          )}
        </div>
        <div className={styles.syncDialogActions}>
          <button type="button" className={styles.secondaryAction} onClick={onClose}>
            {hubText("fightTrackerI18n.close")}
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
          <h2>{hubText("fightTrackerI18n.addMember")}</h2>
          <p>{hubText("fightTrackerI18n.savedOnlyInTheFightTrackerList")}</p>
        </div>
      </div>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>{hubText("fightTrackerI18n.name")}</span>
          <input value={value} placeholder={hubText("fightTrackerI18n.memberName")} onChange={(event) => onChange(event.target.value)} />
        </label>
        <button type="button" className={styles.secondaryAction} disabled={!canAdd} onClick={onAdd}>
          <Plus size={16} aria-hidden />
          {hubText("fightTrackerI18n.add")}
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
  useAnalyticsView(viewMode === "members" ? "datahub/fight/manager-members" : "datahub/fight/manager-fights", false);
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
    { status: "ok", label: hubText("fightTrackerI18n.oK") },
    { status: "missed", label: hubText("fightTrackerI18n.absent") },
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
                <h2>{hubText("fightTrackerI18n.editList")}</h2>
                <p>{hubText("fightTrackerI18n.activateOrDeactivateTrackerMembers")}</p>
              </div>
            </div>
          ) : (
            <div className={styles.headingInline}>
              <button type="button" className={styles.iconOnlyButton} aria-label={hubText("fightTrackerI18n.backToMemberList")} onClick={() => setViewMode("members")}>
                <ArrowLeft size={16} aria-hidden />
              </button>
              <div>
                <h2>{hubText("fightTrackerI18n.manageFights")}</h2>
                <p>{hubText("fightTrackerI18n.deleteEntireFightEntriesFromThisTracker")}</p>
              </div>
            </div>
          )}
        </div>
        {viewMode === "members" ? (
          <button type="button" className={styles.secondaryAction} onClick={() => setViewMode("fights")}>
            <Swords size={16} aria-hidden />
            {hubText("fightTrackerI18n.fights")}
          </button>
        ) : null}
      </div>
      {viewMode === "fights" ? (
        sortedFights.length ? (
          <div className={styles.fightManageList}>
            {sortedFights.map((fight) => (
              <div key={fight.id} className={styles.fightManageRow}>
                <div className={styles.fightManageInfo}>
                  <strong>{hubText("fightTrackerI18n.fight")} {fight.fightNumber}</strong>
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
                      placeholder={hubText("fightTrackerI18n.opponent")}
                      aria-label={hubText("fightTrackerI18n.fightOpponent", { fight: formatFightLabel(fight) })}
                      disabled={pendingOpponentFightId === fight.id}
                      onChange={(event) => setEditingOpponentGuild(event.target.value)}
                    />
                    <button type="submit" className={styles.iconOnlyButton} aria-label={hubText("fightTrackerI18n.saveOpponent")} disabled={pendingOpponentFightId === fight.id}>
                      <Check size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={styles.iconOnlyButton}
                      aria-label={hubText("fightTrackerI18n.cancelOpponentEditing")}
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
                      aria-label={hubText("fightTrackerI18n.editFightOpponent", { fight: formatFightLabel(fight) })}
                      title={hubText("fightTrackerI18n.editOpponent")}
                      disabled={pendingDeleteFightId === fight.id}
                      onClick={() => startFightOpponentEdit(fight)}
                    >
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconOnlyButton} ${styles.dangerIconButton}`}
                      aria-label={hubText("fightTrackerI18n.deleteFight", { fight: formatFightLabel(fight) })}
                      title={hubText("fightTrackerI18n.permanentlyDeleteFight")}
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
          <div className={styles.reviewEmpty}>{hubText("fightTrackerI18n.noFightsCreatedYet")}</div>
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
                    {member.active ? hubText("fightTrackerI18n.active") : hubText("fightTrackerI18n.inactive")}
                  </span>
                  <div className={styles.memberManageActions}>
                    <button
                      type="button"
                      className={styles.iconOnlyButton}
                      aria-label={hubText("fightTrackerI18n.editMemberFights", { name: member.name })}
                      title={hubText("fightTrackerI18n.editFightAssignments")}
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
                      {member.active ? hubText("fightTrackerI18n.deactivate") : hubText("fightTrackerI18n.reactivate")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconOnlyButton} ${styles.dangerIconButton}`}
                      aria-label={hubText("fightTrackerI18n.deleteMember", { name: member.name })}
                      title={hubText("fightTrackerI18n.permanentlyRemoveFromTracker")}
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
                          <span>{hubText("fightTrackerI18n.selectFight")}</span>
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
                          aria-label={hubText("fightTrackerI18n.memberFightStatus", { name: member.name, fight: formatFightLabel(selectedFight), status: hubText("fightTrackerI18n." + (selectedStatus === "ok" ? "oK" : selectedStatus === "missed" ? "absent" : "notDetected")) })}
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
                      <div className={styles.reviewEmpty}>{hubText("fightTrackerI18n.noFightsCreatedYet")}</div>
                    )}
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div className={styles.reviewEmpty}>{hubText("fightTrackerI18n.noTrackerMembersYet")}</div>
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
              <h3 id="fight-member-delete-title">{hubText("fightTrackerI18n.permanentlyRemovePlayerFromTracker")}</h3>
              <p>
                <Trans i18nKey="fightTrackerI18n.removalSentence" values={{ name: memberToDelete.name }} components={{ strong: <strong /> }} />
              </p>
              <p>{hubText("fightTrackerI18n.allFightAndParticipationDataStoredForThisPlayerInTheTrackerWillAlsoBeDeleted")}</p>
              <p>{hubText("fightTrackerI18n.theGuildHubAndAllScanDataArePreserved")}</p>
              <p>{hubText("fightTrackerI18n.thisActionCannotBeUndone")}</p>
            </div>
            <div className={styles.memberDeleteConfirmActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={pendingDeleteMemberId === memberToDelete.id}
                onClick={() => setMemberToDelete(null)}
              >
                {hubText("fightTrackerI18n.cancel")}
              </button>
              <button
                type="button"
                className={styles.dangerAction}
                disabled={pendingDeleteMemberId === memberToDelete.id}
                onClick={handleConfirmDelete}
              >
                <Trash2 size={16} aria-hidden />
                {hubText("fightTrackerI18n.deletePermanently")}
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
              <h3 id="fight-delete-title">{hubText("fightTrackerI18n.permanentlyDeleteFight")}</h3>
              <p>
                <Trans i18nKey="fightTrackerI18n.removalSentence" values={{ name: formatFightLabel(fightToDelete) }} components={{ strong: <strong /> }} />
              </p>
              <p>{hubText("fightTrackerI18n.participationDataForAllPlayersInThisFightWillAlsoBeDeleted")}</p>
              <p>{hubText("fightTrackerI18n.thisActionCannotBeUndone")}</p>
            </div>
            <div className={styles.memberDeleteConfirmActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={pendingDeleteFightId === fightToDelete.id}
                onClick={() => setFightToDelete(null)}
              >
                {hubText("fightTrackerI18n.cancel")}
              </button>
              <button
                type="button"
                className={styles.dangerAction}
                disabled={pendingDeleteFightId === fightToDelete.id}
                onClick={handleConfirmFightDelete}
              >
                <Trash2 size={16} aria-hidden />
                {hubText("fightTrackerI18n.deletePermanently")}
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
      ? hubText("fightTrackerI18n.defenseNotSupported")
      : session?.review.reportType === "uncertain"
        ? hubText("fightTrackerI18n.unclear")
        : hubText("fightTrackerI18n.attack");

  const renderMemberReviewRows = (members: TrackerRow[]) =>
    members.map((member) => {
      const state = session?.review.memberStates[member.id] ?? "not_detected";
      return (
        <div key={member.id} className={styles.memberReviewRow}>
          <div className={styles.memberReviewName}>
            <strong>{member.name}</strong>
            <span>{formatMemberClassName(member.className)}{member.active ? "" : hubText("fightTrackerI18n.inactive")}</span>
          </div>
          <div className={styles.reviewStateButtons} role="group" aria-label={hubText("fightTrackerI18n.reviewStatus", { name: member.name })}>
            <button
              type="button"
              className={`${styles.reviewStateButton} ${state === "confirmed" ? styles.reviewStateActive : ""}`}
              onClick={() => onMemberStateChange(member.id, "confirmed")}
            >
              {hubText("fightTrackerI18n.confirmed")}
            </button>
            <button
              type="button"
              className={`${styles.reviewStateButton} ${state === "uncertain" ? styles.reviewStateActive : ""}`}
              onClick={() => onMemberStateChange(member.id, "uncertain")}
            >
              {hubText("fightTrackerI18n.uncertain")}
            </button>
            <button
              type="button"
              className={`${styles.reviewStateButton} ${state === "not_detected" ? styles.reviewStateActive : ""}`}
              onClick={() => onMemberStateChange(member.id, "not_detected")}
            >
              {hubText("fightTrackerI18n.notDetected")}
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
            <h2>{hubText("fightTrackerI18n.fightReportScreenshots")}</h2>
            <p>{hubText("fightTrackerI18n.localImportSessionForTheSameFightReport")}</p>
          </div>
        </div>
        {session ? (
          <button type="button" className={styles.secondaryAction} onClick={onClearSession}>
            <RotateCcw size={15} aria-hidden />
            {hubText("fightTrackerI18n.reset")}
          </button>
        ) : null}
      </div>

      <label className={styles.filePicker}>
        <FileImage size={18} aria-hidden />
        <span>{hubText("fightTrackerI18n.selectImages")}</span>
        <input type="file" accept="image/*" multiple onChange={onSelectScreenshots} />
      </label>

      {session ? (
        <>
          <div className={styles.scanBar}>
            <button type="button" className={styles.secondaryAction} disabled={!canScan} onClick={onScanScreenshot}>
              <Search size={15} aria-hidden />
              {hubText("fightTrackerI18n.scanScreenshot")}
            </button>
            {session.screenshots.length > 1 ? (
              <span className={styles.scanNotice}>{hubText("fightTrackerI18n.oCRV1ScansOnlyTheFirstSelectedImage")}</span>
            ) : null}
            {scanState.message || scanState.status === "scanning" ? (
              <span className={`${styles.scanNotice} ${scanState.status === "error" ? styles.scanError : ""}`}>
                {scanState.status === "scanning"
                  ? scanState.message === "OCR wird lokal vorbereitet..."
                    ? hubMessage(scanState.message)
                    : scanState.message ? hubText("fightTrackerI18n.ocrStage", { stage: hubMessage(scanState.message), percent: hubPercent(scanState.progress) }) : hubText("fightTrackerI18n.ocrRunning", { percent: hubPercent(scanState.progress) })
                  : hubMessage(scanState.message)}
              </span>
            ) : null}
          </div>
          {scanState.status === "scanning" ? (
            <div className={styles.scanProgress} aria-label={hubText("fightTrackerI18n.oCRProgress")}>
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
                  aria-label={hubText("fightTrackerI18n.removeName", { name: screenshot.name })}
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
                <h2>{hubText("fightTrackerI18n.importReview")}</h2>
                <p>{hubText("fightTrackerI18n.reviewCounts", { confirmed: confirmedCount, uncertain: uncertainCount })}</p>
              </div>
            </div>

            {session.review.ocrNotice ? (
              <div className={session.review.reportType === "unsupported_defense" ? styles.warningBanner : styles.scanResultBanner}>
                {session.review.reportType === "unsupported_defense" ? <AlertTriangle size={16} aria-hidden /> : <Check size={16} aria-hidden />}
                <span>{session.review.ocrNotice.split(/(?<=\.) /).map(hubMessage).join(" ")}</span>
              </div>
            ) : null}

            <div className={styles.reviewGrid}>
              <label className={styles.field}>
                <span>{hubText("fightTrackerI18n.date")}</span>
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
                <span>{hubText("fightTrackerI18n.fight")}</span>
                <select
                  value={session.review.fightNumber}
                  onChange={(event) => onReviewChange({ fightNumber: normalizeFightNumber(event.target.value) })}
                >
                  <option value="1">{hubText("fightTrackerI18n.fight1")}</option>
                  <option value="2">{hubText("fightTrackerI18n.fight2")}</option>
                </select>
              </label>
              {fightCreationOrderIssue ? (
                <div className={styles.slotWarning}>
                  <AlertTriangle size={16} aria-hidden />
                  <span>{hubText("fightTrackerI18n.orderIssue", { issue: hubMessage(fightCreationOrderIssue) })}</span>
                </div>
              ) : reviewSlotFights.length ? (
                <div className={styles.slotWarning}>
                  <AlertTriangle size={16} aria-hidden />
                  <span>
                    {hubText("fightTrackerI18n.slotExists", { number: session.review.fightNumber, date: formatDate(session.review.date), opponent: reviewSlotFights[0]?.opponentGuild ? ` (${reviewSlotFights[0].opponentGuild})` : "" })}
                  </span>
                </div>
              ) : reviewDefaultFightNumber ? (
                <div className={styles.slotHint}>{hubText("fightTrackerI18n.freeSlot", { number: reviewDefaultFightNumber })}</div>
              ) : (
                <div className={styles.slotWarning}>
                  <AlertTriangle size={16} aria-hidden />
                  <span>{hubText("fightTrackerI18n.bothFightSlotsForThisDayAreOccupiedSelectFight1OrFight2ToReplace")}</span>
                </div>
              )}
              <div className={styles.reviewReadOnly}>
                <span>{hubText("fightTrackerI18n.fightType")}</span>
                <strong>{reportTypeLabel}</strong>
              </div>
              <label className={styles.field}>
                <span>{hubText("fightTrackerI18n.opposingGuild")}</span>
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
                <h3>{hubText("fightTrackerI18n.missingMembers")}</h3>
                {rows.length ? (
                  <>
                    {hasScanResult ? (
                      highlightedRows.length ? (
                        <div className={styles.memberReviewList}>{renderMemberReviewRows(highlightedRows)}</div>
                      ) : (
                        <div className={styles.reviewEmpty}>{hubText("fightTrackerI18n.noConfirmedMissingMembersDetectedInTheTrackerRoster")}</div>
                      )
                    ) : null}
                    <details className={styles.manualReviewDetails} open={!hasScanResult}>
                      <summary>{hubText("fightTrackerI18n.manualCorrection")}</summary>
                      <div className={styles.memberReviewList}>{renderMemberReviewRows(rows)}</div>
                    </details>
                  </>
                ) : (
                  <div className={styles.reviewEmpty}>{hubText("fightTrackerI18n.noTrackerMembersYet")}</div>
                )}
              </div>

              <div className={styles.reviewSection}>
                <h3>{hubText("fightTrackerI18n.oCRNamesWithoutAReliableMatch")}</h3>
                {session.review.unknownNames.length || session.review.uncertainNames.length ? (
                  <ul className={styles.unknownList}>
                    {session.review.uncertainNames.map((name) => (
                      <li key={`uncertain-${name}`}>
                        <span>{name} {hubText("fightTrackerI18n.uncertain")}</span>
                        <button type="button" className={styles.inlineButton} onClick={() => onAddUnknownName(name)}>
                          {hubText("fightTrackerI18n.add")}
                        </button>
                      </li>
                    ))}
                    {session.review.unknownNames.map((name) => (
                      <li key={name}>
                        <span>{name}</span>
                        <button type="button" className={styles.inlineButton} onClick={() => onAddUnknownName(name)}>
                          {hubText("fightTrackerI18n.add")}
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
                {hubText("fightTrackerI18n.saveReviewAsFight")}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.importEmpty}>{hubText("fightTrackerI18n.noLocalScreenshotSessionActive")}</div>
      )}
    </section>
  );
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return `${hubNumber(0)} KB`;
  if (size < 1024 * 1024) return `${hubNumber(Math.max(1, Math.round(size / 1024)))} KB`;
  return `${hubNumber(size / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
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
  useAnalyticsView("datahub/fight/participation");
  const [sortKey, setSortKey] = React.useState<ParticipationSortKey>("guildRole");
  const [sortDirection, setSortDirection] = React.useState<ParticipationSortDirection>("desc");
  const [showInactiveMembers, setShowInactiveMembers] = React.useState(true);
  const [swipeTogether, setSwipeTogether] = React.useState(false);
  const [sharedFightWindowOffset, setSharedFightWindowOffset] = React.useState(0);
  const [memberFightWindowOffsets, setMemberFightWindowOffsets] = React.useState<Record<string, number>>({});
  const [sharedFightWindowDirection, setSharedFightWindowDirection] = React.useState<MobileFightWindowDirection | null>(null);
  const [memberFightWindowDirections, setMemberFightWindowDirections] = React.useState<Record<string, MobileFightWindowDirection | null>>({});
  const [isExportOverlayOpen, setIsExportOverlayOpen] = React.useState(false);
  useAnalyticsView(isExportOverlayOpen ? "datahub/fight/participation-export" : null);
  const [exportType, setExportType] = React.useState<ParticipationExportType>("simple");
  const [exportMonth, setExportMonth] = React.useState(getMonthInputValue);
  const [showFormerMembersInExport, setShowFormerMembersInExport] = React.useState(false);
  const [exportBusyAction, setExportBusyAction] = React.useState<ParticipationExportBusyAction | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [participationExportPreview, setParticipationExportPreview] = React.useState<ParticipationExportPreview | null>(null);
  const [isExportPreviewOpen, setIsExportPreviewOpen] = React.useState(false);
  useAnalyticsView(isExportPreviewOpen ? "datahub/fight/participation-preview" : null);
  const exportRef = React.useRef<HTMLDivElement | null>(null);
  const participationExportPreviewUrlRef = React.useRef<string | null>(null);
  const participationMouseDragStateRef = React.useRef<ParticipationMouseDragState | null>(null);
  const suppressNextParticipationClickRef = React.useRef(false);
  const suppressParticipationClickTimerRef = React.useRef<number | null>(null);
  const mobileSwipeStateRef = React.useRef<MobileFightSwipeState | null>(null);
  const suppressedMobileClickMembersRef = React.useRef<Set<string>>(new Set());
  const subtitle = fights.length ? hubText("fightTrackerI18n.savedFights", { count: fights.length }) : hubText("fightTrackerI18n.noFightsCreatedYet");
  const emptyMessage = fights.length
    ? hubText("fightTrackerI18n.emptyMembersWithFights", { count: fights.length })
    : hubText("fightTrackerI18n.noMembersInTheFightTrackerYet");
  const sortOptions: Array<{ key: ParticipationSortKey; label: string }> = [
    { key: "guildRole", label: hubText("fightTrackerI18n.guildRank") },
    { key: "name", label: hubText("fightTrackerI18n.name") },
    { key: "baseStats", label: hubText("fightTrackerI18n.baseStats") },
    { key: "totalStats", label: hubText("fightTrackerI18n.totalStats") },
    { key: "level", label: hubText("dataHubI18n.level") },
    { key: "missed", label: hubText("fightTrackerI18n.missedFights") },
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
    !showInactiveMembers && participationRows.length ? hubText("fightTrackerI18n.noActiveMembersVisible") : emptyMessage;

  const sortedRows = React.useMemo(
    () => sortParticipationRows(visibleParticipationRows, sortKey, sortDirection),
    [sortDirection, sortKey, visibleParticipationRows],
  );
  useRuntimeAuditCommit(participationRows, participationRows.length > 0, "fight-participation-derived");
  useRuntimeAuditCommit(sortedRows, sortedRows.length > 0, "fight-participation-table");
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
      locale: hubLocale(),
      fileBaseName: exportFileBaseName,
      url: URL.createObjectURL(rendered.blob),
    };
  }, [exportCacheKey, exportFileBaseName, exportType]);
  const getCurrentParticipationExportPreview = React.useCallback(async () => {
    if (participationExportPreview?.cacheKey === exportCacheKey && participationExportPreview.locale === hubLocale()) return participationExportPreview;
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
 const __w32Run1=auditBegin("F25","handlePreviewParticipationExport");
  auditFields(__w32Run1, { consumerArea: "Kampftracking", trigger: "preview-handler" });
 const __w32Sync=null;
 try {
    if (isExportingParticipation || !canExportParticipation) return auditReturn(__w32Run1,undefined);
    setExportBusyAction("preview");
    setExportError(null);
    try {
      await auditValue(__w32Run1,auditEnter(__w32Run1,"getCurrentParticipationExportPreview"),getCurrentParticipationExportPreview());
      setIsExportPreviewOpen(true);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "PNG-Vorschau konnte nicht erzeugt werden.");
      setIsExportPreviewOpen(false);
    } finally {
      setExportBusyAction(null);
    }

} catch (__w32Error) { auditError(__w32Run1,__w32Error); throw __w32Error; } finally {auditValue(__w32Run1,__w32Sync,undefined);auditLeave(__w32Run1);}
};
  const handleExportParticipation = async () => {
 const __w32Run2=auditBegin("F25","handleExportParticipation");
  auditFields(__w32Run2, { consumerArea: "Kampftracking", trigger: "export-handler" });
 const __w32Sync=null;
 try {
    if (isExportingParticipation || !canExportParticipation) return auditReturn(__w32Run2,undefined);
    setExportBusyAction("download");
    setExportError(null);
    try {
      const currentPreview = await auditValue(__w32Run2,auditEnter(__w32Run2,"getCurrentParticipationExportPreview"),getCurrentParticipationExportPreview());
      downloadPngUrl(currentPreview.url, currentPreview.fileBaseName);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "PNG konnte nicht erzeugt werden.");
    } finally {
      setExportBusyAction(null);
    }

} catch (__w32Error) { auditError(__w32Run2,__w32Error); throw __w32Error; } finally {auditValue(__w32Run2,__w32Sync,undefined);auditLeave(__w32Run2);}
};
  const participationTableStyle = {
    "--participation-table-width": `${PARTICIPATION_STICKY_COLUMN_WIDTH_PX + fights.length * PARTICIPATION_FIGHT_COLUMN_WIDTH_PX}px`,
  } as React.CSSProperties;

  return (
    <section className={styles.tablePanel}>
      <div className={styles.tableHeader}>
        <div>
          <h2>{hubText("fightTrackerI18n.participation")}</h2>
          <p>{subtitle}</p>
        </div>
        <div className={styles.tableHeaderActions}>
          <div className={styles.tableSortControls}>
            <label className={styles.tableSortField}>
              <span>{hubText("fightTrackerI18n.sortBy")}</span>
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
              aria-label={sortDirection === "asc" ? hubText("fightTrackerI18n.sortAscending") : hubText("fightTrackerI18n.sortDescending")}
              title={sortDirection === "asc" ? hubText("fightTrackerI18n.ascending") : hubText("fightTrackerI18n.descending")}
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
              <span>{hubText("fightTrackerI18n.formerGuildMembers")}</span>
            </label>
            {isCompactLayout ? (
              <label className={styles.tableToggleField}>
                <input
                  type="checkbox"
                  checked={swipeTogether}
                  onChange={(event) => handleSwipeTogetherChange(event.target.checked)}
                />
                <span>{hubText("fightTrackerI18n.swipeTogether")}</span>
              </label>
            ) : null}
          </div>
          <button type="button" className={styles.secondaryAction} onClick={() => setIsExportOverlayOpen(true)}>
            <Download size={16} aria-hidden />
            {hubText("fightTrackerI18n.export")}
          </button>
          <button
            type="button"
            className={styles.applyDraftButton}
            disabled={!hasStatusDrafts || isApplyingStatusDrafts}
            onClick={() => void onApplyStatusDrafts()}
          >
            {hubText("fightTrackerI18n.applyChange")}
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
                  <th className={`${styles.stickyColumn} ${styles.stickyMemberColumn}`}>{hubText("fightTrackerI18n.member")}</th>
                  <th className={`${styles.stickyColumn} ${styles.stickyMissedColumn}`}>{hubText("fightTrackerI18n.missed")}</th>
                  <th className={`${styles.stickyColumn} ${styles.stickyQuoteColumn}`}>{hubText("fightTrackerI18n.absenceRate")}</th>
                  <th className={`${styles.stickyColumn} ${styles.stickyLastMissedColumn}`}>{hubText("fightTrackerI18n.lastMissedFight")}</th>
                  <th className={`${styles.stickyColumn} ${styles.stickyStreakColumn}`}>{hubText("fightTrackerI18n.streak")}</th>
                  {fights.map((fight) => (
                    <th key={fight.id} className={styles.fightHead}>
                      <span>{hubText("fightTrackerI18n.fight")} {fight.fightNumber}</span>
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
                    level != null ? hubText("fightTrackerI18n.levelValue", { value: level }) : null,
                    !member.active ? hubText("fightTrackerI18n.noLongerInCurrentGuild") : null,
                  ].filter((entry): entry is string => Boolean(entry));

                  return (
                    <tr key={member.id} className={member.active ? undefined : styles.inactiveRow}>
                      <td className={`${styles.stickyColumn} ${styles.stickyMemberColumn} ${styles.memberCell}`}>
                        <div className={styles.memberName}>{member.name}</div>
                        <div className={styles.memberMeta}>{memberMetaParts.join(" · ")}</div>
                      </td>
                      <td className={`${styles.stickyColumn} ${styles.stickyMissedColumn}`}>{hubNumber(missed)}</td>
                      <td className={`${styles.stickyColumn} ${styles.stickyQuoteColumn}`}>{formatQuote(missed, evaluated)}</td>
                      <td className={`${styles.stickyColumn} ${styles.stickyLastMissedColumn}`}>
                        {lastMissedFight ? formatDate(lastMissedFight.date) : "—"}
                      </td>
                      <td className={`${styles.stickyColumn} ${styles.stickyStreakColumn}`}>
                        {streakStatus ? formatStreak(streakStatus, streakCount) : "—"}
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
                              aria-label={hubText("fightTrackerI18n.memberFightStatus", { name: member.name, fight: formatDate(fight.date), status: hubText("fightTrackerI18n." + (status === "ok" ? "oK" : status === "missed" ? "absent" : "notDetected")) })}
                            >
                              {status === "unknown" ? (
                                "?"
                              ) : (
                                <>
                                  {status === "missed" ? <XCircle size={15} aria-hidden /> : <Check size={15} aria-hidden />}
                                  {status === "missed" ? hubText("fightTrackerI18n.absent") : hubText("fightTrackerI18n.oK")}
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
              const streakLabel = streakStatus ? formatStreak(streakStatus, streakCount) : null;
              const memberMetaParts = [
                formatMemberClassName(member.className),
                level != null ? hubText("fightTrackerI18n.levelValue", { value: level }) : null,
                streakLabel,
                !member.active ? hubText("fightTrackerI18n.noLongerInCurrentGuild") : null,
              ].filter((entry): entry is string => Boolean(entry));

              return (
                <article key={member.id} className={`${styles.mobileParticipationMember} ${member.active ? "" : styles.mobileParticipationInactive}`}>
                  <div className={styles.mobileParticipationSummary}>
                    <div className={styles.mobileParticipationName}>
                      <strong>{member.name}</strong>
                      <span>{memberMetaParts.join(" · ")}</span>
                    </div>
                    <div className={styles.mobileParticipationMetric}>
                      <span>{hubText("fightTrackerI18n.missed")}</span>
                      <strong>{hubNumber(missed)}</strong>
                    </div>
                    <div className={styles.mobileParticipationMetric}>
                      <span>{hubText("fightTrackerI18n.absenceRate")}</span>
                      <strong>{formatQuote(missed, evaluated)}</strong>
                    </div>
                    <div className={styles.mobileParticipationMetric}>
                      <span>{hubText("fightTrackerI18n.missedFight")}</span>
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
                        aria-label={hubText("fightTrackerI18n.olderFightsFor", { name: member.name })}
                        title={hubText("fightTrackerI18n.olderFights")}
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
                                aria-label={hubText("fightTrackerI18n.memberFightStatus", { name: member.name, fight: formatDate(fight.date), status: hubText("fightTrackerI18n." + (status === "ok" ? "oK" : status === "missed" ? "absent" : "notDetected")) })}
                              >
                                {status === "unknown" ? "?" : status === "missed" ? hubText("fightTrackerI18n.absent") : hubText("fightTrackerI18n.oK")}
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
                        aria-label={hubText("fightTrackerI18n.newerFightsFor", { name: member.name })}
                        title={hubText("fightTrackerI18n.newerFights")}
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
          subtitle={hubText("fightTrackerI18n.monthFights", { month: formatMonthLabel(exportMonth), count: exportMonthFights.length })}
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
    <FunctionOverlay title={hubText("fightTrackerI18n.exportParticipation")} subtitle={hubText("fightTrackerI18n.monthFights", { month: formatMonthLabel(exportMonth), count: fightCount })} onClose={onClose}>
      <section className={styles.exportPanel}>
        <div className={styles.exportModeControl} role="group" aria-label={hubText("fightTrackerI18n.exportType")}>
          <button
            type="button"
            className={`${styles.exportModeButton} ${exportType === "simple" ? styles.exportModeButtonActive : ""}`}
            onClick={() => onExportTypeChange("simple")}
          >
            {hubText("fightTrackerI18n.simple")}
          </button>
          <button
            type="button"
            className={`${styles.exportModeButton} ${exportType === "detailed" ? styles.exportModeButtonActive : ""}`}
            onClick={() => onExportTypeChange("detailed")}
          >
            {hubText("fightTrackerI18n.detailed")}
          </button>
        </div>

        <div className={styles.exportOptionsGrid}>
          <label className={styles.field}>
            <span>{hubText("fightTrackerI18n.month")}</span>
            <input type="month" value={exportMonth} onChange={(event) => onExportMonthChange(event.target.value)} />
          </label>
          <label className={styles.tableToggleField}>
            <input
              type="checkbox"
              checked={showFormerMembers}
              onChange={(event) => onShowFormerMembersChange(event.target.checked)}
            />
            <span>{hubText("fightTrackerI18n.showFormerGuildMembers")}</span>
          </label>
        </div>

        <div className={styles.exportSummaryStrip}>
          <InfoPill label={hubText("fightTrackerI18n.fightsThisMonth")} value={hubNumber(fightCount)} />
          <InfoPill label={hubText("fightTrackerI18n.membersInExport")} value={hubNumber(memberCount)} />
        </div>

        {duplicateSlotCount ? (
          <div className={styles.slotWarning}>
            <AlertTriangle size={16} aria-hidden />
            <span>
              {hubText("fightTrackerI18n.multipleSavedFightsOccupyTheSameDailySlotInTheSelectedMonthExportIsBlockedToAvoidSilentlyHidingAFight")}
            </span>
          </div>
        ) : null}
        {exportError ? <div className={styles.warningBanner}>{hubMessage(exportError)}</div> : null}

        <div className={styles.exportActions}>
          <button type="button" className={styles.secondaryAction} onClick={onClose}>
            {hubText("fightTrackerI18n.cancel")}
          </button>
          <button type="button" className={styles.secondaryAction} disabled={!canExport || isExporting} onClick={onPreview}>
            <FileImage size={16} aria-hidden />
            {exportBusyAction === "preview" ? hubText("fightTrackerI18n.creatingPreview") : hubText("fightTrackerI18n.preview")}
          </button>
          <button type="button" className={styles.primaryAction} disabled={!canExport || isExporting} onClick={onExport}>
            <Download size={16} aria-hidden />
            {exportBusyAction === "download" ? hubText("fightTrackerI18n.creatingExport") : hubText("fightTrackerI18n.createExport")}
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
      title={hubText("fightTrackerI18n.participationPreview")}
      subtitle={subtitle}
      dialogClassName={styles.exportPreviewDialog}
      bodyClassName={styles.exportPreviewDialogBody}
      onClose={onClose}
    >
      <section className={styles.exportPreviewPanel}>
        <div className={styles.exportPreviewControls}>
          <button type="button" className={styles.secondaryAction} onClick={() => stepZoom("out")} aria-label={hubText("fightTrackerI18n.zoomOut")} disabled={zoom <= PARTICIPATION_EXPORT_PREVIEW_MIN_ZOOM}>
            -
          </button>
          <button type="button" className={styles.secondaryAction} onClick={() => stepZoom("in")} aria-label={hubText("fightTrackerI18n.zoomIn")} disabled={zoom >= PARTICIPATION_EXPORT_PREVIEW_MAX_ZOOM}>
            +
          </button>
          <button type="button" className={styles.secondaryAction} onClick={() => setZoom(1)}>
            {hubPercent(1)}
          </button>
          <button type="button" className={styles.secondaryAction} onClick={fitWidth}>
            {hubText("fightTrackerI18n.fitToWidth")}
          </button>
          <button type="button" className={styles.primaryAction} onClick={onDownload}>
            <Download size={16} aria-hidden />
            {hubText("fightTrackerI18n.downloadExport")}
          </button>
        </div>
        <div className={styles.exportPreviewViewer} ref={viewerRef}>
          <img
            alt={hubText("fightTrackerI18n.participationExportPreview")}
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
            <p>{hubText("fightTrackerI18n.fightParticipation")}</p>
            <h2>{tracker.name}</h2>
            <span>{monthLabel}</span>
          </div>
          <div className={styles.exportReportStats}>
            <strong>{hubNumber(fights.length)}</strong>
            <span>{hubText("fightTrackerI18n.fights")}</span>
            {exportType === "detailed" ? (
              <>
                <strong>{hubNumber(rows.length)}</strong>
                <span>{hubText("fightTrackerI18n.member")}</span>
              </>
            ) : null}
          </div>
        </header>
      )}

      {exportType === "detailed" ? (
        <>
          <section className={styles.exportBlock}>
            <div className={styles.exportBlockHeader}>
              <h3>{hubText("fightTrackerI18n.guildActivity")}</h3>
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
            <ExportHighlightCard title={hubText("fightTrackerI18n.mostMissedFights")} value={maxMissed ? hubText("fightTrackerI18n.missedCount", { count: maxMissed }) : "-"} rows={mostMissedRows} />
            <ExportHighlightCard title={hubText("fightTrackerI18n.longestAttendanceStreak")} value={bestStreak ? hubText("fightTrackerI18n.streakPresent", { count: bestStreak }) : "-"} rows={bestStreakRows} />
            <ExportHighlightCard title={hubText("fightTrackerI18n.noFightsMissed")} value={hubNumber(perfectRows.length)} rows={perfectRows} />
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
          {emblemUrl ? <img src={emblemUrl} alt={hubText("fightTrackerI18n.emblem", { name: guildName })} /> : <span aria-hidden />}
        </div>
        <div className={styles.exportSimpleGuildText}>
          <p>{hubText("fightTrackerI18n.fightParticipation")}</p>
          <h2>{guildName}</h2>
          <span>{monthLabel}</span>
        </div>
      </div>
      <ExportSimpleGuildActivity days={activityDays} />
      <div className={styles.exportSimpleGuildMetrics}>
        <div>
          <strong>{hubNumber(fightCount)}</strong>
          <span>{hubText("fightTrackerI18n.fights")}</span>
        </div>
        <div>
          <strong>{formatParticipationRate(participationRate)}</strong>
          <span>{hubText("fightTrackerI18n.averageAttendance")}</span>
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
      aria-label={hubText("fightTrackerI18n.guildActivityThisMonth")}
    >
      <div className={styles.exportGuildActivityTitle}>{hubText("fightTrackerI18n.guildActivity")}</div>
      <div className={styles.exportGuildActivityTimeline}>
        <div className={styles.exportGuildActivityDays} style={gridStyle}>
          {days.map((day) => (
            <span key={day.date}>{String(day.day).padStart(2, "0")}</span>
          ))}
        </div>
        {FIGHT_SLOTS.map((slot) => (
          <React.Fragment key={slot}>
            <span className={styles.exportGuildActivityFightLabel}>{hubText("fightTrackerI18n.fightShort")}{slot}</span>
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
                    ? `${formatParticipationRate(fight.rate)} (${hubNumber(fight.ok)}/${hubNumber(fight.evaluated)})`
                    : hubText("fightTrackerI18n.notEvaluated")
                  : hubText("fightTrackerI18n.noFight");
                return (
                  <span
                    key={`${day.date}-${slot}`}
                    className={`${styles.exportGuildActivityDay} ${levelClass}`}
                    title={hubText("fightTrackerI18n.activityTitle", { number: slot, date: formatDate(day.date), value: valueLabel })}
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
      <span>{hubText("fightTrackerI18n.member")}</span>
      <span>{hubText("fightTrackerI18n.missed")}</span>
      <span>{hubText("fightTrackerI18n.absenceRate")}</span>
      <span>{hubText("fightTrackerI18n.lastMissedFight")}</span>
      <span>{hubText("fightTrackerI18n.streak")}</span>
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
    row.level != null ? hubText("fightTrackerI18n.levelValue", { value: row.level }) : null,
    !row.member.active ? hubText("fightTrackerI18n.noLongerInCurrentGuild") : null,
  ].filter((entry): entry is string => Boolean(entry));

  return (
    <article className={`${styles.exportSimpleMemberBlock} ${row.member.active ? "" : styles.exportMemberInactive}`}>
      <div className={styles.exportSimpleRow}>
        <div className={`${styles.exportMemberIdentity} ${styles.exportSimpleMemberIdentity}`}>
          <strong>
            {row.member.name}
            {hasPerfectMonthParticipation(row) ? (
              <span className={styles.exportPerfectMarker} title={hubText("fightTrackerI18n.noFightsMissed")}>
                ★
              </span>
            ) : null}
          </strong>
          {memberMetaParts.length ? <span>{memberMetaParts.join(" · ")}</span> : null}
        </div>
        <strong>{hubNumber(row.missed)}</strong>
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
        const statusLabel = status === "ok" ? hubText("fightTrackerI18n.oK") : status === "missed" ? hubText("fightTrackerI18n.absent") : "?";
        return (
          <div
            key={fight.id}
            className={styles.exportSimpleFightBlock}
            title={hubText("fightTrackerI18n.activityTitle", { number: fight.fightNumber, date: formatDate(fight.date), value: statusLabel })}
          >
            <span className={`${styles.exportSimpleFightCell} ${statusClass}`} />
            <strong>{formatShortDate(fight.date)} · {hubText("fightTrackerI18n.fightShort")}{fight.fightNumber}</strong>
          </div>
        );
      })}
    </div>
  );
}

function ExportMemberSummary({ row }: { row: ParticipationDerivedRow }) {
  const memberMetaParts = [
    formatMemberClassName(row.member.className),
    row.level != null ? hubText("fightTrackerI18n.levelValue", { value: row.level }) : null,
    !row.member.active ? hubText("fightTrackerI18n.noLongerInCurrentGuild") : null,
  ].filter((entry): entry is string => Boolean(entry));

  return (
    <div className={styles.exportMemberSummary}>
      <div className={styles.exportMemberIdentity}>
        <strong>{row.member.name}</strong>
        <span>{memberMetaParts.join(" · ")}</span>
      </div>
      <ExportMetric label={hubText("fightTrackerI18n.missed")} value={hubNumber(row.missed)} />
      <ExportMetric label={hubText("fightTrackerI18n.absenceRate")} value={formatQuote(row.missed, row.evaluated)} />
      <ExportMetric label={hubText("fightTrackerI18n.lastMissedFight")} value={row.lastMissedFight ? formatDate(row.lastMissedFight.date) : "-"} />
      <ExportMetric label={hubText("fightTrackerI18n.streak")} value={formatStreak(row.streakStatus, row.streakCount)} />
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
              title={hubText("fightTrackerI18n.activityTitle", { number: slot, date: formatDate(date), value: rate == null ? hubText("fightTrackerI18n.notEvaluated") : hubPercent(rate) })}
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
            title={hubText("fightTrackerI18n.activityTitle", { number: slot, date: formatDate(date), value: status === "ok" ? hubText("fightTrackerI18n.oK") : status === "missed" ? hubText("fightTrackerI18n.absent") : "?" })}
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
