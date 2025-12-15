import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ContentShell from "../../components/ContentShell";
import { useAuth } from "../../context/AuthContext";
import logo from "../../assets/logo-sfdatahub.png";
import styles from "./LoginPage.module.css";

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

  const handleDiscord = () => {
    if (!isLoading) loginWithDiscord();
  };

  const handleGoogle = () => {
    if (!isLoading) loginWithGoogle();
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
