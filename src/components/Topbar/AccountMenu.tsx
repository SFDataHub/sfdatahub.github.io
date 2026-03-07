import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import LanguageSettingsOverlay from "./LanguageSettingsOverlay";
import styles from "./Topbar.module.css";

const PLACEHOLDER_AVATAR = "https://i.pravatar.cc/72";

interface AccountMenuProps {
  fallbackName?: string;
}

const AccountMenu: React.FC<AccountMenuProps> = ({ fallbackName }) => {
  const { user, status, logout, isLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLanguageOverlayOpen, setIsLanguageOverlayOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isAuthed = status === "authenticated";
  const displayName = isAuthed
    ? user?.displayName ?? fallbackName ?? t("account.menu.fallbackAuthedName", "Player")
    : fallbackName ?? t("account.menu.fallbackGuestName", "Guest");
  const avatarUrl = isAuthed && user?.avatarUrl ? user.avatarUrl : PLACEHOLDER_AVATAR;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      setIsOpen(false);
    }
  }, [isLoading]);

  const closeMenu = useCallback(() => setIsOpen(false), []);
  const closeLanguageOverlay = useCallback(() => setIsLanguageOverlayOpen(false), []);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSignIn = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sfh:openLoginModal"));
    } else {
      navigate("/login");
    }
    closeMenu();
  };

  const handleAccountClick = () => {
    navigate("/settings/account");
    closeMenu();
  };

  const handleOpenLanguageSettings = () => {
    closeMenu();
    setIsLanguageOverlayOpen(true);
  };

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      closeMenu();
      navigate("/");
    }
  }, [closeMenu, logout, navigate]);

  const renderDropdownContent = () => {
    if (isLoading) {
      return <p className={styles.accountStatusText}>{t("account.menu.loadingSession", "Checking session...")}</p>;
    }

    if (status === "unauthenticated") {
      return (
        <div className={styles.accountGuestContent}>
          <div className={`${styles.accountHeader} ${styles.accountGuestHeader}`}>
            <p className={styles.accountName}>{t("account.menu.guestTitle")}</p>
            <p className={styles.accountSub}>
              {t("account.menu.guestSubtitle")}
            </p>
          </div>
          <button type="button" className={`${styles.accountPrimary} ${styles.accountGuestPrimary}`} onClick={handleSignIn}>
            {t("account.menu.signInCta")}
          </button>
          <hr className={`${styles.accountDivider} ${styles.accountGuestDivider}`} />
          <button type="button" className={styles.accountItem} onClick={handleOpenLanguageSettings}>
            {t("account.menu.languageSettingsCta", "Language settings")}
          </button>
        </div>
      );
    }

    if (status === "authenticated") {
      const isAdmin = !!user?.roles?.includes("admin");

      return (
        <>
          <div className={styles.accountHeader}>
            <img className={styles.accountMiniAvatar} src={avatarUrl} alt={displayName} />
            <div>
              <p className={styles.accountName}>{displayName}</p>
              <p className={styles.accountSub}>
                {t("account.menu.signedInVia", {
                  defaultValue: "Signed in via {{provider}}",
                  provider: user?.provider === "google"
                    ? t("account.menu.providerGoogle", "Google")
                    : t("account.menu.providerDiscord", "Discord"),
                })}
              </p>
            </div>
          </div>
          <button type="button" className={styles.accountItem} onClick={handleAccountClick}>
            {t("account.menu.accountAndProfile", "Account & Profile")}
          </button>
          <button type="button" className={styles.accountItem} onClick={handleOpenLanguageSettings}>
            {t("account.menu.languageSettingsCta", "Language settings")}
          </button>
          {isAdmin ? (
            <a
              className={styles.accountItem}
              href="https://control-panel.sfdatahub.com/"
              target="_blank"
              rel="noreferrer"
            >
              {t("account.menu.consolePanel", "Console Panel")}
            </a>
          ) : null}
          <hr className={styles.accountDivider} />
          <button type="button" className={`${styles.accountItem} ${styles.accountLogout}`} onClick={handleLogout}>
            {t("account.menu.logout", "Logout")}
          </button>
        </>
      );
    }

    return null;
  };

  return (
    <div className={styles.accountRoot} ref={rootRef}>
      {isLoading ? (
        <div
          className={styles.avatarSpinnerShell}
          role="status"
          aria-live="polite"
          aria-label={t("account.menu.loadingLoginStatus", "Checking login status")}
        >
          <span className={styles.avatarSpinner} aria-hidden="true" />
          <span className={styles.srOnly}>{t("account.menu.loadingLoginStatus", "Checking login status")}</span>
        </div>
      ) : (
        <button
          type="button"
          className={styles.avatarBtn}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={displayName}
          onClick={handleToggle}
        >
          <img className={styles.avatar} src={avatarUrl} alt={displayName} />
        </button>
      )}

      {!isLoading && isOpen && (
        <div className={styles.accountDropdown} role="menu">
          {renderDropdownContent()}
        </div>
      )}
      <LanguageSettingsOverlay isOpen={isLanguageOverlayOpen} onClose={closeLanguageOverlay} />
    </div>
  );
};

export default AccountMenu;
