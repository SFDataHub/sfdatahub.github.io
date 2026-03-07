import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import logo from "../../assets/logo-sfdatahub.png";
import styles from "../../pages/auth/LoginPage.module.css";

const LoginCard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, user, loginWithDiscord, logout } = useAuth();
  const [authError, setAuthError] = React.useState<{ code?: string; message: string } | null>(null);

  const isLoading = status === "loading" || status === "idle";
  const isAuthenticated = status === "authenticated" && !!user;

  const mapAuthError = React.useCallback((code?: string, rawMessage?: string): string => {
    const host =
      typeof window !== "undefined"
        ? window.location.host
        : t("account.loginOverlay.errors.unknownHost");

    switch (code) {
      case "auth/unauthorized-domain":
        return t("account.loginOverlay.errors.unauthorizedDomain", {
          host,
        });
      case "auth/popup-blocked":
        return t("account.loginOverlay.errors.popupBlocked");
      case "auth/popup-closed-by-user":
        return t("account.loginOverlay.errors.popupClosed");
      default: {
        const baseMessage = rawMessage || t("account.loginOverlay.errors.default");
        if (!code) return baseMessage;
        return `${baseMessage} (${t("account.loginOverlay.errors.codeLabel")}: ${code})`;
      }
    }
  }, [t]);

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
        <div>{t("account.loginOverlay.loading")}</div>
      </div>
    );
  } else if (isAuthenticated && user) {
    body = (
      <div className={styles.sessionBlock}>
        <div className={styles.status}>
          {t("account.loginOverlay.authedStatus", { name: user.displayName })}
        </div>
        <button className={styles.logoutButton} type="button" onClick={handleLogout}>
          {t("account.loginOverlay.logout")}
        </button>
        <button className={styles.linkButton} type="button" onClick={handleBackHome}>
          {t("account.loginOverlay.backToDashboard")}
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
          {t("account.loginOverlay.discordCta")}
        </button>
        {authError && (
          <div className={styles.errorMessage}>
            {authError.message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <img className={styles.logo} src={logo} alt={t("account.loginOverlay.logoAlt")} />
        <h1 className={styles.heading}>{t("account.loginOverlay.title")}</h1>
        <p className={styles.subcopy}>{t("account.loginOverlay.subtitle")}</p>
        {body}
        <p className={styles.disclaimer}>{t("account.loginOverlay.disclaimer")}</p>
      </div>
    </div>
  );
};

export default LoginCard;

