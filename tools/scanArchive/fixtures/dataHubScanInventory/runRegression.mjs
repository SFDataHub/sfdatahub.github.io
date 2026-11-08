import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { spawnSync } from "node:child_process";
const files = [
  "guilds/localScanProvenance", "scanArchive/dataHubScanInventory",
  "scanArchive/scanArchiveOverview", "scanArchive/scanArchive", "parsing/scanExplorer",
  "guilds/localPlayerAnalyticsCoordinator", "guilds/localPlayerAnalyticsExecution",
];
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--import", "./tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs", `tools/${file}.test.mts`], { encoding: "utf8", timeout: 120000 });
  console.log(`${result.status === 0 ? "PASS" : "FAIL"} ${file}.test.mts`);
  if (result.status !== 0) { failed++; console.log(result.stdout, result.stderr, result.error ?? ""); }
}
console.log(`${files.length - failed}/${files.length} passed`);
process.exitCode = failed ? 1 : 0;
