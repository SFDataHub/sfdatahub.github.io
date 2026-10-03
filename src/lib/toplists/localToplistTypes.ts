export type LocalToplistConfirmation =
  | {
      kind: "archiveSource";
      archiveScanId: string;
      archiveSha256: string;
    }
  | {
      kind: "archiveBinding";
      archiveScanId: string;
      archiveSha256: string;
      localContentHash?: string | null;
    };

export type LocalToplistConfirmedScanSource = {
  manifestYear: number;
  archiveScanId: string;
  archiveSha256: string;
  server: string;
  scanTimestamp: number;
  localScanId: string;
  rawScan: unknown;
  confirmation: LocalToplistConfirmation;
};

export type LocalToplistIssueCode =
  | "unconfirmed-source"
  | "invalid-source-metadata"
  | "raw-scan-mismatch"
  | "duplicate-identical-player"
  | "duplicate-conflicting-player"
  | "duplicate-identical-guild"
  | "duplicate-conflicting-guild"
  | "missing-player-identifier"
  | "missing-guild-identifier"
  | "incomplete-guild-member-basis"
  | "invalid-comparison-months"
  | "partial-comparison-side"
  | "duplicate-comparison-identity"
  | "ambiguous-player-fusion"
  | "ambiguous-guild-fusion"
  | "incomplete-guild-comparison-average";

export type LocalToplistIssue = {
  code: LocalToplistIssueCode;
  severity: "warning" | "error";
  message: string;
  server?: string;
  archiveScanId?: string;
  identifier?: string | null;
};

export type LocalToplistSnapshotMeta = {
  server: string;
  sourceServer: string;
  archiveScanId: string;
  archiveSha256: string;
  scanTimestamp: number;
  manifestYear: number;
  localScanId: string;
  playerCount: number;
  guildCount: number;
  issues: LocalToplistIssue[];
};

export type LocalPlayerToplistRow = {
  rowKey: string;
  identifier: string;
  playerId: string | null;
  name: string;
  server: string;
  sourceServer: string;
  scanTimestamp: number;
  manifestYear: number;
  archiveScanId: string;
  archiveSha256: string;
  localScanId: string;
  class: string;
  classId: string | number | null;
  guild: string | null;
  guildIdentifier: string | null;
  hofRank: number | null;
  level: number | null;
  main: number | null;
  con: number | null;
  sum: number | null;
  ratio: number | null;
  mainTotal: number | null;
  conTotal: number | null;
  sumTotal: number | null;
  xpProgress: number | null;
  xpTotal: number | null;
  mine: number | null;
  treasury: number | null;
  statsPerDay: null;
  statsDayTotal: null;
  lastScan: string | null;
  latestScanAtSec: number | null;
};

export type LocalGuildMemberBasisStatus = "complete" | "incomplete" | "unknown";

export type LocalGuildToplistRow = {
  rowKey: string;
  guildId: string;
  guildIdentifier: string;
  name: string;
  server: string;
  sourceServer: string;
  scanTimestamp: number;
  manifestYear: number;
  archiveScanId: string;
  archiveSha256: string;
  localScanId: string;
  hofRank: number | null;
  honor: number | null;
  raids: number | null;
  portalFloor: number | null;
  hydra: number | null;
  petLevel: number | null;
  instructor: number | null;
  memberCount: number | null;
  avgLevel: number | null;
  avgBaseMain: number | null;
  avgConBase: number | null;
  avgSumBaseTotal: number | null;
  avgAttrTotal: number | null;
  avgConTotal: number | null;
  avgTotalStats: number | null;
  avgMine: number | null;
  avgTreasury: number | null;
  sumAvg: number | null;
  memberBasisStatus: LocalGuildMemberBasisStatus;
  memberBasisCount: number;
  lastScan: string | null;
  latestScanAtSec: number | null;
};

export type LocalToplistDerivationResult = {
  status: "complete" | "partial" | "empty";
  snapshots: LocalToplistSnapshotMeta[];
  players: LocalPlayerToplistRow[];
  guilds: LocalGuildToplistRow[];
  issues: LocalToplistIssue[];
  earliestTimestamp: number | null;
  latestTimestamp: number | null;
};
