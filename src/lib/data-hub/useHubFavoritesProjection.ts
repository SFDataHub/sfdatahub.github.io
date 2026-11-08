import { useRuntimeAuditCommit } from "./useRuntimeAuditCommit";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { revalidateLocalDataDependencies } from "../local-data/localDataDependencies";
import type { FavoriteProjection } from "./hubFavoritesProjection";
import { pendingFavoriteProjection } from "./hubFavoritesProjectionState";
import { auditEnabled, auditId, auditDependencyId } from "./runtimeAudit";
import { hubFavoritesRecordAudit, hubFavoritesStore } from "./hubFavoritesStore";
import type { HubFavoritesRecord } from "./hubFavoritesContract";

export function useHubFavoritesProjection(record: HubFavoritesRecord | undefined, consumer = "favorites-unspecified") {
  const instance = useRef<string>();
  const currentRecord = useRef(record);
  const mounted = useRef(false);
  currentRecord.current = record;
  const owner = hubFavoritesStore.projection;
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);
  useLayoutEffect(() => {
    mounted.current = true;
    if (!record) return () => { mounted.current = false; };
    instance.current ??= auditEnabled() ? auditId("favorites-consumer") : undefined;
    void owner.ensure(record, auditEnabled() ? { consumer, consumerId: instance.current,
      recordRevision: record.recordRevision, recordDependencyId: auditDependencyId(record),
      ...hubFavoritesRecordAudit(record), trigger: "favorites-consumer-mount-or-record-change" } : undefined);
    return () => { mounted.current = false; };
  }, [record, owner]);
  const matching = state.record === record;
  const readyFor = (row: FavoriteProjection) => matching && state.readyIds.has(row.favorite.id) && state.rows.includes(row) && !state.error;
  const ready = matching && !state.error && state.loadingIds.size === 0 && state.rows.every(readyFor);
  useRuntimeAuditCommit(state.rows, ready, "favorites-projection", state.acceptedRunId);
  const actionFavorite = async (row: FavoriteProjection) => {
    const accepted = owner.getSnapshot();
    if (!mounted.current || !readyFor(row) || accepted !== state || accepted.record !== currentRecord.current || !row.dependencies ||
      row.identity === "conflict" || row.favorite.referenceIssue || !row.favorite.reference || row.observation?.state === "ambiguous") return null;
    try { if (!(await revalidateLocalDataDependencies(row.dependencies)).current || !mounted.current || owner.getSnapshot() !== accepted || currentRecord.current !== accepted.record) return null; }
    catch { return null; }
    return row.observation?.effective ?? row.favorite;
  };
  // A new record can render before its effect. Preserve accepted display by ID,
  // while readyFor rejects every target until that basis is attached.
  const rows = matching ? state.rows : record?.favorites.map(favorite => {
    const previous = state.rows.find(row => row.favorite.id === favorite.id);
    return previous ? { ...previous, favorite } : pendingFavoriteProjection(favorite);
  }) ?? [];
  return { actionFavorite, ready, readyFor, rows, retry: owner.retry,
    loadingFor: (row: FavoriteProjection) => matching && state.loadingIds.has(row.favorite.id),
    error: matching ? state.error : null };
}
