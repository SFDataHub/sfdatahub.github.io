import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(repoRoot, "src/pages/GuildHub/compareGuilds.tsx");
const source = fs.readFileSync(sourcePath, "utf8");

assert.match(
  source,
  /const \[overviewRange,\s*setOverviewRange\] = React\.useState<GuildAnalyticsRangeSelection>\(\{\s*key:\s*"all"\s*\}\);/,
  "Guild Analytics should default to the full history range.",
);

assert.match(
  source,
  /onRangeChange=\{setOverviewRange\}/,
  "Manual range selections should still update the overview range state.",
);

assert.match(
  source,
  /const applyRange = \(next: GuildAnalyticsRangeSelection\) => \{[\s\S]*?onRangeChange\(next\);[\s\S]*?\};/,
  "The range control should continue to pass manual selections through.",
);

const overviewRangeSetterUses = [...source.matchAll(/\bsetOverviewRange\b/g)].length;
assert.equal(
  overviewRangeSetterUses,
  2,
  "Guild switches should not introduce extra overview range resets beyond state creation and manual range changes.",
);

console.log("guildAnalyticsRangeDefault test passed");
