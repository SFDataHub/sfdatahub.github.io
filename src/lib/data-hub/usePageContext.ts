import { useCallback, useSyncExternalStore } from "react";
import { pageContextStore, type FeatureKey } from "./pageContextStore";

export function usePageContext(feature: FeatureKey) {
  const subscribe = useCallback((listener: () => void) => pageContextStore.subscribe(feature, listener), [feature]);
  const get = useCallback(() => pageContextStore.get(feature), [feature]);
  return useSyncExternalStore(subscribe, get, get);
}
