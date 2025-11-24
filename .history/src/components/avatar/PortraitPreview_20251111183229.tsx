import React, { useEffect, useMemo, useRef, useState } from "react";
import PortraitMaker from "https://pm-lib.12hp.de/PortraitMaker-core-1.31.js";
import type { PortraitOptions } from "../player-profile/types";
import "./PortraitPreview.css";

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
  showBorder: true,
  background: "gradient",
  frame: "",
  mirrorHorizontal: true,
};

type PortraitStatus = "idle" | "loading" | "ready" | "error";

const statusLabel: Record<PortraitStatus, string> = {
  idle: "Portrait l\u00E4dt ...",
  loading: "PortraitMaker wird initialisiert ...",
  ready: "PortraitMaker bereit",
  error: "PortraitMaker konnte nicht geladen werden",
};

const clampPositive = (value: number, max: number) => Math.min(Math.max(Math.round(value), 0), max);

const sanitizeConfig = (config?: Partial<PortraitOptions>): PortraitOptions => {
  const merged = { ...DEFAULT_PORTRAIT, ...(config || {}) };
  return {
    ...merged,
    class: clampPositive(merged.class, 15),
    race: clampPositive(merged.race, 8),
    mouth: clampPositive(merged.mouth, 30),
    hair: clampPositive(merged.hair, 40),
    hairColor: clampPositive(merged.hairColor, 12),
    horn: clampPositive(merged.horn, 10),
    hornColor: clampPositive(merged.hornColor, 10),
    brows: clampPositive(merged.brows, 10),
    eyes: clampPositive(merged.eyes, 20),
    beard: clampPositive(merged.beard, 15),
    nose: clampPositive(merged.nose, 10),
    ears: clampPositive(merged.ears, 10),
    extra: clampPositive(merged.extra, 20),
    special: clampPositive(merged.special, 200),
    showBorder: merged.showBorder ?? true,
    background: merged.background ?? DEFAULT_PORTRAIT.background,
    frame: merged.frame ?? DEFAULT_PORTRAIT.frame,
    mirrorHorizontal: merged.mirrorHorizontal ?? DEFAULT_PORTRAIT.mirrorHorizontal,
    genderName: merged.genderName === "female" ? "female" : "male",
  };
};

export default function PortraitPreview({
  config,
  label,
}: {
  config?: Partial<PortraitOptions>;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<{ dispose?: () => void } | null>(null);
  const [status, setStatus] = useState<PortraitStatus>("idle");

  const libraryConfig = useMemo(() => {
    const normalized = sanitizeConfig(config);
    return {
      ...normalized,
      background: "",
      frame: "",
      showBorder: false,
    };
  }, [JSON.stringify(config || {})]);

  useEffect(() => {
    let disposed = false;
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

  const statusMessage = status !== "ready" ? statusLabel[status] : null;

  return (
    <div className="avatar-portrait" aria-live="polite">
      <div className="avatar-portrait__canvas-shell">
        <canvas
          ref={canvasRef}
          id="PortraitCanvasPopOut"
          width={526}
          height={526}
          className="avatar-portrait__canvas avatar-portrait__canvas--popout"
          aria-label={`Portrait von ${label}`}
        />
      </div>
      {statusMessage && <span className="avatar-portrait__status">{statusMessage}</span>}
    </div>
  );
}
