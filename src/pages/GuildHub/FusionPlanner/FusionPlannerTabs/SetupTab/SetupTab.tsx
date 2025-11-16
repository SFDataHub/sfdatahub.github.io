import React from "react";
import {
  collectionGroup,
  endAt,
  getDocs,
  limit,
  orderBy,
  query as fsQuery,
  startAt,
  where,
} from "firebase/firestore";
import { useDebouncedValue } from "../../../../../hooks/useDebouncedValue";
import { db } from "../../../../../lib/firebase";
import type { FusionMode, FusionSetupState } from "../../FusionPlanner";
import styles from "./SetupTab.module.css";

type GuildForm = {
  id?: string;
  name: string;
  server: string;
};

type SetupTabProps = {
  setupState: FusionSetupState;
  onChangeMode: (mode: FusionMode) => void;
  onChangeBaseGuild: (partial: { id?: string; name?: string; server?: string }) => void;
  onAddPartnerGuild: (data: { id?: string; name: string; server: string }) => void;
  onRemovePartnerGuild: (id: string) => void;
};

export default function SetupTab({
  setupState,
  onChangeMode,
  onChangeBaseGuild,
  onAddPartnerGuild,
  onRemovePartnerGuild,
}: SetupTabProps) {
  const [baseDraft, setBaseDraft] = React.useState<GuildForm>(() => ({
    name: setupState.baseGuild?.name ?? "",
    server: setupState.baseGuild?.server ?? "",
  }));
  const [partnerDraft, setPartnerDraft] = React.useState<GuildForm>({ id: undefined, name: "", server: "" });
  const debouncedBase = useDebouncedValue(baseDraft.name, 250);
  const debouncedPartner = useDebouncedValue(partnerDraft.name, 250);
  const baseResults = useGuildSearchResults(debouncedBase, baseDraft.server || "all");
  const partnerResults = useGuildSearchResults(debouncedPartner, partnerDraft.server || "all");
  const baseConfigured = Boolean(setupState.baseGuild?.name?.trim() && setupState.baseGuild?.server?.trim());
  const hasPartners = setupState.partnerGuilds.length > 0;

  // Sync down external base guild changes (e.g. loaded scans) without stealing focus.
  React.useEffect(() => {
    const next = {
      name: setupState.baseGuild?.name ?? "",
      server: setupState.baseGuild?.server ?? "",
    };
    if (next.name !== baseDraft.name || next.server !== baseDraft.server) {
      setBaseDraft(next);
    }
  }, [setupState.baseGuild?.name, setupState.baseGuild?.server]);

  const addPartnerGuild = () => {
    if (!partnerDraft.name.trim() || !partnerDraft.server.trim()) return;
    onAddPartnerGuild(partnerDraft);
    setPartnerDraft({ id: undefined, name: "", server: "" });
  };

  return (
    <>
      <div className={styles.setupGrid}>
        <div className={styles.setupLeft}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardKicker}>Modus</p>
                <h3 className={styles.cardTitle}>Scan-based oder manuell</h3>
                <p className={styles.cardText}>
                  Waehle, ob bestehende Scans genutzt oder alle Angaben manuell erfasst werden.
                </p>
              </div>
            </div>
            <div className={styles.toggleGroup} role="group" aria-label="Setup Modus">
              <button
                type="button"
                className={`${styles.toggleButton} ${
                  setupState.mode === "scan" ? styles.toggleButtonActive : ""
                }`}
                onClick={() => onChangeMode("scan")}
              >
                Scan-based
              </button>
              <button
                type="button"
                className={`${styles.toggleButton} ${
                  setupState.mode === "manual" ? styles.toggleButtonActive : ""
                }`}
                onClick={() => onChangeMode("manual")}
              >
                Manual
              </button>
            </div>
            <p className={styles.modeHint}>
              {setupState.mode === "scan"
                ? "Use existing scan data (empfohlen, wenn aktuelle Scans vorliegen)."
                : "Enter guild information manually if no scans are available."}
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardKicker}>Base Guild</p>
                <h3 className={styles.cardTitle}>Stammdaten</h3>
                <p className={styles.cardText}>
                  Lege die Basisgilde fest, die fuer die Fusion verwendet wird.
                </p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Guild name</span>
                <input
                  type="text"
                  className={styles.input}
                  value={baseDraft.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setBaseDraft((prev) => ({ ...prev, name }));
                  }}
                  onBlur={() => onChangeBaseGuild({ name: baseDraft.name })}
                  placeholder="z.B. Solaris"
                />
                {baseResults.length > 0 && (
                  <div className={styles.suggestions}>
                    {baseResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.suggestionBtn}
                        onClick={() => {
                          setBaseDraft({ name: item.name, server: item.server });
                          onChangeBaseGuild({ id: item.id, name: item.name, server: item.server });
                        }}
                      >
                        <span className={styles.suggestionName}>{item.name}</span>
                        <span className={styles.suggestionMeta}>{item.server}</span>
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Server</span>
                <input
                  type="text"
                  className={styles.input}
                  value={baseDraft.server}
                  onChange={(e) => {
                    const server = e.target.value;
                    setBaseDraft((prev) => ({ ...prev, server }));
                  }}
                  onBlur={() => onChangeBaseGuild({ server: baseDraft.server })}
                  placeholder="z.B. EU-01"
                />
              </label>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardKicker}>Partner Guilds</p>
                <h3 className={styles.cardTitle}>Partner hinzufuegen</h3>
                <p className={styles.cardText}>
                  Fuege eine oder mehrere Partnergilden hinzu, die an der Fusion beteiligt sind.
                </p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Name</span>
                <input
                  type="text"
                  className={styles.input}
                  value={partnerDraft.name}
                  onChange={(e) =>
                    setPartnerDraft((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="z.B. Nova Alliance"
                />
                {partnerResults.length > 0 && (
                  <div className={styles.suggestions}>
                    {partnerResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.suggestionBtn}
                        onClick={() => setPartnerDraft({ id: item.id, name: item.name, server: item.server })}
                      >
                        <span className={styles.suggestionName}>{item.name}</span>
                        <span className={styles.suggestionMeta}>{item.server}</span>
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Server</span>
                <input
                  type="text"
                  className={styles.input}
                  value={partnerDraft.server}
                  onChange={(e) =>
                    setPartnerDraft((prev) => ({ ...prev, server: e.target.value }))
                  }
                  placeholder="z.B. EU-02"
                />
              </label>
            </div>
            <div className={styles.partnerActions}>
              <button type="button" className={styles.primaryAction} onClick={addPartnerGuild}>
                Add partner guild
              </button>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setPartnerDraft({ name: "", server: "" })}
              >
                Reset fields
              </button>
            </div>

            <div className={styles.partnerList}>
              {setupState.partnerGuilds.length === 0 ? (
                <div className={styles.emptyState}>No partner guilds added yet.</div>
              ) : (
                setupState.partnerGuilds.map((guild) => (
                  <div key={guild.id} className={styles.partnerRow}>
                    <div>
                      <div className={styles.partnerName}>{guild.name || "Unbenannt"}</div>
                      <div className={styles.partnerMeta}>{guild.server || "Server n/a"}</div>
                    </div>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => onRemovePartnerGuild(guild.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className={styles.setupRight}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardKicker}>Preview</p>
                <h3 className={styles.cardTitle}>Uebersicht</h3>
                <p className={styles.cardText}>
                  Zusammenfassung der aktuellen Auswahl, bevor weitere Daten geladen werden.
                </p>
              </div>
            </div>
            <div className={styles.previewBlock}>
              <div className={styles.previewLabel}>Modus</div>
              <div className={styles.previewValue}>{setupState.mode === "scan" ? "Scan-based" : "Manual"}</div>
            </div>
            <div className={styles.previewBlock}>
              <div className={styles.previewLabel}>Base Guild</div>
              <div className={styles.previewCard}>
                {setupState.baseGuild?.name || setupState.baseGuild?.server ? (
                  <>
                    <div className={styles.previewTitle}>{setupState.baseGuild?.name || "Unbenannt"}</div>
                    <div className={styles.previewMeta}>{setupState.baseGuild?.server || "Server n/a"}</div>
                  </>
                ) : (
                  <div className={styles.emptyState}>No base guild selected yet.</div>
                )}
              </div>
            </div>
            <div className={styles.previewBlock}>
              <div className={styles.previewLabel}>Partner Guilds</div>
              <div className={styles.previewList}>
                {setupState.partnerGuilds.length === 0 ? (
                  <div className={styles.emptyState}>No partner guilds added yet.</div>
                ) : (
                  setupState.partnerGuilds.map((guild) => (
                    <div key={guild.id} className={styles.previewItem}>
                      <div className={styles.previewTitle}>{guild.name || "Unbenannt"}</div>
                      <div className={styles.previewMeta}>{guild.server || "Server n/a"}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {!baseConfigured ? (
        <div className={`${styles.setupInfo} ${styles.setupWarning}`} role="status" aria-live="polite">
          <span className={styles.setupInfoIcon} aria-hidden>
            i
          </span>
          <div>
            <div className={styles.setupInfoTitle}>No base guild selected yet.</div>
            <p className={styles.setupInfoText}>
              Please choose a base guild (name and server) to plan a fusion with real members.
            </p>
          </div>
        </div>
      ) : !hasPartners ? (
        <div className={styles.setupInfo} role="status" aria-live="polite">
          <span className={styles.setupInfoIcon} aria-hidden>
            i
          </span>
          <div>
            <div className={styles.setupInfoTitle}>Optional: add partner guilds.</div>
            <p className={styles.setupInfoText}>
              You can add partner guilds to compare multi-guild fusion scenarios later.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

type GuildResult = { id: string; name: string; server: string };

function useGuildSearchResults(term: string, server: string) {
  const [results, setResults] = React.useState<GuildResult[]>([]);

  React.useEffect(() => {
    const q = term.trim().toLowerCase();
    if (!q) {
      setResults([]);
      return;
    }

    let cancelled = false;
    async function run() {
      try {
        const cg = collectionGroup(db, "latest");
        const snapPrefix = await getDocs(
          fsQuery(
            cg,
            orderBy("nameFold"),
            startAt(q),
            endAt(q + "\uf8ff"),
            limit(12),
          ),
        );
        const snapNgram = await getDocs(
          fsQuery(cg, where("nameNgrams", "array-contains", q), limit(12)),
        );

        const seen = new Set<string>();
        const next: GuildResult[] = [];
        const consider = (docSnap: any) => {
          const data = docSnap.data() as any;
          const ref = docSnap.ref;
          const parentDoc = ref.parent?.parent;
          const root = parentDoc?.parent?.id;
          if (root !== "guilds") return;
          const id = parentDoc?.id ?? data.guildIdentifier ?? docSnap.id;
          if (!id || seen.has(id)) return;

          const srv = data.server ?? data.values?.Server ?? "Unknown";
          if (server !== "all" && srv !== server) return;

          const name = data.name ?? data.values?.Name ?? "Unbekannte Gilde";
          seen.add(id);
          next.push({ id, name, server: srv });
        };

        snapPrefix.forEach(consider);
        snapNgram.forEach(consider);

        if (!cancelled) {
          next.sort((a, b) => a.name.localeCompare(b.name));
          setResults(next);
        }
      } catch (err) {
        console.error("[FusionPlanner] guild search failed", err);
        if (!cancelled) setResults([]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [term, server]);

  return results;
}
