import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { youtubeMessages } from "./youtubeMessages";
import en from "./en.json";
import de from "./de.json";
import hu from "./hu.json";
import cs from "./cs.json";
import pl from "./pl.json";
import { getInitialActiveLocale } from "../lib/i18n/localePreferences";

export type Lang = "en" | "de" | "hu" | "cs" | "pl";

const resources = {
  en: { translation: { ...en, youtubeCard: youtubeMessages.en } },
  de: { translation: { ...de, youtubeCard: youtubeMessages.de } },
  hu: { translation: { ...hu, youtubeCard: youtubeMessages.hu } },
  cs: { translation: { ...cs, youtubeCard: youtubeMessages.cs } },
  pl: { translation: { ...pl, youtubeCard: youtubeMessages.pl } },
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
