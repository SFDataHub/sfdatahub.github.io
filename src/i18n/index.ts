import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import de from "./de.json";
import hu from "./hu.json";
import cs from "./cs.json";
import { getInitialActiveLocale } from "../lib/i18n/localePreferences";

export type Lang = "en" | "de" | "hu" | "cs";

const resources = {
  en: { translation: en },
  de: { translation: de },
  hu: { translation: hu },
  cs: { translation: cs },
};

i18next
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    lng: getInitialActiveLocale(),
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18next;

export function t(key: string, lang: Lang = "en") {
  return i18next.t(key, { lng: lang });
}
