import {
  buildLocalPlayerToplistBaseCohort,
  buildLocalGuildToplistView,
  buildLocalPlayerToplistView,
  LOCAL_PLAYER_TOPLIST_VIEW_LIMIT,
  normalizeLocalToplistServer,
} from "../lib/toplists/localToplistView";
import { LOCAL_SERVER_REGISTRY } from "../data/serverRegistry";
import type {
  LocalToplistSearchCategory,
  LocalToplistSearchResult,
  LocalToplistViewWorkerInitRequest,
  LocalToplistViewWorkerRequest,
  LocalToplistViewWorkerResponse,
  LocalToplistViewWorkerSearchRequest,
  LocalToplistViewWorkerViewRequest,
} from "../lib/toplists/localToplistViewWorkerTypes";
import {
  LOCAL_TOPLIST_SEARCH_MIN_CHARS,
  LOCAL_TOPLIST_SEARCH_RESULT_LIMIT,
} from "../lib/toplists/localToplistViewWorkerTypes";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "../lib/toplists/localToplistTypes";

const normalizeKey = (server: unknown, identifier: unknown) => {
  const serverKey = normalizeLocalToplistServer(server);
  const id = String(identifier ?? "").trim().toLowerCase();
  return serverKey && id ? `${serverKey}\u0000${id}` : null;
};

const GUILD_VIEW_PAGE_LIMIT = 250;

const pageBounds = (page: number, pageSize: number, maxPageSize: number) => {
  const safeSize = Math.min(maxPageSize, Math.max(10, Number.isFinite(pageSize) ? Math.round(pageSize) : 50));
  const safePage = Math.max(1, Number.isFinite(page) ? Math.round(page) : 1);
  return { start: (safePage - 1) * safeSize, end: safePage * safeSize, page: safePage, pageSize: safeSize };
};

const respond = (message: LocalToplistViewWorkerResponse) => {
  globalThis.postMessage(message);
};

let datasetId: string | null = null;
let playerRows: LocalPlayerToplistRow[] = [];
let guildRows: LocalGuildToplistRow[] = [];
let stableTopPlayerKeys = new Set<string>();

type SearchEntry = {
  kind: LocalToplistSearchResult["kind"];
  id: string;
  label: string;
  server: string;
  identifier: string;
  tokens: string[];
  className?: string | null;
  guildName?: string | null;
};

let searchIndexDatasetId: string | null = null;
let searchEntries: SearchEntry[] = [];

const normalizeSearchText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const normalizeIdentifier = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const addUniqueToken = (tokens: string[], value: unknown) => {
  const normalized = normalizeSearchText(value);
  if (normalized && !tokens.includes(normalized)) tokens.push(normalized);
};

const buildSearchIndex = () => {
  const entries: SearchEntry[] = [];

  playerRows.forEach((row) => {
    const server = normalizeLocalToplistServer(row.server) ?? String(row.server ?? "").trim().toUpperCase();
    const identifier = normalizeIdentifier(row.identifier);
    if (!server || !identifier) return;
    const tokens: string[] = [];
    addUniqueToken(tokens, row.name);
    addUniqueToken(tokens, row.identifier);
    addUniqueToken(tokens, server);
    addUniqueToken(tokens, row.guild);
    entries.push({
      kind: "player",
      id: `player:${server}:${identifier}`,
      label: String(row.name ?? "").trim() || identifier,
      server,
      identifier,
      tokens,
      className: row.class,
      guildName: row.guild,
    });
  });

  guildRows.forEach((row) => {
    const server = normalizeLocalToplistServer(row.server) ?? String(row.server ?? "").trim().toUpperCase();
    const identifier = normalizeIdentifier(row.guildId);
    if (!server || !identifier) return;
    const tokens: string[] = [];
    addUniqueToken(tokens, row.name);
    addUniqueToken(tokens, row.guildIdentifier);
    addUniqueToken(tokens, row.guildId);
    addUniqueToken(tokens, server);
    entries.push({
      kind: "guild",
      id: `guild:${server}:${identifier}`,
      label: String(row.name ?? "").trim() || identifier,
      server,
      identifier: `${server.toLowerCase()}__${identifier}`,
      tokens,
    });
  });

  LOCAL_SERVER_REGISTRY
    .filter((server) => server.active)
    .forEach((server) => {
      const code = normalizeLocalToplistServer(server.code) ?? server.code.trim().toUpperCase();
      if (!code) return;
      const tokens: string[] = [];
      addUniqueToken(tokens, server.code);
      addUniqueToken(tokens, server.displayName);
      addUniqueToken(tokens, server.host);
      server.aliases.forEach((alias) => addUniqueToken(tokens, alias));
      entries.push({
        kind: "server",
        id: `server:${code}`,
        label: server.displayName || code,
        server: code,
        identifier: code,
        tokens,
      });
    });

  searchEntries = entries;
  searchIndexDatasetId = datasetId;
};

const matchScore = (tokens: readonly string[], query: string) => {
  let best: number | null = null;
  for (const token of tokens) {
    let score: number | null = null;
    if (token === query) score = 0;
    else if (token.startsWith(query)) score = 1;
    else if (token.includes(query)) score = 2;
    if (score != null && (best == null || score < best)) best = score;
  }
  return best;
};

const categoryAllows = (categories: readonly LocalToplistSearchCategory[] | undefined, kind: LocalToplistSearchResult["kind"]) => {
  if (!categories?.length) return true;
  if (kind === "player") return categories.includes("players");
  if (kind === "guild") return categories.includes("guilds");
  return categories.includes("servers");
};

const handleSearch = (request: LocalToplistViewWorkerSearchRequest) => {
  if (!datasetId || request.datasetId !== datasetId) {
    throw new Error("local_toplist_view_worker_dataset_not_initialized");
  }

  const normalizedQuery = normalizeSearchText(request.query);
  const limit = Math.max(1, Math.min(LOCAL_TOPLIST_SEARCH_RESULT_LIMIT, Math.round(request.limit ?? LOCAL_TOPLIST_SEARCH_RESULT_LIMIT)));
  if (normalizedQuery.length < LOCAL_TOPLIST_SEARCH_MIN_CHARS) {
    respond({
      requestId: request.requestId,
      ok: true,
      type: "search",
      datasetId: request.datasetId,
      normalizedQuery,
      results: [],
    });
    return;
  }

  const jumpableGuilds = new Set((request.jumpableGuildIdentifiers ?? []).map(normalizeIdentifier).filter(Boolean));
  const resultsByKind = new Map<LocalToplistSearchResult["kind"], LocalToplistSearchResult[]>();

  searchEntries.forEach((entry) => {
    if (!categoryAllows(request.categories, entry.kind)) return;
    const score = matchScore(entry.tokens, normalizedQuery);
    if (score == null) return;
    const isJumpable =
      entry.kind === "server" ||
      entry.kind === "guild" ||
      (entry.kind === "player" && stableTopPlayerKeys.has(normalizeKey(entry.server, entry.identifier) ?? "")) ||
      jumpableGuilds.has(entry.identifier);
    const result: LocalToplistSearchResult = {
      kind: entry.kind,
      id: entry.id,
      label: entry.label,
      server: entry.server,
      identifier: entry.identifier,
      status: isJumpable ? "jumpable" : "outside-toplist",
      statusReason: isJumpable ? null : "outside current Top 1000/toplist scope",
      className: entry.className,
      guildName: entry.guildName,
      score,
    };
    resultsByKind.set(entry.kind, [...(resultsByKind.get(entry.kind) ?? []), result]);
  });

  const sortResults = (left: LocalToplistSearchResult, right: LocalToplistSearchResult) => {
    if (left.status !== right.status) return left.status === "jumpable" ? -1 : 1;
    if (left.score !== right.score) return left.score - right.score;
    const labelCmp = left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" });
    if (labelCmp !== 0) return labelCmp;
    return left.server.localeCompare(right.server, undefined, { numeric: true, sensitivity: "base" });
  };

  const results = (["player", "guild", "server"] as const).flatMap((kind) =>
    [...(resultsByKind.get(kind) ?? [])].sort(sortResults).slice(0, limit),
  );

  respond({
    requestId: request.requestId,
    ok: true,
    type: "search",
    datasetId: request.datasetId,
    normalizedQuery,
    results,
  });
};

const handleInit = (request: LocalToplistViewWorkerInitRequest) => {
  datasetId = request.datasetId;
  playerRows = request.playerRows;
  guildRows = request.guildRows;
  stableTopPlayerKeys = new Set(
    buildLocalPlayerToplistBaseCohort(playerRows, { playerLimit: LOCAL_PLAYER_TOPLIST_VIEW_LIMIT })
      .map((row) => normalizeKey(row.server, row.identifier))
      .filter((key): key is string => Boolean(key)),
  );
  buildSearchIndex();
  respond({
    requestId: request.requestId,
    ok: true,
    type: "init",
    tab: "guilds",
    totalRows: playerRows.length + guildRows.length,
    page: 1,
    pageSize: 0,
    playerRows: [],
    guildRows: [],
  });
};

const handleView = (request: LocalToplistViewWorkerViewRequest) => {
  if (!datasetId || request.datasetId !== datasetId) {
    throw new Error("local_toplist_view_worker_dataset_not_initialized");
  }
  if (request.tab === "players") {
    const bounds = pageBounds(request.page, request.pageSize, LOCAL_PLAYER_TOPLIST_VIEW_LIMIT);
    const allowed = request.allowedPlayerKeys?.length ? new Set(request.allowedPlayerKeys) : null;
    const sourceRows = allowed
      ? playerRows.filter((row) => {
          const key = normalizeKey(row.server, row.identifier);
          return !!key && allowed.has(key);
        })
      : playerRows;
    const view = buildLocalPlayerToplistView(sourceRows, {
      filters: request.filters,
      sort: request.sort,
      playerAverageMode: request.playerAverageMode,
      playerLimit: LOCAL_PLAYER_TOPLIST_VIEW_LIMIT,
    });
    respond({
      requestId: request.requestId,
      ok: true,
      type: "view",
      tab: "players",
      totalRows: view.rows.length,
      page: bounds.page,
      pageSize: bounds.pageSize,
      playerRows: view.rows.slice(bounds.start, bounds.end),
      guildRows: [],
    });
    return;
  }

  const bounds = pageBounds(request.page, request.pageSize, GUILD_VIEW_PAGE_LIMIT);
  const allowed = request.allowedGuildKeys?.length ? new Set(request.allowedGuildKeys) : null;
  const sourceRows = allowed
    ? guildRows.filter((row) => {
        const key = normalizeKey(row.server, row.guildIdentifier);
        return !!key && allowed.has(key);
      })
    : guildRows;
  const view = buildLocalGuildToplistView(sourceRows, {
    filters: request.filters,
    sort: request.sort,
    guildAverageMode: request.guildAverageMode,
  });
  respond({
    requestId: request.requestId,
    ok: true,
    type: "view",
    tab: "guilds",
    totalRows: view.rows.length,
    page: bounds.page,
    pageSize: bounds.pageSize,
    playerRows: [],
    guildRows: view.rows.slice(bounds.start, bounds.end),
  });
};

globalThis.onmessage = (event: MessageEvent<LocalToplistViewWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "init") handleInit(request);
    else if (request.type === "search") handleSearch(request);
    else handleView(request);
  } catch (error) {
    respond({
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error ?? "unknown_error"),
    });
  }
};
