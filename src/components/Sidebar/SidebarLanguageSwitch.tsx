import React from "react";
import { useTranslation } from "react-i18next";

import { useLocalePreferences } from "../../context/LocalePreferencesContext";
import {
  getLocaleOption,
  PRIMARY_LOCALE,
} from "../../lib/i18n/localePreferences";
import styles from "./Sidebar.module.css";

interface SidebarLanguageSwitchProps {
  className?: string;
}

export default function SidebarLanguageSwitch({ className }: SidebarLanguageSwitchProps) {
  const { t } = useTranslation();
  const {
    activeLocale,
    preferredSecondaryLocale,
    setActiveLocale,
  } = useLocalePreferences();

  const englishOption = getLocaleOption(PRIMARY_LOCALE);
  const secondaryOption = getLocaleOption(preferredSecondaryLocale);

  const secondaryLabel = t(secondaryOption.labelKey, {
    defaultValue: secondaryOption.defaultLabel,
  });

  const secondaryAriaLabel = secondaryOption.code === "de"
    ? t("sidebar.languageSwitchDe", { defaultValue: "Switch language to German" })
    : t("sidebar.languageSwitchToLocale", {
      defaultValue: "Switch language to {{language}}",
      language: secondaryLabel,
    });

  return (
    <div
      className={`${styles.languageSwitch}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={t("sidebar.languagePreference", { defaultValue: "Sidebar language preference" })}
    >
      <button
        type="button"
        className={`${styles.languageSegment} ${styles.languageSegmentEn} ${activeLocale === PRIMARY_LOCALE ? styles.languageSegmentActive : styles.languageSegmentInactive}`}
        style={{ backgroundImage: `url("${englishOption.flagAsset}")` }}
        onClick={() => void setActiveLocale(PRIMARY_LOCALE)}
        aria-pressed={activeLocale === PRIMARY_LOCALE}
        aria-label={t("sidebar.languageSwitchEn", { defaultValue: "Switch language to English" })}
      />

      <button
        type="button"
        className={`${styles.languageSegment} ${styles.languageSegmentDe} ${activeLocale === preferredSecondaryLocale ? styles.languageSegmentActive : styles.languageSegmentInactive}`}
        style={{ backgroundImage: `url("${secondaryOption.flagAsset}")` }}
        onClick={() => void setActiveLocale(preferredSecondaryLocale)}
        aria-pressed={activeLocale === preferredSecondaryLocale}
        aria-label={secondaryAriaLabel}
      />
    </div>
  );
}
