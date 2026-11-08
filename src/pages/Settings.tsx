import { trackLocalEvent } from "../lib/analytics/localEvents";
import ToplistColumnSettings from "./Settings/ToplistColumnSettings";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ContentShell from "../components/ContentShell";
import { preferencesStore, GUILD_PROFILE_MODES, type GuildProfileMode, type NavigationMode, type AttributeSumMode } from "../lib/settings/preferences";
import { usePreferencesSnapshot } from "../lib/settings/usePreferences";
import styles from "./Settings/LocalSettings.module.css";

export const PROFILE_SETTINGS_URL = "/settings?tab=datahub&section=profiles";

/** Shell identity and scroll containers do not depend on the inner form draft. */
export default function SettingsIndex() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const tab = params.get("tab") === "datahub" ? "datahub" : "general";
  const section = params.get("section") === "profiles" ? "profiles" : "toplists";
  function selectionUrl(nextTab: "general" | "datahub", nextSection = "toplists") {
    const next = new URLSearchParams(params);
    next.set("tab", nextTab);
    if (nextTab === "datahub") next.set("section", nextSection);
    else next.delete("section");
    return `/settings?${next}`;
  }
  return (
    <ContentShell title={t("localSettings.title")} centerFramed
      subheader={<nav aria-label={t("localSettings.topics")} className={styles.tabs}>
        <Link to={selectionUrl("general")} aria-current={tab === "general" ? "page" : undefined}>{t("localSettings.general")}</Link>
        <Link to={selectionUrl("datahub")} aria-current={tab === "datahub" ? "page" : undefined}>{t("localSettings.dataHub")}</Link>
      </nav>}>
      <ProfilePreferences tab={tab} section={section} toplistsUrl={selectionUrl("datahub")} profilesUrl={selectionUrl("datahub", "profiles")} />
    </ContentShell>
  );
}

function ProfilePreferences({ tab, section, toplistsUrl, profilesUrl }: {
  tab: "general" | "datahub"; section: "toplists" | "profiles"; toplistsUrl: string; profilesUrl: string;
}) {
  const { t } = useTranslation();
  const stored = usePreferencesSnapshot();
  const [basis, setBasis] = useState(stored);
  const [draft, setDraft] = useState<AttributeSumMode>(stored.attributeSumMode);
  const [navigationDraft, setNavigationDraft] = useState<NavigationMode>(stored.navigationMode);
  const [guildProfileDraft, setGuildProfileDraft] = useState<GuildProfileMode>(stored.guildProfileMode);
  const [toplistDraft, setToplistDraft] = useState(stored.toplistViews);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<"saved" | "write-error" | null>(null);
  const invalidLists = (["players", "guilds"] as const).filter(kind => toplistDraft[kind].views.some(view => !view.name.trim()));
  const invalidViewNames = invalidLists.length > 0;
  const toplistsDirty = JSON.stringify(toplistDraft) !== JSON.stringify(basis.toplistViews);
  const dirty = toplistsDirty || draft !== basis.attributeSumMode || navigationDraft !== basis.navigationMode || guildProfileDraft !== basis.guildProfileMode;

  useEffect(() => {
    if (stored === basis) return;
    if (dirty) {
      if (stored.raw !== basis.raw) { setConflict(true); setMessage(null); }
    } else {
      setBasis(stored);
      setDraft(stored.attributeSumMode);
      setNavigationDraft(stored.navigationMode);
      setGuildProfileDraft(stored.guildProfileMode); setToplistDraft(stored.toplistViews);
      setConflict(false);
      setMessage(null);
    }
  }, [stored, basis, dirty]);

  function loadCurrent() {
    const current = preferencesStore.refresh();
    setGuildProfileDraft(current.guildProfileMode); setToplistDraft(current.toplistViews); setBasis(current); setDraft(current.attributeSumMode); setNavigationDraft(current.navigationMode); setConflict(false); setMessage(null);
  }
  function save() {
    if (invalidViewNames) return;
    const result = preferencesStore.savePreferences({
      ...(toplistsDirty ? { toplistViews: toplistDraft } : {}),
      ...(draft !== basis.attributeSumMode ? { attributeSumMode: draft } : {}),
      ...(navigationDraft !== basis.navigationMode ? { navigationMode: navigationDraft } : {}),
      ...(guildProfileDraft !== basis.guildProfileMode ? { guildProfileMode: guildProfileDraft } : {}),
    }, basis);
    if (result.status === "saved" || result.status === "unchanged") {
      setGuildProfileDraft(result.snapshot.guildProfileMode); setToplistDraft(result.snapshot.toplistViews); setBasis(result.snapshot); setDraft(result.snapshot.attributeSumMode); setNavigationDraft(result.snapshot.navigationMode); setConflict(false);
      if (result.status === "saved") trackLocalEvent("datahub/settings/save-success");
      setMessage(result.status === "saved" ? "saved" : null);
    } else if (result.status === "conflict") { setConflict(true); setMessage(null); }
    else if (result.status === "write-error") setMessage("write-error");
  }
  const blocked = stored.status === "incompatible" || stored.status === "read-error";
  return (
    <div className={styles.content}>
      {tab === "datahub" && <nav aria-label={t("localSettings.dataHubSections")} className={`${styles.tabs} ${styles.subtabs}`}>
        <Link to={toplistsUrl} aria-current={section === "toplists" ? "page" : undefined}>{t("localSettings.toplists.title")}</Link>
        <Link to={profilesUrl} aria-current={section === "profiles" ? "page" : undefined}>{t("localSettings.profiles")}</Link>
      </nav>}
      <form noValidate aria-describedby="settings-actions-help" onSubmit={event => { event.preventDefault(); if (dirty && !blocked && !conflict) save(); }}>
        {tab === "general" && <section className={styles.panel} aria-labelledby="general-settings-heading">
          <h2 id="general-settings-heading">{t("localSettings.general")}</h2>
          <fieldset aria-describedby="navigation-help">
            <legend>{t("localSettings.navigation")}</legend>
            <p id="navigation-help">{t("localSettings.navigationHelp")}</p>
            {(["burger", "sidebar"] as const).map(mode => (
              <label key={mode} className={styles.option}>
                <input type="radio" name="navigationMode" value={mode} checked={navigationDraft === mode}
                  onChange={() => { setNavigationDraft(mode); setMessage(null); }} />
                <span><strong>{t(`localSettings.navigationModes.${mode}.label`)}</strong>
                  <span className={styles.help}>{t(`localSettings.navigationModes.${mode}.help`)}</span></span>
              </label>
            ))}
          </fieldset>
        </section>}
        {tab === "datahub" && section === "toplists" && <section className={styles.panel}><h2>{t("localSettings.toplists.title")}</h2>
          {(["players", "guilds"] as const).map(kind => <ToplistColumnSettings key={kind} kind={kind} value={toplistDraft[kind]} onChange={value => { setToplistDraft(previous => ({ ...previous, [kind]: value })); setMessage(null); }} />)}
        </section>}
        {tab === "datahub" && section === "profiles" && <>
        <h1 className={styles.profileHeading}>{t("localSettings.profiles")}</h1>
        <section className={styles.panel} aria-labelledby="attribute-sums-heading">
          <h2 id="attribute-sums-heading">{t("localSettings.attributeSums")}</h2>
          <p id="profile-sums-help">{t("localSettings.scope")}</p>
          <fieldset aria-describedby="profile-sums-help profile-sums-local profile-sums-pending">
            <legend>{t("localSettings.field")}</legend>
            {(["main-con", "all-five"] as const).map(mode => (
              <label key={mode} className={styles.option}>
                <input type="radio" name="attributeSumMode" value={mode} checked={draft === mode}
                  onChange={() => { setDraft(mode); setMessage(null); }} />
                <span><strong>{t(`localSettings.modes.${mode}.label`)}</strong>
                  <span className={styles.help}>{t(`localSettings.modes.${mode}.help`)}</span></span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>{t("localSettings.guildProfileView")}</legend>
            {GUILD_PROFILE_MODES.map(mode => (
              <label key={mode} className={styles.option}>
                <input type="radio" name="guildProfileMode" value={mode} checked={guildProfileDraft === mode}
                  onChange={() => { setGuildProfileDraft(mode); setMessage(null); }} />
                <span><strong>{t(`localSettings.guildProfileModes.${mode}`)}</strong></span>
              </label>
            ))}
          </fieldset>
          <p id="profile-sums-local">{t("localSettings.local")}</p>
          <p id="profile-sums-pending" className={styles.notice}>{t("localSettings.pending")}</p>
        </section>
        </>}
        <div className={styles.actionBar}>
          <p id="settings-actions-help">{t("localSettings.actionsScope")}</p>
          {stored.status === "invalid" && <p role="status">{t("localSettings.invalid")}</p>}
          {stored.status === "incompatible" && <p role="alert">{t("localSettings.incompatible")}</p>}
          {stored.status === "read-error" && <div role="alert"><p>{t("localSettings.readError")}</p>
            <button type="button" onClick={loadCurrent}>{t("localSettings.retryRead")}</button></div>}
          {conflict && <div role="alert" className={styles.notice}><p>{t("localSettings.conflict")}</p>
            <button type="button" onClick={loadCurrent}>{t("localSettings.loadCurrent")}</button></div>}
          {message === "write-error" && <p role="alert">{t("localSettings.writeError")}</p>}
          {invalidViewNames && <div role="alert" className={styles.notice}>
            <p>{t("localSettings.invalidToplistNames", { lists: invalidLists.map(kind => t(`localSettings.toplists.${kind}`)).join(", ") })}</p>
            <Link to={toplistsUrl}>{t("localSettings.openToplists")}</Link>
          </div>}
          <div className={styles.actions}>
            <button type="submit" disabled={!dirty || blocked || conflict || invalidViewNames}>{t("localSettings.save")}</button>
            <button type="button" disabled={!dirty && !conflict} onClick={loadCurrent}>{t("localSettings.discard")}</button>
          </div>
          <div role="status" aria-live="polite">{message === "saved" ? t("localSettings.saved") : ""}</div>
        </div>
      </form>
    </div>
  );
}
