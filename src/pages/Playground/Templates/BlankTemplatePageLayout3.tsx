import React from "react";
import ContentShell from "../../../components/ContentShell";

const timelines = [
  { label: "Sektion A", info: "Intro + Hinweise" },
  { label: "Sektion B", info: "Visuelle Tester" },
  { label: "Sektion C", info: "Varianten-Log" },
];

export default function BlankTemplatePageLayout3() {
  return (
    <ContentShell
      title="Leere Template-Seite · Layout 3"
      subtitle="Übersichtliche Spalten lassen sich schnell mit Komponenten füllen."
      centerFramed
    >
      <div className="flex w-full flex-col gap-8 pt-10">
        <div className="flex w-full flex-col gap-4">
          {timelines.map((item) => (
            <div
              key={item.label}
              className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/60 p-5"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.4em]" style={{ color: "#7EA0D4" }}>
                {item.label}
                <span>Leer</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{item.info}</p>
              <div className="mt-4 h-32 rounded-2xl border border-dashed border-white/30 bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    </ContentShell>
  );
}
