import React from "react";
import ContentShell from "../../../components/ContentShell";

const outline = [
  { id: "hero", title: "Hero Panel", description: "Ein optionaler Einstieg mit Titel und Actions." },
  { id: "overview", title: "Overview Blocks", description: "Kurze KPIs oder Status-Kacheln." },
  { id: "details", title: "Detail Cards", description: "Sections fuer tiefergehende Inhalte oder Tabellen." },
];

const quickStats = [
  { label: "Last Update", value: "vor 2 Stunden" },
  { label: "Owner", value: "Playground Team" },
  { label: "Status", value: "Prototype" },
];

const plannedActions = [
  "Review Datenbindung fuer API",
  "UI mit Live-Daten verdrahten",
  "Validierung & Edge-Cases definieren",
];

export default function ContentShellTemplatePage() {
  return (
    <ContentShell
      title="ContentShell Template"
      subtitle="Basislayout fuer neue Playground-Seiten"
      leftWidth={260}
      rightWidth={260}
      centerFramed
      left={
        <div className="space-y-4 text-sm text-slate-200">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Outline</div>
            <ul className="mt-2 space-y-2">
              {outline.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-600/60 bg-slate-800/50 p-3">
                  <div className="font-semibold text-slate-50">{item.title}</div>
                  <p className="text-xs text-slate-400">{item.description}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Checks</div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
              <li>Viewport-Anpassung -&gt; Desktop/Mobile</li>
              <li>Dark-Mode Farben auf Konsistenz pruefen</li>
              <li>Rail Inhalte sticky halten</li>
            </ul>
          </div>
        </div>
      }
      right={
        <div className="space-y-4 text-sm text-slate-200">
          <div className="rounded-2xl border border-slate-600/60 bg-slate-900/40 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Quick Stats</div>
            <dl className="mt-3 space-y-3 text-sm">
              {quickStats.map((stat) => (
                <div key={stat.label} className="flex flex-col gap-1">
                  <dt className="text-xs text-slate-400">{stat.label}</dt>
                  <dd className="font-semibold">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="text-xs uppercase tracking-wide text-emerald-200">Next up</div>
            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-emerald-100/90">
              {plannedActions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section id="hero" className="rounded-2xl border border-slate-600/60 bg-slate-900/40 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Hero</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-50">Willkommen im Template</h2>
              <p className="text-sm text-slate-300">Nutze diesen Bereich, um Kontext oder KPIs zu platzieren.</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded-xl border border-slate-500/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200">
                Secondary
              </button>
              <button className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-950">
                Primary Action
              </button>
            </div>
          </div>
        </section>

        <section id="overview" className="grid gap-4 md:grid-cols-3">
          {["Snapshot", "Pipelines", "Open Topics"].map((title) => (
            <article key={title} className="rounded-2xl border border-slate-600/60 bg-slate-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">{title}</div>
              <p className="mt-2 text-3xl font-semibold text-white">42</p>
              <p className="text-xs text-slate-500">Platzhalter fuer Inhalte oder KPIs.</p>
            </article>
          ))}
        </section>

        <section id="details" className="space-y-4">
          {[1, 2].map((idx) => (
            <article key={idx} className="rounded-2xl border border-slate-600/60 bg-slate-900/60 p-5">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Detail Section {idx}</p>
                  <h3 className="text-xl font-semibold text-white">Modul {idx}</h3>
                </div>
                <button className="rounded-lg border border-slate-500/50 px-3 py-1 text-xs text-slate-200">
                  Configure
                </button>
              </header>
              <p className="mt-3 text-sm text-slate-300">
                Dieser Bereich ist bewusst leer gehalten, damit schnell Komponenten, Tabellen oder Diagramme eingefuegt
                werden koennen.
              </p>
            </article>
          ))}
        </section>
      </div>
    </ContentShell>
  );
}
