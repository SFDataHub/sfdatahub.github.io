import { acquireProfileEntrySource, ProfileEntryAcquisitionError } from "../../lib/data-hub/profileEntryAcquisition";
import { useAnalyticsView } from "../../lib/analytics/localEvents";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import { auditEnabled } from "../../lib/data-hub/runtimeAudit";
import { useRuntimeAuditCommit } from "../../lib/data-hub/useRuntimeAuditCommit";
import React from "react";
import ContentShell from "../../components/ContentShell";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import LocalPlayerProfileOverlay from "../../components/local-player-profile/LocalPlayerProfileOverlay";
import { LocalPlayerProfileContent, LocalPlayerProfileHeader } from "../../components/local-player-profile/LocalPlayerProfileContent";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import { LocalProfileEntryError, resolveLocalProfileEntry } from "../../lib/data-hub/localProfileEntry";
import { preparedProfileSeed, releasePreparedProfile } from "../../lib/data-hub/profileNavigation";
import { localCopyLink, parseLocalEntity, parseObservation, PLAYER_HUB, safeLocalReturn } from "../../lib/data-hub/routes";
import { hasBackCloseLayer } from "../../hooks/useBackClose";
import { subscribeToLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity } from "../../lib/identities/identityResolution";
import "../../components/local-player-profile/LocalPlayerProfileOverlay.css";

export default function LocalPlayerDetail({ overlay = false }: { overlay?: boolean }) {
  const { server, identifier } = useParams();
  const location = useLocation(), navigate = useNavigate(), { t } = useTranslation();
  const [retry, setRetry] = React.useState(0);
  useAnalyticsView(overlay ? "datahub/player/overlay" : null);
  const renderKey = `${server}/${identifier}${location.search}:${location.key}`;
  const renderKeyRef = React.useRef(renderKey); renderKeyRef.current = renderKey;
  const [loaded, setState] = React.useState<{ key: string; profile: LocalPlayerProfileModel | null; error: string | null }>({ key: renderKey, profile: null, error: null });
  // Never expose the prior observation's actions during a route/context change.
  const state = loaded.key === renderKey ? loaded : { profile: null, error: null };
  const retryCause = React.useRef<{ key: string; retry: number; cause?: import("../../lib/local-data/localDataDependencies").LocalDependencyNotification }>();
  const closing = React.useRef(false);
  const entryPending = React.useRef(false);
  const close = React.useCallback(() => {
    if (closing.current || hasBackCloseLayer()) return;
    closing.current = true;
    if (overlay) navigate(-1);
    else navigate(safeLocalReturn(location.state?.returnTo) ?? PLAYER_HUB, { replace: true, state: location.state?.profileReturnState });
  }, [overlay, navigate, location.state]);
  React.useEffect(() => {
    let stopped = false; closing.current = false;
    const controller = new AbortController();
    entryPending.current = true;
    setState(previous => previous.key === renderKey && previous.profile ? previous : { key: renderKey, profile: null, error: null });
    const entity = parseLocalEntity("player", server, identifier);
    if (!entity) { entryPending.current = false; setState({ key: renderKey, profile: null, error: "invalid" }); return; }
    const entry = { entity, observation: parseObservation(location.search) };
    const resolve = () => resolveLocalProfileEntry(entry, preparedProfileSeed(location), () => !stopped, undefined, auditEnabled() ? { ...(retryCause.current?.key === renderKey && retryCause.current.retry === retry ? retryCause.current.cause : undefined), trigger: retryCause.current?.key === renderKey && retryCause.current.retry === retry ? retryCause.current.cause?.trigger ?? "profile-entry-retry-effect" : "profile-entry-route-effect", consumer: overlay ? "profile-overlay-entry" : "profile-route-entry", retry } : undefined, !overlay);
    void resolve().catch(async error => {
      if (!(error instanceof LocalProfileEntryError) || error.code !== "missing") throw error;
      entry.observation = await acquireProfileEntrySource("player", entity, entry.observation, controller.signal);
      return resolve().catch(error => {
        if (entry.observation.kind === "exact" && error instanceof LocalProfileEntryError && error.code === "missing") throw new ProfileEntryAcquisitionError("historicalMissing");
        throw error;
      });
    }).then(profile => { if (!stopped && !closing.current && renderKeyRef.current === renderKey) setState({ key: renderKey, profile, error: null }); }, error => {
        if (!stopped && !closing.current && renderKeyRef.current === renderKey) setState({ key: renderKey, profile: null, error: error instanceof LocalProfileEntryError || error instanceof ProfileEntryAcquisitionError ? error.code : "failed" });
      }).finally(() => { if (!stopped) entryPending.current = false; });
    return () => { stopped = true; controller.abort(); entryPending.current = false; };
  }, [server, identifier, location.search, location.key, retry]);
  useRuntimeAuditCommit(state.profile, !!state.profile && !state.error, overlay ? "profile-entry-overlay" : "profile-entry-route");
  const preparedLifetime = React.useRef(0);
  React.useEffect(() => {
    const lifetime = ++preparedLifetime.current;
    return () => { queueMicrotask(() => { if (preparedLifetime.current === lifetime) releasePreparedProfile(location); }); };
  }, [location.pathname, location.search]);
  React.useEffect(() => {
    const anchor = parseObservation(location.search);
    const notify = (cause?: import("../../lib/local-data/localDataDependencies").LocalDependencyNotification) => { if (entryPending.current) return; setRetry(n => {
      if (auditEnabled()) retryCause.current = { key: renderKeyRef.current, retry: n + 1, cause };
      return n + 1;
    }); };
    const diagnostic = { consumer: overlay ? "profile-overlay-entry" : "profile-route-entry" };
    if (anchor.kind === "exact") return subscribeToLocalDataDependencies({ allIdentities: true, sourceIds: [state.profile?.sourceScanId ?? anchor.anchor.source] }, notify, undefined, diagnostic);
    // Keep the existing conservative subscription until the confirmed player
    // scope is ready. A new VS archive must not unmount an unrelated profile.
    let stopped = false;
    let stop = subscribeToLocalDataDependencies({ allIdentities: true, allSources: true }, notify, undefined, diagnostic);
    const entity = parseLocalEntity("player", server, identifier);
    if (entity && state.profile) void loadIdentityResolutionSnapshot().then(identity => {
      if (stopped) return;
      const resolved = resolvePlayerIdentity(identity, entity.identifier);
      if (resolved.status === "conflict") return;
      const next = subscribeToLocalDataDependencies({ allIdentities: true, sourceIds: [state.profile!.sourceScanId],
        sourceScope: { players: [entity.identifier, ...resolved.aliasIdentifiers] } }, notify, undefined, diagnostic);
      stop(); stop = next;
    }, console.error);
    return () => { stopped = true; stop(); };
  }, [server, identifier, location.search, state.profile?.sourceScanId, retry]);
  React.useEffect(() => {
    if (!overlay || state.profile) return;
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [overlay, state.profile, close]);
  const copy = () => { void navigator.clipboard.writeText(localCopyLink(location.pathname + location.search)); };
  const goToProfile = () => {
    closing.current = true;
    // Keep the exact addressed observation and valid parent return state; discard the overlay token.
    navigate(location.pathname + location.search, { replace: true, state: {
      returnTo: safeLocalReturn(location.state?.returnTo), profileReturnState: location.state?.profileReturnState,
    } });
  };
  const openingContext = location.state?.localProfileOpeningContext;
  if (overlay && state.profile) return <LocalPlayerProfileOverlay isOpen profile={state.profile} onClose={close} onCopyLink={copy} openingContext={openingContext} onGoToProfile={goToProfile} />;
  const content = <>
    {!state.profile && <LocalPlayerProfileHeader onClose={close} />}
    {state.profile ? <LocalPlayerProfileContent profile={state.profile} onClose={close} onCopyLink={copy} /> : state.error ? <div role="alert">{t(`localProfileRoute.${state.error}`)}<button type="button" onClick={() => setRetry(n => n + 1)}>{t("localProfileRoute.retry")}</button></div>
      : <DataHubLoadingState variant="page" className="local-profile-loading" message={t("localProfileRoute.loading")} />}
  </>;
  return overlay ? <div className="profile-overlay profile-overlay--local" role="dialog" aria-modal="true" onClick={close}><div className="profile-overlay__panel profile-overlay__panel--local" onClick={e => e.stopPropagation()}>{content}</div></div>
    : <div className="local-profile-shell"><ContentShell centerFramed={false} padded={false}><section className={`local-profile-page profile-overlay--local${!state.profile && !state.error ? " local-profile-page--loading" : ""}`}>{content}</section></ContentShell></div>;
}
