import React from "react";
import { BarChart3, TrendingDown, TrendingUp, UserMinus, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import ContentShell from "../../components/ContentShell";
import GuildContextBar from "../../components/guilds/GuildContextBar";
import SectionDividerHeader from "../../components/ui/shared/SectionDividerHeader";
import { getClassMetaById, iconForClassName, type ClassMeta } from "../../data/classes";
import { guildIconByIdentifier } from "../../data/guilds";
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
import type { GuildAnalyticsMemberSnapshot } from "../../lib/guilds/localGuildAnalyticsStore";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import { toDriveThumbProxy } from "../../lib/urls";
import { useGuildHubSelection, type GuildHubSelectedGuild } from "./hooks/useGuildHubSelection";
import styles from "./Dashboard.module.css";

const DAY_MS = 86_400_000;
const MIN_COMPARISON_DAYS = 30;

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
  sources: DashboardGuildSource[];
  latest: LocalGuildScanView | null;
  comparisonMembers: LocalMember[] | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
};

type TransferSummary = {
  joined: LocalMember[];
  left: LocalMember[];
};

export default function GuildHubDashboard() {
  const { activeGuild } = useGuildHubSelection();
  const scanState = useDashboardScans(activeGuild);

  const latest = scanState.latest;
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

  return (
    <ContentShell centerFramed={false}>
      <div className={styles.page}>
        <div className={styles.topbar}>
          <GuildContextBar />
          <SectionDividerHeader title="Dashboard" className={styles.divider} />
        </div>

        {!activeGuild ? (
          <EmptyPanel
            title="Keine aktive Gilde"
            text="Waehle zuerst im Guild-Hub-Startmenue eine Gilde aus. Das Dashboard trifft hier keine automatische Auswahl."
            action={<Link to="/guild-hub">Zur Gildenauswahl</Link>}
          />
        ) : scanState.loading || scanState.detailLoading ? (
          <EmptyPanel title="Lokale Scans werden geladen" text="Die IndexedDB-Bibliothek wird gelesen." />
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
            <div className={styles.leftColumn}>
              <GuildOverviewCard guild={activeGuild} latest={latest} scanCount={scanState.sources.length} />
              <MemberListCard members={latest.members} />
            </div>
            <div className={styles.rightColumn}>
              <KpiPanel latest={latest} scanCount={scanState.sources.length} />
              <HistoryPanel latest={latest} comparison={comparison} transfers={transfers} />
            </div>
          </div>
        )}
      </div>
    </ContentShell>
  );
}

function useDashboardScans(activeGuild: GuildHubSelectedGuild | null): ScanState {
  const [state, setState] = React.useState<ScanState>({
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
      setState({ sources: [], latest: null, comparisonMembers: null, loading: false, detailLoading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      const currentRunId = ++runId;
      setState((current) => ({ ...current, loading: true, detailLoading: false, error: null }));

      try {
        const summaries = await listGuildHubScanSummaries();
        const sources = buildDashboardGuildSources(summaries, activeGuild);
        const latestSource = sources[0] ?? null;
        const comparisonSource = latestSource
          ? sources.find((source) => latestSource.scannedAtMs - source.scannedAtMs >= MIN_COMPARISON_DAYS * DAY_MS) ?? null
          : null;

        if (cancelled || currentRunId !== runId) return;

        if (!latestSource) {
          setState({ sources, latest: null, comparisonMembers: null, loading: false, detailLoading: false, error: null });
          return;
        }

        setState((current) => ({ ...current, sources, loading: false, detailLoading: true, error: null }));

        const [latestScan, comparisonMembers] = await Promise.all([
          getGuildHubLocalScan(latestSource.sourceScanId),
          readComparisonMembers(comparisonSource, activeGuild),
        ]);

        if (cancelled || currentRunId !== runId) return;

        const latest = latestScan ? buildGuildScanView(latestScan, activeGuild, latestSource) : null;
        setState({
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

function buildDashboardGuildSources(
  summaries: GuildHubScanSummary[],
  activeGuild: GuildHubSelectedGuild,
): DashboardGuildSource[] {
  const sources = summaries.flatMap((summary) => {
    if (!isGuildHubScanAnalyticsEnabled(summary)) return [];
    const guild = summary.guilds.find((entry) => isSummaryGuildMatch(entry, activeGuild));
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
  };
}

function isSummaryGuildMatch(guild: GuildHubLocalGuildIdentity, activeGuild: GuildHubSelectedGuild) {
  const activeServer = normalizeServerForCompare(activeGuild.server);
  const guildServer = normalizeServerForCompare(guild.server);
  const serverMatches = !activeServer || !guildServer || activeServer === guildServer;
  const activeGuildSegment = normalizeGuildSegment(activeGuild.guildId) ?? normalizeGuildSegment(activeGuild.logoIdentifier);
  const sourceGuildSegment = normalizeGuildSegment(guild.guildIdentifier) ?? normalizeGuildSegment(guild.guildId);

  if (activeGuildSegment && sourceGuildSegment && activeGuildSegment === sourceGuildSegment && serverMatches) {
    return true;
  }

  return Boolean(guild.name && normalizeLoose(guild.name) === normalizeLoose(activeGuild.name) && serverMatches);
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
  scanCount,
}: {
  guild: GuildHubSelectedGuild;
  latest: LocalGuildScanView;
  scanCount: number;
}) {
  const emblem = guildIconByIdentifier(guild.logoIdentifier, 160);
  const guildName = latest.guild.name ?? guild.name;
  const serverLabel = formatServerLabel(latest.guild.server ?? guild.server);
  const memberCount = latest.guild.memberCount ?? latest.members.length;

  return (
    <section className={styles.panel}>
      <div className={styles.guildHero}>
        <div className={styles.guildEmblem}>
          {emblem.thumb ? (
            <img src={emblem.thumb} alt={`${guildName} Wappen`} />
          ) : (
            <span>{guildName.trim().charAt(0).toUpperCase() || "G"}</span>
          )}
        </div>
        <div className={styles.guildText}>
          <p className={styles.kicker}>Aktive Gilde</p>
          <h1>{guildName}</h1>
          <div className={styles.guildMeta}>
            <span>{serverLabel}</span>
            {typeof latest.guild.hofRank === "number" ? <span>HoF #{formatInteger(latest.guild.hofRank)}</span> : null}
          </div>
        </div>
      </div>

      <div className={styles.factGrid}>
        <Fact label="Scanstand" value={formatScanDateTimeLabel(latest.scannedAtIso)} hint={formatAge(latest.scannedAtMs)} />
        <Fact label="Mitglieder" value={formatInteger(memberCount)} hint={`${formatInteger(latest.members.length)} im Scan`} />
        <Fact label="Lokale Scans" value={formatInteger(scanCount)} hint="aktive Gilde" />
      </div>
    </section>
  );
}

function MemberListCard({ members }: { members: LocalMember[] }) {
  const sorted = React.useMemo(
    () =>
      [...members].sort(
        (a, b) =>
          (b.level ?? -1) - (a.level ?? -1) ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [members],
  );

  return (
    <section className={`${styles.panel} ${styles.memberPanel}`}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Aktuelle Memberliste</p>
          <h2>Mitglieder</h2>
        </div>
        <span className={styles.countBadge}>{formatInteger(sorted.length)}</span>
      </div>

      {sorted.length ? (
        <div className={styles.memberList}>
          {sorted.map((member) => (
            <MemberRow key={member.key} member={member} />
          ))}
        </div>
      ) : (
        <p className={styles.emptyText}>Im neuesten Scan sind keine eindeutig zugeordneten Mitglieder enthalten.</p>
      )}
    </section>
  );
}

function MemberRow({ member }: { member: LocalMember }) {
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
    <div className={styles.memberRow}>
      <ClassIcon classLabel={member.classLabel} classMeta={member.classMeta} fallbackText={member.name} />
      <div className={styles.memberIdentity}>
        <span className={styles.memberName}>{member.name}</span>
        <span className={styles.memberSubline}>{secondary.join(" · ") || "Keine Detaildaten"}</span>
      </div>
      <div className={styles.memberScore}>
        <span>{score ?? "-"}</span>
        <small>Ehre/HoF</small>
      </div>
    </div>
  );
}

function KpiPanel({ latest, scanCount }: { latest: LocalGuildScanView; scanCount: number }) {
  const kpis = buildKpis(latest, scanCount);
  const classDistribution = buildClassDistribution(latest.members);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Aktuelle Kennzahlen</p>
          <h2>Snapshot</h2>
        </div>
        <BarChart3 size={18} aria-hidden />
      </div>

      <div className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <Fact key={kpi.label} label={kpi.label} value={kpi.value} hint={kpi.hint} />
        ))}
      </div>

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
      ) : null}
    </section>
  );
}

function HistoryPanel({
  latest,
  comparison,
  transfers,
}: {
  latest: LocalGuildScanView;
  comparison: DashboardGuildSource | null;
  transfers: TransferSummary | null;
}) {
  const comparisonLabel = comparison
    ? `Vergleich: ${formatScanDateTimeLabel(comparison.scannedAtIso)} -> ${formatScanDateTimeLabel(latest.scannedAtIso)}`
    : null;
  const daySpan = comparison ? Math.floor((latest.scannedAtMs - comparison.scannedAtMs) / DAY_MS) : null;

  return (
    <section className={styles.panel}>
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

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
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
  const members = raw.players
    .filter((entry) => isPlayerInGuild(entry, activeGuild, activeServer, activeGuildSegment))
    .map((entry) => toLocalMember(entry, activeServer))
    .filter((member): member is LocalMember => Boolean(member));

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
        (group ? readNumber(group, ["guildMemberCount", "Guild Member Count", "memberCount", "members", "count"]) : members.length),
      hofRank:
        source.guild.hofRank ??
        (group ? readNumber(group, ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank", "guildRank"]) : null),
    },
    members,
  };
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

function isPlayerInGuild(
  player: JsonRecord,
  activeGuild: GuildHubSelectedGuild,
  activeServer: string | null,
  activeGuildSegment: string | null,
) {
  const playerServer = normalizeServerForCompare(
    readString(player, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(readString(player, ["identifier", "Identifier"])),
  );
  const serverMatches = !activeServer || !playerServer || activeServer === playerServer;
  const playerGuildSegment = normalizeGuildSegment(
    readString(player, ["guildIdentifier", "Guild Identifier", "group", "groupIdentifier", "groupId", "guildId", "Guild ID"]),
  );
  if (activeGuildSegment && playerGuildSegment) return activeGuildSegment === playerGuildSegment && serverMatches;

  const playerGuildName = readString(player, ["groupname", "groupName", "guildName", "guild", "Guild"]);
  return Boolean(playerGuildName && normalizeLoose(playerGuildName) === normalizeLoose(activeGuild.name) && serverMatches);
}

function toLocalMember(player: JsonRecord, fallbackServer: string | null): LocalMember | null {
  const identifier = readString(player, ["identifier", "Identifier"]);
  const playerId = readString(player, ["playerId", "Player ID", "id", "ID"]);
  const server = normalizeServerForCompare(
    readString(player, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(identifier) ?? fallbackServer,
  );
  const key = identifier ? identifier.toLowerCase() : playerId && server ? `${server}_p${playerId}` : playerId;
  if (!key) return null;

  const rawClassLabel = readString(player, ["class", "Class", "className", "Class Name"]);
  const classMeta = getClassMetaById(rawClassLabel);
  return {
    key,
    name: readString(player, ["name", "Name", "playerName", "Player Name"]) ?? key,
    classLabel: classMeta?.label ?? normalizeMemberClassLabel(rawClassLabel),
    classMeta,
    level: readNumber(player, ["level", "Level"]),
    honor: readNumber(player, ["honor", "Honor", "honour", "Honour", "arenaHonor", "Ehre"]),
    hofRank: readNumber(player, ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank"]),
    baseMain: readNumber(player, ["baseMain", "Base Main", "Base"]),
    totalStats: readNumber(player, ["totalStats", "Total Stats", "Total"]),
  };
}

function buildTransferSummary(latest: LocalMember[], previous: LocalMember[]): TransferSummary {
  const latestKeys = new Set(latest.map((member) => member.key));
  const previousKeys = new Set(previous.map((member) => member.key));
  return {
    joined: latest.filter((member) => !previousKeys.has(member.key)),
    left: previous.filter((member) => !latestKeys.has(member.key)),
  };
}

function buildKpis(latest: LocalGuildScanView, scanCount: number) {
  const members = latest.members;
  const avgLevel = average(members.map((member) => member.level).filter(isNumber));
  const avgBaseMain = average(members.map((member) => member.baseMain).filter(isNumber));
  const avgTotalStats = average(members.map((member) => member.totalStats).filter(isNumber));

  return [
    { label: "Mitglieder", value: formatInteger(latest.guild.memberCount ?? members.length), hint: "neuester Scan" },
    avgLevel != null ? { label: "Durchschnittslevel", value: formatDecimal(avgLevel), hint: "Memberliste" } : null,
    avgBaseMain != null ? { label: "Ø Base", value: formatInteger(Math.round(avgBaseMain)), hint: "direktes Scan-Feld" } : null,
    avgTotalStats != null ? { label: "Ø Gesamtstats", value: formatInteger(Math.round(avgTotalStats)), hint: "direktes Scan-Feld" } : null,
    { label: "Lokale Scans", value: formatInteger(scanCount), hint: "aktive Gilde" },
  ].filter((entry): entry is { label: string; value: string; hint: string } => Boolean(entry));
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
