import React from "react";
import ContentShell from "../../../components/ContentShell";

export default function BlankTemplatePageLayout4() {
  return (
    <ContentShell
      title="Leere Template-Seite · Layout 4"
      subtitle="Großformatiger Workspace für experimentelle Kompositionen."
      centerFramed
    >
      <div className="flex w-full flex-col gap-6 pt-10">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
            <p className="text-xs uppercase tracking-[0.4em]" style={{ color: "#A5B7DB" }}>
              Bereich 1
            </p>
            <div className="mt-4 h-40 rounded-2xl border border-dashed border-white/30 bg-gradient-to-b from-white/5 to-transparent" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
              <p className="text-xs uppercase tracking-[0.35em]" style={{ color: "#A5B7DB" }}>
                Bereich 2
              </p>
              <div className="mt-4 h-28 rounded-2xl border border-dashed border-white/30 bg-white/5" />
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
              <p className="text-xs uppercase tracking-[0.35em]" style={{ color: "#A5B7DB" }}>
                Bereich 3
              </p>
              <div className="mt-4 h-28 rounded-2xl border border-dashed border-white/30 bg-white/5" />
            </div>
          </div>
        </div>
      </div>
    </ContentShell>
  );
}
