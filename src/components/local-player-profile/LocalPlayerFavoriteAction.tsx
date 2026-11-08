import { useLocation } from "react-router-dom";
import { parseObservation } from "../../lib/data-hub/routes";
import PlayerFavoriteStar from "../player-profile/PlayerFavoriteStar";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useHubFavorites } from "../../lib/data-hub/useHubFavorites";
import { favoriteProjectionMatchesReference, localPlayerFavorite } from "../../lib/data-hub/hubFavoritesProjection";
import { useHubFavoritesProjection } from "../../lib/data-hub/useHubFavoritesProjection";
import type { LocalPlayerProfileModel } from "./types";

export default function LocalPlayerFavoriteAction({ profile }: { profile: LocalPlayerProfileModel }) {
  const { t } = useTranslation();
  const store = useHubFavorites();
  const candidate = localPlayerFavorite(profile);
  const observation = parseObservation(useLocation().search);
  if (candidate && observation.kind === "exact") candidate.historicalAt = observation.anchor.at;
  const projection = useHubFavoritesProjection(store.snapshot?.record, "profile-favorite-action");
  // Membership uses the committed record and its last accepted identity evidence.
  // Background readiness gates actions, never the already confirmed star.
  const savedRow = candidate?.reference ? projection.rows.find(row => favoriteProjectionMatchesReference(row, "player", candidate.reference!)) : undefined;
  const saved = savedRow?.favorite;
  const operation = store.operation;
  const operationId = operation?.type === "save" ? operation.favorite.id : operation && "id" in operation ? operation.id : null;
  const concernsProfile = !operation || !!candidate && (operationId === candidate.id || operationId === saved?.id);
  const label = t(store.status === "restoring" ? "hubFavorites.restoring" : store.status === "saving" && concernsProfile ? "hubFavorites.saving"
    : saved ? "hubFavorites.playerRemove" : "hubFavorites.playerSave");
  // Status is derived from the current profile + committed shared record. No
  // per-profile Promise completion can set stale saved state after a switch.
  return <div className="local-favorite-action" data-local-favorite-action>
    <PlayerFavoriteStar isFavorite={!!saved} disabled={store.disabled || !candidate || !projection.ready} ariaLabel={label}
      onToggle={() => {
        if (!candidate || !projection.ready) return;
        if (savedRow) void projection.actionFavorite(savedRow).then(current => { if (current) return store.mutate({ type: "remove", id: current.id }); });
        else void store.mutate({ type: "save", favorite: candidate });
      }} />
    {!candidate && <span role="status">{t("hubFavorites.referenceMissing")}</span>}
    {store.error && concernsProfile && <span role="alert">{t("hubFavorites.error")} <button type="button" onClick={() => void store.retry()}>{t("hubFavorites.retry")}</button></span>}
    {store.error && !concernsProfile && <span role="alert">{t("hubFavorites.otherOperation")} <button type="button" onClick={() => void store.retry()}>{t("hubFavorites.retry")} {operation?.type === "save" ? operation.favorite.display.name : store.snapshot?.record.favorites.find(favorite => favorite.id === operationId)?.display.name}</button></span>}
  </div>;
}
