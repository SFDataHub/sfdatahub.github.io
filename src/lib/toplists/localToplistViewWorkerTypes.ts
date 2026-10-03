import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "./localToplistTypes";
import type {
  LocalGuildAverageMode,
  LocalToplistRankedGuildRow,
  LocalToplistRankedPlayerRow,
  LocalToplistFilters,
  LocalToplistSortSpec,
} from "./localToplistView";

export const LOCAL_TOPLIST_SEARCH_MIN_CHARS = 3;
export const LOCAL_TOPLIST_SEARCH_DEBOUNCE_MS = 350;
export const LOCAL_TOPLIST_SEARCH_RESULT_LIMIT = 10;

export type LocalToplistViewTab = "players" | "guilds";

export type LocalToplistViewWorkerInitRequest = {
  requestId: number;
  type: "init";
  datasetId: string;
  playerRows: LocalPlayerToplistRow[];
  guildRows: LocalGuildToplistRow[];
};

export type LocalToplistViewWorkerViewRequest = {
  requestId: number;
  type: "view";
  datasetId: string;
  tab: LocalToplistViewTab;
  filters: LocalToplistFilters;
  sort: LocalToplistSortSpec;
  playerAverageMode?: LocalGuildAverageMode;
  guildAverageMode?: LocalGuildAverageMode;
  page: number;
  pageSize: number;
  allowedPlayerKeys?: string[];
  allowedGuildKeys?: string[];
};

export type LocalToplistSearchCategory = "players" | "guilds" | "servers";
export type LocalToplistSearchResultKind = "player" | "guild" | "server";
export type LocalToplistSearchStatus = "jumpable" | "outside-toplist";

export type LocalToplistSearchResult = {
  kind: LocalToplistSearchResultKind;
  id: string;
  label: string;
  server: string;
  identifier: string;
  status: LocalToplistSearchStatus;
  statusReason?: string | null;
  className?: string | null;
  guildName?: string | null;
  score: number;
};

export type LocalToplistViewWorkerSearchRequest = {
  requestId: number;
  type: "search";
  datasetId: string;
  query: string;
  categories?: LocalToplistSearchCategory[];
  limit?: number;
  jumpableGuildIdentifiers?: string[];
};

export type LocalToplistViewWorkerRequest =
  | LocalToplistViewWorkerInitRequest
  | LocalToplistViewWorkerViewRequest
  | LocalToplistViewWorkerSearchRequest;

export type LocalToplistViewWorkerSuccess = {
  requestId: number;
  ok: true;
  type: "init" | "view";
  tab: LocalToplistViewTab;
  totalRows: number;
  page: number;
  pageSize: number;
  playerRows: LocalToplistRankedPlayerRow[];
  guildRows: LocalToplistRankedGuildRow[];
};

export type LocalToplistViewWorkerSearchSuccess = {
  requestId: number;
  ok: true;
  type: "search";
  datasetId: string;
  normalizedQuery: string;
  results: LocalToplistSearchResult[];
};

export type LocalToplistViewWorkerFailure = {
  requestId: number;
  ok: false;
  error: string;
};

export type LocalToplistViewWorkerResponse =
  | LocalToplistViewWorkerSuccess
  | LocalToplistViewWorkerSearchSuccess
  | LocalToplistViewWorkerFailure;
