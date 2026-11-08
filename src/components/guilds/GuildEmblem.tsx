import React from "react";
import { Plus } from "lucide-react";
import { CoaRenderer } from "https://sf-libs.12hp.de/coa-lib/coa-lib-1.0.0.min.js";
import {
  getGuildAccentPalette,
  cachedGuildAccentPalette,
  GUILD_ACCENT_FALLBACK,
  type GuildAccentPalette,
} from "../../lib/ui/guildAccent";
import { isValidGuildCoaString } from "../../lib/guilds/guildCoa";
import styles from "./GuildCard.module.css";

const COA_CANVAS_SIZE = 240;
// Reuse completed artwork on chart/overlay remounts, just like its palette.
const renderedCoas = new Map<string, string | null>();
const renderingCoas = new Map<string, Promise<string | null>>();

type GuildEmblemStyle = React.CSSProperties & {
  "--guild-card-accent"?: string;
};

export type GuildEmblemVisual = {
  accent: string;
  ready: boolean;
  visualEmblemUrl: string | null;
};

export type GuildEmblemArtworkProps = {
  fallbackLabel?: string;
  kind?: "guild" | "add";
  size?: "card" | "compact";
  visualEmblemUrl?: string | null;
};

export type GuildEmblemProps = {
  active?: boolean;
  className?: string;
  coaString?: string | null;
  emblemUrl?: string | null;
  fallbackLabel?: string;
  name: string;
  size?: "card" | "compact";
};

function cx(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(" ");
}

const coaRenderKey = (coaString?: string | null, guildName?: string | null) =>
  JSON.stringify([String(coaString ?? "").trim(), String(guildName ?? "").trim()]);

// Renderer work belongs to its exact CoA/name key, independently of a mounted
// card. Navigation can join an existing job without restarting asset loading.
export function prepareGuildCoa(coaString?: string | null, guildName?: string | null): Promise<string | null> {
  const normalizedCoa = String(coaString ?? "").trim();
  const normalizedGuildName = String(guildName ?? "").trim() || undefined;
  if (!isValidGuildCoaString(normalizedCoa) || typeof document === "undefined") return Promise.resolve(null);
  const cacheKey = coaRenderKey(normalizedCoa, normalizedGuildName);
  if (renderedCoas.has(cacheKey)) return Promise.resolve(renderedCoas.get(cacheKey)!);
  const existing = renderingCoas.get(cacheKey);
  if (existing) return existing;
  let complete!: (url: string | null) => void;
  const pending = new Promise<string | null>(resolve => { complete = resolve; });
  renderingCoas.set(cacheKey, pending);
  const canvas = document.createElement("canvas");
  canvas.width = COA_CANVAS_SIZE;
  canvas.height = COA_CANVAS_SIZE;
  let renderer: CoaRenderer | null = null;
  let finished = false;
  const settle = (url: string | null) => {
    if (finished) return;
    finished = true;
    renderedCoas.set(cacheKey, url);
    renderingCoas.delete(cacheKey);
    complete(url);
    renderer?.dispose();
  };
  const captureCanvas = () => {
    if (finished) return;
    try { settle(canvas.toDataURL("image/png")); } catch { settle(null); }
  };
  try {
    renderer = new CoaRenderer(canvas, normalizedCoa, normalizedGuildName);
    renderer.onFinish = captureCanvas;
    renderer.onError = () => settle(null);
  } catch { settle(null); }
  return pending;
}

export function useRenderedCoaUrl(coaString?: string | null, guildName?: string | null) {
  const cacheKey = coaRenderKey(coaString, guildName);
  const canRenderCoa = isValidGuildCoaString(String(coaString ?? "").trim());
  const [rendered, setRendered] = React.useState<{ key: string; url: string | null } | null>(() =>
    renderedCoas.has(cacheKey) ? { key: cacheKey, url: renderedCoas.get(cacheKey)! } : null);
  React.useEffect(() => {
    if (!canRenderCoa) return;
    if (renderedCoas.has(cacheKey)) {
      // Also cover completion between render and the passive effect.
      const url = renderedCoas.get(cacheKey)!;
      setRendered(current => current?.key === cacheKey && current.url === url ? current : { key: cacheKey, url });
      return;
    }
    let cancelled = false;
    void prepareGuildCoa(coaString, guildName).then(url => {
      if (!cancelled) setRendered({ key: cacheKey, url });
    });
    return () => { cancelled = true; };
  }, [cacheKey, canRenderCoa]);
  // Completed entries participate in this render, including the first frame.
  const cached = renderedCoas.has(cacheKey);
  return { url: canRenderCoa ? (cached ? renderedCoas.get(cacheKey)! : rendered?.key === cacheKey ? rendered.url : null) : null,
    ready: !canRenderCoa || cached || rendered?.key === cacheKey };
}

function useGuildAccent(emblemUrl?: string | null) {
  const [resolved, setResolved] = React.useState<{ src: string | null | undefined; palette: GuildAccentPalette } | null>(null);
  const cached = cachedGuildAccentPalette(emblemUrl);
  React.useEffect(() => {
    let cancelled = false;
    getGuildAccentPalette(emblemUrl).then(palette => { if (!cancelled) setResolved({ src: emblemUrl, palette }); });
    return () => { cancelled = true; };
  }, [emblemUrl]);
  const palette = cached ?? (resolved && resolved.src === emblemUrl ? resolved.palette : null);
  return { accent: palette?.accent ?? GUILD_ACCENT_FALLBACK, ready: Boolean(palette) };
}

export function useGuildEmblemVisual({
  coaString,
  emblemUrl,
  name,
}: {
  coaString?: string | null;
  emblemUrl?: string | null;
  name?: string | null;
}): GuildEmblemVisual {
  const renderedCoaUrl = useRenderedCoaUrl(coaString, name);
  const normalizedCoa = React.useMemo(() => String(coaString ?? "").trim(), [coaString]);
  const hasValidCoa = Boolean(normalizedCoa && isValidGuildCoaString(normalizedCoa));
  const visualEmblemUrl = renderedCoaUrl.url || (hasValidCoa ? null : emblemUrl ?? null);
  const guildPalette = useGuildAccent(visualEmblemUrl);

  return {
    accent: guildPalette.accent,
    ready: renderedCoaUrl.ready && guildPalette.ready,
    visualEmblemUrl,
  };
}

export function GuildEmblemArtwork({
  fallbackLabel,
  kind = "guild",
  size = "card",
  visualEmblemUrl,
}: GuildEmblemArtworkProps) {
  const compact = size === "compact";

  return (
    <span className={cx(styles.emblemRing, compact && styles.emblemRingCompact)} aria-hidden="true">
      <span className={cx(styles.emblemInner, compact && styles.emblemInnerCompact)}>
        {kind === "add" ? (
          <span className={cx(styles.addIcon, compact && styles.addIconCompact)}>
            <Plus size={compact ? 24 : 42} strokeWidth={2.3} aria-hidden />
          </span>
        ) : visualEmblemUrl ? (
          <img
            src={visualEmblemUrl}
            alt=""
            className={cx(styles.emblem, compact && styles.emblemCompact)}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className={cx(styles.fallbackMark, compact && styles.fallbackMarkCompact)}>
            {fallbackLabel ?? "G"}
          </span>
        )}
      </span>
    </span>
  );
}

export default function GuildEmblem({
  active,
  className,
  coaString,
  emblemUrl,
  fallbackLabel,
  name,
  size = "card",
}: GuildEmblemProps) {
  const { accent, visualEmblemUrl } = useGuildEmblemVisual({ coaString, emblemUrl, name });
  const style: GuildEmblemStyle = { "--guild-card-accent": accent };

  return (
    <span
      className={cx(
        styles.emblemRoot,
        size === "compact" && styles.emblemRootCompact,
        active && styles.emblemRootActive,
        className,
      )}
      style={style}
    >
      <GuildEmblemArtwork
        fallbackLabel={fallbackLabel}
        size={size}
        visualEmblemUrl={visualEmblemUrl}
      />
    </span>
  );
}
