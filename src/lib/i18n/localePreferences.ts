export const SUPPORTED_LOCALE_OPTIONS = [
  {
    code: "en",
    labelKey: "topbar.lang_en",
    defaultLabel: "English",
    flagAsset: "/assets/flags/Flag_of_the_United_Kingdom_(3-5).svg.png",
  },
  {
    code: "de",
    labelKey: "topbar.lang_de",
    defaultLabel: "Deutsch",
    flagAsset: "/assets/flags/Flag_of_Germany.svg.png",
  },
  {
    code: "hu",
    labelKey: "topbar.lang_hu",
    defaultLabel: "Hungarian",
    flagAsset: "/assets/flags/Flag_of_Hungary.svg.png",
  },
  {
    code: "cs",
    labelKey: "topbar.lang_cs",
    defaultLabel: "Czech",
    flagAsset: "/assets/flags/Flag_of_the_Czech_Republic.svg.png",
  },
] as const;

export type LocaleOption = (typeof SUPPORTED_LOCALE_OPTIONS)[number];
export type LocaleCode = LocaleOption["code"];

export type LocalePreferenceState = {
  activeLocale: LocaleCode;
  preferredSecondaryLocale: LocaleCode;
};

export const PRIMARY_LOCALE: LocaleCode = "en";

const secondaryFallbackOption = SUPPORTED_LOCALE_OPTIONS.find(
  (option) => option.code !== PRIMARY_LOCALE,
);

export const DEFAULT_SECONDARY_LOCALE: LocaleCode =
  (secondaryFallbackOption?.code ?? PRIMARY_LOCALE) as LocaleCode;

export const LEGACY_LANGUAGE_STORAGE_KEY = "sf_lang";
export const ACTIVE_LOCALE_STORAGE_KEY = "sfh:locale:active";
export const SECONDARY_LOCALE_STORAGE_KEY = "sfh:locale:secondary";

const SUPPORTED_CODES = SUPPORTED_LOCALE_OPTIONS.map((option) => option.code);

export const normalizeLocale = (value?: string | null): LocaleCode | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  for (const code of SUPPORTED_CODES) {
    if (normalized === code || normalized.startsWith(`${code}-`)) {
      return code;
    }
  }

  return null;
};

export const toActiveLocale = (
  value?: string | null,
  fallback: LocaleCode = PRIMARY_LOCALE,
): LocaleCode => normalizeLocale(value) ?? fallback;

export const ensurePreferredSecondaryLocale = (
  value?: string | null,
  activeFallback?: LocaleCode,
): LocaleCode => {
  const normalized = normalizeLocale(value);
  if (normalized && normalized !== PRIMARY_LOCALE) {
    return normalized;
  }

  if (activeFallback && activeFallback !== PRIMARY_LOCALE) {
    return activeFallback;
  }

  return DEFAULT_SECONDARY_LOCALE;
};

export const normalizeLocalePreferenceState = (
  value?: Partial<LocalePreferenceState> | null,
  fallback?: Partial<LocalePreferenceState> | null,
): LocalePreferenceState => {
  const fallbackActive = toActiveLocale(fallback?.activeLocale, PRIMARY_LOCALE);
  const activeLocale = toActiveLocale(value?.activeLocale, fallbackActive);
  const preferredSecondaryLocale = ensurePreferredSecondaryLocale(
    value?.preferredSecondaryLocale ?? fallback?.preferredSecondaryLocale,
    activeLocale !== PRIMARY_LOCALE ? activeLocale : undefined,
  );

  return {
    activeLocale,
    preferredSecondaryLocale,
  };
};

export const deriveLocaleStateFromSelection = (
  selectedLocale: string | LocaleCode,
  previousSecondaryLocale?: string | LocaleCode | null,
): LocalePreferenceState => {
  const nextActiveLocale = toActiveLocale(selectedLocale, PRIMARY_LOCALE);

  if (nextActiveLocale !== PRIMARY_LOCALE) {
    return {
      activeLocale: nextActiveLocale,
      preferredSecondaryLocale: nextActiveLocale,
    };
  }

  return {
    activeLocale: PRIMARY_LOCALE,
    preferredSecondaryLocale: ensurePreferredSecondaryLocale(previousSecondaryLocale),
  };
};

const readStorageValue = (key: string): string | null => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("[LocalePrefs] Failed to read localStorage", { key, error });
    return null;
  }
};

export const readLocaleStateFromLocalStorage = (
  fallbackActiveLocale?: string | null,
): LocalePreferenceState => {
  const fallbackActive = toActiveLocale(fallbackActiveLocale, PRIMARY_LOCALE);

  const storedActive =
    readStorageValue(ACTIVE_LOCALE_STORAGE_KEY)
    ?? readStorageValue(LEGACY_LANGUAGE_STORAGE_KEY);

  const activeLocale = toActiveLocale(storedActive, fallbackActive);
  const storedSecondary = readStorageValue(SECONDARY_LOCALE_STORAGE_KEY);

  return normalizeLocalePreferenceState(
    {
      activeLocale,
      preferredSecondaryLocale:
        storedSecondary
        ?? (activeLocale !== PRIMARY_LOCALE ? activeLocale : undefined),
    },
    { activeLocale: fallbackActive },
  );
};

export const writeLocaleStateToLocalStorage = (
  value: LocalePreferenceState,
): void => {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    window.localStorage.setItem(ACTIVE_LOCALE_STORAGE_KEY, value.activeLocale);
    window.localStorage.setItem(SECONDARY_LOCALE_STORAGE_KEY, value.preferredSecondaryLocale);
    window.localStorage.setItem(LEGACY_LANGUAGE_STORAGE_KEY, value.activeLocale);
  } catch (error) {
    console.warn("[LocalePrefs] Failed to write localStorage", error);
  }
};

export const hasRemoteLocaleSettings = (value?: {
  language?: string | null;
  preferredSecondaryLocale?: string | null;
} | null): boolean => {
  return Boolean(
    normalizeLocale(value?.language)
    || normalizeLocale(value?.preferredSecondaryLocale),
  );
};

export const mergeRemoteLocaleState = (
  value: {
    language?: string | null;
    preferredSecondaryLocale?: string | null;
  } | null | undefined,
  fallbackState: LocalePreferenceState,
): LocalePreferenceState => {
  const remoteLanguage = normalizeLocale(value?.language);
  const remoteSecondary = normalizeLocale(value?.preferredSecondaryLocale);

  const activeLocale = toActiveLocale(
    remoteLanguage ?? fallbackState.activeLocale,
    fallbackState.activeLocale,
  );

  const preferredSecondaryLocale = ensurePreferredSecondaryLocale(
    remoteSecondary
      ?? (activeLocale !== PRIMARY_LOCALE ? activeLocale : fallbackState.preferredSecondaryLocale),
    activeLocale,
  );

  return {
    activeLocale,
    preferredSecondaryLocale,
  };
};

export const getLocaleOption = (code: LocaleCode): LocaleOption => {
  const option = SUPPORTED_LOCALE_OPTIONS.find((entry) => entry.code === code);
  return option ?? SUPPORTED_LOCALE_OPTIONS[0];
};

export const getInitialActiveLocale = (): LocaleCode => {
  return readLocaleStateFromLocalStorage(PRIMARY_LOCALE).activeLocale;
};
