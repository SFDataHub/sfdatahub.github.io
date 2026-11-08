import { useSyncExternalStore } from "react";
import { hubSearchRecents } from "./hubSearchRecents";

const empty = { entries: [], error: false };
const inactive = () => empty;
const unsubscribe = () => () => {};
export function useHubSearchRecents(enabled = true) {
  const snapshot = useSyncExternalStore(enabled ? hubSearchRecents.subscribe : unsubscribe,
    enabled ? hubSearchRecents.getSnapshot : inactive, enabled ? hubSearchRecents.getSnapshot : inactive);
  return { ...snapshot, add: hubSearchRecents.add.bind(hubSearchRecents), remove: hubSearchRecents.remove.bind(hubSearchRecents) };
}
