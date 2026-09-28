import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compareSource = fs.readFileSync(path.join(repoRoot, "src/pages/GuildHub/compareGuilds.tsx"), "utf8");
const chartSource = fs.readFileSync(path.join(repoRoot, "src/components/ui/charts/AnchoredLineChart.tsx"), "utf8");

const guildAnalyticsHiddenMarkerUses = [...compareSource.matchAll(/showDots=\{false\}/g)].length;
assert.equal(
  guildAnalyticsHiddenMarkerUses,
  2,
  "Guild Analytics overview and fight charts should hide permanent point markers.",
);

assert.match(
  chartSource,
  /const idleDots = showDots \? dots : dots\.filter\(\(dot\) => singlePointSeriesKeys\.has\(dot\.seriesKey\)\);/,
  "Single-point series should keep an idle marker when general dots are hidden.",
);

assert.match(
  chartSource,
  /const nearest = dots\.reduce<\{ point: ProjectedChartPoint \| null; distance: number \}>/,
  "Tooltip hit-testing should continue to use projected points independently of visible idle markers.",
);

assert.match(
  chartSource,
  /hover\.points\.map\(\(dot, idx\) => \(\s*<circle[\s\S]*?className="player-profile__trend-hover-dot"/,
  "Active hover dots should still render from the hover state.",
);

assert.match(
  compareSource,
  /const GUILD_AVERAGE_COLOR = "#55dba6";/,
  "Guild Average should keep its dedicated analytics color.",
);

const paletteMatch = compareSource.match(/const PLAYER_SERIES_COLORS = \[(?<colors>[^\]]+)\];/);
assert.ok(paletteMatch?.groups?.colors, "Player series palette should be a fixed local palette.");
const playerColors = [...paletteMatch.groups.colors.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(playerColors).size, playerColors.length, "Player series palette colors should be distinct.");
assert.ok(playerColors.length >= 6, "Player series palette should cover several simultaneously compared players.");

assert.match(
  compareSource,
  /current\.includes\(seriesKey\) \? current\.filter\(\(key\) => key !== seriesKey\) : \[\.\.\.current, seriesKey\]/,
  "Legend lock toggling should support multiple locked series.",
);

assert.match(
  compareSource,
  /aria-pressed=\{isLocked\}/,
  "Interactive legend chips should expose lock state via aria-pressed.",
);

assert.match(
  compareSource,
  /highlightedSeriesKeys=\{highlightedChartSeriesKeys\}/,
  "Chart should receive the combined hover and lock highlight keys.",
);

console.log("guildAnalyticsChartMarkers test passed");
