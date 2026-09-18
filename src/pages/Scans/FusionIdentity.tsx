import React from "react";
import { Check, Link2, Loader2, Search, Undo2, X } from "lucide-react";

import { subscribeToSfDataHubLocalScanChanges } from "../../lib/guilds/localScanLibrary";
import {
  confirmFusionIdentityLink,
  loadFusionIdentityManagementReport,
  mergeReadyFusionIdentityItems,
  rejectFusionIdentityCandidate,
  unlinkFusionIdentityAlias,
  type FusionIdentityAliasOption,
  type FusionIdentityCandidate,
  type FusionIdentityEntityType,
  type FusionIdentityManagementItem,
  type FusionIdentityManagementReport,
  type FusionIdentityManagementStatus,
} from "../../lib/identities/fusionIdentityManagement";
import type { GuildFusionCandidate, GuildFusionMigrationEdge } from "../../lib/identities/guildFusionResolver";
import type { PlayerFusionCandidate } from "../../lib/identities/playerFusionResolver";
import styles from "./FusionIdentity.module.css";

type StatusFilter = "all" | FusionIdentityManagementStatus;
type TypeFilter = "all" | FusionIdentityEntityType;

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "review", label: "Needs Review" },
  { key: "unresolved", label: "Unresolved" },
  { key: "noHistory", label: "No Historical Data" },
  { key: "completed", label: "Completed" },
];

const TYPE_FILTERS: Array<{ key: TypeFilter; label: string }> = [
  { key: "all", label: "All types" },
  { key: "player", label: "Players" },
  { key: "guild", label: "Guilds" },
];

const CLASS_LABELS: Record<string, string> = {
  "1": "Warrior",
  "2": "Mage",
  "3": "Scout",
  "4": "Assassin",
  "5": "Berserker",
  "6": "Battle Mage",
  "7": "Demon Hunter",
  "8": "Druid",
  "9": "Bard",
  "10": "Necromancer",
  "11": "Paladin",
  "12": "Plague Doctor",
};

const normalizeSearch = (value: string) => value.trim().toLowerCase();
const formatNumber = (value: number) => new Intl.NumberFormat().format(value);
const formatShare = (value: number) => `${Math.round(value * 100)}%`;
const formatClass = (classId: string | null | undefined) => {
  const key = String(classId ?? "").trim();
  if (!key) return "Class unknown";
  return CLASS_LABELS[key] ?? `Class ${key}`;
};
const formatLevel = (level: number | null | undefined) => (level == null ? "Level unknown" : `Level ${level}`);
const formatDate = (timestamp: number | null | undefined) =>
  timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp)) : "-";

const statusLabel = (status: FusionIdentityManagementStatus) => {
  if (status === "noHistory") return "No Historical Data";
  if (status === "review") return "Needs Review";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const statusClassName = (status: FusionIdentityManagementStatus) => {
  if (status === "ready") return styles.statusHigh;
  if (status === "review") return styles.statusAmbiguous;
  if (status === "completed") return styles.statusSingle;
  if (status === "noHistory") return styles.statusNative;
  return styles.statusUnresolved;
};

const typeLabel = (type: FusionIdentityEntityType) => (type === "player" ? "Player" : "Guild");

function useFusionIdentityReport() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<FusionIdentityManagementReport | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await loadFusionIdentityManagementReport());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Fusion identity data could not be loaded.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    return subscribeToSfDataHubLocalScanChanges(() => {
      void load();
    });
  }, [load]);

  return { loading, error, report, reload: load };
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.summaryItem}>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.summaryValue}>{formatNumber(value)}</div>
    </div>
  );
}

function EvidenceChip({ positive, children }: { positive?: boolean; children: React.ReactNode }) {
  return <span className={`${styles.evidenceChip} ${positive ? styles.evidencePositive : styles.evidenceNeutral}`}>{children}</span>;
}

function DetailDataList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className={styles.dataList}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlayerEvidence({ candidate }: { candidate: PlayerFusionCandidate }) {
  return (
    <div className={styles.evidenceList}>
      <EvidenceChip positive={candidate.evidence.originMatches === true}>Origin matches</EvidenceChip>
      {candidate.evidence.sameClass === true ? <EvidenceChip positive>Same class</EvidenceChip> : null}
      {candidate.evidence.levelConsistent === true ? <EvidenceChip positive>Level consistent</EvidenceChip> : null}
      {candidate.evidence.exactName ? <EvidenceChip positive>Exact name</EvidenceChip> : null}
      {candidate.evidence.fusionBaseName ? <EvidenceChip positive>Fusion base name</EvidenceChip> : null}
      {candidate.evidence.sameGuild === true ? <EvidenceChip positive>Same raw guild</EvidenceChip> : null}
      {candidate.rejectReasons.map((reason) => (
        <EvidenceChip key={reason}>{reason}</EvidenceChip>
      ))}
    </div>
  );
}

function GuildEvidence({ candidate }: { candidate: GuildFusionCandidate }) {
  return (
    <div className={styles.evidenceList}>
      {candidate.autoEligible ? <EvidenceChip positive>V2 auto eligible</EvidenceChip> : <EvidenceChip>V2 review</EvidenceChip>}
      {candidate.exactName ? <EvidenceChip positive>Exact guild name</EvidenceChip> : null}
      {candidate.sameCoA ? <EvidenceChip positive>Same CoA</EvidenceChip> : null}
      {candidate.mutualDominant ? <EvidenceChip positive>Mutual dominant flow</EvidenceChip> : null}
      {candidate.matchedMemberCount > 0 ? <EvidenceChip positive>{candidate.matchedMemberCount} matched players</EvidenceChip> : null}
      {candidate.splitEvidence.relevant ? <EvidenceChip>Split evidence</EvidenceChip> : null}
      {candidate.convergenceEvidence.relevant ? <EvidenceChip>Convergence evidence</EvidenceChip> : null}
    </div>
  );
}

function CandidateRow({
  item,
  candidate,
  onConfirm,
  onReject,
}: {
  item: FusionIdentityManagementItem;
  candidate: FusionIdentityCandidate;
  onConfirm: (candidate: FusionIdentityCandidate) => void;
  onReject: (candidate: FusionIdentityCandidate) => void;
}) {
  const disabled = candidate.rejected || candidate.assignedToOtherIdentity;
  return (
    <article className={styles.candidateRow}>
      <div className={styles.actionRow}>
        <div>
          <div className={styles.playerName}>{candidate.historicalName ?? candidate.historicalIdentifier}</div>
          <div className={styles.muted}>
            {candidate.historicalIdentifier} · {candidate.historicalServer ?? "Server unknown"}
          </div>
        </div>
        <div className={styles.rowActions}>
          <button type="button" className={styles.closeButton} onClick={() => onConfirm(candidate)} disabled={disabled}>
            <Check size={15} aria-hidden /> Confirm identity
          </button>
          <button type="button" className={styles.closeButton} onClick={() => onReject(candidate)} disabled={candidate.rejected}>
            <X size={15} aria-hidden /> Reject
          </button>
        </div>
      </div>
      {candidate.assignedToOtherIdentity ? <p className={styles.muted}>Already linked to another identity.</p> : null}
      {candidate.rejected ? <p className={styles.muted}>Rejected for this current identity.</p> : null}
      {candidate.entityType === "player" ? (
        <>
          <div className={styles.muted}>
            {formatClass(candidate.evidence.oldClassId)} · {formatLevel(candidate.evidence.oldLevel)} ·{" "}
            {candidate.evidence.oldGuildName ?? candidate.evidence.oldGuildIdentifier ?? "Guild unknown"}
          </div>
          <PlayerEvidence candidate={candidate.evidence} />
        </>
      ) : (
        <>
          <div className={styles.muted}>
            Flow: {candidate.evidence.matchedMemberCount}/{candidate.evidence.oldMappedMemberCount || "?"} from old (
            {formatShare(candidate.evidence.oldShare)}) · {candidate.evidence.matchedMemberCount}/
            {candidate.evidence.newMappedMemberCount || "?"} into new ({formatShare(candidate.evidence.newShare)})
          </div>
          <GuildEvidence candidate={candidate.evidence} />
        </>
      )}
      {item.status === "ready" && item.readyCandidateIdentifier === candidate.historicalIdentifier ? (
        <div className={styles.evidenceList}>
          <EvidenceChip positive>Ready queue candidate</EvidenceChip>
        </div>
      ) : null}
    </article>
  );
}

function MigrationRow({ edge }: { edge: GuildFusionMigrationEdge }) {
  return (
    <article className={styles.candidateRow}>
      <div className={styles.playerName}>{edge.oldName ?? edge.oldGuildIdentifier}</div>
      <div className={styles.muted}>
        {edge.oldGuildIdentifier} · {edge.oldServer ?? "Server unknown"} · {edge.matchedMemberCount} matched players
      </div>
      <div className={styles.muted}>
        Flow share: {formatShare(edge.oldShare)} from old · {formatShare(edge.newShare)} into new
      </div>
    </article>
  );
}

function IdentityDetails({
  item,
  onClose,
  onChanged,
}: {
  item: FusionIdentityManagementItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const handleConfirm = async (candidate: FusionIdentityCandidate) => {
    await confirmFusionIdentityLink(item.entityType, item.currentIdentifier, candidate.historicalIdentifier);
    onChanged();
    onClose();
  };
  const handleReject = async (candidate: FusionIdentityCandidate) => {
    await rejectFusionIdentityCandidate(item.entityType, item.currentIdentifier, candidate.historicalIdentifier);
    onChanged();
  };
  const handleUndo = async (identifier: string) => {
    await unlinkFusionIdentityAlias(item.entityType, identifier);
    onChanged();
    onClose();
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="fusion-identity-detail-title" onClick={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="fusion-identity-detail-title" className={styles.dialogTitle}>
              {item.currentName ?? item.currentIdentifier}
            </h2>
            <div className={styles.muted}>
              {typeLabel(item.entityType)} · {item.currentIdentifier}
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close details">
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className={styles.dialogBody}>
          <div className={styles.detailGrid}>
            <section className={styles.detailCard}>
              <h3>Current identity</h3>
              <DetailDataList
                rows={[
                  ["Type", typeLabel(item.entityType)],
                  ["Name", item.currentName ?? "-"],
                  ["Identifier", item.currentIdentifier],
                  ["Server", item.currentServer ?? "-"],
                  ["Observed", item.observations.length],
                  ["Last seen", formatDate(item.lastSeen)],
                ]}
              />
            </section>
            <section className={styles.detailCard}>
              <h3>Status</h3>
              <DetailDataList
                rows={[
                  ["Status", statusLabel(item.status)],
                  ["First seen", formatDate(item.firstSeen)],
                  ["Candidate", item.readyCandidateIdentifier ?? "-"],
                  ["Reason", item.reasons.join("; ") || "-"],
                ]}
              />
            </section>
            <section className={styles.detailCard}>
              <h3>Completed links</h3>
              {item.completedAliases.length ? (
                <div className={styles.candidateList}>
                  {item.completedAliases.map((alias) => (
                    <div key={alias} className={styles.actionRow}>
                      <span>{alias}</span>
                      <button type="button" className={styles.closeButton} onClick={() => handleUndo(alias)}>
                        <Undo2 size={15} aria-hidden /> Undo
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.muted}>No confirmed aliases yet.</p>
              )}
            </section>
          </div>

          <section className={styles.detailCard}>
            <h3>{item.entityType === "guild" ? "Possible historical identity" : "Historical candidates"}</h3>
            {item.candidates.length ? (
              <div className={styles.candidateList}>
                {item.candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.historicalIdentifier}
                    item={item}
                    candidate={candidate}
                    onConfirm={handleConfirm}
                    onReject={handleReject}
                  />
                ))}
              </div>
            ) : (
              <p className={styles.muted}>No resolver candidate is currently available.</p>
            )}
          </section>

          {item.entityType === "guild" && item.memberMigrationEdges.length ? (
            <section className={styles.detailCard}>
              <h3>Other member sources</h3>
              <div className={styles.candidateList}>
                {item.memberMigrationEdges.map((edge) => (
                  <MigrationRow key={`${edge.oldGuildIdentifier}-${edge.newGuildIdentifier}`} edge={edge} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ManualLinkDialog({
  report,
  onClose,
  onChanged,
}: {
  report: FusionIdentityManagementReport;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [entityType, setEntityType] = React.useState<FusionIdentityEntityType>("player");
  const currentOptions = report.currentAliases.filter((option) => option.entityType === entityType);
  const historicalOptions = report.historicalAliases.filter((option) => option.entityType === entityType);
  const [currentIdentifier, setCurrentIdentifier] = React.useState(currentOptions[0]?.identifier ?? "");
  const [historicalIdentifier, setHistoricalIdentifier] = React.useState(historicalOptions[0]?.identifier ?? "");
  const selectedHistorical = historicalOptions.find((option) => option.identifier === historicalIdentifier);
  const alreadyLinked = Boolean(selectedHistorical?.linkedEntityId);

  React.useEffect(() => {
    const nextCurrent = report.currentAliases.find((option) => option.entityType === entityType)?.identifier ?? "";
    const nextHistorical = report.historicalAliases.find((option) => option.entityType === entityType)?.identifier ?? "";
    setCurrentIdentifier(nextCurrent);
    setHistoricalIdentifier(nextHistorical);
  }, [entityType, report.currentAliases, report.historicalAliases]);

  const handleSubmit = async () => {
    await confirmFusionIdentityLink(entityType, currentIdentifier, historicalIdentifier);
    onChanged();
    onClose();
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="fusion-manual-link-title" onClick={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="fusion-manual-link-title" className={styles.dialogTitle}>
              Manual identity link
            </h2>
            <div className={styles.muted}>Resolver-independent link across the whole fusion pool.</div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close manual link">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className={styles.dialogBody}>
          <div className={styles.detailGrid}>
            <label className={styles.fieldLabel}>
              Type
              <select className={styles.select} value={entityType} onChange={(event) => setEntityType(event.target.value as FusionIdentityEntityType)}>
                <option value="player">Players</option>
                <option value="guild">Guilds</option>
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Current F28 alias
              <select className={styles.select} value={currentIdentifier} onChange={(event) => setCurrentIdentifier(event.target.value)}>
                {currentOptions.map((option) => (
                  <option key={option.identifier} value={option.identifier}>
                    {option.name ?? option.identifier} · {option.identifier}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Historical alias
              <select className={styles.select} value={historicalIdentifier} onChange={(event) => setHistoricalIdentifier(event.target.value)}>
                {historicalOptions.map((option) => (
                  <option key={option.identifier} value={option.identifier}>
                    {option.name ?? option.identifier} · {option.identifier}
                    {option.linkedEntityId ? " · Already linked" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {alreadyLinked ? <div className={styles.errorState}>Already linked: this historical alias is part of an existing identity.</div> : null}
          <div className={styles.rowActions}>
            <button type="button" className={styles.closeButton} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.closeButton} onClick={handleSubmit} disabled={!currentIdentifier || !historicalIdentifier || alreadyLinked}>
              <Link2 size={15} aria-hidden /> Link identity
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueRow({ item, onOpen }: { item: FusionIdentityManagementItem; onOpen: () => void }) {
  return (
    <button type="button" className={styles.resultRow} onClick={onOpen}>
      <div className={styles.resultMain}>
        <div>
          <div className={styles.playerName}>{item.currentName ?? item.currentIdentifier}</div>
          <div className={styles.muted}>{item.currentIdentifier}</div>
        </div>
        <div>
          <div>{typeLabel(item.entityType)}</div>
          <div className={styles.muted}>
            {item.currentServer ?? "Server unknown"} · observed {item.observations.length}x
          </div>
        </div>
        <div>
          <div>
            {item.status === "completed"
              ? `${item.historicalIdentifiers.length} historical aliases`
              : item.readyCandidateIdentifier
                ? `Candidate: ${item.readyCandidateIdentifier}`
                : `${item.candidates.length} candidates`}
          </div>
          <div className={styles.muted}>
            {formatDate(item.firstSeen)} - {formatDate(item.lastSeen)}
          </div>
        </div>
        <span className={`${styles.statusBadge} ${statusClassName(item.status)}`}>{statusLabel(item.status)}</span>
      </div>
    </button>
  );
}

export default function FusionIdentityPage() {
  const { loading, error, report, reload } = useFusionIdentityReport();
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [manualOpen, setManualOpen] = React.useState(false);

  const visibleItems = React.useMemo(() => {
    const query = normalizeSearch(search);
    return (report?.items ?? []).filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (typeFilter !== "all" && item.entityType !== typeFilter) return false;
      if (!query) return true;
      return (
        (item.currentName ?? "").toLowerCase().includes(query) ||
        item.currentIdentifier.toLowerCase().includes(query) ||
        item.historicalIdentifiers.some((identifier) => identifier.toLowerCase().includes(query)) ||
        item.candidates.some(
          (candidate) =>
            candidate.historicalIdentifier.toLowerCase().includes(query) ||
            (candidate.historicalName ?? "").toLowerCase().includes(query),
        )
      );
    });
  }, [report, search, statusFilter, typeFilter]);

  const groupedItems = React.useMemo(
    () => ({
      guilds: visibleItems.filter((item) => item.entityType === "guild"),
      players: visibleItems.filter((item) => item.entityType === "player"),
    }),
    [visibleItems],
  );
  const selectedItem = React.useMemo(() => report?.items.find((item) => item.id === selectedId) ?? null, [report, selectedId]);

  const readyPlayers = report?.items.filter((item) => item.entityType === "player" && item.status === "ready").length ?? 0;
  const readyGuilds = report?.items.filter((item) => item.entityType === "guild" && item.status === "ready").length ?? 0;

  const handleMergeReady = async () => {
    if (!report) return;
    const approved = window.confirm(
      `Merge ready identities?\n\nPlayers ready: ${readyPlayers}\nGuilds ready: ${readyGuilds}\nRaw scans will not be changed.`,
    );
    if (!approved) return;
    await mergeReadyFusionIdentityItems(report);
    await reload();
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className={styles.loadingState}>
          <Loader2 size={18} aria-hidden /> Loading global fusion identity pool.
        </div>
      );
    }
    if (error) return <div className={styles.errorState}>{error}</div>;
    if (!report) return null;
    if (!report.items.length) return <div className={styles.emptyState}>No supported EU1-EU4 -&gt; F28 identity pool found locally.</div>;

    return (
      <>
        <div className={styles.summaryGrid}>
          <SummaryItem label="Total identities" value={report.summary.total} />
          <SummaryItem label="Ready" value={report.summary.ready} />
          <SummaryItem label="Review" value={report.summary.review} />
          <SummaryItem label="Unresolved" value={report.summary.unresolved} />
          <SummaryItem label="No Historical Data" value={report.summary.noHistory} />
          <SummaryItem label="Completed" value={report.summary.completed} />
        </div>

        <div className={styles.filters}>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`${styles.filterButton} ${statusFilter === filter.key ? styles.filterButtonActive : ""}`}
              onClick={() => setStatusFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`${styles.filterButton} ${typeFilter === filter.key ? styles.filterButtonActive : ""}`}
              onClick={() => setTypeFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className={styles.metaLine}>
          {report.scope.label} · scans: {report.scope.historicalSnapshotCount} historical, {report.scope.postFusionSnapshotCount} F28 · history:{" "}
          {formatDate(report.scope.firstHistoricalTimestamp)} - {formatDate(report.scope.lastHistoricalTimestamp)} · showing{" "}
          {visibleItems.length} of {report.items.length}
        </div>

        {groupedItems.guilds.length ? (
          <section className={styles.queueGroup}>
            <h2>Guilds</h2>
            <div className={styles.resultList}>
              {groupedItems.guilds.map((item) => (
                <QueueRow key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
              ))}
            </div>
          </section>
        ) : null}

        {groupedItems.players.length ? (
          <section className={styles.queueGroup}>
            <h2>Players</h2>
            <div className={styles.resultList}>
              {groupedItems.players.map((item) => (
                <QueueRow key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
              ))}
            </div>
          </section>
        ) : null}

        {!visibleItems.length ? <div className={styles.emptyState}>No identities match the current filters.</div> : null}
      </>
    );
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Fusion &amp; Identity</h1>
          <p className={styles.subtitle}>Global local identity management for EU1-EU4 -&gt; F28.</p>
        </div>
        <div className={styles.previewBadge}>Local · Links and exclusions are reversible. Raw scans stay unchanged.</div>
      </header>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <label className={styles.fieldLabel}>
            Search
            <span className={styles.searchWrap}>
              <Search className={styles.searchIcon} size={16} aria-hidden />
              <input
                className={styles.search}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name or identifier"
              />
            </span>
          </label>
          <div className={styles.actionBar}>
            <button type="button" className={styles.closeButton} onClick={() => setManualOpen(true)} disabled={!report}>
              <Link2 size={15} aria-hidden /> Manual link
            </button>
            <button type="button" className={styles.closeButton} onClick={handleMergeReady} disabled={!report || (!readyPlayers && !readyGuilds)}>
              <Check size={15} aria-hidden /> Merge ready identities
            </button>
          </div>
        </div>

        {renderContent()}
      </section>

      {selectedItem ? <IdentityDetails item={selectedItem} onClose={() => setSelectedId(null)} onChanged={reload} /> : null}
      {manualOpen && report ? <ManualLinkDialog report={report} onClose={() => setManualOpen(false)} onChanged={reload} /> : null}
    </section>
  );
}
