import React from "react";
import type {
  FusionMember,
  FusionScenario,
  FusionSetupState,
  MemberDecision,
  TargetGuildAssignment,
} from "../../FusionPlanner";
import styles from "./OverviewTab.module.css";

type Props = {
  members: FusionMember[];
  scenario: FusionScenario | null;
  setupState: FusionSetupState;
  onChangeScenarioDecision: (memberId: string, decision: MemberDecision) => void;
  onChangeScenarioTargetGuild: (memberId: string, target: TargetGuildAssignment) => void;
  onAddPartnerGuild: (name: string) => void;
};

type ContextMenuState = { memberId: string; x: number; y: number };

type ColumnKey = "main" | "watch" | "partner" | "unassigned";

export default function OverviewTab({
  members,
  scenario,
  setupState,
  onChangeScenarioDecision,
  onChangeScenarioTargetGuild,
}: Props) {
  const decisions = scenario?.decisions ?? {};
  const targets = scenario?.targetGuildAssignments ?? {};

  const partnerColumns =
    setupState.partnerGuilds.length > 0
      ? setupState.partnerGuilds.map((guild, index) => ({
          id: guild.id,
          label: guild.name || `Partner ${index + 1}`,
        }))
      : [{ id: "partner-default", label: "Partner guild" }];

  const mainList = members.filter((member) => decisions[member.id] === "take" && targets[member.id] === "main");
  const watchList = members.filter((member) => decisions[member.id] === "bench");
  const partnerBuckets = partnerColumns.reduce<Record<string, FusionMember[]>>((acc, col) => {
    acc[col.id] = members.filter((member) => {
      const target = targets[member.id];
      return decisions[member.id] === "take" && (target === `partner:${col.id}` || target === "partner");
    });
    return acc;
  }, {});
  const unassignedList = members.filter(
    (member) =>
      !mainList.includes(member) &&
      !watchList.includes(member) &&
      !Object.values(partnerBuckets).some((list) => list.includes(member)),
  );

  const [dragOver, setDragOver] = React.useState<ColumnKey | null>(null);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const longPressTimer = React.useRef<number | null>(null);

  const totalMembers = members.length;
  const mainCount = mainList.length;
  const watchCount = watchList.length;
  const partnerCount = Object.values(partnerBuckets).reduce((acc, list) => acc + list.length, 0);
  const freeSlots =
    scenario && typeof scenario.maxSlots === "number"
      ? Math.max(0, scenario.maxSlots - mainCount - partnerCount)
      : 0;

  const applyAssignment = React.useCallback(
    (memberId: string, targetGuild: ColumnKey, partnerId?: string) => {
      if (!memberId) return;
      if (targetGuild === "main") {
        onChangeScenarioDecision(memberId, "take");
        onChangeScenarioTargetGuild(memberId, "main");
      } else if (targetGuild === "partner") {
        onChangeScenarioDecision(memberId, "take");
        onChangeScenarioTargetGuild(memberId, partnerId ? (`partner:${partnerId}` as TargetGuildAssignment) : "partner");
      } else if (targetGuild === "unassigned") {
        onChangeScenarioDecision(memberId, "undecided");
        onChangeScenarioTargetGuild(memberId, "none");
      } else {
        onChangeScenarioDecision(memberId, "bench");
        onChangeScenarioTargetGuild(memberId, "none");
      }
      setContextMenu(null);
    },
    [onChangeScenarioDecision, onChangeScenarioTargetGuild],
  );

  const handleDrop = React.useCallback(
    (key: ColumnKey, partnerId?: string) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const memberId = event.dataTransfer.getData("text/plain");
      if (memberId) {
        applyAssignment(memberId, key, partnerId);
      }
      setDragOver(null);
    },
    [applyAssignment],
  );

  const handleDragOver = React.useCallback((key: ColumnKey) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(key);
  }, []);

  const handleDragLeave = React.useCallback(() => setDragOver(null), []);

  const openContextMenu = React.useCallback((memberId: string, coords: { x: number; y: number }) => {
    setContextMenu({ memberId, ...coords });
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

  if (!scenario) {
    return (
      <div className={styles.emptyWrap}>
        <h3 className={styles.emptyTitle}>Overview</h3>
        <p className={styles.emptyText}>Kein Szenario aktiv. Lege einen Plan an.</p>
      </div>
    );
  }

  if (!members.length) {
    return (
      <div className={styles.emptyWrap}>
        <h3 className={styles.emptyTitle}>No members loaded</h3>
        <p className={styles.emptyText}>Lade ein Setup mit Mitgliedern, um die Uebersicht zu nutzen.</p>
      </div>
    );
  }

  const renderList = (
    listKey: ColumnKey,
    title: string,
    helper: string,
    list: FusionMember[],
    partnerId?: string,
  ) => (
    <div
      className={`${styles.column} ${dragOver === listKey ? styles.columnDropTarget : ""}`}
      onDragOver={handleDragOver(listKey)}
      onDragEnter={handleDragOver(listKey)}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop(listKey, partnerId)}
    >
      <div className={styles.columnHeader}>
        <div>
          <p className={styles.columnKicker}>{helper}</p>
          <h4 className={styles.columnTitle}>{title}</h4>
        </div>
        <span className={styles.columnCount}>{list.length}</span>
      </div>
      <div className={styles.columnBody}>
        {list.length ? (
          list.map((member) => (
            <div
              key={member.id}
              className={styles.memberCard}
              draggable
              onDragStart={(event) => event.dataTransfer.setData("text/plain", member.id)}
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
              <div className={styles.memberTop}>
                <div>
                  <div className={styles.memberName}>{member.name}</div>
                  <p className={styles.memberMeta}>
                    {member.className ?? member.class ?? "Unknown"} • {member.role ?? "Unknown"}
                  </p>
                </div>
                <span className={styles.memberBadge}>Lvl {member.level ?? "?"}</span>
              </div>
              <div className={styles.memberBottom}>
                <span className={styles.memberGuild}>
                  {member.guildName} <span className={styles.memberServer}>({member.server || "Server n/a"})</span>
                </span>
                <div className={styles.memberActions}>
                  <button type="button" onClick={() => applyAssignment(member.id, "main")}>
                    Main
                  </button>
                  <button type="button" onClick={() => applyAssignment(member.id, "watch")}>
                    Watch
                  </button>
                  <button type="button" onClick={() => applyAssignment(member.id, "partner")}>
                    Partner
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyList}>No players in this list yet.</div>
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.overview}>
      <div className={styles.contextBox}>
        <div>
          <p className={styles.contextKicker}>Setup</p>
          <h3 className={styles.contextTitle}>Fusion Overview</h3>
          <p className={styles.contextText}>Ziehe Spieler zwischen den Listen oder nutze das Kontextmenue.</p>
        </div>
        <div className={styles.contextDetails}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Base Guild</span>
            <strong className={styles.detailValue}>{setupState.baseGuild?.name || "Unbenannt"}</strong>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Partner Guilds</span>
            <strong className={styles.detailValue}>{setupState.partnerGuilds.length}</strong>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Max Slots</span>
            <strong className={styles.detailValue}>{scenario.maxSlots}</strong>
          </div>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total players</span>
          <strong className={styles.kpiValue}>{totalMembers}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Main guild</span>
          <strong className={styles.kpiValue}>{mainCount}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Watchlist</span>
          <strong className={styles.kpiValue}>{watchCount}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Partner guild</span>
          <strong className={styles.kpiValue}>{partnerCount}</strong>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Free slots</span>
          <strong className={styles.kpiValue}>{freeSlots}</strong>
        </div>
      </div>

      <div className={styles.columnsWrapper}>
        {renderList("unassigned", "Unassigned", "Noch ohne Planung", unassignedList)}
        {renderList("main", "Main guild", "Take & Assign main", mainList)}
        {renderList("watch", "Watchlist", "Bench for review", watchList)}
        {partnerColumns.map((col) =>
          renderList("partner", col.label, "Take & Assign partner", partnerBuckets[col.id] ?? [], col.id),
        )}
        <button
          type="button"
          className={styles.addPartnerCard}
          onClick={() => onAddPartnerGuild(`Partner ${partnerColumns.length + 1}`)}
        >
          + Partner guild
        </button>
      </div>

      {contextMenu ? (
        <>
          <div className={styles.contextMenuBackdrop} onClick={() => setContextMenu(null)} />
          <div className={styles.contextMenu} style={{ top: contextMenu.y, left: contextMenu.x }}>
            <button type="button" className={styles.contextMenuItem} onClick={() => applyAssignment(contextMenu.memberId, "main")}>
              Move to Main guild
            </button>
            <button type="button" className={styles.contextMenuItem} onClick={() => applyAssignment(contextMenu.memberId, "watch")}>
              Move to Watchlist
            </button>
            {partnerColumns.map((col) => (
              <button
                key={col.id}
                type="button"
                className={styles.contextMenuItem}
                onClick={() => applyAssignment(contextMenu.memberId, "partner", col.id)}
              >
                Move to {col.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
