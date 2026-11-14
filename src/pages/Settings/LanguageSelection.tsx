import React from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocalePreferences } from "../../context/LocalePreferencesContext";
import { type LocaleCode } from "../../lib/i18n/localePreferences";
import styles from "./LanguageSelection.module.css";

type UnavailableLanguageOption = {
  id: "nl" | "fr";
  label: string;
  flagAsset: string;
};

const UNAVAILABLE_LANGUAGE_OPTIONS: ReadonlyArray<UnavailableLanguageOption> = [
  {
    id: "nl",
    label: "Dutch (unavailable)",
    flagAsset: "/assets/flags/Flag_of_the_Netherlands.svg",
  },
  {
    id: "fr",
    label: "French (unavailable)",
    flagAsset: "/assets/flags/Flag_of_France.svg.webp",
  },
];

/** Immediate locale preferences stay separate from the local draft form. */
export default function LanguageSelection({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();
  const { activeLocale, localeOptions, isHydrating, isPersisting, applySettingsLocaleSelection } = useLocalePreferences();
  const [error, setError] = React.useState(false);
  const selecting = React.useRef(false);
  const handleLocaleSelect = async (locale: LocaleCode) => {
    if (selecting.current || isHydrating || isPersisting || (locale === activeLocale && !error)) return;
    selecting.current = true;
    setError(false);
    try {
      await applySettingsLocaleSelection(locale);
    } catch (selectionError) {
      console.error("[LanguageSelection] Failed to persist locale", selectionError);
      setError(true);
    } finally {
      selecting.current = false;
    }
  };
  return (
    <section id="settings-language" hidden={hidden} className={styles.languageSection} aria-labelledby="settings-language-heading">
      <h2 id="settings-language-heading" className={styles.languageLabel}>{t("account.menu.languageFieldLabel")}</h2>
      <p className={styles.languageHint}>{t("localSettings.languageImmediate")}</p>
      <div className={styles.languageOptions} role="radiogroup" aria-labelledby="settings-language-heading" aria-busy={isHydrating || isPersisting} aria-live="polite">
        {localeOptions.map((option) => {
          const isActive = option.code === activeLocale;
          return (
            <button
              key={option.code}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`${styles.languageOption} ${isActive ? styles.languageOptionActive : ""}`}
              onClick={() => void handleLocaleSelect(option.code)}
              disabled={isHydrating || isPersisting}
            >
              <span
                className={styles.languageFlag}
                style={{ backgroundImage: `url("${option.flagAsset}")` }}
                aria-hidden="true"
              />
              <span className={styles.languageOptionLabel}>
                {t(option.labelKey, { defaultValue: option.defaultLabel })}
              </span>
              {isActive ? (
                <span className={styles.languageOptionCheck} aria-hidden="true">
                  <Check className={styles.ico} />
                </span>
              ) : null}
            </button>
          );
        })}
        {UNAVAILABLE_LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`${styles.languageOption} ${styles.languageOptionDisabled}`}
            disabled
            aria-disabled="true"
          >
            <span
              className={styles.languageFlag}
              style={{ backgroundImage: `url("${option.flagAsset}")` }}
              aria-hidden="true"
            />
            <span className={styles.languageOptionLabel}>{t(`topbar.unavailableLanguages.${option.id}`, option.label)}</span>
          </button>
        ))}
      </div>
      {isHydrating || isPersisting ? (
        <p className={styles.languageHint}>
          {t(isHydrating ? "account.menu.languageLoading" : "account.menu.languageSaving")}
        </p>
      ) : null}
      {error ? <p role="alert" className={styles.languageError}>{t("account.menu.languageSaveError")}</p> : null}
    </section>
  );
}
