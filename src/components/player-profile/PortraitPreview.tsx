import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PortraitOptions } from "./types";

type PortraitMakerCtor = typeof import("https://pm-lib.12hp.de/PortraitMaker-core-1.30.js").default;

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
};

type PortraitStatus = "idle" | "loading" | "ready" | "error";

const statusLabel: Record<PortraitStatus, string> = {
  idle: "Porträt lädt …",
  loading: "PortraitMaker wird initialisiert …",
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

  const normalized = useMemo(() => sanitizeConfig(config), [JSON.stringify(config || {})]);

  useEffect(() => {
    let disposed = false;

    async function boot() {
      setStatus("loading");
      try {
        const canvas = canvasRef.current;
        if (!canvas) {
          setStatus("error");
          return;
        }
        const module = (await import(
          /* @vite-ignore */ "https://pm-lib.12hp.de/PortraitMaker-core-1.30.js"
        )) as { default: PortraitMakerCtor };
        if (disposed) return;
        const PortraitMaker = module.default;
        const instance = new PortraitMaker(canvas, normalized);
        instanceRef.current = instance;
        setStatus("ready");
      } catch (error) {
        console.error("[PortraitMaker] failed to initialize", error);
        if (!disposed) setStatus("error");
      }
    }

    boot();
    return () => {
      disposed = true;
      try {
        instanceRef.current?.dispose?.();
      } catch {
        /* noop */
      }
      instanceRef.current = null;
    };
  }, [normalized]);

  return (
    <div className="player-profile__portrait" aria-live="polite">
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="player-profile__portrait-canvas"
        aria-label={`Portrait von ${label}`}
      />
      {status !== "ready" && (
        <div className="player-profile__portrait-overlay">
          <div className="player-profile__portrait-overlay-text">{statusLabel[status]}</div>
        </div>
      )}
    </div>
  );
}
