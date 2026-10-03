import { resolveScanArchiveMonthlyToplistScan } from "./toplistSelection";
import type {
  ScanArchiveBuilderBlocker,
  ScanArchiveBuilderInspection,
  ScanArchiveBuilderManifestSource,
  ScanArchiveBuilderUsageMode,
} from "./scanArchiveBuilderTypes";
import type { ScanArchiveManifest } from "./types";

export type ScanArchiveBuilderManifestState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "ready"; manifest: ScanArchiveManifest; source: ScanArchiveBuilderManifestSource }
  | { status: "error"; blocker: ScanArchiveBuilderBlocker };

const blocker = (code: string, cause: string, remedy: string): ScanArchiveBuilderBlocker => ({ code, cause, remedy });

// These blockers depend on the current input/manifest or mode, not the last build.
export const evaluateScanArchiveBuilderInput = (options: {
  inputSelected: boolean;
  inspection: ScanArchiveBuilderInspection | null;
  inspectionError: ScanArchiveBuilderBlocker | null;
  manifestState: ScanArchiveBuilderManifestState;
  usageMode: ScanArchiveBuilderUsageMode | null;
  busy: boolean;
}): { blockers: ScanArchiveBuilderBlocker[]; canBuild: boolean } => {
  const { inputSelected, inspection, inspectionError, manifestState, usageMode, busy } = options;
  const items: ScanArchiveBuilderBlocker[] = [];
  if (!inputSelected) items.push(blocker("input_missing", "No SFtools JSON file is selected.", "Choose the raw export file first."));
  if (inspectionError) items.push(inspectionError);
  if (inspection?.blockers.length) items.push(...inspection.blockers);
  if (manifestState.status === "error") items.push(manifestState.blocker);
  if (inspection && !inspection.blockers.length && inspection.years.length === 1 && manifestState.status === "ready" && manifestState.manifest.archiveYear !== inspection.years[0]) {
    items.push(blocker("manifest_year_mismatch", "The manifest year does not match the input file year.", "Load the matching catalog manifest or override."));
  }
  if (inputSelected && inspection && !inspection.blockers.length && manifestState.status === "ready" && !usageMode) {
    items.push(blocker("usage_mode_missing", "No import mode is selected.", "Choose Create monthly scan, Add to monthly scan, or Archive as DataHub scan only."));
  }
  if (inspection && !inspection.blockers.length && manifestState.status === "idle") {
    items.push(blocker("manifest_missing", "No valid source manifest is loaded.", "Load the catalog manifest or upload a matching manifest override."));
  }
  if (usageMode === "add-monthly" && manifestState.status === "ready") {
    for (const target of inspection?.targets ?? []) {
      try {
        const selected = resolveScanArchiveMonthlyToplistScan([manifestState.manifest], target.server, target.month);
        if (selected.status !== "selected") items.push(blocker("add_target_missing", `No monthly set exists for ${target.server}/${target.month}.`, "Use Create monthly scan first."));
      } catch (caught) {
        items.push(blocker("add_reference_invalid", `${target.server}/${target.month}: ${caught instanceof Error ? caught.message : String(caught)}`, "Correct the monthly reference in the source manifest."));
      }
    }
  }
  return {
    blockers: items,
    canBuild: Boolean(inputSelected && inspection && manifestState.status === "ready" && items.length === 0 && !busy),
  };
};
