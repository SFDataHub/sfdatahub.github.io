import React from "react";

import i18n from "../i18n";
import { useAuth } from "./AuthContext";
import { getUserSettings, updateUserSettings } from "../lib/user/settings";
import {
  DEFAULT_SECONDARY_LOCALE,
  deriveLocaleStateFromSelection,
  hasRemoteLocaleSettings,
  mergeRemoteLocaleState,
  normalizeLocalePreferenceState,
  PRIMARY_LOCALE,
  readLocaleStateFromLocalStorage,
  SUPPORTED_LOCALE_OPTIONS,
  type LocaleCode,
  type LocaleOption,
  type LocalePreferenceState,
  writeLocaleStateToLocalStorage,
} from "../lib/i18n/localePreferences";

type PersistOptions = {
  persist?: boolean;
};

type LocalePreferencesContextValue = {
  activeLocale: LocaleCode;
  preferredSecondaryLocale: LocaleCode;
  localeOptions: readonly LocaleOption[];
  isHydrating: boolean;
  isPersisting: boolean;
  setActiveLocale: (
    locale: LocaleCode,
    options?: PersistOptions,
  ) => Promise<LocalePreferenceState>;
  applySettingsLocaleSelection: (
    locale: LocaleCode,
    options?: PersistOptions,
  ) => Promise<LocalePreferenceState>;
};

const LocalePreferencesContext = React.createContext<LocalePreferencesContextValue | undefined>(
  undefined,
);

const INITIAL_LOCALE_STATE = readLocaleStateFromLocalStorage(i18n.language);

export const LocalePreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user } = useAuth();
  const userId = status === "authenticated" ? user?.id ?? null : null;
  const isAuthenticated = status === "authenticated" && !!userId;

  const [localeState, setLocaleState] = React.useState<LocalePreferenceState>(INITIAL_LOCALE_STATE);
  const [isHydrating, setIsHydrating] = React.useState(false);
  const [isPersisting, setIsPersisting] = React.useState(false);

  const localeStateRef = React.useRef(localeState);
  const pendingWritesRef = React.useRef(0);

  React.useEffect(() => {
    localeStateRef.current = localeState;
  }, [localeState]);

  const withWriteTracker = React.useCallback(async (task: () => Promise<void>) => {
    pendingWritesRef.current += 1;
    setIsPersisting(true);

    try {
      await task();
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      if (pendingWritesRef.current === 0) {
        setIsPersisting(false);
      }
    }
  }, []);

  const applyLocaleState = React.useCallback(async (
    nextStateInput: Partial<LocalePreferenceState> | LocalePreferenceState,
    options?: PersistOptions & { persistUserId?: string | null },
  ): Promise<LocalePreferenceState> => {
    const fallbackState = localeStateRef.current;
    const nextState = normalizeLocalePreferenceState(nextStateInput, fallbackState);

    localeStateRef.current = nextState;
    setLocaleState(nextState);
    writeLocaleStateToLocalStorage(nextState);

    if (i18n.language !== nextState.activeLocale) {
      await i18n.changeLanguage(nextState.activeLocale);
    }

    const shouldPersist = options?.persist ?? true;
    const persistUserId = options?.persistUserId ?? (isAuthenticated ? userId : null);

    if (shouldPersist && persistUserId) {
      await withWriteTracker(async () => {
        await updateUserSettings(persistUserId, {
          language: nextState.activeLocale,
          preferredSecondaryLocale: nextState.preferredSecondaryLocale,
        });
      });
    }

    return nextState;
  }, [isAuthenticated, userId, withWriteTracker]);

  React.useEffect(() => {
    if (!isAuthenticated || !userId) {
      setIsHydrating(false);
      return;
    }

    let cancelled = false;

    const syncFromRemote = async () => {
      setIsHydrating(true);

      const localState = readLocaleStateFromLocalStorage(localeStateRef.current.activeLocale);
      const normalizedLocal = normalizeLocalePreferenceState(localState, localeStateRef.current);

      try {
        const remoteSettings = await getUserSettings(userId);
        if (cancelled) return;

        const hasRemoteSettings = hasRemoteLocaleSettings(remoteSettings);
        const fallbackRemoteState: LocalePreferenceState = {
          activeLocale: PRIMARY_LOCALE,
          preferredSecondaryLocale: DEFAULT_SECONDARY_LOCALE,
        };

        const nextState = hasRemoteSettings
          ? mergeRemoteLocaleState(remoteSettings, fallbackRemoteState)
          : normalizedLocal;

        await applyLocaleState(nextState, {
          persist: !hasRemoteSettings,
          persistUserId: userId,
        });
      } catch (error) {
        if (!cancelled) {
          console.warn("[LocalePrefs] Failed to sync locale preferences", error);
          await applyLocaleState(normalizedLocal, { persist: false, persistUserId: null });
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    };

    void syncFromRemote();

    return () => {
      cancelled = true;
    };
  }, [applyLocaleState, isAuthenticated, userId]);

  const setActiveLocale = React.useCallback(async (
    locale: LocaleCode,
    options?: PersistOptions,
  ): Promise<LocalePreferenceState> => {
    const current = localeStateRef.current;
    const nextState = normalizeLocalePreferenceState(
      {
        activeLocale: locale,
        preferredSecondaryLocale: current.preferredSecondaryLocale,
      },
      current,
    );

    return applyLocaleState(nextState, options);
  }, [applyLocaleState]);

  const applySettingsLocaleSelection = React.useCallback(async (
    locale: LocaleCode,
    options?: PersistOptions,
  ): Promise<LocalePreferenceState> => {
    const current = localeStateRef.current;
    const nextState = deriveLocaleStateFromSelection(locale, current.preferredSecondaryLocale);
    return applyLocaleState(nextState, options);
  }, [applyLocaleState]);

  const value = React.useMemo<LocalePreferencesContextValue>(() => ({
    activeLocale: localeState.activeLocale,
    preferredSecondaryLocale: localeState.preferredSecondaryLocale,
    localeOptions: SUPPORTED_LOCALE_OPTIONS,
    isHydrating,
    isPersisting,
    setActiveLocale,
    applySettingsLocaleSelection,
  }), [
    localeState.activeLocale,
    localeState.preferredSecondaryLocale,
    isHydrating,
    isPersisting,
    setActiveLocale,
    applySettingsLocaleSelection,
  ]);

  return (
    <LocalePreferencesContext.Provider value={value}>
      {children}
    </LocalePreferencesContext.Provider>
  );
};

export const useLocalePreferences = (): LocalePreferencesContextValue => {
  const context = React.useContext(LocalePreferencesContext);
  if (!context) {
    throw new Error("useLocalePreferences must be used within LocalePreferencesProvider");
  }
  return context;
};
