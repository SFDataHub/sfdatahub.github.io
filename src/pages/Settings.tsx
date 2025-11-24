// src/pages/Settings.tsx
import React from "react";
import ContentShell from "../components/ContentShell";

export default function SettingsIndex() {
  return (
    <ContentShell
      title="Einstellungen"
      subtitle="Profil, Sicherheit, Anzeige"
      centerFramed
    >
      {/* Dein Seiteninhalt */}
      <div className="space-y-4">
        <section
          className="rounded-2xl border p-4"
          style={{ borderColor: "#2B4C73", background: "#152A42" }}
        >
          <h3 className="mb-2 text-sm" style={{ color: "#F5F9FF" }}>Profil</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs" style={{ color: "#B0C4D9" }}>
              Anzeigename
              <input
                className="rounded-lg border bg-transparent px-3 py-2"
                style={{ borderColor: "#2B4C73", color: "#F5F9FF" }}
              />
            </label>
            <label className="grid gap-1 text-xs" style={{ color: "#B0C4D9" }}>
              E-Mail
              <input
                className="rounded-lg border bg-transparent px-3 py-2"
                style={{ borderColor: "#2B4C73", color: "#F5F9FF" }}
              />
            </label>
          </div>
        </section>
      </div>
    </ContentShell>
  );
}
