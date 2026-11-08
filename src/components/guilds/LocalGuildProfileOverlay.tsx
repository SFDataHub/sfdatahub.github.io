import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useAnalyticsView } from "../../lib/analytics/localEvents";
import Dashboard from "../../pages/GuildHub/Dashboard";
import { useActualProfileLocation } from "../../lib/data-hub/profileNavigation";
import { safeLocalReturn } from "../../lib/data-hub/routes";
import { hasBackCloseLayer } from "../../hooks/useBackClose";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./LocalGuildProfileOverlay.module.css";

export default function LocalGuildProfileOverlay() {
  useAnalyticsView("datahub/guild/overlay");
  const location = useLocation(), actual = useActualProfileLocation(), navigate = useNavigate(), { t } = useTranslation();
  const panel = React.useRef<HTMLElement>(null);
  const returnFocus = React.useRef(document.activeElement);
  const active = location.key === actual.key;
  useFocusTrap(panel, active, { preventInitialScroll: true });
  const closing = React.useRef(false);
  const close = React.useCallback(() => {
    if (!active || closing.current || hasBackCloseLayer()) return;
    closing.current = true;
    navigate(-1);
  }, [active, navigate]);
  React.useEffect(() => {
    const focus = returnFocus.current;
    panel.current?.focus({ preventScroll: true });
    return () => { if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true }); };
  }, []);
  React.useEffect(() => {
    closing.current = false;
    if (!active) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !hasBackCloseLayer()) close(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, close]);
  React.useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [active]);
  const goToProfile = () => {
    closing.current = true;
    navigate(location.pathname + location.search, { replace: true, state: {
      returnTo: safeLocalReturn(location.state?.returnTo), guildReturnState: location.state?.guildReturnState,
    } });
  };
  return <div className={styles.backdrop} data-local-guild-overlay role="dialog" aria-modal={active ? true : undefined}
    aria-label={t("localProfileRoute.openGuild")} onClick={close}>
    <section ref={panel} className={styles.panel} tabIndex={-1} onClick={event => event.stopPropagation()}>
      <main className={styles.content}><Dashboard overlay onClose={close} onGoToProfile={goToProfile} /></main>
    </section>
  </div>;
}
