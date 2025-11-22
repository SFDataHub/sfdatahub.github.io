import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import styles from "./Topbar.module.css";

const PLACEHOLDER_AVATAR = "https://i.pravatar.cc/72";

interface AccountMenuProps {
  fallbackName?: string;
}

const AccountMenu: React.FC<AccountMenuProps> = ({ fallbackName }) => {
  const { user, status, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isAuthed = status === "authenticated";
  const displayName = isAuthed
    ? user?.displayName ?? fallbackName ?? "Player"
    : fallbackName ?? "Guest";
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

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSignIn = () => {
    navigate("/login");
    closeMenu();
  };

  const handleAccountClick = () => {
    navigate("/settings/account");
    closeMenu();
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
      return <p className={styles.accountStatusText}>Checking session...</p>;
    }

    if (status === "unauthenticated") {
      return (
        <>
          <div className={styles.accountHeader}>
            <p className={styles.accountName}>Not signed in</p>
            <p className={styles.accountSub}>Your scans stay synced when you log in.</p>
          </div>
          <button type="button" className={styles.accountPrimary} onClick={handleSignIn}>
            Sign in
          </button>
          <p className={styles.accountHint}>Use Discord or Google on the sign-in page.</p>
        </>
      );
    }

    if (status === "authenticated") {
      return (
        <>
          <div className={styles.accountHeader}>
            <img className={styles.accountMiniAvatar} src={avatarUrl} alt={displayName} />
            <div>
              <p className={styles.accountName}>{displayName}</p>
              <p className={styles.accountSub}>
                Signed in via {user?.provider === "google" ? "Google" : "Discord"}
              </p>
            </div>
          </div>
          <button type="button" className={styles.accountItem} onClick={handleAccountClick}>
            Account &amp; Profile
          </button>
          <hr className={styles.accountDivider} />
          <button type="button" className={`${styles.accountItem} ${styles.accountLogout}`} onClick={handleLogout}>
            Logout
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
          aria-label="Checking login status"
        >
          <span className={styles.avatarSpinner} aria-hidden="true" />
          <span className={styles.srOnly}>Checking login status</span>
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
    </div>
  );
};

export default AccountMenu;
