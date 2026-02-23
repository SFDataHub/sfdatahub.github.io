import { AUTH_BASE_URL } from "./config";
import type { AuthFavoriteKind, AuthFavoritePatchResponse } from "./types";

const FIREBASE_TOKEN_ENDPOINT = AUTH_BASE_URL
  ? `${AUTH_BASE_URL}/auth/firebase-token`
  : "/auth/firebase-token";
const FAVORITES_ENDPOINT = AUTH_BASE_URL
  ? `${AUTH_BASE_URL}/auth/me/favorites`
  : "/auth/me/favorites";

export class AuthApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, options: { status: number; code?: string }) {
    super(message);
    this.name = "AuthApiRequestError";
    this.status = options.status;
    this.code = options.code;
  }
}

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

export async function patchFavorite(args: {
  kind: AuthFavoriteKind;
  op: "add" | "remove";
  identifier: string;
}): Promise<AuthFavoritePatchResponse> {
  const res = await fetch(FAVORITES_ENDPOINT, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AuthApiRequestError(
      typeof data?.error === "string" ? data.error : `Failed to update favorite (${res.status})`,
      {
        status: res.status,
        code: typeof data?.code === "string" ? data.code : undefined,
      },
    );
  }

  return data as AuthFavoritePatchResponse;
}
