import { onRequest } from "firebase-functions/v2/https";

import app from "./app";
import { FUNCTION_SECRET_PARAMS } from "./config";

export const authApi = onRequest(
  {
    region: "europe-west1",
    secrets: FUNCTION_SECRET_PARAMS,
  },
  app,
);
