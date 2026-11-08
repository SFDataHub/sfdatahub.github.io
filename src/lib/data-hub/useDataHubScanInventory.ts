import { useRuntimeAuditCommit } from "./useRuntimeAuditCommit";
import { useEffect, useState } from "react";
import { DataHubScanInventoryController, emptyScanInventory } from "./dataHubScanInventory";

export function useDataHubScanInventory() {
  const [state, setState] = useState(emptyScanInventory);
  const [controller, setController] = useState<DataHubScanInventoryController>();
  useEffect(() => {
    const inventory = new DataHubScanInventoryController();
    setController(inventory);
    const unsubscribe = inventory.subscribe(setState);
    inventory.start();
    const resume = (event: Event) => { if (document.visibilityState !== "hidden") void inventory.refreshArchive(event.type); };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    return () => { window.removeEventListener("online", resume); window.removeEventListener("focus", resume); unsubscribe(); inventory.dispose(); };
  }, []);
  useRuntimeAuditCommit(state, !state.personal.loading && state.personal.value !== null, "hub-inventory");
  return { ...state, retry: controller?.retry };
}
