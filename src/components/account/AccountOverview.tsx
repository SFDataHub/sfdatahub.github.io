import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { AUTH_BASE_URL } from "../../lib/auth/config";
import { DataHubLoadingState } from "../ui/shared/DataHubLoadingState";
import AccountGuestContent from "../Topbar/AccountGuestContent";
import styles from "../../pages/Settings/AccountSettingsPage.module.css";

const PLACEHOLDER_AVATAR = "https://i.pravatar.cc/72";
const PROFILE_ENDPOINT = AUTH_BASE_URL ? `${AUTH_BASE_URL}/auth/account/profile` : "";
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 32;
const formatTimestamp = (value: string, locale: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
};

/** No settings/tools reads: identity comes from the existing auth session. */
export default function AccountOverview() {
  const { status, user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (status === "idle" || status === "loading") return (
    <DataHubLoadingState variant="page" title={t("account.overview.checkingSession")} message={t("account.overview.readingSession")} />
  );
  if (status !== "authenticated" || !user) return <AccountGuestContent onSignIn={() => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sfh:openLoginModal"));
    else navigate("/login");
  }} />;
  return <AuthenticatedOverview key={user.id} />;
}

function AuthenticatedOverview() {
  const { user, logout, refreshSession } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); navigate("/"); };
  const renderServicesCard = () => {
    if (!user) return null;
    const discordProvider = user.providers?.discord;
    const discordConnected = Boolean(discordProvider);
    const serviceRows = [
      {
        key: "discord",
        name: "Discord",
        status: discordConnected
          ? t("account.overview.connectedAs", { name: discordProvider?.displayName ?? user.displayName })
          : t("account.overview.notConnected"),
        actionLabel: discordConnected ? t("account.overview.connected") : t("account.overview.connect"),
        disabled: true,
      },
      {
        key: "twitch",
        name: "Twitch",
        status: t("account.overview.planned"),
        actionLabel: t("account.overview.soon"),
        disabled: true,
      },
      {
        key: "youtube",
        name: "YouTube",
        status: t("account.overview.planned"),
        actionLabel: t("account.overview.soon"),
        disabled: true,
      },
    ];

    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("account.overview.services")}</h2>
        <p className={styles.cardSubtitle}>
          {t("account.overview.servicesHelp")}
        </p>
        <div className={styles.serviceList}>
          {serviceRows.map((service) => (
            <div key={service.key} className={styles.serviceRow}>
              <div>
                <p className={styles.serviceName}>{service.name}</p>
                <p className={styles.serviceStatus}>{service.status}</p>
              </div>
              <button
                type="button"
                className={styles.serviceAction}
                disabled={service.disabled}
              >
                {service.actionLabel}
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderSecurityCard = () => (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t("account.overview.security")}</h2>
      <p className={styles.securityText}>
        {t("account.overview.securityText")}
      </p>
      <p className={styles.securityNote}>
        {t("account.overview.securityNote")}
      </p>
      <button type="button" className={styles.logoutButton} onClick={handleLogout}>
        {t("account.overview.logout")}
      </button>
      <p className={styles.securityNote}>
        {t("account.overview.revoke")}
      </p>
    </section>
  );


  return <>
    <IdentityCard user={user} refreshSession={refreshSession} />
    {renderServicesCard()}
    {renderSecurityCard()}
  </>;
}

type IdentityCardProps = {
  user: ReturnType<typeof useAuth>["user"];
  refreshSession: ReturnType<typeof useAuth>["refreshSession"];
};

function IdentityCard({ user, refreshSession }: IdentityCardProps) {
  const { t, i18n } = useTranslation();
  const alive = useRef(false);
  const savingRef = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [nameDraft, setNameDraft] = useState(() => user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const avatarUrl = user?.avatarUrl || PLACEHOLDER_AVATAR;
  const providerLabel = user?.provider === "google" ? "Google" : "Discord";
  const currentDisplayName = user?.displayName ?? "";
  const trimmedName = nameDraft.trim();
  const nameLengthValid =
    trimmedName.length === 0 ||
    (trimmedName.length >= MIN_NAME_LENGTH && trimmedName.length <= MAX_NAME_LENGTH);
  const nameChanged = Boolean(user) && trimmedName.length > 0 && trimmedName !== currentDisplayName;
  const canSave = Boolean(PROFILE_ENDPOINT && nameLengthValid && nameChanged && !saving);
  const validationMessage =
    trimmedName.length > 0 && !nameLengthValid
      ? t("account.overview.nameLength", { min: new Intl.NumberFormat(i18n.language).format(MIN_NAME_LENGTH), max: new Intl.NumberFormat(i18n.language).format(MAX_NAME_LENGTH) })
      : null;

  useEffect(() => {
    setNameDraft(user?.displayName ?? "");
    setSuccess(false);
    setError(null);
  }, [user?.id, user?.displayName]);

  const metaItems = useMemo(() => {
    if (!user) return [];
    return [
      { label: t("account.overview.id"), value: user.id },
      user.roles?.length ? { label: t("account.overview.roles"), value: user.roles.join(", ") } : null,
      user.createdAt ? { label: t("account.overview.createdAt"), value: formatTimestamp(user.createdAt, i18n.language) } : null,
      user.lastLoginAt ? { label: t("account.overview.lastLogin"), value: formatTimestamp(user.lastLoginAt, i18n.language) } : null,
    ].filter((entry): entry is { label: string; value: string } => Boolean(entry?.value));
  }, [user, t, i18n.language]);

  const handleNameSave = async () => {
    if (savingRef.current) return;
    if (!canSave || !PROFILE_ENDPOINT) {
      if (!PROFILE_ENDPOINT) {
        setError("notConfigured");
      }
      return;
    }

    try {
      savingRef.current = true;
      setSaving(true);
      setError(null);
      setSuccess(false);

      const response = await fetch(PROFILE_ENDPOINT, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: trimmedName }),
      });

      if (!alive.current) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const code = payload?.error === "displayName contains invalid characters" ? "invalidCharacters"
          : response.status === 401 ? "sessionExpired"
          : response.status === 404 ? "accountMissing"
          : typeof payload?.error === "string" && payload.error.startsWith("displayName must be") ? "nameLength" : "saveError";
        if (alive.current) setError(code);
        return;
      }
      const refreshed = await refreshSession();
      if (!alive.current) return;
      if (!refreshed) { setError("sessionExpired"); return; }
      setSuccess(true);
      setNameDraft(trimmedName);
    } catch {
      if (alive.current) setError("saveError");
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  };

  const handleNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (canSave) {
        handleNameSave();
      }
    }
  };

  const handleNameBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    // Navigation and language controls must preserve the unsaved account draft.
    if (event.relatedTarget instanceof Element && event.relatedTarget.closest('nav, header, [role="tablist"]')) return;
    if (canSave) {
      handleNameSave();
    }
  };

  if (!user) return null;

  return (
    <section className={styles.card}>
      <div className={styles.identityHeader}>
        <img src={avatarUrl} alt="" className={styles.identityAvatar} />
        <div>
          <p className={styles.identityName}>{user.displayName || t("account.overview.unnamed")}</p>
          <p className={styles.identityProvider}>{t("account.overview.providerSignIn", { provider: providerLabel })}</p>
        </div>
        <span className={styles.statusBadge}>{t("account.overview.verified")}</span>
      </div>
      <div className={styles.identityForm}>
        <div className={styles.nameInputWrap}>
          <label className={styles.nameLabel} htmlFor="account-display-name">{t("account.overview.displayName")}</label>
          <input
            id="account-display-name"
            type="text"
            className={styles.nameInput}
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameBlur}
            placeholder={t("account.overview.namePlaceholder")}
            aria-describedby="account-name-feedback"
            aria-invalid={!!validationMessage}
          />
        </div>
        <button
          type="button"
          className={styles.nameSaveButton}
          disabled={!canSave}
          onClick={handleNameSave}
        >
          {saving ? t("account.overview.saving") : t("account.overview.save")}
        </button>
      </div>
      <div id="account-name-feedback" aria-live="polite">
        {validationMessage && <p className={styles.feedbackError}>{validationMessage}</p>}
        {error && <p role="alert" className={styles.feedbackError}>{t(`account.overview.${error}`, { min: new Intl.NumberFormat(i18n.language).format(MIN_NAME_LENGTH), max: new Intl.NumberFormat(i18n.language).format(MAX_NAME_LENGTH) })}</p>}
        {success && <p role="status" className={styles.feedbackSuccess}>{t("account.overview.nameUpdated")}</p>}
      </div>
      {metaItems.length > 0 && (
        <div className={styles.metaGrid}>
          {metaItems.map((meta) => (
            <div key={meta.label} className={styles.metaItem}>
              <span className={styles.metaLabel}>{meta.label}</span>
              <span className={styles.metaValue}>{meta.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
