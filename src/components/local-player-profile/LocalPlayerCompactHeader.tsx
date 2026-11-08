import { getAppPageScrollport } from "../../lib/ui/appPageScroll";
import React from "react";
import { createPortal } from "react-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import guildStyles from "../../pages/GuildHub/Dashboard.module.css";
import cardStyles from "../../pages/GuildHub/DashboardGuildCard.module.css";

type Props = {
  expandedRef: React.RefObject<HTMLDivElement>;
  freshnessRef: React.RefObject<HTMLDivElement>;
  geometryKey: object;
  name: string;
  portrait: React.ReactNode;
  freshness: React.ReactNode;
  modes: React.ReactNode;
  comparisonSelect?: React.ReactNode;
};

export default function LocalPlayerCompactHeader({ expandedRef, freshnessRef, geometryKey, name, portrait, freshness, modes, comparisonSelect }: Props) {
  const { t } = useTranslation();
  const headerRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const expanded = expandedRef.current, status = freshnessRef.current, header = headerRef.current;
    const grid = expanded?.closest<HTMLElement>(".profile-overlay__local-grid");
    const content = grid?.closest<HTMLElement>(".profile-overlay__content--local");
    // The page uses the shared document scrollport; the dialog
    // owns its bounded content scroller. Never listen to the page's inner box.
    const overlay = content?.closest(".profile-overlay[role='dialog']");
    const pageScroll = getAppPageScrollport();
    const scroller = overlay ? content : pageScroll.element;
    const avatar = expanded?.querySelector<HTMLElement>(".avatar-portrait canvas, .avatar-portrait img")
      ?? expanded?.querySelector<HTMLElement>(".avatar-portrait__canvas-shell");
    if (!header || !expanded || !status || !grid || !scroller || !avatar) return;
    const scrollEvents = overlay ? scroller : pageScroll.events;
    const title = content?.parentElement?.querySelector<HTMLElement>(".profile-overlay__local-header");
    const smallAvatar = header.querySelector<HTMLElement>("[data-compact-crest]")!;
    const smallStatus = header.querySelector<HTMLElement>("[data-compact-hud]")!;
    const smallModes = header.querySelector<HTMLElement>("[data-compact-modes]")!;
    const groups = [smallAvatar, smallStatus, smallModes];
    const box = (element: Element) => element.getBoundingClientRect();
    const set = (key: string, value: number) => header.style.setProperty(key, `${value}px`);
    // Match the guild header's copied Frame surface only on the full page.
    // The overlay retains its existing dialog background and scroll owner.
    const surface = !overlay ? content?.closest(".local-profile-shell")?.querySelector<HTMLElement>(":scope > section") : null;
    const glow = surface?.querySelector<SVGElement>(":scope > svg");
    const surfaceProperties = ["color", "image", "width", "height", "x", "y", "viewport-x", "dock-y"];
    if (surface && title) {
      const image = glow ? `url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(glow))}")` : "none";
      for (const layer of [title, header]) {
        layer.style.setProperty("--head-surface-color", getComputedStyle(document.body).backgroundColor);
        layer.style.setProperty("--head-surface-image", image);
      }
    }
    let origin = 0, logoClearance = 0, statusClearance = 0, ready = false;
    const syncSurface = () => {
      if (!surface || !title) return;
      const background = box(glow ?? surface);
      for (const layer of [title, header]) {
        const position = box(layer);
        const values = { width: background.width, height: background.height, x: background.left, y: background.top,
          "viewport-x": position.left, "dock-y": position.top };
        for (const [name, value] of Object.entries(values)) {
          const property = name === "viewport-x" || name === "dock-y" ? `--head-${name}` : `--head-surface-${name}`;
          layer.style.setProperty(property, `${value}px`);
        }
      }
    };
    const paint = () => {
      // Unlike the guild's fixed shell, this Frame moves with the page scroll.
      syncSurface();
      const travel = scroller.scrollTop - origin;
      const next = travel >= logoClearance && travel > statusClearance;
      if (next === ready) return;
      ready = next;
      header.dataset.compactReady = String(ready);
      header.setAttribute("aria-hidden", String(!ready));
      for (const group of groups) {
        if (!ready && group.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        group.inert = !ready;
        group.setAttribute("aria-hidden", String(!ready));
      }
    };
    const measure = () => {
      const g = box(grid), a = box(avatar), s = box(status), normal = box(expanded);
      const scrollEdge = overlay ? box(scroller).top + scroller.clientTop : pageScroll.top;
      const mobile = window.matchMedia("(max-width: 980px)").matches;
      const style = getComputedStyle(header);
      const padding = parseFloat(style.getPropertyValue("--head-compact-padding"));
      const logoSize = Math.min(a.width, parseFloat(style.getPropertyValue("--head-compact-logo-size")));
      set("--player-compact-left", g.left);
      set("--player-compact-top", scrollEdge);
      set("--player-compact-width", Math.min(g.width, scroller.clientWidth));
      set("--compact-logo-size", logoSize);
      // The page title stays in its original flow slot and sticks independently
      // of these animated groups. In the dialog it already sits above the scroller.
      const titleHeight = !overlay && title ? title.offsetHeight : 0;
      set("--head-title-height", titleHeight);
      const modesBox = expanded.closest(".profile-overlay__local-grid")?.querySelector<HTMLElement>(".local-profile-attribute-mode .local-profile-view-toggle");
      const modesHeight = smallModes.offsetHeight;
      // On narrow screens the five choices share a second row in this same dock.
      const modesLeft = mobile ? (g.width - smallModes.offsetWidth) / 2
        : modesBox ? box(modesBox).left - g.left : normal.right - g.left + padding;
      const statusLeft = mobile ? padding + logoSize + 8 : normal.left - g.left;
      const statusWidth = mobile ? Math.max(0, g.width - padding - statusLeft) : normal.width;
      set("--compact-hud-left", statusLeft);
      set("--compact-hud-width", statusWidth);
      const statusHeight = smallStatus.scrollHeight;
      const leadHeight = padding * 2 + Math.max(logoSize, statusHeight);
      const height = mobile ? leadHeight + 4 + modesHeight
        : padding * 2 + logoSize + 4 + statusHeight;
      set("--head-cover-height", titleHeight + height);
      set("--compact-crest-left", mobile ? padding : a.left - g.left + (a.width - logoSize) / 2);
      set("--compact-crest-top", titleHeight + (mobile ? (leadHeight - logoSize) / 2 : padding));
      set("--compact-hud-top", titleHeight + (mobile ? (leadHeight - statusHeight) / 2 : padding + logoSize + 4));
      set("--compact-modes-left", Math.max(padding, modesLeft));
      set("--compact-modes-top", titleHeight + (mobile ? leadHeight + 4 : (height - modesHeight) / 2));
      header.style.zIndex = overlay ? "1201" : "15";
      header.style.setProperty("--head-surface-color", getComputedStyle(document.body).backgroundColor);
      // As in useCompactGuildHeader, compare scroll travel with measured logo
      // and status clearances. No grid-row boundary or fixed scroll threshold.
      origin = a.top + scroller.scrollTop - scrollEdge;
      logoClearance = Math.max(0, (a.height - logoSize) / 2);
      const compactStatus = smallStatus.querySelector<HTMLElement>(".player-profile__freshness") ?? smallStatus;
      statusClearance = s.bottom + scroller.scrollTop - scrollEdge - origin - (box(compactStatus).bottom - box(header).top);
      paint();
    };
    header.dataset.compactReady = "false";
    header.setAttribute("aria-hidden", "true");
    for (const group of groups) { group.inert = true; group.setAttribute("aria-hidden", "true"); }
    const observer = new ResizeObserver(measure);
    for (const element of [scroller, grid, expanded, avatar, status, smallStatus, smallModes]) observer.observe(element);
    if (title) observer.observe(title);
    if (surface) observer.observe(surface);
    expanded.addEventListener("load", measure, true);
    window.addEventListener("resize", measure);
    scrollEvents.addEventListener("scroll", paint, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      expanded.removeEventListener("load", measure, true);
      window.removeEventListener("resize", measure);
      scrollEvents.removeEventListener("scroll", paint);
      if (surface && title) for (const layer of [title, header]) for (const name of surfaceProperties) {
        layer.style.removeProperty(name === "viewport-x" || name === "dock-y" ? `--head-${name}` : `--head-surface-${name}`);
      }
    };
  }, [expandedRef, freshnessRef, geometryKey]);

  // A body portal also keeps the dialog's backdrop-filter from becoming a
  // containing block for the fixed dock. The measured scrollport owns its box.
  return createPortal(
    <div ref={headerRef} className={`${guildStyles.guildStickyHead} local-player-compact-header`}
      data-local-player-compact-header data-compact-ready="false" aria-hidden="true"
      role="region" aria-label={t("playerProfile.heroPanel.headerLabel", { defaultValue: "Player overview" })}>
      <div className={`${cardStyles.coaStage} ${cardStyles.compactCrest} local-player-compact-avatar`} data-compact-crest>{portrait}</div>
      <div className={`${cardStyles.scanHud} ${cardStyles.compactHud} local-player-compact-freshness`} data-compact-hud>
        <strong className="local-player-compact-name">{name}</strong>
        {freshness}
      </div>
      <div className={guildStyles.compactModes} data-compact-modes>
        {comparisonSelect && <div className="local-player-compact-comparison">{comparisonSelect}</div>}
        {modes}
      </div>
    </div>, document.body,
  );
}
