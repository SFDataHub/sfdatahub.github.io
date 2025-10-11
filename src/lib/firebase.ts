// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!cfg.projectId) {
  console.error("[FB] Missing env (projectId). Add .env.local and restart dev server.");
}

const app = getApps().length ? getApp() : initializeApp(cfg);
export const db = getFirestore(app);

// Debug (einmalig ok)
console.log("[FB] projectId =", cfg.projectId);
