import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateScanArchiveBuilderInput, type ScanArchiveBuilderManifestState } from "../../src/lib/scanArchive/scanArchiveBuilderUi.ts";
import { scanArchiveBuilderBlockerFromError, ScanArchiveBuilderValidationError } from "../../src/lib/scanArchive/scanArchiveBuilderErrors.ts";
import type { ScanArchiveBuilderInspection, ScanArchiveBuilderUsageMode } from "../../src/lib/scanArchive/scanArchiveBuilderTypes.ts";

const modes: ScanArchiveBuilderUsageMode[] = ["create-monthly", "add-monthly", "archive-only"];
const inspection: ScanArchiveBuilderInspection = {
  inspectionId: "valid-input", years: [2026], months: ["2026-09"], servers: ["am1_net"],
  batchCount: 1, targets: [{ server: "am1_net", month: "2026-09" }], blockers: [],
};
const manifestState: ScanArchiveBuilderManifestState = {
  status: "ready",
  manifest: { schemaVersion: 1, archiveYear: 2026, revision: 0, updatedAt: "2026-01-01T00:00:00Z", scanCount: 0, serverCount: 0, scans: [] },
  source: { kind: "catalog", manifestUrl: "https://example.test/manifest.json", year: 2026, scanCount: 0 },
};
const serverError = {
  code: "server_resolution_failed", cause: "players[3]: Server unknown_net kann nicht eindeutig aufgeloest werden.",
  remedy: "Pruefe die eindeutige Server-/Aliaszuordnung.",
};
const options = { inputSelected: true, inspection, inspectionError: null, manifestState, usageMode: null, busy: false };

// Run the same blocker and build-gate logic used by the page for every mode.
for (const usageMode of modes) {
  const rejected = evaluateScanArchiveBuilderInput({ ...options, usageMode, inspection: null, inspectionError: serverError });
  assert.deepEqual(rejected.blockers, [serverError]);
  assert.equal(rejected.canBuild, false);
  // A stale successful inspection cannot override a current inspection error.
  assert.equal(evaluateScanArchiveBuilderInput({ ...options, usageMode, inspectionError: serverError }).canBuild, false);
  const invalidInspection = { ...inspection, blockers: [{ code: "input_multi_year", cause: "Two years", remedy: "Export one year" }] };
  assert(evaluateScanArchiveBuilderInput({ ...options, usageMode, inspection: invalidInspection }).blockers.includes(invalidInspection.blockers[0]));
  const manifestError = { code: "manifest_invalid", cause: "Invalid manifest", remedy: "Load a valid manifest" };
  const invalidManifest = evaluateScanArchiveBuilderInput({ ...options, usageMode, manifestState: { status: "error", blocker: manifestError } });
  assert(invalidManifest.blockers.includes(manifestError));
  assert.equal(invalidManifest.canBuild, false);
}
const missingMode = evaluateScanArchiveBuilderInput(options);
assert(missingMode.blockers.some(b => b.code === "usage_mode_missing"));
const add = evaluateScanArchiveBuilderInput({ ...options, usageMode: "add-monthly" });
assert(add.blockers.some(b => b.code === "add_target_missing"));
assert.equal(add.canBuild, false);
for (const usageMode of ["create-monthly", "archive-only"] as const) {
  const changed = evaluateScanArchiveBuilderInput({ ...options, usageMode });
  assert.deepEqual(changed.blockers, []);
  assert.equal(changed.canBuild, true);
}
// New file, reset and successful revalidation are distinct from a mode change.
assert.equal(evaluateScanArchiveBuilderInput({ ...options, inspection: null, manifestState: { status: "idle" } }).canBuild, false);
const reset = evaluateScanArchiveBuilderInput({ ...options, inputSelected: false, inspection: null, manifestState: { status: "idle" } });
assert.deepEqual(reset.blockers.map(b => b.code), ["input_missing"]);
assert.equal(reset.canBuild, false);
assert.equal(evaluateScanArchiveBuilderInput({ ...options, usageMode: "archive-only", busy: true }).canBuild, false);
assert.equal(evaluateScanArchiveBuilderInput({ ...options, usageMode: "archive-only" }).canBuild, true);
assert.deepEqual(scanArchiveBuilderBlockerFromError(new ScanArchiveBuilderValidationError(serverError)), serverError);
const formatError = scanArchiveBuilderBlockerFromError(new SyntaxError("Unexpected token"));
assert.equal(formatError.code, "input_validation_failed");
assert.match(formatError.remedy, /SFtools-JSON.*players\[\].*groups\[\]/);

// Supplement runtime logic with static UI bindings; no DOM mount is performed.
const page = readFileSync(new URL("../../src/pages/Admin/ScanArchiveBuilder.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const section = (start: string, end: string) => page.slice(page.indexOf(start), page.indexOf(end, page.indexOf(start)));
const resultReset = section("  const resetResult =", "  const handleFileChange =");
assert.match(resultReset, /discardBuild\(buildRunRef.current.requestId\)/);
assert.match(resultReset, /clearZip\(\)/);
assert.match(resultReset, /setResult\(null\)/);
assert.match(resultReset, /setBuildError\(null\)/);
assert.doesNotMatch(resultReset, /setInspection(?:Error)?\(/);
const modeChange = section("  const handleUsageModeChange =", "  const { blockers, canBuild }");
assert.match(modeChange, /setUsageMode\(mode\)/);
assert.match(modeChange, /resetResult\(\)/);
assert.doesNotMatch(modeChange, /setInspection|setManifestState|\.inspect\(/);
const fileChange = section("  const handleFileChange =", "  React.useEffect(() =>");
assert.match(fileChange, /inspectRunRef.current = null/);
assert.match(fileChange, /setInspection\(null\)/);
assert.match(fileChange, /setInspectionError\(null\)/);
assert.match(fileChange, /requestId !== run.requestId\) return/);
assert.match(fileChange, /setInspectionError\(scanArchiveBuilderBlockerFromError\(caught\)\)/);
assert.match(fileChange, /setInspection\(nextInspection\);\n\s+setInspectionError\(null\)/);
const cancel = section("  const cancelBuild =", "  const manifestDescription =");
assert.match(cancel, /inspectRunRef.current = null/);
assert.match(cancel, /setInspectionError\(null\)/);
assert.match(page, /evaluateScanArchiveBuilderInput\(\{[\s\S]*?inspectionError,[\s\S]*?usageMode,/);
assert.match(page, /<BlockerList blockers=\{blockers\}/);
assert.match(page, /onClick=\{handleBuild\} disabled=\{!canBuild\}/);
assert.match(page, /zipUrl && result/);
assert.match(page, /Reset[\s\S]*?window\.location\.reload|window\.location\.reload[\s\S]*?Reset/);
console.log("scanArchiveBuilderUi.test: runtime blocker/build-gate logic and static UI bindings ok");
