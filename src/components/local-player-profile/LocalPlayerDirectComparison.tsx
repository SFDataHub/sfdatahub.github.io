import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import HubSearch, { type HubPlayerSelection } from "../../pages/DataHub/HubSearch";
import { useOptionalLocalPlayerComparison } from "./LocalPlayerComparison";
import SearchArtwork from "../../pages/DataHub/SearchArtwork";
import "./LocalPlayerDirectComparison.css";

/** The overlay retains its single local preview; only full profiles own charts. */
export default function LocalPlayerDirectComparison({ preview, onPreviewChange }: {
  preview?: HubPlayerSelection; onPreviewChange: (selection: HubPlayerSelection | undefined) => void;
}) {
  const { t } = useTranslation();
  const context = useOptionalLocalPlayerComparison();
  return <section className="local-player-direct-comparison" data-comparison-count={context?.players.length} aria-label={t("playerProfile.directComparison.label")}>
    <HubSearch entityKind="player" variant="player-comparison" onPlayerSelect={context ? context.addPlayer : onPreviewChange} />
    {context ? context.players.map(player => <ComparisonSelectionRow key={player.id} selected={player.selection}
      color={player.color} onRemove={() => context.removePlayer(player.id)} />)
      : preview && <ComparisonSelectionRow selected={preview} onRemove={() => onPreviewChange(undefined)} />}
    {context?.selectionError && <span className="sr-only" role="status">{t("playerProfile.history.error")}</span>}
  </section>;
}

function ComparisonSelectionRow({ selected, color, onRemove }: { selected: HubPlayerSelection; color?: string; onRemove: () => void }) {
  const { t } = useTranslation();
  const display = selected.occurrence ?? selected.hit?.occurrences.find(item => item.timeQuality === "observation") ?? selected.hit?.occurrences[0];
  const name = display?.name || selected.hit?.name || selected.favorite?.display.name || "";
  const server = (selected.favorite?.display.server ?? (display?.reference ?? selected.reference).serverNamespace).toUpperCase();
  const removeLabel = t("playerProfile.directComparison.removeNamed", { name, server });
  return <div className="local-player-direct-comparison__selection" role="status" aria-label={t("playerProfile.directComparison.selected")}
    data-comparison-reference={selected.reference.identifier} data-comparison-target={selected.target.path} data-comparison-color={color}>
    <strong className="local-player-direct-comparison__versus" style={color ? { color } : undefined}>{t("playerProfile.directComparison.versus")}</strong>
    <SearchArtwork kind="player" name={name} appearance={display?.local?.appearance ?? selected.favorite?.display.appearance}
      archiveClassId={display?.archive?.kind === "player" ? display.archive.classId : undefined} />
    <span className="local-player-direct-comparison__identity"><strong title={name}>{name}</strong><span>{server}</span></span>
    <button type="button" className="local-player-direct-comparison__remove" onClick={onRemove}
      aria-label={removeLabel} title={removeLabel}>×</button>
  </div>;
}
