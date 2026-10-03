import type { ScanArchiveBatch, ScanArchiveBuilderConflict, ScanArchiveJsonRecord } from "./archiveBuilderCore";
import type { ScanArchiveManifest, ScanArchiveManifestScan } from "./types";
import { resolveScanArchiveMonthlyToplistScan } from "./toplistSelection";
import { validateScanArchivePayload } from "./validation";
import { toplistRowIdentity } from "./toplistRowIdentity";
import { composeMonthlySet, selectMonthlyGuildRow } from "./monthlySetComposition";
import { deriveLocalToplistsFromConfirmedScans } from "../toplists/localToplistDerivation";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "../toplists/localToplistTypes";

export type ScanArchiveBuilderRawPayload = { players: ScanArchiveJsonRecord[]; groups: ScanArchiveJsonRecord[] };
export type ScanArchiveBuilderMonthlyTarget = {
  server: string;
  month: string;
  baseMembers: Array<{ id: string; sha256: string }>;
  skippedPlayers: number;
  skippedGuilds: number;
  duplicatePlayers: number;
  duplicateGuilds: number;
  addedPlayers: number;
  addedGuilds: number;
  updatedPlayers: number;
  updatedGuilds: number;
};

export const scanArchiveBuilderMonth = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 7);
export const scanArchiveBuilderTargetKey = (server: string, month: string) => `${server}/${month}`;

export function scanArchiveBuilderTargets(batches: readonly ScanArchiveBatch[]): ScanArchiveBuilderMonthlyTarget[] {
  const targets = new Map<string, ScanArchiveBuilderMonthlyTarget>();
  for (const batch of batches) {
    const month = scanArchiveBuilderMonth(batch.timestamp);
    const key = scanArchiveBuilderTargetKey(batch.server, month);
    if (!targets.has(key)) targets.set(key, {
      server: batch.server, month, baseMembers: [], skippedPlayers: 0, skippedGuilds: 0,
      duplicatePlayers: 0, duplicateGuilds: 0, addedPlayers: 0, addedGuilds: 0, updatedPlayers: 0, updatedGuilds: 0,
    });
  }
  return [...targets.values()].sort((a, b) => a.month.localeCompare(b.month) || a.server.localeCompare(b.server));
}

const identifierFor = (row: ScanArchiveJsonRecord) => {
  const identifier = row.identifier;
  if ((typeof identifier !== "string" && typeof identifier !== "number") || !String(identifier).trim()) {
    throw new Error("Raw-Zeile enthaelt keinen gueltigen Identifier.");
  }
  return String(identifier).trim();
};

type MonthlySnapshot = { playerRows: LocalPlayerToplistRow[]; guildRows: LocalGuildToplistRow[] };

const deriveMonthlySnapshot = (scan: Pick<ScanArchiveManifestScan, "id" | "server" | "timestamp">, payload: ScanArchiveBuilderRawPayload): MonthlySnapshot => {
  // Sources stay inside the existing builder worker. Completeness is assessed
  // on the unfiltered source, using the same derivation as the toplist service.
  const archiveSha256 = "0".repeat(64);
  const derived = deriveLocalToplistsFromConfirmedScans([{
    manifestYear: new Date(scan.timestamp).getUTCFullYear(), archiveScanId: scan.id, archiveSha256,
    server: scan.server, scanTimestamp: scan.timestamp, localScanId: scan.id, rawScan: payload,
    confirmation: { kind: "archiveSource", archiveScanId: scan.id, archiveSha256 },
  }]);
  return { playerRows: derived.players, guildRows: derived.guilds };
};

export async function prepareScanArchiveMonthlyAdd(
  manifest: ScanArchiveManifest,
  batches: readonly ScanArchiveBatch[],
  targets: ScanArchiveBuilderMonthlyTarget[],
  conflicts: ScanArchiveBuilderConflict[],
  loadRaw?: (scan: ScanArchiveManifestScan) => Promise<ScanArchiveBuilderRawPayload>,
  onMember?: (scan: ScanArchiveManifestScan, current: number, total: number) => void,
): Promise<ScanArchiveBatch[]> {
  const baseline = new Map<string, { players: Set<string>; groups: Set<string>; snapshots: MonthlySnapshot[] }>();
  // Resolve every affected target first. Never filter using a partial baseline.
  for (const target of targets) {
    const label = scanArchiveBuilderTargetKey(target.server, target.month);
    try {
      const selected = resolveScanArchiveMonthlyToplistScan([manifest], target.server, target.month);
      if (selected.status !== "selected") {
        conflicts.push({ code: "add_target_missing", message: `Add-Ziel ${label}: kein referenziertes Monatsset. Zuerst Create monthly scan ausfuehren.` });
        continue;
      }
      target.baseMembers = selected.scans.map(({ id, sha256 }) => ({ id, sha256 }));
      baseline.set(label, { players: new Set(), groups: new Set(), snapshots: [] });
    } catch (error) {
      conflicts.push({ code: "add_reference_invalid", message: `Add-Ziel ${label}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  const total = targets.reduce((count, target) => count + target.baseMembers.length, 0);
  let current = 0;
  for (const target of targets) {
    const label = scanArchiveBuilderTargetKey(target.server, target.month);
    const ids = baseline.get(label);
    if (!ids) continue;
    for (const member of target.baseMembers) {
      const scan = manifest.scans.find((entry) => entry.id === member.id)!;
      onMember?.(scan, current++, total);
      try {
        if (!loadRaw) throw new Error("Kein Local-first-Lader fuer das Ausgangsset verfuegbar.");
        const payload = await loadRaw(scan);
        validateScanArchivePayload(payload, scan);
        ids.snapshots.push(deriveMonthlySnapshot(scan, payload));
        for (const kind of ["players", "groups"] as const) {
          for (const row of payload[kind]) ids[kind].add(toplistRowIdentity(scan.server, identifierFor(row), kind));
        }
      } catch (error) {
        conflicts.push({ code: "add_member_unavailable", scanId: scan.id,
          message: `Add-Ziel ${label}, Set-Mitglied ${scan.id} (SHA ${scan.sha256}): ${error instanceof Error ? error.message : String(error)}. Archivdatei/Verbindung und gueltige lokale Bindung pruefen.` });
      }
    }
  }
  if (conflicts.length) return [];

  const keptByBatch = new Map(batches.map((batch) => [batch.id, { ...batch, players: [], groups: [] } as ScanArchiveBatch]));
  const originalRows = new Map(batches.map(batch => {
    const index = { players: new Map<string, ScanArchiveJsonRecord>(), groups: new Map<string, ScanArchiveJsonRecord>() };
    for (const kind of ["players", "groups"] as const) for (const row of batch[kind]) {
      const identifier = identifierFor(row);
      if (!index[kind].has(identifier)) index[kind].set(identifier, row);
    }
    return [batch.id, index] as const;
  }));
  for (const target of targets) {
    const ids = baseline.get(scanArchiveBuilderTargetKey(target.server, target.month))!;
    const candidates = batches.filter((batch) => batch.server === target.server && scanArchiveBuilderMonth(batch.timestamp) === target.month);
    const incomingSnapshots = candidates.map(batch => deriveMonthlySnapshot(batch, batch));
    const incoming = composeMonthlySet(incomingSnapshots);
    const base = composeMonthlySet(ids.snapshots);
    const baseGuilds = new Map(base.guildRows.map(row => [toplistRowIdentity(row.server, row.guildIdentifier, "groups"), row]));
    const retainedGuilds = incoming.guildRows.filter(row => {
      const key = toplistRowIdentity(row.server, row.guildIdentifier, "groups");
      if (!ids.groups.has(key)) return true;
      const previous = baseGuilds.get(key);
      return row.memberBasisStatus === "complete" && (!previous || selectMonthlyGuildRow(previous, row) === row);
    });
    const promotedMembers = new Set(retainedGuilds.filter(row => row.memberBasisStatus === "complete")
      .flatMap(row => (row.memberPlayerIdentifiers ?? []).map(identifier => `${row.archiveScanId}\u0000${identifier}`)));
    const playerSources = new Map<string, LocalPlayerToplistRow>();
    for (const row of incoming.playerRows) {
      if (!ids.players.has(toplistRowIdentity(row.server, row.identifier, "players"))) playerSources.set(`${row.archiveScanId}\u0000${row.identifier}`, row);
    }
    // Preserve each adopted guild's exact physical member rows, including
    // members that also occur in another selected guild source.
    for (const snapshot of incomingSnapshots) for (const row of snapshot.playerRows) {
      if (promotedMembers.has(`${row.archiveScanId}\u0000${row.identifier}`)) playerSources.set(`${row.archiveScanId}\u0000${row.identifier}`, row);
    }
    const retainedPlayers = [...playerSources.values()];
    for (const [kind, rows] of [["players", retainedPlayers], ["groups", retainedGuilds]] as const) {
      const retainedKeys = new Set<string>();
      const seenIncoming = new Set<string>();
      let duplicates = 0;
      for (const batch of candidates) for (const raw of batch[kind]) {
        const key = toplistRowIdentity(batch.server, identifierFor(raw), kind);
        if (seenIncoming.has(key)) duplicates++;
        seenIncoming.add(key);
      }
      for (const row of rows) {
        const identifier = "guildIdentifier" in row && kind === "groups" ? row.guildIdentifier! : (row as LocalPlayerToplistRow).identifier;
        const key = toplistRowIdentity(row.server, identifier, kind);
        const raw = originalRows.get(row.archiveScanId)?.[kind].get(identifier);
        if (!raw) throw new Error(`Ausgewaehlte ${kind}-Row fehlt im urspruenglichen Batch ${row.archiveScanId}.`);
        keptByBatch.get(row.archiveScanId)![kind].push(raw);
        retainedKeys.add(key);
      }
      const skipped = [...seenIncoming].filter(key => ids[kind].has(key) && !retainedKeys.has(key)).length;
      const updated = [...retainedKeys].filter(key => ids[kind].has(key)).length;
      if (kind === "players") {
        target.skippedPlayers = skipped; target.duplicatePlayers = duplicates; target.addedPlayers = retainedKeys.size - updated; target.updatedPlayers = updated;
      } else {
        target.skippedGuilds = skipped; target.duplicateGuilds = duplicates; target.addedGuilds = retainedKeys.size - updated; target.updatedGuilds = updated;
      }
    }
  }
  const kept = [...keptByBatch.values()].filter((batch) => batch.players.length || batch.groups.length);
  if (!kept.length) conflicts.push({ code: "add_no_new_ids", message: "Keine neuen IDs und kein uebernehmbarer vollstaendiger Gildenstand. Kein Add-ZIP." });
  return kept;
}
