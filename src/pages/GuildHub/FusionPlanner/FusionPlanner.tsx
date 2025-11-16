import React from "react";
import { doc, getDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import ContentShell from "../../../components/ContentShell";
import styles from "./FusionPlanner.module.css";
import SetupTab from "./FusionPlannerTabs/SetupTab/SetupTab";
import MembersTab from "./FusionPlannerTabs/MembersTab/MembersTab";
import OverviewTab from "./FusionPlannerTabs/OverviewTab/OverviewTab";
import ScenariosTab from "./FusionPlannerTabs/ScenariosTab/ScenariosTab";
import ResultTab from "./FusionPlannerTabs/ResultTab/ResultTab";
import { db } from "../../../lib/firebase";
import type { MemberSummaryLike } from "../../../components/guilds/GuildProfileInfo/GuildProfileInfo.types";
import type { Member as GuildMember } from "../../../components/guilds/guild-tabs/guild-members/types";

type TabKey = "setup" | "members" | "overview" | "scenarios" | "result";

type Tab = {
  key: TabKey;
  label: string;
  helper: string;
};

export type MemberDecision = "take" | "bench" | "drop" | "undecided";

export type TargetGuildAssignment = "main" | "none" | `partner:${string}` | "partner";

export type FusionMember = GuildMember & { className?: string; guildName: string };

export type FusionScenario = {
  id: string;
  name: string;
  description?: string;
  maxSlots: number;
  reservedSlots: number;
  decisions: Record<string, MemberDecision>;
  targetGuildAssignments?: Record<string, TargetGuildAssignment>;
  createdAt?: string | number;
  isDefault?: boolean;
};

type Stage = {
  key: string;
  step: string;
  title: string;
  description: string;
  badge?: string;
  placeholders: string[];
};

export type FusionMode = "scan" | "manual";

export type PlannerGuildConfig = {
  id: string;
  name: string;
  server: string;
  kind: "base" | "partner";
};

export type FusionSetupState = {
  mode: FusionMode;
  baseGuild?: PlannerGuildConfig;
  partnerGuilds: PlannerGuildConfig[];
};

const DEFAULT_FALLBACK_GUILD_ID = "guild-emerald";

const INITIAL_MEMBERS: FusionMember[] = [
  {
    id: "m1",
    name: "Liora",
    class: "Mage",
    role: "DPS",
    level: 125,
    guildName: "Solaris",
    server: "EU-01",
  },
  {
    id: "m2",
    name: "Korben",
    class: "Warrior",
    role: "Tank",
    level: 118,
    guildName: "Nova Alliance",
    server: "EU-02",
  },
  {
    id: "m3",
    name: "Sable",
    class: "Assassin",
    role: "DPS",
    level: 122,
    guildName: "Eclipse",
    server: "EU-03",
  },
  {
    id: "m4",
    name: "Nyx",
    class: "Priest",
    role: "Support",
    level: 119,
    guildName: "Helios",
    server: "EU-04",
  },
  {
    id: "m5",
    name: "Rowan",
    class: "Scout",
    role: "DPS",
    level: 117,
    guildName: "Solaris",
    server: "EU-01",
  },
  {
    id: "m6",
    name: "Vex",
    class: "Berserker",
    role: "DPS",
    level: 121,
    guildName: "Nova Alliance",
    server: "EU-02",
  },
  {
    id: "m7",
    name: "Elara",
    class: "Druid",
    role: "Healer",
    level: 116,
    guildName: "Eclipse",
    server: "EU-03",
  },
];

const createEmptyDecisions = (list: FusionMember[]) =>
  list.reduce<Record<string, MemberDecision>>((acc, member) => {
    acc[member.id] = "undecided";
    return acc;
  }, {});

const createEmptyTargetGuildAssignments = (list: FusionMember[]) =>
  list.reduce<Record<string, TargetGuildAssignment>>((acc, member) => {
    acc[member.id] = "none";
    return acc;
  }, {});

const mapMemberToFusionMember = (
  entry: MemberSummaryLike,
  guildName: string,
  guildServer: string | null,
): FusionMember => ({
  id: entry.id,
  name: entry.name ?? "Unknown",
  class: entry.class ?? "Unknown",
  className: entry.class ?? undefined,
  role: entry.role ?? "Unknown",
  level: entry.level ?? undefined,
  guildName,
  server: guildServer,
  scrapbook: undefined,
  lastOnline: entry.lastActivityMs ?? null,
  baseStats: {
    main: entry.baseMain ?? undefined,
    con: entry.conBase ?? undefined,
    sumBaseTotal: entry.sumBaseTotal ?? undefined,
  },
  totalStats: entry.totalStats ?? undefined,
  values: {
    treasury: entry.treasury ?? undefined,
    mine: entry.mine ?? undefined,
    attrTotal: entry.attrTotal ?? undefined,
    conTotal: entry.conTotal ?? undefined,
    lastScan: entry.lastScan ?? undefined,
    lastActivity: entry.lastActivity ?? undefined,
  },
});

const resolveGuildIdentifier = (guild?: PlannerGuildConfig | null): string | null => {
  if (!guild) return null;
  const idCandidate = guild.id?.trim();
  if (idCandidate && !idCandidate.startsWith("base-")) return idCandidate;
  const nameCandidate = guild.name?.trim();
  if (nameCandidate) return nameCandidate;
  return null;
};

const createScenarioId = () => `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const TABS: Tab[] = [
  { key: "setup", label: "Setup", helper: "Grundlage und Partner definieren" },
  { key: "members", label: "Members & Slots", helper: "Slots zaehlen, Intake planen" },
  { key: "overview", label: "Overview", helper: "Main/Partner/Watch verwalten" },
  { key: "scenarios", label: "Scenarios", helper: "Plan A/B/C vergleichen" },
  { key: "result", label: "Result", helper: "Finalen Merge-Plan festhalten" },
];

const STAGES: Stage[] = [
  {
    key: "setup",
    step: "01 - Setup",
    title: "Rahmen definieren",
    description: "Server, Regeln und Zeitleiste festlegen, bevor Daten gesammelt werden.",
    badge: "Entwurf",
    placeholders: ["Server & Regeln", "Zeitleiste", "Owner & Stakeholder"],
  },
  {
    key: "members",
    step: "02 - Members & Slots",
    title: "Teams zusammenstellen",
    description: "Slot-Planung und Kapazitaeten mit den beteiligten Gilden abstimmen.",
    badge: "Platzhalter",
    placeholders: ["Member Intake", "Slot Matrix", "Risiken & Offene Punkte"],
  },
  {
    key: "scenarios",
    step: "03 - Scenarios",
    title: "Varianten durchspielen",
    description: "Szenarien vergleichen, um die beste Aufstellung fuer die Fusion zu finden.",
    badge: "Coming soon",
    placeholders: ["Baseline", "Optimistic", "Risk-Adjusted"],
  },
  {
    key: "result",
    step: "04 - Result",
    title: "Ergebnis fixieren",
    description: "Finalen Merge-Plan, KPIs und Kommunikationsplan zusammenfassen.",
    badge: "Review",
    placeholders: ["KPIs & Metrics", "Timeline", "Go/No-Go Check"],
  },
];

export default function FusionPlanner() {
  const [activeTab, setActiveTab] = React.useState<TabKey>("setup");
  const [members, setMembers] = React.useState<FusionMember[]>(INITIAL_MEMBERS);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [setupState, setSetupState] = React.useState<FusionSetupState>({
    mode: "scan",
    baseGuild: undefined,
    partnerGuilds: [],
  });
  const [scenarios, setScenarios] = React.useState<FusionScenario[]>(() => {
    return [
      {
        id: "plan-a",
        name: "Plan A",
        description: "Baseline Variante",
        maxSlots: 50,
        reservedSlots: 0,
        decisions: createEmptyDecisions(INITIAL_MEMBERS),
        targetGuildAssignments: createEmptyTargetGuildAssignments(INITIAL_MEMBERS),
        isDefault: true,
      },
    ];
  });
  const [activeScenarioId, setActiveScenarioId] = React.useState<string>("plan-a");

  const activeScenario = React.useMemo(
    () => scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0] ?? null,
    [activeScenarioId, scenarios],
  );

  const hasBaseGuild = React.useMemo(() => {
    const base = setupState.baseGuild;
    const name = base?.name?.trim();
    const server = base?.server?.trim();
    return Boolean(name && server);
  }, [setupState.baseGuild]);

  const hasMembers = React.useMemo(() => members.length > 0, [members.length]);
  const hasScenarios = React.useMemo(() => scenarios.length > 0, [scenarios.length]);

  const plannerNotices = React.useMemo(() => {
    const notes: string[] = [];
    if (!hasBaseGuild) {
      notes.push("Setup incomplete - no base guild selected.");
    }
    if (hasBaseGuild && !hasMembers) {
      notes.push("No members loaded yet. Check scans or setup.");
    }
    if (!hasScenarios) {
      notes.push("No scenarios defined yet. Create at least one plan in the Scenarios tab.");
    }
    return notes;
  }, [hasBaseGuild, hasMembers, hasScenarios]);

  const handleChangeScenarioDecision = (id: string, value: MemberDecision) => {
    setScenarios((prev) =>
      prev.map((scenario) =>
        scenario.id === activeScenarioId
          ? { ...scenario, decisions: { ...scenario.decisions, [id]: value } }
          : scenario,
      ),
    );
  };

  const handleChangeScenarioTargetGuild = (id: string, target: TargetGuildAssignment) => {
    setScenarios((prev) =>
      prev.map((scenario) =>
        scenario.id === activeScenarioId
          ? {
              ...scenario,
              targetGuildAssignments: { ...(scenario.targetGuildAssignments ?? {}), [id]: target },
            }
          : scenario,
      ),
    );
  };

  const handleScenarioMaxSlotsChange = (value: number) => {
    const numeric = Number(value) || 0;
    setScenarios((prev) =>
      prev.map((scenario) =>
        scenario.id === activeScenarioId ? { ...scenario, maxSlots: Math.max(0, numeric) } : scenario,
      ),
    );
  };

  const handleCreateScenario = () => {
    setScenarios((prev) => {
      const newScenario: FusionScenario = {
        id: createScenarioId(),
        name: `Plan ${prev.length + 1}`,
        description: "Neue Variante",
        maxSlots: 50,
        reservedSlots: 0,
        decisions: createEmptyDecisions(members),
        targetGuildAssignments: createEmptyTargetGuildAssignments(members),
      };
      setActiveScenarioId(newScenario.id);
      return [...prev, newScenario];
    });
  };

  const handleDuplicateScenario = (id: string) => {
    setScenarios((prev) => {
      const source = prev.find((scenario) => scenario.id === id);
      if (!source) return prev;
      const duplicate: FusionScenario = {
        ...source,
        id: createScenarioId(),
        name: `${source.name} Copy`,
        isDefault: false,
        createdAt: Date.now(),
        decisions: { ...source.decisions },
        targetGuildAssignments: { ...(source.targetGuildAssignments ?? {}) },
      };
      setActiveScenarioId(duplicate.id);
      return [...prev, duplicate];
    });
  };

  const handleRenameScenario = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setScenarios((prev) => prev.map((scenario) => (scenario.id === id ? { ...scenario, name: trimmed } : scenario)));
  };

  const handleDeleteScenario = (id: string) => {
    setScenarios((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      const filtered = prev.filter((scenario) => scenario.id !== id);
      if (!filtered.length) {
        return prev;
      }
      if (activeScenarioId === id) {
        setActiveScenarioId(filtered[0].id);
      }
      return filtered;
    });
  };

  React.useEffect(() => {
    if (setupState.mode !== "scan") {
      setMembersLoading(false);
      setMembers(INITIAL_MEMBERS);
      return;
    }

    const guildsToLoad = [
      setupState.baseGuild,
      ...setupState.partnerGuilds,
    ].filter(Boolean) as PlannerGuildConfig[];

    if (guildsToLoad.length === 0) {
      setMembersLoading(false);
      setMembers([]);
      return;
    }

    let cancelled = false;

    async function loadMembers() {
      setMembersLoading(true);
      try {
        const allMembers: FusionMember[] = [];

        for (const guildConfig of guildsToLoad) {
          const targetGuildId = resolveGuildIdentifier(guildConfig);
          if (!targetGuildId) continue;

          const latestRef = doc(db, `guilds/${targetGuildId}/latest/latest`);
          const latestSnap = await getDoc(latestRef);
          const latestData = latestSnap.exists() ? (latestSnap.data() as any) : null;
          const guildName =
            guildConfig.name?.trim() ??
            latestData?.name ??
            latestData?.values?.Name ??
            targetGuildId;
          const guildServer =
            guildConfig.server?.trim() ??
            latestData?.server ??
            latestData?.values?.Server ??
            null;

          const membersRef = doc(db, `guilds/${targetGuildId}/snapshots/members_summary`);
          const membersSnap = await getDoc(membersRef);
          if (!membersSnap.exists()) continue;
          const rawMembers = membersSnap.data() as any;
          const list = Array.isArray(rawMembers.members) ? (rawMembers.members as MemberSummaryLike[]) : [];

          list.forEach((entry) => {
            allMembers.push(mapMemberToFusionMember(entry, guildName, guildServer));
          });
        }

        if (!cancelled) {
          setMembers(allMembers);
        }
      } catch (error) {
        console.error("[FusionPlanner] Failed to load members", error);
        if (!cancelled) {
          setMembers([]);
        }
      } finally {
        if (!cancelled) {
          setMembersLoading(false);
        }
      }
    }

    setMembers([]);
    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [setupState.baseGuild, setupState.partnerGuilds, setupState.mode]);

  React.useEffect(() => {
    if (membersLoading) return;
    setScenarios((prev) =>
      prev.map((scenario) => {
        const memberIds = new Set(members.map((member) => member.id));
        const decisions = { ...scenario.decisions };
        const targetGuildAssignments = { ...(scenario.targetGuildAssignments ?? {}) };
        members.forEach((member) => {
          if (!decisions[member.id]) {
            decisions[member.id] = "undecided";
          }
          if (!targetGuildAssignments[member.id]) {
            targetGuildAssignments[member.id] = "none";
          }
        });
        Object.keys(decisions).forEach((id) => {
          if (!memberIds.has(id)) {
            delete decisions[id];
          }
        });
        Object.keys(targetGuildAssignments).forEach((id) => {
          if (!memberIds.has(id)) {
            delete targetGuildAssignments[id];
          }
        });
        return { ...scenario, decisions, targetGuildAssignments };
      }),
    );
  }, [members, membersLoading]);

  const handleChangeMode = (mode: FusionMode) => {
    setSetupState((prev) => ({ ...prev, mode }));
  };

  const handleChangeBaseGuild = (partial: { id?: string; name?: string; server?: string }) => {
    setSetupState((prev) => {
      const base = prev.baseGuild ?? { id: "base-1", kind: "base", name: "", server: "" };
      return {
        ...prev,
        baseGuild: {
          ...base,
          ...(partial.id ? { id: partial.id } : {}),
          name: partial.name ?? base.name,
          server: partial.server ?? base.server,
        },
      };
    });
  };

  const handleAddPartnerGuild = (data: { id?: string; name: string; server: string }) => {
    if (!data.name.trim() || !data.server.trim()) return;
    const name = data.name.trim();
    const server = data.server.trim();
    const id = data.id?.trim();
    setSetupState((prev) => ({
      ...prev,
      partnerGuilds: [
        ...prev.partnerGuilds,
        {
          id: id && !id.startsWith("partner-") ? id : `partner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          name,
          server,
          kind: "partner",
        },
      ],
    }));
  };

  const handleRemovePartnerGuild = (id: string) => {
    setSetupState((prev) => ({
      ...prev,
      partnerGuilds: prev.partnerGuilds.filter((guild) => guild.id !== id),
    }));
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "setup":
        return (
          <SetupTab
            setupState={setupState}
            onChangeMode={handleChangeMode}
            onChangeBaseGuild={handleChangeBaseGuild}
            onAddPartnerGuild={handleAddPartnerGuild}
            onRemovePartnerGuild={handleRemovePartnerGuild}
          />
        );
      case "members":
        return (
          <MembersTab
            members={members}
            scenario={activeScenario}
            onChangeScenarioDecision={handleChangeScenarioDecision}
            onChangeScenarioTargetGuild={handleChangeScenarioTargetGuild}
            onChangeScenarioMaxSlots={handleScenarioMaxSlotsChange}
            setupState={setupState}
          />
        );
      case "overview":
        return (
          <OverviewTab
            members={members}
            scenario={activeScenario}
            setupState={setupState}
            onChangeScenarioDecision={handleChangeScenarioDecision}
            onChangeScenarioTargetGuild={handleChangeScenarioTargetGuild}
            onAddPartnerGuild={(name) =>
              handleAddPartnerGuild({
                name,
                server: "tbd",
              })
            }
          />
        );
      case "scenarios":
        return (
          <ScenariosTab
            scenarios={scenarios}
            activeScenarioId={activeScenarioId}
            onSetActiveScenario={setActiveScenarioId}
            onCreateScenario={handleCreateScenario}
            onDuplicateScenario={handleDuplicateScenario}
            onRenameScenario={handleRenameScenario}
            onDeleteScenario={handleDeleteScenario}
          />
        );
      case "result":
        return <ResultTab members={members} scenario={activeScenario} setupState={setupState} />;
      default:
        return null;
    }
  };


  return (
    <ContentShell title="Guild Hub" subtitle="Fusion Planner" centerFramed={false}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerLeading}>
            <Link to="/guild-hub" className={styles.backLink}>
              Back to Guild Hub
            </Link>
            <div className={styles.headerStack}>
              <p className={styles.kicker}>Guild Hub</p>
              <h1 className={styles.title}>Fusion Planner</h1>
              <p className={styles.subtitle}>Plan guild merges with slots, scenarios and results.</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.primaryAction}>
              Neues Setup
            </button>
            <button type="button" className={styles.secondaryAction}>
              Checkliste
            </button>
          </div>
        </header>

        {plannerNotices.length ? (
          <div className={styles.plannerNotice} role="status" aria-live="polite">
            {plannerNotices.map((note) => (
              <div
                key={note}
                className={`${styles.noticeItem} ${
                  note.toLowerCase().includes("no base guild") ? styles.noticeWarning : ""
                }`}
              >
                <span className={styles.noticeDot} aria-hidden />
                <span>{note}</span>
              </div>
            ))}
          </div>
        ) : null}

        <section className={styles.tabSection} aria-label="Fusion Planner Tabs">
          <div className={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                  aria-pressed={isActive}
                >
                  <span className={styles.tabLabel}>{tab.label}</span>
                  <span className={styles.tabHelper}>{tab.helper}</span>
                </button>
              );
            })}
          </div>
          <div className={styles.tabPanel}>
            <span className={styles.tabBadge}>{TABS.find((tab) => tab.key === activeTab)?.label}</span>
            {renderTabContent()}
          </div>
        </section>

        <section className={styles.infoStrip}>
          <div className={styles.infoBlock}>
            <span className={styles.infoLabel}>Status</span>
            <strong>Entwurf</strong>
            <p className={styles.infoHint}>Bereit fuer weitere Eingaben.</p>
          </div>
          <div className={styles.infoBlock}>
            <span className={styles.infoLabel}>Slots geplant</span>
            <strong>0 / 40</strong>
            <p className={styles.infoHint}>Platzhalter fuer spaeteres Slot-Mapping.</p>
          </div>
          <div className={styles.infoBlock}>
            <span className={styles.infoLabel}>Szenarien</span>
            <strong>3</strong>
            <p className={styles.infoHint}>Baseline, Optimistic, Risiko.</p>
          </div>
          <div className={styles.infoBlock}>
            <span className={styles.infoLabel}>Letztes Update</span>
            <strong>vor wenigen Minuten</strong>
            <p className={styles.infoHint}>Dummy-Text wird spaeter dynamisch ersetzt.</p>
          </div>
        </section>

        <section className={styles.stageGrid}>
          {STAGES.map((stage) => (
            <article key={stage.key} className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelKicker}>{stage.step}</p>
                  <h2 className={styles.panelTitle}>{stage.title}</h2>
                  <p className={styles.panelLead}>{stage.description}</p>
                </div>
                {stage.badge ? <span className={styles.badge}>{stage.badge}</span> : null}
              </div>
              <div className={styles.panelBody}>
                <div className={styles.placeholderGrid}>
                  {stage.placeholders.map((label) => (
                    <div key={label} className={styles.placeholderCard}>
                      <div className={styles.placeholderTitle}>{label}</div>
                      <p className={styles.placeholderText}>
                        Strukturierte Flaeche fuer spaetere Eingaben.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className={styles.helperSection}>
          <div className={styles.helperCard}>
            <div>
              <p className={styles.helperKicker}>Result</p>
              <h3 className={styles.helperTitle}>Finaler Merge-Plan</h3>
              <p className={styles.helperText}>
                Zusammenfassung fuer Freigaben, inklusive KPIs, Risiken und Kommunikationsplan.
              </p>
            </div>
            <div className={styles.helperActions}>
              <button type="button" className={styles.secondaryAction}>
                Teilen
              </button>
              <button type="button" className={styles.primaryAction}>
                Review starten
              </button>
            </div>
          </div>
        </section>
      </div>
    </ContentShell>
  );
}

