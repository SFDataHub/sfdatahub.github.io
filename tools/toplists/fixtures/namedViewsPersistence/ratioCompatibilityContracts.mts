import assert from "node:assert/strict";
import { playerAttributeColumn, playerAttributeRatio, playerAttributeValue, playerRatioLabel } from "../../../../src/lib/toplists/playerAttributeColumns";
import { buildLocalPlayerToplistView, getLocalToplistMetricValue } from "../../../../src/lib/toplists/localToplistView";
import { LOCAL_PLAYER_TOPLIST_METRICS } from "../../../../src/lib/toplists/localToplistMetrics";
import type { LocalPlayerToplistRow } from "../../../../src/lib/toplists/localToplistTypes";

const base = playerAttributeColumn("baseRatio")!;
const total = playerAttributeColumn("totalRatio")!;
const row = (id: string, values: Record<string, unknown>) => ({
  rowKey: id, identifier: id, server: "F28", name: id, class: "Warrior", main: 140887, con: 95135,
  mainTotal: 900, conTotal: 100, sum: 999999, ratio: 60, ...values,
}) as unknown as LocalPlayerToplistRow;

const originalScalars = row("original-scalars", {});
assert.equal(playerAttributeValue(originalScalars, base), 60);
assert.equal(playerAttributeValue(originalScalars, total), 90);
assert.equal(playerRatioLabel(playerAttributeValue(originalScalars, base)), "60/40");
assert.equal(playerRatioLabel(playerAttributeValue(originalScalars, total)), "90/10");
assert.equal(playerAttributeRatio(100, 200), 33);

for (const column of [base, total]) {
  const main = column === base ? "main" : "mainTotal";
  const con = column === base ? "con" : "conTotal";
  for (const [a, b, expected] of [[0, 20, 0], [20, 0, 100], [0, 0, null], [null, 20, null], [20, undefined, null], [NaN, 20, null], [20, Infinity, null], [10, -10, null]] as const) {
    const input = row("boundary", { [main]: a, [con]: b });
    assert.equal(playerAttributeValue(input, column), expected, `${column.key}: ${a}/${b}`);
    const metric = LOCAL_PLAYER_TOPLIST_METRICS.find(metric => metric.metricKey === column.key)!;
    assert.equal(getLocalToplistMetricValue(input, metric), expected, "sort and display agree");
  }
  assert.equal(playerAttributeValue(row("stored-zero", { [column.field!]: 0 }), column), 0);
  assert.equal(playerAttributeValue(row("stored-null", { [column.field!]: null, [main]: 100, [con]: 200 }), column), 33);
}

const rows = [row("a", { main: 100, con: 300, mainTotal: 900, conTotal: 100 }),
  row("b", { main: 300, con: 100, mainTotal: 100, conTotal: 900 }),
  row("zero", { main: 0, con: 100, mainTotal: 0, conTotal: 100 }),
  row("missing", { main: null, con: 100, mainTotal: null, conTotal: 100 })];
const unchanged = JSON.stringify(rows);
for (const mode of ["base", "total"] as const) {
  for (const [key, descending, ascending] of [
    ["baseRatio", ["b", "a", "zero", "missing"], ["zero", "a", "b", "missing"]],
    ["totalRatio", ["a", "b", "zero", "missing"], ["zero", "b", "a", "missing"]],
  ] as const) {
    for (const [direction, expected] of [["desc", descending], ["asc", ascending]] as const) {
      const view = buildLocalPlayerToplistView(rows, { sort: { metricKey: key, direction }, playerAverageMode: mode });
      assert.deepEqual(view.rows.map(row => row.rowKey), expected, `${key}/${mode}/${direction}`);
    }
  }
}
assert.equal(JSON.stringify(rows), unchanged, "reading and sorting never rewrite prepared rows");
assert.equal(base.delta, undefined, "fixed Base Ratio keeps its delta contract");
assert.equal(total.delta, undefined, "fixed Total Ratio keeps its delta contract");
console.log("PASS legacy scalar ratios, rounding, zero/missing/invalid denominator, shared sort value, both directions/modes and unchanged prepared rows");
