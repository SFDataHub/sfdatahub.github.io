import { useSyncExternalStore } from "react";
import { preferencesStore } from "./preferences";

export function usePreferencesSnapshot() {
  return useSyncExternalStore(preferencesStore.subscribe, preferencesStore.getSnapshot, preferencesStore.getSnapshot);
}

/** Subscribe only to the saved profile sum mode, never the settings draft. */
export function useProfileAttributeSumMode() {
  return useSyncExternalStore(preferencesStore.subscribe,
    () => preferencesStore.getSnapshot().attributeSumMode,
    () => preferencesStore.getSnapshot().attributeSumMode);
}

/** Shell rerenders only when the persisted navigation mode changes. */
export function useNavigationMode() {
  return useSyncExternalStore(preferencesStore.subscribe,
    () => preferencesStore.getSnapshot().navigationMode,
    () => preferencesStore.getSnapshot().navigationMode);
}

/** Read the persisted category before any radar preparation is requested. */
export function usePlayerRadarMode() {
  return useSyncExternalStore(preferencesStore.subscribe,
    () => preferencesStore.getSnapshot().playerRadarMode,
    () => preferencesStore.getSnapshot().playerRadarMode);
}
