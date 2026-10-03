export type ToplistPlayerRow = {
  identifier?: string | null;
  playerId?: string | null;
  flag: string | null;
  deltaRank: number | null;
  server: string;
  name: string;
  class: string;
  level: number | null;
  guild: string | null;
  main: number | null;
  con: number | null;
  sum: number | null;
  ratio: string | null;
  mainTotal: number | null;
  conTotal: number | null;
  sumTotal: number | null;
  xpProgress: number | null;
  xpTotal: number | null;
  mine: number | null;
  treasury: number | null;
  lastScan: string | null;
  deltaSum: number | null;
};

export type ToplistGuildRow = {
  guildId: string;
  server: string;
  name: string;
  honor: number | null;
  raids: number | null;
  portalFloor: number | null;
  hydra: number | null;
  petLevel: number | null;
  instructor: number | null;
  memberCount: number | null;
  hofRank: number | null;
  latestScanAtSec: number | null;
  lastScan: string | null;
  sumAvg: number | null;
  avgLevel: number | null;
  avgTreasury: number | null;
  avgMine: number | null;
  avgBaseMain: number | null;
  avgConBase: number | null;
  avgSumBaseTotal: number | null;
  avgAttrTotal: number | null;
  avgConTotal: number | null;
  avgTotalStats: number | null;
};

export type ToplistPlayerSnapshot = {
  server: string;
  updatedAt: number | null;
  players: ToplistPlayerRow[];
};

export type ToplistGuildSnapshot = {
  server: string;
  updatedAt: number | null;
  guilds: ToplistGuildRow[];
};
