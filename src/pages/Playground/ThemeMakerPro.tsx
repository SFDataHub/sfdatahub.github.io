import React from "react";

/** ===================== Types & Presets ===================== */
type Theme = {
  // Palette
  page: string; tile: string; tileHover: string; nav: string; active: string;
  text: string; textSoft: string; title: string; line: string;
  accent: string; success: string; warning: string; danger: string;

  // Layout
  radius: number; border: number; gap: number;
  shadow: number; // px for big blur
  surfaceOpacity: number; // 0..100 tile overlay
  noise: number; // 0..100 noise intensity

  // Typography
  fontFamily: string;
  fontSize: number; // base px (12..18)
  headingsTight: boolean;

  // FX
  glow: number; // 0..1 as %
  scanlines: number; // 0..1 as %
};

const DEFAULT: Theme = {
  page:"#0C1C2E", tile:"#152A42", tileHover:"#1E3A5C", nav:"#0A1728", active:"#1F3B5D",
  text:"#FFFFFF", textSoft:"#B0C4D9", title:"#F5F9FF", line:"#2C4A73",
  accent:"#5C8BC6", success:"#4caf50", warning:"#ffb300", danger:"#ef5350",

  radius:16, border:1, gap:12,
  shadow:24,
  surfaceOpacity:100,
  noise:8,

  fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial',
  fontSize:14,
  headingsTight:true,

  glow:0.18,
  scanlines:0.0,
};

const PRESETS: Record<string, Partial<Theme>> = {
  "SFDataHub (Default)": { ...DEFAULT },
  "Arcade Neon": {
    tile:"#1A2F4A", tileHover:"#25456B", active:"#2D4E78", accent:"#9AECFF",
    shadow:32, glow:0.28, noise:12, fontSize:15,
  },
  "Mythic Steel": {
    tile:"#14273E", tileHover:"#1E3657", active:"#2B4C73", text:"#F5F9FF", textSoft:"#D6E4F7",
    line:"#355a8a", accent:"#B0C4D9", shadow:36, radius:18, noise:6,
  },
  "Terminal": {
    page:"#0B0E12", tile:"#10161F", tileHover:"#121B26", active:"#0f253d",
    text:"#D9F7BE", textSoft:"#9DB096", accent:"#9FE870", line:"#223444",
    glow:0.05, shadow:14, border:1, fontFamily:'"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas',
  },
  "High Contrast": {
    text:"#FFFFFF", textSoft:"#E6E6E6", title:"#FFFFFF",
    tile:"#0E1F33", tileHover:"#15375C", line:"#6CA0FF",
    accent:"#6CA0FF", glow:0.35, shadow:38,
  },
};

/** ===================== Small UI helpers ===================== */
const row: React.CSSProperties = { display:"grid", gap:8, alignItems:"center" };
const btn: React.CSSProperties = {
  background:"#112338", border:"1px solid var(--line, #2C4A73)", color:"#FFFFFF",
  padding:"8px 12px", borderRadius:10, cursor:"pointer", fontSize:13
};
const chip: React.CSSProperties = {
  display:"inline-flex", alignItems:"center", gap:8,
  padding:"6px 10px", borderRadius:999,
  background:"rgba(255,255,255,.05)", border:"1px solid var(--line, #2C4A73)", fontSize:12
};

function ColorRow({label,value,onChange}:{label:string; value:string; onChange:(v:string)=>void}){
  return (
    <label style={{...row, gridTemplateColumns:"140px 1fr"}}>
      <span style={{fontSize:12, color:"var(--text-soft, #B0C4D9)"}}>{label}</span>
      <input type="color" value={value} onChange={e=>onChange(e.target.value)} />
    </label>
  );
}
function NumRow({
  label,value,min,max,step=1,onChange,suffix
}:{label:string; value:number; min:number; max:number; step?:number; suffix?:string; onChange:(v:number)=>void}){
  return (
    <label style={{...row, gridTemplateColumns:"140px 1fr 70px"}}>
      <span style={{fontSize:12, color:"var(--text-soft, #B0C4D9)"}}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))} />
      <input type="number" min={min} max={max} step={step} value={value}
             onChange={e=>onChange(parseFloat(e.target.value||"0"))}/>
    </label>
  );
}
function ToggleRow({label, checked, onChange}:{label:string; checked:boolean; onChange:(v:boolean)=>void}){
  return (
    <label style={{...row, gridTemplateColumns:"1fr 46px"}}>
      <span style={{fontSize:12, color:"var(--text-soft, #B0C4D9)"}}>{label}</span>
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} />
    </label>
  );
}

/** ===================== ThemeMaker Pro (scoped) ===================== */
export default function ThemeMakerPro(){
  const [draft, setDraft] = React.useState<Theme>(DEFAULT);
  const scopeRef = React.useRef<HTMLDivElement | null>(null);

  const applyScopedVars = (t: Theme) => {
    const el = scopeRef.current; if (!el) return;
    // palette
    el.style.setProperty("--page", t.page);
    el.style.setProperty("--tile", t.tile);
    el.style.setProperty("--tile-hover", t.tileHover);
    el.style.setProperty("--nav", t.nav);
    el.style.setProperty("--active", t.active);
    el.style.setProperty("--text", t.text);
    el.style.setProperty("--text-soft", t.textSoft);
    el.style.setProperty("--title", t.title);
    el.style.setProperty("--line", t.line);
    el.style.setProperty("--accent", t.accent);
    el.style.setProperty("--success", t.success);
    el.style.setProperty("--warning", t.warning);
    el.style.setProperty("--danger", t.danger);
    // layout
    el.style.setProperty("--radius", `${t.radius}px`);
    el.style.setProperty("--border", `${t.border}px`);
    el.style.setProperty("--gap", `${t.gap}px`);
    el.style.setProperty("--shadow", `0 10px ${t.shadow}px rgba(0,0,0,0.30)`);
    el.style.setProperty("--surface-opacity", `${t.surfaceOpacity}%`);
    el.style.setProperty("--noise", `${t.noise}%`);
    // type
    el.style.setProperty("--font", t.fontFamily);
    el.style.setProperty("--font-size", `${t.fontSize}px`);
    el.style.setProperty("--heading-tight", t.headingsTight ? "1.1" : "1.3");
    // fx
    el.style.setProperty("--glow", `${t.glow}`);
    el.style.setProperty("--scanlines", `${t.scanlines}`);
  };
  React.useEffect(()=>{ applyScopedVars(draft); }, [draft]);

  const set = <K extends keyof Theme>(k:K, v:Theme[K]) => setDraft(s=>({...s, [k]:v}));

  const applyPreset = (name:string) =>
    setDraft(s => ({ ...s, ...PRESETS[name] }));

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], {type:"application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "sfdatahub-theme-pro.json"; a.click();
  };
  const importJSON = async (f: File) => {
    try{
      const txt = await f.text();
      const obj = JSON.parse(txt);
      setDraft({ ...draft, ...obj });
    }catch{ /* noop */ }
  };

  /** --------- Mocked Player Profile data for preview --------- */
  const player = {
    name: "Karynth, the Patient",
    className: "Demon Hunter",
    guild: "Night Owls",
    server: "EU1",
    level: 302,
    scrapbook: 87,
    power: 124_580,
    activity: 76,
  };

  return (
    <div ref={scopeRef} style={{ fontFamily:"var(--font, ui-sans-serif)", color:"var(--text, #fff)" }}>
      <h2 style={{marginTop:0, color:"var(--title,#F5F9FF)", lineHeight:"var(--heading-tight,1.2)"}}>
        Theme / Template Maker · Pro (scoped)
      </h2>

      <div style={{display:"grid", gridTemplateColumns:"420px 1fr", gap:16}}>
        {/* ============ Control Panel ============ */}
        <div style={{
          background:"color-mix(in srgb, var(--tile, #152A42) var(--surface-opacity,100%), transparent)",
          border:"var(--border,1px) solid var(--line,#2C4A73)", borderRadius:"var(--radius,16px)",
          padding:16, boxShadow:"var(--shadow, 0 10px 24px rgba(0,0,0,.3))",
          display:"grid", gap:12
        }}>
          {/* Presets */}
          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            {Object.keys(PRESETS).map(k=>(
              <button key={k} style={btn} onClick={()=>applyPreset(k)}>{k}</button>
            ))}
            <button style={btn} onClick={()=>setDraft(DEFAULT)}>Reset</button>
            <button style={btn} onClick={exportJSON}>Export</button>
            <label style={{...btn, display:"inline-block"}}>
              Import
              <input type="file" accept="application/json" style={{display:"none"}}
                     onChange={e=>e.target.files && importJSON(e.target.files[0])}/>
            </label>
          </div>

          {/* Palette */}
          <details open>
            <summary style={{cursor:"pointer", fontWeight:700}}>Palette</summary>
            <div style={{display:"grid", gap:8, marginTop:8}}>
              <ColorRow label="Page" value={draft.page} onChange={v=>set("page",v)} />
              <ColorRow label="Tile" value={draft.tile} onChange={v=>set("tile",v)} />
              <ColorRow label="Tile Hover" value={draft.tileHover} onChange={v=>set("tileHover",v)} />
              <ColorRow label="Active" value={draft.active} onChange={v=>set("active",v)} />
              <ColorRow label="Text" value={draft.text} onChange={v=>set("text",v)} />
              <ColorRow label="Text Soft" value={draft.textSoft} onChange={v=>set("textSoft",v)} />
              <ColorRow label="Title" value={draft.title} onChange={v=>set("title",v)} />
              <ColorRow label="Line" value={draft.line} onChange={v=>set("line",v)} />
              <ColorRow label="Accent" value={draft.accent} onChange={v=>set("accent",v)} />
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8}}>
                <ColorRow label="Success" value={draft.success} onChange={v=>set("success",v)} />
                <ColorRow label="Warning" value={draft.warning} onChange={v=>set("warning",v)} />
                <ColorRow label="Danger"  value={draft.danger}  onChange={v=>set("danger",v)} />
              </div>
            </div>
          </details>

          {/* Layout */}
          <details open>
            <summary style={{cursor:"pointer", fontWeight:700}}>Layout</summary>
            <div style={{display:"grid", gap:8, marginTop:8}}>
              <NumRow label="Radius" min={0} max={28} value={draft.radius} onChange={v=>set("radius",v)} />
              <NumRow label="Border (px)" min={0} max={3} step={0.5} value={draft.border} onChange={v=>set("border",v)} />
              <NumRow label="Grid Gap" min={6} max={28} value={draft.gap} onChange={v=>set("gap",v)} />
              <NumRow label="Shadow (blur)" min={0} max={48} value={draft.shadow} onChange={v=>set("shadow",v)} />
              <NumRow label="Surface Opacity" min={40} max={100} value={draft.surfaceOpacity} onChange={v=>set("surfaceOpacity",v)} suffix="%" />
              <NumRow label="Noise" min={0} max={20} value={draft.noise} onChange={v=>set("noise",v)} suffix="%" />
            </div>
          </details>

          {/* Typography */}
          <details open>
            <summary style={{cursor:"pointer", fontWeight:700}}>Typography</summary>
            <div style={{display:"grid", gap:8, marginTop:8}}>
              <label style={{...row, gridTemplateColumns:"140px 1fr"}}>
                <span style={{fontSize:12, color:"var(--text-soft,#B0C4D9)"}}>Font Family</span>
                <input value={draft.fontFamily} onChange={e=>set("fontFamily",e.target.value)} />
              </label>
              <NumRow label="Base Font Size" min={12} max={18} value={draft.fontSize} onChange={v=>set("fontSize",v)} />
              <ToggleRow label="Headings tighter" checked={draft.headingsTight} onChange={v=>set("headingsTight",v)} />
            </div>
          </details>

          {/* FX */}
          <details open>
            <summary style={{cursor:"pointer", fontWeight:700}}>FX</summary>
            <div style={{display:"grid", gap:8, marginTop:8}}>
              <NumRow label="Accent Glow" min={0} max={0.6} step={0.02} value={draft.glow} onChange={v=>set("glow",v)} />
              <NumRow label="Scanlines" min={0} max={0.6} step={0.02} value={draft.scanlines} onChange={v=>set("scanlines",v)} />
            </div>
          </details>
        </div>

        {/* ============ Preview Area ============ */}
        <div style={{ display:"grid", gap:"var(--gap, 12px)" }}>
          {/* Bar with chips */}
          <div style={{
            display:"flex", gap:8, flexWrap:"wrap",
            background:"color-mix(in srgb, var(--tile) var(--surface-opacity,100%), transparent)",
            border:"var(--border,1px) solid var(--line)", borderRadius:"var(--radius)", padding:12
          }}>
            <span style={chip}><span style={{width:10,height:10,borderRadius:999,background:"var(--accent)"}}/> Accent</span>
            <span style={{...chip, borderColor:"var(--success)", color:"var(--success)"}}>Success</span>
            <span style={{...chip, borderColor:"var(--warning)", color:"var(--warning)"}}>Warning</span>
            <span style={{...chip, borderColor:"var(--danger)",  color:"var(--danger)"}}>Danger</span>
            <span style={chip}>Radius: {draft.radius}</span>
            <span style={chip}>Shadow: {draft.shadow}</span>
            <span style={chip}>Noise: {draft.noise}%</span>
          </div>

          {/* Player Profile Card */}
          <div style={{
            display:"grid", gridTemplateColumns:"280px 1fr", gap:"var(--gap)",
            background:"linear-gradient(0deg, rgba(255,255,255,calc(var(--scanlines,0))) 1px, transparent 1px), color-mix(in srgb, var(--tile) var(--surface-opacity,100%), transparent)",
            backgroundSize:"100% 3px, auto",
            border:"var(--border) solid var(--line)", borderRadius:"var(--radius)", padding:16, boxShadow:"var(--shadow)"
          }}>
            {/* Left: Avatar & KPIs */}
            <div style={{display:"grid", gap:12}}>
              <div style={{
                width:120, height:120, borderRadius:"calc(var(--radius) + 36px)",
                background:"radial-gradient(80% 80% at 50% 50%, color-mix(in srgb, var(--accent) 35%, transparent) 0%, transparent 70%), #0f2238",
                border:"1px solid var(--line)",
                boxShadow:`0 0 0 1px rgba(255,255,255,.03), 0 0 ${12 + draft.glow*24}px ${draft.glow*24}px color-mix(in srgb, var(--accent) 20%, transparent)`
              }} />
              <div>
                <div style={{fontWeight:800, fontSize:18, lineHeight:"var(--heading-tight)"}}>{player.name}</div>
                <div style={{fontSize:12, color:"var(--text-soft)"}}>
                  {player.className} · {player.guild} <span style={{marginLeft:6, opacity:.7}}>({player.server})</span>
                </div>
              </div>

              {/* KPI list */}
              <div style={{display:"grid", gap:8}}>
                {[
                  {label:"Level", value: player.level, pct: (player.level%350)/3.5, color:"var(--accent)"},
                  {label:"Scrapbook", value: player.scrapbook+"%", pct: player.scrapbook/100, color:"var(--success)"},
                  {label:"Power", value: player.power.toLocaleString(), pct: 0.72, color:"var(--warning)"},
                  {label:"Activity", value: player.activity+"%", pct: player.activity/100, color:"var(--accent)"},
                ].map((k, i)=>(
                  <div key={i} style={{display:"grid", gap:4}}>
                    <div style={{display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-soft)"}}>
                      <span>{k.label}</span><span style={{color:"var(--title)"}}>{k.value}</span>
                    </div>
                    <div style={{position:"relative", height:8, background:"rgba(255,255,255,.06)", border:"1px solid var(--line)", borderRadius:999}}>
                      <div style={{
                        position:"absolute", inset:0, width:`${Math.round(k.pct*100)}%`,
                        background:`linear-gradient(90deg, color-mix(in srgb, ${k.color} 75%, transparent), ${k.color})`,
                        borderRadius:999, boxShadow:`0 0 ${8 + draft.glow*12}px color-mix(in srgb, ${k.color} 40%, transparent)`
                      }}/>
                    </div>
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div style={{display:"flex", gap:8, marginTop:4}}>
                <button style={{...btn, background:"var(--tile-hover)"}}>Open Profile</button>
                <button style={{...btn, borderColor:"var(--accent)", color:"var(--accent)", background:"transparent"}}>Favorite</button>
              </div>
            </div>

            {/* Right: Tabs & content */}
            <div style={{display:"grid", gap:12}}>
              {/* Tabs */}
              <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                {["Overview","Gear","Stats","Timeline"].map((t,i)=>(
                  <button key={t} style={{
                    ...btn,
                    background: i===0 ? "var(--tile-hover)" : "transparent",
                    borderColor: i===0 ? "var(--active)" : "var(--line)",
                    boxShadow: i===0 ? `0 0 ${10 + draft.glow*20}px color-mix(in srgb, var(--accent) 26%, transparent)` : undefined
                  }}>{t}</button>
                ))}
              </div>

              {/* Overview widgets */}
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px,1fr))", gap:"var(--gap)"}}>
                {[
                  {k:"DPS", v:"12.4k", trend:"+5%"},
                  {k:"Crit", v:"31%", trend:"+1%"},
                  {k:"Armor", v:"8.2k", trend:"-2%"},
                  {k:"Evasion", v:"15%", trend:"+0%"}
                ].map((w,i)=>(
                  <div key={i} style={{
                    background:"color-mix(in srgb, var(--tile) var(--surface-opacity), transparent)",
                    border:"var(--border) solid var(--line)", borderRadius:"var(--radius)", padding:12,
                    boxShadow:"var(--shadow)"
                  }}>
                    <div style={{fontSize:12, color:"var(--text-soft)"}}>{w.k}</div>
                    <div style={{fontWeight:800, fontSize:24}}>{w.v}</div>
                    <div style={{fontSize:12, color:w.trend.startsWith("+") ? "var(--success)" : "var(--danger)"}}>{w.trend}</div>
                  </div>
                ))}
              </div>

              {/* Table preview */}
              <div style={{
                background:"color-mix(in srgb, var(--tile) var(--surface-opacity), transparent)",
                border:"var(--border) solid var(--line)", borderRadius:"var(--radius)", overflow:"hidden"
              }}>
                <div style={{display:"grid", gridTemplateColumns:"1fr 100px 100px", fontSize:12, background:"rgba(255,255,255,.05)", borderBottom:"1px solid var(--line)"}}>
                  <div style={{padding:10}}>Attribute</div><div style={{padding:10, textAlign:"right"}}>Value</div><div style={{padding:10, textAlign:"right"}}>Δ</div>
                </div>
                {[
                  ["Strength","2,180","+12"],
                  ["Dexterity","2,720","+6"],
                  ["Intelligence","1,360","0"],
                  ["Luck","2,010","+3"],
                ].map((r,i)=>(
                  <div key={i} style={{
                    display:"grid", gridTemplateColumns:"1fr 100px 100px",
                    fontSize:13, borderTop:"1px solid rgba(255,255,255,.06)",
                    background: i%2 ? "rgba(255,255,255,.025)" : "transparent"
                  }}>
                    <div style={{padding:10}}>{r[0]}</div>
                    <div style={{padding:10, textAlign:"right"}}>{r[1]}</div>
                    <div style={{padding:10, textAlign:"right", color: r[2].startsWith("+") ? "var(--success)":"var(--text-soft)"}}>{r[2]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Note */}
          <div style={{fontSize:12, color:"var(--text-soft)"}}>
            Scoped: Alle Variablen gelten nur in diesem Playground. Exportiere dein Setup als JSON und übernimm später selektiv in globale Tokens.
          </div>
        </div>
      </div>
    </div>
  );
}
