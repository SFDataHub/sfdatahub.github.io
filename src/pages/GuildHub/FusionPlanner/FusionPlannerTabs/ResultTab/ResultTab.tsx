import React from "react";
import type { FusionMember, FusionSetupState } from "../../FusionPlanner";
import styles from "./ResultTab.module.css";

type MemberDecision = "take" | "bench" | "drop" | "undecided";

type FusionScenario = {
  id: string;
  name: string;
  description?: string;
  maxSlots: number;
  reservedSlots: number;
  decisions: Record<string, MemberDecision>;
};

type Props = {
  members: FusionMember[];
  scenario: FusionScenario | null;
  setupState: FusionSetupState;
};

export default function ResultTab({ members, scenario, setupState }: Props) {
  if (!scenario) {
    return (
      <div className={styles.emptyState}>
        <h3 className={styles.emptyTitle}>No scenario selected</h3>
        <p className={styles.emptyText}>
          Please create or select a scenario in the Scenarios tab to see the planned result.
        </p>
      </div>
    );
  }

  if (!members || members.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h3 className={styles.emptyTitle}>No members available</h3>
        <p className={styles.emptyText}>
          No members available for this plan yet. Configure a base guild with scan data in the Setup tab.
        </p>
      </div>
    );
  }

  const { takeMembers, benchMembers, dropMembers, undecidedMembers } = React.useMemo(() => {
    const take: FusionMember[] = [];
    const bench: FusionMember[] = [];
    const drop: FusionMember[] = [];
    const undecided: FusionMember[] = [];

    members.forEach((member) => {
      const decision = scenario.decisions[member.id] ?? "undecided";
      if (decision === "take") take.push(member);
      else if (decision === "bench") bench.push(member);
      else if (decision === "drop") drop.push(member);
      else undecided.push(member);
    });

    return { takeMembers: take, benchMembers: bench, dropMembers: drop, undecidedMembers: undecided };
  }, [members, scenario.decisions]);

  const selectedCount = takeMembers.length;
  const benchCount = benchMembers.length;
  const dropCount = dropMembers.length;
  const freeSlots = Math.max(0, scenario.maxSlots - selectedCount);
  const utilizationPercent = scenario.maxSlots ? Math.round((selectedCount / scenario.maxSlots) * 100) : 0;

  const classDistribution = React.useMemo(() => {
    const counts = takeMembers.reduce<Record<string, number>>((acc, member) => {
      const classLabel = member.className ?? (member as any).class;
      if (!classLabel) return acc;
      acc[classLabel] = (acc[classLabel] ?? 0) + 1;
      return acc;
    }, {});
    const parts = Object.entries(counts).map(([cls, count]) => `${cls}: ${count}`);
    return parts.join(" | ");
  }, [takeMembers]);

  const renderGroup = (title: string, hint: string, list: FusionMember[], badgeClass: string) => (
    <div className={styles.group}>
      <div className={styles.groupHeader}>
        <div>
          <h4 className={styles.groupTitle}>{title}</h4>
          <span className={styles.groupHint}>{hint}</span>
        </div>
        <span className={`${styles.groupBadge} ${badgeClass}`}>{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className={styles.groupEmpty}>No players in this group.</div>
      ) : (
        <div className={styles.groupTable} role="table">
          <div className={`${styles.groupRow} ${styles.groupHead}`} role="row">
            <div className={styles.groupCell} role="columnheader">
              Name
            </div>
            <div className={styles.groupCell} role="columnheader">
              Level
            </div>
            <div className={styles.groupCell} role="columnheader">
              Guild
            </div>
            <div className={styles.groupCell} role="columnheader">
              Class
            </div>
          </div>
          {list.map((member) => (
            <div key={member.id} className={styles.groupRow} role="row">
              <div className={styles.groupCell} role="cell">
                <span className={styles.memberName}>{member.name}</span>
              </div>
              <div className={styles.groupCell} role="cell">
                <span className={styles.memberBadge}>Lvl {member.level}</span>
              </div>
              <div className={styles.groupCell} role="cell">
                {member.guildName}
              </div>
              <div className={styles.groupCell} role="cell">
                {member.className ?? (member as any).class ?? "-"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.resultWrap}>
      <div className={styles.resultHeader}>
        <div>
          <p className={styles.resultKicker}>Final Plan</p>
          <h3 className={styles.resultTitle}>{scenario.name}</h3>
          <p className={styles.resultText}>{scenario.description ?? "Zusammenfassung des aktuellen Plans."}</p>
          {takeMembers.length === 0 ? (
            <p className={styles.emptyNote}>
              No players selected for this scenario yet. Use the Members tab to mark players as &apos;take&apos;.
            </p>
          ) : null}
          {classDistribution ? <p className={styles.classDistribution}>Class distribution: {classDistribution}</p> : null}
          <div className={styles.setupSummary}>
            <div className={styles.setupSummaryTitle}>Fusion plan between</div>
            {setupState.baseGuild ? (
              <div className={styles.setupSummaryRow}>
                <span className={styles.setupSummaryLabel}>Base</span>
                <span className={styles.setupSummaryValue}>
                  {setupState.baseGuild.name || "Unbenannt"}{" "}
                  <span className={styles.setupSummaryMeta}>({setupState.baseGuild.server || "Server n/a"})</span>
                </span>
              </div>
            ) : (
              <div className={styles.setupSummaryRow}>
                <span className={styles.setupSummaryLabel}>Base</span>
                <span className={styles.setupSummaryMeta}>No base guild selected.</span>
              </div>
            )}
            <div className={styles.setupSummaryRow}>
              <span className={styles.setupSummaryLabel}>Partners</span>
              {setupState.partnerGuilds.length ? (
                <div className={styles.setupSummaryTags}>
                  {setupState.partnerGuilds.map((guild) => (
                    <span key={guild.id} className={styles.setupSummaryTag}>
                      {guild.name || "Unbenannt"}{" "}
                      <span className={styles.setupSummaryMeta}>({guild.server || "Server n/a"})</span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className={styles.setupSummaryMeta}>No partner guilds added.</span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.resultStats}>
          <span className={styles.resultStatBadge}>
            Members selected: {selectedCount} / {scenario.maxSlots}
          </span>
          <span className={styles.resultStatBadge}>Bench: {benchCount}</span>
          <span className={styles.resultStatBadge}>Drop: {dropCount}</span>
          <span className={styles.resultStatBadge}>Free slots: {freeSlots}</span>
          <span className={styles.resultStatBadge}>Utilization: {utilizationPercent}%</span>
          {undecidedMembers.length > 0 ? (
            <span className={styles.resultStatBadgeMuted}>Undecided: {undecidedMembers.length}</span>
          ) : null}
        </div>
      </div>

      {renderGroup("Final roster (selected)", "Take", takeMembers, styles.badgeSuccess)}
      {renderGroup("Bench (waiting list)", "Bench", benchMembers, styles.badgeMuted)}
      {renderGroup("Not included", "Drop", dropMembers, styles.badgeDanger)}
    </div>
  );
}

