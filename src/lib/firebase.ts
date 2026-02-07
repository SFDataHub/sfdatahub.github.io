// src/lib/firebase.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
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

const maybeRedirectToAuthDomain = () => {
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return;
  const host = window.location.hostname?.toLowerCase();
  const authHost = String(cfg.authDomain ?? "").toLowerCase();
  if (!host || !authHost) return;
  if (host === authHost) return;

  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  if (isLocalhost) return;

  const altHost = authHost.endsWith(".firebaseapp.com")
    ? authHost.replace(".firebaseapp.com", ".web.app")
    : authHost.endsWith(".web.app")
    ? authHost.replace(".web.app", ".firebaseapp.com")
    : "";

  if (altHost && host === altHost) {
    const nextUrl = window.location.href.replace(host, authHost);
    window.location.replace(nextUrl);
  }
};

maybeRedirectToAuthDomain();

const app = getApps().length ? getApp() : initializeApp(cfg);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Hinweis: keine sensiblen Werte loggen
