import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import ContentShell from "../../components/ContentShell";
import AccountConnectedCharactersTab from "../../components/account/AccountConnectedCharactersTab";
import { useAuth } from "../../context/AuthContext";
import { AUTH_BASE_URL } from "../../lib/auth/config";
import { getUserSettings, updateUserSettings, type UserSettings } from "../../lib/user/settings";
import { getUserToolsSettings, saveUserToolsSettings, type UserToolsSettings } from "../../lib/user/toolsSettings";
import styles from "./AccountSettingsPage.module.css";

const PLACEHOLDER_AVATAR = "https://i.pravatar.cc/72";
const PROFILE_ENDPOINT = AUTH_BASE_URL ? `${AUTH_BASE_URL}/auth/account/profile` : "";
const GOOGLE_LINK_ENDPOINT = AUTH_BASE_URL ? `${AUTH_BASE_URL}/auth/google/link/start` : "";
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 32;
type TabKey = "overview" | "settings" | "tools" | "connected-characters";

const formatTimestamp = (value?: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const AccountSettingsPage: React.FC = () => {
  const { status, user, logout, refreshSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loadedSettings, setLoadedSettings] = useState<UserSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [toolsSettings, setToolsSettings] = useState<UserToolsSettings | null>(null);
  const [initialToolsSettings, setInitialToolsSettings] = useState<UserToolsSettings | null>(null);
  const [isLoadingTools, setIsLoadingTools] = useState(true);
  const [isSavingTools, setIsSavingTools] = useState(false);
  const [toolsSaveError, setToolsSaveError] = useState<string | null>(null);
  const [toolsSaveSuccess, setToolsSaveSuccess] = useState(false);

  const linkFeedback = useMemo<{ type: "success" | "error"; message: string } | null>(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("linked") === "google") {
      return { type: "success", message: "Google successfully connected." };
    }
    if (params.get("error") === "google_already_linked") {
      return {
        type: "error",
        message: "This Google account is already linked to another SFDataHub account.",
      };
    }
    return null;
  }, [location.search]);

  const isLoading = status === "loading" || status === "idle";
  const isAuthed = status === "authenticated" && !!user;
  const uid = user?.id;

  const defaultSettings: UserSettings = useMemo(
    () => ({
      language: i18n.language === "de" ? "de" : "en",
      defaultSection: "home",
      compactTables: false,
      showExperimentalFeatures: false,
    }),
    [i18n.language],
  );

  useEffect(() => {
    if (!uid) {
      setSettings(null);
      setLoadedSettings(null);
      setSettingsError(null);
      setSettingsLoading(false);
      setToolsSettings(null);
      setInitialToolsSettings(null);
      setIsLoadingTools(false);
      setIsSavingTools(false);
      setToolsSaveError(null);
      setToolsSaveSuccess(false);
      return;
    }

    let isMounted = true;
    const load = async () => {
      setSettingsLoading(true);
      setSettingsError(null);
      setSaveSuccess(false);
      try {
        const remote = await getUserSettings(uid);
        const merged = remote ? { ...defaultSettings, ...remote } : defaultSettings;
        if (!isMounted) return;
        setSettings(merged);
        setLoadedSettings(merged);
      } catch (error) {
        if (!isMounted) return;
        setSettingsError(t("account.settings.error", "Could not load settings."));
      } finally {
        if (isMounted) {
          setSettingsLoading(false);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [uid, defaultSettings, t]);

  useEffect(() => {
    if (!uid) return;
    let isMounted = true;
    const defaults: UserToolsSettings = {
      defaultSetId: null,
      showToolsIntro: true,
      enableExperimentalTools: false,
    };
    const loadTools = async () => {
      setIsLoadingTools(true);
      setToolsSaveError(null);
      setToolsSaveSuccess(false);
      try {
        const remote = await getUserToolsSettings(uid);
        if (!isMounted) return;
        const merged = remote ? { ...defaults, ...remote } : defaults;
        setToolsSettings(merged);
        setInitialToolsSettings(merged);
      } catch (error) {
        if (!isMounted) return;
        setToolsSaveError(t("account.tools.loadError", "Could not load tools settings."));
      } finally {
        if (isMounted) {
          setIsLoadingTools(false);
        }
      }
    };
    loadTools();
    return () => {
      isMounted = false;
    };
  }, [uid, t]);

  const handleGoToSignIn = () => {
    navigate("/login");
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleGoogleConnect = () => {
    if (!GOOGLE_LINK_ENDPOINT) {
      window.alert("Auth service is not configured for Google linking.");
      return;
    }
    window.location.href = GOOGLE_LINK_ENDPOINT;
  };

  const renderLoading = () => (
    <div className={styles.loadingState}>Checking session...</div>
  );

  const renderUnauthed = () => (
    <div className={styles.emptyState}>
      <p className={styles.emptyStateTitle}>You are not signed in.</p>
      <p className={styles.emptyStateText}>
        Use the sign-in page to connect your Discord or Google account and unlock settings.
      </p>
      <button type="button" className={styles.primaryButton} onClick={handleGoToSignIn}>
        Go to sign-in
      </button>
    </div>
  );

  const renderLinkFeedback = () => {
    if (!linkFeedback) return null;
    const className =
      linkFeedback.type === "success"
        ? `${styles.banner} ${styles.bannerSuccess}`
        : `${styles.banner} ${styles.bannerError}`;
    return <div className={className}>{linkFeedback.message}</div>;
  };

  const renderServicesCard = () => {
    if (!user) return null;
    const discordProvider = user.providers?.discord;
    const googleProvider = user.providers?.google;
    const discordConnected = Boolean(discordProvider);
    const googleConnected = Boolean(googleProvider);
    const canLinkGoogle = Boolean(GOOGLE_LINK_ENDPOINT);
    const googleStatus = !canLinkGoogle
      ? "Auth service not configured"
      : googleConnected
        ? googleProvider?.displayName
          ? `Connected as ${googleProvider.displayName}`
          : "Connected"
        : "Not connected";
    const serviceRows = [
      {
        key: "discord",
        name: "Discord",
        status: discordConnected
          ? `Connected as ${discordProvider?.displayName ?? user.displayName}`
          : "Not connected",
        actionLabel: discordConnected ? "Connected" : "Connect",
        disabled: true,
      },
      {
        key: "google",
        name: "Google",
        status: googleStatus,
        actionLabel: googleConnected ? "Connected" : "Connect",
        disabled: googleConnected || !canLinkGoogle,
        onClick: googleConnected || !canLinkGoogle ? undefined : handleGoogleConnect,
      },
      {
        key: "twitch",
        name: "Twitch",
        status: "Planned",
        actionLabel: "Soon",
        disabled: true,
      },
      {
        key: "youtube",
        name: "YouTube",
        status: "Planned",
        actionLabel: "Soon",
        disabled: true,
      },
    ];

    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Connected services</h2>
        <p className={styles.cardSubtitle}>
          Manage which social logins are linked to your SFDataHub identity.
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
                onClick={service.onClick}
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
      <h2 className={styles.cardTitle}>Security &amp; session</h2>
      <p className={styles.securityText}>
        We only store your SFDataHub user ID, display name, avatar URL and provider identifiers
        (like your Discord ID). We never see or store your Discord or Google password.
      </p>
      <p className={styles.securityNote}>
        Logging out here only clears your SFDataHub session cookie. Your Discord or Google account
        stays signed in separately.
      </p>
      <button type="button" className={styles.logoutButton} onClick={handleLogout}>
        Log out from this device
      </button>
      <p className={styles.securityNote}>
        To fully revoke access, remove SFDataHub Auth from your Discord applications page.
      </p>
    </section>
  );

  const handleSettingsChange = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!settings) return;
    setSettings((prev) => ({ ...(prev ?? defaultSettings), [key]: value }));
    setSaveSuccess(false);
  };

  const settingsDirty = Boolean(
    settings &&
    loadedSettings &&
    JSON.stringify(settings) !== JSON.stringify(loadedSettings),
  );

  const toolsDirty = Boolean(
    toolsSettings &&
    initialToolsSettings &&
    JSON.stringify(toolsSettings) !== JSON.stringify(initialToolsSettings),
  );

  const handleSettingsSave = async () => {
    if (!uid || !settings || savingSettings || !settingsDirty) return;
    try {
      setSavingSettings(true);
      setSettingsError(null);
      await updateUserSettings(uid, settings);
      setLoadedSettings(settings);
      setSaveSuccess(true);
    } catch (error) {
      setSettingsError(t("account.settings.saveError", "Could not save settings. Please try again."));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToolsSettingsChange = <K extends keyof UserToolsSettings>(key: K, value: UserToolsSettings[K]) => {
    if (!toolsSettings) return;
    setToolsSettings((prev) => ({ ...(prev ?? {}), [key]: value }));
    setToolsSaveSuccess(false);
  };

  const handleToolsSave = async () => {
    if (!uid || !toolsSettings || isSavingTools || !toolsDirty) return;
    try {
      setIsSavingTools(true);
      setToolsSaveError(null);
      await saveUserToolsSettings(uid, toolsSettings);
      setInitialToolsSettings(toolsSettings);
      setToolsSaveSuccess(true);
    } catch (error) {
      setToolsSaveError(t("account.tools.save.error", "Could not save settings. Please try again."));
    } finally {
      setIsSavingTools(false);
    }
  };

  const renderSettingsTab = () => (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t("account.settings.title", "Settings")}</h2>
      <p className={styles.cardSubtitle}>{t("account.settings.subtitle", "Configure your personal preferences.")}</p>

      {settingsLoading && (
        <p className={styles.helperText}>{t("account.settings.loading", "Loading settings...")}</p>
      )}

      {settingsError && (
        <div className={styles.feedbackError}>
          <p>{settingsError}</p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              if (uid) {
                setSettingsError(null);
                setSaveSuccess(false);
                setSettingsLoading(true);
                getUserSettings(uid)
                  .then((remote) => {
                    const merged = remote ? { ...defaultSettings, ...remote } : defaultSettings;
                    setSettings(merged);
                    setLoadedSettings(merged);
                  })
                  .catch(() => {
                    setSettingsError(t("account.settings.error", "Could not load settings."));
                  })
                  .finally(() => setSettingsLoading(false));
              }
            }}
          >
            {t("account.settings.retry", "Retry")}
          </button>
        </div>
      )}

      {settings && !settingsLoading && (
        <div className={styles.settingsForm}>
          <div className={styles.formRow}>
            <label className={styles.nameLabel} htmlFor="settings-language">
              {t("account.settings.language.label", "Preferred language")}
            </label>
            <select
              id="settings-language"
              className={styles.selectInput}
              value={settings.language ?? defaultSettings.language}
              onChange={(event) => handleSettingsChange("language", event.target.value as UserSettings["language"])}
            >
              <option value="en">{t("topbar.lang_en", "English")}</option>
              <option value="de">{t("topbar.lang_de", "Deutsch")}</option>
            </select>
          </div>

          <div className={styles.formRow}>
            <label className={styles.nameLabel} htmlFor="settings-section">
              {t("account.settings.defaultSection.label", "Default section")}
            </label>
            <select
              id="settings-section"
              className={styles.selectInput}
              value={settings.defaultSection ?? defaultSettings.defaultSection}
              onChange={(event) =>
                handleSettingsChange("defaultSection", event.target.value as UserSettings["defaultSection"])
              }
            >
              <option value="home">{t("nav.home", "Home")}</option>
              <option value="toplists">{t("nav.toplists", "Top Lists")}</option>
              <option value="guilds">{t("nav.guilds", "Guilds")}</option>
              <option value="tools">{t("nav.tools", "Tools")}</option>
              <option value="community">{t("nav.community", "Community")}</option>
            </select>
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={Boolean(settings.compactTables)}
              onChange={(event) => handleSettingsChange("compactTables", event.target.checked)}
            />
            <span>{t("account.settings.compactTables.label", "Use compact table layout")}</span>
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={Boolean(settings.showExperimentalFeatures)}
              onChange={(event) => handleSettingsChange("showExperimentalFeatures", event.target.checked)}
            />
            <span>{t("account.settings.experimental.label", "Enable experimental features")}</span>
          </label>
        </div>
      )}

      <div className={styles.settingsFooter}>
        <div className={styles.inlineStatus}>
          {saveSuccess ? (
            <span className={styles.feedbackSuccess}>{t("account.settings.saved", "Settings saved.")}</span>
          ) : !settingsDirty ? (
            <span className={styles.helperText}>{t("account.settings.noChanges", "No changes to save.")}</span>
          ) : null}
          {savingSettings && (
            <span className={styles.helperText}>{t("account.settings.saving", "Saving...")}</span>
          )}
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!settingsDirty || savingSettings || !settings}
          onClick={handleSettingsSave}
        >
          {t("account.settings.save", "Save settings")}
        </button>
      </div>
    </section>
  );

  const renderTabs = () => {
    const tabs: { key: TabKey; label: string }[] = [
      { key: "overview", label: t("account.tabs.overview", "Overview") },
      { key: "settings", label: t("account.tabs.settings", "Settings") },
      { key: "tools", label: t("account.tabs.tools", "Tools") },
      { key: "connected-characters", label: t("account.tabs.connectedCharacters", "Connected characters") },
    ];

    return (
      <div className={styles.tabs} role="tablist" aria-label="Account sections">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={isActive}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderTabContent = () => {
    if (!user) return null;

    switch (activeTab) {
      case "overview":
        return (
          <>
            <IdentityCard
              user={user}
              refreshSession={refreshSession}
            />
            {renderServicesCard()}
            {renderSecurityCard()}
          </>
        );
      case "settings":
        return renderSettingsTab();
      case "tools":
        return (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("account.tools.title", "Tools settings")}</h2>
            <p className={styles.cardSubtitle}>
              {t("account.tools.subtitle", "Configure how tools behave for your account.")}
            </p>
            {isLoadingTools && (
              <p className={styles.helperText}>{t("account.tools.loading", "Loading tools settings...")}</p>
            )}
            {toolsSaveError && (
              <p className={styles.feedbackError}>{toolsSaveError}</p>
            )}
            {toolsSettings && !isLoadingTools && (
              <>
                <div className={styles.settingsForm}>
                  <div className={styles.formRow}>
                    <label className={styles.nameLabel} htmlFor="tools-default-set">
                      {t("account.tools.defaultSet.label", "Default set ID")}
                    </label>
                    <input
                      id="tools-default-set"
                      type="text"
                      className={styles.nameInput}
                      value={toolsSettings.defaultSetId ?? ""}
                      onChange={(event) => handleToolsSettingsChange("defaultSetId", event.target.value)}
                      placeholder={t("account.tools.defaultSet.placeholder", "Enter a default set ID")}
                    />
                  </div>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={Boolean(toolsSettings.showToolsIntro)}
                      onChange={(event) => handleToolsSettingsChange("showToolsIntro", event.target.checked)}
                    />
                    <span>{t("account.tools.showIntro.label", "Show tools intro")}</span>
                  </label>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={Boolean(toolsSettings.enableExperimentalTools)}
                      onChange={(event) => handleToolsSettingsChange("enableExperimentalTools", event.target.checked)}
                    />
                    <span>{t("account.tools.experimental.label", "Enable experimental tools")}</span>
                  </label>
                </div>
                <div className={styles.settingsFooter}>
                  <div className={styles.inlineStatus}>
                    {toolsSaveSuccess ? (
                      <span className={styles.feedbackSuccess}>{t("account.tools.save.success", "Settings saved.")}</span>
                    ) : !toolsDirty ? (
                      <span className={styles.helperText}>{t("account.tools.save.noChanges", "No changes to save.")}</span>
                    ) : null}
                    {isSavingTools && (
                      <span className={styles.helperText}>{t("account.tools.save.saving", "Saving...")}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={isLoadingTools || isSavingTools || !toolsDirty || !toolsSettings}
                    onClick={handleToolsSave}
                  >
                    {t("account.tools.save.cta", "Save settings")}
                  </button>
                </div>
              </>
            )}
          </section>
        );
      case "connected-characters":
        return (
          <AccountConnectedCharactersTab
            user={user}
            refreshSession={refreshSession}
          />
        );
      default:
        return null;
    }
  };

  const renderContent = () => {
    if (isLoading) return renderLoading();
    if (!isAuthed) return renderUnauthed();

    return (
      <>
        {renderTabs()}
        {renderTabContent()}
      </>
    );
  };

  return (
    <ContentShell
      title="Account & Profile"
      subtitle="Manage your SFDataHub identity and connected services."
      centerFramed
    >
      <div className={styles.page}>
        {renderLinkFeedback()}
        {renderContent()}
      </div>
    </ContentShell>
  );
};

export default AccountSettingsPage;

type IdentityCardProps = {
  user: ReturnType<typeof useAuth>["user"];
  refreshSession: ReturnType<typeof useAuth>["refreshSession"];
};

function IdentityCard({ user, refreshSession }: IdentityCardProps) {
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
      ? `Name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`
      : null;

  useEffect(() => {
    setNameDraft(user?.displayName ?? "");
    setSuccess(false);
    setError(null);
  }, [user?.id, user?.displayName]);

  const metaItems = useMemo(() => {
    if (!user) return [];
    return [
      { label: "SFDataHub ID", value: user.id },
      user.roles?.length ? { label: "Roles", value: user.roles.join(", ") } : null,
      user.createdAt ? { label: "Created at", value: formatTimestamp(user.createdAt) } : null,
      user.lastLoginAt ? { label: "Last login", value: formatTimestamp(user.lastLoginAt) } : null,
    ].filter((entry): entry is { label: string; value: string } => Boolean(entry?.value));
  }, [user]);

  const handleNameSave = async () => {
    if (!canSave || !PROFILE_ENDPOINT) {
      if (!PROFILE_ENDPOINT) {
        setError("Auth service is not configured.");
      }
      return;
    }

    try {
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

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to update name.");
      }

      await refreshSession();
      setSuccess(true);
      setNameDraft(trimmedName);
    } catch (updateError: any) {
      const message = updateError?.message ?? "Failed to update name.";
      setError(message);
    } finally {
      setSaving(false);
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

  const handleNameBlur = () => {
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
          <p className={styles.identityName}>{user.displayName || "Unbenannter Nutzer"}</p>
          <p className={styles.identityProvider}>{providerLabel} sign-in</p>
        </div>
        <span className={styles.statusBadge}>Verified</span>
      </div>
      <div className={styles.identityForm}>
        <div className={styles.nameInputWrap}>
          <label className={styles.nameLabel}>Display name</label>
          <input
            type="text"
            className={styles.nameInput}
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameBlur}
            placeholder="Enter your display name"
          />
        </div>
        <button
          type="button"
          className={styles.nameSaveButton}
          disabled={!canSave}
          onClick={handleNameSave}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {validationMessage && <p className={styles.feedbackError}>{validationMessage}</p>}
      {error && <p className={styles.feedbackError}>{error}</p>}
      {success && <p className={styles.feedbackSuccess}>Name updated.</p>}
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
