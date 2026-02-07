import { onDocumentWritten } from "firebase-functions/v2/firestore";

export const publishPlayerLatestToplists = onDocumentWritten(
  {
    region: "europe-west1",
    document: "stats_cache_player_derived/{docId}",
  },
  async (event) => {
    const runtime = await import("./playerToplistsRuntime");
    return runtime.handlePublishPlayerLatestToplists(event);
  },
);
