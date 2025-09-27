import React from "react";
import { DEFAULT_THEME, type ThemeTokens } from "./tokens";

const KEY = "sfdatahub.theme.v1";
type Ctx = { theme: ThemeTokens; setTheme: (t: ThemeTokens)=>void; reset: ()=>void; };
export const ThemeCtx = React.createContext<Ctx>({ theme: DEFAULT_THEME, setTheme:()=>{}, reset:()=>{} });

function applyToRoot(t: ThemeTokens){
  const r = document.documentElement;
  r.style.setProperty("--page", t.page);
  r.style.setProperty("--tile", t.tile);
  r.style.setProperty("--tile-hover", t.tileHover);
  r.style.setProperty("--nav", t.nav);
  r.style.setProperty("--active", t.active);
  r.style.setProperty("--text", t.text);
  r.style.setProperty("--text-soft", t.textSoft);
  r.style.setProperty("--title", t.title);
  r.style.setProperty("--line", t.line);
  r.style.setProperty("--radius", `${t.radius}px`);
  r.style.setProperty("--shadow", `0 8px ${t.shadow}px rgba(0,0,0,0.25)`);
  r.style.setProperty("--gap", `${t.gap}px`);
}

export default function ThemeProvider({children}:{children:React.ReactNode}){
  const [theme, setThemeState] = React.useState<ThemeTokens>(() => {
    try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
    catch { return DEFAULT_THEME; }
  });

  const setTheme = React.useCallback((t: ThemeTokens) => {
    setThemeState(t);
    localStorage.setItem(KEY, JSON.stringify(t));
    applyToRoot(t);
  }, []);

  const reset = React.useCallback(() => setTheme(DEFAULT_THEME), [setTheme]);

  React.useEffect(()=>{ applyToRoot(theme); }, []); // first mount

  return <ThemeCtx.Provider value={{ theme, setTheme, reset }}>{children}</ThemeCtx.Provider>;
}
