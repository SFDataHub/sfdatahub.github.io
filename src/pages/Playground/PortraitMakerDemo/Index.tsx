// FILE: src/pages/Playground/PortraitMakerDemo/Index.tsx
import React, { useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";
import PortraitMaker from "https://pm-lib.12hp.de/PortraitMaker-core-1.31.js";

type PMOptions = {
  genderName: "male" | "female";
  class: number;
  race: number;
  mouth: number;
  hair: number;
  hairColor: number;
  horn: number;
  hornColor: number;
  brows: number;
  eyes: number;
  beard: number;
  nose: number;
  ears: number;
  extra: number;
  special: number;     // 0 = normal, !=0 = Special-Avatar-Index (Gesichtsteile werden ignoriert)
  showBorder: boolean;
  background:
    | ""
    | "white"
    | "black"
    | "gradient"
    | "transparentGradient"
    | "retroGradient"
    | "stained"
    | "hvGold"
    | "hvSilver"
    | "hvBronze";
  frame:
    | ""
    | "goldenFrame"
    | "twitchFrame"
    | "worldBossFrameGold"
    | "worldBossFrameSilver"
    | "worldBossFrameBronze"
    | "polarisFrame";
};

const BACKGROUNDS: PMOptions["background"][] = [
  "",
  "white",
  "black",
  "gradient",
  "transparentGradient",
  "retroGradient",
  "stained",
  "hvGold",
  "hvSilver",
  "hvBronze",
];

const FRAMES: PMOptions["frame"][] = [
  "",
  "goldenFrame",
  "twitchFrame",
  "worldBossFrameGold",
  "worldBossFrameSilver",
  "worldBossFrameBronze",
  "polarisFrame",
];

export default function PortraitMakerDemoPage() {
  const [status, setStatus] = useState("Canvas ist vorbereitet (526×526).");
  const instanceRef = useRef<any>(null);

  // Optionale Layer standardmäßig AUS; special = 0 (normaler Avatar)
  const [opts, setOpts] = useState<PMOptions>({
    genderName: "male",
    class: 2,
    race: 1,
    mouth: 1,
    hair: 1,
    hairColor: 1,
    horn: 0,
    hornColor: 0,
    brows: 1,
    eyes: 1,
    beard: 0,
    nose: 1,
    ears: 1,
    extra: 0,
    special: 0,
    showBorder: true,
    background: "gradient",
    frame: "",
  });

  // Playground-only: 404-Logs temporär stummschalten
  const [mute404, setMute404] = useState<boolean>(true);

  useEffect(() => {
    const canvas = document.getElementById("PortraitCanvas") as HTMLCanvasElement | null;
    if (!canvas) {
      setStatus("Fehler: Canvas nicht gefunden.");
      return;
    }

    // alte Instanz entsorgen
    try {
      if (instanceRef.current && typeof instanceRef.current.dispose === "function") {
        instanceRef.current.dispose();
      }
    } catch { /* noop */ }

    let originalError = console.error;
    if (mute404) {
      console.error = (...args: any[]) => {
        const msg = String(args?.[0] ?? "");
        if (msg.includes("Failed to load URL") && msg.includes("PortraitMaker-res/portraits/")) {
          return; // Playground: Asset-404s unterdrücken
        }
        originalError(...args);
      };
    }

    let instance: any = null;
    try {
      instance = new (PortraitMaker as any)(canvas, { ...opts });
      instanceRef.current = instance;
      setStatus("Rendering…");
    } catch (error) {
      if (mute404) console.error = originalError;
      originalError("Error initializing PortraitMaker:", error);
      setStatus("Fehler bei der Initialisierung. Details in der Konsole.");
      return;
    }

    if (instance) {
      instance.onFinish = () => {
        if (mute404) console.error = originalError;
        setStatus("Fertig gerendert.");
      };
    }

    return () => {
      try {
        if (instance && typeof instance.dispose === "function") {
          instance.dispose();
        }
      } finally {
        if (mute404) console.error = originalError;
      }
    };
  }, [opts, mute404]);

  const exportPNG = () => {
    const canvas = document.getElementById("PortraitCanvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "portrait.png";
    a.click();
  };

  const onGenderChange = (gender: "male" | "female") => {
    setOpts((o) => ({
      ...o,
      genderName: gender,
      beard: gender === "female" ? 0 : o.beard,
    }));
  };

  const isSpecial = opts.special !== 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.left}>
        <div className={styles.canvasCard}>
          {/* WICHTIG: exakte Attribute lt. Guide */}
          <canvas id="PortraitCanvas" className="portrait-canvas" width={526} height={526} />
          <div className={styles.hint}>{status}</div>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Controls</h2>
          <div className={styles.panelBody}>
            <div style={{ display: "grid", gap: 8 }}>
              {/* SPECIAL */}
              <label title="0 = normaler Avatar; ≠0 = Special-Avatar-Index (ignoriert andere Parts)">
                Special:&nbsp;
                <input
                  type="number"
                  value={opts.special}
                  onChange={(e) => setOpts((o) => ({ ...o, special: Number(e.target.value || 0) }))}
                  style={{ width: 100 }}
                />
              </label>

              {/* Nur relevant, wenn special = 0 */}
              <fieldset disabled={isSpecial} style={{ border: 0, padding: 0, margin: 0 }}>
                <label>
                  Gender:&nbsp;
                  <select
                    value={opts.genderName}
                    onChange={(e) => onGenderChange(e.target.value as PMOptions["genderName"])}
                  >
                    <option value="male">male</option>
                    <option value="female">female</option>
                  </select>
                </label>

                <label>
                  Class:&nbsp;
                  <input
                    type="number"
                    min={1}
                    value={opts.class}
                    onChange={(e) => setOpts((o) => ({ ...o, class: Number(e.target.value || 0) }))}
                    style={{ width: 80 }}
                  />
                </label>

                <label>
                  Race:&nbsp;
                  <input
                    type="number"
                    min={1}
                    value={opts.race}
                    onChange={(e) => setOpts((o) => ({ ...o, race: Number(e.target.value || 0) }))}
                    style={{ width: 80 }}
                  />
                </label>
              </fieldset>

              {/* Immer relevant */}
              <label>
                Background:&nbsp;
                <select
                  value={opts.background}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, background: e.target.value as PMOptions["background"] }))
                  }
                >
                  {BACKGROUNDS.map((b) => (
                    <option key={b} value={b}>
                      {b === "" ? "transparent" : b}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Frame:&nbsp;
                <select
                  value={opts.frame}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, frame: e.target.value as PMOptions["frame"] }))
                  }
                >
                  {FRAMES.map((f) => (
                    <option key={f} value={f}>
                      {f === "" ? "none" : f}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={opts.showBorder}
                  onChange={(e) => setOpts((o) => ({ ...o, showBorder: e.target.checked }))}
                />
                showBorder
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={mute404}
                  onChange={(e) => setMute404(e.target.checked)}
                />
                Mute 404 logs (Playground)
              </label>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={exportPNG}>Export PNG</button>
              </div>

              {isSpecial && (
                <div className={styles.hint}>
                  Hinweis: Bei <code>special ≠ 0</code> werden die Gesichtsteile ignoriert — das ist korrekt
                  laut Guide.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
