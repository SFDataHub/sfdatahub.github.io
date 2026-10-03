import type { ToplistGuildRow } from "../toplists/toplistContracts";

const toNumber = (value: any): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (value && typeof value.toMillis === "function") {
    const n = value.toMillis();
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const toStringOrNull = (value: any): string | null => (typeof value === "string" ? value : null);

export const mapFirestoreGuildRow = (raw: any): ToplistGuildRow | null => {
  if (!raw || typeof raw !== "object") return null;

  const server = toStringOrNull(raw.server);
  const name = toStringOrNull(raw.name) ?? toStringOrNull(raw.guildId);
  const guildId = toStringOrNull(raw.guildId) ?? name;

  if (!server || !name || !guildId) return null;

  const sumAvg = toNumber(raw.sumAvg ?? raw.avgSumBaseTotal ?? raw.sum);
  const lastScanValue =
    typeof raw.lastScan === "string"
      ? raw.lastScan
      : typeof raw.lastScan === "number" && Number.isFinite(raw.lastScan)
        ? String(raw.lastScan)
        : null;

  return {
    guildId,
    server,
    name,
    honor: toNumber(raw.honor),
    raids: toNumber(raw.raids),
    portalFloor: toNumber(raw.portalFloor),
    hydra: toNumber(raw.hydra),
    petLevel: toNumber(raw.petLevel),
    instructor: toNumber(raw.instructor),
    memberCount: toNumber(raw.memberCount),
    hofRank: toNumber(raw.hofRank),
    latestScanAtSec: toNumber(raw.latestScanAtSec),
    lastScan: lastScanValue,
    sumAvg,
    avgLevel: toNumber(raw.avgLevel),
    avgTreasury: toNumber(raw.avgTreasury),
    avgMine: toNumber(raw.avgMine),
    avgBaseMain: toNumber(raw.avgBaseMain),
    avgConBase: toNumber(raw.avgConBase),
    avgSumBaseTotal: toNumber(raw.avgSumBaseTotal),
    avgAttrTotal: toNumber(raw.avgAttrTotal),
    avgConTotal: toNumber(raw.avgConTotal),
    avgTotalStats: toNumber(raw.avgTotalStats),
  };
};
