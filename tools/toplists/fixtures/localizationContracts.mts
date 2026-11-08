import assert from "node:assert/strict";
import fs from "node:fs";
import i18next from "i18next";
import { SUPPORTED_LOCALE_OPTIONS, normalizeLocale, deriveLocaleStateFromSelection, mergeRemoteLocaleState, readLocaleStateFromLocalStorage, writeLocaleStateToLocalStorage } from "../../../src/lib/i18n/localePreferences";
import { PLAYER_ATTRIBUTE_COLUMNS, attributeColumnLabel } from "../../../src/lib/toplists/playerAttributeColumns";
import { toplistColumnTree, toplistColumns } from "../../../src/lib/toplists/toplistColumns";

const locales = ["en", "de", "hu", "cs", "pl"] as const;
const dictionaries = Object.fromEntries(locales.map(locale => [locale, JSON.parse(fs.readFileSync(new URL(`../../../src/i18n/${locale}.json`, import.meta.url), "utf8"))]));
const flatten = (value: Record<string, any>, prefix = ""): Record<string, string> => Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => typeof entry === "string" ? [[prefix + key, entry]] : Object.entries(flatten(entry, `${prefix}${key}.`))));
const baseline = flatten(dictionaries.en);
const keys = Object.keys(baseline).filter(key => ["toplists.", "localSettings.toplists.", "guildHub.toplist.", "hubSearch."].some(prefix => key.startsWith(prefix)));
const placeholders = (value: string) => [...value.matchAll(/{{\s*([^}]+)\s*}}/g)].map(match => match[1]).sort();
const resources = Object.fromEntries(locales.map(locale => [locale, { translation: dictionaries[locale] }]));
const i18n = i18next.createInstance();
await i18n.init({ resources, fallbackLng: "en", interpolation: { escapeValue: false } });
for (const locale of locales) {
  const dictionary = flatten(dictionaries[locale]);
  for (const key of keys) {
    assert.equal(typeof dictionary[key], "string", `${locale}: missing ${key}`);
    assert.deepEqual(placeholders(dictionary[key]), placeholders(baseline[key]), `${locale}: placeholders ${key}`);
  }
  const translate = (key: string, fallback = "") => {
    assert.equal(typeof dictionary[key], "string", `${locale}: dynamic key ${key}`);
    return i18n.t(key, { lng: locale, defaultValue: fallback });
  };
  for (const column of PLAYER_ATTRIBUTE_COLUMNS) assert.ok(attributeColumnLabel(column, translate).length);
  for (const kind of ["players", "guilds"] as const) {
    for (const column of toplistColumns(kind)) translate(`toplists.columns.${column.key === "name" && kind === "players" ? "player" : column.key}`);
    const walk = (nodes: ReturnType<typeof toplistColumnTree>) => nodes.forEach(node => {
      if (node.children.length) {
        translate(["identity", "attributes", "progress", "fortress"].includes(node.key) ? `localSettings.toplists.categories.${node.key}` : `toplists.attributeCatalog.groups.${node.key}`);
        walk(node.children);
      }
    });
    walk(toplistColumnTree(kind));
  }
  assert.equal(translate("toplists.attributeCatalog.stats.Con"), "Con");
  for (const count of [0, 1, 2, 5, 12, 22]) {
    assert.ok(!i18n.t("hubSearch.minQuery", { lng: locale, count }).includes("{{"));
    const plural = new Intl.PluralRules(locale).select(count);
    assert.equal(i18n.t("toplists.status.rows", { lng: locale, count }), dictionary[`toplists.status.rows_${plural}`] ?? dictionary["toplists.status.rows_other"]);
  }
}
assert.equal(dictionaries.en.toplists.filters.sort.playerOptions.constitution, "Constitution");
assert.equal(dictionaries.de.toplists.filters.sort.playerOptions.constitution, "Ausdauer");
assert.equal(dictionaries.en.toplists.attributeCatalog.types.bonus, "Total Bonus");
assert.equal(dictionaries.de.toplists.attributeCatalog.types.bonus, "Gesamtbonus");
assert.equal(normalizeLocale(" pl-PL "), "pl");
assert.equal(SUPPORTED_LOCALE_OPTIONS.filter(option => option.code === "pl").length, 1);
assert.deepEqual(deriveLocaleStateFromSelection("pl", "de"), { activeLocale: "pl", preferredSecondaryLocale: "pl" });
assert.deepEqual(deriveLocaleStateFromSelection("en", "pl"), { activeLocale: "en", preferredSecondaryLocale: "pl" });
assert.deepEqual(mergeRemoteLocaleState({ language: "pl-PL", preferredSecondaryLocale: "pl" }, { activeLocale: "en", preferredSecondaryLocale: "de" }), { activeLocale: "pl", preferredSecondaryLocale: "pl" });
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } } });
writeLocaleStateToLocalStorage({ activeLocale: "pl", preferredSecondaryLocale: "pl" });
assert.deepEqual(readLocaleStateFromLocalStorage(), { activeLocale: "pl", preferredSecondaryLocale: "pl" });
delete (globalThis as any).window;
assert.equal(i18n.t("account.settings.title", { lng: "pl" }), i18n.t("account.settings.title", { lng: "en" }));
assert.equal(Object.keys(dictionaries.pl).includes("dashboardTrend"), false);
console.log(`PASS: ${keys.length} scoped keys in five languages; dynamic catalog, placeholders, Con/bonus, locale normalization, storage, remote merge and English fallback.`);
