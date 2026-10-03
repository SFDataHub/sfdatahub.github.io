import type { LocalToplistSearchResult } from "../../lib/toplists/localToplistViewWorkerTypes";

export type LocalToplistSearchTab = "players" | "guilds";

export type LocalToplistPendingSearchTarget = {
  kind: "player" | "guild";
  server: string;
  identifier: string;
  label: string;
  nonce: number;
};

export type LocalToplistSearchSelectionAction =
  | { action: "select-server"; server: string }
  | { action: "focus-player"; target: LocalToplistPendingSearchTarget; nextTab: "players" | null }
  | { action: "focus-guild"; target: LocalToplistPendingSearchTarget; nextTab: "guilds" | null };

export const LOCAL_PLAYER_VIEW_LIMIT = 1000;
export const LOCAL_PLAYER_RENDER_BATCH_SIZE = 100;

export const normalizeLocalToplistSearchIdentifier = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

export const nextLocalToplistVisibleBatchSize = (targetIndex: number) =>
  Math.min(
    LOCAL_PLAYER_VIEW_LIMIT,
    Math.ceil((targetIndex + 1) / LOCAL_PLAYER_RENDER_BATCH_SIZE) * LOCAL_PLAYER_RENDER_BATCH_SIZE,
  );

export const sameLocalToplistPendingTarget = (
  left: LocalToplistPendingSearchTarget | null,
  right: LocalToplistPendingSearchTarget | null,
) =>
  left?.kind === right?.kind &&
  left?.server === right?.server &&
  left?.identifier === right?.identifier &&
  left?.nonce === right?.nonce;

export const buildLocalToplistPendingTarget = (
  result: LocalToplistSearchResult & { kind: "player" | "guild" },
  server: string,
  nonce: number,
): LocalToplistPendingSearchTarget => ({
  kind: result.kind,
  server,
  identifier: normalizeLocalToplistSearchIdentifier(result.identifier),
  label: result.label,
  nonce,
});

export const resolveLocalToplistSearchSelection = (
  tab: LocalToplistSearchTab,
  result: LocalToplistSearchResult,
  canonicalServer: string,
  nonce: number,
): LocalToplistSearchSelectionAction => {
  if (result.kind === "server") {
    return { action: "select-server", server: canonicalServer };
  }

  if (result.kind === "guild") {
    const target = buildLocalToplistPendingTarget(result as LocalToplistSearchResult & { kind: "guild" }, canonicalServer, nonce);
    return {
      action: "focus-guild",
      target,
      nextTab: tab === "players" ? "guilds" : null,
    };
  }

  const target = buildLocalToplistPendingTarget(result as LocalToplistSearchResult & { kind: "player" }, canonicalServer, nonce);
  return {
    action: "focus-player",
    target,
    nextTab: tab === "guilds" ? "players" : null,
  };
};
