import { auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave } from "../data-hub/runtimeAudit";
import type { LocalToplistLoadResult } from "./localToplistService";
import type { ScanArchiveEntry } from "../scanArchive/types";

// Session/composition evidence, independent of persisted derivation version.
export const LOCAL_TOPLIST_CONTENT_CONTRACT = 1;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Compute only when an owner provides a result, never on each render.
 * Two independent 32-bit streams plus canonical string length. No clocks/request counters. */
export function localToplistContentRevision(value: unknown): string {
 const __w32Run0=auditPhaseBegin("localToplistContentRevision");
 const __w32Sync=auditEnter(__w32Run0,"localToplistContentRevision","sync-elapsed");
 try {
  const content = canonical(value);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < content.length; i++) {
    a = Math.imul(a ^ content.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ content.charCodeAt(i);
  }
  return auditReturn(__w32Run0,`content:${LOCAL_TOPLIST_CONTENT_CONTRACT}:${content.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`);

} catch (__w32Error) { auditError(__w32Run0,__w32Error); throw __w32Error; } finally {auditValue(__w32Run0,__w32Sync,undefined);auditLeave(__w32Run0);}
}

const revisions = new WeakMap<LocalToplistLoadResult, string>();
/** Compatibility for existing injected results: memoized by immutable result. */
export function localToplistResultRevision(result: LocalToplistLoadResult): string {
  if (result.contentRevision) return result.contentRevision;
  let revision = revisions.get(result);
  if (!revision) {
    revision = localToplistContentRevision({
      status: result.status, snapshots: result.snapshots,
      playerRows: result.playerRows, guildRows: result.guildRows,
      ready: result.readySelections.map(({ source: _source, ...selection }) => selection),
      failed: result.failedSelections.map(({ message: _message, ...selection }) => selection),
    });
    revisions.set(result, revision);
  }
  return revision;
}

export const localToplistDataContextKey = (datasetId: string, contentRevision: string) =>
  JSON.stringify([datasetId, contentRevision]);

/** Physical request identity stays unchanged. Composition equivalence is a
 * separate reuse prerequisite (implicit and explicit singleton sets agree). */
export function localToplistSelectionRevision(entries: readonly ScanArchiveEntry[], derivationVersion: number) {
  const groups = new Map<string, unknown[]>();
  for (const entry of entries) {
    const physical = `${entry.id.trim()}:${entry.sha256.trim().toLowerCase()}`;
    const key = entry.toplistSetKey ?? physical;
    const members = groups.get(key) ?? [];
    members.push({ physical, server: entry.server, timestamp: entry.timestamp, year: entry.archiveYear,
      expected: [...(entry.toplistSetScanIds ?? [entry.id])].sort() });
    groups.set(key, members);
  }
  return localToplistContentRevision({ derivationVersion,
    sets: [...groups.values()].map(members => members.map(canonical).sort()).sort((a, b) => canonical(a).localeCompare(canonical(b))),
  });
}
