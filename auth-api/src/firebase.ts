import admin from "firebase-admin";

import { IS_FUNCTIONS_RUNTIME, PROJECT_ID } from "./config";

if (!admin.apps.length) {
  const options: admin.AppOptions = {
    projectId: PROJECT_ID,
  };

  // When running locally we still rely on ADC, but in Functions the default service account is used automatically.
  if (!IS_FUNCTIONS_RUNTIME) {
    options.credential = admin.credential.applicationDefault();
  }

  admin.initializeApp(options);
}

export const db = admin.firestore();

export { admin };
