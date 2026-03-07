import React from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useLocalePreferences } from "../../context/LocalePreferencesContext";
import { useBackClose } from "../../hooks/useBackClose";
import { type LocaleCode } from "../../lib/i18n/localePreferences";
import styles from "./Topbar.module.css";

type LanguageSettingsOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

type UnavailableLanguageOption = {
  id: "nl" | "pl" | "fr";
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
    id: "pl",
    label: "Polish (unavailable)",
    flagAsset: "/assets/flags/Flag_of_Poland.svg.png",
  },
  {
    id: "fr",
    label: "French (unavailable)",
    flagAsset: "/assets/flags/Flag_of_France.svg.webp",
  },
];

const LanguageSettingsOverlay: React.FC<LanguageSettingsOverlayProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const {
    activeLocale,
    localeOptions,
    isPersisting,
    applySettingsLocaleSelection,
  } = useLocalePreferences();
  const [error, setError] = React.useState<string | null>(null);

  useBackClose(isOpen, onClose);

  React.useEffect(() => {
    if (!isOpen) {
      setError(null);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleLocaleSelect = React.useCallback(async (locale: LocaleCode) => {
    setError(null);
    try {
      await applySettingsLocaleSelection(locale);
    } catch (selectionError) {
      console.error("[LanguageSettingsOverlay] Failed to persist locale", selectionError);
      setError(t("account.menu.languageSaveError", "Could not save language settings."));
    }
  }, [applySettingsLocaleSelection, t]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.settingsOverlayBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t("account.menu.languageSettingsTitle", "Settings")}
      onClick={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div className={styles.settingsOverlayPanel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.settingsOverlayHeader}>
          <div>
            <h2 className={styles.settingsOverlayTitle}>
              {t("account.menu.languageSettingsTitle", "Settings")}
            </h2>
            <p className={styles.settingsOverlaySubtitle}>
              {t("account.menu.languageSettingsSubtitle", "Choose your interface language.")}
            </p>
          </div>
          <button
            type="button"
            className={styles.settingsOverlayClose}
            onClick={onClose}
            aria-label={t("account.menu.closeLanguageSettings", "Close settings")}
            title={t("account.menu.closeLanguageSettings", "Close settings")}
          >
            <X className={styles.ico} />
            <span className={styles.settingsOverlayCloseLabel}>
              {t("account.menu.closeLanguageSettings", "Close settings")}
            </span>
          </button>
        </div>

        <div className={styles.settingsOverlaySection}>
          <p className={styles.settingsOverlayLabel}>
            {t("account.menu.languageFieldLabel", "Language")}
          </p>
          <div className={styles.settingsOverlayOptions} role="radiogroup" aria-live="polite">
            {localeOptions.map((option) => {
              const isActive = option.code === activeLocale;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={`${styles.settingsOverlayOption} ${isActive ? styles.settingsOverlayOptionActive : ""}`}
                  onClick={() => void handleLocaleSelect(option.code)}
                  disabled={isPersisting}
                >
                  <span
                    className={styles.settingsOverlayFlag}
                    style={{ backgroundImage: `url("${option.flagAsset}")` }}
                    aria-hidden="true"
                  />
                  <span className={styles.settingsOverlayOptionLabel}>
                    {t(option.labelKey, { defaultValue: option.defaultLabel })}
                  </span>
                  {isActive ? (
                    <span className={styles.settingsOverlayOptionCheck} aria-hidden="true">
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
                className={`${styles.settingsOverlayOption} ${styles.settingsOverlayOptionDisabled}`}
                disabled
                aria-disabled="true"
              >
                <span
                  className={styles.settingsOverlayFlag}
                  style={{ backgroundImage: `url("${option.flagAsset}")` }}
                  aria-hidden="true"
                />
                <span className={styles.settingsOverlayOptionLabel}>{option.label}</span>
              </button>
            ))}
          </div>
          {isPersisting ? (
            <p className={styles.settingsOverlayHint}>
              {t("account.menu.languageSaving", "Saving language settings...")}
            </p>
          ) : null}
          {error ? <p className={styles.settingsOverlayError}>{error}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LanguageSettingsOverlay;
