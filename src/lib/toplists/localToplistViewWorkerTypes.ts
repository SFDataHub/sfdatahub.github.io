import type { AuditEnvelope, AuditReport } from "../data-hub/runtimeAudit";
import type { ScanArchiveSearchHit } from "../scanArchive/searchIndexService";
import type { HubSearchAppearance } from "../data-hub/hubSearchAppearance";
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
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
  type: "init";
  datasetId: string;
  contentRevision?: string;
  playerRows: LocalPlayerToplistRow[];
  guildRows: LocalGuildToplistRow[];
};

export type LocalToplistViewWorkerViewRequest = {
  requestId: number;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
  type: "view";
  datasetId: string;
  contentRevision?: string;
  tab: LocalToplistViewTab;
  filters: LocalToplistFilters;
  sort: LocalToplistSortSpec;
  playerStatsDayValues?: Readonly<Record<string, number | null>>;
  playerAverageMode?: LocalGuildAverageMode;
  guildAverageMode?: LocalGuildAverageMode;
  page: number;
  pageSize: number;
  nameFilter?: string;
  /** Bounded player window; does not change the ranked cohort. */
  windowStart?: number;
  targetPlayer?: { server: string; identifier: string };
  /** Compare already ranks the full target context. */
  playerLimit?: number | null;
  guildLimit?: number | null;
  allowedPlayerKeys?: string[];
  allowedGuildKeys?: string[];
};

export type LocalToplistSearchCategory = "players" | "guilds" | "servers";
export type LocalToplistSearchResultKind = "player" | "guild" | "server";
export type LocalToplistSearchStatus = "jumpable" | "outside-toplist";

export type LocalToplistSearchResult = {
  archive?: ScanArchiveSearchHit;
  appearance?: HubSearchAppearance;
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
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
  type: "search";
  datasetId: string;
  contentRevision?: string;
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
  datasetId: string;
  contentRevision: string;
  requestId: number;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
  ok: true;
  type: "init" | "view";
  tab: LocalToplistViewTab;
  totalRows: number;
  page: number;
  pageSize: number;
  windowStart?: number;
  targetIndex?: number | null;
  playerDecor?: Record<string, import("../../pages/Toplists/playerToplistDecor").PlayerToplistCellDecor>;
  playerRows: LocalToplistRankedPlayerRow[];
  guildRows: LocalToplistRankedGuildRow[];
};

export type LocalToplistViewWorkerSearchSuccess = {
  requestId: number;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
  ok: true;
  type: "search";
  datasetId: string;
  contentRevision: string;
  normalizedQuery: string;
  results: LocalToplistSearchResult[];
};

export type LocalToplistViewWorkerFailure = {
  requestId: number;
  audit?: AuditEnvelope;
  auditReport?: AuditReport;
  ok: false;
  error: string;
};

export type LocalToplistViewWorkerResponse =
  | LocalToplistViewWorkerSuccess
  | LocalToplistViewWorkerSearchSuccess
  | LocalToplistViewWorkerFailure;
