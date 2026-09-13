import React from "react";
import { Plus } from "lucide-react";
import { CoaRenderer } from "https://sf-libs.12hp.de/coa-lib/coa-lib-1.0.0.min.js";
import {
  getGuildAccentPalette,
  GUILD_ACCENT_FALLBACK,
  SFDATAHUB_ACTION_BLUE,
  type GuildAccentPalette,
} from "../../lib/ui/guildAccent";
import { isValidGuildCoaString } from "../../lib/guilds/guildCoa";
import styles from "./GuildCard.module.css";

const COA_CANVAS_SIZE = 240;

type GuildEmblemStyle = React.CSSProperties & {
  "--guild-card-accent"?: string;
};

export type GuildEmblemVisual = {
  accent: string;
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

function useRenderedCoaUrl(coaString?: string | null, guildName?: string | null) {
  const [coaUrl, setCoaUrl] = React.useState<string | null>(null);
  const rendererRef = React.useRef<CoaRenderer | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const renderVersionRef = React.useRef(0);
  const normalizedCoa = React.useMemo(() => String(coaString ?? "").trim(), [coaString]);
  const normalizedGuildName = React.useMemo(() => String(guildName ?? "").trim() || undefined, [guildName]);
  const canRenderCoa = isValidGuildCoaString(normalizedCoa);

  React.useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      canvasRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    renderVersionRef.current += 1;
    const currentVersion = renderVersionRef.current;

    if (!canRenderCoa || typeof document === "undefined") {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setCoaUrl(null);
      return;
    }

    let isCancelled = false;
    let frameId: number | null = null;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = COA_CANVAS_SIZE;
    canvas.height = COA_CANVAS_SIZE;

    const clearCanvas = () => {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
    };

    const captureCanvas = () => {
      if (isCancelled || renderVersionRef.current !== currentVersion) return;
      try {
        const nextUrl = canvas.toDataURL("image/png");
        setCoaUrl((previousUrl) => (previousUrl === nextUrl ? previousUrl : nextUrl));
      } catch {
        setCoaUrl(null);
      }
    };

    const bindRendererCallbacks = (renderer: CoaRenderer) => {
      renderer.onError = () => {
        if (isCancelled || renderVersionRef.current !== currentVersion) return;
        clearCanvas();
        setCoaUrl(null);
      };
      renderer.onFinish = captureCanvas;
    };

    if (!rendererRef.current) {
      try {
        const renderer = new CoaRenderer(canvas, normalizedCoa, normalizedGuildName);
        bindRendererCallbacks(renderer);
        rendererRef.current = renderer;
        if (typeof window !== "undefined") {
          frameId = window.requestAnimationFrame(captureCanvas);
        }
      } catch {
        clearCanvas();
        setCoaUrl(null);
      }

      return () => {
        isCancelled = true;
        if (typeof window !== "undefined" && frameId != null) window.cancelAnimationFrame(frameId);
      };
    }

    const renderer = rendererRef.current;
    bindRendererCallbacks(renderer);
    renderer.updateCOA(normalizedCoa, normalizedGuildName).then(captureCanvas).catch(() => {
      if (isCancelled || renderVersionRef.current !== currentVersion) return;
      clearCanvas();
      setCoaUrl(null);
    });

    return () => {
      isCancelled = true;
      if (typeof window !== "undefined" && frameId != null) window.cancelAnimationFrame(frameId);
    };
  }, [canRenderCoa, normalizedCoa, normalizedGuildName]);

  return canRenderCoa ? coaUrl : null;
}

function useGuildAccent(emblemUrl?: string | null) {
  const [palette, setPalette] = React.useState<GuildAccentPalette>(() => ({
    accent: GUILD_ACCENT_FALLBACK,
    candidates: [GUILD_ACCENT_FALLBACK],
    source: "fallback",
  }));

  React.useEffect(() => {
    let cancelled = false;

    getGuildAccentPalette(emblemUrl)
      .then((nextPalette) => {
        if (!cancelled) setPalette(nextPalette);
      })
      .catch(() => {
        if (!cancelled) {
          setPalette({
            accent: GUILD_ACCENT_FALLBACK,
            candidates: [GUILD_ACCENT_FALLBACK],
            source: "fallback",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [emblemUrl]);

  return palette;
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
  const visualEmblemUrl = renderedCoaUrl || (hasValidCoa ? null : emblemUrl ?? null);
  const guildPalette = useGuildAccent(visualEmblemUrl);

  return {
    accent: guildPalette.accent,
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
