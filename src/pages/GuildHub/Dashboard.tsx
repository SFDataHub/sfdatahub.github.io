import { profileLocale, profilePercent, profileText, profileDateTime } from "../../lib/i18n/profilePresentation";
import { guildChartAvailableTimes } from "./dashboardChartWindow";
import DashboardChartRange, { guildChartRangeStart, type GuildChartRangeSelection, type GuildChartRangeControl } from "./DashboardChartRange";
import { CompareDisplay } from "./DashboardCompareChart";
import { sharedAnalyticsPreparation, type AnalyticsPreparationLease } from "../../lib/local-player-profile/sharedPreparation";
import { guildViewEvents, useAnalyticsView } from "../../lib/analytics/localEvents";
import { preferencesStore } from "../../lib/settings/preferences";
import { useProfileAttributeSumMode } from "../../lib/settings/usePreferences";
import { projectLocalGuildMembers } from "./localGuildPlayerStats";
import { serverComparisonKey } from "../../lib/servers/serverResolver";
import { auditBegin, auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditDiscard, auditCaught, auditAccept, auditResultId, auditRecordedEvent, associateAuditResultId, auditObserveInputs, auditFields } from "../../lib/data-hub/runtimeAudit";
import { buildGuildAnalyticsFusionMarkers, type GuildAnalyticsFusionMarker } from "../../lib/guilds/guildAnalyticsFusionMarkers";
import { buildDashboardCompareEmblems } from "./dashboardCompareEmblems";
import { startSharedGuildTrendRun, analyticsSummaryKey } from "../../lib/local-player-profile/cardTrendExecution";
import React from "react";
import { useRuntimeAuditCommit } from "../../lib/data-hub/useRuntimeAuditCommit";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { DATA_HUB, parseObservation, safeLocalReturn } from "../../lib/data-hub/routes";
import ContentShell from "../../components/ContentShell";
import type { ClassSelection } from "../../data/classes";
import GuildTrendChart, { getGuildTrendMetric, type GuildTrendChartMetric } from "../../components/guild-trend/GuildTrendChart";
import GuildDashboardLoadingState from "./GuildDashboardLoadingState";
import LocalTitleNavigation from "../../components/ui/shared/LocalTitleNavigation";
import { getClassMetaById, type ClassMeta } from "../../data/classes";
import { SERVER_BY_ID } from "../../data/servers";
import {
  getGuildHubLocalScan,
  selectGuildHubRawSnapshot,
  isGuildHubScanAnalyticsEnabled,
  listGuildHubScanSummaries,
  type GuildHubLocalGuildIdentity,
  type GuildHubLocalScan,
  type GuildHubScanSummary,
} from "../../lib/guilds/localScanLibrary";
import { normalizeGuildScanMembersCooperatively, type NormalizedGuildMember } from "../../lib/guilds/guildScanNormalizer";
import { calculateGuildActivityPct } from "../../lib/guilds/guildActivity";
import { readDeclaredMemberCount } from "../../lib/guilds/guildCoverage";
import type { GuildAnalyticsMemberSnapshot } from "../../lib/guilds/localGuildAnalyticsStore";
import { guildObservationIdentifierCandidates, confirmedGuildObservationsMatch, resolveObservedGuildIdentity } from "../../lib/identities/guildObservationIdentity";
import { classifyDashboardTransfers } from "./dashboardTransfersModel";
import {
  loadIdentityResolutionSnapshot,
  resolvePlayerIdentity,
  revalidateIdentityResolutionSnapshot,
  type IdentityResolutionSnapshot,
} from "../../lib/identities/identityResolution";
import {
  type LocalPlayerIndexProgress,
} from "../../lib/player-search/localPlayerIndexClient";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import { useScanAgeDays } from "../../lib/ui/useScanAgeDays";
import { getScanAgeDays } from "../../lib/ui/formatScanDateTimeLabel";
import type { GuildTrendBuildResult } from "../Playground/playerPerformanceModel";
import {
  type PlayerPerformanceProgress,
  type PlayerPerformanceWorkerRun,
} from "../Playground/playerPerformanceWorkerClient";
import { useLocalProfileNavigation } from "../../lib/data-hub/profileNavigation";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, subscribeToLocalDataDependencies, createAnalyticsScopeMatcher } from "../../lib/local-data/localDataDependencies";
import { matchesLocalSourceValidity } from "../../lib/guilds/localSourceValidity";
import { readGuildScanMemberIdentity } from "../../lib/guilds/guildScanNormalizer";
import { isLocalPlayerSourceContextValid, type LocalPlayerSourceContext } from "./localPlayerCurrentSeed";

import { acquireProfileArchiveHistory } from "../../lib/scanArchive/profileHistoryAcquisition";
import { subscribeToScanArchiveMetadata } from "../../lib/scanArchive/client";
import { startDashboardMemberComparison } from "./dashboardMemberComparisonClient";
import { acquireDashboardLocalFirstFeatureScans } from "./dashboardLocalFirst";
import {
  buildDashboardStaticPlayerCardItems,
  sortDashboardMembers,
} from "./dashboardPlayerCards";
import { rankingMemberSelection, toggleMemberSelection } from "./dashboardMemberChartModel";
import GuildScanDetailsOverlay from "./GuildScanDetailsOverlay";
import { summarizeScanIdentities, type ScanIdentityContext, type ScanIdentitySummary } from "./dashboardScanIdentity";
import type { ScanArchiveEntry } from "../../lib/scanArchive/types";
import DashboardGuildCard, { type DashboardGuildCardKpi } from "./DashboardGuildCard";
import LocalGuildPlayerStats from "../../components/guilds/LocalGuildPlayerStats";
import GuildClassDistributionPie from "../../components/guilds/GuildClassOverview/GuildClassDistributionPie";
import { averageLocalGuildMemberField, readLocalGuildMemberValues, type LocalGuildPlayerStats as LocalGuildPlayerStatsValues, type LocalGuildStatsMember } from "./localGuildPlayerStats";

import { useGuildHubSelection, type GuildHubSelectedGuild } from "./hooks/useGuildHubSelection";
import { useDashboardMemberComparison } from "./useDashboardMemberComparison";
import { type DashboardMemberMode, type LocalGuildRankingComparison } from "./localGuildRanking";
import { useHubFavorites } from "../../lib/data-hub/useHubFavorites";
import { localPlayerObservationFavorite } from "../../lib/data-hub/hubFavoritesProjection";
import { favoriteReference, referenceKey } from "../../lib/data-hub/hubFavoritesContract";
import { createHubToplistTarget } from "../../lib/data-hub/hubTargetResolver";
import DashboardTransfers, { type DashboardTransfersHandle } from "./DashboardTransfers";
import { buildCurrentTransferGuildLookupCooperatively, buildTransferGuildLookup, resolveTransferGuildStatus, selectTransferGuildStands, readTransferGuildStands, type TransferGuildStand, type TransferGuildLookup } from "./dashboardTransferGuilds";
import DashboardChartDetails, { DashboardCompareChart, ChartDetailButton } from "./DashboardChartDetails";
import { buildDashboardGuildTrendIntervals, buildDashboardGuildComparison, type DashboardGuildComparison } from "./dashboardGuildComparison";
import { dashboardModeMetrics, buildDashboardHistory, type DashboardHistory, type DashboardHistoryMetric } from "./dashboardHistory";
import styles from "./Dashboard.module.css";
import cardStyles from "./DashboardGuildCard.module.css";
import LocalGuildProfileActions from "../../components/guilds/LocalGuildProfileActions";
// Preserve the hero/HUD-to-page stylesheet order when loading the extracted member views.
import DashboardMembersPanel, { DashboardClassIcon as ClassIcon, type LocalMember, type DashboardPlayerCardsState, type DashboardCompareMembers } from "./DashboardMembersPanel";

import { collectDashboardComparisonDiagnostic, type DashboardComparisonEvidence } from "./dashboardComparisonDiagnostic";

const EMPTY_ARCHIVE_ENTRIES: readonly ScanArchiveEntry[] = [];
const EMPTY_SELECTED_CLASSES: readonly string[] = [];

type JsonRecord = Record<string, unknown>;


type LocalGuildScanView = {
  guildContextId: string;
  context: LocalPlayerSourceContext;
  source: DashboardGuildSource;
  scannedAtMs: number;
  scannedAtIso: string | null;
  guild: {
    name: string | null;
    server: string | null;
    memberCount: number | null;
    declaredMemberCount: number | null;
    hofRank: number | null;
  };
  members: LocalMember[];
  playerLookup: Map<string, JsonRecord>;
};

type DashboardGuildSource = {
  guildIdentifier?: string | null;
  sourceScanId: string;
  sourceFilename: string;
  scannedAtMs: number;
  scannedAtIso: string | null;
  guild: {
    name: string | null;
    server: string | null;
    memberCount: number | null;
    hofRank: number | null;
    coaString?: string | null;
  };
};

type ComparisonStatus = "not-requested" | "loading" | "ready" | "empty" | "error";

type ScanState = {
  generation?: number;
  transferDependencies?: import("../../lib/local-data/localDataDependencies").LocalDependencyReceipt;
  requestKey: string;
  loadingCoaString?: string | null;
  comparisonStatus: ComparisonStatus;
  summaries: GuildHubScanSummary[];
  sources: DashboardGuildSource[];
  latest: LocalGuildScanView | null;
  comparisonMembers: LocalMember[] | null;
  comparisonGuilds: TransferGuildLookup | null;
  transferGuildStands?: TransferGuildStand[];
  currentGuilds: TransferGuildLookup | null;
  identities: IdentityResolutionSnapshot | null;
  scanIdentityContexts?: ScanIdentityContext[];
  identityContextStatus?: ScanIdentityContext["status"];
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
};

type GuildTrendState = {
  guildId?: string;
  result: GuildTrendBuildResult | null;
  history?: import("../../lib/local-player-profile/cardTrendExecution").GuildTrendHistory;
  progress: PlayerPerformanceProgress | null;
  loading: boolean;
  error: string | null;
  requestKey?: string;
};


type DashboardArchiveInventoryState = {
  guildContextId?: string;
  demandKey?: string;
  archiveEntries?: readonly ScanArchiveEntry[];
  archiveScanCount: number | null;
  loading: boolean;
  error: string | null;
};

type TransferSummary = {
  joined: LocalMember[];
  left: LocalMember[];
};

export default function GuildHubDashboard({ overlay = false, onClose, onGoToProfile }: {
  overlay?: boolean; onClose?: () => void; onGoToProfile?: () => void;
} = {}) {
  const { t } = useTranslation();
  const selection = useGuildHubSelection("guild-dashboard");
  const { activeGuild } = selection;
  const overviewLocation = useLocation();
  const currentScans = useDashboardScans(activeGuild, selection.observation);
  const [comparisonSelection, setComparisonSelection] = React.useState<{ guildId: string; stand: NonNullable<import("./dashboardMemberComparison").DashboardMemberComparisonRequest["selectedComparison"]> } | null>(null);
  const requestedComparison = comparisonSelection && comparisonSelection.guildId === activeGuild?.id ? comparisonSelection.stand : null;

  const attributeSumMode = useProfileAttributeSumMode();
  const latest = currentScans.latest?.guildContextId === activeGuild?.id ? currentScans.latest : null;
  const currentStatsMembers = React.useMemo(
    () => latest?.members.map((member) => ({ ...member, playerStats: member.playerStats ?? readLocalGuildMemberValues(null) })) ?? [],
    [latest],
  );
  const displayLatest = React.useMemo(() => latest ? { ...latest, members: projectLocalGuildMembers(latest.members, attributeSumMode) } : null, [latest, attributeSumMode]);
  const displayStatsMembers = React.useMemo(() => projectLocalGuildMembers(currentStatsMembers, attributeSumMode), [currentStatsMembers, attributeSumMode]);
  const [chartRangeSelection, setChartRangeSelection] = React.useState<{ guildId: string; value: GuildChartRangeSelection } | null>(null);
  const chartRangeValue = chartRangeSelection && chartRangeSelection.guildId === activeGuild?.id ? chartRangeSelection.value : "12months";
  const chartWindow = React.useMemo(() => latest ? { startMs: guildChartRangeStart(chartRangeValue, latest.scannedAtMs), endMs: latest.scannedAtMs } : undefined, [chartRangeValue, latest?.scannedAtMs]);
  const archiveInventoryState = useDashboardLocalFirstAcquisition(activeGuild, latest, chartWindow, requestedComparison);
  const chartRange: GuildChartRangeControl = {
    value: chartRangeValue, times: guildChartAvailableTimes(currentScans.sources, currentScans.summaries, latest?.scannedAtMs ?? 0),
    onChange: value => { if (activeGuild) setChartRangeSelection({ guildId: activeGuild.id, value }); },
  };
  const historyMemberRefs = React.useMemo(() => latest?.members.map(member => member.localRef?.identifier ?? member.key).sort() ?? [], [latest]);
  const guildTrendState = useDashboardGuildTrend(latest ? activeGuild : null, currentScans.summaries, historyMemberRefs, chartWindow);
  const history = React.useMemo(() => buildDashboardHistory(guildTrendState.history, latest?.members ?? [], guildTrendState.result?.guild?.identifier ?? activeGuild?.logoIdentifier ?? "", latest?.scannedAtMs ?? 0, attributeSumMode), [attributeSumMode, guildTrendState.history, guildTrendState.result?.guild?.identifier, latest?.members, latest?.scannedAtMs, activeGuild?.logoIdentifier]);
  const comparisonHistory = React.useMemo(() => buildDashboardGuildComparison(guildTrendState.history, activeGuild?.server ?? "", guildTrendState.result?.guild?.identifier ?? activeGuild?.logoIdentifier ?? "", latest?.scannedAtMs ?? 0, latest?.source.sourceScanId, attributeSumMode), [attributeSumMode, guildTrendState.history, guildTrendState.result?.guild?.identifier, activeGuild?.server, activeGuild?.logoIdentifier, latest?.scannedAtMs, latest?.source.sourceScanId]);
  const classDistribution = React.useMemo(() => buildClassDistribution(latest?.members ?? []), [latest?.members]);
  // Resolve the saved default only on a new guild opening. Data/preference updates
  // within this opening leave the existing shared mode and all profile state intact.
  const guildOpening = activeGuild?.id ?? null;
  const [modeSelection, setModeSelection] = React.useState(() => ({ guildOpening, mode: preferencesStore.refresh().guildProfileMode }));
  let memberMode = modeSelection.mode;
  if (modeSelection.guildOpening !== guildOpening) {
    memberMode = preferencesStore.refresh().guildProfileMode;
    setModeSelection({ guildOpening, mode: memberMode });
  }
  const setMemberMode = (mode: DashboardMemberMode) => setModeSelection({ guildOpening, mode });
  // The overlay entry includes its initial mode, even before guild data is ready.
  useAnalyticsView(overlay || activeGuild ? guildViewEvents[memberMode] : null, !overlay);
  // Keep the local width choice through the existing current-scan loading gap.
  // The panel owns its renders; width clicks never rerender the data consumers.
  const memberWidthPreference = React.useRef<{ guildId: string; narrow: boolean } | null>(null);
  React.useEffect(() => { memberWidthPreference.current = null; }, [activeGuild?.id]);
  const transfersRef = React.useRef<DashboardTransfersHandle>(null);
  const closeTransfersOnCompactActivation = React.useCallback(() => transfersRef.current?.close(), []);
  const [memberSelection, setMemberSelection] = React.useState<{ guildId: string; keys: string[] } | null>(null);
  const selectedMemberKeys = React.useMemo(() => memberSelection?.guildId === activeGuild?.id
    ? memberSelection?.keys.filter(key => latest?.members.some(member => member.key === key)) ?? [] : [], [memberSelection, activeGuild?.id, latest?.members]);
  const selectedMemberKey = rankingMemberSelection(selectedMemberKeys);
  React.useEffect(() => setMemberSelection(null), [activeGuild?.id]);
  React.useEffect(() => {
    if (!latest) return;
    setMemberSelection(current => {
      if (!current || current.guildId !== activeGuild?.id) return current;
      const keys = current.keys.filter(key => latest.members.some(member => member.key === key));
      return keys.length === current.keys.length ? current : { ...current, keys };
    });
  }, [latest, activeGuild?.id]);
  const toggleMember = (key: string) => {
    if (activeGuild && latest?.members.some(member => member.key === key)) setMemberSelection(current => ({ guildId: activeGuild.id,
      keys: toggleMemberSelection(current?.guildId === activeGuild.id ? current.keys : [], key) }));
  };
  const selectMember = (member: LocalMember) => toggleMember(member.key);
  const [classFilter, setClassFilter] = React.useState<{ guildId: string; labels: string[] } | null>(null);
  const selectedClasses = classFilter?.guildId === activeGuild?.id ? classFilter?.labels ?? EMPTY_SELECTED_CLASSES : EMPTY_SELECTED_CLASSES;
  const rankingClass = selectedClasses;
  React.useEffect(() => setClassFilter(null), [activeGuild?.id]);
  React.useEffect(() => {
    if (!latest) return;
    setClassFilter(current => {
      if (!current || current.guildId !== activeGuild?.id) return current;
      const labels = current.labels.filter(label => latest.members.some(member => member.classLabel?.trim() === label));
      return labels.length === current.labels.length ? current : labels.length ? { ...current, labels } : null;
    });
  }, [latest, activeGuild?.id]);
  const toggleClass = (label: string) => {
    if (!activeGuild) return;
    setClassFilter(current => {
      const previous = current?.guildId === activeGuild.id ? current.labels : EMPTY_SELECTED_CLASSES;
      const labels = previous.includes(label) ? previous.filter(value => value !== label) : [...previous, label];
      return labels.length ? { guildId: activeGuild.id, labels } : null;
    });
  };
  const comparisonInput = React.useMemo(() => latest && activeGuild ? {
    selectedComparison: requestedComparison, diagnostic: import.meta.env.DEV, summaries: currentScans.summaries, currentSourceId: latest.source.sourceScanId, currentTimestamp: latest.scannedAtMs,
    currentGuildIdentifier: latest.source.guildIdentifier, currentDeclaredMemberCount: latest.guild.declaredMemberCount,
    guild: { name: activeGuild.name, server: activeGuild.server, logoIdentifier: activeGuild.logoIdentifier }, members: currentStatsMembers,
  } : null, [latest, activeGuild, currentScans.summaries, currentStatsMembers, requestedComparison]);
  const memberComparison = useDashboardMemberComparison(comparisonInput, latest?.context ?? null, attributeSumMode, archiveInventoryState.loading, currentScans.identities && activeGuild ? resolveObservedGuildIdentity(currentScans.identities, activeGuild.logoIdentifier, activeGuild.server).identityId : null, !!archiveInventoryState.error);
  const comparisonOptions = React.useRef<{ guildId?: string; values: NonNullable<LocalGuildRankingComparison["options"]> }>({ values: [] });
  if (comparisonOptions.current.guildId !== activeGuild?.id) comparisonOptions.current = { guildId: activeGuild?.id, values: [] };
  if (memberComparison.options) comparisonOptions.current.values = memberComparison.options;
  const scanState = useDashboardTransferComparison(currentScans, activeGuild, memberComparison);
  const navigate = useNavigate(), favorites = useHubFavorites();
  const memberFavorite = React.useCallback((member: LocalMember) => latest ? localPlayerObservationFavorite({
    identifier: member.localRef?.identifier ?? null, name: member.name, server: member.localRef?.server ?? null,
    className: member.classLabel, levelLabel: member.level == null ? null : String(member.level), guildName: latest.guild.name,
    rawPlayer: latest.playerLookup.get(member.localRef?.sourcePlayerKey ?? ""), sourceScanId: latest.source.sourceScanId,
    sourcePlayerKey: member.localRef?.sourcePlayerKey ?? member.key, observedAtMs: latest.scannedAtMs,
  }) : null, [latest]);
  const savedMember = React.useCallback((member: LocalMember) => {
    const ref = favoriteReference("player", member.localRef?.identifier);
    return ref ? favorites.snapshot?.record.favorites.find(f => f.kind === "player" && f.originalReferences.some(r => referenceKey(r) === referenceKey(ref))) : undefined;
  }, [favorites.snapshot]);
  const memberActions = (member: LocalMember) => ({
    saved: !!savedMember(member), disabled: favorites.disabled || !member.localRef?.identifier,
    onFavorite: () => { const candidate = memberFavorite(member), saved = savedMember(member); if (candidate) void favorites.mutate(saved ? { type: "remove", id: saved.id } : { type: "save", favorite: candidate }); },
    onToplist: () => { const ref = favoriteReference("player", member.localRef?.identifier); if (!ref) return;
      const target = createHubToplistTarget("player", member.name, ref.serverNamespace, [ref.identifier]);
      navigate(target.path, { state: { ...target.state, returnTo: overviewLocation.pathname + overviewLocation.search } }); },
  });
  const profileNavigation = useLocalProfileNavigation("guild");
  const userScanCount = React.useMemo(
    () => countDashboardUserScans(scanState.sources, scanState.summaries),
    [scanState.sources, scanState.summaries],
  );
  const playerCardsState = useDashboardPlayerCards(latest);
  const comparison = React.useMemo(() => resolveDashboardComparisonSource(scanState, memberComparison), [memberComparison, scanState.sources, scanState.summaries]);
  const transfers = React.useMemo(() => {
    if (!latest || !comparison || !scanState.comparisonMembers) return null;
    return buildTransferSummary(latest.members, scanState.comparisonMembers, scanState.identities);
  }, [comparison, latest, scanState.comparisonMembers, scanState.identities]);
  const transferDisplay = React.useMemo(() => {
    if (!transfers || !latest) return transfers;
    const currentGuilds = scanState.currentGuilds;
    return {
      ...transfers,
      joined: transfers.joined.map(member => ({ ...member, transferGuild: resolveTransferGuildStatus(scanState.comparisonGuilds, member.key, scanState.identities) })),
      left: transfers.left.map(member => ({ ...member, transferGuild: resolveTransferGuildStatus(currentGuilds, member.key, scanState.identities) })),
    };
  }, [transfers, latest, scanState.comparisonGuilds, scanState.currentGuilds, scanState.identities]);
  const handleMemberClick = React.useCallback(
    (member: LocalMember) => {
      if (!latest || !activeGuild || !member.localRef) return;
      const rawPlayer = latest.playerLookup.get(member.localRef.sourcePlayerKey);
      if (!rawPlayer) return;
      const target = {
        sourceScanId: latest.source.sourceScanId,
        sourcePlayerKey: member.localRef.sourcePlayerKey,
        sourceMemberRef: member.localRef.identifier ?? (member.localRef.matchedByNameFallback ? null : member.localRef.sourcePlayerKey),
        scannedAtMs: latest.scannedAtMs,
        scannedAtIso: latest.scannedAtIso,
        guildRole: member.guildRole ?? null,
        guild: { ...latest.guild, identifier: activeGuild.logoIdentifier ?? activeGuild.guildId },
      };
      // Open the existing exact-observation route immediately. Its profile
      // worker reads the named source; the click never walks the full Raw scan.
      const identifier = readGuildScanMemberIdentity(rawPlayer, target.guild.server)?.memberRef ?? target.sourceMemberRef;
      if (identifier && target.guild.server) profileNavigation.openExact(identifier, target.guild.server,
        target.sourceScanId, target.scannedAtMs, target.sourcePlayerKey, undefined, latest.context.scan.contentHash);
    },
    [activeGuild, latest, profileNavigation.open, profileNavigation.openExact],
  );

  const diagnosticBasis = React.useRef<object | null>(null);
  const basis = React.useMemo(() => ({}), [scanState, memberComparison, activeGuild, overviewLocation.pathname, overviewLocation.search, transferDisplay, memberMode, selectedClasses]);
  diagnosticBasis.current = basis;
  React.useEffect(() => () => { diagnosticBasis.current = null; }, []);
  const collectComparisonDiagnostic = React.useCallback(async () => {
    if (!latest || !activeGuild) throw Error("comparison-unavailable");
    const evidence: DashboardComparisonEvidence = {
      generation: scanState.generation ?? 0, requestKey: scanState.requestKey, status: scanState.comparisonStatus,
      current: { sourceScanId: latest.source.sourceScanId, scannedAtMs: latest.scannedAtMs, guildIdentifier: latest.source.guildIdentifier },
      historical: comparison, currentMembers: latest.members, historicalMembers: scanState.comparisonMembers,
      identities: scanState.identities, dependencies: scanState.transferDependencies, currentDependencies: latest.context.dependencies,
      contexts: scanState.scanIdentityContexts ?? [], guildStands: scanState.transferGuildStands, currentGuilds: scanState.currentGuilds, historicalGuilds: scanState.comparisonGuilds,
      output: transferDisplay, worker: memberComparison, summaries: scanState.summaries,
      guild: { name: activeGuild.name, server: activeGuild.server, logoIdentifier: activeGuild.logoIdentifier },
      presentation: { mode: memberMode, selectedClasses },
    };
    const isCurrent = () => diagnosticBasis.current === basis;
    // Route parameters are whitelisted; no auth/query/session storage is read.
    const routeQuery = new URLSearchParams();
    const query = new URLSearchParams(overviewLocation.search);
    for (const key of ["source", "snapshot", "row", "at", "hash"]) if (query.has(key)) routeQuery.set(key, query.get(key)!);
    const result = await collectDashboardComparisonDiagnostic(evidence, isCurrent, {
      origin: window.location.origin, route: overviewLocation.pathname + (routeQuery.size ? `?${routeQuery}` : ""),
      modules: [import.meta.url, ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')).map(script => script.src)],
    });
    if (!isCurrent()) throw Error("comparison-context-changed");
    const rendered = {
      transferStatus: document.querySelector("[data-guild-transfers]")?.getAttribute("data-comparison-status") ?? null,
      transferCounts: Array.from(document.querySelectorAll("[data-transfer-summary-count]")).map(node => ({
        category: node.getAttribute("data-transfer-summary-count"), text: node.textContent })),
      // Only mounted guild cards are evidence of visible output; unmounted rows
      // remain covered by the worker matrix, never reported as DOM-verified.
      cards: Array.from(document.querySelectorAll("[data-member-card]")).map(card => ({
        key: card.getAttribute("data-member-card"), mode: card.getAttribute("data-member-mode"),
        metrics: Array.from(card.querySelectorAll("[data-member-metric]")).map(metric => ({
          category: metric.getAttribute("data-member-metric"), value: metric.querySelector("[data-member-value]")?.textContent ?? null,
          delta: metric.querySelector("[data-member-delta]")?.textContent ?? null,
          direction: metric.querySelector("[data-member-delta]")?.getAttribute("data-direction") ?? null,
        })),
      })),
    };
    return { text: JSON.stringify({ ...result, rendered }, null, 2), coherent: result.consistency.coherent, isCurrent };
  }, [basis, latest, activeGuild, scanState, comparison, transferDisplay, memberComparison, overviewLocation.pathname, overviewLocation.search, memberMode, selectedClasses]);
  const handleTransferMemberClick = React.useCallback((direction: "joined" | "left", key: string) => {
    const member = transfers?.[direction].find(entry => entry.key === key);
    if (!member || !latest) return;
    if (direction === "joined") {
      handleMemberClick(member);
      return;
    }
    if (!comparison) return;
    const summary = scanState.summaries.find(entry => entry.sourceScanId === comparison.sourceScanId);
    const server = member.server ?? comparison.guild.server;
    if (!server) return;
    // A departure is proven in the historical roster. Open that exact observed
    // player, even when the current scan no longer contains them.
    profileNavigation.openExact(member.key, server, comparison.sourceScanId, comparison.scannedAtMs, member.key, undefined, summary?.contentHash);
  }, [transfers, latest, comparison, scanState.summaries, handleMemberClick, profileNavigation.openExact]);

  const content = (
      <div className={styles.page}>
        {(!activeGuild || !latest || scanState.error || selection.targetError || selection.contextIssue) && <GuildOverviewTitle onClose={onClose} />}

        {selection.targetError ? (
          <EmptyPanel title={t("guildDashboardState.failed")} text={t(selection.targetError)} action={<button type="button" onClick={selection.retryTarget}>{t("localProfileRoute.retry")}</button>} />
        ) : selection.contextIssue ? (
          <EmptyPanel title={t("guildDashboardState.unavailable")} text={t(`pageContext.${selection.contextIssue}`)} />
        ) : selection.targetLoading || activeGuild && (scanState.loading || scanState.detailLoading) && !latest ? (
          <GuildDashboardLoadingState
            key={selection.loadingGuild ? `${selection.loadingGuild.server}:${selection.loadingGuild.logoIdentifier}:${selection.loadingGuild.id}` : "resolving"}
            guild={selection.loadingGuild}
            coaString={selection.loadingGuild?.coaString || scanState.loadingCoaString}
          />
        ) : !activeGuild ? (
          <EmptyPanel
            title={t("guildDashboardState.noTarget")}
            text={t("guildDashboardState.choose")}
            action={<Link to="/data-hub/guild-hub/dashboard">{t("guildProfile.heroPanel.sections.guildOverview")}</Link>}
          />
        ) : scanState.error ? (
          <EmptyPanel title={t("guildDashboardState.failed")} text={t(scanState.error)} />
        ) : !latest ? (
          <EmptyPanel
            title={t("guildDashboardState.noScans")}
            text={t("guildDashboardState.importHint")}
            action={<Link to="/data-hub/guild-hub/import">{t("guildDashboardState.import")}</Link>}
          />
        ) : (
          <div className={`${styles.dashboardGrid}${overlay ? ` ${styles.overlayGrid}` : ""}`} data-dashboard-selected-mode={memberMode}>
            <GuildOverviewCard
              onClose={onClose}
              guild={activeGuild}
              latest={displayLatest!}
              userScanCount={userScanCount}
              archiveInventoryState={archiveInventoryState}
              summaries={scanState.summaries}
              identities={scanState.identities}
              scanIdentityContexts={scanState.scanIdentityContexts ?? []}
              identityContextStatus={scanState.identityContextStatus ?? "not-checked"}
              transferComparison={scanState.comparisonStatus === "ready" ? comparison : null}
              transferStatus={scanState.comparisonStatus}
              memberComparison={memberComparison}
              collectComparisonDiagnostic={import.meta.env.DEV ? collectComparisonDiagnostic : undefined}
              rankingMembers={displayStatsMembers} rankingClass={rankingClass}
              compareMembers={{ members: displayLatest!.members, playerCardsState, comparison: memberComparison, actions: memberActions, onMemberClick: handleMemberClick }}
              chartRange={chartRange} trendState={guildTrendState} history={history} comparisonHistory={comparisonHistory}
              memberMode={memberMode} onMemberModeChange={setMemberMode}
              classDistribution={classDistribution} selectedClasses={selectedClasses} onToggleClass={toggleClass}
              onCompactActivate={closeTransfersOnCompactActivation}
            />
            <div className={styles.controlsSlot}>
              <LocalGuildProfileActions key={`${latest.guildContextId}:${latest.source.sourceScanId}:${latest.scannedAtMs}`}
                className={styles.profileActions} onGoToProfile={onGoToProfile}
                guild={{ ...activeGuild, ...latest.guild, guildId: latest.source.guildIdentifier ?? activeGuild.guildId,
                  name: latest.guild.name ?? activeGuild.name, server: latest.guild.server ?? activeGuild.server,
                  logoIdentifier: latest.source.guildIdentifier ?? activeGuild.logoIdentifier, coaString: latest.source.guild.coaString }}
                anchor={{ source: latest.source.sourceScanId, at: latest.scannedAtMs, hash: latest.context.scan.contentHash }} />
              <DashboardTransfers
                ref={transfersRef}
                key={`${latest.guildContextId}:${latest.source.sourceScanId}:${latest.context.scan.contentHash}:${latest.scannedAtMs}:${comparison?.sourceScanId}:${comparison?.scannedAtMs}:${scanState.summaries.find(summary => summary.sourceScanId === comparison?.sourceScanId)?.contentHash}`}
                transfers={transferDisplay}
                onMemberClick={handleTransferMemberClick}
                status={scanState.comparisonStatus}
                fromLabel={comparison ? profileDateTime(comparison.scannedAtIso) : null}
                toLabel={profileDateTime(latest.scannedAtIso)}
              />
              <label className={styles.comparisonScanSelect} data-guild-comparison-select>
                <span>{t("guildProfileRange.comparisonScan")}</span>
                <select value={requestedComparison ? JSON.stringify(requestedComparison) : "default"} onChange={event => setComparisonSelection(event.target.value === "default" ? null : { guildId: activeGuild.id, stand: JSON.parse(event.target.value) })}>
                  <option value="default">{t("guildProfileRange.comparisonDefault")}</option>
                  {comparisonOptions.current.values.map(stand => <option key={JSON.stringify(stand)} value={JSON.stringify(stand)}>{profileDateTime(new Date(stand.scannedAtMs).toISOString())} · {formatServerLabel(stand.guildIdentifier.replace(/_g[^_]+$/i, ""))}{comparisonOptions.current.values.some(other => other !== stand && other.scannedAtMs === stand.scannedAtMs && other.sourceScanId !== stand.sourceScanId) ? " · " + currentScans.summaries.find(summary => summary.sourceScanId === stand.sourceScanId)?.filename : ""}</option>)}
                </select>
              </label>
            </div>
            {!overlay && <div className={styles.detailsSlot} data-dashboard-details>
              <DashboardMembersPanel
                className={styles.membersSlot}
                guildId={activeGuild.id}
                widthPreference={memberWidthPreference}
                members={displayLatest!.members}
                playerCardsState={playerCardsState}
                selectedClasses={selectedClasses}
                mode={memberMode} comparison={memberComparison} actions={memberActions}
                selectedMemberKeys={selectedMemberKeys} onMemberSelect={selectMember}
                onMemberClick={handleMemberClick}
              />
              <div className={styles.historySlot}>
                <LocalGuildPlayerStats rankingClass={rankingClass} animateChanges members={displayStatsMembers} scope={latest.context} currentTimestamp={latest.scannedAtMs} comparison={memberComparison} mode={memberMode} selectedMemberKey={selectedMemberKey} onRequestRanking={() => {}} />
              </div>
            </div>}
            <KpiPanel history={history} members={latest.members} className={styles.classDistributionSlot} entries={classDistribution} selectedClasses={selectedClasses} onToggleClass={toggleClass} />
          </div>
        )}

      </div>
  );
  return overlay ? content : <ContentShell centerFramed={false}>{content}</ContentShell>;
}

function useDashboardScans(activeGuild: GuildHubSelectedGuild | null, observation: ReturnType<typeof parseObservation>): ScanState {
  // Only a target/observation change owns a new request. Metadata refreshes of
  // the same guild retain an already committed dashboard.
  const requestKey = JSON.stringify([activeGuild && [activeGuild.id, activeGuild.server, activeGuild.logoIdentifier, activeGuild.guildId], observation]);
  const [state, setState] = React.useState<ScanState>({
    requestKey, summaries: [], sources: [], latest: null, comparisonMembers: null, comparisonGuilds: null, currentGuilds: null, identities: null, comparisonStatus: "not-requested",
    loading: true, detailLoading: false, error: null,
  });
  React.useEffect(() => {
    let cancelled = false;
    let runId = 0;
    let committed: LocalGuildScanView | null = null;
    let sourceUnsubscribe = () => {}, watchedScope = "";
    const sourceScope = (identity: IdentityResolutionSnapshot | null, latest = committed) => {
      const guilds = [activeGuild?.logoIdentifier ?? "", ...(identity ? resolveObservedGuildIdentity(identity, activeGuild?.logoIdentifier, activeGuild?.server).aliasIdentifiers : [])];
      const players = latest?.members.flatMap(member => [member.localRef?.identifier ?? member.key,
        ...(identity ? resolvePlayerIdentity(identity, member.localRef?.identifier ?? member.key).aliasIdentifiers : [])]) ?? [];
      const servers = [...new Set([activeGuild?.server ?? "", ...guilds.map(id => id.replace(/_g[^_]+$/i, "")), ...players.map(id => id.replace(/_p[^_]+$/i, ""))])].filter(Boolean);
      return { servers, guilds, players };
    };
    const empty: ScanState = {
      requestKey, summaries: [], sources: [], latest: null, comparisonMembers: null, comparisonGuilds: null, currentGuilds: null, identities: null, comparisonStatus: "not-requested",
      loading: false, detailLoading: false, error: null,
    };
    setState({ ...empty, loading: Boolean(activeGuild) });
    if (!activeGuild) return;
    const load = async (trigger = "dashboard-load-effect") => {
    const __audit2 = auditBegin("F08", "load");
    auditFields(__audit2, { trigger, consumer: "dashboard-current-and-comparison" });
    try {
      const currentRunId = ++runId;
      const allowed = () => !cancelled && currentRunId === runId;
      // Historical refreshes retain the current component tree and its toggles.
      (auditValue(__audit2, auditEnter(__audit2, "state-enqueue:setState", "sync-elapsed"), (setState(current => ({ ...current, generation: currentRunId, loading: !committed, error: null })))));
      try {
        const [allSummaries, identityResolutionSnapshot] = await (auditValue(__audit2, auditEnter(__audit2, "Promise.all"), (Promise.all([
          listGuildHubScanSummaries({ auditContext: { trigger, consumer: "dashboard-current-and-comparison" } }),
          loadIdentityResolutionSnapshot().catch(error => {
            console.warn("[GuildHubDashboard] identity resolution unavailable for dashboard scan scope", error);
            return null;
          }),
        ]))));
        if (!allowed()) return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
        const scope = sourceScope(identityResolutionSnapshot);
        const summaries = allSummaries.filter(createAnalyticsScopeMatcher(scope));
        const sources = (auditValue(__audit2, auditEnter(__audit2, "buildDashboardGuildSources", "sync-elapsed"), (buildDashboardGuildSources(summaries, activeGuild, identityResolutionSnapshot))));
        if (observation.kind === "invalid") throw Error("Invalid guild observation anchor");
        const exact = observation.kind === "exact" ? observation.anchor : null;
        const anchoredSource = exact ? sources.find(source => source.sourceScanId === exact.source) : null;
        const anchoredSummary = exact ? summaries.find(summary => summary.sourceScanId === exact.source) : null;
        const currentSources = sources.filter(source => normalizeServerForCompare(source.guild.server) === normalizeServerForCompare(activeGuild.server));
        const latestSource = exact ? anchoredSource && anchoredSummary?.snapshotTimestamps.includes(exact.at) && (!exact.hash || anchoredSummary.contentHash === exact.hash)
          ? { ...anchoredSource, scannedAtMs: exact.at, scannedAtIso: new Date(exact.at).toISOString() } : null : currentSources[0] ?? null;
        if (exact && !latestSource) throw Error("Selected guild observation is missing or changed");
        if (!latestSource) {
          committed = null;
          (auditValue(__audit2, auditEnter(__audit2, "state-enqueue:setState", "sync-elapsed"), (setState({ ...empty, summaries, sources }))));
          return auditReturn(__audit2, undefined);
        }
        const summary = summaries.find(entry => entry.sourceScanId === latestSource.sourceScanId);
        let latest = committed;
        const reusable = latest && latest.source.sourceScanId === latestSource.sourceScanId &&
          latest.scannedAtMs === latestSource.scannedAtMs && matchesLocalSourceValidity(latest.context.scan, summary) &&
          await (auditValue(__audit2, auditEnter(__audit2, "isLocalPlayerSourceContextValid"), (isLocalPlayerSourceContextValid(latest.context))));
        if (!allowed()) return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
        if (!reusable) {
          committed = null;
          (auditValue(__audit2, auditEnter(__audit2, "state-enqueue:setState", "sync-elapsed"), (setState({ ...empty, summaries, sources, loadingCoaString: latestSource.guild.coaString, detailLoading: true }))));
          const dependencies = await (auditValue(__audit2, auditEnter(__audit2, "captureLocalDataDependencies"), (captureLocalDataDependencies({ sourceIds: [latestSource.sourceScanId] }))));
          if (!allowed()) return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
          const scan = await (auditValue(__audit2, auditEnter(__audit2, "getGuildHubLocalScan"), (getGuildHubLocalScan(latestSource.sourceScanId))));
          if (!allowed()) return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
          if (exact?.hash && scan?.contentHash !== exact.hash) throw Error("Selected guild source changed");
          const context = scan ? { scan, dependencies, coreLookup: new Map() } : null;
          if (!allowed()) return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
          latest = context && await (auditValue(__audit2, auditEnter(__audit2, "isLocalPlayerSourceContextValid"), (isLocalPlayerSourceContextValid(context))))
            ? await (auditValue(__audit2, auditEnter(__audit2, "buildGuildScanView", "async-container"), (buildGuildScanView(context.scan, activeGuild, latestSource, context, allowed)))) : null;
        }
        if (!allowed()) return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
        if (!latest) {
          (auditValue(__audit2, auditEnter(__audit2, "state-enqueue:setState", "sync-elapsed"), (setState({ ...empty, summaries, sources, error: "guildDashboardState.loadFailed" }))));
          return auditReturn(__audit2, undefined);
        }
        const currentValid = await (auditValue(__audit2, auditEnter(__audit2, "isLocalPlayerSourceContextValid"), (isLocalPlayerSourceContextValid(latest.context))));
        if (!allowed()) return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
        const identitiesValid = !identityResolutionSnapshot || await revalidateIdentityResolutionSnapshot(identityResolutionSnapshot) === identityResolutionSnapshot;
        if (!allowed()) return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
        if (!currentValid || !identitiesValid) {
          committed = null;
          (auditValue(__audit2, auditEnter(__audit2, "state-enqueue:setState", "sync-elapsed"), (setState({ ...empty, summaries, sources, error: "guildDashboardState.changed" }))));
          return auditReturn(__audit2, undefined);
        }
        committed = latest;
        const watchedNeed = { sourceScope: sourceScope(identityResolutionSnapshot, latest), sourceIds: summaries.map(summary => summary.sourceScanId) };
        const nextScope = JSON.stringify(watchedNeed);
        if (nextScope !== watchedScope) {
          sourceUnsubscribe(); watchedScope = nextScope;
          sourceUnsubscribe = subscribeToLocalDataDependencies(watchedNeed, cause => { void load(cause?.trigger ?? "source-dependency-change"); }, undefined, { consumer: "guild-dashboard-sources" });
        }
        auditAccept(__audit2, latest);
        (auditValue(__audit2, auditEnter(__audit2, "state-enqueue:setState", "sync-elapsed"), (setState(current => ({ ...empty, ...(reusable ? current : {}), generation: currentRunId, summaries, sources, latest, identities: identityResolutionSnapshot,
          identityContextStatus: identityResolutionSnapshot ? "ready" : "not-checked",
          scanIdentityContexts: identityResolutionSnapshot ? [{ stand: { ...latest.source, scannedAtMs: latest.scannedAtMs }, role: "current", status: "ready",
            summary: summarizeScanIdentities(latest.members, identityResolutionSnapshot, latest.source.guildIdentifier, latest.guild.declaredMemberCount),
            revisions: identityResolutionSnapshot.revisions, contentHash: latest.context.scan.contentHash }] : [],
          comparisonStatus: reusable ? current.comparisonStatus : "not-requested" })) )));
        // The member worker selects one eligible basis for every comparison consumer.
      } catch (error) { auditCaught(__audit2, error);
        if (!allowed()) return (__audit2 && auditDiscard(__audit2), auditReturn(__audit2, undefined));
        console.error("[GuildHubDashboard] failed to load current scan", error);
        committed = null;
        (auditValue(__audit2, auditEnter(__audit2, "state-enqueue:setState", "sync-elapsed"), (setState({ ...empty, error: "guildDashboardState.loadFailed" }))));
      }

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
};
    void load();
    sourceUnsubscribe = subscribeToLocalDataDependencies({ sourceScope: sourceScope(null) }, cause => { void load(cause?.trigger ?? "source-dependency-change"); }, undefined, { consumer: "guild-dashboard-sources" });
    const unsubscribeIdentity = subscribeToLocalDataDependencies({ allIdentities: true, guildAliases: [activeGuild.logoIdentifier] }, cause => { void load(cause?.trigger ?? "identity-dependency-change"); }, undefined, { consumer: "guild-dashboard-identities" });
    return () => { cancelled = true; runId++; sourceUnsubscribe(); unsubscribeIdentity(); };
  }, [requestKey]);
  useRuntimeAuditCommit(state.latest, !!state.latest && !state.loading, "guild-current");
  useRuntimeAuditCommit(state.comparisonMembers, state.comparisonStatus === "ready", "guild-history-comparison");
  return state.requestKey === requestKey ? state : {
    requestKey, summaries: [], sources: [], latest: null, comparisonMembers: null, comparisonGuilds: null, currentGuilds: null,
    identities: null, comparisonStatus: "not-requested", loading: Boolean(activeGuild), detailLoading: false, error: null,
  };
}


function resolveDashboardComparisonSource(base: Pick<ScanState, "sources" | "summaries">, comparison: LocalGuildRankingComparison): DashboardGuildSource | null {
  if (comparison.status !== "ready" || comparison.timestamp == null) return null;
  const source = base.sources.find(source => source.sourceScanId === comparison.sourceScanId);
  if (!source || !base.summaries.find(summary => summary.sourceScanId === source.sourceScanId)?.snapshotTimestamps.includes(comparison.timestamp)) return null;
  return { ...source, guildIdentifier: comparison.guildIdentifier, scannedAtMs: comparison.timestamp, scannedAtIso: new Date(comparison.timestamp).toISOString() };
}

function useDashboardTransferComparison(base: ScanState, activeGuild: GuildHubSelectedGuild | null, comparison: LocalGuildRankingComparison): ScanState {
  const [state, setState] = React.useState<ScanState>(base);
  const source = React.useMemo(() => resolveDashboardComparisonSource(base, comparison), [base.sources, base.summaries, comparison.status, comparison.sourceScanId, comparison.timestamp, comparison.guildIdentifier]);
  React.useEffect(() => {
    let cancelled = false;
    const allowed = () => !cancelled;
    const latest = base.latest;
    setState(current => current.latest === base.latest && current.comparisonStatus === "ready" &&
      current.scanIdentityContexts?.some(context => context.role === "transfer" && context.stand.sourceScanId === source?.sourceScanId && context.stand.scannedAtMs === source?.scannedAtMs)
      ? { ...current, summaries: base.summaries, sources: base.sources } :
      { ...base, comparisonStatus: source ? "loading" : comparison.status === "loading" ? "loading" : comparison.status === "error" ? "error" : "empty" });
    if (!latest || !source || !activeGuild) return () => { cancelled = true; };
    const runComparison = async (
      latest: LocalGuildScanView, source: DashboardGuildSource, summaries: GuildHubScanSummary[],
      allowed: () => boolean, identities: IdentityResolutionSnapshot | null,
    ) => {
    const __audit1 = auditBegin("F09", "runComparison");
    try {
      const context = latest.context;
      let dependencies: Awaited<ReturnType<typeof captureLocalDataDependencies>> | undefined;
      try {
        dependencies = await (auditValue(__audit1, auditEnter(__audit1, "captureLocalDataDependencies"), (captureLocalDataDependencies({ sourceIds: [source.sourceScanId], allIdentities: true }))));
        if (!allowed()) return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined));
        const members = await (auditValue(__audit1, auditEnter(__audit1, "readComparisonMembers"), (readComparisonMembers(source, activeGuild, summaries, identities))));
        if (!allowed()) return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined));
        const guildStands = selectTransferGuildStands(summaries,
          members.members ? classifyDashboardTransfers(latest.members, members.members, identities).joined.map(member => member.key) : [],
          identities, latest.scannedAtMs, { sourceScanId: source.sourceScanId, scannedAtMs: source.scannedAtMs, server: source.guild.server ?? "" });
        // Enlarge the receipt before acquiring additional sources, retaining the
        // original receipt until the already-read roster has been revalidated.
        const guildDependencies = await captureLocalDataDependencies({ sourceIds: [...new Set(guildStands.map(stand => stand.sourceScanId))], allIdentities: true });
        if (!allowed() || !(await revalidateLocalDataDependencies(dependencies)).current) return;
        dependencies = guildDependencies;
        const comparisonGuilds = await readTransferGuildStands(guildStands.slice(1), summaries, members.guilds, allowed);
        if (!allowed()) return;
        const snapshot = selectGuildHubRawSnapshot(context.scan, latest.scannedAtMs);
        const currentGuilds = snapshot ? await buildCurrentTransferGuildLookupCooperatively(snapshot, latest.guild.server, allowed) : null;
        if (!allowed()) return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined));
        const [currentValid, historicalValid] = await (auditValue(__audit1, auditEnter(__audit1, "Promise.all"), (Promise.all([
          isLocalPlayerSourceContextValid(context), revalidateLocalDataDependencies(dependencies),
        ]))));
        if (!allowed() || !currentValid || !historicalValid.current || (identities && await revalidateIdentityResolutionSnapshot(identities) !== identities) || !allowed()) return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined));
        auditAccept(__audit1, members.members);
        (auditValue(__audit1, auditEnter(__audit1, "state-enqueue:setState", "sync-elapsed"), (setState(current => current.latest?.context === context
          ? { ...current, comparisonMembers: members.members, comparisonGuilds, transferGuildStands: guildStands, currentGuilds, comparisonStatus: members.members ? "ready" : "empty", transferDependencies: dependencies,
            scanIdentityContexts: [...(current.scanIdentityContexts ?? []).filter(item => item.role !== "transfer"),
              { stand: source, role: "transfer", status: identities && members.identitySummary ? "ready" : "not-checked", summary: members.identitySummary,
                contentHash: summaries.find(summary => summary.sourceScanId === source.sourceScanId)?.contentHash, revisions: identities?.revisions, dependencies }] } : current))));
      } catch (error) { auditCaught(__audit1, error);
        if (!allowed()) return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined));
        const [currentValid, historicalValid] = await (auditValue(__audit1, auditEnter(__audit1, "Promise.all"), (Promise.all([
          isLocalPlayerSourceContextValid(context).catch(() => false),
          dependencies ? revalidateLocalDataDependencies(dependencies).catch(() => ({ current: false })) : Promise.resolve({ current: true }),
        ]))));
        if (!allowed() || !currentValid || !historicalValid.current) return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined));
        console.error("[GuildHubDashboard] failed to load comparison", error);
        (auditValue(__audit1, auditEnter(__audit1, "state-enqueue:setState", "sync-elapsed"), (setState(current => current.latest?.context === context
          ? { ...current, comparisonMembers: null, comparisonGuilds: null, currentGuilds: null, comparisonStatus: "error" } : current))));
      } finally {
        // A discarded dependency result also settles its own spinner. It does
        // not publish stale members or errors and cannot touch a newer job.
        if (allowed()) (auditValue(__audit1, auditEnter(__audit1, "state-enqueue:setState", "sync-elapsed"), (setState(current => current.latest?.context === context && current.comparisonStatus === "loading"
          ? { ...current, comparisonStatus: "not-requested" } : current))));
      }

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
};

    void runComparison(latest, source, base.summaries, allowed, base.identities);
    return () => { cancelled = true; };
  }, [base, activeGuild, source, comparison.status]);
  return state.latest === base.latest && (source ? state.comparisonStatus === "loading" || state.scanIdentityContexts?.some(context => context.role === "transfer" && context.stand.sourceScanId === source.sourceScanId && context.stand.scannedAtMs === source.scannedAtMs) : state.comparisonStatus !== "ready") ? state : { ...base, comparisonStatus: "loading" };
}

function useDashboardLocalFirstAcquisition(
  activeGuild: GuildHubSelectedGuild | null,
  latest: LocalGuildScanView | null,
  chartWindow: { startMs: number; endMs: number } | undefined,
  selectedComparison: import("./dashboardMemberComparison").DashboardMemberComparisonRequest["selectedComparison"],
): DashboardArchiveInventoryState {
  const location = useLocation();
  const historical = parseObservation(location.search).kind === "exact";
  const [state, setState] = React.useState<DashboardArchiveInventoryState>({ archiveScanCount: null, loading: false, error: null });
  const key = JSON.stringify([activeGuild?.id, activeGuild?.server, activeGuild?.logoIdentifier,
    latest?.source.sourceScanId, latest?.scannedAtMs, chartWindow, selectedComparison, historical]);
  React.useEffect(() => {
    if (!activeGuild) return;
    const controller = new AbortController(), signal = controller.signal;
    let running = false, pending = false;
    const load = async () => {
      pending = true;
      if (running) return;
      running = true;
      try {
        while (pending && !signal.aborted) {
          pending = false;
          setState(current => ({ ...current, guildContextId: activeGuild.id, demandKey: key, loading: true, error: null }));
          // The current observation has its own acquisition and may be published
          // before any history. Historical routes never advance their anchor.
          if (!historical) await acquireDashboardLocalFirstFeatureScans(activeGuild, { signal });
          if (signal.aborted) return;
          const reference = favoriteReference("guild", activeGuild.logoIdentifier ?? activeGuild.guildId, activeGuild.server);
          if (!latest || !reference) { setState({ guildContextId: activeGuild.id, demandKey: key, archiveScanCount: null, loading: false, error: null }); continue; }
          const history = await acquireProfileArchiveHistory(reference, latest.scannedAtMs, {
            signal, kind: "guild", from: chartWindow?.startMs, all: chartWindow?.startMs === 0,
            selectedAt: selectedComparison?.scannedAtMs,
            players: latest.members.map(member => member.localRef?.identifier ?? member.key),
            consumer: "guild-comparison-and-charts",
            comparisonReady: async () => {
              signal.throwIfAborted();
              const summaries = await listGuildHubScanSummaries();
              const run = startDashboardMemberComparison({ summaries, currentSourceId: latest.source.sourceScanId,
                currentTimestamp: latest.scannedAtMs, currentGuildIdentifier: latest.source.guildIdentifier,
                currentDeclaredMemberCount: latest.guild.declaredMemberCount,
                guild: { name: activeGuild.name, server: activeGuild.server, logoIdentifier: activeGuild.logoIdentifier },
                members: latest.members.map(member => ({ ...member, playerStats: member.playerStats ?? readLocalGuildMemberValues(null) })), selectedComparison });
              const cancel = () => run.cancel();
              signal.addEventListener("abort", cancel, { once: true });
              try {
                const result = await run.promise;
                signal.throwIfAborted();
                return result.comparison.status === "ready" && (selectedComparison != null ||
                  latest.scannedAtMs - (result.comparison.timestamp ?? latest.scannedAtMs) >= 28 * 86_400_000);
              } finally { signal.removeEventListener("abort", cancel); }
            },
          });
          if (signal.aborted) return;
          setState({ guildContextId: activeGuild.id, demandKey: key, archiveEntries: history.archiveEntries,
            archiveScanCount: countUniqueArchiveEntries(history.archiveEntries), loading: false, error: null });
        }
      } catch (error) {
        if (!signal.aborted) { console.warn("[GuildHubDashboard] archive demand failed", error);
          setState(current => ({ ...current, loading: false, error: "Archiv nicht verfuegbar" })); }
      } finally { running = false; }
    };
    const stop = subscribeToScanArchiveMetadata(() => { void load(); });
    void load();
    return () => { controller.abort(); stop(); };
  }, [key]);
  return state.guildContextId === activeGuild?.id && state.demandKey === key ? state : { archiveScanCount: null, archiveEntries: EMPTY_ARCHIVE_ENTRIES, loading: !!activeGuild, error: null };
}

function useDashboardPlayerCards(latest: LocalGuildScanView | null): DashboardPlayerCardsState {
  // The current source and its normalized cores already belong to the current
  // dashboard observation. There is no player-index/history consumer here.
  const items = React.useMemo(() => latest ? buildDashboardStaticPlayerCardItems({
    members: sortDashboardMembers(latest.members), playerLookup: latest.playerLookup,
    coreLookup: latest.context.coreLookup, developmentStatus: "unavailable",
  }) : [], [latest]);
  useRuntimeAuditCommit(items, items.length > 0, "guild-member-current-values");
  return { items, loading: false, progress: null, error: null };
}

function useDashboardGuildTrend(
  activeGuild: GuildHubSelectedGuild | null,
  summaries: GuildHubScanSummary[],
  memberRefs: readonly string[],
  chartWindow?: { startMs: number; endMs: number },
): GuildTrendState {
  const [state, setState] = React.useState<GuildTrendState>({
    result: null,
    progress: null,
    loading: false,
    error: null,
  });
  const preparationRef = React.useRef<AnalyticsPreparationLease>();
  React.useEffect(() => {
    preparationRef.current = sharedAnalyticsPreparation.acquire("visible");
    return () => { preparationRef.current?.release(); preparationRef.current = undefined; };
  }, [activeGuild?.id]);
  const activeRequestKeyRef = React.useRef<string | null>(null);
  const inventoryKey = React.useMemo(() => analyticsSummaryKey(summaries), [summaries]);
  const guildTarget = React.useMemo(
    () => ({
      guildId: activeGuild?.guildId,
      logoIdentifier: activeGuild?.logoIdentifier,
      server: activeGuild?.server,
    }),
    [activeGuild?.guildId, activeGuild?.logoIdentifier, activeGuild?.server],
  );
  const requestKey = React.useMemo(
    () => buildDashboardGuildTrendRequestKey(guildTarget, inventoryKey) + ":" + memberRefs.join(",") + ":" + JSON.stringify(chartWindow),
    [guildTarget, inventoryKey, memberRefs, chartWindow],
  );

  React.useEffect(() => {
    if (!activeGuild || !summaries.length) {
      activeRequestKeyRef.current = null;
      setState({ result: null, progress: null, loading: false, error: null });
      return undefined;
    }

    let cancelled = false;
    let workerRun: PlayerPerformanceWorkerRun | null = null;
    activeRequestKeyRef.current = requestKey;
    setState(current => ({ ...(current.guildId === activeGuild.id ? current : { result: null }), guildId: activeGuild.id, requestKey, progress: null, loading: true, error: null }));

    const deliver = (result: GuildTrendBuildResult) => { if (!cancelled && activeRequestKeyRef.current === requestKey) setState(current => ({ ...current, requestKey, result, progress: null, loading: false, error: null })); };
    const fail = (error: unknown) => { if (!cancelled && activeRequestKeyRef.current === requestKey) { console.error("[GuildHubDashboard] failed to build guild trend", error); setState(current => ({ ...current, requestKey, progress: null, loading: false, error: "Gildentrend konnte nicht berechnet werden." })); } };
    workerRun = startSharedGuildTrendRun({
      onRefresh: deliver, onError: fail, onInvalidating: () => { if (!cancelled) setState(current => ({ ...(current.guildId === activeGuild.id ? current : { result: null }), guildId: activeGuild.id, requestKey, progress: null, loading: true, error: null })); },
      summaries,
      guildTarget,
      sourceScope: "dashboard-guild",
      includeServerHistory: true,
      chartWindow, preparation: preparationRef.current,
      memberRefs,
      onHistory: history => { if (!cancelled && activeRequestKeyRef.current === requestKey) setState(current => ({ ...current, history })); },
      onProgress: (progress) => {
        if (!cancelled && activeRequestKeyRef.current === requestKey) {
          setState((current) => ({ ...current, progress }));
        }
      },
    });

    workerRun.promise
      .then(deliver).catch(fail);

    return () => {
      cancelled = true;
      if (activeRequestKeyRef.current === requestKey) activeRequestKeyRef.current = null;
      workerRun?.cancel();
    };
  }, [guildTarget, requestKey]);

  useRuntimeAuditCommit(state.result, !!state.result && !state.loading && !state.error, "guild-trend");
  return state.guildId === activeGuild?.id ? state : { result: null, progress: null, loading: Boolean(activeGuild), error: null };
}

function buildDashboardGuildTrendRequestKey(
  guildTarget: { guildId?: string | null; logoIdentifier?: string | null; server?: string | null },
  inventoryKey: string,
) {
  return [
    String(guildTarget.logoIdentifier ?? "").trim().toLowerCase(),
    String(guildTarget.guildId ?? "").trim().toLowerCase(),
    String(guildTarget.server ?? "").trim().toLowerCase(),
    inventoryKey,
  ].join(":");
}


function buildDashboardGuildSources(
  summaries: GuildHubScanSummary[],
  activeGuild: GuildHubSelectedGuild,
  identityResolutionSnapshot: Pick<IdentityResolutionSnapshot, "guilds"> | null = null,
): DashboardGuildSource[] {
    const __audit3 = auditPhaseBegin("buildDashboardGuildSources", undefined, "sync-elapsed");
    try {
  const sources = summaries.flatMap((summary) => {
    if (!isGuildHubScanAnalyticsEnabled(summary)) return [];
    const guild = summary.guilds.find((entry) => isSummaryGuildMatch(entry, activeGuild, identityResolutionSnapshot));
    if (!guild) return [];

    const scannedAt = resolveSummaryGuildScanTime(summary, guild);
    if (!scannedAt) return [];

    return [
      {
        guildIdentifier: guild.guildIdentifier,
        sourceScanId: summary.sourceScanId,
        sourceFilename: guild.sourceScanFilename ?? summary.filename,
        scannedAtMs: scannedAt.ms,
        scannedAtIso: scannedAt.iso,
        guild: {
          name: guild.name || activeGuild.name,
          server: guild.server || activeGuild.server,
          memberCount: guild.memberCount,
          hofRank: guild.hofRank,
          coaString: guild.coaString ?? activeGuild.coaString ?? null,
        },
      },
    ];
  });

  return auditReturn(__audit3, sources.sort(
    (a, b) =>
      b.scannedAtMs - a.scannedAtMs ||
      a.sourceFilename.localeCompare(b.sourceFilename, undefined, { sensitivity: "base" }) ||
      a.sourceScanId.localeCompare(b.sourceScanId),
  ));

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
}

function countDashboardUserScans(sources: DashboardGuildSource[], summaries: GuildHubScanSummary[]) {
  const summaryById = new Map(summaries.map((summary) => [summary.sourceScanId, summary]));
  return sources.filter((source) => !summaryById.get(source.sourceScanId)?.archiveSource).length;
}

function countUniqueArchiveEntries(entries: readonly { id: string }[]) {
  return new Set(entries.map((entry) => entry.id)).size;
}

async function readComparisonMembers(
  source: DashboardGuildSource,
  activeGuild: GuildHubSelectedGuild,
  summaries: GuildHubScanSummary[],
  identities: IdentityResolutionSnapshot | null = null,
): Promise<{ members: LocalMember[] | null; guilds: TransferGuildLookup; identitySummary?: ScanIdentitySummary }> {
    const __audit4 = auditPhaseBegin("readComparisonMembers", undefined, "async-container");
    try {
  const historicalGuild = { name: source.guild.name ?? "", server: source.guild.server ?? parseServerFromIdentifier(source.guildIdentifier) ?? "", logoIdentifier: source.guildIdentifier };
  const sameServer = normalizeServerForCompare(historicalGuild.server) === normalizeServerForCompare(activeGuild.server);
  const confirmed = identities && confirmedGuildObservationsMatch(identities, source.guildIdentifier, activeGuild.logoIdentifier ?? activeGuild.guildId, historicalGuild.server, activeGuild.server);
  if (!confirmed && !(sameServer && isSummaryGuildMatch({ ...historicalGuild, guildId: source.guildIdentifier ?? "", guildIdentifier: source.guildIdentifier ?? null }, activeGuild, identities))) throw Error("Historical guild identity changed");
  const { isDerivedMemberInGuild, ensureGuildAnalyticsSourceDataFromSummaries } = await (auditValue(__audit4, auditEnter(__audit4, "import"), (import("../../lib/guilds/localGuildAnalyticsStore"))));
  const result = await (auditValue(__audit4, auditEnter(__audit4, "ensureGuildAnalyticsSourceDataFromSummaries"), (ensureGuildAnalyticsSourceDataFromSummaries(
    summaries.filter(summary => summary.sourceScanId === source.sourceScanId),
    { loadSourceById: getGuildHubLocalScan, readSourceIds: [source.sourceScanId] },
  ))));
  const snapshotMembers = result.members.filter(member => member.sourceScanId === source.sourceScanId && member.snapshotTimestamp === source.scannedAtMs).sort((a, b) => a.id.localeCompare(b.id));
  const members = snapshotMembers
    .filter(member => member.sourceScanId === source.sourceScanId && member.snapshotTimestamp === source.scannedAtMs && isDerivedMemberInGuild(source.guildIdentifier ? { ...member, guildName: null } : member, historicalGuild))
    .map(toLocalMemberFromDerived);
  const guilds = buildTransferGuildLookup(snapshotMembers, result.guilds.filter(guild => guild.sourceScanId === source.sourceScanId && guild.snapshotTimestamp === source.scannedAtMs));
  const sourceReference = favoriteReference("guild", source.guildIdentifier, historicalGuild.server);
  const declarations = result.guilds.filter(guild => {
    const ref = favoriteReference("guild", guild.guildIdentifier ?? guild.guildSegment, guild.server);
    return guild.sourceScanId === source.sourceScanId && guild.snapshotTimestamp === source.scannedAtMs &&
      ref && sourceReference && referenceKey(ref) === referenceKey(sourceReference);
  }).map(guild => guild.declaredMemberCount);
  const declared = declarations.length && declarations.every(count => count === declarations[0]) ? declarations[0] : null;
  return auditReturn(__audit4, { members: members.length ? members : null, guilds,
    identitySummary: identities ? summarizeScanIdentities(members, identities, source.guildIdentifier, declared) : undefined });

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
}

function toLocalMemberFromDerived(member: GuildAnalyticsMemberSnapshot): LocalMember {
  const classMeta = getClassMetaById(member.classId);
  return {
    key: member.memberRef.toLowerCase(),
    name: member.name,
    server: member.server,
    classLabel: classMeta?.label ?? normalizeMemberClassLabel(member.classId),
    classMeta,
    level: member.level,
    honor: null,
    hofRank: null,
    baseMain: member.baseStats,
    totalStats: member.totalStats,
    lastScanMs: member.snapshotTimestamp,
    lastActivityMs: null,
  };
}

function isSummaryGuildMatch(
  guild: Pick<GuildHubLocalGuildIdentity, "guildIdentifier" | "guildId" | "name" | "server">,
  activeGuild: GuildHubSelectedGuild,
  identityResolutionSnapshot: Pick<IdentityResolutionSnapshot, "guilds"> | null = null,
) {
  const sourceRef = guild.guildIdentifier ?? guild.guildId;
  const targetRef = activeGuild.logoIdentifier ?? activeGuild.guildId;
  // A complete reference cannot be rescued by a contradictory server label.
  if ((/_g[^_]+$/i.test(sourceRef ?? "") && !collectDashboardGuildIdentifierCandidates(sourceRef, guild.server).length) ||
    (/_g[^_]+$/i.test(targetRef ?? "") && !collectDashboardGuildIdentifierCandidates(targetRef, activeGuild.server).length)) return false;
  if (identityResolutionSnapshot) {
    const source = resolveObservedGuildIdentity(identityResolutionSnapshot, guild.guildIdentifier ?? guild.guildId, guild.server);
    const target = resolveObservedGuildIdentity(identityResolutionSnapshot, activeGuild.logoIdentifier ?? activeGuild.guildId, activeGuild.server);
    if (source.resolved && target.resolved) return source.identityId === target.identityId;
  }
  const activeServer = normalizeServerForCompare(activeGuild.server) ?? normalizeServerForCompare(parseServerFromIdentifier(targetRef));
  const guildServer = normalizeServerForCompare(guild.server) ?? normalizeServerForCompare(parseServerFromIdentifier(sourceRef));
  const serverMatches = !activeServer || !guildServer || activeServer === guildServer;
  const activeGuildSegment = normalizeGuildSegment(activeGuild.guildId) ?? normalizeGuildSegment(activeGuild.logoIdentifier);
  const sourceGuildSegment = normalizeGuildSegment(guild.guildIdentifier) ?? normalizeGuildSegment(guild.guildId);

  if (activeGuildSegment && sourceGuildSegment && activeGuildSegment === sourceGuildSegment && serverMatches) {
    return true;
  }

  if (identityResolutionSnapshot && summaryGuildIdentityMatches(guild, activeGuild, identityResolutionSnapshot)) {
    return true;
  }

  return Boolean(guild.name && normalizeLoose(guild.name) === normalizeLoose(activeGuild.name) && serverMatches);
}

function summaryGuildIdentityMatches(
  guild: Pick<GuildHubLocalGuildIdentity, "guildIdentifier" | "guildId" | "name" | "server">,
  activeGuild: GuildHubSelectedGuild,
  identityResolutionSnapshot: Pick<IdentityResolutionSnapshot, "guilds">,
) {
  return confirmedGuildObservationsMatch(identityResolutionSnapshot,
    guild.guildIdentifier ?? guild.guildId, activeGuild.logoIdentifier ?? activeGuild.guildId,
    guild.server, activeGuild.server);
}

function collectDashboardGuildIdentifierCandidates(identifier: string | null | undefined, server: string | null | undefined) {
  return guildObservationIdentifierCandidates(identifier, server);
}

function resolveSummaryGuildScanTime(summary: GuildHubScanSummary, guild: GuildHubLocalGuildIdentity) {
  const guildTime = parseTimestampMs(guild.sourceScannedAt);
  if (guildTime != null) return { ms: guildTime, iso: new Date(guildTime).toISOString() };

  if (summary.lastSnapshotTimestamp != null && Number.isFinite(summary.lastSnapshotTimestamp)) {
    return { ms: summary.lastSnapshotTimestamp, iso: new Date(summary.lastSnapshotTimestamp).toISOString() };
  }

  const summaryTime = parseTimestampMs(summary.scannedAt);
  return summaryTime != null ? { ms: summaryTime, iso: new Date(summaryTime).toISOString() } : null;
}

function GuildOverviewTitle({ onClose }: { onClose?: () => void } = {}) {
  const { t } = useTranslation();
  const location = useLocation(), navigate = useNavigate();
  const target = safeLocalReturn(location.state?.returnTo);
  return <LocalTitleNavigation title={<h1 style={{ margin: 0, font: "inherit" }}>{t("guildProfile.heroPanel.sections.guildOverview")}</h1>}
    className={styles.divider} onBack={onClose ?? (() => navigate(target === location.pathname + location.search ? DATA_HUB : target ?? DATA_HUB,
      { state: location.state?.guildReturnState }))} />;
}

/** Keep the W-79 activation clearances and crest/status anchors; normal content stays in flow. */
function useCompactGuildHeader(
  ref: React.RefObject<HTMLDivElement>,
  target: HTMLDivElement | null,
  source: LocalPlayerSourceContext,
  onActivate: () => void,
) {
  React.useLayoutEffect(() => {
    const header = ref.current;
    const grid = header?.parentElement;
    const scroller = header?.closest<HTMLElement>("main");
    const normal = grid?.querySelector<HTMLElement>("[data-guild-expanded]");
    if (!header || !grid || !scroller || !normal || !target) return;
    const title = header.querySelector<HTMLElement>("[data-guild-title]")!;
    const body = normal.querySelector<HTMLElement>("[data-guild-header-body]")!;
    const hero = body.querySelector<HTMLElement>("[data-guild-hero]")!;
    const crest = body.querySelector<HTMLElement>("[data-guild-crest]")!;
    const hud = body.querySelector<HTMLElement>("[data-guild-scan-hud]")!;
    const toggle = body.querySelector<HTMLElement>("[data-member-mode-toggle]")!;
    const compactCrest = target.querySelector<HTMLElement>("[data-compact-crest]");
    const compactHud = target.querySelector<HTMLElement>("[data-compact-hud]");
    if (!compactCrest || !compactHud) return;
    const stand = compactHud.querySelector<HTMLElement>("[data-guild-scan-stand]")!;
    const details = compactHud.querySelector<HTMLElement>("[data-guild-scan-details-trigger]")!;
    const compactModes = target.querySelector<HTMLElement>("[data-compact-modes]")!;
    const compactChart = target.querySelector<HTMLElement>("[data-compact-chart]")!;
    const compactClasses = target.querySelector<HTMLElement>("[data-compact-classes]")!;
    const chartPanel = body.querySelector<HTMLElement>("[data-guild-trend]")!;
    const sharedControls = body.querySelector<HTMLElement>("[data-guild-shared-controls]")!;
    const groups = [compactCrest, compactHud, compactModes, compactChart, compactClasses];
    const surface = scroller.closest("section")!;
    const glow = surface.querySelector<SVGElement>(":scope > svg");
    let origin = 0, logoClearance = 0, statusClearance = 0, ready = false;
    const box = (element: Element) => element.getBoundingClientRect();
    const set = (name: string, value: number) => header.style.setProperty(name, `${value}px`);
    const paint = () => {
      const travel = scroller.scrollTop - origin;
      const next = travel >= logoClearance && travel > statusClearance;
      if (next === ready) return;
      ready = next;
      header.dataset.compactReady = String(ready);
      if (ready) onActivate();
      for (const group of groups) {
        // The CSS lead-in also uses visibility:hidden, so no hidden group can
        // acquire focus or intercept a pointer during its independent delay.
        if (!ready && group.contains(document.activeElement)) {
          (document.activeElement as HTMLElement).blur();
        }
        group.inert = !ready;
        group.setAttribute("aria-hidden", String(!ready));
      }
    };
    const measure = () => {
      const h = box(body), headerBox = box(header);
      const titleBox = box(title);
      const line = box(title.querySelector("[data-title-stripe]")!);
      const mobile = window.matchMedia("(max-width: 980px)").matches;
      const style = getComputedStyle(header);
      const padding = parseFloat(style.getPropertyValue("--head-compact-padding"));
      const metadata = box(body.querySelector<HTMLElement>("[data-guild-metadata]")!);
      sharedControls.style.setProperty("--metadata-mode-center", `${metadata.left + metadata.width / 2 - box(sharedControls).left}px`);
      const normalImage = crest.querySelector("img") ?? crest;
      const logo = box(normalImage), status = box(hud), modes = box(toggle);
      const smallLogo = Math.min(logo.width, parseFloat(style.getPropertyValue("--head-compact-logo-size")));
      const statusHeight = box(stand).height, actionHeight = box(details).height;
      const modeHeight = modes.height;
      const gap = mobile ? 0 : 4;
      const titleHeight = titleBox.height + parseFloat(getComputedStyle(normal).getPropertyValue("--overview-title-gap"));
      const rowTop = line.top - headerBox.top;
      const extraIcon = Math.max(0, (actionHeight - statusHeight) / 2);
      // Preserve the original band envelope before centring the whole group.
      const compactBody = Math.max(
        padding + (mobile ? modeHeight : 0) + smallLogo + gap + statusHeight + padding + extraIcon,
        padding + modeHeight + padding,
      );
      const height = titleHeight + compactBody;
      const groupHeight = smallLogo + gap + statusHeight + extraIcon;
      const crestTop = (rowTop + line.height + height - 2 - groupHeight) / 2;
      const statusTop = crestTop + smallLogo + gap;
      const modeLift = mobile ? Math.max(0, rowTop + padding + modeHeight - crestTop) : 0;
      // Keep the pre-W109 compact envelope and category-tab anchors.
      const rowCenter = (line.height + height - 2 - rowTop) / 2;
      const modeTop = padding - modeLift;
      const scrollEdge = box(scroller).top + scroller.clientTop;
      origin = box(grid).top + scroller.scrollTop - scrollEdge;
      // W-79 activated at these measured envelope clearances. Only scroll
      // position is compared now; no group is scaled, moved, or folded.
      logoClearance = Math.max(1, h.height - compactBody) / 2;
      statusClearance = h.height - (statusTop - titleHeight + status.height + padding);
      set("--head-sticky-top", origin);
      set("--head-title-height", titleHeight);
      set("--head-title-cover-height", titleBox.height);
      set("--head-row-overlap", titleHeight - rowTop);
      set("--compact-crest-left", logo.left - h.left + (logo.width - smallLogo) / 2);
      set("--compact-crest-top", crestTop - rowTop);
      set("--compact-logo-size", smallLogo);
      set("--compact-hud-left", status.left - h.left);
      set("--compact-hud-top", statusTop - rowTop);
      set("--compact-hud-width", status.width);
      // Anchor both presentations to the outer chart box, including loading
      // and neutral states. The existing mobile row keeps its free right slot.
      const chart = box(chartPanel);
      const chartCenter = chart.left + chart.width / 2;
      sharedControls.style.setProperty("--chart-toggle-center", `${chartCenter - box(sharedControls).left}px`);
      // Restore the original compact height and category-tab position.
      // Only Trend/Compare use the former left return-link anchor.
      const classHeight = compactClasses.offsetHeight;
      const classTop = mobile
        ? height - rowTop - classHeight - 2
        : rowCenter - classHeight / 2;
      set("--compact-modes-left", modes.left - h.left);
      set("--compact-modes-top", modeTop);
      set("--compact-chart-left", 0);
      // Mobile keeps the fixed category row clear; centre the full button
      // group in the remaining band. Desktop uses the existing row centre.
      const chartCenterY = mobile
        ? (modeTop + modeHeight + height - rowTop - 2) / 2
        : rowCenter;
      set("--compact-chart-top", chartCenterY - compactChart.offsetHeight / 2);
      set("--compact-classes-top", classTop);
      // Preserve the class distribution anchor formerly beside the 74px return link.
      set("--compact-back-width", 74);
      set("--head-cover-height", height);
      set("--head-compact-height", height);
      // The compact status uses the same DOM/rules and centred age text as
      // W-79. Anchor its info action directly after that text, without motion.
      const age = box(stand.querySelector("small")!);
      set("--compact-info-left", age.right - box(compactHud).left + 6);
      const surfaceBox = box(glow ?? surface);
      set("--head-surface-width", surfaceBox.width);
      set("--head-surface-height", surfaceBox.height);
      set("--head-surface-x", surfaceBox.left);
      set("--head-surface-y", surfaceBox.top);
      set("--head-viewport-x", h.left);
      set("--head-dock-y", scrollEdge + origin);
      header.style.setProperty("--head-surface-color", getComputedStyle(document.body).backgroundColor);
      if (glow) header.style.setProperty("--head-surface-image", `url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(glow))}")`);
      normal.style.setProperty("--normal-title-height", `${titleHeight}px`);
      const fullHeight = titleHeight + h.height;
      grid.style.setProperty("--dashboard-grid-row-height", `${(fullHeight - 2 * parseFloat(getComputedStyle(grid).rowGap)) / 3}px`);
      grid.style.setProperty("--dashboard-head-expanded-height", `${fullHeight}px`);
      paint();
    };
    // Initial hidden state is explicit even when restored scroll starts low.
    header.dataset.compactReady = "false";
    for (const group of groups) { group.inert = true; group.setAttribute("aria-hidden", "true"); }
    const observer = new ResizeObserver(measure);
    observer.observe(scroller); observer.observe(body); observer.observe(title); observer.observe(compactClasses);
    hero.addEventListener("load", measure, true);
    measure();
    scroller.addEventListener("scroll", paint, { passive: true });
    return () => {
      observer.disconnect(); hero.removeEventListener("load", measure, true);
      scroller.removeEventListener("scroll", paint);
      grid.style.removeProperty("--dashboard-grid-row-height");
      grid.style.removeProperty("--dashboard-head-expanded-height");
    };
  }, [ref, target, source, onActivate]);
}

function GuildOverviewCard({
  onClose,
  guild,
  latest,
  userScanCount,
  archiveInventoryState,
  summaries,
  identities,
  scanIdentityContexts, identityContextStatus,
  transferComparison,
  transferStatus,
  memberComparison, collectComparisonDiagnostic,
  trendState, history, comparisonHistory, compareMembers, chartRange,
  memberMode, onMemberModeChange,
  rankingMembers, rankingClass,
  classDistribution, selectedClasses, onToggleClass, onCompactActivate,
}: {
  onClose?: () => void;
  guild: GuildHubSelectedGuild;
  latest: LocalGuildScanView;
  userScanCount: number;
  archiveInventoryState: DashboardArchiveInventoryState;
  summaries: GuildHubScanSummary[];
  identities: IdentityResolutionSnapshot | null;
  scanIdentityContexts: ScanIdentityContext[];
  identityContextStatus: ScanIdentityContext["status"];
  transferComparison: DashboardGuildSource | null;
  transferStatus: ComparisonStatus;
  memberComparison: LocalGuildRankingComparison;
  collectComparisonDiagnostic?: () => Promise<{ text: string; coherent: boolean; isCurrent: () => boolean }>;
  chartRange: GuildChartRangeControl;
  trendState: GuildTrendState;
  history: DashboardHistory;
  comparisonHistory: DashboardGuildComparison;
  compareMembers: DashboardCompareMembers;
  rankingMembers: readonly LocalGuildStatsMember[];
  rankingClass: ClassSelection;
  memberMode: DashboardMemberMode;
  onMemberModeChange: (mode: DashboardMemberMode) => void;
  onCompactActivate: () => void;
  classDistribution: ReturnType<typeof buildClassDistribution>;
  selectedClasses: readonly string[];
  onToggleClass: (label: string) => void;
}) {
  const fusionMarkers = React.useMemo(() => buildGuildAnalyticsFusionMarkers(
    comparisonHistory.fusionServersByGuild.get(comparisonHistory.currentGuildKey), history.timeDomain,
  ), [comparisonHistory, history.timeDomain]);
  const [chartInformationTarget, setChartInformationTarget] = React.useState<HTMLDivElement | null>(null);
  const [compareGuilds, setCompareGuilds] = React.useState<readonly string[]>([]);
  const toggleCompareGuild = (key: string) => setCompareGuilds(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key]);
  const [displayDismissal, setDisplayDismissal] = React.useState(0);
  const handleCompactActivate = React.useCallback(() => { setDisplayDismissal(value => value + 1); onCompactActivate(); }, [onCompactActivate]);
  const comparePresentation = React.useMemo(() => ({
    currentAt: latest.scannedAtMs,
    comparisonValues: memberComparison.comparisonValues,
    comparisonStand: transferComparison ? { at: transferComparison.scannedAtMs, sourceScanId: transferComparison.sourceScanId } : null,
    emblems: buildDashboardCompareEmblems({ comparison: comparisonHistory, summaries, identities, currentAt: latest.scannedAtMs,
      primary: { coaString: latest.source.guild.coaString ?? null, identifier: latest.source.guildIdentifier ?? null, sourceScanId: latest.source.sourceScanId },
    }).emblems,
  }), [latest.scannedAtMs, latest.source.guild.coaString, latest.source.guildIdentifier, latest.source.sourceScanId, transferComparison, comparisonHistory, summaries, identities, memberComparison]);
  const [compareMetrics, setCompareMetrics] = React.useState<DashboardHistoryMetric[]>(["base", "total"]);
  const toggleCompareMetric = (metric: DashboardHistoryMetric) => setCompareMetrics(current => current.includes(metric) ? current.filter(value => value !== metric) : [...current, metric]);
  const [chartMode, setChartMode] = React.useState<"trend" | "compare">("trend");
  useAnalyticsView(chartMode === "trend" ? "datahub/guild/trend" : "datahub/guild/compare");
  const [chartDetails, setChartDetails] = React.useState<{ kind: "trend" | "compare"; trigger: HTMLElement } | null>(null);
  const closeChartDetails = React.useCallback(() => setChartDetails(null), []);
  React.useEffect(() => { setChartDetails(null); setChartMode("trend"); }, [guild.id]);
  const trendArchive = React.useMemo(() => ({ entries: archiveInventoryState.archiveEntries ?? EMPTY_ARCHIVE_ENTRIES, summaries }), [archiveInventoryState.archiveEntries, summaries]);
  const chartIntervals = React.useMemo(() => buildDashboardGuildTrendIntervals(comparisonHistory, trendArchive), [comparisonHistory, trendArchive]);
  const [trendMetrics, setTrendMetrics] = React.useState<Partial<Record<DashboardMemberMode, GuildTrendChartMetric>>>({});
  const metric: GuildTrendChartMetric = trendMetrics[memberMode]
    ?? ((memberMode === "progress" || memberMode === "general") ? "xp" : memberMode === "base" ? "base" : memberMode === "total" ? "total" : "mine");
  const metricOptions = dashboardModeMetrics(memberMode).filter((value): value is GuildTrendChartMetric => value !== "hof");
  const headerRef = React.useRef<HTMLDivElement>(null);
  const [compactTarget, setCompactTarget] = React.useState<HTMLDivElement | null>(null);
  useCompactGuildHeader(headerRef, compactTarget, latest.context, handleCompactActivate);
  const { t } = useTranslation();
  const [detailsContext, setDetailsContext] = React.useState<LocalPlayerSourceContext | null>(null);
  const detailsTrigger = React.useRef<HTMLButtonElement | null>(null);
  const closeDetails = React.useCallback(() => setDetailsContext(null), []);
  const detailsOpen = detailsContext === latest.context;
  const guildName = latest.guild.name ?? guild.name;
  const serverLabel = formatServerLabel(latest.guild.server ?? guild.server);
  const kpis = buildGuildOverviewKpis(latest, userScanCount, archiveInventoryState, selectedClasses);
  const lastScanAtLabel = profileDateTime(latest.scannedAtMs);
  const lastScanDays = useScanAgeDays(latest.scannedAtMs);
  const activityPct = calculateGuildActivityPct(
    latest.members.map((member) => ({
      lastScanMs: member.lastScanMs ?? latest.scannedAtMs,
      lastActivityMs: member.lastActivityMs,
    })),
  );
  const guildCardKpis = buildDashboardGuildCardKpis(kpis, activityPct);
  const renderModes = (compact = false) => (
    <div className={`${styles.memberModeSlot} ${compact ? styles.compactModes : ""}`} role="group" aria-label={t("profileI18n.guildViews")} data-member-mode-toggle data-compact-modes={compact ? "" : undefined}>
      {(["general", "progress", "base", "total", "fortress"] as const).map(mode => <button type="button" key={mode} aria-pressed={memberMode === mode} onClick={() => onMemberModeChange(mode)}>{t("dashboardCompare.modes." + mode)}</button>)}
    </div>
  );

  const renderChartToggle = (compact = false) => (
    <div className={`${styles.guildTrendToggle} ${compact ? styles.compactChart : ""}`} role="group" aria-label={t("dashboardCompare.display")} data-compact-chart={compact ? "" : undefined}>
      {(["trend", "compare"] as const).map(kind => <button key={kind} type="button" className={styles.guildTrendButton} aria-pressed={chartMode === kind} data-active={chartMode === kind} onClick={() => setChartMode(kind)}>{t("guildChartDetails." + kind)}</button>)}
    </div>
  );

  return (
    <>
    <div className={styles.guildStickyHead} ref={headerRef} data-guild-header data-compact-ready="false">
      <div className={styles.guildTitleRow} data-guild-title><GuildOverviewTitle onClose={onClose} /></div>
      <div className={styles.compactBody} ref={setCompactTarget} data-guild-compact-body data-scan-compact="true">
        {renderModes(true)}
        {renderChartToggle(true)}
        <div className={styles.compactClasses} data-compact-classes>
          <DashboardClassDistribution entries={classDistribution} selectedClasses={selectedClasses} onToggleClass={onToggleClass} compact />
        </div>
      </div>
    </div>
    <div className={styles.guildOverviewTop} data-guild-expanded>
      <div className={styles.guildOverviewBody} data-guild-header-body>
      <DashboardGuildCard
        className={styles.guildOverviewHero}
        metadataClassName={styles.guildOverviewMetadata}
        mode={memberMode}
        rankingMembers={rankingMembers} rankingClass={rankingClass} rankingComparison={memberComparison} identities={identities} memberCount={latest.guild.declaredMemberCount}
        modeToggle={<div className={styles.sharedControls} data-guild-shared-controls>
          {renderModes()}
          {renderChartToggle()}
        </div>}
        compactTarget={compactTarget}
        coaString={latest.source.guild.coaString}
        guildName={guildName}
        serverLabel={serverLabel}
        server={latest.guild.server ?? guild.server}
        hofRank={latest.guild.hofRank}
        lastScanAtLabel={lastScanAtLabel !== "—" ? lastScanAtLabel : null}
        lastScanDays={lastScanDays}
        kpis={guildCardKpis}
        scanDetailsOpen={detailsOpen}
        onScanDetails={trigger => { detailsTrigger.current = trigger; setDetailsContext(latest.context); }}
      />

      {detailsOpen && <GuildScanDetailsOverlay
        key={`${guild.id}:${latest.source.sourceScanId}:${latest.context.scan.contentHash}`}
        guild={guild} summaries={summaries} identities={identities}
        collectComparisonDiagnostic={collectComparisonDiagnostic}
        identityContexts={[
          ...(scanIdentityContexts.length ? scanIdentityContexts : [{ stand: { ...latest.source, scannedAtMs: latest.scannedAtMs }, role: "current" as const, status: identityContextStatus }]),
          ...(memberComparison.identityContexts ?? []).map(context => identityContextStatus === "checking" ? { ...context, status: "stale" as const, summary: undefined } : context),
        ]}
        consumerStatus={{ transfer: transferStatus === "ready" ? "ready" : transferStatus === "loading" || identityContextStatus === "checking" ? "checking" : "not-checked",
          ranking: memberComparison.status === "loading" ? "checking" : memberComparison.status === "ready" ? "ready" : "not-checked" }}
        archiveEntries={archiveInventoryState.archiveEntries ?? EMPTY_ARCHIVE_ENTRIES}
        current={{ sourceScanId: latest.source.sourceScanId, scannedAtMs: latest.scannedAtMs, guildIdentifier: latest.source.guildIdentifier }}
        currentGuild={{ ...latest.guild, name: guildName, server: latest.guild.server ?? guild.server }}
        comparisons={[
          ...[...new Map((memberComparison.valueSources ?? []).filter(source => source.sourceScanId !== memberComparison.sourceScanId || source.scannedAtMs !== memberComparison.timestamp).map(source => [JSON.stringify([source.sourceScanId, source.scannedAtMs]), source])).values()].map(source => ({ ...source, label: t("guildProfileRange.playerValues") })),
          ...(transferComparison ? [{ ...transferComparison, label: t("guildScanDetails.transferComparison") }] : []),
          ...(memberComparison.status === "ready" && memberComparison.sourceScanId && memberComparison.timestamp != null ? [{ sourceScanId: memberComparison.sourceScanId, scannedAtMs: memberComparison.timestamp, guildIdentifier: memberComparison.guildIdentifier, label: t("guildScanDetails.rankingComparison") }] : []),
        ]}
        kpis={guildCardKpis} onClose={closeDetails} trigger={detailsTrigger.current}
      />}

      <div className={styles.guildOverviewTrend} data-guild-trend>
        {chartMode === "compare" ? <DashboardCompareChart chartRange={chartRange} profileHud informationTarget={chartInformationTarget} {...comparePresentation} closeDisplaySignal={chartDetails ?? displayDismissal} selectedGuilds={compareGuilds} onToggleGuild={toggleCompareGuild} onSelectGuilds={setCompareGuilds} comparison={comparisonHistory} mode={memberMode} selectedMetrics={compareMetrics} onToggleMetric={toggleCompareMetric} loading={trendState.loading} error={trendState.error} headingAction={<ChartDetailButton title={t("guildChartDetails.compare")} onClick={trigger => setChartDetails({ kind: "compare", trigger })} />} /> : <>
        {memberMode === "general" ? <DashboardCompareChart chartRange={chartRange} profileHud singleGuild informationTarget={chartInformationTarget} {...comparePresentation} selectedGuilds={compareGuilds} onToggleGuild={toggleCompareGuild} onSelectGuilds={setCompareGuilds} comparison={comparisonHistory} mode="general" selectedMetrics={compareMetrics} onToggleMetric={toggleCompareMetric} loading={trendState.loading} error={trendState.error} headingAction={<ChartDetailButton title={t("guildChartDetails.trend")} onClick={trigger => setChartDetails({ kind: "trend", trigger })} />} /> : <DashboardGuildTrendBody chartRange={chartRange} closeDisplaySignal={chartDetails ?? displayDismissal} fusionMarkers={fusionMarkers} informationTarget={chartInformationTarget} metric={metric} metricOptions={metricOptions} onMetricChange={value => setTrendMetrics(current => ({ ...current, [memberMode]: value }))} intervals={chartIntervals} state={trendState} headingAction={<ChartDetailButton title={t("guildChartDetails.trend")} onClick={trigger => setChartDetails({ kind: "trend", trigger })} />} />}</>}
      </div>
      {chartDetails && <DashboardChartDetails chartRange={chartRange} key={`${guild.id}:${chartDetails.kind}`} kind={chartDetails.kind} fusionMarkers={fusionMarkers} compareMembers={compareMembers} compare={{ ...comparePresentation, selectedGuilds: compareGuilds, comparison: comparisonHistory, selectedMetrics: compareMetrics }} history={history} members={latest.members} mode={memberMode} metric={metric} intervals={chartIntervals} loading={trendState.loading} error={trendState.error} onClose={closeChartDetails} trigger={chartDetails.trigger} />}
      </div>
    </div>
    <div ref={setChartInformationTarget} className={styles.chartInformationSlot} data-dashboard-chart-info />
    </>
  );
}

const noopChartClose = () => {};
function DashboardGuildTrendBody({
  metric,
  state, intervals, headingAction, informationTarget, fusionMarkers, metricOptions, onMetricChange, chartRange, closeDisplaySignal,
}: {
  metric: GuildTrendChartMetric;
  chartRange: GuildChartRangeControl; closeDisplaySignal?: unknown;
  metricOptions: readonly GuildTrendChartMetric[]; onMetricChange: (value: GuildTrendChartMetric) => void;
  state: GuildTrendState;
  intervals: import("../../components/guild-trend/GuildTrendChart").GuildTrendChartInterval[];
  fusionMarkers?: readonly GuildAnalyticsFusionMarker[];
  informationTarget?: HTMLElement | null;
  headingAction?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [infoTarget, setInfoTarget] = React.useState<HTMLSpanElement | null>(null);
  useRuntimeAuditCommit(state.result, !!state.result && !state.loading && !state.error, `guild-trend-chart:${metric}`);
  const message = !state.result ? state.loading ? t("guildChartDetails.loading") : t("guildDashboardState.loadFailed")
    : state.result.status === "empty" || state.result.status === "missing-guild" || !intervals.length ? t("guildChartDetails.empty") : null;
  const hasMetricData = intervals.some((interval) => {
    const values = getGuildTrendMetric(interval, metric);
    return values != null && Number.isFinite(values.startAverage) && Number.isFinite(values.endAverage) && Number.isFinite(values.perDay);
  });

  return (
    <div className={styles.trendDetailFrame}>
    <div className={styles.trendDetailHeading} data-profile-chart-hud><h2 data-profile-title-group>{headingAction}{t("guildChartDetails.trend")}<span ref={setInfoTarget} /></h2>
      <CompareDisplay mode="progress" metrics={[]} selectedMetrics={[]} onToggleMetric={() => {}} closeSignal={closeDisplaySignal} onClose={noopChartClose}>
        <label className={styles.trendMetricSelect}><span>{t("dashboardTrend.metricSelection")}</span><select value={metric} onChange={event => onMetricChange(event.target.value as GuildTrendChartMetric)} data-trend-metric>
          {metricOptions.map(value => <option key={value} value={value}>{t("dashboardTrend.metrics." + value)}</option>)}
        </select></label>
        <DashboardChartRange {...chartRange} />
      </CompareDisplay></div>
    {message && <p role="status">{message}</p>}
    {!message && !hasMetricData && <p className={styles.trendMetricEmpty} role="status">{t("dashboardTrend.noMetricData", { metric: t("dashboardTrend.metrics." + metric) })}</p>}
    {!message && <GuildTrendChart trendInfoTarget={infoTarget} averageLabels fusionMarkers={fusionMarkers}
      informationTarget={informationTarget}
      className={styles.guildTrendChart}
      title={t("dashboardTrend.metrics." + metric)}
      metric={metric}
      intervals={intervals}
      showTrendInfo
      legendInChart
      animateBuild
      fitContainer
    />}
    </div>
  );
}


function DashboardClassDistribution({ entries, selectedClasses, onToggleClass, compact = false }: {
  entries: ReturnType<typeof buildClassDistribution>; selectedClasses: readonly string[]; onToggleClass: (label: string) => void; compact?: boolean;
}) {
  return <GuildClassDistributionPie
    fitWidth iconCounts playerRowChips compact={compact}
    entries={entries} selectedClasses={selectedClasses} onToggleClass={onToggleClass}
    renderIcon={entry => <ClassIcon classLabel={entry.classLabel} classMeta={entry.classMeta} fallbackText={entry.classLabel} compact />}
  />;
}

function KpiPanel({ className, history, members, ...distribution }: {
  className?: string; history: DashboardHistory; members: LocalMember[];
  entries: ReturnType<typeof buildClassDistribution>; selectedClasses: readonly string[]; onToggleClass: (label: string) => void;
}) {
  const { t } = useTranslation();
  const [trigger, setTrigger] = React.useState<HTMLElement | null>(null);
  const close = React.useCallback(() => setTrigger(null), []);
  React.useEffect(() => setTrigger(null), [members]);
  return <section className={[styles.panel, className].filter(Boolean).join(" ")}>
    <div data-profile-chart-hud><h2 data-profile-title-group><ChartDetailButton title={t("guildChartDetails.classes")} onClick={setTrigger} />{t("guildChartDetails.classes")}</h2></div>
    <GuildClassDistributionPie fitWidth iconCounts playerRowChips {...distribution} heading={false} renderIcon={entry => <ClassIcon classLabel={entry.classLabel} classMeta={entry.classMeta} fallbackText={entry.classLabel} compact />} />
    {trigger && <DashboardChartDetails kind="classes" history={history} members={members} metric="xp" intervals={[]} onClose={close} trigger={trigger} />}
  </section>;
}

function EmptyPanel({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={styles.emptyPanel}>
      <h1>{title}</h1>
      <p>{text}</p>
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </section>
  );
}

async function buildGuildScanView(
  scan: GuildHubLocalScan,
  activeGuild: GuildHubSelectedGuild,
  source: DashboardGuildSource,
  context: LocalPlayerSourceContext,
  allowed: () => boolean = () => true,
): Promise<LocalGuildScanView | null> {
    const __audit5 = auditPhaseBegin("buildGuildScanView", undefined, "async-container");
    try {
  const snapshot = selectGuildHubRawSnapshot(scan, source.scannedAtMs);
  const raw = snapshot ? {
    players: snapshot.players.map(asRecord).filter((row): row is JsonRecord => Boolean(row)),
    groups: snapshot.groups.map(asRecord).filter((row): row is JsonRecord => Boolean(row)),
  } : null;
  if (!raw) return auditReturn(__audit5, null);

  const activeServer = normalizeServerForCompare(activeGuild.server);
  const activeGuildSegment = normalizeGuildSegment(activeGuild.guildId) ?? normalizeGuildSegment(activeGuild.logoIdentifier);
  const group = raw.groups.find((entry) => isGroupMatch(entry, activeGuild, activeServer, activeGuildSegment)) ?? null;
  // Membership uses the exact identity fields returned by the full normalizer.
  // Preserve all groups (role lookup) and the full Raw lookup below, but build
  // expensive character cores only for members of the selected guild.
  const guildPlayers: JsonRecord[] = [];
  let sliceStarted = performance.now();
  for (const row of raw.players) {
    if (!allowed()) throw Error("dashboard_context_changed");
    const identity = readGuildScanMemberIdentity(row);
    if (identity && isNormalizedMemberInActiveGuild(identity, activeGuild, activeServer, activeGuildSegment)) guildPlayers.push(row);
    if (performance.now() - sliceStarted >= 6) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    }
  }
  const normalizedMembers = await normalizeGuildScanMembersCooperatively({ ...raw, players: guildPlayers }, (row, core) => {
    if (!allowed()) throw Error("dashboard_context_changed");
    const identity = readGuildScanMemberIdentity(row, activeServer);
    if (identity && isNormalizedMemberInActiveGuild(identity, activeGuild, activeServer, activeGuildSegment)) {
      context.coreLookup.set(row as JsonRecord, core);
    }
  });
  if (!group && !normalizedMembers.some(member => isNormalizedMemberInActiveGuild(member, activeGuild, activeServer, activeGuildSegment))) return auditReturn(__audit5, null);
  const snapshotMembers = normalizedMembers.filter((member) => isNormalizedMemberInActiveGuild(member, activeGuild, activeServer, activeGuildSegment));
  const rawPlayersByKey = await (auditValue(__audit5, auditEnter(__audit5, "buildRawPlayerLookup", "async-container"), (buildRawPlayerLookup(raw.players, activeServer, source.sourceScanId, allowed))));
  const playerLookup = new Map<string, JsonRecord>();
  const members = snapshotMembers
    .map((member) =>
      toLocalMemberFromSnapshotMember(
        member,
        source.sourceScanId,
        source.scannedAtMs,
        rawPlayersByKey.get(member.memberRef.toLowerCase()) ?? null,
        context.coreLookup.get(rawPlayersByKey.get(member.memberRef.toLowerCase())!) ?? null,
      ),
    )
    .filter((member): member is LocalMember => Boolean(member));
  members.forEach((member) => {
    const rawPlayer = member.localRef ? rawPlayersByKey.get(member.localRef.sourcePlayerKey.toLowerCase()) ?? null : null;
    if (rawPlayer && member.localRef) playerLookup.set(member.localRef.sourcePlayerKey, rawPlayer);
  });

  return auditReturn(__audit5, {
    guildContextId: activeGuild.id,
    context,
    source,
    scannedAtMs: source.scannedAtMs,
    scannedAtIso: source.scannedAtIso,
    guild: {
      declaredMemberCount: group ? readDeclaredMemberCount(group) ?? null : null,
      name: source.guild.name ?? (group ? readString(group, ["name", "Name", "groupname", "groupName", "guildName", "Guild Name"]) : activeGuild.name),
      server:
        source.guild.server ??
        (group ? readString(group, ["server", "Server", "prefix", "world", "realm"]) ?? activeGuild.server : activeGuild.server),
      memberCount:
        source.guild.memberCount ??
        (group ? readNumber(group, ["guildMemberCount", "Guild Member Count", "memberCount", "members", "count"]) : null) ??
        members.length,
      hofRank:
        source.guild.hofRank ??
        (group ? readNumber(group, ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank", "guildRank"]) : null),
    },
    members,
    playerLookup,
  });

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
}

function isNormalizedMemberInActiveGuild(
  member: Pick<NormalizedGuildMember, "server" | "guildSegment" | "groupSegment" | "guildName">,
  activeGuild: GuildHubSelectedGuild,
  activeServer: string | null,
  activeGuildSegment: string | null,
) {
  const memberServer = normalizeServerForCompare(member.server);
  const serverMatches = !activeServer || !memberServer || activeServer === memberServer;
  if (
    activeGuildSegment &&
    (normalizeGuildSegment(member.guildSegment) === activeGuildSegment || normalizeGuildSegment(member.groupSegment) === activeGuildSegment) &&
    serverMatches
  ) {
    return true;
  }

  return Boolean(member.guildName && normalizeLoose(member.guildName) === normalizeLoose(activeGuild.name) && serverMatches);
}

async function buildRawPlayerLookup(players: JsonRecord[], fallbackServer: string | null, sourceScanId: string, allowed: () => boolean) {
  const nameCounts = await buildPlayerNameCounts(players, allowed);
  const lookup = new Map<string, JsonRecord>();
  let sliceStarted = performance.now();
  for (const player of players) {
    if (!allowed()) throw Error("dashboard_context_changed");
    const key = resolveLocalPlayerKey(player, fallbackServer, sourceScanId, nameCounts);
    if (key && !lookup.has(key.toLowerCase())) lookup.set(key.toLowerCase(), player);
    if (performance.now() - sliceStarted >= 6) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    }
  }
  return lookup;
}

function toLocalMemberFromSnapshotMember(
  member: NormalizedGuildMember,
  sourceScanId: string,
  sourceScannedAtMs: number,
  rawPlayer: JsonRecord | null,
  core: import("../../lib/parsing/normalizedPlayer").NormalizedPlayer | null,
): LocalMember | null {
  const key = member.memberRef.toLowerCase();
  if (!key) return null;
  const classMeta = getClassMetaById(member.classId);
  const server = normalizeServerForCompare(member.server);
  const playerId = parsePlayerIdFromMemberRef(member.memberRef);
  const rawLastScanMs = rawPlayer ? readTimestampMs(rawPlayer, ["lastScanMs", "lastScan", "scannedAt", "scanAt", "timestamp"]) : null;
  const rawLastActivityMs = rawPlayer
    ? readTimestampMs(rawPlayer, ["lastActivityMs", "lastActivity", "lastActive", "lastOnline"])
    : null;
  return {
    key,
    name: member.name,
    classLabel: classMeta?.label ?? normalizeMemberClassLabel(member.classId),
    classMeta,
    level: member.level,
    honor: null,
    hofRank: core?.progression.rank ?? null,
    baseMain: member.baseStats,
    totalStats: member.totalStats,
    lastScanMs: rawLastScanMs ?? sourceScannedAtMs,
    playerStats: readLocalGuildMemberValues(rawPlayer, core),
    lastActivityMs: rawLastActivityMs,
    guildRole: member.guildRole ?? null,
    localRef: {
      sourceScanId,
      sourcePlayerKey: key,
      identifier: member.memberRef.includes("_p") ? member.memberRef : null,
      playerId,
      server,
      matchedByNameFallback: !member.memberRef.includes("_p"),
    },
  };
}

function parsePlayerIdFromMemberRef(memberRef: string) {
  const match = memberRef.match(/_p([^_]+)$/i);
  return match?.[1] ?? null;
}

function isGroupMatch(
  group: JsonRecord,
  activeGuild: GuildHubSelectedGuild,
  activeServer: string | null,
  activeGuildSegment: string | null,
) {
  const groupSegment = normalizeGuildSegment(
    readString(group, ["guildIdentifier", "Guild Identifier", "identifier", "Identifier", "groupIdentifier", "groupId", "guildId", "id"]),
  );
  const groupServer = normalizeServerForCompare(
    readString(group, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(readString(group, ["identifier", "guildIdentifier"])),
  );
  const idMatches = Boolean(activeGuildSegment && groupSegment && activeGuildSegment === groupSegment);
  const serverMatches = !activeServer || !groupServer || activeServer === groupServer;
  if (idMatches && serverMatches) return true;

  const groupName = readString(group, ["name", "Name", "groupname", "groupName", "guildName", "guild"]);
  return Boolean(groupName && normalizeLoose(groupName) === normalizeLoose(activeGuild.name) && serverMatches);
}



async function buildPlayerNameCounts(players: JsonRecord[], allowed: () => boolean) {
  const counts = new Map<string, number>();
  let sliceStarted = performance.now();
  for (const player of players) {
    if (!allowed()) throw Error("dashboard_context_changed");
    const name = readString(player, ["name", "Name", "playerName", "Player Name"]);
    const key = name ? normalizeLoose(name) : "";
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    if (performance.now() - sliceStarted >= 6) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    }
  }
  return counts;
}

function resolveLocalPlayerKey(
  player: JsonRecord,
  fallbackServer: string | null,
  sourceScanId: string,
  nameCounts: Map<string, number>,
) {
  const identifier = readString(player, ["identifier", "Identifier"]);
  if (identifier) return identifier.toLowerCase();

  const playerId = readString(player, ["playerId", "Player ID", "id", "ID"]);
  const server = normalizeServerForCompare(
    readString(player, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(identifier) ?? fallbackServer,
  );
  if (playerId && server) return `${server}_p${playerId}`;

  const name = readString(player, ["name", "Name", "playerName", "Player Name"]);
  const nameKey = name ? normalizeLoose(name) : "";
  if (nameKey && nameCounts.get(nameKey) === 1) return `${sourceScanId}:name:${nameKey}`;

  return null;
}

function buildTransferSummary(latest: LocalMember[], previous: LocalMember[], identities: IdentityResolutionSnapshot | null = null): TransferSummary {
    const __audit6 = auditPhaseBegin("buildTransferSummary", undefined, "sync-elapsed");
    try {
  return auditReturn(__audit6, classifyDashboardTransfers(latest, previous, identities));

    } catch (__auditError) { auditError(__audit6, __auditError); throw __auditError; }
    finally { auditLeave(__audit6); }
}

function buildGuildOverviewKpis(
  latest: LocalGuildScanView,
  userScanCount: number,
  archiveInventoryState: DashboardArchiveInventoryState,
  selectedClasses: readonly string[] = EMPTY_SELECTED_CLASSES,
): DashboardGuildCardKpi[] {
    const __audit7 = auditBegin("F08", "main:buildGuildOverviewKpis");
    auditObserveInputs(__audit7, [latest]);
    try {
  const members = latest.members.filter(member => selectedClasses.length === 0 || selectedClasses.includes(member.classLabel?.trim() ?? ""));
  const memberCount = latest.guild.memberCount ?? latest.members.length;
  const avgLevel = average(members.map((member) => member.level).filter(isNumber));
  const avgBaseMain = average(members.map((member) => member.playerStats?.sumBaseTotal ?? null).filter(isNumber));
  const avgTotalStats = average(members.map((member) => member.playerStats?.totalStats ?? null).filter(isNumber));
  const memberAverage = (field: keyof LocalGuildPlayerStatsValues) => {
    const value = averageLocalGuildMemberField(members, field);
    return value != null ? formatInteger(Math.round(value)) : "-";
  };
  const archiveScanValue = archiveInventoryState.archiveScanCount == null
    ? archiveInventoryState.loading
      ? "..."
      : "-"
    : formatInteger(archiveInventoryState.archiveScanCount);

  return auditReturn(__audit7, [
    { key: "scanstand", label: profileText("profileI18n.scanStand"), value: profileDateTime(latest.scannedAtIso), hint: formatAge(latest.scannedAtMs) },
    { key: "members", label: profileText("guildHub.membersPanel.title"), value: formatInteger(memberCount), hint: profileText("profileI18n.membersInScan", { value: formatInteger(latest.members.length) }) },
    { key: "avg-level", label: profileText("dashboardAverageHud.avg-level"), value: avgLevel != null ? formatDecimal(avgLevel) : "-", hint: profileText("profileI18n.currentMembers") },
    { key: "avg-base", label: profileText("dashboardAverageHud.avg-base"), value: avgBaseMain != null ? formatInteger(Math.round(avgBaseMain)) : "-", hint: profileText("profileI18n.mainCon") },
    {
      key: "avg-total",
      label: profileText("dashboardAverageHud.avg-total"),
      value: avgTotalStats != null ? formatInteger(Math.round(avgTotalStats)) : "-",
      hint: profileText("profileI18n.mainCon"),
    },
    { key: "avg-base-main", label: profileText("dashboardAverageHud.avg-base-main"), value: memberAverage("baseMain"), hint: profileText("dashboardTrend.metrics.baseMain") },
    { key: "avg-base-con", label: profileText("dashboardAverageHud.avg-base-con"), value: memberAverage("conBase"), hint: profileText("dashboardTrend.metrics.conBase") },
    { key: "avg-total-main", label: profileText("dashboardAverageHud.avg-base-main"), value: memberAverage("attrTotal"), hint: profileText("dashboardTrend.metrics.attrTotal") },
    { key: "avg-total-con", label: profileText("dashboardAverageHud.avg-base-con"), value: memberAverage("conTotal"), hint: profileText("dashboardTrend.metrics.conTotal") },
    { key: "avg-treasury", label: profileText("dashboardAverageHud.avg-treasury"), value: memberAverage("treasury"), hint: profileText("dashboardCompare.averages.treasury") },
    { key: "avg-mine", label: profileText("dashboardAverageHud.avg-mine"), value: memberAverage("mine"), hint: profileText("dashboardCompare.averages.mine") },
    { key: "user-scans", label: profileText("guildScanDetails.userScan"), value: formatInteger(userScanCount), hint: profileText("guildHistory.current") },
    {
      key: "archive-scans",
      label: profileText("guildScanDetails.archive"),
      value: archiveScanValue,
      hint: profileText(archiveInventoryState.error ? "profileI18n.archiveUnavailable" : "profileI18n.availableHistory"),
    },
  ]);

    } catch (__auditError) { auditError(__audit7, __auditError); throw __auditError; }
    finally { auditLeave(__audit7); }
}

function buildDashboardGuildCardKpis(
  dashboardKpis: DashboardGuildCardKpi[],
  activityPct: number | null,
): DashboardGuildCardKpi[] {
    const __audit8 = auditBegin("F08", "main:buildDashboardGuildCardKpis");
    auditObserveInputs(__audit8, [dashboardKpis]);
    try {
  return auditReturn(__audit8, [
    ...dashboardKpis,
    {
      key: "activity",
      label: profileText("guildProfile.heroPanel.metrics.activity"),
      value: formatActivityPercent(activityPct),
      hint: profileText("guildProfile.heroPanel.metrics.activity"),
    },
  ]);

    } catch (__auditError) { auditError(__audit8, __auditError); throw __auditError; }
    finally { auditLeave(__audit8); }
}

function formatActivityPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return profilePercent(Math.max(0, Math.min(100, Math.round(value))));
}

function buildClassDistribution(members: LocalMember[]) {
    const __audit9 = auditBegin("F08", "main:buildClassDistribution");
    auditObserveInputs(__audit9, [members]);
    try {
  const counts = new Map<string, { classLabel: string; classMeta: ClassMeta | null; count: number }>();
  for (const member of members) {
    const classLabel = member.classLabel?.trim();
    if (!classLabel) continue;
    const current = counts.get(classLabel);
    counts.set(classLabel, {
      classLabel,
      classMeta: current?.classMeta ?? member.classMeta,
      count: (current?.count ?? 0) + 1,
    });
  }

  return auditReturn(__audit9, [...counts.values()]
    .sort((a, b) => b.count - a.count || a.classLabel.localeCompare(b.classLabel)));

    } catch (__auditError) { auditError(__audit9, __auditError); throw __auditError; }
    finally { auditLeave(__audit9); }
}

function parseTimestampMs(value: string | null | undefined) {
  const scanned = value ? Date.parse(value) : NaN;
  if (Number.isFinite(scanned)) return scanned;
  return null;
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

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

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

function formatServerLabel(server: string | null) {
  if (!server) return profileText("profileI18n.serverUnknown");
  const normalized = normalizeServerKeyFromInput(server);
  return SERVER_BY_ID[String(normalized ?? server).trim().toLowerCase()]?.label ?? server;
}

function formatAge(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return profileText("profileI18n.ageUnknown");
  const days = getScanAgeDays(ms);
  if (days == null) return profileText("profileI18n.ageUnknown");
  if (days === 0) return profileText("guildProfile.heroPanel.tooltips.age.today");
  if (days === 1) return profileText("guildProfile.heroPanel.tooltips.age.oneDayAgo");
  return profileText("guildProfile.heroPanel.tooltips.age.daysAgo", { days: formatInteger(days) });
}

function formatInteger(value: number) {
  return new Intl.NumberFormat(profileLocale(), { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat(profileLocale(), { maximumFractionDigits: 1 }).format(value);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asRecord(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function canonKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickFirst(record: JsonRecord, keys: string[]) {
  const lookup = new Map<string, string>();
  for (const key of Object.keys(record)) {
    const canon = canonKey(key);
    if (canon && !lookup.has(canon)) lookup.set(canon, key);
  }

  for (const key of keys) {
    const resolved = lookup.get(canonKey(key));
    const value = resolved ? record[resolved] : undefined;
    if (value != null && String(value).trim()) return value;
  }

  return undefined;
}

function readString(record: JsonRecord, keys: string[]) {
  const value = pickFirst(record, keys);
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function readNumber(record: JsonRecord, keys: string[]) {
  const value = pickFirst(record, keys);
  if (value == null || value === "") return null;
  const normalized = String(value).trim().replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLoose(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeServerForCompare(value: unknown) {
  return serverComparisonKey(value)?.toLowerCase() ?? null;
}

function normalizeGuildSegment(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const identifierMatch = raw.match(/_g([^_]+)$/i);
  const segment = identifierMatch?.[1] ?? raw.replace(/^g/i, "");
  return segment.trim() || null;
}

function parseServerFromIdentifier(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(.+)_[gp][^_]+$/i);
  return match?.[1] ?? null;
}

function normalizeMemberClassLabel(value: string | null) {
  if (!value) return null;
  const raw = value.trim();
  return raw || null;
}
