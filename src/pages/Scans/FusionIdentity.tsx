import React from "react";
import { Check, Link2, Search, Undo2, X } from "lucide-react";

import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import { getClassMetaById } from "../../data/classes";
import { subscribeToSfDataHubLocalScanChanges } from "../../lib/guilds/localScanLibrary";
import {
  confirmFusionIdentityLink,
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
import {
  FusionIdentityWorkerCancelledError,
  startFusionIdentityWorkerRun,
  type FusionIdentityWorkerRun,
} from "../../lib/identities/fusionIdentityWorkerClient";
import type { FusionIdentityProgress, FusionIdentityWorkerTiming } from "../../lib/identities/fusionIdentityWorkerTypes";
import type { GuildFusionCandidate, GuildFusionMigrationEdge } from "../../lib/identities/guildFusionResolver";
import type {
  PlayerFusionCandidate,
  PlayerFusionCandidateClassification,
  PlayerFusionEvidenceEntry,
  PlayerFusionEvidenceEntryType,
  PlayerFusionEvidenceStrength,
} from "../../lib/identities/playerFusionResolver";
import styles from "./FusionIdentity.module.css";

type StatusFilter = "all" | FusionIdentityManagementStatus;
type TypeFilter = "all" | FusionIdentityEntityType;

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "review", label: "Needs Review" },
  { key: "unresolved", label: "Unresolved" },
  { key: "noHistoricalObservation", label: "No Historical Observation" },
  { key: "noHistory", label: "No Historical Data" },
  { key: "completed", label: "Completed" },
];

const TYPE_FILTERS: Array<{ key: TypeFilter; label: string }> = [
  { key: "all", label: "All types" },
  { key: "player", label: "Players" },
  { key: "guild", label: "Guilds" },
];

const normalizeSearch = (value: string) => value.trim().toLowerCase();
const formatNumber = (value: number) => new Intl.NumberFormat().format(value);
const formatShare = (value: number) => `${Math.round(value * 100)}%`;
const formatClass = (classId: string | null | undefined) => {
  const key = String(classId ?? "").trim();
  if (!key) return "Class unknown";
  return getClassMetaById(key)?.label ?? `Class ${key}`;
};
const formatLevel = (level: number | null | undefined) => (level == null ? "Level unknown" : `Level ${level}`);
const formatDate = (timestamp: number | null | undefined) =>
  timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp)) : "-";

const statusLabel = (status: FusionIdentityManagementStatus) => {
  if (status === "noHistoricalObservation") return "No Historical Observation";
  if (status === "noHistory") return "No Historical Data";
  if (status === "review") return "Needs Review";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const statusClassName = (status: FusionIdentityManagementStatus) => {
  if (status === "ready") return styles.statusHigh;
  if (status === "review") return styles.statusAmbiguous;
  if (status === "completed") return styles.statusSingle;
  if (status === "noHistory" || status === "noHistoricalObservation") return styles.statusNative;
  return styles.statusUnresolved;
};

const typeLabel = (type: FusionIdentityEntityType) => (type === "player" ? "Player" : "Guild");

const latestObservation = (observations: FusionIdentityManagementItem["observations"]) =>
  observations.reduce<FusionIdentityManagementItem["observations"][number] | null>(
    (latest, observation) => (latest == null || observation.timestamp > latest.timestamp ? observation : latest),
    null,
  );

const earliestObservation = (observations: FusionIdentityManagementItem["observations"]) =>
  observations.reduce<FusionIdentityManagementItem["observations"][number] | null>(
    (earliest, observation) => (earliest == null || observation.timestamp < earliest.timestamp ? observation : earliest),
    null,
  );

const formatCurrentLevel = (level: number | null | undefined) => {
  if (level == null || !Number.isFinite(level) || level <= 0) return null;
  return formatNumber(level);
};

const formatOriginScope = (item: FusionIdentityManagementItem) =>
  item.diagnostics?.originServerCodes.length ? item.diagnostics.originServerCodes.join(", ") : item.currentServer ?? "unknown scope";

const formatStatusExplanation = (item: FusionIdentityManagementItem) => {
  if (item.status === "noHistoricalObservation") {
    const lookup = item.diagnostics?.reliableHistoricalLookup;
    const scope = formatOriginScope(item);
    const scanCount = item.diagnostics?.historicalSnapshotCount ?? 0;
    return lookup
      ? `No matching player observation was found for ${lookup.baseName} in the available pre-fusion ${scope} scans. Historical scope: ${scope}. Scans checked: ${scanCount}.`
      : `No matching observation was found in the available historical scans. Historical scope: ${scope}. Scans checked: ${scanCount}.`;
  }

  if (item.status !== "unresolved" || item.candidates.length) return null;
  const reason = item.reasonCodes[0];
  if (reason === "level-regression") return "No viable identity remained after reliable level continuity checks.";
  if (reason === "semantic-contradictions") return "No viable identity remained after semantic consistency checks.";
  if (reason === "reserved-by-other-identity") return "Candidate identities were reserved by other ready assignments.";
  if (reason === "rejected-by-exclusion") return "No remaining candidate after exclusions.";
  if (reason === "no-actionable-candidate") return "Only weak compatibility matches were found. No candidate currently has enough identity evidence for review.";
  if (item.entityType === "guild") return "Historical guild scans exist, but no reliable continuity could be established.";
  return "Historical data exists, but no reliable identity continuity could be established.";
};

const formatDuration = (durationMs: number) => {
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
};

function useFusionIdentityReport() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<FusionIdentityManagementReport | null>(null);
  const [progress, setProgress] = React.useState<FusionIdentityProgress | null>(null);
  const [timings, setTimings] = React.useState<FusionIdentityWorkerTiming[]>([]);
  const runRef = React.useRef<FusionIdentityWorkerRun | null>(null);
  const activeRequestIdRef = React.useRef<string | null>(null);

  const load = React.useCallback(async () => {
    runRef.current?.cancel();
    setLoading(true);
    setError(null);
    setProgress({ phase: "loading", message: "Starting local fusion worker" });
    setTimings([]);

    const run = startFusionIdentityWorkerRun({
      onProgress(nextProgress) {
        if (activeRequestIdRef.current === run.requestId) setProgress(nextProgress);
      },
    });
    runRef.current = run;
    activeRequestIdRef.current = run.requestId;

    try {
      const result = await run.promise;
      if (activeRequestIdRef.current !== run.requestId) return;
      setReport(result.report);
      setTimings(result.timings);
      setProgress({ phase: "done", message: "Fusion identity report ready" });
    } catch (loadError) {
      if (activeRequestIdRef.current !== run.requestId) return;
      if (loadError instanceof FusionIdentityWorkerCancelledError) return;
      setError(loadError instanceof Error ? loadError.message : "Fusion identity data could not be loaded.");
      setReport(null);
    } finally {
      if (activeRequestIdRef.current === run.requestId) {
        setLoading(false);
        runRef.current = null;
      }
    }
  }, []);

  React.useEffect(() => {
    void load();
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(() => {
      void load();
    });
    return () => {
      unsubscribe();
      runRef.current?.cancel();
      runRef.current = null;
      activeRequestIdRef.current = null;
    };
  }, [load]);

  return { loading, error, report, progress, timings, reload: load };
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.summaryItem}>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.summaryValue}>{formatNumber(value)}</div>
    </div>
  );
}

const PLAYER_EVIDENCE_STRENGTHS = new Set<PlayerFusionEvidenceStrength>([
  "hardContradiction",
  "strongContradiction",
  "neutral",
  "weakSupport",
  "support",
  "strongSupport",
  "identityAnchor",
]);

const PLAYER_CANDIDATE_CLASSIFICATION_LABELS: Record<PlayerFusionCandidateClassification, string> = {
  rejected: "Rejected",
  weak: "Weak",
  plausible: "Plausible",
  strong: "Strong",
  anchored: "Anchored",
};

const PLAYER_CANDIDATE_CLASSIFICATION_STRENGTHS: Record<PlayerFusionCandidateClassification, PlayerFusionEvidenceStrength> = {
  rejected: "hardContradiction",
  weak: "neutral",
  plausible: "support",
  strong: "strongSupport",
  anchored: "identityAnchor",
};

const PLAYER_EVIDENCE_TYPE_LABELS: Record<PlayerFusionEvidenceEntryType, string> = {
  "origin-compatibility": "Origin compatibility",
  "class-compatibility": "Class compatibility",
  "level-monotonicity": "Level monotonicity",
  "level-progression": "Level progression",
  "base-monotonicity": "Base monotonicity",
  "base-unchanged-stats": "Unchanged base stats",
  "base-secondary-stability": "Secondary base stability",
  "base-ordering": "Base-stat ordering",
  "fortress-continuity": "Fortress continuity",
  "pet-continuity": "Pet continuity",
  "guild-continuity": "Guild continuity",
  "exact-name": "Exact name",
  "fusion-base-name": "Fusion base name",
  assignment: "Assignment",
};

const isPlayerEvidenceStrength = (value: unknown): value is PlayerFusionEvidenceStrength =>
  typeof value === "string" && PLAYER_EVIDENCE_STRENGTHS.has(value as PlayerFusionEvidenceStrength);

const isPlayerCandidateClassification = (value: unknown): value is PlayerFusionCandidateClassification =>
  typeof value === "string" && value in PLAYER_CANDIDATE_CLASSIFICATION_LABELS;

const normalizeEvidenceStrength = (
  strength: unknown,
): PlayerFusionEvidenceStrength | "guildSupport" | "guildNeutral" => {
  if (isPlayerEvidenceStrength(strength) || strength === "guildSupport" || strength === "guildNeutral") return strength;
  return "neutral";
};

const evidenceStrengthClassName = (strength: unknown) => {
  switch (normalizeEvidenceStrength(strength)) {
    case "identityAnchor":
      return styles.evidenceAnchor;
    case "strongSupport":
      return styles.evidenceStrongSupport;
    case "support":
    case "guildSupport":
      return styles.evidenceSupport;
    case "weakSupport":
      return styles.evidenceWeakSupport;
    case "strongContradiction":
      return styles.evidenceWarning;
    case "hardContradiction":
      return styles.evidenceHardContradiction;
    case "neutral":
    case "guildNeutral":
      return styles.evidenceNeutral;
  }
};

function EvidenceChip({
  strength = "neutral",
  children,
}: {
  strength?: PlayerFusionEvidenceStrength | "guildSupport" | "guildNeutral" | unknown;
  children: React.ReactNode;
}) {
  return <span className={`${styles.evidenceChip} ${evidenceStrengthClassName(strength)}`}>{children}</span>;
}

type RenderablePlayerEvidenceEntry = {
  type: string;
  strength: PlayerFusionEvidenceStrength;
  label: string;
};

const legacyBooleanEvidenceEntry = (
  type: PlayerFusionEvidenceEntryType,
  value: boolean | null | undefined,
  trueLabel: string,
  falseLabel: string,
  falseStrength: PlayerFusionEvidenceStrength,
  trueStrength: PlayerFusionEvidenceStrength = "neutral",
): RenderablePlayerEvidenceEntry | null => {
  if (value == null) return null;
  return {
    type,
    strength: value ? trueStrength : falseStrength,
    label: value ? trueLabel : falseLabel,
  };
};

const getPlayerCandidateClassificationChip = (candidate: PlayerFusionCandidate) => {
  if (isPlayerCandidateClassification(candidate.classification)) {
    return {
      label: PLAYER_CANDIDATE_CLASSIFICATION_LABELS[candidate.classification],
      strength: PLAYER_CANDIDATE_CLASSIFICATION_STRENGTHS[candidate.classification],
    };
  }

  return {
    label: candidate.rejected ? "Rejected" : "Unclassified candidate",
    strength: candidate.rejected ? ("hardContradiction" as const) : ("neutral" as const),
  };
};

const normalizePlayerEvidenceEntry = (entry: unknown, index: number): RenderablePlayerEvidenceEntry | null => {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Partial<PlayerFusionEvidenceEntry> & Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : `legacy-${index}`;
  const typedLabel = type in PLAYER_EVIDENCE_TYPE_LABELS ? PLAYER_EVIDENCE_TYPE_LABELS[type as PlayerFusionEvidenceEntryType] : null;
  const label = typeof record.label === "string" && record.label.trim() ? record.label : typedLabel ?? "Evidence";

  return {
    type,
    strength: isPlayerEvidenceStrength(record.strength) ? record.strength : "neutral",
    label,
  };
};

const legacyPlayerEvidenceEntries = (candidate: PlayerFusionCandidate): RenderablePlayerEvidenceEntry[] => {
  const evidence = candidate.evidence;
  if (!evidence) return [];
  const entries: Array<RenderablePlayerEvidenceEntry | null> = [
    legacyBooleanEvidenceEntry(
      "origin-compatibility",
      evidence.originMatches,
      "Origin compatible",
      "Origin contradiction",
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry("class-compatibility", evidence.sameClass, "Class compatible", "Class contradiction", "hardContradiction"),
    legacyBooleanEvidenceEntry(
      "level-monotonicity",
      evidence.levelConsistent,
      "Level non-decreasing",
      "Level regression",
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry(
      "base-monotonicity",
      evidence.baseAttributesConsistent,
      "Base stats non-decreasing",
      "Base-stat regression",
      "hardContradiction",
    ),
    legacyBooleanEvidenceEntry("fortress-continuity", evidence.fortressContinuity, "Fortress continuity", "Fortress differs", "neutral", "strongSupport"),
    legacyBooleanEvidenceEntry("pet-continuity", evidence.petContinuity, "Pet continuity", "Pets differ", "neutral", "weakSupport"),
    legacyBooleanEvidenceEntry("guild-continuity", evidence.sameGuild, "Guild continuity", "Guild differs", "neutral", "support"),
  ];

  if (evidence.levelProgression?.category === "normal") {
    entries.push({ type: "level-progression", strength: "support", label: "Normal level progression" });
  } else if (evidence.levelProgression?.category === "plausible-burst") {
    entries.push({ type: "level-progression", strength: "weakSupport", label: "Plausible level burst" });
  } else if (evidence.levelProgression?.category === "extreme-contradiction") {
    entries.push({ type: "level-progression", strength: "strongContradiction", label: "Unusually high level progression" });
  }
  if (evidence.baseFingerprint?.unchangedCount != null && evidence.baseFingerprint.unchangedCount >= 3) {
    entries.push({ type: "base-unchanged-stats", strength: "strongSupport", label: "3+ unchanged base stats" });
  }
  if (evidence.baseFingerprint?.unchangedSecondaryCount != null && evidence.baseFingerprint.unchangedSecondaryCount >= 2) {
    entries.push({ type: "base-secondary-stability", strength: "strongSupport", label: "2 unchanged secondary base stats" });
  }
  if (evidence.baseFingerprint?.orderingStable === true) {
    entries.push({ type: "base-ordering", strength: "support", label: "Base-stat ordering stable" });
  }
  if (evidence.exactName) entries.push({ type: "exact-name", strength: "identityAnchor", label: "Exact name" });
  if (evidence.fusionBaseName) entries.push({ type: "fusion-base-name", strength: "identityAnchor", label: "Fusion base name" });

  return entries.filter((entry): entry is RenderablePlayerEvidenceEntry => Boolean(entry));
};

const getRenderablePlayerEvidenceEntries = (candidate: PlayerFusionCandidate) => {
  const entries = candidate.evidence?.entries;
  if (!Array.isArray(entries)) return legacyPlayerEvidenceEntries(candidate);
  return entries.map(normalizePlayerEvidenceEntry).filter((entry): entry is RenderablePlayerEvidenceEntry => Boolean(entry));
};

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
  const classification = getPlayerCandidateClassificationChip(candidate);
  const evidenceEntries = getRenderablePlayerEvidenceEntries(candidate);

  return (
    <div className={styles.evidenceList}>
      <EvidenceChip strength={classification.strength}>{classification.label}</EvidenceChip>
      {evidenceEntries.map((entry, index) => (
        <EvidenceChip key={`${entry.type}-${entry.label}-${index}`} strength={entry.strength}>
          {entry.label}
        </EvidenceChip>
      ))}
      {candidate.rejectReasons.map((reason) => (
        <EvidenceChip key={reason} strength="hardContradiction">
          {reason}
        </EvidenceChip>
      ))}
    </div>
  );
}

function GuildEvidence({ candidate }: { candidate: GuildFusionCandidate }) {
  return (
    <div className={styles.evidenceList}>
      {candidate.autoEligible ? <EvidenceChip strength="guildSupport">V2 auto eligible</EvidenceChip> : <EvidenceChip>V2 review</EvidenceChip>}
      {candidate.exactName ? <EvidenceChip strength="identityAnchor">Exact guild name</EvidenceChip> : null}
      {candidate.sameCoA ? <EvidenceChip strength="support">Same CoA</EvidenceChip> : null}
      {candidate.mutualDominant ? <EvidenceChip strength="strongSupport">Mutual dominant flow</EvidenceChip> : null}
      {candidate.matchedMemberCount > 0 ? <EvidenceChip strength="support">{candidate.matchedMemberCount} matched players</EvidenceChip> : null}
      {!candidate.autoEligible && candidate.splitEvidence.relevant ? <EvidenceChip strength="strongContradiction">Split evidence</EvidenceChip> : null}
      {!candidate.autoEligible && candidate.convergenceEvidence.relevant ? <EvidenceChip strength="strongContradiction">Convergence evidence</EvidenceChip> : null}
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
          <EvidenceChip strength="support">Ready queue candidate</EvidenceChip>
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
  const candidateHeading =
    item.status === "noHistoricalObservation"
      ? "Historical observation"
      : item.status === "ready"
      ? item.entityType === "guild"
        ? "Matched historical guild"
        : "Matched historical identity"
      : item.status === "review"
        ? "Possible historical identities"
        : "Historical identity candidates";
  const currentObservation = latestObservation(item.observations);
  const firstObservation = earliestObservation(item.observations);
  const currentIdentityRows: Array<[string, React.ReactNode]> = [
    ["Type", typeLabel(item.entityType)],
    ["Name", item.currentName ?? "-"],
    ["Identifier", item.currentIdentifier],
    ["Server", item.currentServer ?? "-"],
  ];

  if (item.entityType === "player") {
    currentIdentityRows.push(
      ["Class", currentObservation?.classId ? formatClass(currentObservation.classId) : null],
      ["Level", formatCurrentLevel(currentObservation?.level)],
      ["Guild", currentObservation?.guildName?.trim() || null],
    );
  }

  currentIdentityRows.push(["Observed", item.observations.length], ["Last seen", formatDate(item.lastSeen)]);
  const statusRows: Array<[string, React.ReactNode]> = [
    ["Status", statusLabel(item.status)],
    ["First seen", formatDate(firstObservation?.timestamp ?? item.firstSeen)],
  ];

  if (item.entityType === "player") {
    statusRows.push(
      ["First seen level", formatCurrentLevel(firstObservation?.level)],
      ["First seen guild", firstObservation?.guildName?.trim() || null],
    );
  }

  statusRows.push(["Candidate", item.readyCandidateIdentifier ?? "-"], ["Reason", item.reasons.join("; ") || "-"]);

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
              <DetailDataList rows={currentIdentityRows} />
            </section>
            <section className={styles.detailCard}>
              <h3>Status</h3>
              <DetailDataList rows={statusRows} />
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
            <h3>{candidateHeading}</h3>
            {formatStatusExplanation(item) ? (
              <p className={styles.muted}>{formatStatusExplanation(item)}</p>
            ) : item.candidates.length ? (
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
  const { loading, error, report, progress, timings, reload } = useFusionIdentityReport();
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
        item.completedAliases.some((identifier) => identifier.toLowerCase().includes(query)) ||
        (item.status === "completed" && item.historicalIdentifiers.some((identifier) => identifier.toLowerCase().includes(query)))
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
        <DataHubLoadingState
          title="Preparing fusion identities"
          message={progress?.message ?? "Loading local fusion identity pool"}
          current={progress?.current}
          total={progress?.total}
        />
      );
    }
    if (error) {
      return (
        <DataHubLoadingState
          title="Could not build fusion identity report."
          message="Fusion identity data could not be prepared."
          error={error}
          onRetry={reload}
        />
      );
    }
    if (!report) return null;
    if (!report.items.length) return <div className={styles.emptyState}>No supported EU1-EU4 -&gt; F28 identity pool found locally.</div>;

    return (
      <>
        <div className={styles.summaryGrid}>
          <SummaryItem label="Total identities" value={report.summary.total} />
          <SummaryItem label="Ready" value={report.summary.ready} />
          <SummaryItem label="Review" value={report.summary.review} />
          <SummaryItem label="Unresolved" value={report.summary.unresolved} />
          <SummaryItem label="No Historical Observation" value={report.summary.noHistoricalObservation} />
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
          {timings.find((timing) => timing.phase === "total")
            ? ` · worker: ${formatDuration(timings.find((timing) => timing.phase === "total")?.durationMs ?? 0)}`
            : ""}
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
