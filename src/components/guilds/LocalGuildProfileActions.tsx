import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import PlayerFavoriteStar from "../player-profile/PlayerFavoriteStar";
import { useHubFavorites } from "../../lib/data-hub/useHubFavorites";
import { useHubFavoritesProjection } from "../../lib/data-hub/useHubFavoritesProjection";
import { favoriteProjectionMatchesReference } from "../../lib/data-hub/hubFavoritesProjection";
import { guildFavorite } from "../../lib/data-hub/hubFavoritesContract";
import { createHubToplistTarget } from "../../lib/data-hub/hubTargetResolver";
import { localCopyLink, localEntityPath, type ObservationAnchor } from "../../lib/data-hub/routes";
import type { GuildHubSelectionGuild } from "../../lib/guilds/localScanLibrary";

export default function LocalGuildProfileActions({ guild, anchor, className, onGoToProfile }: {
  guild: GuildHubSelectionGuild; anchor: ObservationAnchor; className: string; onGoToProfile?: () => void;
}) {
  const { t } = useTranslation(), location = useLocation(), navigate = useNavigate();
  const store = useHubFavorites();
  const projection = useHubFavoritesProjection(store.snapshot?.record, "guild-profile-favorite-action");
  const candidate = guildFavorite({ ...guild, observedAtMs: anchor.at }, 0, null, false);
  candidate.observationHint = { sourceScanId: anchor.source, observedAtMs: anchor.at, contentHash: anchor.hash };
  const reference = candidate.referenceIssue ? null : candidate.reference;
  const savedRow = reference ? projection.rows.find(row => favoriteProjectionMatchesReference(row, "guild", reference)) : undefined;
  const operation = store.operation;
  const operationId = operation?.type === "save" ? operation.favorite.id : operation && "id" in operation ? operation.id : null;
  const concernsProfile = !operation || operationId === candidate.id || operationId === savedRow?.favorite.id;
  const label = t(store.status === "restoring" ? "hubFavorites.restoring" : store.status === "saving" && concernsProfile ? "hubFavorites.saving"
    : savedRow ? "guildProfileActions.remove" : "guildProfileActions.save");
  const [copyStatus, setCopyStatus] = useState<"copied" | "copyFailed" | null>(null);
  const copy = async () => {
    if (!reference) return;
    try { await navigator.clipboard.writeText(localCopyLink(localEntityPath("guild", reference, anchor))); setCopyStatus("copied"); }
    catch { setCopyStatus("copyFailed"); }
  };
  const toplist = () => {
    if (!reference) return;
    const target = createHubToplistTarget("guild", guild.name, reference.serverNamespace, [reference.identifier]);
    navigate(target.path, { state: { ...target.state, returnTo: location.pathname + location.search, profileReturnState: location.state } });
  };
  return <div className={className} data-guild-profile-actions>
    <button type="button" disabled={!reference} onClick={() => void copy()}>{t("localProfileRoute.copy")}</button>
    <button type="button" disabled={!reference} onClick={onGoToProfile ?? toplist}>{t(onGoToProfile ? "localProfileRoute.goToProfile" : "guildHub.memberValues.toplist")}</button>
    <PlayerFavoriteStar isFavorite={!!savedRow} disabled={store.disabled || !reference || !projection.ready} ariaLabel={label}
      onToggle={() => {
        if (!reference || !projection.ready) return;
        if (savedRow) void projection.actionFavorite(savedRow).then(current => { if (current) return store.mutate({ type: "remove", id: current.id }); });
        else void store.mutate({ type: "save", favorite: candidate });
      }} />
    {copyStatus && <span data-guild-action-feedback role={copyStatus === "copyFailed" ? "alert" : "status"}>{t(`guildProfileActions.${copyStatus}`)}</span>}
    {store.error && <span data-guild-action-feedback role="alert">{t(concernsProfile ? "hubFavorites.error" : "hubFavorites.otherOperation")} <button type="button" onClick={() => void store.retry()}>{t("hubFavorites.retry")}</button></span>}
  </div>;
}
