import { hubFavoritesSync } from "./hubFavoritesSync";
import { auditEnabled, auditResultId, auditResultTrigger } from "./runtimeAudit";
import { useSyncExternalStore } from "react";
import { hubFavoritesStore } from "./hubFavoritesStore";

export function useHubFavorites() {
  const state = useSyncExternalStore(hubFavoritesStore.subscribe, hubFavoritesStore.getSnapshot, hubFavoritesStore.getSnapshot);
  const sync = useSyncExternalStore(hubFavoritesSync.subscribe, hubFavoritesSync.getSnapshot, hubFavoritesSync.getSnapshot);
  const retry = async () => {
    const scope = hubFavoritesStore.scope;
    if (state.error && !await hubFavoritesStore.retry()) return false;
    if (scope !== hubFavoritesStore.scope || sync.accountId !== hubFavoritesSync.getSnapshot().accountId) return false;
    if (sync.error) await hubFavoritesSync.retry();
    return scope === hubFavoritesStore.scope && hubFavoritesStore.getSnapshot().status === "ready" && !hubFavoritesSync.getSnapshot().error;
  };
  return { ...state, error: state.error ?? sync.error, auditContext: auditEnabled() ? { notificationTrigger: auditResultTrigger(state) ?? "unbekannt", notificationStoreRunId: auditResultId(state), favoritesRecordRevision: state.snapshot?.record.recordRevision, favoritesCompatibilityRevision: state.snapshot?.compatibility.recordRevision } : undefined, mutate: hubFavoritesStore.mutate, retry, disabled: state.status !== "ready" };
}
