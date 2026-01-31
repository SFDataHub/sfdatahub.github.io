import { onRequest } from "firebase-functions/v2/https";

import app from "./app";
import { FUNCTION_SECRET_PARAMS } from "./config";
import { publishPlayerLatestToplists } from "./triggers/playerToplists";
import { publishGuildLatestToplists } from "./triggers/guildToplists";

export const authApi = onRequest(
  {
    region: "europe-west1",
    secrets: FUNCTION_SECRET_PARAMS,
  },
  app,
);

export { publishPlayerLatestToplists, publishGuildLatestToplists };
