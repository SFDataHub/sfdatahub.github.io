import type { ScanArchiveBuilderBlocker } from "./scanArchiveBuilderTypes";

export class ScanArchiveBuilderValidationError extends Error {
  constructor(readonly blocker: ScanArchiveBuilderBlocker) {
    super(blocker.cause);
    this.name = "ScanArchiveBuilderValidationError";
  }
}

export const scanArchiveBuilderBlockerFromError = (
  error: unknown,
  scope: "input" | "build" = "input",
): ScanArchiveBuilderBlocker => {
  if (error instanceof ScanArchiveBuilderValidationError) return error.blocker;
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: scope === "input" ? "input_validation_failed" : "build_failed",
    cause: message || "Die Datei konnte nicht als Scan-Archiv verarbeitet werden.",
    remedy: scope === "input"
      ? "Nutze ein rohes SFtools-JSON mit top-level players[] und groups[] fuer genau ein Archivjahr."
      : "Pruefe den gewaehlten Modus, das Manifest und die genannten Archivdateien.",
  };
};
