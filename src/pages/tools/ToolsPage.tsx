import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ContentShell from "../../components/ContentShell";
import { useAuth } from "../../context/AuthContext";

type SetSlot = {
  id: string;
  name: string;
  classLabel: string;
  serverLabel: string;
};

type Tool = {
  id: string;
  name: string;
  description: string;
};

const INITIAL_SETS: SetSlot[] = [
  { id: "main-dh", name: "Main DH", classLabel: "Demon Hunter", serverLabel: "DE-55" },
  { id: "twink-mage", name: "Twink Mage", classLabel: "Mage", serverLabel: "US-12" },
];

const TOOLS: Tool[] = [
  { id: "gem-sim", name: "Gem Simulator", description: "Placeholder fuer kuenftige Gem-Berechnungen." },
  { id: "dungeon-pause", name: "Dungeon Pause", description: "Dummy-Ansicht fuer Dungeon-Pausen-Tools." },
  { id: "xp-dungeon", name: "XP Dungeon", description: "Slide fuer XP-Lauf-Planung als Platzhalter." },
];

export default function ToolsPage() {
  const { t } = useTranslation();
  const { user, status, loginWithDiscord } = useAuth();
  const isLoggedIn = status === "authenticated" && !!user;

  const [sets, setSets] = useState<SetSlot[]>(INITIAL_SETS);
  const [activeSetId, setActiveSetId] = useState<string>(INITIAL_SETS[0]?.id ?? "");
  const [activeToolId, setActiveToolId] = useState<string>(TOOLS[0]?.id ?? "");

  const activeSet = useMemo(() => sets.find((s) => s.id === activeSetId) ?? sets[0], [activeSetId, sets]);
  const activeTool = useMemo(() => TOOLS.find((t) => t.id === activeToolId) ?? TOOLS[0], [activeToolId]);

  const handleAddSet = () => {
    if (sets.length >= 3) return;
    const nextIndex = sets.length + 1;
    const newSet: SetSlot = {
      id: `custom-${nextIndex}`,
      name: `New Set ${nextIndex}`,
      classLabel: "Class TBD",
      serverLabel: "Server TBD",
    };
    setSets((prev) => [...prev, newSet]);
    setActiveSetId(newSet.id);
  };

  const handleLoginClick = () => {
    loginWithDiscord();
  };

  return (
    <ContentShell title="Tools" subtitle="Sets & Dummy-Tools" centerFramed={false}>
      <div className="flex flex-col gap-4 md:gap-6">
        {/* Sets-Leiste */}
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-50">Sets</h2>
              <p className="text-sm text-slate-400">Waehle dein aktives Char-Set (max. 3 Slots)</p>
            </div>
            <span className="text-xs text-slate-400">{sets.length}/3</span>
          </div>

          <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
            {sets.map((set) => {
              const isActive = set.id === activeSetId;
              return (
                <button
                  key={set.id}
                  type="button"
                  onClick={() => setActiveSetId(set.id)}
                  className={[
                    "flex min-w-[180px] flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-emerald-400/70",
                    isActive
                      ? "border-emerald-400/80 bg-emerald-500/10 shadow-[0_10px_40px_-20px_rgba(16,185,129,0.6)]"
                      : "border-slate-700/70 bg-slate-800/60 hover:border-emerald-400/60 hover:bg-slate-800/80",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold text-slate-50">{set.name}</div>
                  <div className="text-xs text-emerald-200/90">{set.classLabel}</div>
                  <div className="text-xs text-slate-400">{set.serverLabel}</div>
                  {isActive && <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Aktiv</div>}
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleAddSet}
              disabled={sets.length >= 3}
              className={[
                "flex h-full min-w-[140px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm font-semibold transition",
                sets.length >= 3
                  ? "cursor-not-allowed border-slate-700/70 bg-slate-800/40 text-slate-500"
                  : "border-emerald-400/60 bg-emerald-500/5 text-emerald-200 hover:border-emerald-400 hover:bg-emerald-500/10",
              ].join(" ")}
            >
              <span className="text-lg">+</span>
              <span>{sets.length >= 3 ? "Max erreicht" : "Neues Set"}</span>
            </button>
          </div>
        </section>

        {/* Tool-Leiste */}
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-50">Tools</h2>
              <p className="text-sm text-slate-400">Dummy-Tools, die das aktive Set verwenden</p>
            </div>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {TOOLS.map((tool) => {
              const isActive = tool.id === activeToolId;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveToolId(tool.id)}
                  className={[
                    "flex flex-shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-400/70",
                    isActive
                      ? "border-emerald-400/80 bg-emerald-500/10 text-emerald-100 shadow-[0_10px_40px_-20px_rgba(16,185,129,0.7)]"
                      : "border-slate-700/70 bg-slate-800/70 text-slate-200 hover:border-emerald-400/60 hover:text-emerald-100",
                  ].join(" ")}
                >
                  <span className="text-base" aria-hidden>*</span>
                  <span>{tool.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Gast vs Account Info-Bereich */}
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 md:p-5">
          {isLoggedIn ? (
            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr] md:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">
                  {t("tools.banner.accountComingSoon")}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-50">
                  {t("tools.banner.accountTitle")}
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[t("tools.banner.featureSetComparison"), t("tools.banner.featureIntegration"), t("tools.banner.featureCloudSync")].map((copy) => (
                  <div
                    key={copy}
                    className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3 text-sm text-emerald-50 shadow-[0_12px_45px_-30px_rgba(16,185,129,0.8)]"
                  >
                    <div className="text-xs uppercase tracking-wide text-emerald-200/90">
                      {t("tools.banner.accountComingSoon")}
                    </div>
                    <div className="mt-1 leading-snug text-emerald-50/90">{copy}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-50">
                  {t("tools.banner.guestTitle")}
                </h3>
                <p className="text-sm text-slate-400">
                  {t("tools.banner.guestDescription")}
                </p>
                <ul className="text-sm text-slate-300">
                  {[t("tools.banner.featureSetComparison"), t("tools.banner.featureIntegration"), t("tools.banner.featureCloudSync")].map((copy) => (
                    <li key={copy} className="flex items-start gap-2">
                      <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                      <span>{copy}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-3 md:flex-col md:items-end">
                <button
                  type="button"
                  onClick={handleLoginClick}
                  className="rounded-xl border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:border-emerald-300 hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
                >
                  {t("tools.banner.guestLoginCta")}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Slider-/Diashow-Container */}
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Aktives Tool</p>
              <h3 className="text-xl font-semibold text-slate-50">{activeTool?.name}</h3>
              <p className="text-sm text-slate-400">Aktives Set: {activeSet?.name || "kein Set"}</p>
            </div>
            <div className="flex gap-2">
              {TOOLS.map((tool) => (
                <div
                  key={tool.id}
                  className={[
                    "h-2 w-8 rounded-full transition",
                    activeToolId === tool.id ? "bg-emerald-400" : "bg-slate-700",
                  ].join(" ")}
                  aria-hidden
                />
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-800/60 p-4">
              <div className="text-sm text-slate-300">{activeTool?.description}</div>
              <div className="mt-4 rounded-xl border border-dashed border-slate-700/70 bg-slate-900/60 p-4 text-center text-sm text-slate-400">
                Placeholder fuer kuenftige Tool-Komponente<br />
                (z. B. {activeTool?.name})
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-700/70 bg-slate-800/60 p-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Set-Details</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{activeSet?.name}</div>
                <div className="text-sm text-emerald-200/90">{activeSet?.classLabel}</div>
                <div className="text-xs text-slate-400">{activeSet?.serverLabel}</div>
              </div>
              <div className="rounded-xl border border-dashed border-emerald-400/40 bg-emerald-500/5 p-3 text-xs text-emerald-100">
                Lokaler State only - keine Firestore-Anbindung.<br />
                Slides wechseln, wenn du oben ein Tool auswaehlst.
              </div>
            </div>
          </div>
        </section>
      </div>
    </ContentShell>
  );
}
