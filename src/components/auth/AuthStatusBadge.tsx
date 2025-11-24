import React, { useState } from "react";

import { useAuth } from "../../context/AuthContext";
import styles from "./AuthStatusBadge.module.css";

const AuthStatusBadge: React.FC = () => {
  const { status, user, loginWithDiscord, loginWithGoogle, logout, isLoading } = useAuth();
  const [redirecting, setRedirecting] = useState<"discord" | "google" | null>(null);

  const handleProviderClick = (provider: "discord" | "google") => {
    if (isLoading || redirecting) return;
    setRedirecting(provider);
    if (provider === "discord") {
      loginWithDiscord();
    } else {
      loginWithGoogle();
    }
  };

  if (isLoading) {
    return (
      <div className={styles.spinnerShell} role="status" aria-live="polite">
        <div className={styles.spinner} aria-hidden="true" />
        <span className={styles.srOnly}>Checking login status</span>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className={styles.buttonRow}>
        <button
          type="button"
          className={`${styles.button} ${styles.discord}`}
          onClick={() => handleProviderClick("discord")}
          disabled={Boolean(redirecting)}
          aria-disabled={Boolean(redirecting)}
        >
          {redirecting === "discord" ? (
            <>
              <span className={styles.buttonSpinner} aria-hidden="true" />
              <span>Redirecting…</span>
            </>
          ) : (
            <span>Login with Discord</span>
          )}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.google}`}
          onClick={() => handleProviderClick("google")}
          disabled={Boolean(redirecting)}
          aria-disabled={Boolean(redirecting)}
        >
          {redirecting === "google" ? (
            <>
              <span className={styles.buttonSpinner} aria-hidden="true" />
              <span>Redirecting…</span>
            </>
          ) : (
            <span>Login with Google</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.authedRow}>
      <div className={styles.userMeta}>
        <p className={styles.userLine}>
          Signed in as <strong>{user?.displayName ?? "Unknown"}</strong>
        </p>
        {user?.provider ? <p className={styles.userProvider}>via {user.provider}</p> : null}
      </div>
      <button type="button" className={styles.logoutButton} onClick={logout}>
        Logout
      </button>
    </div>
  );
};

export default AuthStatusBadge;
