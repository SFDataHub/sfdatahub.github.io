import { onDocumentWritten } from "firebase-functions/v2/firestore";

export const publishGuildLatestToplists = onDocumentWritten(
  {
    region: "europe-west1",
    document: "stats_cache_guild_derived/{docId}",
  },
  async (event) => {
    const runtime = await import("./guildToplistsRuntime");
    return runtime.handlePublishGuildLatestToplists(event);
  },
);
