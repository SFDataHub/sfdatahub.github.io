import { hashHubFavoriteRecords } from "../../lib/data-hub/hubFavoritesStore";
import styles from "./GuildScanDetailsOverlay.module.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listFusionIdentityAnalysisScopes } from "../../lib/identities/fusionIdentityScopes";
import { startFusionIdentityWorkerRun } from "../../lib/identities/fusionIdentityWorkerClient";
import { prepareFusionIdentityRosterBatch, executeFusionIdentityRosterBatch, type FusionIdentityRosterBatch, type RosterBatchResult } from "../../lib/identities/fusionIdentityRosterBatch";
import { serverComparisonKey } from "../../lib/servers/serverResolver";
import { revalidateLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import type { collectDashboardComparisonDiagnostic } from "./dashboardComparisonDiagnostic";

type Diagnostic = Awaited<ReturnType<typeof collectDashboardComparisonDiagnostic>>;
type Collect = () => Promise<{ text: string; coherent: boolean; isCurrent: () => boolean }>;
type EvidenceFile = { createWritable(): Promise<{ write(text: string): Promise<void>; close(): Promise<void> }>; getFile(): Promise<{ text(): Promise<string> }> };
type Prepared = { batch: FusionIdentityRosterBatch; diagnostic: Diagnostic };

/** A bounded action on the actually displayed comparison. Uses the existing
 * resolver worker and normal confirmation/store path; never imports decisions. */
export default function ComparisonIdentityBatch({ collect }: { collect: Collect }) {
  const { t } = useTranslation();
  const alive = useRef(true), busy = useRef(false);
  const currentCollect = useRef(collect); currentCollect.current = collect;
  const cancel = useRef<(() => void) | null>(null);
  const [excluded, setExcluded] = useState("");
  const [phase, setPhase] = useState<"idle" | "preparing" | "ready" | "saving" | "finished" | "error">("idle");
  const [message, setMessage] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [result, setResult] = useState<RosterBatchResult | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancel.current?.(); }; }, []);
  const prepare = async () => {
    if (busy.current) return; busy.current = true;
    const request = collect;
    setPhase("preparing"); setMessage(""); setPrepared(null); setResult(null);
    try {
      const diagnostic = await request();
      if (!diagnostic.coherent || !diagnostic.isCurrent()) throw Error("comparison-not-current");
      const evidence: Diagnostic = JSON.parse(diagnostic.text);
      if (!evidence.transfer.historical || evidence.transfer.matrix.length === 0) throw Error("comparison-unavailable");
      const scope = listFusionIdentityAnalysisScopes().find(item => item.targetServerCode === serverComparisonKey(evidence.activeGuild.server) && item.analysisSupported);
      if (!scope) throw Error("matching-scope-unavailable");
      const run = startFusionIdentityWorkerRun({ scope, onProgress: p => { if (alive.current) setMessage(p.message); } });
      cancel.current = run.cancel;
      const resolved = await run.promise;
      if (!alive.current || currentCollect.current !== request || !diagnostic.isCurrent()) throw Error("comparison-context-changed");
      if (!resolved.dependencies || !(await revalidateLocalDataDependencies(evidence.consistency.receipt)).current) throw Error("matching-basis-changed");
      const batch = await prepareFusionIdentityRosterBatch({ report: resolved.report, dependencies: { ...resolved.dependencies, need: { ...resolved.dependencies.need, sourceIds: evidence.consistency.receipt.need.sourceIds } },
        references: evidence.transfer.matrix.map(row => ({ identifier: row.originalKey, name: row.name, side: row.side })),
        excludedIdentifiers: excluded.split(/[\s,;]+/).filter(Boolean) });
      if (!alive.current || currentCollect.current !== request || !diagnostic.isCurrent()) throw Error("comparison-context-changed");
      setPrepared({ batch, diagnostic: evidence }); setPhase("ready"); setMessage("");
    } catch (error) { if (alive.current) { setPhase("error"); setMessage(error instanceof Error ? error.message : String(error)); } }
    finally { busy.current = false; cancel.current = null; }
  };
  const copy = async () => {
    if (!prepared) return;
    const text = JSON.stringify({ schema: "identity-roster-batch-v1", origin: location.origin, before: prepared.diagnostic, manifest: prepared.batch, result }, null, 2);
    try { await navigator.clipboard.writeText(text); } catch { setCopyFallback(text); }
  };
  const save = async () => {
    if (!prepared || busy.current) return; busy.current = true;
    setPhase("saving"); setMessage("");
    const route = window.location.pathname + window.location.search + window.location.hash;
    try {
      // An explicit backup is durable before the first personal identity write.
      // No browser-profile export and no credentials/unrelated source records.
      const picker = (window as unknown as { showSaveFilePicker?: (options: object) => Promise<EvidenceFile> }).showSaveFilePicker;
      if (!picker) throw Error("evidence-file-picker-unavailable");
      const file = await picker.call(window, { suggestedName: "personal-batch.json", types: [{ description: "JSON", accept: { "application/json": [".json"] } }] });
      const evidence = { favoritesBefore: await hashHubFavoriteRecords(), favoritesAfter: null as string | null, schema: "identity-roster-batch-v1", origin: location.origin, route, before: prepared.diagnostic, manifest: prepared.batch, result: null as RosterBatchResult | null };
      const persist = async () => { const writer = await file.createWritable(); await writer.write(JSON.stringify(evidence, null, 2)); await writer.close(); };
      await persist();
      const backup = JSON.parse(await (await file.getFile()).text());
      if (JSON.stringify(backup.manifest) !== JSON.stringify(prepared.batch)) throw Error("identity-backup-verification-failed");
      const completed = await executeFusionIdentityRosterBatch(prepared.batch, {
        isCurrent: () => alive.current && window.location.pathname + window.location.search + window.location.hash === route,
        async onProgress(next) {
          if (next.completedAt) evidence.favoritesAfter = await hashHubFavoriteRecords();
          evidence.result = next; await persist();
          if (alive.current) setResult(next);
        },
      });
      if (!completed.preservation?.unchanged || evidence.favoritesBefore !== evidence.favoritesAfter) throw Error("preservation-check-failed");
      if (alive.current) { setResult(completed); setPhase("finished"); }
    } catch (error) { if (alive.current) { setPhase("error"); setMessage(error instanceof Error ? error.message : String(error)); } }
    finally { busy.current = false; }
  };
  const count = (decision: FusionIdentityRosterBatch["entries"][number]["decision"]) => prepared?.batch.entries.filter(entry => entry.decision === decision).length ?? 0;
  const stored = result?.entries.filter(entry => entry.status === "stored").length ?? 0;
  const failed = result?.entries.filter(entry => entry.status === "failed").length ?? 0;
  const skipped = result?.entries.filter(entry => entry.status === "skipped").length ?? 0;
  return <section className={`${styles.identity} ${styles.batch}`} data-comparison-identity-batch={phase}>
    <h3>{t("identityRosterBatch.title")}</h3>
    <p>{t("identityRosterBatch.scope")}</p>
    <label>{t("identityRosterBatch.excluded")}<input style={{ width: "100%" }} value={excluded} disabled={phase === "preparing" || phase === "saving"} onChange={e => { setExcluded(e.target.value); setPrepared(null); setPhase("idle"); }} /></label>
    <button type="button" disabled={phase === "preparing" || phase === "saving"} onClick={() => void prepare()}>{t("identityRosterBatch.prepare")}</button>
    <p role="status">{t(`identityRosterBatch.phase.${phase}`)} {message}</p>
    {prepared && <>
      <p>{t("identityRosterBatch.counts", { ready: count("ready"), stored: count("stored"), excluded: count("excluded"), unresolved: count("unresolved"), conflicts: count("conflict") })}</p>
      <details><summary>{t("identityRosterBatch.manifest")}</summary><ul>{prepared.batch.entries.map((entry, index) => <li key={index}>
        {entry.references.map(ref => `${ref.name} · ${ref.identifier}`).join(" / ")} → {entry.currentIdentifier ?? "—"} / {entry.historicalIdentifier ?? "—"}: {t(`identityRosterBatch.decision.${entry.decision}`)}
      </li>)}</ul></details>
      <button type="button" onClick={() => void copy()}>{t("identityRosterBatch.copy")}</button>
      {copyFallback && <textarea readOnly rows={8} style={{ width: "100%" }} aria-label={t("identityRosterBatch.manifest")} value={copyFallback} onFocus={event => event.currentTarget.select()} />}
      <button type="button" disabled={phase !== "ready" || !count("ready")} onClick={() => void save()}>{t("identityRosterBatch.save", { count: count("ready") })}</button>
    </>}
    {result && <>{result.preservation && <p>{t(result.preservation.unchanged ? "identityRosterBatch.preserved" : "identityRosterBatch.preservationFailed")}</p>}<p role="status">{t("identityRosterBatch.result", { stored, failed, skipped, processed: result.entries.length, total: count("ready") })}</p>
      {failed > 0 && <ul>{result.entries.filter(entry => entry.status === "failed").map(entry => <li key={entry.currentIdentifier}>{entry.currentIdentifier} / {entry.historicalIdentifier}: {entry.error}</li>)}</ul>}
    </>}
  </section>;
}
