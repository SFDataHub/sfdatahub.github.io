#!/usr/bin/env tsx

import {
  applyScanArchiveBuildPlan,
  createScanArchiveBuildPlan,
  readSelectionFile,
  type ScanArchiveBuilderOptions,
} from "./archiveBuilder.mts";

type ParsedArgs = ScanArchiveBuilderOptions & {
  apply: boolean;
};

const usage = () => `Usage:
  npx tsx tools/scanArchive/buildScanArchive.mts --archive-root <path> --year <YYYY> [--input <path>] [options]

Options:
  --apply                         Write planned files and manifest. Default is dry-run.
  --selection <path>              JSON with { current, monthly } toplist selections.
  --backfill-search-indexes       Create missing .search.json.gz files for manifest scans.
  --set-imported-as-current       Select imported complete scans as current when unambiguous.
  --set-imported-as-monthly <YYYY-MM>
                                  Select imported complete scans for one month when unambiguous.
  --replace-monthly               Allow replacing an existing monthly selection.
  --allow-current-rollback        Allow current to move to an older scan.
`;

const readFlagValue = (args: string[], index: number) => {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Flag ${args[index]} benoetigt einen Wert.`);
  return value;
};

const parseArgs = async (argv: string[]): Promise<ParsedArgs> => {
  const options: Partial<ParsedArgs> = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      case "--input":
        options.inputPath = readFlagValue(argv, index);
        index += 1;
        break;
      case "--archive-root":
        options.archiveRoot = readFlagValue(argv, index);
        index += 1;
        break;
      case "--year": {
        const year = Number(readFlagValue(argv, index));
        if (!Number.isInteger(year) || year < 2000 || year > 3000) throw new Error("--year muss ein vierstelliges Jahr sein.");
        options.year = year;
        index += 1;
        break;
      }
      case "--apply":
        options.apply = true;
        break;
      case "--selection":
        options.selection = await readSelectionFile(readFlagValue(argv, index));
        index += 1;
        break;
      case "--backfill-search-indexes":
        options.backfillSearchIndexes = true;
        break;
      case "--set-imported-as-current":
        options.setImportedAsCurrent = true;
        break;
      case "--set-imported-as-monthly":
        options.setImportedAsMonthly = readFlagValue(argv, index);
        index += 1;
        break;
      case "--replace-monthly":
        options.replaceMonthly = true;
        break;
      case "--allow-current-rollback":
        options.allowCurrentRollback = true;
        break;
      default:
        throw new Error(`Unbekanntes Argument: ${arg}`);
    }
  }

  if (!options.archiveRoot) throw new Error("--archive-root fehlt.");
  if (!options.year) throw new Error("--year fehlt.");
  if (!options.inputPath && !options.backfillSearchIndexes && !options.selection) {
    throw new Error("Nichts zu planen: --input, --backfill-search-indexes oder --selection angeben.");
  }
  if (options.setImportedAsCurrent && !options.inputPath) throw new Error("--set-imported-as-current benoetigt --input.");
  if (options.setImportedAsMonthly && !options.inputPath) throw new Error("--set-imported-as-monthly benoetigt --input.");

  return options as ParsedArgs;
};

const summarizePlan = (plan: Awaited<ReturnType<typeof createScanArchiveBuildPlan>>, apply: boolean) => ({
  mode: apply ? "apply" : "dry-run",
  archiveRoot: plan.archiveRoot,
  year: plan.year,
  batches: plan.batches.map((batch) => ({
    id: batch.id,
    server: batch.server,
    timestampUtc: batch.timestampUtc,
    rawPath: batch.path,
    searchIndexPath: batch.searchIndexPath,
    playerCount: batch.players.length,
    groupCount: batch.groups.length,
  })),
  files: plan.files.map((file) => ({
    kind: file.kind,
    scanId: file.scanId,
    path: file.relativePath,
    action: file.action,
    compressedBytes: file.compressedBytes,
    sha256: file.sha256,
  })),
  toplistChanges: plan.toplistChanges,
  summary: plan.summary,
  warnings: plan.warnings,
  conflicts: plan.conflicts,
  manifestRevision: {
    from: plan.manifestBefore.revision,
    to: plan.manifestAfter.revision,
  },
});

try {
  const args = await parseArgs(process.argv.slice(2));
  const plan = await createScanArchiveBuildPlan(args);
  if (plan.conflicts.length) {
    console.log(JSON.stringify(summarizePlan(plan, args.apply), null, 2));
    process.exitCode = 2;
  } else {
    if (args.apply) await applyScanArchiveBuildPlan(plan);
    console.log(JSON.stringify(summarizePlan(plan, args.apply), null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error(usage());
  process.exitCode = 1;
}
