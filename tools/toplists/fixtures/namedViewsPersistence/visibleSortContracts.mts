import assert from "node:assert/strict";
import { visibleToplistSortOptions, resolveVisibleToplistSort } from "../../../../src/lib/toplists/toplistSortOptions";
import { defaultToplistColumns, normalizeColumnView, toplistColumnLabel } from "../../../../src/lib/toplists/toplistColumns";

const defaults = defaultToplistColumns("players");
const base = visibleToplistSortOptions("players", defaults, "base");
const total = visibleToplistSortOptions("players", defaults, "total");
assert.deepEqual(base.map(o => o.columnKey), defaults.filter(key => !["rank", "rankDelta"].includes(key)));
assert.deepEqual(base.slice(3, 7).map(o => o.metricKey), ["main", "constitution", "sum", "statsDay"]);
assert.deepEqual(total.slice(3, 7).map(o => o.metricKey), ["mainTotal", "conTotal", "sumTotal", "statsDayTotal"]);
assert.deepEqual(resolveVisibleToplistSort("players", total, "main", "asc", "sum"), { metricKey: "mainTotal", direction: "asc" });
assert.deepEqual(resolveVisibleToplistSort("players", base, "conTotal", "asc", "sum"), { metricKey: "constitution", direction: "asc" });
assert.deepEqual(resolveVisibleToplistSort("players", base, "bonus_pet_con", "asc", "sum"), { metricKey: "sum", direction: "desc" });

const columns = ["rank", "name", "baseCon", "baseRatio", "totalCon", "totalRatio", "bonus_bonus_con", "lastScan"];
for (const mode of ["base", "total"] as const) {
  const options = visibleToplistSortOptions("players", columns, mode);
  assert.deepEqual(options.map(o => o.metricKey), columns.slice(1));
  assert.deepEqual(resolveVisibleToplistSort("players", options, "totalRatio", "asc", "baseSum"), { metricKey: "totalRatio", direction: "asc" });
  assert.deepEqual(resolveVisibleToplistSort("players", options, "baseMain", "desc", "baseSum"), { metricKey: "name", direction: "asc" });
  const moved = [...columns]; moved.splice(1, 0, moved.splice(5, 1)[0]);
  assert.deepEqual(visibleToplistSortOptions("players", moved, mode).map(o => o.columnKey), moved.slice(1));
  const removed = columns.filter(key => key !== "totalRatio");
  assert(!visibleToplistSortOptions("players", removed, mode).some(o => o.metricKey === "totalRatio"));
}
assert.deepEqual(visibleToplistSortOptions("players", ["main", "main", "rankDelta"]).map(o => o.metricKey), ["main"]);
const guild = visibleToplistSortOptions("guilds", ["rank", "name", "avgCon", "avgLevel"]);
assert.deepEqual(guild.map(o => o.metricKey), ["guildName", "guildAvgCon", "guildAvgLevel"]);
assert.deepEqual(resolveVisibleToplistSort("guilds", guild, "guildAvgCon", "asc", "guildAvgLevel"), { metricKey: "guildAvgCon", direction: "asc" });
assert.deepEqual(resolveVisibleToplistSort("guilds", guild, "guildHonor", "asc", "guildAvgLevel"), { metricKey: "guildAvgLevel", direction: "desc" });
assert.deepEqual(resolveVisibleToplistSort("guilds", guild.slice(0, 2), "guildHonor", "desc", "guildAvgLevel"), { metricKey: "guildName", direction: "asc" });
const view = normalizeColumnView({ activeId: "saved", views: [{ id: "saved", name: "Stored Bonus", columns, widths: { baseCon: 117 } }] }, "players");
const before = JSON.stringify(view);
resolveVisibleToplistSort("players", visibleToplistSortOptions("players", view.columns), "baseMain", "desc", "baseSum");
assert.equal(JSON.stringify(view), before, "sort reconciliation never edits a view");
const fallback = (_key: string, text: string) => text;
assert.equal(toplistColumnLabel("players", "con", fallback), "Con");
assert.equal(toplistColumnLabel("players", "bonus_bonus_con", fallback), "Total Bonus Con");
console.log("PASS visible header order, dynamic modes, fixed metrics, deduplication, mutation projection, fallback/default direction and untouched saved views");
