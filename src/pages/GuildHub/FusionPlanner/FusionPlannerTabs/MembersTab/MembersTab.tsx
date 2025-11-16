import React from "react";
import type {
  FusionMember,
  FusionScenario,
  FusionSetupState,
  MemberDecision,
  TargetGuildAssignment,
} from "../../FusionPlanner";
import styles from "./MembersTab.module.css";

type AssignmentChoice = TargetGuildAssignment | "watch";

type Props = {
  members: FusionMember[];
  scenario: FusionScenario | null;
  onChangeScenarioDecision: (memberId: string, decision: MemberDecision) => void;
  onChangeScenarioTargetGuild: (memberId: string, target: TargetGuildAssignment) => void;
  onChangeScenarioMaxSlots: (value: number) => void;
  setupState: FusionSetupState;
};

export default function MembersTab({
  members,
  scenario,
  onChangeScenarioDecision,
  onChangeScenarioTargetGuild,
  onChangeScenarioMaxSlots,
  setupState,
}: Props) {
  const [contextMenu, setContextMenu] = React.useState<{ memberId: string; x: number; y: number } | null>(null);
  const longPressTimer = React.useRef<number | null>(null);
  const partnerOptions =
    setupState.partnerGuilds.length > 0
      ? setupState.partnerGuilds.map((guild, index) => ({
          id: guild.id,
          label: guild.name || `Partner ${index + 1}`,
        }))
      : [{ id: "partner-default", label: "Partner guild" }];

  const openContextMenu = React.useCallback(
    (memberId: string, position: { x: number; y: number }) => {
      setContextMenu({ memberId, ...position });
    },
    [],
  );

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(null);
  }, []);

  const clearLongPress = React.useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startLongPress = React.useCallback(
    (memberId: string, clientX: number, clientY: number) => {
      clearLongPress();
      longPressTimer.current = window.setTimeout(() => {
        openContextMenu(memberId, { x: clientX, y: clientY });
      }, 550);
    },
    [clearLongPress, openContextMenu],
  );

  React.useEffect(() => () => clearLongPress(), [clearLongPress]);

  const applyAssignment = React.useCallback(
    (memberId: string, assignment: AssignmentChoice, partnerId?: string) => {
      if (assignment === "main") {
        onChangeScenarioDecision(memberId, "take");
        onChangeScenarioTargetGuild(memberId, "main");
      } else if (assignment === "partner") {
        const target: TargetGuildAssignment = partnerId ? (`partner:${partnerId}` as TargetGuildAssignment) : "partner";
        onChangeScenarioDecision(memberId, "take");
        onChangeScenarioTargetGuild(memberId, target);
      } else {
        onChangeScenarioDecision(memberId, "bench");
        onChangeScenarioTargetGuild(memberId, "none");
      }
      closeContextMenu();
    },
    [closeContextMenu, onChangeScenarioDecision, onChangeScenarioTargetGuild],
  );

  const handleDecisionClick = React.useCallback(
    (memberId: string, decision: MemberDecision) => {
      onChangeScenarioDecision(memberId, decision);
      if (decision === "take") {
        onChangeScenarioTargetGuild(memberId, "main");
      } else if (decision === "bench") {
        onChangeScenarioTargetGuild(memberId, "none");
      } else {
        onChangeScenarioTargetGuild(memberId, "none");
      }
    },
    [onChangeScenarioDecision, onChangeScenarioTargetGuild],
  );

  const baseConfigured = Boolean(setupState.baseGuild?.name?.trim() && setupState.baseGuild?.server?.trim());

  if (!baseConfigured) {
    return (
      <div className={styles.emptyWrap}>
        <h3 className={styles.emptyTitle}>No base guild configured</h3>
        <p className={styles.emptyText}>
          Please configure a base guild in the Setup tab before assigning members.
        </p>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className={styles.emptyWrap}>
        <h3 className={styles.emptyTitle}>Members & Slots</h3>
        <p className={styles.emptyText}>Kein Szenario aktiv. Lege einen Plan an.</p>
      </div>
    );
  }

  if (!members || members.length === 0) {
    return (
      <div className={styles.emptyWrap}>
        <h3 className={styles.emptyTitle}>No members found</h3>
        <p className={styles.emptyText}>
          No members found for the selected guild. Check if scans are available or try again later.
        </p>
      </div>
    );
  }

  const decisions = scenario.decisions ?? {};
  const targets = scenario.targetGuildAssignments ?? {};

  const selectedCount = members.filter((member) => decisions[member.id] === "take").length;
  const benchCount = members.filter((member) => decisions[member.id] === "bench").length;
  const dropCount = members.filter((member) => decisions[member.id] === "drop").length;
  const freeSlots = Math.max(0, scenario.maxSlots - scenario.reservedSlots - selectedCount);

  return (
    <div className={styles.membersContainer}>
      <div className={styles.scenarioSwitcher}>
        <div className={`${styles.scenarioButton} ${styles.scenarioButtonActive}`}>
          <span className={styles.scenarioButtonName}>{scenario.name}</span>
          {scenario.description ? <span className={styles.scenarioButtonDesc}>{scenario.description}</span> : null}
        </div>
      </div>

      <div className={styles.setupInfo}>
        <div className={styles.setupInfoHeader}>
          <div className={styles.setupInfoTitle}>Planning for</div>
          <span className={styles.setupInfoMode}>{setupState.mode === "scan" ? "Scan" : "Manual"}</span>
        </div>
        {setupState.baseGuild ? (
          <div className={styles.setupInfoRow}>
            <span className={styles.setupInfoLabel}>Base Guild</span>
            <span className={styles.setupInfoValue}>
              {setupState.baseGuild.name || "Unbenannt"}{" "}
              <span className={styles.setupInfoMeta}>({setupState.baseGuild.server || "Server n/a"})</span>
            </span>
          </div>
        ) : (
          <div className={styles.setupInfoEmpty}>No base guild selected in Setup tab.</div>
        )}
        <div className={styles.setupInfoRow}>
          <span className={styles.setupInfoLabel}>Partner Guilds</span>
          {setupState.partnerGuilds.length ? (
            <div className={styles.setupInfoPartners}>
              {setupState.partnerGuilds.map((guild) => (
                <span key={guild.id} className={styles.setupInfoBadge}>
                  {guild.name || "Unbenannt"}
                  <span className={styles.setupInfoMeta}> ({guild.server || "Server n/a"})</span>
                </span>
              ))}
            </div>
          ) : (
            <span className={styles.setupInfoEmpty}>No partner guilds added yet.</span>
          )}
        </div>
      </div>

      <div className={styles.membersSummary}>
        <div className={styles.membersSummaryItem}>
          <div className={styles.membersSummaryLabel}>Selected</div>
          <div className={styles.membersSummaryValue}>
            {selectedCount} / {scenario.maxSlots}
          </div>
        </div>
        <div className={styles.membersSummaryItem}>
          <div className={styles.membersSummaryLabel}>Free slots</div>
          <div className={styles.membersSummaryValue}>{freeSlots}</div>
        </div>
        <div className={styles.membersSummaryItem}>
          <div className={styles.membersSummaryLabel}>Bench</div>
          <div className={styles.membersSummaryValue}>{benchCount}</div>
        </div>
        <div className={styles.membersSummaryItem}>
          <div className={styles.membersSummaryLabel}>Drop</div>
          <div className={styles.membersSummaryValue}>{dropCount}</div>
        </div>
        <div className={styles.membersSummaryItem}>
          <div className={styles.membersSummaryLabel}>Reserved</div>
          <div className={styles.membersSummaryValue}>{scenario.reservedSlots}</div>
        </div>
        <div className={styles.membersSummaryItem}>
          <div className={styles.membersSummaryLabel}>Max slots</div>
          <input
            type="number"
            className={styles.maxSlotsInput}
            value={scenario.maxSlots}
            min={0}
            onChange={(e) => onChangeScenarioMaxSlots(Number(e.target.value))}
          />
        </div>
      </div>

      <div className={styles.membersTable}>
        <div className={`${styles.membersRow} ${styles.membersHead}`}>
          <div className={styles.membersCell}>Name</div>
          <div className={styles.membersCell}>Level</div>
          <div className={styles.membersCell}>Guild</div>
          <div className={styles.membersCell}>Class</div>
          <div className={styles.membersCell}>Plan</div>
          <div className={styles.membersCell}>Decision</div>
          <div className={styles.membersCell}>Partner</div>
        </div>
        {members.map((member) => {
          const decision = decisions[member.id] ?? "undecided";
          const target = targets[member.id] ?? "none";
          const partnerMatch = target && target.toString().startsWith("partner:") ? target.split(":")[1] : null;
          const partnerLabel =
            partnerOptions.find((opt) => opt.id === partnerMatch)?.label ??
            (target === "partner" ? partnerOptions[0]?.label ?? "Partner guild" : null);
          const assignment =
            decision === "take" && target === "main"
              ? "main"
              : decision === "take" && (target === "partner" || partnerMatch)
              ? "partner"
              : decision === "bench"
              ? "watch"
              : "unassigned";
          const assignmentLabel =
            assignment === "main"
              ? "Main guild"
              : assignment === "partner"
              ? partnerLabel || "Partner guild"
              : assignment === "watch"
              ? "Watchlist"
              : "Not planned";

          return (
            <div
              key={member.id}
              className={styles.membersRow}
              onContextMenu={(event) => {
                event.preventDefault();
                openContextMenu(member.id, { x: event.clientX, y: event.clientY });
              }}
              onTouchStart={(event) => {
                const touch = event.touches[0];
                if (touch) {
                  startLongPress(member.id, touch.clientX, touch.clientY);
                }
              }}
              onTouchEnd={clearLongPress}
              onTouchCancel={clearLongPress}
            >
              <div className={styles.membersCell}>
                <div className={styles.memberName}>{member.name}</div>
              </div>
              <div className={styles.membersCell}>
                <span className={styles.memberBadge}>Lvl {member.level}</span>
              </div>
              <div className={styles.membersCell}>{member.guildName}</div>
              <div className={styles.membersCell}>{member.className ?? member.class ?? "?"}</div>
              <div className={`${styles.membersCell} ${styles.assignmentCell}`}>
                <span
                  className={`${styles.assignmentBadge} ${
                    assignment === "main"
                      ? styles.assignmentBadgeMain
                      : assignment === "partner"
                      ? styles.assignmentBadgePartner
                      : assignment === "watch"
                      ? styles.assignmentBadgeWatch
                      : styles.assignmentBadgeIdle
                  }`}
                >
                  {assignmentLabel}
                </span>
                <div className={styles.assignmentActions} role="group" aria-label="Target guild selection">
                  <button
                    type="button"
                    className={`${styles.assignmentButton} ${
                      assignment === "main" ? styles.assignmentButtonActive : ""
                    }`}
                    onClick={() => applyAssignment(member.id, "main")}
                  >
                    Main
                  </button>
                  <button
                    type="button"
                    className={`${styles.assignmentButton} ${
                      assignment === "watch" ? styles.assignmentButtonActive : ""
                    }`}
                    onClick={() => applyAssignment(member.id, "watch")}
                  >
                    Watch
                  </button>
                  <button
                    type="button"
                    className={`${styles.assignmentButton} ${
                      assignment === "partner" ? styles.assignmentButtonActive : ""
                    }`}
                    onClick={() => applyAssignment(member.id, "partner")}
                  >
                    Partner
                  </button>
                </div>
              </div>
              <div className={styles.membersCell}>
                <div className={styles.decisionGroup} role="group" aria-label="Decision">
                  {(["take", "bench", "drop", "undecided"] as MemberDecision[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`${styles.decisionButton} ${
                        decision === opt ? styles.decisionButtonActive : ""
                      }`}
                      onClick={() => handleDecisionClick(member.id, opt)}
                    >
                      {opt === "take" ? "Take" : opt === "bench" ? "Bench" : opt === "drop" ? "Drop" : "?"}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`${styles.membersCell} ${styles.partnerPickerCell}`}>
                <label className={styles.partnerLabel} htmlFor={`partner-select-${member.id}`}>
                  Partner
                </label>
                <select
                  id={`partner-select-${member.id}`}
                  className={styles.partnerSelect}
                  value={partnerMatch ?? partnerOptions[0]?.id}
                  onChange={(event) => applyAssignment(member.id, "partner", event.target.value)}
                >
                  {partnerOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
      {contextMenu ? (
        <>
          <div className={styles.contextMenuBackdrop} onClick={closeContextMenu} />
          <div className={styles.contextMenu} style={{ top: contextMenu.y, left: contextMenu.x }}>
            <button type="button" className={styles.contextMenuItem} onClick={() => applyAssignment(contextMenu.memberId, "main")}>
              Move to Main guild
            </button>
            <button type="button" className={styles.contextMenuItem} onClick={() => applyAssignment(contextMenu.memberId, "watch")}>
              Move to Watchlist
            </button>
            {partnerOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={styles.contextMenuItem}
                onClick={() => applyAssignment(contextMenu.memberId, "partner", opt.id)}
              >
                Move to {opt.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
