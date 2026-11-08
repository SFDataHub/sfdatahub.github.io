import assert from "node:assert/strict";
import { buildLocalGuildRanking, guildModeCategories, selectCompactGuildRanking } from "../../src/pages/GuildHub/localGuildRanking.ts";
import { summarizeLocalGuildPlayerStats } from "../../src/pages/GuildHub/localGuildPlayerStats.ts";

const member = (id: number, main: number | null, con: number, level = 100, xp = id) => ({
  key: `f8_net_p${id}`, name: "Same name", classLabel: "Warrior", playerStats: {
    baseMain: main, conBase: con, sumBaseTotal: main == null ? null : main + con,
    attrTotal: main == null ? null : main * 2, conTotal: con * 3, totalStats: main == null ? null : main * 2 + con * 3,
    level, xpTotal: xp, hofRank: id * 10, mine: id, treasury: 10 - id,
  },
});
const current = [member(1, 250, 50), member(2, 150, 200), member(3, 200, 100), member(4, 80, 40), member(5, 0, 0), member(6, null, 10)];
const history = [member(99, 300, 150), member(2, 220, 110), member(3, 200, 100), member(1, 80, 40), member(5, 0, 0)];
const key = (id: number) => `f8_net_p${id}`;
const rows = buildLocalGuildRanking(current, history, "main", "base", null, { players: [...history, member(4, 30, 15)], rosterComplete: true });
const keys = (selected: string | null) => selectCompactGuildRanking(rows, selected).map(row => row?.key ?? null);
assert.deepEqual(keys(null), [key(1), key(3), key(2)]);
assert.deepEqual(keys(key(2)), [key(3), key(2), key(4)]);
assert.deepEqual(keys(key(1)), [key(1), key(3), key(2)]);
assert.deepEqual(keys(key(5)), [key(2), key(4), key(5)]);
assert.deepEqual(keys(key(6)), [key(4), key(5), key(6)]);
assert.equal(selectCompactGuildRanking(rows, key(6))[2]?.rank, null);
assert.deepEqual(keys("old-guild-player"), keys(null));
assert.equal(rows.find(row => row.key === key(4))?.rankStatus, "new");
assert.equal(rows.find(row => row.key === key(4))?.valueDelta, 50, "new guild member uses historical player value outside the guild");
assert.equal(rows.find(row => row.key === key(1))?.rankDelta, 3);
assert.equal(rows.find(row => row.key === key(2))?.rankDelta, -1);
assert.equal(rows.find(row => row.key === key(5))?.rankDelta, 0);
assert.equal(rows.find(row => row.key === key(6))?.rankStatus, "unavailable");
assert.deepEqual(selectCompactGuildRanking(buildLocalGuildRanking(current, history, "con", "base", null), key(2)).map(row => row?.key ?? null), [key(2), key(3), key(1)], "neighbors differ by category");
for (const mode of ["general", "base", "total", "fortress"] as const) {
  const groups = summarizeLocalGuildPlayerStats(current, mode);
  for (const category of guildModeCategories(mode)) {
    const ranking = buildLocalGuildRanking(current, [], category, mode, null);
    assert.deepEqual(selectCompactGuildRanking(ranking, null).map(row => [row?.key, row?.value]), groups.find(group => group.category === category)!.entries.map(row => [row.key, row.value]), "existing Top 3 preserved");
    for (const selected of current) {
      const compact = selectCompactGuildRanking(ranking, selected.key);
      const population = ranking.find(row => row.key === selected.key)?.rank == null ? ranking : ranking.filter(row => row.rank != null);
      const index = population.findIndex(row => row.key === selected.key);
      const start = Math.max(0, Math.min(index - 1, population.length - 3));
      assert.deepEqual(compact, population.slice(start, start + 3));
      assert.equal(compact.filter(row => row?.key === selected.key).length, 1);
      for (const row of compact) if (row) assert.deepEqual(row, ranking.find(full => full.key === row.key));
      assert.equal(new Set(compact.filter(Boolean).map(row => row!.key)).size, compact.filter(Boolean).length);
    }
  }
}
const tied = [member(2, 100, 10, 100, 800), member(1, 100, 10, 100, 900), member(3, 90, 20, 100, 700)];
assert.deepEqual(selectCompactGuildRanking(buildLocalGuildRanking(tied, [], "main", "base", null), key(1)).map(row => row?.key), [key(2), key(1), key(3)], "stable equal-value order");
assert.deepEqual(selectCompactGuildRanking(buildLocalGuildRanking(tied, [], "level", "general", null), key(2)).map(row => row?.key), [key(1), key(2), key(3)], "level XP tiebreaker");
console.log("PASS compact rankings: all modes/categories, independent neighbors, boundaries, missing values, stable ties, XP, Top 3, rank deltas and cross-guild values");

for (const size of [0, 1, 2, 3]) {
  const small = rows.filter(row => row.rank != null).slice(0, size);
  for (const selected of [null, ...small.map(row => row.key)]) {
    assert.deepEqual(selectCompactGuildRanking(small, selected), small, `all ${size} available entries once`);
  }
}
