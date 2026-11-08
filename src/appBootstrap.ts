import { prepareAnalyticsWorkerAssets } from "./lib/local-player-profile/workerAssets";

// HTML is network-first. Update its existing controller before importing the
// stable dev module graph, which may still exist in an older runtime cache.
void prepareAnalyticsWorkerAssets().catch(error => {
    console.error("[Analytics] asset update failed", error);
    // Current and other app features remain available; the worker's own bounded
    // preparation reports a terminal error if its assets are still unavailable.
}).then(() => import("./main"));
