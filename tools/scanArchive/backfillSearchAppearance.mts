import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { searchIndexPayloadForScanArchiveEntry } from "../../src/lib/scanArchive/archiveBuilderCore.ts";
import { extractDerivedGuildCoaMetadata } from "../../src/lib/guilds/guildCoa.ts";
import { SCAN_ARCHIVE_SEARCH_SCHEMA_VERSION, type ScanArchiveManifestScan, type ScanArchiveSearchIndexMetadata } from "../../src/lib/scanArchive/types.ts";
import { validateScanArchiveManifest, validateScanArchivePayload, validateScanArchiveSearchIndexPayload } from "../../src/lib/scanArchive/validation.ts";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const semantic = (payload: Record<string, any>) => ({ ...payload, schemaVersion: 1,
  players: payload.players.map(({ appearance: _, ...row }: Record<string, unknown>) => row),
  guilds: payload.guilds.map(({ appearance: _, ...row }: Record<string, unknown>) => row) });
async function checkedFile(root: string, file: { path: string; sha256: string; compressedBytes: number; uncompressedBytes: number }) {
  const bytes = await readFile(path.join(root, file.path));
  assert.equal(bytes.length, file.compressedBytes, file.path + " size");
  assert.equal(hash(bytes), file.sha256.toLowerCase(), file.path + " hash");
  const raw = gunzipSync(bytes); assert.equal(raw.length, file.uncompressedBytes, file.path + " expanded size");
  return raw.toString("utf8");
}
/** Immutable input; bounded per-scan memory; only sidecars and manifest emitted.
 * No builder merge, winner selection, monthly composition or Raw copies. */
export async function backfillSearchAppearance(manifestPath: string, output: string) {
  const source = path.dirname(path.resolve(manifestPath)); output = path.resolve(output);
  assert(output !== source && !output.startsWith(source + path.sep), "Output must be separate from the input archive");
  assert(!await stat(output).then(() => true, () => false), "Output must not exist");
  const originalBytes = await readFile(manifestPath);
  const original = JSON.parse(originalBytes.toString("utf8"));
  const manifest = validateScanArchiveManifest(original, original.archiveYear);
  // Read-only inventory before any output is created.
  const inventory = await Promise.all(manifest.scans.map(async scan => ({ id: scan.id,
    rawPresent: await stat(path.join(source, scan.path)).then(() => true, () => false),
    searchPresent: !!scan.searchIndex && await stat(path.join(source, scan.searchIndex.path)).then(() => true, () => false) })));
  assert(inventory.every(i => i.rawPresent && i.searchPresent), "Complete raw and existing sidecars required; no live downloads");
  const next = structuredClone(original);
  const counts = { players: 0, guilds: 0, portraits: 0, classes: 0, coa: 0, oldBytes: 0, newBytes: 0 };
  for (const [index, scan] of manifest.scans.entries()) {
    const rawText = await checkedFile(source, scan);
    const raw = validateScanArchivePayload(JSON.parse(rawText), scan) as { players: Record<string, unknown>[]; groups: Record<string, unknown>[] };
    const old = JSON.parse(await checkedFile(source, scan.searchIndex!));
    validateScanArchiveSearchIndexPayload(old, scan);
    const generated = searchIndexPayloadForScanArchiveEntry(scan, raw, extractDerivedGuildCoaMetadata(raw, rawText)?.guildCoaByIdentifier);
    // Producer must reproduce the exact existing business fields.
    assert.deepEqual(semantic(generated), semantic(old), scan.id + " semantic mismatch");
    const payload = { ...old, schemaVersion: SCAN_ARCHIVE_SEARCH_SCHEMA_VERSION,
      players: old.players.map((row: object, i: number) => ({ ...row, appearance: generated.players[i].appearance })),
      guilds: old.guilds.map((row: object, i: number) => ({ ...row, appearance: generated.guilds[i].appearance })) };
    assert.deepEqual(semantic(payload), semantic(old));
    const json = Buffer.from(JSON.stringify(payload)); const compressed = gzipSync(json, { level: 9 });
    const metadata: ScanArchiveSearchIndexMetadata = { ...scan.searchIndex!, schemaVersion: SCAN_ARCHIVE_SEARCH_SCHEMA_VERSION, sha256: hash(compressed), compressedBytes: compressed.length, uncompressedBytes: json.length };
    next.scans[index].searchIndex = metadata;
    validateScanArchiveSearchIndexPayload(payload, { ...scan, searchIndex: metadata });
    const target = path.join(output, metadata.path); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, compressed, { flag: "wx" });
    counts.players += payload.players.length; counts.guilds += payload.guilds.length;
    counts.portraits += generated.players.filter(p => p.appearance?.portrait).length;
    counts.classes += generated.players.filter(p => p.appearance?.classId).length;
    counts.coa += generated.guilds.filter(g => g.appearance?.coaString).length;
    counts.oldBytes += scan.searchIndex!.compressedBytes; counts.newBytes += compressed.length;
  }
  next.revision = manifest.revision + 1; next.updatedAt = new Date().toISOString();
  validateScanArchiveManifest(next, manifest.archiveYear);
  const unchanged = (m: typeof original) => ({ ...m, revision: 0, updatedAt: "", scans: m.scans.map(({ searchIndex: _, ...scan }: ScanArchiveManifestScan) => scan) });
  assert.deepEqual(unchanged(next), unchanged(original), "Raw, sets and references must remain exact");
  assert.deepEqual(await readFile(manifestPath), originalBytes, "Input manifest untouched");
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
  const report = { source, output, sourceManifestSha256: hash(originalBytes), inventory, scans: manifest.scans.length,
    revisionBefore: manifest.revision, revisionAfter: next.revision, ...counts, rawCopies: 0, publication: "pending" };
  await writeFile(path.join(output, "backfill-report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, "Usage: backfillSearchAppearance.mts <input manifest> <new output directory>");
  const report = await backfillSearchAppearance(process.argv[2], process.argv[3]);
  console.log(JSON.stringify({ ...report, inventory: `${report.inventory.length} checked sources` }, null, 2));
}
