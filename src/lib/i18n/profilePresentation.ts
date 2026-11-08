import i18next from "i18next";
import { getExactClassMeta } from "../../data/classes";
import { toScanDateTimeMs } from "../ui/formatScanDateTimeLabel";

/** Presentation only: never feed these strings back into scan/identity logic. */
export const profileLocale = () => i18next.resolvedLanguage ?? i18next.language ?? "en";
/** Keep the numeric count for plural selection; format only interpolation data. */
export function profileTranslationOptions(options: Record<string, unknown>) {
  const values = options.replace && typeof options.replace === "object" ? options.replace as Record<string, unknown> : options;
  const replace = Object.fromEntries(Object.entries(values).map(([key, value]) =>
    [key, typeof value === "number" ? profileNumber(value) : value]));
  return { ...options, replace };
}
export const profileText = (key: string, values?: Record<string, unknown>) =>
  String(i18next.t(key, profileTranslationOptions(values ?? {})));
export const profileNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(profileLocale(), options).format(value);
export const profilePercent = (percent: number, maximumFractionDigits = 0) =>
  profileNumber(percent / 100, { style: "percent", maximumFractionDigits });
export function profileDate(value: unknown, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "2-digit" }) {
  const ms = toScanDateTimeMs(value);
  return ms == null ? "—" : new Intl.DateTimeFormat(profileLocale(), options).format(new Date(ms));
}
export const profileDateTime = (value: unknown) => profileDate(value, {
  day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
});
export const profileClassLabel = (value?: string | null) => {
  const meta = getExactClassMeta(value);
  return meta ? profileText("toplists.classes." + meta.key) : value || profileText("playerProfile.heroPanel.meta.classUnknown");
};
export const profileRoleLabel = (value?: unknown) => {
  const roles: Record<string, string> = { leader: "leader", Leader: "leader", Anführer: "leader", Gildenleiter: "leader",
    officer: "officer", Officer: "officer", Offizier: "officer", member: "member", Member: "member", Mitglied: "member" };
  const raw = value == null ? "" : String(value);
  return raw && roles[raw] ? profileText("playerProfile.heroPanel.playerInfo.roles." + roles[raw]) : raw || "--";
};
export function profileElapsed(elapsedMs: number) {
  const hours = Math.max(0, elapsedMs) / 3_600_000;
  const amount = hours < 24 ? Math.max(1, Math.round(hours)) : hours / 24;
  const digits = hours < 24 ? 0 : amount < 10 ? 1 : 0;
  return new Intl.RelativeTimeFormat(profileLocale(), { numeric: "always" }).format(-Number(amount.toFixed(digits)), hours < 24 ? "hour" : "day");
}
export function profileMonth(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return value ?? "";
  return profileDate(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5)) - 1, 15), { month: "long", year: "numeric", timeZone: "UTC" });
}

export function profilePeriod(start: number, end: number, missingAtStart = false) {
  const format = (at: number) => profileDate(at, { day: "2-digit", month: "short", year: "2-digit" });
  if (start === end) return format(start);
  const days = Math.max(0, Math.round((end - start) / 86_400_000));
  const duration = profileNumber(days, { style: "unit", unit: "day", unitDisplay: "short", maximumFractionDigits: 0 });
  return format(start) + " – " + format(end) + " (" + duration
    + (missingAtStart ? ", " + profileText("profileI18n.playerMissingAtStart") : "") + ")";
}
