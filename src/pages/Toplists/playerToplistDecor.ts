import type React from "react";

import type { ToplistPlayerRow } from "../../lib/toplists/toplistContracts";
import { parsePlayerIdentifier } from "../../lib/players/identifier";

export type PlayerToplistCellDecor = {
  mainRank?: number;
  conRank?: number;
  levelRank?: number;
  mineTier?: 1 | 2 | 3 | 4;
};

export const PLAYER_TOPLIST_MAIN_RANK_COLORS = ["#f6e7a6", "#f4de89", "#f2d56d", "#f0cc51", "#edc236"];
export const PLAYER_TOPLIST_CON_RANK_COLORS = ["#ffe4b3", "#ffdda0", "#ffd68d", "#ffcf7a", "#ffc867"];
export const PLAYER_TOPLIST_LEVEL_RANK_COLORS = ["#9ec5ff", "#8ab7ff", "#76a9ff", "#629bff", "#4e8dff"];

const PLAYER_TOPLIST_MINE_TIER_COLORS: Record<number, string> = {
  1: "#d8b4fe",
  2: "#c084fc",
  3: "#a855f7",
  4: "#f472b6",
};

const STUMBLE_STEPPE_COMPARE_ALIAS_TOKENS = new Set([
  "STUMBLESTEPPE",
  "STUMPLESTEPPE",
]);

const compareServerAliasToken = (value: string) => {
  let token = String(value ?? "").trim().toUpperCase();
  if (!token) return "";
  token = token.replace(/^[A-Z][A-Z0-9+.-]*:\/\//, "");
  token = token.split(/[/?#]/)[0] ?? token;
  token = token.replace(/:\d+$/, "").replace(/^\.+|\.+$/g, "");
  token = token.replace(/\.SFGAME\.(NET|EU)$/, "");
  token = token.replace(/[_.-]?(NET|EU)$/, "");
  return token.replace(/[\s._-]+/g, "");
};

export const normalizePlayerToplistCompareServerKey = (value: string) => {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  if (STUMBLE_STEPPE_COMPARE_ALIAS_TOKENS.has(compareServerAliasToken(raw))) {
    return "STUMBLESTEPPE";
  }
  const hostMatch = raw.match(/^S(\d+)(?:\.EU)?$/);
  if (hostMatch) return `EU${hostMatch[1]}`;
  const euMatch = raw.match(/^EU(\d+)$/);
  if (euMatch) return `EU${euMatch[1]}`;
  return raw;
};

export const toPlayerToplistNumberSafe = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const resolvePlayerToplistRowIdentifier = (row: ToplistPlayerRow): string | null => {
  const candidates = [
    row.identifier,
    (row as any).original?.identifier,
    (row as any).value?.identifier,
    (row as any).data?.identifier,
    (row as any).player?.identifier,
    (row as any).value?.player?.identifier,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (parsePlayerIdentifier(trimmed)) return trimmed;
  }
  return null;
};

const normalizePlayerToplistCompareIdentifier = (value: string | null) => {
  if (!value) return null;
  const parsed = parsePlayerIdentifier(value);
  if (!parsed) return value.trim().toLowerCase() || null;
  const serverKey = normalizePlayerToplistCompareServerKey(parsed.serverKey);
  if (!serverKey) return value.trim().toLowerCase() || null;
  return `${serverKey.toLowerCase()}_p${parsed.playerId}`;
};

const buildPlayerToplistCompareFallbackKey = (row: ToplistPlayerRow, fallbackIndex?: number) => {
  const serverKey = normalizePlayerToplistCompareServerKey(String(row.server ?? ""));
  const nameKey = String(row.name ?? "").trim();
  const classKey = String(row.class ?? "").trim();
  const suffix = fallbackIndex != null ? String(fallbackIndex) : "na";
  return `missing-identifier:${serverKey}__${nameKey}__${classKey}__${suffix}`;
};

export const buildPlayerToplistCompareKey = (row: ToplistPlayerRow, fallbackIndex?: number) => {
  const identifier = normalizePlayerToplistCompareIdentifier(resolvePlayerToplistRowIdentifier(row));
  if (identifier) return identifier;
  return buildPlayerToplistCompareFallbackKey(row, fallbackIndex);
};

export const buildPlayerToplistDecorMap = (
  rows: readonly ToplistPlayerRow[],
  playerAvgMode: "base" | "total",
  keyFor: (row: ToplistPlayerRow) => string = buildPlayerToplistCompareKey,
) => {
  const map = new Map<string, PlayerToplistCellDecor>();

  const ensure = (row: ToplistPlayerRow) => {
    const key = keyFor(row);
    let entry = map.get(key);
    if (!entry) {
      entry = {};
      map.set(key, entry);
    }
    return entry;
  };

  const rankBy = (
    valueGetter: (row: ToplistPlayerRow) => number | null,
    field: "mainRank" | "conRank" | "levelRank",
  ) => {
    const ranked = rows
      .map((row, idx) => {
        const value = valueGetter(row);
        if (value == null) return null;
        return { row, value, idx };
      })
      .filter(Boolean) as { row: ToplistPlayerRow; value: number; idx: number }[];
    ranked.sort((a, b) => b.value - a.value || a.idx - b.idx);
    ranked.slice(0, 5).forEach((entry, i) => {
      ensure(entry.row)[field] = i + 1;
    });
  };

  rankBy(
    (row) => toPlayerToplistNumberSafe(playerAvgMode === "total" ? row.mainTotal : row.main),
    "mainRank",
  );
  rankBy(
    (row) => toPlayerToplistNumberSafe(playerAvgMode === "total" ? row.conTotal : row.con),
    "conRank",
  );
  rankBy((row) => toPlayerToplistNumberSafe(row.level), "levelRank");

  rows.forEach((row) => {
    const mineValue = toPlayerToplistNumberSafe(row.mine);
    if (mineValue == null) return;
    const tier =
      mineValue >= 100 ? 4 :
      mineValue >= 80 ? 3 :
      mineValue >= 65 ? 2 :
      mineValue >= 50 ? 1 :
      null;
    if (tier) ensure(row).mineTier = tier as 1 | 2 | 3 | 4;
  });

  return map;
};

export const getPlayerToplistRankTone = (rank: number | undefined, palette: readonly string[]) =>
  rank && rank > 0 && rank <= palette.length ? palette[rank - 1] : null;

export const getPlayerToplistMineTone = (tier: number | undefined) =>
  tier ? PLAYER_TOPLIST_MINE_TIER_COLORS[tier] ?? null : null;

export const getPlayerToplistFrameStyle = (color?: string | null): React.CSSProperties | undefined =>
  color
    ? {
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "1px 3px 0",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
      }
    : undefined;
