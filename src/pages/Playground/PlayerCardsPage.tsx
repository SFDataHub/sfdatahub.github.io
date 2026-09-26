import React from "react";
import PlayerCard from "../../components/player-card/PlayerCard";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import {
  listGuildHubScanSummaries,
  type GuildHubScanSummary,
} from "../../lib/guilds/localScanLibrary";
import {
  LocalPlayerIndexWorkerCancelledError,
  startLocalPlayerIndexWorkerRun,
  type LocalPlayerIndexWorkerRun,
} from "../../lib/player-search/localPlayerIndexClient";
import type { LocalPlayerIndexPlayer } from "../../lib/player-search/localPlayerIndex";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import styles from "./PlayerCardsPage.module.css";

type ScanPoolPlayer = LocalPlayerIndexPlayer;

const INITIAL_PLAYER_NAME = "Darth Monk";
const INITIAL_PLAYER_SERVER = "F28";
const PLAYER_CARDS_SERVER = normalizeServer(INITIAL_PLAYER_SERVER);

export default function PlayerCardsPage() {
  const [query, setQuery] = React.useState(`${INITIAL_PLAYER_NAME} ${INITIAL_PLAYER_SERVER}`);
  const [players, setPlayers] = React.useState<ScanPoolPlayer[]>([]);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let workerRun: LocalPlayerIndexWorkerRun | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const summaries = await listGuildHubScanSummaries();
        if (cancelled) return;
        const f28Summaries = summaries.filter((summary) => summaryContainsServer(summary, PLAYER_CARDS_SERVER));
        workerRun = startLocalPlayerIndexWorkerRun({
          summaries: f28Summaries,
          serverFilter: PLAYER_CARDS_SERVER,
        });
        const { index } = await workerRun.promise;
        if (cancelled) return;
        setPlayers(index.players);
        setSelectedKey(findInitialPlayer(index.players)?.key ?? null);
      } catch (loadError) {
        if (loadError instanceof LocalPlayerIndexWorkerCancelledError || cancelled) return;
        console.error("[PlayerCardsPage] failed to load local scan pool", loadError);
        if (!cancelled) {
          setPlayers([]);
          setSelectedKey(null);
          setError("Lokaler Scanpool konnte nicht geladen werden.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      workerRun?.cancel();
    };
  }, []);

  const filteredPlayers = React.useMemo(() => filterPlayers(players, query).slice(0, 24), [players, query]);
  const selectedPlayer = React.useMemo(
    () => players.find((player) => player.key === selectedKey) ?? null,
    [players, selectedKey],
  );
  const initialPlayerMissing = !loading && !error && players.length > 0 && !findInitialPlayer(players);

  return (
    <div className={styles.page}>
      <section className={styles.headerPanel}>
        <div>
          <p className={styles.kicker}>Playground</p>
          <h1>Player Cards</h1>
          <p>Lokale Scanpool-Daten, eine globale Card-Komponente, keine Demo-Spieler.</p>
        </div>
        {!loading ? <span>{`${players.length.toLocaleString("de-DE")} Spieler`}</span> : null}
      </section>

      {loading ? (
        <section className={styles.loadingPanel}>
          <DataHubLoadingState title="Scanpool wird geladen" message="Lokale Spieler werden vorbereitet." />
        </section>
      ) : (
        <>
          <section className={styles.searchPanel}>
            <label className={styles.searchField}>
              <span>Spielersuche</span>
              <input
                value={query}
                placeholder="Name, Server oder Gilde"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            {error ? (
              <div className={styles.stateBox}>{error}</div>
            ) : players.length === 0 ? (
              <div className={styles.stateBox}>Keine lokalen Scanpool-Spieler gefunden.</div>
            ) : initialPlayerMissing ? (
              <div className={styles.stateBox}>Darth Monk auf F28 wurde im lokalen Scanpool nicht gefunden.</div>
            ) : null}

            {!error ? (
              <div className={styles.resultsList} role="listbox" aria-label="Lokale Spielergebnisse">
                {filteredPlayers.length ? (
                  filteredPlayers.map((player) => (
                    <button
                      key={player.key}
                      type="button"
                      className={`${styles.resultRow} ${player.key === selectedKey ? styles.resultRowActive : ""}`}
                      onClick={() => setSelectedKey(player.key)}
                    >
                      <strong>{player.name}</strong>
                      <span>{player.server ?? "Server -"}</span>
                      <span>{player.guildName ?? "Gilde -"}</span>
                    </button>
                  ))
                ) : (
                  <div className={styles.stateBox}>Keine Treffer fuer diese Suche.</div>
                )}
              </div>
            ) : null}
          </section>

          <section className={styles.previewPanel}>
            {selectedPlayer ? (
              <>
                <PlayerCard player={selectedPlayer.card} />
                <div className={styles.selectionMeta}>
                  <span>{selectedPlayer.sourceFilename}</span>
                  <span>{formatDateTime(selectedPlayer.scannedAtMs)}</span>
                  <span>{selectedPlayer.identityKind}</span>
                </div>
              </>
            ) : (
              <div className={styles.emptyCard}>Waehle einen lokalen Spieler aus der Suche aus.</div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function summaryContainsServer(summary: GuildHubScanSummary, serverFilter: string | null) {
  if (!serverFilter) return true;
  return getSummaryServerCandidates(summary).some(
    (server) => normalizeServer(server)?.toLowerCase() === serverFilter.toLowerCase(),
  );
}

function getSummaryServerCandidates(summary: GuildHubScanSummary) {
  return [
    ...summary.servers,
    ...summary.guilds.map((guild) => guild.server),
    ...(summary.fusionInventorySlices ?? []).map((slice) => slice.server),
  ].filter((server): server is string => Boolean(server));
}

function findInitialPlayer(players: ScanPoolPlayer[]) {
  const targetName = normalizeSearch(INITIAL_PLAYER_NAME);
  const targetServer = normalizeServer(INITIAL_PLAYER_SERVER);
  return players.find((player) => normalizeSearch(player.name) === targetName && normalizeServer(player.server) === targetServer) ?? null;
}

function filterPlayers(players: ScanPoolPlayer[], query: string) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return players;
  return players.filter((player) => {
    const haystack = normalizeSearch(player.queryText);
    return terms.every((term) => haystack.includes(term));
  });
}

function normalizeServer(value: unknown) {
  return normalizeServerKeyFromInput(value);
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function formatDateTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Scanzeit unbekannt";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
