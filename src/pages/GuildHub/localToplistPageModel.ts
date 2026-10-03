import { loadScanArchiveCatalog } from "../../lib/scanArchive/client";
import {
  collectArchiveEntriesForSearchResults,
  collectScanArchiveEntriesFromToplistSelections,
  type ScanArchiveSearchHit,
} from "../../lib/scanArchive/searchIndexService";
import {
  resolveScanArchiveCurrentToplistScans,
  type ScanArchiveToplistSelectionResult,
} from "../../lib/scanArchive/toplistSelection";
import type {
  ScanArchiveCatalog,
  ScanArchiveCatalogEntry,
  ScanArchiveEntry,
  ScanArchiveManifest,
} from "../../lib/scanArchive/types";
import { validateScanArchiveManifest } from "../../lib/scanArchive/validation";
import { resolveServer } from "../../lib/servers/serverResolver";
import type { RegionKey, ServerGroupsByRegion } from "../../components/Filters/serverGroups";
import { LOCAL_SERVER_REGISTRY } from "../../data/serverRegistry";
import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
} from "../../lib/toplists/localToplistTypes";

export type GuildHubToplistNavItem = {
  to: string;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
  requiresLocalScans: boolean;
};

export const GUILD_HUB_NAV_ITEMS: readonly GuildHubToplistNavItem[] = [
  {
    to: "/guild-hub/dashboard",
    titleKey: "guildHub.menu.dashboard.title",
    titleFallback: "Dashboard",
    descKey: "guildHub.menu.dashboard.desc",
    descFallback: "Overview & entry",
    requiresLocalScans: true,
  },
  {
    to: "/guild-hub/toplist",
    titleKey: "guildHub.menu.toplist.title",
    titleFallback: "Toplist",
    descKey: "guildHub.menu.toplist.desc",
    descFallback: "Current local rankings",
    requiresLocalScans: false,
  },
  {
    to: "/guild-hub/analytics",
    titleKey: "guildHub.menu.analytics.title",
    titleFallback: "Analytics",
    descKey: "guildHub.menu.analytics.desc",
    descFallback: "Progress, development & comparisons",
    requiresLocalScans: true,
  },
  {
    to: "/guild-hub/fusion-planner",
    titleKey: "guildHub.menu.fusionPlanner.title",
    titleFallback: "Fusion Planner",
    descKey: "guildHub.menu.fusionPlanner.desc",
    descFallback: "Setups & scenarios",
    requiresLocalScans: true,
  },
  {
    to: "/guild-hub/fight-tracking",
    titleKey: "guildHub.menu.fightTracking.title",
    titleFallback: "Fight Tracking",
    descKey: "guildHub.menu.fightTracking.desc",
    descFallback: "Attacks & miss rates",
    requiresLocalScans: false,
  },
  {
    to: "/guild-hub/waitlist",
    titleKey: "guildHub.menu.waitlist.title",
    titleFallback: "Waitlist",
    descKey: "guildHub.menu.waitlist.desc",
    descFallback: "Applicants & slots",
    requiresLocalScans: false,
  },
  {
    to: "/guild-hub/import",
    titleKey: "guildHub.menu.import.title",
    titleFallback: "Import",
    descKey: "guildHub.menu.import.desc",
    descFallback: "Add SF-Tools JSONs locally",
    requiresLocalScans: false,
  },
  {
    to: "/guild-hub/settings",
    titleKey: "guildHub.menu.settings.title",
    titleFallback: "Settings",
    descKey: "guildHub.menu.settings.desc",
    descFallback: "Configure Guild Hub",
    requiresLocalScans: false,
  },
];

export type LocalToplistArchiveContextIssue = {
  code:
    | "catalog-error"
    | "manifest-error"
    | "current-not-defined"
    | "current-conflict"
    | "entry-missing";
  message: string;
  server?: string;
  year?: number;
};

export type LocalToplistServerOption = {
  server: string;
  sourceServer: string;
  label: string;
  archiveScanId: string;
  scanTimestamp: number;
};

export type LocalToplistArchiveContext = {
  status: "complete" | "partial" | "empty";
  catalog: ScanArchiveCatalog | null;
  manifests: ScanArchiveManifest[];
  manifestUrlsByYear: Record<number, string>;
  selections: ScanArchiveToplistSelectionResult[];
  entries: ScanArchiveEntry[];
  serverOptions: LocalToplistServerOption[];
  issues: LocalToplistArchiveContextIssue[];
};

export type LocalToplistAvailabilityState = "available" | "partial" | "unavailable" | "empty";

export type LocalToplistEntryResolution = {
  requestedServerCodes: string[];
  resolvedEntries: ScanArchiveEntry[];
  unavailableServerCodes: string[];
  availabilityState: LocalToplistAvailabilityState;
};

export type LocalToplistServerDefaultSyncDecision = {
  nextDefaultKey: string;
  nextServers: string[] | null;
};

export type LocalToplistViewRequestKeyInput = {
  datasetId: string;
  tab: "players" | "guilds";
  servers: readonly string[];
  playerClasses?: readonly (string | number)[];
  guilds?: readonly string[];
  playerSort: { metricKey: string; direction: "asc" | "desc" };
  guildSort: { metricKey: string; direction: "asc" | "desc" };
  playerValueMode: "base" | "total";
  guildValueMode: "base" | "total";
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const normalizeServerCode = (value: unknown) =>
  resolveServer(String(value ?? ""))?.code ?? String(value ?? "").trim().toUpperCase();

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const normalizeClassSelection = (classes: readonly (string | number)[] | undefined) => [
  ...new Set((classes ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)),
].sort(compareText);

const normalizeGuildSelection = (guilds: readonly string[] | undefined) => [
  ...new Set((guilds ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)),
].sort(compareText);

export function normalizeToplistServerSelection(servers: readonly string[]) {
  return [...new Set(servers.map(normalizeServerCode).filter(Boolean))].sort(compareText);
}

export function equalToplistServerSelection(left: readonly string[], right: readonly string[]) {
  const normalizedLeft = normalizeToplistServerSelection(left);
  const normalizedRight = normalizeToplistServerSelection(right);
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((server, index) => server === normalizedRight[index]);
}

export function buildLocalToplistViewRequestKey(input: LocalToplistViewRequestKeyInput) {
  const servers = normalizeToplistServerSelection(input.servers);
  if (input.tab === "players") {
    return JSON.stringify({
      datasetId: input.datasetId,
      tab: input.tab,
      servers,
      playerClasses: normalizeClassSelection(input.playerClasses),
      guilds: normalizeGuildSelection(input.guilds),
      sort: input.playerSort,
      playerValueMode: input.playerValueMode,
    });
  }

  return JSON.stringify({
    datasetId: input.datasetId,
    tab: input.tab,
    servers,
    sort: input.guildSort,
    guildValueMode: input.guildValueMode,
  });
}

export function resolveToplistServerDefaultSync(input: {
  activeDefaultKey: string;
  previousDefaultKey: string | null;
  activeGuildServer: string | null;
  defaultServers: readonly string[];
  currentServers: readonly string[];
}): LocalToplistServerDefaultSyncDecision {
  if (input.activeDefaultKey === input.previousDefaultKey) {
    return { nextDefaultKey: input.previousDefaultKey, nextServers: null };
  }

  const targetServers = input.activeGuildServer ? [input.activeGuildServer] : input.defaultServers;
  const normalizedTarget = normalizeToplistServerSelection(targetServers);
  return {
    nextDefaultKey: input.activeDefaultKey,
    nextServers: equalToplistServerSelection(input.currentServers, normalizedTarget) ? null : normalizedTarget,
  };
}

const issueMessage = (error: unknown) => error instanceof Error ? error.message : String(error ?? "unknown_error");

const fetchJson = async (fetcher: FetchLike, url: string) => {
  const response = await fetcher(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Fetch failed (${response.status}): ${url}`);
  return response.json() as Promise<unknown>;
};

const loadManifest = async (archive: ScanArchiveCatalogEntry, fetcher: FetchLike) =>
  validateScanArchiveManifest(await fetchJson(fetcher, archive.manifestUrl), archive.year);

const uniqueCurrentServers = (manifests: readonly ScanArchiveManifest[]) => [
  ...new Set(manifests.flatMap((manifest) => Object.keys(manifest.toplists?.current ?? {}))),
].sort(compareText);

export async function loadLocalToplistArchiveContext(
  options: { fetcher?: FetchLike; catalogUrl?: string; signal?: AbortSignal } = {},
): Promise<LocalToplistArchiveContext> {
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const issues: LocalToplistArchiveContextIssue[] = [];
  let catalog: ScanArchiveCatalog | null = null;

  try {
    catalog = await loadScanArchiveCatalog({ fetcher, catalogUrl: options.catalogUrl });
  } catch (error) {
    return {
      status: "empty",
      catalog: null,
      manifests: [],
      manifestUrlsByYear: {},
      selections: [],
      entries: [],
      serverOptions: [],
      issues: [{ code: "catalog-error", message: issueMessage(error) }],
    };
  }

  const activeArchives = catalog.archives.filter((archive) => archive.active);
  const manifestUrlsByYear = Object.fromEntries(activeArchives.map((archive) => [archive.year, archive.manifestUrl]));
  const manifestResults = await Promise.all(activeArchives.map(async (archive) => {
    try {
      options.signal?.throwIfAborted();
      return { archive, manifest: await loadManifest(archive, fetcher) };
    } catch (error) {
      issues.push({ code: "manifest-error", year: archive.year, message: issueMessage(error) });
      return null;
    }
  }));
  const manifests = manifestResults.flatMap((result) => result?.manifest ? [result.manifest] : []);
  const servers = uniqueCurrentServers(manifests);
  const selectedByServer = resolveScanArchiveCurrentToplistScans(manifests, servers);
  const selections = Object.values(selectedByServer);

  selections.forEach((selection) => {
    if (selection.status === "not-defined") {
      issues.push({ code: "current-not-defined", server: selection.server, message: `No current toplist selection for ${selection.server}.` });
    } else if (selection.status === "conflict") {
      issues.push({ code: "current-conflict", server: selection.server, message: `Conflicting current toplist selection for ${selection.server}.` });
    }
  });

  const entries = collectScanArchiveEntriesFromToplistSelections(selections, manifestUrlsByYear);
  const serverOptions = [
    ...entries.reduce((byServer, entry) => {
      const server = normalizeServerCode(entry.server);
      const resolved = resolveServer(entry.server);
      const existing = byServer.get(server);
      const option = {
        server,
        sourceServer: entry.server,
        label: resolved?.displayName ?? server,
        archiveScanId: entry.toplistSetScanIds?.length ? entry.toplistSetScanIds.join("+") : entry.id,
        scanTimestamp: entry.timestamp,
      };
      if (!existing || option.scanTimestamp > existing.scanTimestamp) byServer.set(server, option);
      return byServer;
    }, new Map<string, LocalToplistServerOption>()).values(),
  ].sort((left, right) => compareText(left.label, right.label));

  return {
    status: issues.length ? (entries.length ? "partial" : "empty") : entries.length ? "complete" : "empty",
    catalog,
    manifests,
    manifestUrlsByYear,
    selections,
    entries,
    serverOptions,
    issues,
  };
}

export function selectEntriesForServers(
  entries: readonly ScanArchiveEntry[],
  selectedServers: readonly string[],
) {
  const selected = new Set(selectedServers.map(normalizeServerCode).filter(Boolean));
  if (!selected.size) return [...entries];
  return entries.filter((entry) => selected.has(normalizeServerCode(entry.server)));
}

export function resolveSelectedToplistEntries(
  entries: readonly ScanArchiveEntry[],
  selectedServers: readonly string[],
): LocalToplistEntryResolution {
  const requestedServerCodes = normalizeToplistServerSelection(selectedServers);
  if (!requestedServerCodes.length) {
    return {
      requestedServerCodes,
      resolvedEntries: [],
      unavailableServerCodes: [],
      availabilityState: "empty",
    };
  }

  const resolvedEntries = selectEntriesForServers(entries, requestedServerCodes);
  const resolvedServers = new Set(resolvedEntries.map((entry) => normalizeServerCode(entry.server)));
  const unavailableServerCodes = requestedServerCodes.filter((server) => !resolvedServers.has(server));
  const availabilityState = resolvedEntries.length
    ? unavailableServerCodes.length ? "partial" : "available"
    : "unavailable";

  return {
    requestedServerCodes,
    resolvedEntries,
    unavailableServerCodes,
    availabilityState,
  };
}

export function collectEntriesForSearchHits(
  hits: readonly ScanArchiveSearchHit[],
  entries: readonly ScanArchiveEntry[],
) {
  return collectArchiveEntriesForSearchResults(hits, entries);
}

export function createSearchHitIdentitySet(hits: readonly ScanArchiveSearchHit[]) {
  return new Set(hits.map((hit) => `${normalizeServerCode(hit.server)}\u0000${hit.identifier.toLowerCase()}`));
}

export function filterPlayerRowsBySearchHits(
  rows: readonly LocalPlayerToplistRow[],
  hits: readonly ScanArchiveSearchHit[],
) {
  const keys = createSearchHitIdentitySet(hits.filter((hit) => hit.kind === "player"));
  if (!keys.size) return [];
  return rows.filter((row) => keys.has(`${normalizeServerCode(row.server)}\u0000${row.identifier.toLowerCase()}`));
}

export function filterGuildRowsBySearchHits(
  rows: readonly LocalGuildToplistRow[],
  hits: readonly ScanArchiveSearchHit[],
) {
  const keys = createSearchHitIdentitySet(hits.filter((hit) => hit.kind === "guild"));
  if (!keys.size) return [];
  return rows.filter((row) => keys.has(`${normalizeServerCode(row.server)}\u0000${row.guildIdentifier.toLowerCase()}`));
}

export function defaultSelectedToplistServers(options: readonly LocalToplistServerOption[]) {
  return options.map((option) => option.server);
}

const regionFromRegistry = (region: string, type: string): RegionKey => {
  if (type === "named") return "INT";
  if (type === "fusion") return "Fusion";
  if (region.toUpperCase() === "EU") return "EU";
  if (["AM", "US", "NA"].includes(region.toUpperCase())) return "US";
  return "INT";
};

export function buildToplistServerGroupsFromRegistry(_options: readonly LocalToplistServerOption[] = []): ServerGroupsByRegion {
  const groups: ServerGroupsByRegion = { EU: [], US: [], INT: [], Fusion: [] };
  for (const server of LOCAL_SERVER_REGISTRY) {
    if (!server.active) continue;
    const code = normalizeServerCode(server.code);
    groups[regionFromRegistry(server.region, server.type)].push(code);
  }
  for (const region of Object.keys(groups) as RegionKey[]) {
    groups[region].sort(compareText);
  }
  return groups;
}

export function resolveActiveGuildToplistServer(activeGuildServer: unknown) {
  return normalizeServerCode(activeGuildServer);
}
