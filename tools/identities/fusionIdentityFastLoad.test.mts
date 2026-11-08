import assert from "node:assert/strict";
import { getFusionIdentityFastLoadOptions, getFusionIdentityFastLoadScanCounts, getFusionIdentityFastLoadMissingBasis, selectFusionIdentityFastLoadEntries } from "../../src/lib/identities/fusionIdentityFastLoad";
import { listFusionIdentityAnalysisScopes } from "../../src/lib/identities/fusionIdentityScopes";
import type { ScanArchiveEntry } from "../../src/lib/scanArchive/types";
import { resolveServer } from "../../src/lib/servers/serverResolver";

const entry = (id: string, server: string, date: string, year = Number(date.slice(0, 4))) => ({
  id, server, timestamp: Date.parse(date), archiveYear: year,
} as ScanArchiveEntry);
const scopes = listFusionIdentityAnalysisScopes({ atDate: "2026-11-07" });
const direct = [
  entry("old", "s5_eu", "2026-10-15"), entry("too-late", "EU5", "2026-10-16"),
  entry("current", "f29_net", "2026-10-16"), entry("too-early", "F29", "2026-10-15"),
  entry("other-year", "s5_eu", "2025-10-15"), entry("unrelated", "f28_net", "2026-10-17"),
];
assert.deepEqual(selectFusionIdentityFastLoadEntries(direct, "F29", 2026, scopes).map(row => row.id), ["old", "current"]);
assert.deepEqual(selectFusionIdentityFastLoadEntries(direct, "F29", 2025, scopes).map(row => row.id), ["other-year"]);
assert.deepEqual(getFusionIdentityFastLoadOptions(direct, scopes).find(row => row.server === "F29")?.years, [2026, 2025]);

// Use the registered ES -> F5 -> MAERWYNN lineage, including the intermediate server.
const scope = scopes.find(row => row.targetServerCode === "MAERWYNN")!;
assert(scope.intermediateServerCodes.includes("F5"));
const f5 = scope.ancestorEvents.find(row => row.targetServerCode === "F5")!;
const end = Date.parse(`${scope.effectiveDate}T00:00:00Z`);
const start = Date.parse(`${f5.effectiveDate}T00:00:00Z`);
const historicalYear = new Date(start).getUTCFullYear();
const chain = [
  entry("leaf-before", f5.originServerCodes[0], new Date(start - 1).toISOString(), historicalYear),
  entry("leaf-after", f5.originServerCodes[0], new Date(start).toISOString(), historicalYear),
  entry("intermediate-before", "F5", new Date(start - 1).toISOString(), historicalYear),
  entry("intermediate", "F5", new Date(start).toISOString(), historicalYear),
  entry("intermediate-too-late", "F5", new Date(end).toISOString()),
  entry("terminal-before", "MAERWYNN", new Date(end - 1).toISOString()),
  entry("terminal", "MAERWYNN", new Date(end).toISOString()),
];
assert.deepEqual(selectFusionIdentityFastLoadEntries(chain, "MAERWYNN", historicalYear, scopes).map(row => row.id), ["leaf-before", "intermediate"]);
assert.deepEqual(selectFusionIdentityFastLoadEntries(chain, "MAERWYNN", new Date(end).getUTCFullYear(), scopes).map(row => row.id), ["terminal"]);
const named = [entry("named", "gnarogrim_net", "2026-07-01")];
assert.equal(selectFusionIdentityFastLoadEntries(named, "GNAROGRIM", 2026, scopes).length, 1);
assert.equal(selectFusionIdentityFastLoadEntries(named, "F29", 2026, scopes).length, 0);
console.log("PASS Fast Load: direct and registered multistage lineage, temporal boundaries, named targets, years and unrelated servers");

const directTargets = getFusionIdentityFastLoadOptions(direct, scopes);
assert(directTargets.some(row => row.server === "F29"));
for (const code of ["EU5", "EU6", "EU7", "EU8"]) {
  assert(!directTargets.some(row => row.server === code));
  assert.equal(resolveServer(code)?.active, false);
  assert.equal(resolveServer(`s${code.slice(2)}_eu`)?.code, code);
  assert.equal(resolveServer(`s${code.slice(2)}eu`)?.code, code);
}
const chainTargets = getFusionIdentityFastLoadOptions(chain, scopes);
assert(chainTargets.some(row => row.server === "MAERWYNN"));
assert(!chainTargets.some(row => row.server === "F5"));
assert.deepEqual(chainTargets.find(row => row.server === "MAERWYNN")?.years, [2025, 2023]);
// The registered consuming fusion is still future on April 24: F5 remains current.
const beforeMaerwynn = listFusionIdentityAnalysisScopes({ atDate: "2025-04-24" });
const priorTargets = getFusionIdentityFastLoadOptions(chain, beforeMaerwynn);
assert(priorTargets.some(row => row.server === "F5"));
assert(!priorTargets.some(row => row.server === "MAERWYNN"));
const afterMaerwynn = listFusionIdentityAnalysisScopes({ atDate: "2025-04-25" });
assert(!getFusionIdentityFastLoadOptions(chain, afterMaerwynn).some(row => row.server === "F5"));
assert.equal(getFusionIdentityFastLoadOptions(direct, listFusionIdentityAnalysisScopes({ atDate: "2026-10-15" })).some(row => row.server === "F29"), false);
console.log("PASS Fast Load supplement: only central current terminal targets, future consuming fusion preserves F5, predecessor aliases retained, years unchanged");

// Navigation is central and independent of archive inventory; only years depend on files.
const emptyTargets = getFusionIdentityFastLoadOptions([], scopes);
assert.deepEqual(emptyTargets.map(row => row.server), directTargets.map(row => row.server));
assert(emptyTargets.every(row => row.years.length === 0));
assert.deepEqual(emptyTargets.map(row => row.server).sort(), scopes.filter(row => row.isCurrentTerminalTarget).map(row => row.targetServerCode).sort());
const namedTargets = emptyTargets.filter(row => resolveServer(row.server)?.type === "named").map(row => row.server).sort((a, b) => a.localeCompare(b));
const numberedTargets = emptyTargets.filter(row => resolveServer(row.server)?.type !== "named").map(row => row.server).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
assert.deepEqual(emptyTargets.map(row => row.server), [...namedTargets, ...numberedTargets]);
assert.deepEqual(directTargets.find(row => row.server === "MAERWYNN")?.years, []);
console.log("PASS Dashboard navigation: all central current terminals without archives, W238 order, unavailable years remain empty");

const monthlyParts = [
  entry("aug-base", "BLACKFOREST", "2026-08-02"),
  entry("aug-add", "BLACKFOREST", "2026-08-02"),
  entry("aug-guilds", "BLACKFOREST", "2026-08-03"),
  entry("sep-base", "BLACKFOREST", "2026-09-05"),
  entry("sep-add", "BLACKFOREST", "2026-09-06"),
].map(row => ({ ...row, sha256: row.id, manifestUrl: "https://archive.example/manifest.json" }));
const linkSet = (key: string, parts: typeof monthlyParts) => {
  const set = { key, scanIds: parts.map(row => row.id), members: parts };
  return parts.map(row => ({ ...row, monthlySets: [set] }));
};
const logical = [...linkSet("explicit-aug", monthlyParts.slice(0, 3)), ...linkSet("explicit-sep", monthlyParts.slice(3))];
const counts = (ids: string[], rows: readonly ScanArchiveEntry[] = logical) =>
  getFusionIdentityFastLoadScanCounts(rows, row => ids.includes(row.id));
assert.deepEqual(counts([]), { count: 2, local: 0, pending: 2 });
assert.deepEqual(counts(["aug-base", "aug-add"]), { count: 2, local: 0, pending: 2 });
assert.deepEqual(counts(["aug-base", "aug-add", "aug-guilds", "sep-base"]), { count: 2, local: 1, pending: 1 });
assert.deepEqual(counts(monthlyParts.map(row => row.id)), { count: 2, local: 2, pending: 0 });
// Same server/date/month alone never links an independent source.
const independent = { ...monthlyParts[0], id: "independent", sha256: "independent" };
assert.deepEqual(counts(monthlyParts.map(row => row.id), [...logical, independent]), { count: 3, local: 2, pending: 1 });
// Even a selected subset must have every explicitly required member locally.
assert.deepEqual(counts(["aug-base"], [logical[0]]), { count: 1, local: 0, pending: 1 });
const unchanged = JSON.stringify(logical);
counts([]); counts(monthlyParts.map(row => row.id));
assert.equal(JSON.stringify(logical), unchanged);
console.log("PASS Scan preview: explicit monthly sets, complete-source locality, partial sets, independent same-date sources, immutable physical selection");

assert.equal(getFusionIdentityFastLoadMissingBasis(), "missingBoth");
assert.equal(getFusionIdentityFastLoadMissingBasis({ hasHistoricalObservations: false, hasCurrentTargetObservations: false }), "missingBoth");
assert.equal(getFusionIdentityFastLoadMissingBasis({ hasHistoricalObservations: true, hasCurrentTargetObservations: false }), "missingCurrent");
assert.equal(getFusionIdentityFastLoadMissingBasis({ hasHistoricalObservations: false, hasCurrentTargetObservations: true }), "missingHistory");
assert.equal(getFusionIdentityFastLoadMissingBasis({ hasHistoricalObservations: true, hasCurrentTargetObservations: true }), null);
console.log("PASS Local comparison hints: both sides missing, history missing, target after fusion missing, own target present");
