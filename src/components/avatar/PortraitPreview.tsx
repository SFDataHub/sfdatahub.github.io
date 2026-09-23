import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PortraitMaker from "https://pm-lib.12hp.de/PortraitMaker-core-latest.min.js";
import type { PortraitOptions } from "../player-profile/types";
import "./PortraitPreview.css";

const NEUTRAL_PLACEHOLDER = "/assets/demo-avatar-special.png";

const DEFAULT_PORTRAIT: PortraitOptions = {
  genderName: "male",
  class: 2,
  race: 1,
  mouth: 1,
  hair: 3,
  hairColor: 4,
  horn: 0,
  hornColor: 0,
  brows: 2,
  eyes: 3,
  beard: 0,
  nose: 2,
  ears: 1,
  extra: 0,
  special: 0,
  showBorder: false,
  background: "gradient",
  frame: "",
  mirrorHorizontal: true,
};

type PortraitStatus = "idle" | "loading" | "ready" | "error";

const clampPositive = (value: number, max: number) => Math.min(Math.max(Math.round(value), 0), max);
const roundSpecial = (value: number) => {
  const rounded = Math.round(Number(value));
  return Number.isFinite(rounded) ? rounded : 0;
};
const sanitizeBeard = (value: number) => {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded === 99) return 0;
  return Math.min(rounded, 15);
};
const sanitizeHorn = (value: number, race: number, genderName: PortraitOptions["genderName"]) => {
  if (race !== 8) return 0;
  const maxHorn = genderName === "female" ? 4 : 11;
  return clampPositive(value, maxHorn);
};

const sanitizeConfig = (config?: Partial<PortraitOptions>): PortraitOptions => {
  const merged = { ...DEFAULT_PORTRAIT, ...(config || {}) };
  const genderName = merged.genderName === "female" ? "female" : "male";
  const race = clampPositive(merged.race, 8);
  return {
    ...merged,
    class: clampPositive(merged.class, 15),
    race,
    mouth: clampPositive(merged.mouth, 30),
    hair: clampPositive(merged.hair, 40),
    hairColor: clampPositive(merged.hairColor, 12),
    horn: sanitizeHorn(merged.horn, race, genderName),
    hornColor: clampPositive(merged.hornColor, 10),
    brows: clampPositive(merged.brows, 10),
    eyes: clampPositive(merged.eyes, 20),
    beard: sanitizeBeard(merged.beard),
    nose: clampPositive(merged.nose, 10),
    ears: clampPositive(merged.ears, 10),
    extra: clampPositive(merged.extra, 20),
    special: roundSpecial(merged.special),
    showBorder: false,
    background: "",
    frame: "",
    mirrorHorizontal: merged.mirrorHorizontal ?? DEFAULT_PORTRAIT.mirrorHorizontal,
    genderName,
  };
};

export default function PortraitPreview({
  config,
  label,
  fallbackImage,
  fallbackLabel,
  fallbackNode,
  className,
  shellClassName,
  canvasClassName,
  statusClassName,
  canvasId = "PortraitCanvasPopOut",
  showStatus = true,
}: {
  config?: Partial<PortraitOptions>;
  label: string;
  fallbackImage?: string;
  fallbackLabel?: string;
  fallbackNode?: React.ReactNode;
  className?: string;
  shellClassName?: string;
  canvasClassName?: string;
  statusClassName?: string;
  canvasId?: string;
  showStatus?: boolean;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<{ dispose?: () => void } | null>(null);
  const [status, setStatus] = useState<PortraitStatus>("idle");

  const libraryConfig = useMemo(() => {
    if (!config || Object.keys(config || {}).length === 0) return null;
    return sanitizeConfig(config);
  }, [JSON.stringify(config || {})]);

  useEffect(() => {
    let disposed = false;
    if (!libraryConfig) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        setStatus("error");
        return;
      }
      const instance = new PortraitMaker(canvas, libraryConfig);
      instanceRef.current = instance;
      setStatus("ready");
    } catch (error) {
      console.error("[PortraitMaker] failed to initialize", error);
      if (!disposed) setStatus("error");
    }

    return () => {
      disposed = true;
      try {
        instanceRef.current?.dispose?.();
      } catch {
        /* noop */
      }
      instanceRef.current = null;
    };
  }, [libraryConfig]);

  const statusMessage =
    libraryConfig && status !== "ready"
      ? {
          idle: t("playerProfile.heroPanel.portrait.status.idle", { defaultValue: "Portrait loading ..." }),
          loading: t("playerProfile.heroPanel.portrait.status.loading", {
            defaultValue: "PortraitMaker is initializing ...",
          }),
          ready: t("playerProfile.heroPanel.portrait.status.ready", { defaultValue: "PortraitMaker ready" }),
          error: t("playerProfile.heroPanel.portrait.status.error", {
            defaultValue: "PortraitMaker could not be loaded",
          }),
        }[status]
      : null;
  const placeholderSrc = fallbackImage || NEUTRAL_PLACEHOLDER;
  const placeholderAlt = fallbackLabel || label;
  const showFallback = !libraryConfig || status === "error";

  return (
    <div className={["avatar-portrait", className].filter(Boolean).join(" ")} aria-live="polite">
      <div className={["avatar-portrait__canvas-shell", shellClassName].filter(Boolean).join(" ")}>
        {!showFallback && (
          <canvas
            ref={canvasRef}
            id={canvasId}
            width={526}
            height={526}
            className={["avatar-portrait__canvas avatar-portrait__canvas--popout", canvasClassName].filter(Boolean).join(" ")}
            aria-label={t("playerProfile.heroPanel.portrait.canvasAriaLabel", {
              label,
              defaultValue: "Portrait of {{label}}",
            })}
          />
        )}
        {showFallback && (fallbackNode ?? (
          <img
            src={placeholderSrc}
            alt={placeholderAlt}
            className="avatar-portrait__fallback"
            draggable={false}
            width={240}
            height={240}
          />
        ))}
      </div>
      {showStatus && statusMessage && (
        <span className={["avatar-portrait__status", statusClassName].filter(Boolean).join(" ")}>{statusMessage}</span>
      )}
    </div>
  );
}
