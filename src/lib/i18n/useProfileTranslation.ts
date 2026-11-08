import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { profileTranslationOptions } from "./profilePresentation";

/** Locale changes update presentation, without making language a data dependency. */
export function useProfileTranslation() {
  const translation = useTranslation();
  const { t: base, i18n } = translation;
  const t = useMemo(() => ((key: string, options?: Record<string, unknown> | string) =>
    base(key, profileTranslationOptions(typeof options === "string" ? { defaultValue: options } : options ?? {}))) as typeof base,
    [base, i18n.resolvedLanguage]);
  return { ...translation, t };
}
