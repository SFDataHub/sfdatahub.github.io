import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import de from "./de.json";

export type Lang = "en" | "de";

const resources = {
  en: { translation: en },
  de: { translation: de },
};

i18next
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    lng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18next;

export function t(key: string, lang: Lang = "en") {
  return i18next.t(key, { lng: lang });
}
