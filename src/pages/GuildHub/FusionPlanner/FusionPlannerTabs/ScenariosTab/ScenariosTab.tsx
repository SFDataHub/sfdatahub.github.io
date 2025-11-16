import React from "react";
import styles from "./ScenariosTab.module.css";

type MemberDecision = "take" | "bench" | "drop" | "undecided";

type FusionScenario = {
  id: string;
  name: string;
  description?: string;
  maxSlots: number;
  reservedSlots: number;
  decisions: Record<string, MemberDecision>;
};

type ScenarioStats = {
  selected: number;
  bench: number;
  drop: number;
  free: number;
};

type Props = {
  scenarios: FusionScenario[];
  activeScenarioId: string;
  onSetActiveScenario: (id: string) => void;
  onCreateScenario: () => void;
  onDuplicateScenario: (id: string) => void;
  onRenameScenario: (id: string, newName: string) => void;
  onDeleteScenario: (id: string) => void;
};

export default function ScenariosTab({
  scenarios,
  activeScenarioId,
  onSetActiveScenario,
  onCreateScenario,
  onDuplicateScenario,
  onRenameScenario,
  onDeleteScenario,
}: Props) {
  const getStats = React.useCallback(
    (scenario: FusionScenario): ScenarioStats => {
      const decisions = Object.values(scenario.decisions);
      const selected = decisions.filter((d) => d === "take").length;
      const bench = decisions.filter((d) => d === "bench").length;
      const drop = decisions.filter((d) => d === "drop").length;
      const free = Math.max(0, scenario.maxSlots - scenario.reservedSlots - selected);
      return { selected, bench, drop, free };
    },
    [],
  );

  const handleRename = (scenario: FusionScenario) => {
    const nextName = window.prompt("Neuer Szenario-Name", scenario.name);
    if (nextName !== null) {
      onRenameScenario(scenario.id, nextName);
    }
  };

  const handleDelete = (scenario: FusionScenario) => {
    if (scenarios.length <= 1) {
      window.alert("You need at least one scenario. Create a new scenario before deleting this one.");
      return;
    }
    const confirmed = window.confirm("Are you sure you want to delete this scenario?");
    if (confirmed) {
      onDeleteScenario(scenario.id);
    }
  };

  return (
    <div className={styles.scenariosTab}>
      <div className={styles.scenariosHeader}>
        <div>
          <p className={styles.cardKicker}>Scenarios</p>
          <h3 className={styles.scenariosTitle}>Fusion Plans verwalten</h3>
          <p className={styles.scenariosText}>
            Plane Varianten mit eigenen Slot-Einstellungen und Entscheidungen pro Mitglied.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.createButton} onClick={onCreateScenario}>
            Neues Szenario
          </button>
        </div>
      </div>

      <p className={styles.scenarioInfo}>
        Scenarios allow you to compare different fusion plans (slots & decisions) with the same members.
      </p>

      <div className={styles.scenarioList}>
        {scenarios.map((scenario) => {
          const stats = getStats(scenario);
          const isActive = scenario.id === activeScenarioId;
          const deleteDisabled = scenarios.length <= 1;
          return (
            <article
              key={scenario.id}
              className={`${styles.scenarioCard} ${isActive ? styles.scenarioCardActive : ""}`}
            >
              <div className={styles.scenarioCardTop}>
                <div>
                  <p className={styles.cardKicker}>Scenario</p>
                  <h3 className={styles.cardTitle}>{scenario.name}</h3>
                  {scenario.description ? <p className={styles.cardText}>{scenario.description}</p> : null}
                </div>
                {isActive ? <span className={styles.scenarioActiveBadge}>Active</span> : null}
              </div>
              <div className={styles.scenarioMeta}>
                <div>
                  <span className={styles.scenarioMetaLabel}>Max slots</span>
                  <span className={styles.scenarioMetaValue}>{scenario.maxSlots}</span>
                </div>
                <div>
                  <span className={styles.scenarioMetaLabel}>Reserved</span>
                  <span className={styles.scenarioMetaValue}>{scenario.reservedSlots}</span>
                </div>
              </div>
              <div className={styles.scenarioStats}>
                <div className={styles.scenarioStatItem}>
                  <span className={styles.scenarioStatLabel}>Selected</span>
                  <strong className={styles.scenarioStatValue}>{stats.selected}</strong>
                </div>
                <div className={styles.scenarioStatItem}>
                  <span className={styles.scenarioStatLabel}>Free</span>
                  <strong className={styles.scenarioStatValue}>{stats.free}</strong>
                </div>
                <div className={styles.scenarioStatItem}>
                  <span className={styles.scenarioStatLabel}>Bench</span>
                  <strong className={styles.scenarioStatValue}>{stats.bench}</strong>
                </div>
                <div className={styles.scenarioStatItem}>
                  <span className={styles.scenarioStatLabel}>Drop</span>
                  <strong className={styles.scenarioStatValue}>{stats.drop}</strong>
                </div>
              </div>
              <div className={styles.scenarioActions}>
                <button
                  type="button"
                  className={`${styles.scenarioActionButton} ${isActive ? styles.scenarioActionActive : ""}`}
                  onClick={() => onSetActiveScenario(scenario.id)}
                >
                  Set active
                </button>
                <div className={styles.scenarioActionGroup}>
                  <button
                    type="button"
                    className={styles.secondaryActionButton}
                    onClick={() => onDuplicateScenario(scenario.id)}
                  >
                    Duplicate
                  </button>
                  <button type="button" className={styles.secondaryActionButton} onClick={() => handleRename(scenario)}>
                    Rename
                  </button>
                  <button
                    type="button"
                    className={`${styles.deleteActionButton} ${deleteDisabled ? styles.deleteActionDisabled : ""}`}
                    onClick={() => handleDelete(scenario)}
                    disabled={deleteDisabled}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
