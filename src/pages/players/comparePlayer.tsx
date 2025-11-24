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
import styles from "../GuildHub/Fusion.module.css";
import {
  FreshnessCode,
  FRESHNESS_DISPLAY,
  formatCountdown,
  formatDate,
  formatRelative,
} from "../GuildHub/plannerData";

type PlayerStatSlice = {
  label: string;
  percent: number;
};

type PlayerSummary = {
  id: string;
  name: string;
  tagline: string;
  server: string;
  className: string;
  guildName: string;
  level: number;
  scrapbookPct: number;
  lastScanAt: string;
  updatedAt: string;
  nextUpdateAt: string;
  freshness: FreshnessCode;
  stats: PlayerStatSlice[];
};

type SlotKey = "playerA" | "playerB";

const SERVER_OPTIONS = ["EU-01", "EU-02", "US-01", "US-02", "ASIA-01"] as const;

const numberFormatter = new Intl.NumberFormat("de-DE");

export default function PlayersCompare() {
  const isMdUp = useMediaQuery("(min-width: 768px)");

  const [serverFilter, setServerFilter] = React.useState<string>("all");
  const [selectedPlayerAId, setSelectedPlayerAId] = React.useState<string | null>(null);
  const [selectedPlayerBId, setSelectedPlayerBId] = React.useState<string | null>(null);
  const [selectedPlayerA, setSelectedPlayerA] = React.useState<PlayerSummary | null>(null);
  const [selectedPlayerB, setSelectedPlayerB] = React.useState<PlayerSummary | null>(null);

  const totalPlayers = [selectedPlayerAId, selectedPlayerBId].filter(Boolean).length;
  const averageLevel = React.useMemo(() => {
    const list = [selectedPlayerA, selectedPlayerB].filter(Boolean) as PlayerSummary[];
    if (!list.length) return 0;
    const sum = list.reduce((acc, player) => acc + (player.level ?? 0), 0);
    return Math.round(sum / list.length);
  }, [selectedPlayerA, selectedPlayerB]);

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
    () => (selectedPlayerA ? formatCountdown(selectedPlayerA.nextUpdateAt, Date.now()) : ""),
    [selectedPlayerA],
  );
  const countdownB = React.useMemo(
    () => (selectedPlayerB ? formatCountdown(selectedPlayerB.nextUpdateAt, Date.now()) : ""),
    [selectedPlayerB],
  );

  const openFilterSheet = () => setFilterSheetOpen(true);
  const closeFilterSheet = () => setFilterSheetOpen(false);

  const handleServerChange = (value: string) => {
    setServerFilter(value);
  };

  const handlePlayerSelect = (slot: SlotKey, player: PlayerSummary) => {
    if (slot === "playerA") {
      setSelectedPlayerAId(player.id);
      setSelectedPlayerA(player);
    } else {
      setSelectedPlayerBId(player.id);
      setSelectedPlayerB(player);
    }
  };

  const clearSlot = (slot: SlotKey) => {
    if (slot === "playerA") {
      setSelectedPlayerAId(null);
      setSelectedPlayerA(null);
    } else {
      setSelectedPlayerBId(null);
      setSelectedPlayerB(null);
    }
  };

  const toggleFreshnessDetails = (playerId: string) => {
    setActivePopover((prev) => (prev === playerId ? null : playerId));
  };

  const comparisonReady = selectedPlayerA && selectedPlayerB;

  return (
    <ContentShell title="Players" subtitle="Spielervergleich" centerFramed={false}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerStack}>
            <div>
              <p className={styles.kicker}>Players</p>
              <h1 className={styles.title}>Spieler vergleichen</h1>
              <p className={styles.subtitle}>
                Waehle zwei Charaktere aus, gleiche Level, Scrapbook und Freshness ab und finde die
                staerkere Option fuer dein Team oder deine Analyse.
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
              <span className={styles.infoLabel}>Slots gefuellt</span>
              <strong>{numberFormatter.format(totalPlayers)} Spieler</strong>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Durchschnittslevel</span>
              <strong>{numberFormatter.format(averageLevel)}</strong>
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
            <PlayerSelectionCard
              title="Spieler A"
              slot="playerA"
              selectedPlayer={selectedPlayerA}
              excludeId={selectedPlayerBId}
              onSelect={handlePlayerSelect}
              onClear={clearSlot}
              serverFilter={serverFilter}
              onServerChange={handleServerChange}
            />
            <PlayerSelectionCard
              title="Spieler B"
              slot="playerB"
              selectedPlayer={selectedPlayerB}
              excludeId={selectedPlayerAId}
              onSelect={handlePlayerSelect}
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
                    Delta Level: {numberFormatter.format(selectedPlayerA!.level - selectedPlayerB!.level)}
                  </span>
                )}
              </div>

              {comparisonReady ? (
                <>
                  <div className={styles.metricGrid}>
                    <MetricCard
                      label="Level"
                      aValue={selectedPlayerA!.level}
                      bValue={selectedPlayerB!.level}
                    />
                    <MetricCard
                      label="Scrapbook (%)"
                      aValue={selectedPlayerA!.scrapbookPct}
                      bValue={selectedPlayerB!.scrapbookPct}
                      isDecimal
                    />
                    <FreshnessMetric
                      playerA={selectedPlayerA!}
                      playerB={selectedPlayerB!}
                      countdownA={countdownA}
                      countdownB={countdownB}
                      activePopover={activePopover}
                      onToggle={toggleFreshnessDetails}
                    />
                  </div>

                  <StatDistributionCard playerA={selectedPlayerA!} playerB={selectedPlayerB!} />
                </>
              ) : (
                <div className={styles.emptyState}>
                  <p>Waehle zwei Spieler aus, um den direkten Vergleich zu starten.</p>
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

type PlayerSelectionCardProps = {
  title: string;
  slot: SlotKey;
  selectedPlayer: PlayerSummary | null;
  excludeId?: string | null;
  onSelect: (slot: SlotKey, player: PlayerSummary) => void;
  onClear: (slot: SlotKey) => void;
  serverFilter: string;
  onServerChange: (value: string) => void;
};

function PlayerSelectionCard({
  title,
  slot,
  selectedPlayer,
  excludeId,
  onSelect,
  onClear,
  serverFilter,
  onServerChange,
}: PlayerSelectionCardProps) {
  const [searchValue, setSearchValue] = React.useState("");
  const debouncedSearch = useDebouncedValue(searchValue, 300);

  React.useEffect(() => {
    setSearchValue("");
  }, [selectedPlayer, serverFilter]);

  const { results, loading } = usePlayerSearchResults(debouncedSearch, serverFilter, excludeId);

  return (
    <article className={styles.selectionCard}>
      <div className={styles.slotHeader}>
        <div>
          <p className={styles.slotLabel}>{title}</p>
          <p className={styles.slotStatus}>
            {selectedPlayer ? "Ausgewaehlt" : "Noch keine Auswahl"}
          </p>
        </div>
        {selectedPlayer && (
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
            placeholder="Spielernamen eingeben"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
        </label>

        <div className={styles.resultList} role="list">
          {loading && <div className={styles.emptyResult}>Lade...</div>}
          {!loading && results.length === 0 && (
            <div className={styles.emptyResult}>Kein Spieler gefunden.</div>
          )}
          {!loading &&
            results.map((player) => (
              <div key={player.id} className={styles.resultItem}>
                <div>
                  <p className={styles.resultName}>{player.name}</p>
                  <p className={styles.resultMeta}>
                    {player.server} - Level {player.level} - {player.className}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.selectButton}
                  onClick={() => onSelect(slot, player)}
                >
                  Waehlen
                </button>
              </div>
            ))}
        </div>

        {selectedPlayer && (
          <div className={styles.selectedCard}>
            <p className={styles.selectedName}>{selectedPlayer.name}</p>
            <p className={styles.selectedMeta}>
              {selectedPlayer.server} - Level {selectedPlayer.level} - {selectedPlayer.className} -{" "}
              {selectedPlayer.guildName || "ohne Gilde"}
            </p>
            <p className={styles.selectedTagline}>{selectedPlayer.tagline}</p>
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
        <span aria-label="Spieler A">{formatter(aValue)}</span>
        <span className={styles.metricDivider}>vs</span>
        <span aria-label="Spieler B">{formatter(bValue)}</span>
      </div>
      <p className={styles.metricDelta}>{deltaText}</p>
    </div>
  );
}

type FreshnessMetricProps = {
  playerA: PlayerSummary;
  playerB: PlayerSummary;
  countdownA: string;
  countdownB: string;
  activePopover: string | null;
  onToggle: (playerId: string) => void;
};

function FreshnessMetric({
  playerA,
  playerB,
  countdownA,
  countdownB,
  activePopover,
  onToggle,
}: FreshnessMetricProps) {
  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>Freshness</p>
      <div className={styles.freshnessRow}>
        {[playerA, playerB].map((player) => {
          const countdown = player.id === playerA.id ? countdownA : countdownB;
          const popoverId = `fresh-${player.id}`;
          const isOpen = activePopover === popoverId;

          return (
            <div key={player.id} className={styles.freshnessItem}>
              <button
                type="button"
                className={styles.freshnessBadge}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={() => onToggle(popoverId)}
              >
                <span>{player.freshness.toUpperCase()}</span>
                <small>{formatRelative(player.lastScanAt)}</small>
              </button>
              {isOpen && (
                <div className={styles.freshnessPopover} role="dialog">
                  <p className={styles.popoverTitle}>{player.name}</p>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{FRESHNESS_DISPLAY[player.freshness]}</dd>
                    </div>
                    <div>
                      <dt>Zuletzt gescannt</dt>
                      <dd>{formatDate(player.lastScanAt)}</dd>
                    </div>
                    <div>
                      <dt>Naechstes Update</dt>
                      <dd>
                        {formatDate(player.nextUpdateAt)} ({countdown})
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

type StatDistributionProps = {
  playerA: PlayerSummary;
  playerB: PlayerSummary;
};

function StatDistributionCard({ playerA, playerB }: StatDistributionProps) {
  const legend = React.useMemo(() => {
    return Array.from(new Set([...playerA.stats, ...playerB.stats].map((slice) => slice.label)));
  }, [playerA.stats, playerB.stats]);

  const renderSlices = (player: PlayerSummary) => {
    const data = player.stats.length
      ? player.stats
      : [{ label: "Keine Daten", percent: 100 }];

    return (
      <div className={styles.classColumn}>
        <h3>{player.name}</h3>
        <div className={styles.classBar} aria-label={`Statverteilung ${player.name}`}>
          {data.map((slice) => (
            <span
              key={`${player.id}-${slice.label}`}
              style={{ width: `${slice.percent}%` }}
              className={styles.classSlice}
            >
              <small>{slice.label}</small>
              <strong>{slice.percent}%</strong>
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.classCard}>
      <p className={styles.metricLabel}>Stat-Verteilung</p>
      <div className={styles.classGrid}>{[playerA, playerB].map(renderSlices)}</div>
      {legend.length > 0 && (
        <ul className={styles.classLegend}>
          {legend.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChecklistCard() {
  const items = [
    "Build, Edelsteine und Attribute nebeneinander legen",
    "Buff-Food und Potions fuer beide Spieler abstimmen",
    "Scrapbook- und Sammelstatus pruefen",
    "Letzten Scan aktualisieren und Screens hochladen",
    "Server- oder Account-Konflikte frueh klaeren",
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
      <h3>Matchup-Diff</h3>
      <p>
        Hier erscheint spaeter die Auswertung aus <code>lib/players/matchups/</code>. Aktuell nur eine
        Info-Box, damit der Slot sichtbar bleibt.
      </p>
      <p className={styles.infoNote}>
        Sammle jetzt schon Vergleichsmetriken (DPS, PvP, Arena), damit die spaetere Automatik sie
        direkt uebernehmen kann.
      </p>
      <button type="button" className={styles.secondaryAction} disabled>
        Modul folgt
      </button>
    </section>
  );
}

function usePlayerSearchResults(term: string, server: string, excludeId?: string | null) {
  const [results, setResults] = React.useState<PlayerSummary[]>([]);
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
        const next: PlayerSummary[] = [];
        const consider = (docSnap: any) => {
          const data = docSnap.data() as any;
          const ref = docSnap.ref;
          const parentDoc = ref.parent?.parent;
          const rootCol = parentDoc?.parent;
          const root = rootCol?.id;
          if (root !== "players") return;
          const id = parentDoc?.id ?? data.playerIdentifier ?? docSnap.id;
          if (!id || seen.has(id)) return;
          if (excludeId && id === excludeId) return;

          const name = data.name ?? data.values?.Name ?? "Unbekannter Spieler";
          const serverVal = data.server ?? data.values?.Server ?? "Unknown";
          if (server !== "all" && serverVal !== server) return;

          const className = data.className ?? data.values?.Class ?? data.values?.["Class"] ?? "Unbekannte Klasse";
          const guildName = data.guildName ?? data.values?.Guild ?? "";
          const level =
            toPlayerNumber(data.level) ||
            toPlayerNumber(data.values?.Level) ||
            toPlayerNumber(data.values?.["Level"]);
          const scrapbookPct =
            toPlayerNumber(data.scrapbookPct) ||
            toPlayerNumber(data.values?.["Album %"]) ||
            toPlayerNumber(data.values?.AlbumPct) ||
            toPlayerNumber(data.values?.["Scrapbook %"]);
          const updated =
            data.updatedAt ??
            data.values?.UpdatedAt ??
            (data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString());
          const nextUpdate = data.nextUpdateAt ?? hoursFromNowISO(12);
          const stats = buildPlayerStatSlices(data.values ?? data.stats);

          seen.add(id);
          next.push({
            id,
            name,
            tagline: data.tagline ?? (guildName ? `Mitglied in ${guildName}` : className),
            server: serverVal,
            className,
            guildName,
            level: level || 0,
            scrapbookPct,
            lastScanAt: updated,
            updatedAt: updated,
            nextUpdateAt: nextUpdate,
            freshness: (data.freshness as FreshnessCode) ?? "unknown",
            stats,
          });
        };

        snapPrefix.forEach(consider);
        snapNgram.forEach(consider);

        if (!cancelled) {
          next.sort((a, b) => a.name.localeCompare(b.name));
          setResults(next);
        }
      } catch (error) {
        console.error("[Players Compare] player search failed", error);
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

const STAT_LABELS: Record<string, string> = {
  Strength: "Staerke",
  Dexterity: "Geschick",
  Intelligence: "Intelligenz",
  Constitution: "Konstitution",
};

function buildPlayerStatSlices(values: Record<string, any> = {}): PlayerStatSlice[] {
  const entries = Object.keys(STAT_LABELS)
    .map((key) => {
      const raw = values?.[key] ?? values?.[key.toLowerCase()];
      return { label: STAT_LABELS[key], value: toPlayerNumber(raw) };
    })
    .filter((entry) => entry.value > 0);

  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) return [];

  return entries.map((entry) => ({
    label: entry.label,
    percent: Math.max(1, Math.round((entry.value / total) * 100)),
  }));
}

function toPlayerNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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
