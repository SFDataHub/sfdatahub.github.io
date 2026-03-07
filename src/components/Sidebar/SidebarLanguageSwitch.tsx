import React from "react";
import { useTranslation } from "react-i18next";

import styles from "./Sidebar.module.css";

type LanguageCode = "en" | "de";

const languageOptions: { code: LanguageCode; ariaLabelKey: string }[] = [
  { code: "en", ariaLabelKey: "sidebar.languageSwitchEn" },
  { code: "de", ariaLabelKey: "sidebar.languageSwitchDe" },
];

const normalizeLanguage = (value?: string): LanguageCode => (
  value?.startsWith("de") ? "de" : "en"
);

interface SidebarLanguageSwitchProps {
  className?: string;
}

export default function SidebarLanguageSwitch({ className }: SidebarLanguageSwitchProps) {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = React.useState<LanguageCode>(() => normalizeLanguage(i18n.language));

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const storedLang = window.localStorage.getItem("sf_lang");
    if (storedLang === "en" || storedLang === "de") {
      setLanguage(storedLang);
      if (i18n.language !== storedLang) {
        i18n.changeLanguage(storedLang);
      }
      return;
    }
    setLanguage(normalizeLanguage(i18n.language));
  }, [i18n]);

  React.useEffect(() => {
    setLanguage(normalizeLanguage(i18n.language));
  }, [i18n.language]);

  const handleLanguageSelect = React.useCallback((next: LanguageCode) => {
    setLanguage(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sf_lang", next);
    }
    if (i18n.language !== next) {
      i18n.changeLanguage(next);
    }
  }, [i18n]);

  return (
    <div
      className={`${styles.languageSwitch}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={t("sidebar.languagePreference", { defaultValue: "Sidebar language preference" })}
    >
      {languageOptions.map((option) => {
        const isActive = language === option.code;
        const segmentClass = `${styles.languageSegment} ${option.code === "de" ? styles.languageSegmentDe : styles.languageSegmentEn} ${isActive ? styles.languageSegmentActive : styles.languageSegmentInactive}`;
        return (
          <button
            key={option.code}
            type="button"
            className={segmentClass}
            onClick={() => handleLanguageSelect(option.code)}
            aria-pressed={isActive}
            aria-label={t(option.ariaLabelKey, { defaultValue: option.code === "de" ? "Switch language to German" : "Switch language to English" })}
          />
        );
      })}
    </div>
  );
}
