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
import type { AuthStatus, AuthUser } from "../lib/auth/types";
import { fetchFirebaseToken } from "../lib/auth/client";
import { auth } from "../lib/firebase";
import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  isLoading: boolean;
  loginWithDiscord: () => void;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  refreshSession: (options?: RefreshOptions) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_ENDPOINT = AUTH_BASE_URL ? `${AUTH_BASE_URL}/auth/session` : "";
const LOGOUT_ENDPOINT = AUTH_BASE_URL ? `${AUTH_BASE_URL}/auth/logout` : "";

type RefreshOptions = {
  silent?: boolean;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const firebaseSyncRef = useRef<{ tried: boolean }>({ tried: false });

  const handleSessionResponse = useCallback((payload: any) => {
    if (payload?.authenticated && payload.user) {
      setUser(payload.user as AuthUser);
      setStatus("authenticated");
    } else {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const fetchSession = useCallback(async (options?: RefreshOptions) => {
    if (!options?.silent) {
      setStatus("loading");
    }

    if (!SESSION_ENDPOINT) {
      console.warn("[Auth] AUTH_BASE_URL is not configured. Skipping session fetch.");
      setUser(null);
      setStatus("unauthenticated");
      return;
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
    } catch (error) {
      console.error("[Auth] Failed to refresh session.", error);
      setUser(null);
      setStatus("unauthenticated");
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

  const loginWithProvider = useCallback((provider: "discord" | "google") => {
    if (!AUTH_BASE_URL) {
      console.warn(`[Auth] Cannot initiate ${provider} login without AUTH_BASE_URL.`);
      return;
    }
    window.location.href = `${AUTH_BASE_URL}/auth/${provider}/login`;
  }, []);

  const loginWithDiscord = useCallback(() => loginWithProvider("discord"), [loginWithProvider]);
  const loginWithGoogle = useCallback(() => loginWithProvider("google"), [loginWithProvider]);

  const logout = useCallback(async () => {
    await signOut(auth).catch(() => undefined);

    if (!LOGOUT_ENDPOINT) {
      console.warn("[Auth] AUTH_BASE_URL is not configured. Clearing local session only.");
      setUser(null);
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
      setStatus("unauthenticated");
    }
  }, []);

  const refreshSession = useCallback(async (options?: RefreshOptions) => {
    await fetchSession(options);
  }, [fetchSession]);

  const loading = status === "idle" || status === "loading";

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isLoading: loading,
      loginWithDiscord,
      loginWithGoogle,
      logout,
      refreshSession,
    }),
    [user, status, loading, loginWithDiscord, loginWithGoogle, logout, refreshSession],
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
