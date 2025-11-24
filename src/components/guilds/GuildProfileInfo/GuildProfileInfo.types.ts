// src/components/guilds/GuildProfileInfo/GuildProfileInfo.types.ts

export type PaletteColors = {
  tile: string;
  tileAlt: string;
  line: string;
  title: string;
  soft: string;
  header: string;
  icon: string;
};

export type GuildLike = {
  id: string;
  name: string;
  server: string | null;
  memberCount: number | null;
  hofRank: number | null;
  lastScanDays: number | null;
};

export type MemberSummaryLike = {
  id: string;
  name: string | null;
  class: string | null;
  role: string | null;
  level: number | null;
  treasury: number | null;
  mine: number | null;
  baseMain: number | null;
  conBase: number | null;
  sumBaseTotal: number | null;
  attrTotal: number | null;
  conTotal: number | null;
  totalStats: number | null;
  lastScan: string | null;
  lastActivity: string | null;
  lastScanMs: number | null;
  lastActivityMs: number | null;
};

export type MembersSnapshotLike = {
  guildId: string;
  updatedAt: string;
  updatedAtMs: number;
  count: number;
  hash: string;
  avgLevel?: number | null;
  avgTreasury?: number | null;
  avgMine?: number | null;
  avgBaseMain?: number | null;
  avgConBase?: number | null;
  avgSumBaseTotal?: number | null;
  avgAttrTotal?: number | null;
  avgConTotal?: number | null;
  avgTotalStats?: number | null;
  members: MemberSummaryLike[];
};

export type GuildProfileInfoProps = {
  guild: GuildLike;
  snapshot: MembersSnapshotLike | null;
  emblemUrl?: string | null;
  colors: PaletteColors;
};
