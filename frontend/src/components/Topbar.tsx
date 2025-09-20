import { useTranslation } from "react-i18next";
import Logo from "./Logo";

export default function Topbar() {
  const { i18n } = useTranslation();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-900/70 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
         <Logo size={28} className="mr-2" />
<span className="font-semibold tracking-wide">SFDataHub</span>

        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => i18n.changeLanguage("en")} className="rounded-md px-2 py-1 text-xs text-slate-200/90 hover:bg-slate-700/50">EN</button>
          <button onClick={() => i18n.changeLanguage("de")} className="rounded-md px-2 py-1 text-xs text-slate-200/90 hover:bg-slate-700/50">DE</button>
        </div>
      </div>
    </header>
  );
}
