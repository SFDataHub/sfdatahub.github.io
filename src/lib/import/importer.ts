// src/lib/import/importer.ts
import { upsertPlayers, upsertGuilds, upsertScan } from "./upsert";
import type { ImportReport } from "./types";
import { detectPayloadAsync } from "./parsers";

export async function importJsonToDB(json: any): Promise<ImportReport> {
  const t0 = performance.now();
  const report: ImportReport = {
    detectedType: null,
    counts: {},
    errors: [],
    warnings: [],
    durationMs: 0,
  };

  try {
    const res = await detectPayloadAsync(json);
    report.detectedType = res?.type ?? null;

    if (!res) {
      report.errors.push("Konnte Payload-Typ nicht erkennen.");
      report.durationMs = performance.now() - t0;
      return report;
    }

    switch (res.type) {
      case "players": {
        const out = await upsertPlayers(res.raw);
        report.counts.players = out.count ?? out; // falls ältere Version nur Zahl zurückgibt
        break;
      }
      case "guilds": {
        const out = await upsertGuilds(res.raw);
        report.counts.guilds = out.count ?? out;
        break;
      }
      case "scan": {
        const out = await upsertScan(res.raw);
        report.counts.scans = out.scans ?? 0;
        report.counts.players = (report.counts.players ?? 0) + (out.players ?? 0);
        report.counts.guilds = (report.counts.guilds ?? 0) + (out.guilds ?? 0);
        if (out.deduped) report.warnings.push("Scan wurde als Duplikat erkannt (Hash).");
        break;
      }
      default:
        report.errors.push(`Unbekannter Typ: ${res.type}`);
    }
  } catch (e: any) {
    report.errors.push(String(e?.message ?? e));
  } finally {
    report.durationMs = performance.now() - t0;
  }
  return report;
}
