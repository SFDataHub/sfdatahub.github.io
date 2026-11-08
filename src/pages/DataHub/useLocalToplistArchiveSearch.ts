import { auditBegin, auditReturn, auditError, auditLeave, auditFields, auditObserveInputs, auditResultId, auditDependencyId } from "../../lib/data-hub/runtimeAudit";
import { useEffect, useMemo, useState, useRef } from "react";
import { selectHubSearchArchiveBasis } from "../../lib/data-hub/hubSearchService";
import { loadScanArchiveSearchIndexSet, type ScanArchiveSearchIndexLoadResult } from "../../lib/scanArchive/searchIndexService";
import { resolveServer } from "../../lib/servers/serverResolver";
import { getClassMetaById } from "../../data/classes";
import { searchClassId } from "../../lib/data-hub/hubSearchAppearance";
import { LOCAL_TOPLIST_SEARCH_MIN_CHARS, LOCAL_TOPLIST_SEARCH_RESULT_LIMIT, type LocalToplistSearchResult } from "../../lib/toplists/localToplistViewWorkerTypes";
import type { LocalToplistArchiveContext } from "./localToplistPageModel";

/** Only declared archive sidecars enter preparation. No local inventory, raw,
 * identity projection, profile or table acquisition is needed to find a hit. */
export function useLocalToplistArchiveSearch(context: LocalToplistArchiveContext | null, month: string | null, text: string, refresh: number, active = true) {
  const basis = useMemo(() => context ? selectHubSearchArchiveBasis(month
    ? { kind: "historical", from: month, to: month, server: "" } : { kind: "current" },
    context.manifests, context.manifestUrlsByYear, context.issues.filter(i => i.code === "catalog-error" || i.code === "manifest-error").length) : null, [context, month]);
  const key = JSON.stringify([month, basis?.entries, basis?.failed, basis?.unknown, refresh]);
  const enabled = active && text.trim().length >= LOCAL_TOPLIST_SEARCH_MIN_CHARS;
  const [loaded, setLoaded] = useState<{ key: string; result?: ScanArchiveSearchIndexLoadResult; error?: string }>();
  useEffect(() => {
    if (!enabled || !basis) return;
    const abort = new AbortController();
    void loadScanArchiveSearchIndexSet(basis.entries, { signal: abort.signal, auditConsumerArea: "Topliste" }).then(result => {
      if (!abort.signal.aborted) setLoaded({ key, result });
    }, error => { if (!abort.signal.aborted) setLoaded({ key, error: String(error) }); });
    return () => abort.abort();
  }, [key, enabled]);
  const result = loaded?.key === key ? loaded.result : undefined;
  const previousObservation = useRef<{ result?: string; text: string; enabled: boolean; basis?: string }>();
  const results = useMemo<LocalToplistSearchResult[]>(() => {
    const __audit1 = auditBegin("F22", "results");
    if (__audit1) {
      const previous = previousObservation.current, resultIdentity = auditDependencyId(result), basisIdentity = auditDependencyId(basis);
      auditFields(__audit1, { active, enabled, resultReady: !!result, sameDependencies: !!previous && previous.result === resultIdentity && previous.text === text && previous.enabled === enabled && previous.basis === basisIdentity, textChanged: !!previous && previous.text !== text, basisChanged: !!previous && previous.basis !== basisIdentity, resultChanged: !!previous && previous.result !== resultIdentity });
      previousObservation.current = { result: resultIdentity, text, enabled, basis: basisIdentity };
      auditObserveInputs(__audit1, [result]);
    }
    try {
    if (!result || !enabled) return auditReturn(__audit1, []);
    const hits: LocalToplistSearchResult[] = [...result.searchSet.searchPlayers(text, { limit: LOCAL_TOPLIST_SEARCH_RESULT_LIMIT }), ...result.searchSet.searchGuilds(text, { limit: LOCAL_TOPLIST_SEARCH_RESULT_LIMIT })].map(hit => ({
      kind: hit.kind, id: `${hit.server}:${hit.identifier}`, label: hit.name, server: hit.server, identifier: hit.identifier,
      status: "jumpable", score: 0, archive: hit, appearance: hit.appearance,
      className: hit.kind === "player" ? getClassMetaById(hit.appearance?.classId ?? searchClassId(hit.classId))?.label : null,
      guildName: hit.kind === "player" ? hit.guildName : null,
    }));
    const query = text.trim().normalize("NFKC").toLowerCase();
    for (const server of new Set(basis?.entries.map(e => e.server))) {
      const resolved = resolveServer(server);
      if (![server, resolved?.code, resolved?.displayName].some(s => s?.toLowerCase().includes(query))) continue;
      hits.push({ kind: "server", id: server, label: resolved?.displayName ?? server, server, identifier: server, status: "jumpable", score: 0 });
    }
    return auditReturn(__audit1, hits.filter(hit => hit.kind !== "server").concat(hits.filter(hit => hit.kind === "server").slice(0, LOCAL_TOPLIST_SEARCH_RESULT_LIMIT)));

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}, [result, text, enabled, basis]);
  return { key, results, auditPreparationId: auditResultId(result), loading: enabled && (!basis || !loaded || loaded.key !== key),
    incomplete: !!basis && (!!basis.failed || !!basis.unknown || !!result?.failedIndexes.length),
    error: loaded?.key === key ? loaded.error : undefined };
}
