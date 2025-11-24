import React from "react";
import ContentShell from "../../components/ContentShell";
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
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { db } from "../../lib/firebase";
import styles from "./Fusion.module.css";
import {
  FreshnessCode,
  FRESHNESS_DISPLAY,
  formatCountdown,
  formatDate,
  formatRelative,
} from "./plannerData";

type GuildClassSlice = {
  label: string;
  percent: number;
};

type GuildSummary = {
  id: string;
  name: string;
  tagline: string;
  server: string;
  members: number;
  avgLevel: number;
  lastScanAt: string;
  updatedAt: string;
  nextUpdateAt: string;
  freshness: FreshnessCode;
  classes: GuildClassSlice[];
};

type SlotKey = "guildA" | "guildB";

const SERVER_OPTIONS = ["EU-01", "EU-02", "US-01", "US-02", "ASIA-01"] as const;

const numberFormatter = new Intl.NumberFormat("de-DE");

export default function GuildHubCompareGuilds() {
  const isMdUp = useMediaQuery("(min-width: 768px)");

  const [serverFilter, setServerFilter] = React.useState<string>("all");
  const [selectedGuildAId, setSelectedGuildAId] = React.useState<string | null>(null);
  const [selectedGuildBId, setSelectedGuildBId] = React.useState<string | null>(null);
  const [selectedGuildA, setSelectedGuildA] = React.useState<GuildSummary | null>(null);
  const [selectedGuildB, setSelectedGuildB] = React.useState<GuildSummary | null>(null);

  const totalGuilds = [selectedGuildAId, selectedGuildBId].filter(Boolean).length;
  const averageMembers = React.useMemo(() => {
    const list = [selectedGuildA, selectedGuildB].filter(Boolean) as GuildSummary[];
    if (!list.length) return 0;
    const sum = list.reduce((acc, g) => acc + (g.members ?? 0), 0);
    return Math.round(sum / list.length);
  }, [selectedGuildA, selectedGuildB]);

  const [activePopover, setActivePopover] = React.useState<string | null>(null);
  const [isFilterSheetOpen, setFilterSheetOpen] = React.useState(false);

  const sheetRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, isFilterSheetOpen && !isMdUp);

  React.useEffect(() => {
    if (isMdUp) {
      setFilterSheetOpen(false);
    }
  }, [isMdUp]);

  React.useEffect(() => {
    if (!activePopover) return;
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`.${styles.freshnessBadge}`) || target.closest(`.${styles.freshnessPopover}`)) {
        return;
      }
      setActivePopover(null);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePopover(null);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [activePopover]);

  const countdownA = React.useMemo(
    () => (selectedGuildA ? formatCountdown(selectedGuildA.nextUpdateAt, Date.now()) : ""),
    [selectedGuildA],
  );
  const countdownB = React.useMemo(
    () => (selectedGuildB ? formatCountdown(selectedGuildB.nextUpdateAt, Date.now()) : ""),
    [selectedGuildB],
  );

  const openFilterSheet = () => setFilterSheetOpen(true);
  const closeFilterSheet = () => setFilterSheetOpen(false);

  const handleServerChange = (value: string) => {
    setServerFilter(value);
  };

  const handleGuildSelect = (slot: SlotKey, guild: GuildSummary) => {
    if (slot === "guildA") {
      setSelectedGuildAId(guild.id);
      setSelectedGuildA(guild);
    } else {
      setSelectedGuildBId(guild.id);
      setSelectedGuildB(guild);
    }
  };

  const clearSlot = (slot: SlotKey) => {
    if (slot === "guildA") {
      setSelectedGuildAId(null);
      setSelectedGuildA(null);
    } else {
      setSelectedGuildBId(null);
      setSelectedGuildB(null);
    }
  };

  const toggleFreshnessDetails = (guildId: string) => {
    setActivePopover((prev) => (prev === guildId ? null : guildId));
  };

  const comparisonReady = selectedGuildA && selectedGuildB;

  return (
    <ContentShell title="Guild Hub" subtitle="Gildenvergleich" centerFramed={false}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerStack}>
            <div>
              <p className={styles.kicker}>Guild Hub</p>
              <h1 className={styles.title}>Gilden vergleichen</h1>
              <p className={styles.subtitle}>
                Waehle zwei Gilden, gleiche Kennzahlen ab und sichere Risiken ab, bevor du dich fuer
                oder gegen einen Zusammenschluss entscheidest.
              </p>
            </div>
            <div className={styles.headerActions}>
              {!isMdUp && (
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={openFilterSheet}
                >
                  Filter
                </button>
              )}
            </div>
          </div>
          <div className={styles.infoStrip}>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Pool</span>
              <strong>{numberFormatter.format(totalGuilds)} Gilden</strong>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Durchschnitt Mitglieder</span>
              <strong>{numberFormatter.format(averageMembers)}</strong>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Serverfilter</span>
              <strong>{serverFilter === "all" ? "Alle" : serverFilter}</strong>
            </div>
          </div>
          {isMdUp && (
            <div className={styles.inlineFilters}>
              <label className={styles.filterField}>
                <span>Server</span>
                <select
                  className={styles.select}
                  value={serverFilter}
                  onChange={(event) => handleServerChange(event.target.value)}
                >
                  <option value="all">Alle Server</option>
                  {SERVER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </header>

        <div className={styles.layout}>
          <section className={styles.selectionColumn}>
            <GuildSelectionCard
              title="Gilde A"
              slot="guildA"
              selectedGuild={selectedGuildA}
              excludeId={selectedGuildBId}
              onSelect={handleGuildSelect}
              onClear={clearSlot}
              serverFilter={serverFilter}
              onServerChange={handleServerChange}
            />
            <GuildSelectionCard
              title="Gilde B"
              slot="guildB"
              selectedGuild={selectedGuildB}
              excludeId={selectedGuildAId}
              onSelect={handleGuildSelect}
              onClear={clearSlot}
              serverFilter={serverFilter}
              onServerChange={handleServerChange}
            />
          </section>

          <section className={styles.comparisonColumn}>
            <div className={styles.comparisonCard}>
              <div className={styles.comparisonHeader}>
                <div>
                  <p className={styles.kicker}>Vergleich</p>
                  <h2 className={styles.sectionTitle}>Kennzahlen</h2>
                </div>
                {comparisonReady && (
                  <span className={styles.diffBadge}>
                    Delta Mitglieder:{" "}
                    {numberFormatter.format(selectedGuildA!.members - selectedGuildB!.members)}
                  </span>
                )}
              </div>

              {comparisonReady ? (
                <>
                  <div className={styles.metricGrid}>
                    <MetricCard
                      label="Mitglieder"
                      aValue={selectedGuildA!.members}
                      bValue={selectedGuildB!.members}
                    />
                    <MetricCard
                      label="Durchschnittslevel"
                      aValue={selectedGuildA!.avgLevel}
                      bValue={selectedGuildB!.avgLevel}
                      isDecimal
                    />
                    <FreshnessMetric
                      guildA={selectedGuildA!}
                      guildB={selectedGuildB!}
                      countdownA={countdownA}
                      countdownB={countdownB}
                      activePopover={activePopover}
                      onToggle={toggleFreshnessDetails}
                    />
                  </div>

                  <ClassDistributionCard guildA={selectedGuildA!} guildB={selectedGuildB!} />
                </>
              ) : (
                <div className={styles.emptyState}>
                  <p>Waehle zwei Gilden aus, um den direkten Vergleich zu starten.</p>
                </div>
              )}
            </div>

            <div className={styles.supportPanels}>
              <ChecklistCard />
              <TransfersPlaceholder />
            </div>
          </section>
        </div>
      </div>

      {!isMdUp && (
        <div className={`${styles.sheetOverlay} ${isFilterSheetOpen ? styles.sheetOpen : ""}`}>
          <div className={styles.sheet} role="dialog" aria-modal="true" ref={sheetRef}>
            <header className={styles.sheetHeader}>
              <h3>Filter</h3>
              <button type="button" className={styles.clearButton} onClick={closeFilterSheet}>
                Schliessen
              </button>
            </header>
            <div className={styles.sheetBody}>
              <label className={styles.filterField}>
                <span>Server</span>
                <select
                  className={styles.select}
                  value={serverFilter}
                  onChange={(event) => handleServerChange(event.target.value)}
                >
                  <option value="all">Alle Server</option>
                  {SERVER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      )}
    </ContentShell>
  );
}

type SelectionCardProps = {
  title: string;
  slot: SlotKey;
  selectedGuild: GuildSummary | null;
  excludeId?: string | null;
  onSelect: (slot: SlotKey, guild: GuildSummary) => void;
  onClear: (slot: SlotKey) => void;
  serverFilter: string;
  onServerChange: (value: string) => void;
};

function GuildSelectionCard({
  title,
  slot,
  selectedGuild,
  excludeId,
  onSelect,
  onClear,
  serverFilter,
  onServerChange,
}: SelectionCardProps) {
  const [searchValue, setSearchValue] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchValue, 300);

  React.useEffect(() => {
    setSearchValue("");
  }, [selectedGuild, serverFilter]);

  const { results, loading } = useGuildSearchResults(debouncedSearch, serverFilter, excludeId);

  return (
    <article className={styles.selectionCard}>
      <div className={styles.slotHeader}>
        <div>
          <p className={styles.slotLabel}>{title}</p>
          <p className={styles.slotStatus}>
            {selectedGuild ? "Ausgewaehlt" : "Noch keine Auswahl"}
          </p>
        </div>
        {selectedGuild && (
          <button type="button" className={styles.clearButton} onClick={() => onClear(slot)}>
            Reset
          </button>
        )}
      </div>

      <div className={styles.slotBody}>
        <label className={styles.filterField}>
          <span>Server</span>
          <select
            className={styles.select}
            value={serverFilter}
            onChange={(event) => onServerChange(event.target.value)}
          >
            <option value="all">Alle Server</option>
            {SERVER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
            <span>Suchen</span>
            <input
              className={styles.searchInput}
              placeholder="Gildennamen eingeben"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </label>

          <div className={styles.resultList} role="list">
            {loading && <div className={styles.emptyResult}>Lade...</div>}
            {!loading && results.length === 0 && (
              <div className={styles.emptyResult}>Keine Gilde gefunden.</div>
            )}
          {!loading && results.map((guild) => (
            <div key={guild.id} className={styles.resultItem}>
              <div>
                <p className={styles.resultName}>{guild.name}</p>
                <p className={styles.resultMeta}>
                  {guild.server} - {guild.members} Mitglieder
                </p>
              </div>
              <button
                type="button"
                className={styles.selectButton}
                onClick={() => onSelect(slot, guild)}
              >
                Waehlen
              </button>
            </div>
          ))}
        </div>

        {selectedGuild && (
          <div className={styles.selectedCard}>
            <p className={styles.selectedName}>{selectedGuild.name}</p>
            <p className={styles.selectedMeta}>
              {selectedGuild.server} - {selectedGuild.members} Mitglieder - Durchschnittslevel{" "}
              {selectedGuild.avgLevel.toFixed(1)}
            </p>
            <p className={styles.selectedTagline}>{selectedGuild.tagline}</p>
          </div>
        )}
      </div>
    </article>
  );
}

type MetricProps = {
  label: string;
  aValue: number;
  bValue: number;
  isDecimal?: boolean;
};

function MetricCard({ label, aValue, bValue, isDecimal = false }: MetricProps) {
  const formatter = (value: number) =>
    isDecimal ? value.toFixed(1).replace(".", ",") : numberFormatter.format(value);

  const rawDelta = aValue - bValue;
  let deltaText = "gleich";
  if (rawDelta !== 0) {
    const formattedDelta = isDecimal
      ? Math.abs(rawDelta).toFixed(1).replace(".", ",")
      : numberFormatter.format(Math.abs(rawDelta));
    deltaText = rawDelta > 0 ? `+${formattedDelta}` : `-${formattedDelta}`;
  }

  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      <div className={styles.metricValues}>
        <span aria-label="Gilde A">{formatter(aValue)}</span>
        <span className={styles.metricDivider}>vs</span>
        <span aria-label="Gilde B">{formatter(bValue)}</span>
      </div>
      <p className={styles.metricDelta}>{deltaText}</p>
    </div>
  );
}

type FreshnessMetricProps = {
  guildA: GuildSummary;
  guildB: GuildSummary;
  countdownA: string;
  countdownB: string;
  activePopover: string | null;
  onToggle: (guildId: string) => void;
};

function FreshnessMetric({
  guildA,
  guildB,
  countdownA,
  countdownB,
  activePopover,
  onToggle,
}: FreshnessMetricProps) {
  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>Freshness</p>
      <div className={styles.freshnessRow}>
        {[guildA, guildB].map((guild) => {
          const countdown = guild.id === guildA.id ? countdownA : countdownB;
          const popoverId = `fresh-${guild.id}`;
          const isOpen = activePopover === popoverId;

          return (
            <div key={guild.id} className={styles.freshnessItem}>
              <button
                type="button"
                className={styles.freshnessBadge}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={() => onToggle(popoverId)}
              >
                <span>{guild.freshness.toUpperCase()}</span>
                <small>{formatRelative(guild.lastScanAt)}</small>
              </button>
              {isOpen && (
                <div className={styles.freshnessPopover} role="dialog">
                  <p className={styles.popoverTitle}>{guild.name}</p>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{FRESHNESS_DISPLAY[guild.freshness]}</dd>
                    </div>
                    <div>
                      <dt>Zuletzt gescannt</dt>
                      <dd>{formatDate(guild.lastScanAt)}</dd>
                    </div>
                    <div>
                      <dt>Naechstes Update</dt>
                      <dd>
                        {formatDate(guild.nextUpdateAt)} ({countdown})
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ClassDistributionProps = {
  guildA: GuildSummary;
  guildB: GuildSummary;
};

function ClassDistributionCard({ guildA, guildB }: ClassDistributionProps) {
  const legend = React.useMemo(() => {
    return Array.from(new Set([...guildA.classes, ...guildB.classes].map((slice) => slice.label)));
  }, [guildA.classes, guildB.classes]);

  return (
    <div className={styles.classCard}>
      <p className={styles.metricLabel}>Klassenverteilung</p>
      <div className={styles.classGrid}>
        {[guildA, guildB].map((guild) => (
          <div key={guild.id} className={styles.classColumn}>
            <h3>{guild.name}</h3>
            <div className={styles.classBar} aria-label={`Klassenverteilung ${guild.name}`}>
              {guild.classes.map((slice) => (
                <span
                  key={slice.label}
                  style={{ width: `${slice.percent}%` }}
                  className={styles.classSlice}
                >
                  <small>{slice.label}</small>
                  <strong>{slice.percent}%</strong>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ul className={styles.classLegend}>
        {legend.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}

function ChecklistCard() {
  const items = [
    "Audit der Rollenabdeckung (Tank/Heal/Support)",
    "Loot-Regeln angleichen und dokumentieren",
    "Raid-Kalender synchronisieren",
    "Kommunikationskanaele zusammenfuehren",
    "Server-Transfers und Namenskonflikte pruefen",
  ];

  return (
    <section className={styles.checklistCard}>
      <h3>Vor dem Vergleich pruefen</h3>
      <ul className={styles.checklist}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function TransfersPlaceholder() {
  return (
    <section className={styles.infoCardExtended}>
      <h3>Transfers-Diff</h3>
      <p>
        Hier erscheint spaeter die Auswertung aus <code>lib/guilds/transfers/</code>. Aktuell nur eine
        Info-Box, damit der Slot sichtbar bleibt.
      </p>
      <p className={styles.infoNote}>
        Bereite schon jetzt deine Kriterien vor, damit die spaetere Automatik direkt Daten aufnehmen
        kann.
      </p>
      <button type="button" className={styles.secondaryAction} disabled>
        Modul folgt
      </button>
    </section>
  );
}

function useGuildSearchResults(term: string, server: string, excludeId?: string | null) {
  const [results, setResults] = React.useState<GuildSummary[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const q = term.trim();
    if (q.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const folded = q.toLowerCase();
        const cg = collectionGroup(db, "latest");

        const snapPrefix = await getDocs(
          fsQuery(
            cg,
            orderBy("nameFold"),
            startAt(folded),
            endAt(folded + "\uf8ff"),
            limit(15),
          ),
        );
        const snapNgram = await getDocs(
          fsQuery(cg, where("nameNgrams", "array-contains", folded), limit(15)),
        );

        const seen = new Set<string>();
        const next: GuildSummary[] = [];
        const consider = (docSnap: any) => {
          const data = docSnap.data() as any;
          const ref = docSnap.ref;
          const parentDoc = ref.parent?.parent;
          const rootCol = parentDoc?.parent;
          const root = rootCol?.id;
          if (root !== "guilds") return;
          const id = parentDoc?.id ?? data.guildIdentifier ?? docSnap.id;
          if (!id || seen.has(id)) return;
          if (excludeId && id === excludeId) return;

          const name = data.name ?? data.values?.Name ?? "Unbekannte Gilde";
          const serverVal = data.server ?? data.values?.Server ?? "Unknown";
          if (server !== "all" && serverVal !== server) return;

          const members =
            data.memberCount ??
            data.values?.["Guild Member Count"] ??
            data.values?.GuildMemberCount ??
            0;
          const updated =
            data.updatedAt ??
            data.values?.UpdatedAt ??
            (data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString());

          seen.add(id);
          next.push({
            id,
            name,
            tagline: data.tagline ?? "",
            server: serverVal,
            members,
            avgLevel: data.avgLevel ?? data.values?.AvgLevel ?? 0,
            lastScanAt: updated,
            updatedAt: updated,
            nextUpdateAt: updated,
            freshness: "unknown",
            classes: [],
          });
        };

        snapPrefix.forEach(consider);
        snapNgram.forEach(consider);

        if (!cancelled) {
          next.sort((a, b) => a.name.localeCompare(b.name));
          setResults(next);
        }
      } catch (error) {
        console.error("[GuildHub CompareGuilds] guild search failed", error);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [term, server, excludeId]);

  return { results, loading };
}

function hoursAgoISO(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

function hoursFromNowISO(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}
