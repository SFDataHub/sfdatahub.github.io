import React from "react";
import ContentShell from "../../../components/ContentShell";

const placeholders = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  label: index === 0 ? "Leere Vorlage (Neu)" : `Kopie ${index + 1}`,
  note: index === 0 ? "Basisbereich zum Sammeln von Modulen und Ideen." : "Kopiertes Layout zum Testen weiterer Varianten.",
}));

export default function BlankTemplatePageAlt() {
  return (
    <ContentShell
      title="Leere Template-Seite - Neu"
      subtitle="Starte hier mit deinem eigenen Layout."
      centerFramed
    >
      <div className="flex w-full flex-col gap-8 pt-10">
        <div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2">
          {placeholders.map((placeholder) => (
            <div
              key={placeholder.id}
              className="flex h-full flex-col items-stretch gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6"
            >
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: "#86A0C7" }}>
                  {placeholder.label}
                </span>
                <div
                  className="flex h-48 items-center justify-center rounded-2xl border-2 border-dashed border-white/30 px-3 text-center text-sm text-slate-300"
                  style={{ background: "rgba(20, 40, 70, 0.4)" }}
                >
                  Noch keine Inhalte. Ziehe Komponenten aus dem Hub und teste Layoutideen.
                </div>
              </div>
              <p className="text-[11px] text-slate-400">{placeholder.note}</p>
            </div>
          ))}
        </div>
      </div>
    </ContentShell>
  );
}
