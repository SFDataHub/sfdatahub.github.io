// frontend/src/components/Topbar.tsx
import { useTranslation } from "react-i18next";
// ⬇️ Pfad/Name bei Bedarf anpassen (z. B. "../assets/logo.svg")
import logoUrl from "../assets/logo_sfdatahub.png";

export default function Topbar() {
  const { i18n } = useTranslation();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-900/70 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Logo + Title */}
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="SFDataHub"
            className="h-6 w-6 rounded-sm"
            draggable={false}
          />
          <span className="text-slate-200 font-semibold tracking-wide">
            SFDataHub
          </span>
        </div>

        {/* Language Switch */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => i18n.changeLanguage("en")}
            className="rounded-md px-2 py-1 text-xs text-slate-200/90 hover:bg-slate-700/50"
          >
            EN
          </button>
          <button
            onClick={() => i18n.changeLanguage("de")}
            className="rounded-md px-2 py-1 text-xs text-slate-200/90 hover:bg-slate-700/50"
          >
            DE
          </button>
        </div>
      </div>
    </header>
  );
}
