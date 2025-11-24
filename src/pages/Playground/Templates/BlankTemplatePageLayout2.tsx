// FILE: src/pages/Playground/Templates/BlankTemplatePageLayout2.tsx

import React from "react";
import ContentShell from "../../../components/ContentShell";
import styles from "./BlankTemplatePageLayout2.module.css";

const modules = [
  { title: "Header", detail: "Großer Hero-Bereich" },
  { title: "CTA-Row", detail: "Zentrale Aktion mit zwei Buttons" },
  { title: "Preview", detail: "Großes Portrait, ready to replace with real block" },
  { title: "Log", detail: "Beobachte Logs oder Hinweise hier" },
];

export default function BlankTemplatePageLayout2() {
  return (
    <ContentShell
      title="Leere Template-Seite · Layout 2"
      subtitle="Wähle einzelne Bereiche und teste ihre Kombination."
      centerFramed
    >
      <div className="flex w-full flex-col gap-6 pt-10">
        <div className="grid w-full gap-6 md:grid-cols-2">
          {modules.map((module) => (
            <div
              key={module.title}
              className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/60 p-5"
            >
              <span className="text-sm font-semibold text-white">{module.title}</span>
              <p className="mt-2 text-xs text-slate-300">{module.detail}</p>
              <div className="mt-4 h-24 flex-1 rounded-2xl border border-dashed border-white/30 bg-white/5" />
            </div>
          ))}
        </div>

        {/* Avatar-Fade-Demos */}
        <section className="mt-10 flex w-full flex-col gap-10">
          {/* Variante 1: Mask-Gradient (radial) */}
          <div>
            <h2 className="text-base font-semibold text-white">
              Variante 1 – Radialer Mask-Fade (Avatar-Hintergrund blendet weich aus)
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Das Avatarbild wird mit einer Maskierung in der Mitte komplett sichtbar
              gehalten und zu den Rändern hin transparent, sodass der Card-Hintergrund
              durchscheint.
            </p>

            <div className="mt-4">
              <div className={styles.avatarFrameMask}>
                {/* Avatar-Quelle hier anpassen */}
                <img
                  src="/assets/demo-avatar-special.png"
                  alt="Avatar Demo – Mask Fade"
                />
              </div>
            </div>
          </div>

          {/* Variante 2: Overlay-Gradient */}
          <div>
            <h2 className="text-base font-semibold text-white">
              Variante 2 – Overlay-Gradient (Rand verschmilzt mit Hintergrund)
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Hier bleibt das Avatarbild unverändert, aber ein Overlay-Gradient färbt
              die Ränder in deine Hintergrundfarbe ein. Dadurch wird der harte
              Avatar-Hintergrund aufgeweicht.
            </p>

            <div className="mt-4">
              <div className={styles.avatarFrameOverlay}>
                {/* Avatar-Quelle hier anpassen */}
                <img
                  src="/assets/demo-avatar-special.png"
                  alt="Avatar Demo – Overlay Fade"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </ContentShell>
  );
}
