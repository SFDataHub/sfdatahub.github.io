import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ContentShell from "../../components/ContentShell";
import { useAuth } from "../../context/AuthContext";
import logo from "../../assets/logo-sfdatahub.png";
import styles from "./LoginPage.module.css";
import { auth } from "../../lib/firebase";

const AUTH_NEXT_STORAGE_KEY = "sfh:authNext";

const isSafeNextPath = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.toLowerCase().startsWith("/login")) return null;
  return trimmed;
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, user, loginWithDiscord, loginWithGoogle, logout } = useAuth();
  const [authError, setAuthError] = React.useState<{ code?: string; message: string } | null>(null);

  const isLoading = status === "loading" || status === "idle";
  const isAuthenticated = status === "authenticated" && !!user;

  const nextFromQuery = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("next");
  }, [location.search]);

  const storedNext = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(AUTH_NEXT_STORAGE_KEY);
    } catch (error) {
      console.warn("[Login] Failed to read auth next from sessionStorage", error);
      return null;
    }
  }, []);

  const resolvedNext = React.useMemo(
    () => isSafeNextPath(nextFromQuery) ?? isSafeNextPath(storedNext),
    [nextFromQuery, storedNext],
  );

  React.useEffect(() => {
    if (!isAuthenticated) return;

    const nextPath = resolvedNext;
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem(AUTH_NEXT_STORAGE_KEY);
    }
    if (nextPath) {
      navigate(nextPath, { replace: true });
    }
  }, [isAuthenticated, navigate, resolvedNext]);

  const isAuthDebugEnabled = React.useCallback(() => {
    const fallback = import.meta.env.DEV;
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage?.getItem("sfh:debug:auth");
      if (raw === "1" || raw === "true") return true;
    } catch (error) {
      console.warn("[Login] Failed to read auth debug flag", error);
    }
    return fallback;
  }, []);

  const mapAuthError = React.useCallback((code?: string, rawMessage?: string): string => {
    const host = typeof window !== "undefined" ? window.location.host : "unknown host";
    switch (code) {
      case "auth/unauthorized-domain":
        return `This domain is not authorized for login. Please add "${host}" to your Firebase Auth authorized domains or use the correct environment.`;
      case "auth/popup-blocked":
        return "The login popup was blocked. Please allow popups for this site or continue with the redirect flow.";
      case "auth/popup-closed-by-user":
        return "The login popup was closed before completing sign-in. Please try again.";
      default: {
        const suffix = code ? ` (code: ${code})` : "";
        const baseMessage = rawMessage || "Login failed. Please try again.";
        return `${baseMessage}${suffix}`;
      }
    }
  }, []);

  const handleDiscord = async () => {
    if (isLoading) return;
    setAuthError(null);
    try {
      await loginWithDiscord();
    } catch (error: any) {
      const code = typeof error?.code === "string" ? error.code : undefined;
      const message = typeof error?.message === "string" ? error.message : undefined;
      setAuthError({ code, message: mapAuthError(code, message) });
    }
  };

  const handleGoogle = async () => {
    if (isLoading) return;
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (error: any) {
      const code = typeof error?.code === "string" ? error.code : undefined;
      const message = typeof error?.message === "string" ? error.message : undefined;
      setAuthError({ code, message: mapAuthError(code, message) });
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleBackHome = () => {
    navigate("/");
  };

  let body: React.ReactNode;

  if (isLoading) {
    body = (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <div>Checking session…</div>
      </div>
    );
  } else if (isAuthenticated && user) {
    body = (
      <div className={styles.sessionBlock}>
        <div className={styles.status}>You are logged in as {user.displayName}.</div>
        <button className={styles.logoutButton} type="button" onClick={handleLogout}>
          Logout
        </button>
        <button className={styles.linkButton} type="button" onClick={handleBackHome}>
          Back to dashboard
        </button>
      </div>
    );
  } else {
    body = (
      <div className={styles.buttonStack}>
        <button
          className={`${styles.providerButton} ${styles.discord}`}
          type="button"
          onClick={handleDiscord}
        >
          Login with Discord
        </button>
        <button
          className={`${styles.providerButton} ${styles.google}`}
          type="button"
          onClick={handleGoogle}
        >
          Login with Google
        </button>
        {authError && (
          <div className={styles.errorMessage}>
            {authError.message}
          </div>
        )}
        {isAuthDebugEnabled() && (
          <details className={styles.diagnostics}>
            <summary>Auth diagnostics</summary>
            <div className={styles.diagnosticsBody}>
              <div>Host: {typeof window !== "undefined" ? window.location.host : "N/A"}</div>
              <div>Origin: {typeof window !== "undefined" ? window.location.origin : "N/A"}</div>
              <div>Firebase projectId: {auth.app?.options?.projectId ?? "unknown"}</div>
              <div>Firebase authDomain: {auth.app?.options?.authDomain ?? "unknown"}</div>
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <ContentShell title="Account Access" subtitle="Connect with your community identity" mode="page" padded>
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <img className={styles.logo} src={logo} alt="SFDataHub logo" />
          <h1 className={styles.heading}>Sign in</h1>
          <p className={styles.subcopy}>Choose a method to access SFDataHub.</p>
          {body}
          <p className={styles.disclaimer}>
            We store only your SFDataHub user ID, display name, avatar, and roles to personalize your experience.
          </p>
        </div>
      </div>
    </ContentShell>
  );
};

export default LoginPage;
