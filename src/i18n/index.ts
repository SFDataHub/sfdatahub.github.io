import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { youtubeMessages } from "./youtubeMessages";
import { creatorDirectoryMessages } from "./creatorDirectoryMessages";
import en from "./en.json";
import de from "./de.json";
import hu from "./hu.json";
import cs from "./cs.json";
import pl from "./pl.json";
import { getInitialActiveLocale } from "../lib/i18n/localePreferences";

export type Lang = "en" | "de" | "hu" | "cs" | "pl";

const resources = {
  en: { translation: { ...en, youtubeCard: youtubeMessages.en, creatorDirectory: creatorDirectoryMessages.en } },
  de: { translation: { ...de, youtubeCard: youtubeMessages.de, creatorDirectory: creatorDirectoryMessages.de } },
  hu: { translation: { ...hu, youtubeCard: youtubeMessages.hu, creatorDirectory: creatorDirectoryMessages.hu } },
  cs: { translation: { ...cs, youtubeCard: youtubeMessages.cs, creatorDirectory: creatorDirectoryMessages.cs } },
  pl: { translation: { ...pl, youtubeCard: youtubeMessages.pl, creatorDirectory: creatorDirectoryMessages.pl } },
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
