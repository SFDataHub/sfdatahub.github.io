import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AUTH_BASE_URL } from "../lib/auth/config";
import type { AuthFavoriteKind, AuthProvider as ProviderName, AuthStatus, AuthUser } from "../lib/auth/types";
import { fetchFirebaseToken, patchFavorite } from "../lib/auth/client";
import { auth } from "../lib/firebase";
import { GoogleAuthProvider, onAuthStateChanged, signInWithCustomToken, signInWithPopup, signOut } from "firebase/auth";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  isLoading: boolean;
  isFavoritePlayer: (identifier: string | null | undefined) => boolean;
  isFavoriteGuild: (identifier: string | null | undefined) => boolean;
  toggleFavoritePlayer: (identifier: string) => Promise<{ isFavorite: boolean }>;
  toggleFavoriteGuild: (identifier: string) => Promise<{ isFavorite: boolean }>;
  loginWithDiscord: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: (options?: RefreshOptions) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_ENDPOINT = AUTH_BASE_URL ? `${AUTH_BASE_URL}/auth/session` : "";
const LOGOUT_ENDPOINT = AUTH_BASE_URL ? `${AUTH_BASE_URL}/auth/logout` : "";
const AUTH_USER_CACHE_KEY = "sfh:auth:user";
const AUTH_USER_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type RefreshOptions = {
  silent?: boolean;
};

const AUTH_POPUP_NONCE_KEY = "sfh:authPopupNonce";
const DISCORD_LOGIN_GUARD_MS = 2000;
const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
]);

const isAuthDebugEnabled = () => {
  const fallback = import.meta.env.DEV;
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage?.getItem("sfh:debug:auth");
    if (raw === "1" || raw === "true") return true;
  } catch (error) {
    console.warn("[Auth] Failed to read auth debug flag", error);
  }
  return fallback;
};

const logAuthDebug = (...args: any[]) => {
  if (!isAuthDebugEnabled()) return;
  console.info(...args);
};

const createNonce = () => {
  try {
    const bytes = new Uint8Array(16);
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // ignore and fallback
  }
  return Math.random().toString(36).slice(2, 14);
};

const buildAuthLoginUrl = (provider: ProviderName, options?: { mode?: "popup"; nonce?: string }) => {
  if (!AUTH_BASE_URL) return "";
  try {
    const url = new URL(`${AUTH_BASE_URL}/auth/${provider}/login`);
    if (options?.mode === "popup") {
      url.searchParams.set("mode", "popup");
    }
    if (options?.nonce) {
      url.searchParams.set("nonce", options.nonce);
    }
    return url.toString();
  } catch (error) {
    console.warn("[Auth] Failed to construct login URL", error);
    return "";
  }
};

const getAllowedPopupOrigins = () => {
  const origins = new Set<string>();
  if (typeof window !== "undefined" && window.location?.origin) {
    origins.add(window.location.origin);
  }
  if (AUTH_BASE_URL) {
    try {
      origins.add(new URL(AUTH_BASE_URL).origin);
    } catch (error) {
      console.warn("[Auth] Failed to parse AUTH_BASE_URL for allowed origins", error);
    }
  }
  return origins;
};

const normalizeFavoriteIdentifier = (value: string | null | undefined): string | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
};

const isFavoriteInUser = (
  user: AuthUser | null,
  bucket: "players" | "guilds",
  identifier: string | null | undefined,
): boolean => {
  const normalized = normalizeFavoriteIdentifier(identifier);
  if (!user || !normalized) return false;
  return user.favorites?.[bucket]?.[normalized] === true;
};

const applyFavoriteToUser = (
  user: AuthUser | null,
  bucket: "players" | "guilds",
  identifier: string,
  isFavorite: boolean,
): AuthUser | null => {
  if (!user) return user;

  const favorites = { ...(user.favorites ?? {}) };
  const nextBucket = { ...(favorites[bucket] ?? {}) } as Record<string, true>;

  if (isFavorite) {
    nextBucket[identifier] = true;
  } else {
    delete nextBucket[identifier];
  }

  if (Object.keys(nextBucket).length > 0) {
    favorites[bucket] = nextBucket;
  } else {
    delete favorites[bucket];
  }

  return {
    ...user,
    favorites,
  };
};

type AuthUserCachePayload = {
  cachedAt: number;
  data: AuthUser;
};

const readCachedAuthUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUserCachePayload> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.cachedAt !== "number") return null;
    if (Date.now() - parsed.cachedAt > AUTH_USER_CACHE_TTL_MS) return null;
    const data = parsed.data;
    if (!data || typeof data !== "object") return null;
    if (typeof (data as any).id !== "string" || !(data as any).id.trim()) return null;
    return data as AuthUser;
  } catch (error) {
    console.warn("[Auth] Failed to read cached auth user", error);
    return null;
  }
};

const writeCachedAuthUser = (user: AuthUser | null) => {
  if (typeof window === "undefined") return;
  try {
    if (!user) {
      window.localStorage.removeItem(AUTH_USER_CACHE_KEY);
      return;
    }
    const payload: AuthUserCachePayload = {
      cachedAt: Date.now(),
      data: user,
    };
    window.localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[Auth] Failed to write cached auth user", error);
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => readCachedAuthUser());
  const [status, setStatus] = useState<AuthStatus>("idle");
  const firebaseSyncRef = useRef<{ tried: boolean }>({ tried: false });
  const discordLoginInFlight = useRef(false);
  const discordPopupMessageReceived = useRef(false);
  const googleProvider = useMemo<GoogleAuthProvider | null>(() => {
    try {
      return new GoogleAuthProvider();
    } catch (error) {
      console.warn("[Auth] Failed to initialize Google provider", error);
      return null;
    }
  }, []);

  const handleSessionResponse = useCallback((payload: any) => {
    if (payload?.authenticated && payload.user) {
      const nextUser = payload.user as AuthUser;
      setUser(nextUser);
      writeCachedAuthUser(nextUser);
      setStatus("authenticated");
    } else {
      setUser(null);
      writeCachedAuthUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    writeCachedAuthUser(user);
  }, [user]);

  const fetchSession = useCallback(async (options?: RefreshOptions): Promise<boolean> => {
    if (!options?.silent) {
      setStatus("loading");
    }

    if (!SESSION_ENDPOINT) {
      console.warn("[Auth] AUTH_BASE_URL is not configured. Skipping session fetch.");
      setUser(null);
      setStatus("unauthenticated");
      return false;
    }

    try {
      const response = await fetch(SESSION_ENDPOINT, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch session (${response.status})`);
      }

      const data = await response.json();
      handleSessionResponse(data);
      return !!(data?.authenticated && data.user);
    } catch (error) {
      console.error("[Auth] Failed to refresh session.", error);
      setUser(null);
      setStatus("unauthenticated");
      return false;
    }
  }, [handleSessionResponse]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    console.log("[AuthDebug] session user:", user);
    const firebaseUser = auth.currentUser;
    console.log("[AuthDebug] firebase currentUser uid:", firebaseUser?.uid);
    firebaseUser
      ?.getIdTokenResult()
      .then((res) => {
        console.log("[AuthDebug] firebase claims:", res.claims);
      })
      .catch((error) => {
        console.warn("[AuthDebug] failed to fetch token claims", error);
      });
  }, [user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      console.log("[AuthDebug] firebase currentUser uid:", currentUser?.uid);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      firebaseSyncRef.current.tried = false;
      return;
    }
    if (firebaseSyncRef.current.tried) {
      return;
    }
    firebaseSyncRef.current.tried = true;

    (async () => {
      try {
        const token = await fetchFirebaseToken();
        await signInWithCustomToken(auth, token);
        console.log("[AuthDebug] signed in to Firebase with custom token");
      } catch (err) {
        console.error("[AuthDebug] failed to sign in to Firebase", err);
      }
    })();
  }, [user]);

  const startRedirectLogin = useCallback((provider: ProviderName) => {
    if (!AUTH_BASE_URL) {
      console.warn(`[Auth] Cannot initiate ${provider} login without AUTH_BASE_URL.`);
      return;
    }
    window.location.href = buildAuthLoginUrl(provider);
  }, []);

  type PopupAuthResult = {
    customToken?: string;
  };

  const waitForPopupAuth = useCallback(async (popup: Window, expectedNonce: string): Promise<PopupAuthResult> => {
    const allowedOrigins = getAllowedPopupOrigins();
    return new Promise<PopupAuthResult>((resolve, reject) => {
      let handled = false;
      const timer = window.setTimeout(() => {
        if (handled) return;
        cleanup();
        reject(new Error("auth_popup_timeout"));
      }, 180000);

      const closePoll = window.setInterval(() => {
        if (popup.closed) {
          if (handled || discordPopupMessageReceived.current) {
            cleanup();
            resolve({});
            return;
          }

          logAuthDebug("[Auth] Discord popup closed; starting grace window");

          const graceMs = 2200;
          const started = Date.now();
          const gracePoll = window.setInterval(() => {
            if (handled || discordPopupMessageReceived.current) {
              window.clearInterval(gracePoll);
              cleanup();
              resolve({});
              return;
            }

            if (auth.currentUser || (status === "authenticated" && user)) {
              window.clearInterval(gracePoll);
              cleanup();
              resolve({});
              return;
            }

            if (Date.now() - started >= graceMs) {
              window.clearInterval(gracePoll);
              cleanup();
              reject(new Error("auth_popup_closed"));
            }
          }, 200);
        }
      }, 500);

      const cleanup = (error?: Error) => {
        window.removeEventListener("message", onMessage);
        window.clearTimeout(timer);
        window.clearInterval(closePoll);
        if (error) reject(error);
      };

      const onMessage = (event: MessageEvent) => {
        if (!allowedOrigins.has(event.origin)) return;
        const data = event.data;
        if (data?.type !== "sfh:discordAuth") return;
        if (data?.nonce && data.nonce !== expectedNonce) return;
        discordPopupMessageReceived.current = true;
        handled = true;
        cleanup();
        resolve({
          customToken: typeof data?.customToken === "string" ? data.customToken : undefined,
        });
      };

      window.addEventListener("message", onMessage);
    });
  }, []);

  const waitForSessionReady = useCallback(async () => {
    const started = Date.now();
    const maxWait = 2000;
    const delay = 200;

    const attempt = async () => {
      const ok = await fetchSession({ silent: true });
      if (ok) return true;
      if (Date.now() - started >= maxWait) return false;
      await new Promise((r) => setTimeout(r, delay));
      return attempt();
    };

    return attempt();
  }, [fetchSession]);

  const loginWithDiscord = useCallback(async () => {
    if (discordLoginInFlight.current) {
      logAuthDebug("[Auth] Discord login already in-flight, ignoring new request");
      return;
    }
    discordLoginInFlight.current = true;
    discordPopupMessageReceived.current = false;
    const origin = typeof window !== "undefined" ? window.location.origin : "N/A";
    const host = typeof window !== "undefined" ? window.location.host : "N/A";
    logAuthDebug("[Auth] Starting Discord auth-api popup login", { origin, host });

    const nonce = createNonce();
    try {
      window.sessionStorage?.setItem(AUTH_POPUP_NONCE_KEY, nonce);
    } catch (error) {
      console.warn("[Auth] Failed to persist popup nonce", error);
    }

    const popupUrl = buildAuthLoginUrl("discord", { mode: "popup", nonce });
    if (!popupUrl) {
      console.warn("[Auth] Missing AUTH_BASE_URL for Discord login.");
      return;
    }

    const popup = window.open(
      popupUrl,
      "sfh_discord_oauth",
      "width=520,height=720,menubar=no,toolbar=no,resizable=yes,scrollbars=yes",
    );

    if (!popup || popup.closed) {
      logAuthDebug("[Auth] Popup blocked or failed, redirecting to auth-api flow");
      try {
        window.sessionStorage?.removeItem(AUTH_POPUP_NONCE_KEY);
      } catch {
        // ignore
      }
      startRedirectLogin("discord");
      discordLoginInFlight.current = false;
      return;
    }

    try {
      const popupResult = await waitForPopupAuth(popup, nonce);
      if (popupResult?.customToken) {
        await signInWithCustomToken(auth, popupResult.customToken);
        logAuthDebug("[Auth] Discord popup custom token received and signed in");
        await fetchSession({ silent: true });
      } else {
        const sessionOk = await waitForSessionReady();
        if (!sessionOk) {
          logAuthDebug("[Auth] Popup login completed but session missing, redirecting for sync");
          startRedirectLogin("discord");
        }
      }
    } catch (error: any) {
      logAuthDebug("[Auth] Popup login did not complete, falling back to redirect", {
        code: error?.code,
        message: error?.message,
      });
      startRedirectLogin("discord");
    } finally {
      try {
        window.sessionStorage?.removeItem(AUTH_POPUP_NONCE_KEY);
      } catch {
        // ignore
      }
      setTimeout(() => {
        discordLoginInFlight.current = false;
      }, DISCORD_LOGIN_GUARD_MS);
    }
  }, [startRedirectLogin, waitForPopupAuth, waitForSessionReady]);

  const loginWithGoogle = useCallback(async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "N/A";
    const host = typeof window !== "undefined" ? window.location.host : "N/A";
    const projectId = auth.app?.options?.projectId ?? "unknown";
    const authDomain = auth.app?.options?.authDomain ?? "unknown";
    logAuthDebug("[Auth] Starting google login", { origin, host, projectId, authDomain });

    const providerInstance = googleProvider;
    const isLikelyMobile = () => {
      if (typeof window === "undefined") return false;
      const ua = (window.navigator?.userAgent || "").toLowerCase();
      if (/mobile|android|iphone|ipad|ipod/.test(ua)) return true;
      if (typeof window.matchMedia === "function") {
        return window.matchMedia("(max-width: 768px)").matches;
      }
      return false;
    };

    if (!providerInstance || isLikelyMobile()) {
      logAuthDebug("[Auth] Falling back to redirect for google", {
        reason: providerInstance ? "mobile" : "provider_unavailable",
      });
      startRedirectLogin("google");
      return;
    }

    try {
      await signInWithPopup(auth, providerInstance);
      const sessionOk = await fetchSession({ silent: true });
      if (!sessionOk) {
        logAuthDebug("[Auth] Popup login succeeded but session missing, redirecting for sync");
        startRedirectLogin("google");
      }
    } catch (error: any) {
      const code = typeof error?.code === "string" ? error.code : "";
      const message = typeof error?.message === "string" ? error.message : "Auth popup failed";
      const shouldFallback = POPUP_FALLBACK_CODES.has(code);

      logAuthDebug("[Auth] Popup login failed for google", {
        code,
        message,
        host,
        origin,
        projectId,
        authDomain,
        email: typeof error?.customData?.email === "string" ? error.customData.email : undefined,
      });

      if (shouldFallback) {
        startRedirectLogin("google");
        return;
      }

      console.error("[Auth] Popup login failed for google (no fallback)", { code, message });
      const enrichedError: any = new Error(message);
      if (code) enrichedError.code = code;
      throw enrichedError;
    }
  }, [fetchSession, googleProvider, startRedirectLogin]);

  const toggleFavoriteByKind = useCallback(
    async (kind: AuthFavoriteKind, rawIdentifier: string): Promise<{ isFavorite: boolean }> => {
      const identifier = normalizeFavoriteIdentifier(rawIdentifier);
      if (!identifier) {
        const error = Object.assign(new Error("Missing favorite identifier"), { code: "INVALID_IDENTIFIER" });
        throw error;
      }

      if (!user) {
        const error = Object.assign(new Error("Not authenticated"), { code: "AUTH_REQUIRED" });
        throw error;
      }

      const bucket = kind === "player" ? "players" : "guilds";
      const currentlyFavorite = isFavoriteInUser(user, bucket, identifier);
      const nextIsFavorite = !currentlyFavorite;

      setUser((prev) => {
        const next = applyFavoriteToUser(prev, bucket, identifier, nextIsFavorite);
        writeCachedAuthUser(next);
        return next;
      });

      try {
        const response = await patchFavorite({
          kind,
          op: nextIsFavorite ? "add" : "remove",
          identifier,
        });
        setUser((prev) => {
          const next = applyFavoriteToUser(prev, bucket, identifier, response.isFavorite);
          writeCachedAuthUser(next);
          return next;
        });
        return { isFavorite: response.isFavorite };
      } catch (error) {
        setUser((prev) => {
          const next = applyFavoriteToUser(prev, bucket, identifier, currentlyFavorite);
          writeCachedAuthUser(next);
          return next;
        });
        throw error;
      }
    },
    [user],
  );

  const isFavoritePlayer = useCallback(
    (identifier: string | null | undefined) => isFavoriteInUser(user, "players", identifier),
    [user],
  );

  const isFavoriteGuild = useCallback(
    (identifier: string | null | undefined) => isFavoriteInUser(user, "guilds", identifier),
    [user],
  );

  const toggleFavoritePlayer = useCallback(
    (identifier: string) => toggleFavoriteByKind("player", identifier),
    [toggleFavoriteByKind],
  );

  const toggleFavoriteGuild = useCallback(
    (identifier: string) => toggleFavoriteByKind("guild", identifier),
    [toggleFavoriteByKind],
  );

  const logout = useCallback(async () => {
    await signOut(auth).catch(() => undefined);

    if (!LOGOUT_ENDPOINT) {
      console.warn("[Auth] AUTH_BASE_URL is not configured. Clearing local session only.");
      setUser(null);
      writeCachedAuthUser(null);
      setStatus("unauthenticated");
      return;
    }

    try {
      const response = await fetch(LOGOUT_ENDPOINT, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Logout failed (${response.status})`);
      }
    } catch (error) {
      console.error("[Auth] Failed to logout. Clearing local session anyway.", error);
    } finally {
      setUser(null);
      writeCachedAuthUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const refreshSession = useCallback(async (options?: RefreshOptions) => fetchSession(options), [fetchSession]);

  const loading = status === "idle" || status === "loading";

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isLoading: loading,
      isFavoritePlayer,
      isFavoriteGuild,
      toggleFavoritePlayer,
      toggleFavoriteGuild,
      loginWithDiscord,
      loginWithGoogle,
      logout,
      refreshSession,
    }),
    [
      user,
      status,
      loading,
      isFavoritePlayer,
      isFavoriteGuild,
      toggleFavoritePlayer,
      toggleFavoriteGuild,
      loginWithDiscord,
      loginWithGoogle,
      logout,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
