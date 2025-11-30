import { AUTH_BASE_URL } from "./config";

const FIREBASE_TOKEN_ENDPOINT = AUTH_BASE_URL
  ? `${AUTH_BASE_URL}/auth/firebase-token`
  : "/auth/firebase-token";

export async function fetchFirebaseToken(): Promise<string> {
  const res = await fetch(FIREBASE_TOKEN_ENDPOINT, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch firebase token: ${res.status}`);
  }

  const data = await res.json();
  const token = data?.firebaseToken ?? data?.tokens?.firebase;
  if (!token) {
    throw new Error("Firebase token missing in response");
  }
  return token;
}
