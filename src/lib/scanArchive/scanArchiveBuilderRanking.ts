import { LOCAL_SCAN_CORE_NORMALIZER_VERSION } from "../guilds/localSourceValidity";
import { GUILD_SCAN_NORMALIZER_VERSION } from "../guilds/guildScanNormalizer";
import {
  calculateMonthlyRankings, composeRankingSnapshots, deriveRankingSnapshot, rankingPath, rankingPoolForMonth,
  validateMonthlyRanking, verifyStoredMonthlyRankingRanks, type MonthlyRankingPayload, type RankingSnapshot,
} from "./monthlyRanking";
import { validateScanArchivePayload } from "./validation";
import type { ScanArchiveBuilderCoreDependencies, ScanArchiveBuilderCoreOptions, ScanArchiveBatch, ScanArchivePlannedFile } from "./archiveBuilderCore";
import type { ScanArchiveManifest, ScanArchiveManifestScan } from "./types";
import type { ScanArchiveBuilderRawPayload, ScanArchiveBuilderMonthlyTarget } from "./scanArchiveBuilderMonthly";

/** One projection per physical input; complete v2 baselines reuse stored observations. */
export function createMonthlyRankingPreparation<TBytes>(options: ScanArchiveBuilderCoreOptions<TBytes>, dependencies: ScanArchiveBuilderCoreDependencies<TBytes>) {
  const snapshots = new Map<string, RankingSnapshot>();
  const inputSnapshots = new Map<string, RankingSnapshot>();
  const baseline = new Map<string, RankingSnapshot>();
  const legacySources = new Map<string, string[]>();
  const rawLoads = new Map<string, Promise<ScanArchiveBuilderRawPayload>>();
  const loadRaw = (scan: ScanArchiveManifestScan) => {
    let pending = rawLoads.get(scan.id);
    if (!pending) {
      pending = (async () => {
        if (!options.loadMonthlyRawScan) throw new Error(`Ranking ${scan.server}/${new Date(scan.timestamp).toISOString().slice(0, 7)}, Set-Mitglied ${scan.id} (SHA ${scan.sha256}): Monatsdaten fehlen. Archivdatei/Verbindung pruefen.`);
        try {
          const raw = await options.loadMonthlyRawScan(scan);
          validateScanArchivePayload(raw, scan);
          return raw;
        } catch (error) {
          throw new Error(`${scan.id}, ${scan.path} (SHA ${scan.sha256}): ${error instanceof Error ? error.message : String(error)}`);
        }
      })();
      rawLoads.set(scan.id, pending);
    }
    return pending;
  };
  const snapshot = async (scan: Pick<ScanArchiveManifestScan, "id" | "server" | "timestamp"> & Partial<ScanArchiveManifestScan>, payload?: ScanArchiveBuilderRawPayload) => {
    const cache = payload && "id" in payload ? inputSnapshots : snapshots;
    let result = cache.get(scan.id);
    if (!result) {
      result = deriveRankingSnapshot({ ...scan, sha256: scan.sha256 ?? "0".repeat(64) }, payload ?? await loadRaw(scan as ScanArchiveManifestScan)); cache.set(scan.id, result);
    }
    return result;
  };
  const cohortFor = async (month: string, pool: ReturnType<typeof rankingPoolForMonth>, version: 1 | 2 = 2) => dependencies.sha256(await dependencies.gzip(JSON.stringify({
    projection: `monthly-ranking.v${version}`, coreNormalizerVersion: LOCAL_SCAN_CORE_NORMALIZER_VERSION,
    guildNormalizerVersion: GUILD_SCAN_NORMALIZER_VERSION, month, pool,
  })));
  const prepare = async (manifest: ScanArchiveManifest, targets: ScanArchiveBuilderMonthlyTarget[]) => {
    const months = [...new Set(targets.map(t => t.month))];
    for (const month of months) {
      const pool = rankingPoolForMonth(manifest, month);
      const loaded: MonthlyRankingPayload[] = [];
      const version = Object.values(manifest.rankings?.[month] ?? {})[0]?.schemaVersion;
      const expectedCohort = version ? await cohortFor(month, pool, version) : undefined;
      for (const { server, sources } of pool) {
        if (options.usageMode === "create-monthly" && targets.some(t => t.month === month && t.server === server)) continue;
        if (options.usageMode === "add-monthly" && !manifest.rankings?.[month]?.[server] && targets.some(t => t.month === month && t.server === server)) {
          legacySources.set(`${month}/${server}`, sources.map(s => s.id));
          continue;
        }
        options.onProgress?.({ phase: "loading-monthly", message: `Rankinggrundlage ${month}/${server} wird geprueft.` });
        const ref = manifest.rankings?.[month]?.[server];
        let rows: RankingSnapshot;
        if (ref) {
          if (ref.cohortId !== expectedCohort) throw new Error(`Ranking ${month}/${server}: Gesamtstandskennung passt nicht zu den offiziellen Eingaben.`);
          if (!options.loadMonthlyRankingBytes || !dependencies.gunzip) throw new Error(`Ranking ${month}/${server}: referenzierte Rankingdatei ${ref.path} kann nicht gelesen werden.`);
          const bytes = await options.loadMonthlyRankingBytes(ref);
          if (dependencies.byteLength(bytes) !== ref.compressedBytes || await dependencies.sha256(bytes) !== ref.sha256) throw new Error(`Ranking ${month}/${server}: Hash/Groesse passt nicht zu ${ref.path}.`);
          const json = await dependencies.gunzip(bytes);
          if (dependencies.utf8ByteLength(json) !== ref.uncompressedBytes) throw new Error(`Ranking ${month}/${server}: entpackte Groesse passt nicht.`);
          const payload = validateMonthlyRanking(JSON.parse(json), { month, server, pool, metadata: ref });
          loaded.push(payload);
          rows = { playerRows: payload.players, guildRows: payload.guilds };
        } else {
          rows = composeRankingSnapshots(await Promise.all(sources.map(source => snapshot(manifest.scans.find(scan => scan.id === source.id)!))));
        }
        baseline.set(`${month}/${server}`, rows);
      }
      if (loaded.length && options.usageMode === "add-monthly") {
        const expectedPlayers = loaded.reduce((n, p) => n + p.players.length, 0), expectedGuilds = loaded.reduce((n, p) => n + p.guilds.length, 0);
        if (loaded.length !== pool.length || loaded.some(p => p.population.globalPlayers !== expectedPlayers || p.population.globalGuilds !== expectedGuilds)) throw new Error(`Ranking ${month}: Gesamtpopulation ist unvollstaendig.`);
        verifyStoredMonthlyRankingRanks(loaded);
      }
      // A v1 pool must be reconstructed completely, including servers outside
      // this upload. Do not produce a mixed pool of proven and unknown sums.
      for (const payload of loaded.filter(p => p.schemaVersion === 1)) {
        const entry = pool.find(p => p.server === payload.server)!;
        const reconstructed = composeRankingSnapshots(await Promise.all(entry.sources.map(source =>
          snapshot(manifest.scans.find(scan => scan.id === source.id)!))));
        // Preserve the exact established selection, physical anchors and all
        // old metrics. Fail closed if the supplied Raw basis cannot prove it.
        const oldFields = (rows: RankingSnapshot) => JSON.stringify(rows, (key, value) =>
          key === "ranks" || key === "baseAllSum" || key === "totalAllSum" ? undefined :
            value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
        const stored = { playerRows: payload.players, guildRows: payload.guilds };
        if (oldFields(stored) !== oldFields(reconstructed)) throw new Error(`Ranking ${month}/${payload.server}: Eingabesets passen nicht.`);
        baseline.set(`${month}/${payload.server}`, reconstructed);
      }
    }
  };
  const baseSnapshot = (target: ScanArchiveBuilderMonthlyTarget) => {
    const key = `${target.month}/${target.server}`;
    const existing = baseline.get(key);
    if (existing) return existing;
    const ids = legacySources.get(key);
    if (ids?.every(id => snapshots.has(id))) {
      const composed = composeRankingSnapshots(ids.map(id => snapshots.get(id)!));
      baseline.set(key, composed); return composed;
    }
    return undefined;
  };
  const emit = async (manifest: ScanArchiveManifest, targets: ScanArchiveBuilderMonthlyTarget[], batches: ScanArchiveBatch[]): Promise<ScanArchivePlannedFile<TBytes>[]> => {
    const files: ScanArchivePlannedFile<TBytes>[] = [];
    const rankings = structuredClone(manifest.rankings ?? {});
    for (const month of [...new Set(targets.map(t => t.month))].sort()) {
      const pool = rankingPoolForMonth(manifest, month);
      const rows = new Map<string, RankingSnapshot>();
      for (const { server, sources } of pool) {
        const target = targets.some(t => t.month === month && t.server === server);
        const before = baseSnapshot({ month, server } as ScanArchiveBuilderMonthlyTarget);
        if (!target) {
          if (!before) throw new Error(`Ranking ${month}/${server}: Grundlage fehlt.`);
          rows.set(server, before); continue;
        }
        const incoming: RankingSnapshot[] = [];
        for (const source of sources) {
          const batch = batches.find(b => b.id === source.id);
          if (!batch) continue;
          const full = await snapshot(manifest.scans.find(scan => scan.id === source.id)!, batch);
          // Add keeps the established filtered Raw bytes. Only adopted rows enter the set.
          const players = new Set(batch.players.map(p => String(p.identifier))), guilds = new Set(batch.groups.map(g => String(g.identifier)));
          incoming.push({ playerRows: full.playerRows.filter(p => players.has(p.identifier)), guildRows: full.guildRows.filter(g => guilds.has(g.guildIdentifier)) });
        }
        if (options.usageMode === "add-monthly" && before) incoming.unshift(before);
        rows.set(server, composeRankingSnapshots(incoming));
      }
      const cohortId = await cohortFor(month, pool);
      const payloads = calculateMonthlyRankings(month, pool, cohortId, rows);
      const refs: NonNullable<ScanArchiveManifest["rankings"]>[string] = {};
      for (const payload of payloads) {
        options.onProgress?.({ phase: "compressing", message: `Monatsranking ${month}/${payload.server} wird komprimiert.` });
        const json = JSON.stringify(payload), bytes = await dependencies.gzip(json), hash = await dependencies.sha256(bytes);
        const path = rankingPath(month, payload.server);
        const ref = { schemaVersion: 2 as const, path, sha256: hash, compressedBytes: dependencies.byteLength(bytes),
          uncompressedBytes: dependencies.utf8ByteLength(json), cohortId, playerCount: payload.players.length, guildCount: payload.guilds.length };
        validateMonthlyRanking(payload, { month, server: payload.server, pool, metadata: ref });
        refs[payload.server] = ref;
        // Fixed monthly paths intentionally replace older rankings, unlike immutable Raw/Search paths.
        const previous = options.manifest.rankings?.[month]?.[payload.server];
        const identical = previous?.sha256 === hash && previous?.cohortId === cohortId;
        files.push({ kind: "ranking", scanId: `${payload.server}/${month}`, relativePath: path, action: identical ? "skip-identical" : "write",
          compressedBytes: ref.compressedBytes, sha256: hash, ...(identical ? {} : { bytes }) });
      }
      rankings[month] = refs;
    }
    manifest.rankings = rankings;
    return files;
  };
  return { prepare, emit, snapshot, loadRaw, baseSnapshot };
}
