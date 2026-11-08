import i18next from "i18next";
import { dataHubMessageAliases, dataHubMessagePatterns } from "./dataHubMessages";
import { profileTranslationOptions } from "./profilePresentation";

/** Presentation only. Locale is deliberately not a dependency of data operations. */
export const hubLocale = () => i18next.resolvedLanguage ?? i18next.language ?? "en";
export const hubText = (key: string, values?: Record<string, unknown>) =>
  String(i18next.t(key, profileTranslationOptions(values ?? {})));
export const hubNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(hubLocale(), options).format(value);
export const hubPercent = (fraction: number, maximumFractionDigits = 0) =>
  hubNumber(fraction, { style: "percent", maximumFractionDigits });
export const hubDate = (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(hubLocale(), options).format(value);
/** Resolve old persisted strings at the display boundary, without rewriting jobs. */
let messageIndex: Map<string, string> | undefined;
let templateIndex: Array<{ regex: RegExp; key: string; names: string[] }> = [];
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function indexMessages() {
  const index = new Map<string, string>(Object.entries(dataHubMessageAliases));
  for (const language of ["en", "de", "hu", "cs", "pl"]) {
    const resources = i18next.getResourceBundle(language, "translation")?.dataHubI18n;
    for (const [name, value] of Object.entries(resources ?? {})) {
      if (typeof value !== "string") continue;
      const key = "dataHubI18n." + name;
      if (!value.includes("{{")) { index.set(value, key); index.set(value.toLowerCase().replace(/\.$/, ""), key); }
      else {
        const names: string[] = [];
        const pattern = value.split(/(\{\{[^}]+\}\})/).map(part => {
          const match = /^\{\{([^}]+)\}\}$/.exec(part);
          if (!match) return escapeRegex(part);
          names.push(match[1]);
          return "(.+?)";
        }).join("");
        templateIndex.push({ regex: new RegExp("^" + pattern + "$", "s"), key, names });
      }
    }
  }
  messageIndex = index;
}
export function hubMessage(message: string | null | undefined): string {
  if (!message) return "";
  if (message.startsWith("dataHubI18n.")) return hubText(message);
  if (!messageIndex) indexMessages();
  const exact = messageIndex!.get(message) ?? messageIndex!.get(message.toLowerCase().replace(/\.$/, ""));
  if (exact) return hubText(exact);
  for (const entry of dataHubMessagePatterns) {
    const match = entry.regex.exec(message);
    if (!match) continue;
    const groups = entry.pattern.match(/\((?:\\.|[^)])*\)/g) ?? [];
    return hubText(entry.key, Object.fromEntries(match.slice(1).map((value, i) =>
      ["v" + (i + 1), groups[i] === "(\\d+)" ? Number(value) : entry.key === "dataHubI18n.jobConflictingMergeRecords" && i === 0 ? Number(value.replaceAll(".", "")) : value])));
  }
  for (const entry of templateIndex) {
    const match = entry.regex.exec(message);
    if (match) return hubText(entry.key, Object.fromEntries(entry.names.map((name, i) => [name, match[i + 1]])));
  }
  // Fast-load errors can carry an archive identifier before a known message.
  const separator = message.indexOf(": ");
  if (separator > 0 && !message.slice(0, separator).includes(" ")) {
    const prefix = message.slice(0, separator), suffix = message.slice(separator + 2);
    const translated = hubMessage(suffix);
    if (translated !== suffix) return (messageIndex!.has(prefix) ? hubText(messageIndex!.get(prefix)!) : prefix) + ": " + translated;
  }
  return message;
}
