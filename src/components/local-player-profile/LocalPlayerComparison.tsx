import { isLocalProfileEvidenceCurrent } from "../../lib/local-player-profile/historyBasis";
import { acquireProfileArchiveHistory } from "../../lib/scanArchive/profileHistoryAcquisition";
import { subscribeToScanArchiveMetadata } from "../../lib/scanArchive/client";
import { profileDate, profileElapsed } from "../../lib/i18n/profilePresentation";
import { useProfileAttributeSumMode } from "../../lib/settings/usePreferences";
import type { PlayerContentView, PlayerChartArea } from "../../lib/local-player-profile/viewCharts";
import React from "react";
import type { HubPlayerSelection } from "../../pages/DataHub/HubSearch";
import { useComparisonPlayerCharts } from "../../lib/local-player-profile/useComparisonPlayerCharts";
import { appendComparisonPlayer, comparisonPlayerIdentity, type ComparisonPlayer } from "../../lib/local-player-profile/comparisonPlayers";
import { favoriteReference, referenceKey } from "../../lib/data-hub/hubFavoritesContract";
import { loadIdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { captureLocalDataDependencies, revalidateLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import type { PlayerChartRange } from "../../lib/local-player-profile/viewCharts";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useLocalProfilePart } from "../../lib/local-player-profile/useLocalProfilePart";
import type { LocalPlayerProfileModel } from "./types";
import { useLocation } from "react-router-dom";
import { useActualProfileLocation } from "../../lib/data-hub/profileNavigation";
import { localEntityPath } from "../../lib/data-hub/routes";
import { playerFavoriteAnchor } from "../../lib/data-hub/hubFavoritesContract";
import { useLocalFavoritePlayerAction } from "../data-hub/LocalFavoritesMenu";

const ComparisonContext = React.createContext<{
  part: ReturnType<typeof useLocalProfilePart<PlayerChartArea>>;
  view: PlayerContentView;
  select: (timestamp: number | null) => void;
  players: ComparisonPlayer[];
  addPlayer: (selection: HubPlayerSelection, allowed?: () => boolean) => Promise<boolean>;
  removePlayer: (id: string) => void;
  playerTargets: Record<string, Pick<ReturnType<typeof useComparisonPlayerCharts>, "profile" | "targetStatus"> | undefined>;
  playerParts: Record<string, ReturnType<typeof useComparisonPlayerCharts>>;
  selectionError: boolean;
} | null>(null);

// Mounted only by the full page, keyed to its observation. Both controls and
// the charts share one subscription; the overlay never requests analytics here.
export function LocalPlayerComparisonProvider({ profile, children, view }: { profile: LocalPlayerProfileModel; children: React.ReactNode; view: PlayerContentView }) {
  const { t } = useTranslation();
  const location = useLocation(), actual = useActualProfileLocation();
  const active = React.useRef(false);
  active.current = actual.key === location.key && !actual.state?.localProfileParent;
  const [selected, select] = React.useState<number | null>(null);
  const sumMode = useProfileAttributeSumMode();
  const chartPart = useLocalProfilePart(profile, `charts:${view}:${sumMode}`, selected);
  const chartReadiness = React.useRef({ part: chartPart, listeners: new Set<() => void>() });
  chartReadiness.current.part = chartPart;
  React.useEffect(() => { chartReadiness.current.listeners.forEach(check => check()); }, [chartPart.status, chartPart.value, chartPart.reason]);
  const demandKey = JSON.stringify([profile.sourceScanId, profile.analytics.scannedAtMs, selected]);
  const [archiveAttempt, retryArchive] = React.useState(0);
  const [archiveState, setArchiveState] = React.useState<{ key: string; loading: boolean; error?: string }>({ key: demandKey, loading: true });
  const archivePending = archiveState.key !== demandKey || archiveState.loading;
  const historyError = archiveState.key === demandKey ? archiveState.error : undefined;
  const part = { ...(historyError ? { ...chartPart, status: "error" as const, reason: historyError }
    : archivePending && !chartPart.value?.comparison.options.length ? { ...chartPart, status: "loading" as const } : chartPart),
    retry: () => { chartPart.retry(); retryArchive(attempt => attempt + 1); } };
  const [players, setPlayers] = React.useState<ComparisonPlayer[]>([]);
  const playersRef = React.useRef(players);
  const [selectionError, setSelectionError] = React.useState(false);
  const mounted = React.useRef(false), generation = React.useRef(0), removalSequence = React.useRef(0);
  const removed = React.useRef(new Map<string, number>());
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  const owner = favoriteReference("player", profile.analytics.memberRef ?? profile.currentSeed?.rawIdentifier ?? profile.sourcePlayerKey);
  React.useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    let stopped = false, running = false, pending = false;
    const load = async () => {
      pending = true;
      if (running) return;
      running = true;
      try {
        while (pending && !stopped) {
          pending = false;
          setArchiveState({ key: demandKey, loading: true });
          await acquireProfileArchiveHistory(owner, profile.analytics.scannedAtMs, {
            signal: controller.signal, selectedAt: selected, from: selected ?? undefined, consumer: "player-comparison-charts",
            comparisonReady: () => new Promise<boolean>((resolve, reject) => {
              let settled = false;
              const cleanup = () => { chartReadiness.current.listeners.delete(check); controller.signal.removeEventListener("abort", cancel); };
              const cancel = () => { if (!settled) { settled = true; cleanup(); reject(new DOMException("aborted", "AbortError")); } };
              const check = () => {
                const part = chartReadiness.current.part;
                if (settled || part.status === "loading" || part.status === "cancelled" || part.status === "not-requested") return;
                void (async () => {
                  // Wait for the existing visible chart consumer's successor.
                  // A superseded/invalid receipt cannot request another source.
                  if (part.evidence && !await isLocalProfileEvidenceCurrent(part.evidence)) return;
                  if (settled || chartReadiness.current.part.value !== part.value || chartReadiness.current.part.status !== part.status) return;
                  settled = true; cleanup();
                  if (part.status === "error") { reject(Error(part.reason ?? "Comparison preparation failed")); return; }
                  const timestamp = part.value?.comparison.selectedTimestamp;
                  resolve(timestamp != null && (selected != null ? timestamp === selected : profile.analytics.scannedAtMs - timestamp >= 28 * 86_400_000));
                })().catch(error => { if (!settled) { settled = true; cleanup(); reject(error); } });
              };
              chartReadiness.current.listeners.add(check);
              controller.signal.addEventListener("abort", cancel, { once: true });
              if (controller.signal.aborted) cancel(); else check();
            }),
          });
          if (!stopped) setArchiveState({ key: demandKey, loading: false });
        }
      } catch (error) { if (!stopped) { console.error("Profile archive history acquisition failed", error); setArchiveState({ key: demandKey, loading: false, error: String(error) }); } }
      finally { running = false; }
    };
    const stop = subscribeToScanArchiveMetadata(() => { void load(); });
    void load();
    return () => { stopped = true; controller.abort(); stop(); };
  }, [owner?.identifier, profile.analytics.scannedAtMs, selected, archiveAttempt]);
  const addPlayer = React.useCallback(async (selection: HubPlayerSelection, allowed: () => boolean = () => true) => {
    const ownGeneration = generation.current, started = removalSequence.current;
    const id = referenceKey(selection.reference);
    if (!active.current || !allowed() || playersRef.current.length >= 3 || playersRef.current.some(player => player.id === id) || owner && referenceKey(owner) === id) return false;
    try {
      const receipt = await captureLocalDataDependencies({ allIdentities: true });
      const identity = await loadIdentityResolutionSnapshot();
      if (!(await revalidateLocalDataDependencies(receipt)).current || !mounted.current || generation.current !== ownGeneration || !active.current || !allowed()) return false;
      const key = comparisonPlayerIdentity(identity, selection.reference);
      if (key && (removed.current.get(key) ?? 0) > started) return false;
      const next = appendComparisonPlayer(playersRef.current, selection, owner, identity);
      const added = next !== playersRef.current;
      if (added) { playersRef.current = next; setPlayers(next); }
      setSelectionError(false);
      return added;
    } catch { if (mounted.current && generation.current === ownGeneration) setSelectionError(true); return false; }
  }, [owner?.identifier]);
  const favoriteAction = React.useMemo(() => active.current ? {
    label: t("hubFavorites.context.compare"), available: players.length < 3,
    run: async (favorite: import("../../lib/data-hub/hubFavoritesContract").HubFavorite, allowed: () => boolean) => {
      if (favorite.kind !== "player" || !favorite.reference || favorite.referenceIssue || !active.current || !allowed()) return false;
      const anchor = playerFavoriteAnchor(favorite);
      if (favorite.historicalAt && !anchor) return false;
      const current = () => mounted.current && active.current && allowed();
      const path = localEntityPath("player", favorite.reference, anchor);
      const selection: HubPlayerSelection = { reference: favorite.reference, favorite,
        target: { path, state: { returnTo: location.pathname + location.search } } };
      return addPlayer(selection, current);
    },
  } : undefined, [actual.key, location.key, location.pathname, location.search, players.length, addPlayer, t]);
  useLocalFavoritePlayerAction(favoriteAction);
  const [results, setResults] = React.useState<Record<string, { binding: string; part: ReturnType<typeof useComparisonPlayerCharts> }>>({});
  const removePlayer = React.useCallback((id: string) => {
    const player = playersRef.current.find(row => row.id === id);
    if (!player) return;
    removed.current.set(player.identityKey, ++removalSequence.current);
    playersRef.current = playersRef.current.filter(row => row.id !== id);
    setPlayers(playersRef.current);
    setResults(previous => { const next = { ...previous }; delete next[id]; return next; });
  }, []);
  const publish = React.useCallback((id: string, binding: string, playerPart: ReturnType<typeof useComparisonPlayerCharts>) => {
    if (mounted.current && playersRef.current.some(player => player.id === id)) setResults(previous => ({ ...previous, [id]: { binding, part: playerPart } }));
  }, []);
  const range = part.value?.comparison.chartTimeDomain ?? null;
  const binding = JSON.stringify([view, sumMode, range]);
  const playerParts = Object.fromEntries(players.flatMap(player => results[player.id]?.binding === binding ? [[player.id, results[player.id].part]] : []));
  // Target resolution is independent of the selected lower chart range/view.
  const playerTargets = Object.fromEntries(players.map(player => [player.id, results[player.id]?.part]));
  return <ComparisonContext.Provider value={{ playerTargets, part, select, view, players, addPlayer, removePlayer, playerParts, selectionError }}>
    {children}
    {players.map(player => <ComparisonPlayerCharts key={player.id} player={player} range={range} view={view} mode={sumMode} binding={binding} publish={publish} />)}
  </ComparisonContext.Provider>;
}

// Keyed owners keep each selected player's existing W221 lease independent.
function ComparisonPlayerCharts({ player, range, view, mode, binding, publish }: {
  player: ComparisonPlayer; range: PlayerChartRange | null; view: PlayerContentView;
  mode: Parameters<typeof useComparisonPlayerCharts>[3]; binding: string;
  publish: (id: string, binding: string, part: ReturnType<typeof useComparisonPlayerCharts>) => void;
}) {
  const playerPart = useComparisonPlayerCharts(player.selection, range, view, mode);
  React.useEffect(() => { publish(player.id, binding, playerPart); },
    [player.id, binding, playerPart.status, playerPart.value, playerPart.profile, playerPart.targetStatus, playerPart.reason, playerPart.retry, publish]);
  return null;
}

export function useOptionalLocalPlayerComparison() { return React.useContext(ComparisonContext); }

export function useLocalPlayerComparison() {
  const value = React.useContext(ComparisonContext);
  if (!value) throw new Error("Local player comparison requires the full profile page");
  return value;
}

export function LocalPlayerComparisonSelect() {
  const { t } = useTranslation();
  const { part, select } = useLocalPlayerComparison();
  const comparison = part.value?.comparison;
  const options = comparison?.options ?? [];
  const unavailable = part.status === "loading" || part.status === "not-requested"
    ? t("localProfileRoute.loading") : part.status === "error" ? t("playerProfile.localData.error") : t("localProfileRoute.comparisonUnavailable");
  return <label className="local-player-analytics__range-select local-profile-comparison-select">
    <span>{t("localProfileRoute.comparisonScan")}</span>
    <select value={comparison?.selectedTimestamp == null ? "" : String(comparison.selectedTimestamp)}
      disabled={!options.length} onChange={event => {
        const next = Number(event.target.value);
        select(Number.isFinite(next) ? next : null);
      }}>
      {options.length ? options.map(option => <option key={`${option.sourceScanId}-${option.snapshotId}-${option.timestamp}`} value={option.timestamp}>
        {profileDate(option.timestamp)} · {profileElapsed((comparison?.currentTimestamp ?? option.timestamp) - option.timestamp)}
      </option>) : <option value="">{unavailable}</option>}
    </select>
    <small>{t("localProfileRoute.comparisonEnd", { date: profileDate(comparison?.currentTimestamp) })}</small>
  </label>;
}
