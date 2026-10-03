import React from "react";
import { TrendingDown, TrendingUp, UserMinus, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import ContentShell from "../../components/ContentShell";
import GuildTrendChart, { type GuildTrendChartMetric } from "../../components/guild-trend/GuildTrendChart";
import GuildContextBar from "../../components/guilds/GuildContextBar";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import SectionDividerHeader from "../../components/ui/shared/SectionDividerHeader";
import { getClassMetaById, iconForClassName, type ClassMeta } from "../../data/classes";
import { SERVER_BY_ID } from "../../data/servers";
import {
  getGuildHubLocalScan,
  isGuildHubScanAnalyticsEnabled,
  listGuildHubScanSummaries,
  subscribeToSfDataHubLocalScanChanges,
  type GuildHubLocalGuildIdentity,
  type GuildHubLocalScan,
  type GuildHubScanSummary,
} from "../../lib/guilds/localScanLibrary";
import { normalizeGuildScanMembers, type NormalizedGuildMember, type NormalizedGuildRole } from "../../lib/guilds/guildScanNormalizer";
import { calculateGuildActivityPct } from "../../lib/guilds/guildActivity";
import type { GuildAnalyticsMemberSnapshot } from "../../lib/guilds/localGuildAnalyticsStore";
import {
  loadIdentityResolutionSnapshot,
  resolveGuildIdentity,
  type IdentityResolutionSnapshot,
} from "../../lib/identities/identityResolution";
import {
  LocalPlayerIndexWorkerCancelledError,
  startLocalPlayerIndexWorkerRun,
  type LocalPlayerIndexProgress,
  type LocalPlayerIndexWorkerRun,
} from "../../lib/player-search/localPlayerIndexClient";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import { toDriveThumbProxy } from "../../lib/urls";
import type { GuildTrendBuildResult } from "../Playground/playerPerformanceModel";
import {
  PlayerPerformanceWorkerCancelledError,
  startPlayerPerformanceWorkerRun,
  type PlayerPerformanceProgress,
  type PlayerPerformanceWorkerRun,
} from "../Playground/playerPerformanceWorkerClient";
import LocalPlayerProfileOverlay from "../../components/local-player-profile/LocalPlayerProfileOverlay";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import { acquireDashboardLocalFirstFeatureScans } from "./dashboardLocalFirst";
import {
  buildDashboardPlayerCardItems,
  buildDashboardStaticPlayerCardItems,
  DEFAULT_DASHBOARD_MEMBER_VIEW,
  sortDashboardMembers,
  type DashboardMemberView,
  type DashboardPlayerCardItem,
} from "./dashboardPlayerCards";
import DashboardMemberCard from "./DashboardMemberCard";
import DashboardGuildCard, { type DashboardGuildCardKpi } from "./DashboardGuildCard";
import { buildLocalPlayerProfileModel } from "./localPlayerProfileAdapter";
import { useGuildHubSelection, type GuildHubSelectedGuild } from "./hooks/useGuildHubSelection";
import styles from "./Dashboard.module.css";

const DAY_MS = 86_400_000;
const MIN_COMPARISON_DAYS = 30;
const DASHBOARD_GRID_GAP_PX = 16;
const DASHBOARD_GRID_ROW_HEIGHT_PX = 121;
const DASHBOARD_MEMBER_MIN_ROW_SPAN = 9;
const DASHBOARD_MEMBER_PANEL_CHROME_HEIGHT_PX = 76;
const DASHBOARD_MEMBER_CARD_HEIGHT_PX = 190;
const DASHBOARD_MEMBER_CARD_GAP_PX = 12;
const DASHBOARD_MEMBER_LIST_ROW_HEIGHT_PX = 56;
const DASHBOARD_MEMBER_LIST_GAP_PX = 8;
const DASHBOARD_MEMBER_CARDS_ERROR_HEIGHT_PX = 30;

type JsonRecord = Record<string, unknown>;

type LocalMember = {
  key: string;
  name: string;
  classLabel: string | null;
  classMeta: ClassMeta | null;
  level: number | null;
  honor: number | null;
  hofRank: number | null;
  baseMain: number | null;
  totalStats: number | null;
  lastScanMs?: number | null;
  lastActivityMs?: number | null;
  guildRole?: NormalizedGuildRole;
  localRef?: {
    sourceScanId: string;
    sourcePlayerKey: string;
    identifier: string | null;
    playerId: string | null;
    server: string | null;
    matchedByNameFallback: boolean;
  };
};

type LocalGuildScanView = {
  source: DashboardGuildSource;
  scannedAtMs: number;
  scannedAtIso: string | null;
  guild: {
    name: string | null;
    server: string | null;
    memberCount: number | null;
    hofRank: number | null;
  };
  members: LocalMember[];
  playerLookup: Map<string, JsonRecord>;
};

type DashboardGuildSource = {
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

type ScanState = {
  summaries: GuildHubScanSummary[];
  sources: DashboardGuildSource[];
  latest: LocalGuildScanView | null;
  comparisonMembers: LocalMember[] | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
};

type GuildTrendState = {
  result: GuildTrendBuildResult | null;
  progress: PlayerPerformanceProgress | null;
  loading: boolean;
  error: string | null;
};

type DashboardPlayerCardsState = {
  items: DashboardPlayerCardItem<LocalMember>[];
  progress: LocalPlayerIndexProgress | null;
  loading: boolean;
  error: string | null;
};

type DashboardArchiveInventoryState = {
  archiveScanCount: number | null;
  loading: boolean;
  error: string | null;
};

type DashboardMembersPanelStyle = React.CSSProperties & {
  "--dashboard-members-row-span"?: number;
};

const dashboardPlayerCardsDevelopmentCache = new Map<string, DashboardPlayerCardItem<LocalMember>[]>();

type TransferSummary = {
  joined: LocalMember[];
  left: LocalMember[];
};

export default function GuildHubDashboard() {
  const { activeGuild } = useGuildHubSelection();
  const scanState = useDashboardScans(activeGuild);
  const archiveInventoryState = useDashboardLocalFirstAcquisition(activeGuild, scanState.summaries, scanState.loading);
  const [selectedLocalProfile, setSelectedLocalProfile] = React.useState<LocalPlayerProfileModel | null>(null);

  const latest = scanState.latest;
  const userScanCount = React.useMemo(
    () => countDashboardUserScans(scanState.sources, scanState.summaries),
    [scanState.sources, scanState.summaries],
  );
  const playerCardsState = useDashboardPlayerCards(activeGuild, scanState.summaries, scanState.sources, latest);
  const comparison = React.useMemo(() => {
    if (!latest) return null;
    return (
      scanState.sources.find((source) => latest.scannedAtMs - source.scannedAtMs >= MIN_COMPARISON_DAYS * DAY_MS) ?? null
    );
  }, [latest, scanState.sources]);
  const transfers = React.useMemo(() => {
    if (!latest || !comparison || !scanState.comparisonMembers) return null;
    return buildTransferSummary(latest.members, scanState.comparisonMembers);
  }, [comparison, latest, scanState.comparisonMembers]);
  const handleMemberClick = React.useCallback(
    (member: LocalMember) => {
      if (!latest || !activeGuild || !member.localRef) return;
      const rawPlayer = latest.playerLookup.get(member.localRef.sourcePlayerKey);
      if (!rawPlayer) return;

      const profile = buildLocalPlayerProfileModel({
        rawPlayer,
        sourceScanId: latest.source.sourceScanId,
        sourcePlayerKey: member.localRef.sourcePlayerKey,
        sourceMemberRef: member.localRef.identifier ?? (member.localRef.matchedByNameFallback ? null : member.localRef.sourcePlayerKey),
        scannedAtMs: latest.scannedAtMs,
        scannedAtIso: latest.scannedAtIso,
        guild: {
          ...latest.guild,
          identifier: activeGuild.logoIdentifier ?? activeGuild.guildId,
        },
        guildRole: member.guildRole ?? null,
      });
      setSelectedLocalProfile(profile);
    },
    [activeGuild, latest],
  );

  React.useEffect(() => {
    setSelectedLocalProfile(null);
  }, [activeGuild?.id, latest?.source.sourceScanId, latest?.scannedAtMs]);

  return (
    <ContentShell centerFramed={false}>
      <div className={styles.page}>
        <div className={styles.topbar}>
          <GuildContextBar useImageFallback={false} />
          <SectionDividerHeader title="Dashboard" className={styles.divider} />
        </div>

        {!activeGuild ? (
          <EmptyPanel
            title="Keine aktive Gilde"
            text="Waehle zuerst im Guild-Hub-Startmenue eine Gilde aus. Das Dashboard trifft hier keine automatische Auswahl."
            action={<Link to="/guild-hub">Zur Gildenauswahl</Link>}
          />
        ) : scanState.loading || scanState.detailLoading ? (
          <DataHubLoadingState
            variant="page"
            title="Lokale Scans werden geladen"
            message="Die IndexedDB-Bibliothek wird gelesen."
          />
        ) : scanState.error ? (
          <EmptyPanel title="Lokale Scans nicht verfuegbar" text={scanState.error} />
        ) : !latest ? (
          <EmptyPanel
            title="Keine lokalen Scans fuer diese Gilde"
            text="Importiere zuerst SF-Tools JSONs oder pruefe, ob die aktive Gilde in den lokalen Scans enthalten ist."
            action={<Link to="/guild-hub/import">Scans importieren</Link>}
          />
        ) : (
          <div className={styles.dashboardGrid}>
            <GuildOverviewCard
              guild={activeGuild}
              latest={latest}
              userScanCount={userScanCount}
              archiveInventoryState={archiveInventoryState}
              summaries={scanState.summaries}
            />
            <KpiPanel className={styles.classDistributionSlot} latest={latest} />
            <DashboardMembersPanel
              className={styles.membersSlot}
              members={latest.members}
              playerCardsState={playerCardsState}
              onMemberClick={handleMemberClick}
            />
            <HistoryPanel className={styles.historySlot} latest={latest} comparison={comparison} transfers={transfers} />
          </div>
        )}
        <LocalPlayerProfileOverlay
          isOpen={Boolean(selectedLocalProfile)}
          profile={selectedLocalProfile}
          onClose={() => setSelectedLocalProfile(null)}
        />
      </div>
    </ContentShell>
  );
}

function useDashboardScans(activeGuild: GuildHubSelectedGuild | null): ScanState {
  const [state, setState] = React.useState<ScanState>({
    summaries: [],
    sources: [],
    latest: null,
    comparisonMembers: null,
    loading: true,
    detailLoading: false,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    let runId = 0;

    if (!activeGuild) {
      setState({ summaries: [], sources: [], latest: null, comparisonMembers: null, loading: false, detailLoading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      const currentRunId = ++runId;
      setState((current) => ({ ...current, loading: true, detailLoading: false, error: null }));

      try {
        const [summaries, identityResolutionSnapshot] = await Promise.all([
          listGuildHubScanSummaries(),
          loadIdentityResolutionSnapshot().catch((error) => {
            console.warn("[GuildHubDashboard] identity resolution unavailable for dashboard scan scope", error);
            return null;
          }),
        ]);
        const sources = buildDashboardGuildSources(summaries, activeGuild, identityResolutionSnapshot);
        const latestSource = sources[0] ?? null;
        const comparisonSource = latestSource
          ? sources.find((source) => latestSource.scannedAtMs - source.scannedAtMs >= MIN_COMPARISON_DAYS * DAY_MS) ?? null
          : null;

        if (cancelled || currentRunId !== runId) return;

        if (!latestSource) {
          setState({ summaries, sources, latest: null, comparisonMembers: null, loading: false, detailLoading: false, error: null });
          return;
        }

        setState((current) => ({ ...current, summaries, sources, loading: false, detailLoading: true, error: null }));

        const [latestScan, comparisonMembers] = await Promise.all([
          getGuildHubLocalScan(latestSource.sourceScanId),
          readComparisonMembers(comparisonSource, activeGuild),
        ]);

        if (cancelled || currentRunId !== runId) return;

        const latest = latestScan ? buildGuildScanView(latestScan, activeGuild, latestSource) : null;
        setState({
          summaries,
          sources,
          latest,
          comparisonMembers,
          loading: false,
          detailLoading: false,
          error: latest ? null : "Lokale Scans konnten nicht geladen werden.",
        });
      } catch (error) {
        console.error("[GuildHubDashboard] failed to load local scan summaries", error);
        if (!cancelled && currentRunId === runId) {
          setState({
            summaries: [],
            sources: [],
            latest: null,
            comparisonMembers: null,
            loading: false,
            detailLoading: false,
            error: "Lokale Scans konnten nicht geladen werden.",
          });
        }
      }
    };

    load();
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeGuild]);

  return state;
}

function useDashboardLocalFirstAcquisition(
  activeGuild: GuildHubSelectedGuild | null,
  summaries: GuildHubScanSummary[],
  localLoading: boolean,
): DashboardArchiveInventoryState {
  const [state, setState] = React.useState<DashboardArchiveInventoryState>({
    archiveScanCount: null,
    loading: false,
    error: null,
  });
  const inventoryKey = React.useMemo(() => buildGuildTrendInventoryKey(summaries), [summaries]);

  React.useEffect(() => {
    if (!activeGuild) {
      setState({ archiveScanCount: null, loading: false, error: null });
      return undefined;
    }

    if (localLoading) {
      setState((current) => ({ ...current, loading: true, error: null }));
      return undefined;
    }

    let stale = false;
    setState((current) => ({ ...current, loading: true, error: null }));

    acquireDashboardLocalFirstFeatureScans(activeGuild, {
      localScanSummaries: summaries,
    })
      .then((outcome) => {
        if (stale) return;
        if (outcome.status !== "completed") {
          setState({ archiveScanCount: null, loading: false, error: null });
          return;
        }

        const archiveScanCount = countUniqueArchiveEntries(outcome.result.preparedRequest.archiveEntries);
        setState({
          archiveScanCount: outcome.result.manifestStatus === "offline" ? null : archiveScanCount,
          loading: false,
          error: outcome.result.manifestStatus === "offline" ? "Archiv nicht verfuegbar" : null,
        });
      })
      .catch((error) => {
        if (stale) return;
        console.warn("[GuildHubDashboard] local-first archive acquisition failed; using local dashboard data", error);
        setState({ archiveScanCount: null, loading: false, error: "Archiv nicht verfuegbar" });
      });

    return () => {
      stale = true;
    };
  }, [activeGuild, inventoryKey, localLoading, summaries]);

  return state;
}

function useDashboardPlayerCards(
  activeGuild: GuildHubSelectedGuild | null,
  summaries: GuildHubScanSummary[],
  sources: DashboardGuildSource[],
  latest: LocalGuildScanView | null,
): DashboardPlayerCardsState {
  const [state, setState] = React.useState<DashboardPlayerCardsState>({
    items: [],
    progress: null,
    loading: false,
    error: null,
  });
  const activeRequestKeyRef = React.useRef<string | null>(null);
  const inventoryKey = React.useMemo(() => buildGuildTrendInventoryKey(summaries), [summaries]);
  const requestKey = React.useMemo(
    () =>
      [
        activeGuild?.id ?? "",
        activeGuild?.logoIdentifier ?? "",
        latest?.source.sourceScanId ?? "",
        latest?.scannedAtMs ?? "",
        latest ? sortDashboardMembers(latest.members).map((member) => member.key).join(",") : "",
        inventoryKey,
      ].join(":"),
    [activeGuild?.id, activeGuild?.logoIdentifier, inventoryKey, latest],
  );

  React.useEffect(() => {
    if (!activeGuild || !latest) {
      activeRequestKeyRef.current = null;
      setState({ items: [], progress: null, loading: false, error: null });
      return undefined;
    }

    const sortedMembers = sortDashboardMembers(latest.members);
    const staticItems = buildDashboardStaticPlayerCardItems({
      members: sortedMembers,
      playerLookup: latest.playerLookup,
      developmentStatus: "loading",
    });
    const cachedItems = dashboardPlayerCardsDevelopmentCache.get(requestKey);
    if (cachedItems) {
      setState({ items: cachedItems, progress: null, loading: false, error: null });
      return undefined;
    }

    const summaryById = new Map(summaries.map((summary) => [summary.sourceScanId, summary]));
    const dashboardSummaries = [
      ...new Map(
        sources
          .filter((source) => source.scannedAtMs <= latest.scannedAtMs)
          .map((source) => summaryById.get(source.sourceScanId) ?? null)
          .filter((summary): summary is GuildHubScanSummary => Boolean(summary))
          .map((summary) => [summary.sourceScanId, summary]),
      ).values(),
    ];

    if (!dashboardSummaries.length) {
      setState({
        items: staticItems.map((item) => ({ ...item, developmentStatus: "unavailable" })),
        progress: null,
        loading: false,
        error: null,
      });
      return undefined;
    }

    let cancelled = false;
    let workerRun: LocalPlayerIndexWorkerRun | null = null;
    activeRequestKeyRef.current = requestKey;
    setState({ items: staticItems, progress: null, loading: true, error: null });

    workerRun = startLocalPlayerIndexWorkerRun({
      summaries: dashboardSummaries,
      serverFilter: normalizeServerForCompare(activeGuild.server),
      targetPlayerRefs: sortedMembers.map((member) => member.localRef?.identifier ?? member.localRef?.sourcePlayerKey ?? member.key),
      targetPlayerNames: sortedMembers.map((member) => member.name),
      includeCards: false,
      onProgress: (progress) => {
        if (!cancelled && activeRequestKeyRef.current === requestKey) {
          setState((current) => ({ ...current, progress }));
        }
      },
    });

    workerRun.promise
      .then(({ index }) => {
        if (cancelled || activeRequestKeyRef.current !== requestKey) return;
        const items = buildDashboardPlayerCardItems({
          members: sortedMembers,
          players: index.players,
          currentSourceScanId: latest.source.sourceScanId,
          currentTimestampMs: latest.scannedAtMs,
          baseItems: staticItems,
          developmentStatus: "unavailable",
        });
        dashboardPlayerCardsDevelopmentCache.set(requestKey, items);
        setState({
          items,
          progress: null,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled || error instanceof LocalPlayerIndexWorkerCancelledError) return;
        console.error("[GuildHubDashboard] failed to build player cards", error);
        if (activeRequestKeyRef.current === requestKey) {
          setState({
            items: staticItems.map((item) => ({
              ...item,
              developmentStatus: "error",
              developmentError: "Entwicklung konnte nicht geladen werden",
            })),
            progress: null,
            loading: false,
            error: "Player Cards konnten nicht berechnet werden.",
          });
        }
      });

    return () => {
      cancelled = true;
      if (activeRequestKeyRef.current === requestKey) activeRequestKeyRef.current = null;
      workerRun?.cancel();
    };
  }, [activeGuild, inventoryKey, latest, requestKey, sources, summaries]);

  return state;
}

function useDashboardGuildTrend(
  activeGuild: GuildHubSelectedGuild,
  summaries: GuildHubScanSummary[],
): GuildTrendState {
  const [state, setState] = React.useState<GuildTrendState>({
    result: null,
    progress: null,
    loading: false,
    error: null,
  });
  const activeRequestKeyRef = React.useRef<string | null>(null);
  const inventoryKey = React.useMemo(() => buildGuildTrendInventoryKey(summaries), [summaries]);
  const guildTarget = React.useMemo(
    () => ({
      guildId: activeGuild.guildId,
      logoIdentifier: activeGuild.logoIdentifier,
      server: activeGuild.server,
    }),
    [activeGuild.guildId, activeGuild.logoIdentifier, activeGuild.server],
  );
  const requestKey = React.useMemo(
    () => buildDashboardGuildTrendRequestKey(guildTarget, inventoryKey),
    [guildTarget, inventoryKey],
  );

  React.useEffect(() => {
    if (!summaries.length) {
      activeRequestKeyRef.current = null;
      setState({ result: null, progress: null, loading: false, error: null });
      return undefined;
    }

    let cancelled = false;
    let workerRun: PlayerPerformanceWorkerRun | null = null;
    activeRequestKeyRef.current = requestKey;
    setState({ result: null, progress: null, loading: true, error: null });

    workerRun = startPlayerPerformanceWorkerRun({
      summaries,
      guildTarget,
      onProgress: (progress) => {
        if (!cancelled && activeRequestKeyRef.current === requestKey) {
          setState((current) => ({ ...current, progress }));
        }
      },
    });

    workerRun.promise
      .then((result) => {
        if (cancelled || activeRequestKeyRef.current !== requestKey) return;
        setState({ result, progress: null, loading: false, error: null });
      })
      .catch((error) => {
        if (cancelled || error instanceof PlayerPerformanceWorkerCancelledError) return;
        console.error("[GuildHubDashboard] failed to build guild trend", error);
        if (activeRequestKeyRef.current === requestKey) {
          setState({ result: null, progress: null, loading: false, error: "Gildentrend konnte nicht berechnet werden." });
        }
      });

    return () => {
      cancelled = true;
      if (activeRequestKeyRef.current === requestKey) activeRequestKeyRef.current = null;
      workerRun?.cancel();
    };
  }, [guildTarget, requestKey, summaries.length]);

  return state;
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

function buildGuildTrendInventoryKey(summaries: GuildHubScanSummary[]) {
  return summaries
    .map((summary) => [
      summary.sourceScanId,
      summary.updatedAtIso ?? summary.updatedAt,
      summary.contentHash ?? "",
      summary.analyticsEnabled ? "analytics" : "raw",
    ].join(":"))
    .sort()
    .join("|");
}

function buildDashboardGuildSources(
  summaries: GuildHubScanSummary[],
  activeGuild: GuildHubSelectedGuild,
  identityResolutionSnapshot: Pick<IdentityResolutionSnapshot, "guilds"> | null = null,
): DashboardGuildSource[] {
  const sources = summaries.flatMap((summary) => {
    if (!isGuildHubScanAnalyticsEnabled(summary)) return [];
    const guild = summary.guilds.find((entry) => isSummaryGuildMatch(entry, activeGuild, identityResolutionSnapshot));
    if (!guild) return [];

    const scannedAt = resolveSummaryGuildScanTime(summary, guild);
    if (!scannedAt) return [];

    return [
      {
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

  return sources.sort(
    (a, b) =>
      b.scannedAtMs - a.scannedAtMs ||
      a.sourceFilename.localeCompare(b.sourceFilename, undefined, { sensitivity: "base" }) ||
      a.sourceScanId.localeCompare(b.sourceScanId),
  );
}

function countDashboardUserScans(sources: DashboardGuildSource[], summaries: GuildHubScanSummary[]) {
  const summaryById = new Map(summaries.map((summary) => [summary.sourceScanId, summary]));
  return sources.filter((source) => !summaryById.get(source.sourceScanId)?.archiveSource).length;
}

function countUniqueArchiveEntries(entries: readonly { id: string }[]) {
  return new Set(entries.map((entry) => entry.id)).size;
}

async function readComparisonMembers(
  source: DashboardGuildSource | null,
  activeGuild: GuildHubSelectedGuild,
): Promise<LocalMember[] | null> {
  if (!source) return null;

  try {
    const { isDerivedMemberInGuild, readGuildAnalyticsDerivedSource } = await import(
      "../../lib/guilds/localGuildAnalyticsStore"
    );
    const data = await readGuildAnalyticsDerivedSource(source.sourceScanId);
    const members = data.members
      .filter((member) => member.snapshotTimestamp === source.scannedAtMs && isDerivedMemberInGuild(member, activeGuild))
      .map(toLocalMemberFromDerived);

    return members.length ? members : null;
  } catch (error) {
    console.error("[GuildHubDashboard] failed to load derived comparison members", error);
    return null;
  }
}

function toLocalMemberFromDerived(member: GuildAnalyticsMemberSnapshot): LocalMember {
  const classMeta = getClassMetaById(member.classId);
  return {
    key: member.memberRef.toLowerCase(),
    name: member.name,
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
  guild: GuildHubLocalGuildIdentity,
  activeGuild: GuildHubSelectedGuild,
  identityResolutionSnapshot: Pick<IdentityResolutionSnapshot, "guilds"> | null = null,
) {
  const activeServer = normalizeServerForCompare(activeGuild.server);
  const guildServer = normalizeServerForCompare(guild.server);
  const serverMatches = !activeServer || !guildServer || activeServer === guildServer;
  const activeGuildSegment = normalizeGuildSegment(activeGuild.guildId) ?? normalizeGuildSegment(activeGuild.logoIdentifier);
  const sourceGuildSegment = normalizeGuildSegment(guild.guildIdentifier) ?? normalizeGuildSegment(guild.guildId);

  if (activeGuildSegment && sourceGuildSegment && activeGuildSegment === sourceGuildSegment && serverMatches) {
    return true;
  }

  if (identityResolutionSnapshot && summaryGuildIdentityMatches(guild, activeGuild, identityResolutionSnapshot) && serverMatches) {
    return true;
  }

  return Boolean(guild.name && normalizeLoose(guild.name) === normalizeLoose(activeGuild.name) && serverMatches);
}

function summaryGuildIdentityMatches(
  guild: GuildHubLocalGuildIdentity,
  activeGuild: GuildHubSelectedGuild,
  identityResolutionSnapshot: Pick<IdentityResolutionSnapshot, "guilds">,
) {
  const sourceIdentifiers = collectDashboardGuildIdentifierCandidates(guild.guildIdentifier ?? guild.guildId, guild.server);
  if (!sourceIdentifiers.length) return false;
  const activeIdentifiers = collectDashboardGuildIdentifierCandidates(activeGuild.logoIdentifier ?? activeGuild.guildId, activeGuild.server);
  for (const identifier of activeIdentifiers) {
    const resolution = resolveGuildIdentity(identityResolutionSnapshot, identifier);
    if (!resolution.resolved) continue;
    const aliases = new Set(
      resolution.aliasIdentifiers.flatMap((alias) => collectDashboardGuildIdentifierCandidates(alias, activeGuild.server)),
    );
    if (sourceIdentifiers.some((sourceIdentifier) => aliases.has(sourceIdentifier))) return true;
  }
  return false;
}

function collectDashboardGuildIdentifierCandidates(identifier: string | null | undefined, server: string | null | undefined) {
  const candidates = new Set<string>();
  const raw = String(identifier ?? "").trim().toLowerCase();
  const segment = normalizeGuildSegment(raw);
  const normalizedServer = normalizeServerForCompare(server) ?? normalizeServerForCompare(parseServerFromIdentifier(raw));
  if (raw) candidates.add(raw);
  if (segment) {
    candidates.add(segment);
    if (normalizedServer) candidates.add(`${normalizedServer}_${segment}`);
  }
  return [...candidates];
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

function GuildOverviewCard({
  guild,
  latest,
  userScanCount,
  archiveInventoryState,
  summaries,
}: {
  guild: GuildHubSelectedGuild;
  latest: LocalGuildScanView;
  userScanCount: number;
  archiveInventoryState: DashboardArchiveInventoryState;
  summaries: GuildHubScanSummary[];
}) {
  const [metric, setMetric] = React.useState<GuildTrendChartMetric>("base");
  const trendState = useDashboardGuildTrend(guild, summaries);
  const guildName = latest.guild.name ?? guild.name;
  const serverLabel = formatServerLabel(latest.guild.server ?? guild.server);
  const kpis = buildGuildOverviewKpis(latest, userScanCount, archiveInventoryState);
  const memberCount = latest.guild.memberCount ?? latest.members.length;
  const lastScanAtLabel = formatScanDateTimeLabel(latest.scannedAtIso);
  const lastScanDays = getScanAgeDays(latest.scannedAtMs);
  const activityPct = calculateGuildActivityPct(
    latest.members.map((member) => ({
      lastScanMs: member.lastScanMs ?? latest.scannedAtMs,
      lastActivityMs: member.lastActivityMs,
    })),
  );
  const guildCardKpis = buildDashboardGuildCardKpis(kpis, activityPct);

  return (
    <>
      <DashboardGuildCard
        className={styles.guildOverviewHero}
        coaString={latest.source.guild.coaString}
        guildName={guildName}
        serverLabel={serverLabel}
        memberCount={memberCount}
        hofRank={latest.guild.hofRank}
        lastScanAtLabel={lastScanAtLabel !== "—" ? lastScanAtLabel : null}
        lastScanDays={lastScanDays}
        kpis={guildCardKpis}
      />

      <div className={styles.guildOverviewTrend}>
        <div className={styles.guildTrendHeader}>
          <div>
            <p className={styles.kicker}>Gildentrend</p>
            <h2>Gildentrend</h2>
          </div>
          <div className={styles.guildTrendToggle} aria-label="Kennzahl auswählen">
            <button type="button" data-active={metric === "xp"} onClick={() => setMetric("xp")}>XP</button>
            <button type="button" data-active={metric === "base"} onClick={() => setMetric("base")}>Basiswerte</button>
          </div>
        </div>
        <DashboardGuildTrendBody metric={metric} state={trendState} />
      </div>
    </>
  );
}

function DashboardGuildTrendBody({
  metric,
  state,
}: {
  metric: GuildTrendChartMetric;
  state: GuildTrendState;
}) {
  if (state.loading) {
    return (
      <div className={styles.guildTrendState}>
        <DataHubLoadingState
          variant="inline"
          title="Gildentrend wird geladen"
          message={state.progress?.message ?? "Lokale Analytics-Daten werden vorbereitet."}
        />
      </div>
    );
  }

  if (state.error) {
    return <div className={styles.guildTrendState}>{state.error}</div>;
  }

  if (!state.result || state.result.status === "empty" || state.result.status === "missing-guild") {
    return <div className={styles.guildTrendState}>{state.result?.message ?? "Keine verwertbaren Gildendaten gefunden."}</div>;
  }

  if (state.result.intervals.length < 1) {
    return (
      <div className={styles.guildTrendState}>
        {state.result.message ?? "Für diese Gilde wurden weniger als zwei vollständige historische Snapshots gefunden."}
      </div>
    );
  }

  const hasMetricData = state.result.intervals.some((interval) => {
    const values = metric === "xp" ? interval.xp : interval.base;
    return Number.isFinite(values.startAverage) && Number.isFinite(values.endAverage) && Number.isFinite(values.perDay);
  });
  if (!hasMetricData) {
    return (
      <div className={styles.guildTrendState}>
        {metric === "xp" ? "Keine verwertbaren XP-Daten verfügbar." : "Keine verwertbaren Basiswertdaten verfügbar."}
      </div>
    );
  }

  return (
    <GuildTrendChart
      className={styles.guildTrendChart}
      title={metric === "xp" ? "Gilden-XP-Trend" : "Gilden-Basiswerte-Trend"}
      metric={metric}
      intervals={state.result.intervals}
      showTrendInfo
    />
  );
}

function DashboardMembersPanel({
  className,
  members,
  playerCardsState,
  onMemberClick,
}: {
  className?: string;
  members: LocalMember[];
  playerCardsState: DashboardPlayerCardsState;
  onMemberClick: (member: LocalMember) => void;
}) {
  const [view, setView] = React.useState<DashboardMemberView>(DEFAULT_DASHBOARD_MEMBER_VIEW);
  const sorted = React.useMemo(() => sortDashboardMembers(members), [members]);
  const visibleItemCount = view === "cards" ? Math.max(sorted.length, playerCardsState.items.length) : sorted.length;
  const rowSpan = calculateDashboardMembersGridRowSpan({
    view,
    itemCount: visibleItemCount,
    hasCardsError: view === "cards" && Boolean(playerCardsState.error),
  });
  const style = React.useMemo<DashboardMembersPanelStyle>(
    () => ({ "--dashboard-members-row-span": rowSpan }),
    [rowSpan],
  );

  return (
    <section className={[styles.panel, styles.memberPanel, className].filter(Boolean).join(" ")} style={style}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Aktuelle Memberliste</p>
          <h2>Mitglieder</h2>
        </div>
        <div className={styles.memberPanelActions}>
          <div className={styles.memberViewToggle} role="tablist" aria-label="Mitgliederansicht">
            <button type="button" role="tab" aria-selected={view === "cards"} data-active={view === "cards"} onClick={() => setView("cards")}>
              Cards
            </button>
            <button type="button" role="tab" aria-selected={view === "list"} data-active={view === "list"} onClick={() => setView("list")}>
              Liste
            </button>
          </div>
          <span className={styles.countBadge}>{formatInteger(sorted.length)}</span>
        </div>
      </div>

      <div className={styles.memberEntriesScroll}>
        {view === "cards" ? (
          <DashboardPlayerCardGrid state={playerCardsState} fallbackMembers={sorted} onMemberClick={onMemberClick} />
        ) : sorted.length ? (
          <div className={styles.memberList}>
            {sorted.map((member) => (
              <MemberRow key={member.key} member={member} onClick={onMemberClick} />
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>Im neuesten Scan sind keine eindeutig zugeordneten Mitglieder enthalten.</p>
        )}
      </div>
    </section>
  );
}

function calculateDashboardMembersGridRowSpan({
  view,
  itemCount,
  hasCardsError,
}: {
  view: DashboardMemberView;
  itemCount: number;
  hasCardsError: boolean;
}) {
  const entryHeight = view === "cards" ? DASHBOARD_MEMBER_CARD_HEIGHT_PX : DASHBOARD_MEMBER_LIST_ROW_HEIGHT_PX;
  const entryGap = view === "cards" ? DASHBOARD_MEMBER_CARD_GAP_PX : DASHBOARD_MEMBER_LIST_GAP_PX;
  const entriesHeight = itemCount > 0
    ? itemCount * entryHeight + Math.max(0, itemCount - 1) * entryGap
    : 18;
  const errorHeight = hasCardsError ? DASHBOARD_MEMBER_CARDS_ERROR_HEIGHT_PX : 0;
  const totalHeight = DASHBOARD_MEMBER_PANEL_CHROME_HEIGHT_PX + entriesHeight + errorHeight;

  return Math.max(
    DASHBOARD_MEMBER_MIN_ROW_SPAN,
    Math.ceil((totalHeight + DASHBOARD_GRID_GAP_PX) / (DASHBOARD_GRID_ROW_HEIGHT_PX + DASHBOARD_GRID_GAP_PX)),
  );
}

function DashboardPlayerCardGrid({
  state,
  fallbackMembers,
  onMemberClick,
}: {
  state: DashboardPlayerCardsState;
  fallbackMembers: LocalMember[];
  onMemberClick: (member: LocalMember) => void;
}) {
  const items = state.items.length
    ? state.items
    : buildDashboardPlayerCardItems({
        members: fallbackMembers,
        players: [],
        currentSourceScanId: "",
        currentTimestampMs: 0,
        developmentStatus: state.error ? "error" : state.loading ? "loading" : "unavailable",
        developmentError: state.error ? "Entwicklung konnte nicht geladen werden" : null,
      });

  return (
    <div className={styles.memberCardsArea}>
      {state.error ? <p className={styles.memberCardsError}>{state.error}</p> : null}
      {items.length ? (
        <div className={styles.memberCardGrid}>
          {items.map((item) => (
            <DashboardMemberCard key={item.member.key} item={item} onClick={() => onMemberClick(item.member)} />
          ))}
        </div>
      ) : (
        <p className={styles.emptyText}>Im neuesten Scan sind keine eindeutig zugeordneten Mitglieder enthalten.</p>
      )}
    </div>
  );
}

function MemberRow({ member, onClick }: { member: LocalMember; onClick: (member: LocalMember) => void }) {
  const secondary = [
    member.classLabel ?? "Klasse unbekannt",
    typeof member.level === "number" ? `Lv. ${formatInteger(member.level)}` : null,
  ].filter(Boolean);
  const score =
    typeof member.honor === "number"
      ? formatInteger(member.honor)
      : typeof member.hofRank === "number"
        ? `#${formatInteger(member.hofRank)}`
        : null;

  return (
    <button type="button" className={styles.memberRow} onClick={() => onClick(member)}>
      <ClassIcon classLabel={member.classLabel} classMeta={member.classMeta} fallbackText={member.name} />
      <div className={styles.memberIdentity}>
        <span className={styles.memberName}>{member.name}</span>
        <span className={styles.memberSubline}>{secondary.join(" · ") || "Keine Detaildaten"}</span>
      </div>
      <div className={styles.memberScore}>
        <span>{score ?? "-"}</span>
        <small>Ehre/HoF</small>
      </div>
    </button>
  );
}

function KpiPanel({ className, latest }: { className?: string; latest: LocalGuildScanView }) {
  const classDistribution = buildClassDistribution(latest.members);

  return (
    <section className={[styles.panel, className].filter(Boolean).join(" ")}>
      {classDistribution.length ? (
        <div className={styles.classDistribution}>
          <p className={styles.subhead}>Klassenverteilung</p>
          {classDistribution.map((entry) => (
            <div key={entry.classLabel} className={styles.classLine}>
              <span className={styles.classLineLabel}>
                <ClassIcon classLabel={entry.classLabel} classMeta={entry.classMeta} fallbackText={entry.classLabel} compact />
                <span>{entry.classLabel}</span>
              </span>
              <strong>{formatInteger(entry.count)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.emptyText}>Keine Klassendaten im neuesten Scan gefunden.</p>
      )}
    </section>
  );
}

function HistoryPanel({
  className,
  latest,
  comparison,
  transfers,
}: {
  className?: string;
  latest: LocalGuildScanView;
  comparison: DashboardGuildSource | null;
  transfers: TransferSummary | null;
}) {
  const comparisonLabel = comparison
    ? `Vergleich: ${formatScanDateTimeLabel(comparison.scannedAtIso)} -> ${formatScanDateTimeLabel(latest.scannedAtIso)}`
    : null;
  const daySpan = comparison ? Math.floor((latest.scannedAtMs - comparison.scannedAtMs) / DAY_MS) : null;

  return (
    <section className={[styles.panel, className].filter(Boolean).join(" ")}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Historische Teaser</p>
          <h2>{daySpan != null ? `${formatInteger(daySpan)} Tage` : "Vergleich"}</h2>
        </div>
      </div>

      {comparisonLabel ? <p className={styles.compareLabel}>{comparisonLabel}</p> : null}

      <div className={styles.teaserStack}>
        <TeaserCard icon={<TrendingUp size={16} aria-hidden />} title="Top 3">
          <p className={styles.emptyText}>{comparison ? "Noch keine eindeutige lokale Delta-Kennzahl vorhanden." : comparisonNeededText()}</p>
        </TeaserCard>
        <TeaserCard icon={<TrendingDown size={16} aria-hidden />} title="Flop 3">
          <p className={styles.emptyText}>{comparison ? "Noch keine eindeutige lokale Delta-Kennzahl vorhanden." : comparisonNeededText()}</p>
        </TeaserCard>
        <TeaserCard icon={<Users size={16} aria-hidden />} title="Zu- & Abgaenge">
          {comparison && transfers ? (
            <TransfersView transfers={transfers} />
          ) : (
            <p className={styles.emptyText}>{comparisonNeededText()}</p>
          )}
        </TeaserCard>
      </div>
    </section>
  );
}

function TransfersView({ transfers }: { transfers: TransferSummary }) {
  return (
    <div className={styles.transferGrid}>
      <TransferList icon={<UserPlus size={14} aria-hidden />} label="Zugaenge" members={transfers.joined} />
      <TransferList icon={<UserMinus size={14} aria-hidden />} label="Abgaenge" members={transfers.left} />
    </div>
  );
}

function TransferList({
  icon,
  label,
  members,
}: {
  icon: React.ReactNode;
  label: string;
  members: LocalMember[];
}) {
  const visible = members.slice(0, 3);
  const remaining = members.length - visible.length;

  return (
    <div className={styles.transferList}>
      <div className={styles.transferTitle}>
        {icon}
        <span>{label}</span>
        <strong>{formatInteger(members.length)}</strong>
      </div>
      {visible.length ? (
        <ul>
          {visible.map((member) => (
            <li key={member.key}>{member.name}</li>
          ))}
          {remaining > 0 ? <li>+{formatInteger(remaining)} weitere</li> : null}
        </ul>
      ) : (
        <p className={styles.emptyText}>Keine.</p>
      )}
    </div>
  );
}

function TeaserCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.teaserCard}>
      <div className={styles.teaserTitle}>
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function ClassIcon({
  classLabel,
  classMeta,
  fallbackText,
  compact = false,
}: {
  classLabel: string | null;
  classMeta?: ClassMeta | null;
  fallbackText: string;
  compact?: boolean;
}) {
  const icon = iconForClassName(classLabel);
  const iconUrl = toDriveThumbProxy(classMeta?.iconUrl ?? icon.url, compact ? 28 : 36);
  const fallback = classMeta?.fallback ?? getInitials(fallbackText);

  return (
    <span className={`${styles.classIcon} ${compact ? styles.classIconCompact : ""}`} aria-hidden="true">
      {iconUrl ? <img src={iconUrl} alt="" loading="lazy" /> : <span>{fallback}</span>}
    </span>
  );
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

function buildGuildScanView(
  scan: GuildHubLocalScan,
  activeGuild: GuildHubSelectedGuild,
  source: DashboardGuildSource,
): LocalGuildScanView | null {
  const raw = asRawScan(scan.rawData, source.scannedAtMs);
  if (!raw) return null;

  const activeServer = normalizeServerForCompare(activeGuild.server);
  const activeGuildSegment = normalizeGuildSegment(activeGuild.guildId) ?? normalizeGuildSegment(activeGuild.logoIdentifier);
  const group = raw.groups.find((entry) => isGroupMatch(entry, activeGuild, activeServer, activeGuildSegment)) ?? null;
  const normalizedMembers = normalizeGuildScanMembers(raw);
  const snapshotMembers = normalizedMembers.filter((member) => isNormalizedMemberInActiveGuild(member, activeGuild, activeServer, activeGuildSegment));
  const rawPlayersByKey = buildRawPlayerLookup(raw.players, activeServer, source.sourceScanId);
  const playerLookup = new Map<string, JsonRecord>();
  const members = snapshotMembers
    .map((member) =>
      toLocalMemberFromSnapshotMember(
        member,
        source.sourceScanId,
        source.scannedAtMs,
        rawPlayersByKey.get(member.memberRef.toLowerCase()) ?? null,
      ),
    )
    .filter((member): member is LocalMember => Boolean(member));
  members.forEach((member) => {
    const rawPlayer = member.localRef ? rawPlayersByKey.get(member.localRef.sourcePlayerKey.toLowerCase()) ?? null : null;
    if (rawPlayer && member.localRef) playerLookup.set(member.localRef.sourcePlayerKey, rawPlayer);
  });

  return {
    source,
    scannedAtMs: source.scannedAtMs,
    scannedAtIso: source.scannedAtIso,
    guild: {
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
  };
}

function isNormalizedMemberInActiveGuild(
  member: NormalizedGuildMember,
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

function buildRawPlayerLookup(players: JsonRecord[], fallbackServer: string | null, sourceScanId: string) {
  const nameCounts = buildPlayerNameCounts(players);
  const lookup = new Map<string, JsonRecord>();
  players.forEach((player) => {
    const key = resolveLocalPlayerKey(player, fallbackServer, sourceScanId, nameCounts);
    if (key && !lookup.has(key.toLowerCase())) lookup.set(key.toLowerCase(), player);
  });
  return lookup;
}

function toLocalMemberFromSnapshotMember(
  member: NormalizedGuildMember,
  sourceScanId: string,
  sourceScannedAtMs: number,
  rawPlayer: JsonRecord | null,
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
    hofRank: null,
    baseMain: member.baseStats,
    totalStats: member.totalStats,
    lastScanMs: rawLastScanMs ?? sourceScannedAtMs,
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

function asRawScan(value: unknown, snapshotTimestampMs: number): { players: JsonRecord[]; groups: JsonRecord[] } | null {
  const record = asRecord(value);
  if (!record) return null;
  const rawPlayers = Array.isArray(record.players) ? record.players : [];
  const rawGroups = Array.isArray(record.groups) ? record.groups : Array.isArray(record.guilds) ? record.guilds : [];
  const players = filterEntriesForSnapshot(rawPlayers, snapshotTimestampMs);
  const groups = filterEntriesForSnapshot(rawGroups, snapshotTimestampMs);
  if (!players.length && !groups.length) return null;
  return {
    players: players.map(asRecord).filter((entry): entry is JsonRecord => Boolean(entry)),
    groups: groups.map(asRecord).filter((entry): entry is JsonRecord => Boolean(entry)),
  };
}

function filterEntriesForSnapshot(entries: unknown[], snapshotTimestampMs: number) {
  const timestampedEntries = entries.filter((entry) => getEntryTimestampMs(entry) != null);
  if (!timestampedEntries.length) return entries;
  return timestampedEntries.filter((entry) => getEntryTimestampMs(entry) === snapshotTimestampMs);
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



function buildPlayerNameCounts(players: JsonRecord[]) {
  const counts = new Map<string, number>();
  players.forEach((player) => {
    const name = readString(player, ["name", "Name", "playerName", "Player Name"]);
    const key = name ? normalizeLoose(name) : "";
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
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

function buildTransferSummary(latest: LocalMember[], previous: LocalMember[]): TransferSummary {
  const latestKeys = new Set(latest.map((member) => member.key));
  const previousKeys = new Set(previous.map((member) => member.key));
  return {
    joined: latest.filter((member) => !previousKeys.has(member.key)),
    left: previous.filter((member) => !latestKeys.has(member.key)),
  };
}

function buildGuildOverviewKpis(
  latest: LocalGuildScanView,
  userScanCount: number,
  archiveInventoryState: DashboardArchiveInventoryState,
): DashboardGuildCardKpi[] {
  const members = latest.members;
  const memberCount = latest.guild.memberCount ?? members.length;
  const avgLevel = average(members.map((member) => member.level).filter(isNumber));
  const avgBaseMain = average(members.map((member) => member.baseMain).filter(isNumber));
  const avgTotalStats = average(members.map((member) => member.totalStats).filter(isNumber));
  const archiveScanValue = archiveInventoryState.archiveScanCount == null
    ? archiveInventoryState.loading
      ? "..."
      : "-"
    : formatInteger(archiveInventoryState.archiveScanCount);

  return [
    { key: "scanstand", label: "Scanstand", value: formatScanDateTimeLabel(latest.scannedAtIso), hint: formatAge(latest.scannedAtMs) },
    { key: "members", label: "Mitglieder", value: formatInteger(memberCount), hint: `${formatInteger(latest.members.length)} im Scan` },
    { key: "avg-level", label: "Ø Level", value: avgLevel != null ? formatDecimal(avgLevel) : "-", hint: "Memberliste" },
    { key: "avg-base", label: "Ø Base", value: avgBaseMain != null ? formatInteger(Math.round(avgBaseMain)) : "-", hint: "direktes Scan-Feld" },
    {
      key: "avg-total",
      label: "Ø Gesamtstats",
      value: avgTotalStats != null ? formatInteger(Math.round(avgTotalStats)) : "-",
      hint: "direktes Scan-Feld",
    },
    { key: "user-scans", label: "User-Scans", value: formatInteger(userScanCount), hint: "aktive Gilde" },
    {
      key: "archive-scans",
      label: "Scan-Archiv",
      value: archiveScanValue,
      hint: archiveInventoryState.error ?? "verfuegbare Historie",
    },
  ];
}

function buildDashboardGuildCardKpis(
  dashboardKpis: DashboardGuildCardKpi[],
  activityPct: number | null,
): DashboardGuildCardKpi[] {
  return [
    ...dashboardKpis,
    {
      key: "activity",
      label: "Aktivität",
      value: formatActivityPercent(activityPct),
      hint: "Activity",
    },
  ];
}

function formatActivityPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.max(0, Math.min(100, Math.round(value)))} %`;
}

function buildClassDistribution(members: LocalMember[]) {
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

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.classLabel.localeCompare(b.classLabel))
    .slice(0, 8);
}

function parseTimestampMs(value: string | null | undefined) {
  const scanned = value ? Date.parse(value) : NaN;
  if (Number.isFinite(scanned)) return scanned;
  return null;
}

function getEntryTimestampMs(entry: unknown) {
  const record = asRecord(entry);
  if (!record) return null;
  return readTimestampMs(record, ["scannedAt", "scanAt", "timestamp", "timestampSec", "timestampRaw"]);
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

function comparisonNeededText() {
  return "Fuer diese Uebersicht wird ein weiterer Scan mit mindestens 30 Tagen Abstand benoetigt.";
}

function formatServerLabel(server: string | null) {
  if (!server) return "Server unbekannt";
  const normalized = normalizeServerKeyFromInput(server);
  return SERVER_BY_ID[String(normalized ?? server).trim().toLowerCase()]?.label ?? server;
}

function formatAge(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "Alter unbekannt";
  const days = Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));
  if (days === 0) return "heute";
  if (days === 1) return "1 Tag alt";
  return `${formatInteger(days)} Tage alt`;
}

function getScanAgeDays(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value);
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
  return normalizeServerKeyFromInput(value)?.toLowerCase() ?? null;
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

function getInitials(value: string) {
  const initials = value
    .split(/[\s_-]+/g)
    .map((part) => part.trim().charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "-";
}
