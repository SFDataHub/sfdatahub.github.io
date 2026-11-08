import { playerViewEvents, useAnalyticsView } from "../../lib/analytics/localEvents";
import { useLocalPlayerOrigin } from "./useLocalPlayerOrigin";
import type { LocalProfileOpeningContext } from "../../lib/data-hub/profileNavigation";
import type { PlayerContentView } from "../../lib/local-player-profile/viewCharts";
import { useLayoutEffect, useRef, useState } from "react";
import type { HubPlayerSelection } from "../../pages/DataHub/HubSearch";
import LocalPlayerFavoriteAction from "./LocalPlayerFavoriteAction";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import LocalPlayerGuildEmblem, { useLocalPlayerGuild } from "./LocalPlayerGuildEmblem";
import { LocalPlayerComparisonProvider, LocalPlayerComparisonSelect } from "./LocalPlayerComparison";
import LocalPlayerAnalytics from "./LocalPlayerAnalytics";
import LocalHeroPanel, { AttributeCompositionDetailOverlay } from "./LocalHeroPanel";
import LocalPrimaryAttributeRadar from "./LocalPrimaryAttributeRadar";
import LocalPlayerDirectComparison from "./LocalPlayerDirectComparison";
import LocalPlayerProfileInsights from "./LocalPlayerProfileInsights";
import type { LocalPlayerProfileModel } from "./types";
import { useLocalProfilePart } from "../../lib/local-player-profile/useLocalProfilePart";
import { localPlayerFavorite } from "../../lib/data-hub/hubFavoritesProjection";
import { createHubToplistTarget } from "../../lib/data-hub/hubTargetResolver";
import { localCopyLink, localEntityPath } from "../../lib/data-hub/routes";
import LocalTitleNavigation from "../ui/shared/LocalTitleNavigation";
import "../../styles/Toplist.css";
import "./LocalPlayerProfileOverlay.css";

type ProfileContentProps = { profile: LocalPlayerProfileModel; onClose: () => void; onCopyLink?: () => void;
  variant?: "full" | "overlay"; openingContext?: LocalProfileOpeningContext; onGoToProfile?: () => void };

export function LocalPlayerProfileContent({ profile, onClose, onCopyLink, variant = "full", openingContext, onGoToProfile }: ProfileContentProps) {
  const [contentView, setContentView] = useState<PlayerContentView>("base");
  useAnalyticsView(playerViewEvents[contentView], variant !== "overlay");
  const viewProps = { contentView, onContentViewChange: setContentView };
  if (variant === "full") return <LocalPlayerComparisonProvider
    key={`${profile.sourceScanId}:${profile.sourcePlayerKey}:${profile.analytics.memberRef ?? ""}:${profile.analytics.scannedAtMs}`} profile={profile} view={contentView}>
    <ProfileContent {...viewProps} profile={profile} onClose={onClose} onCopyLink={onCopyLink} variant={variant} openingContext={openingContext} onGoToProfile={onGoToProfile} />
  </LocalPlayerComparisonProvider>;
  return <ProfileContent key={`${profile.sourceScanId}:${profile.sourcePlayerKey}:${profile.analytics.memberRef ?? ""}:${profile.analytics.scannedAtMs}`} {...viewProps} profile={profile} onClose={onClose} onCopyLink={onCopyLink} variant={variant} openingContext={openingContext} onGoToProfile={onGoToProfile} />;
}

function ProfileContent({ profile, onClose, onCopyLink, variant, openingContext, onGoToProfile, contentView, onContentViewChange }: ProfileContentProps & { contentView: PlayerContentView; onContentViewChange: (view: PlayerContentView) => void }) {
  const [preview, setPreview] = useState<HubPlayerSelection>();
  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = gridRef.current, content = grid?.parentElement;
    if (variant !== "full" || !grid || !content) return;
    const measureRow = () => {
      const row = parseFloat(getComputedStyle(grid).gridTemplateRows);
      if (Number.isFinite(row)) content.style.setProperty("--local-profile-row-half", `${row / 2}px`);
    };
    measureRow();
    const observer = new ResizeObserver(measureRow);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [variant, contentView]);
  const { t } = useTranslation();
  const location = useLocation(), navigate = useNavigate();
  const current = useLocalProfilePart(profile, "current");
  const currentProfile = current.value ?? profile;
  const guild = useLocalPlayerGuild(currentProfile);
  const originServer = useLocalPlayerOrigin(currentProfile);
  const [isCompositionDetailsOpen, setIsCompositionDetailsOpen] = useState(false);
  useAnalyticsView(isCompositionDetailsOpen ? "datahub/player/composition" : null);
  const heroAvailable = current.status === "ready" || current.status === "loading" && current.reason !== "Revalidating selected observation";
  const reference = localPlayerFavorite({ ...currentProfile, currentSeed: profile.currentSeed })?.reference;
  const favoriteAction = <LocalPlayerFavoriteAction profile={{ ...currentProfile, currentSeed: profile.currentSeed }} />;

  const copyLink = onCopyLink ?? (() => {
    if (!reference) return;
    const path = localEntityPath("player", reference, { source: profile.sourceScanId, at: profile.analytics.scannedAtMs,
      row: profile.sourcePlayerKey, hash: profile.currentSeed?.contentHash });
    void navigator.clipboard.writeText(localCopyLink(path));
  });
  const showInToplist = () => {
    if (!reference) return;
    const target = createHubToplistTarget("player", currentProfile.hero.playerName, reference.serverNamespace, [reference.identifier]);
    navigate(target.path, { state: { ...target.state, returnTo: location.pathname + location.search, profileReturnState: location.state } });
  };

  return (
    <>
        <LocalPlayerProfileHeader onClose={onClose} />
        <div className="profile-overlay__content profile-overlay__content--local sfdatahub-scrollbar">
          <div ref={gridRef} className={`player-profile profile-overlay__local-grid${variant === "full" && (contentView === "base" || contentView === "total") ? " profile-overlay__local-grid--three-charts" : ""}${variant === "overlay" ? " profile-overlay__local-grid--upper" : ""}`}>
            {heroAvailable ? <LocalHeroPanel contentView={contentView} onContentViewChange={onContentViewChange} auditInput={current.value ?? undefined} data={currentProfile.hero} generalGuildName={guild?.name} generalOriginServer={originServer} favoriteAction={favoriteAction} guildEmblem={<LocalPlayerGuildEmblem guild={guild} />} comparisonSelect={variant === "full" ? <LocalPlayerComparisonSelect /> : undefined} />
              : <section className="local-hero" role="status">{t(current.status === "empty" ? "playerProfile.localData.currentMissing" : `playerProfile.localData.${current.status}`)} {current.status !== "loading" ? <button type="button" onClick={current.retry}>{t("playerProfile.localData.retry")}</button> : null}{favoriteAction}</section>}
            <LocalPrimaryAttributeRadar profile={profile} enableVersus={variant === "full"} overlaySelection={preview} />
            <LocalPlayerDirectComparison preview={preview} onPreviewChange={setPreview} key={`${profile.sourceScanId}:${profile.sourcePlayerKey}:${profile.analytics.memberRef ?? ""}:${profile.analytics.scannedAtMs}`} />
            <section className="local-player-insights local-profile-actions-card">
              <button type="button" className="local-profile-action-button" onClick={copyLink} disabled={!onCopyLink && !reference}>{t("localProfileRoute.copy")}</button>
              {!(variant === "overlay" && openingContext === "toplist") && <button type="button" className="local-profile-action-button" onClick={showInToplist} disabled={!reference}>{t("guildHub.memberValues.toplist")}</button>}
              {variant === "overlay" && openingContext === "toplist" && <button type="button" className="local-profile-action-button" onClick={onGoToProfile} disabled={!onGoToProfile}>{t("localProfileRoute.goToProfile")}</button>}
              <button type="button" className="local-profile-action-button" onClick={() => setIsCompositionDetailsOpen(true)}
                disabled={!heroAvailable || !currentProfile.hero.attributeComposition}>{t("playerProfile.statsTab.attrComposition.title")}</button>
              {variant === "full" && <div className="local-profile-action-comparison"><LocalPlayerComparisonSelect /></div>}
            </section>
            {variant === "full" && (<>
              <div className="local-profile-section-divider" aria-hidden="true" />
              <LocalPlayerAnalytics profile={profile} />
              <LocalPlayerProfileInsights profile={profile} hero={currentProfile.hero} contentView={contentView} generalGuildName={guild?.name} generalOriginServer={originServer} />
            </>)}
          </div>
        </div>
        <AttributeCompositionDetailOverlay composition={heroAvailable ? currentProfile.hero.attributeComposition : undefined}
          isOpen={isCompositionDetailsOpen} onClose={() => setIsCompositionDetailsOpen(false)} />
    </>
  );
}

export function LocalPlayerProfileHeader({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return <div className="profile-overlay__local-header">
    <LocalTitleNavigation profile title={t("playerProfile.heroPanel.headerLabel")} onBack={onClose} />
  </div>;
}
