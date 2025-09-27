import React from "react";

/** -------- Types & Presets (lokal, kein globaler Provider nötig) -------- */
type Theme = {
  page: string; tile: string; tileHover: string; nav: string; active: string;
  text: string; textSoft: string; title: string; line: string;
  radius: number; shadow: number; gap: number;
};

const DEFAULT: Theme = {
  page:"#0C1C2E", tile:"#152A42", tileHover:"#1E3A5C", nav:"#0A1728", active:"#1F3B5D",
  text:"#FFFFFF", textSoft:"#B0C4D9", title:"#F5F9FF", line:"#2C4A73",
  radius:16, shadow:20, gap:12,
};

const PRESETS: Record<string, Theme> = {
  Arcade: { ...DEFAULT, tile:"#1A2F4A", tileHover:"#25456B", active:"#2D4E78", shadow:28, radius:18 },
  Mythic: { ...DEFAULT, tile:"#14273E", tileHover:"#1E3657", active:"#2B4C73", text:"#F5F9FF", textSoft:"#D6E4F7", shadow:32, radius:20 },
};

/** -------- kleine, lokale UI-Helfer (kein .btn nötig) -------- */
const btn: React.CSSProperties = {
  background:"#112338", border:"1px solid #2C4A73", color:"#FFFFFF",
  padding:"8px 12px", borderRadius:10, cursor:"pointer"
};
const row: React.CSSProperties = { display:"grid", gap:8, alignItems:"center" };

function ColorRow({label,value,onChange}:{label:string; value:string; onChange:(v:string)=>void}){
  return (
    <label style={{...row, gridTemplateColumns:"120px 1fr"}}>
      <span style={{fontSize:12, color:"var(--text-soft, #B0C4D9)"}}>{label}</span>
      <input type="color" value={value} onChange={e=>onChange(e.target.value)} />
    </label>
  );
}
function NumRow({label,value,min,max,onChange}:{label:string; value:number; min:number; max:number; onChange:(v:number)=>void}){
  return (
    <label style={{...row, gridTemplateColumns:"120px 1fr 70px"}}>
      <span style={{fontSize:12, color:"var(--text-soft, #B0C4D9)"}}>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={e=>onChange(parseInt(e.target.value))} />
      <input type="number" min={min} max={max} value={value} onChange={e=>onChange(parseInt(e.target.value||"0"))}/>
    </label>
  );
}

/** -------- ThemeMaker (scoped) -------- */
export default function ThemeMaker(){
  const [draft, setDraft] = React.useState<Theme>(DEFAULT);

  // Container, auf den wir NUR HIER die Variablen setzen
  const scopeRef = React.useRef<HTMLDivElement | null>(null);

  const applyScopedVars = (t: Theme) => {
    const el = scopeRef.current;
    if (!el) return;
    el.style.setProperty("--page", t.page);
    el.style.setProperty("--tile", t.tile);
    el.style.setProperty("--tile-hover", t.tileHover);
    el.style.setProperty("--nav", t.nav);
    el.style.setProperty("--active", t.active);
    el.style.setProperty("--text", t.text);
    el.style.setProperty("--text-soft", t.textSoft);
    el.style.setProperty("--title", t.title);
    el.style.setProperty("--line", t.line);
    el.style.setProperty("--radius", `${t.radius}px`);
    el.style.setProperty("--shadow", `0 8px ${t.shadow}px rgba(0,0,0,0.25)`);
    el.style.setProperty("--gap", `${t.gap}px`);
  };

  // Live-Preview bei jeder Änderung (nur im Scope)
  React.useEffect(()=>{ applyScopedVars(draft); }, [draft]);

  // Preset / Reset / Export / Import
  const loadPreset = (name:string) => setDraft(PRESETS[name]);
  const reset = () => setDraft(DEFAULT);
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], {type:"application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "sfdatahub-theme.json"; a.click();
  };
  const importJSON = async (file: File) => {
    const txt = await file.text();
    setDraft({ ...DEFAULT, ...JSON.parse(txt) });
  };

  return (
    <div
      ref={scopeRef}
      style={{
        // Fallbacks definieren (falls Variablen noch nicht gesetzt)
        color:"var(--text, #FFFFFF)",
      }}
    >
      <h2 style={{marginTop:0, color:"var(--title, #F5F9FF)"}}>Theme / Template Maker (scoped)</h2>

      <div style={{display:"grid", gridTemplateColumns:"380px 1fr", gap:16}}>
        {/* Panel */}
        <div style={{
          background:"var(--tile, #152A42)", border:"1px solid var(--line, #2C4A73)",
          borderRadius:"var(--radius, 16px)", padding:16, boxShadow:"var(--shadow, 0 8px 20px rgba(0,0,0,.25))",
          display:"grid", gap:12
        }}>
          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            {Object.keys(PRESETS).map(p => (
              <button key={p} style={btn} onClick={()=>loadPreset(p)}>{p}</button>
            ))}
            <button style={btn} onClick={reset}>Default</button>
            <button style={btn} onClick={exportJSON}>Export JSON</button>
            <label style={{...btn, display:"inline-block"}}>
              Import JSON
              <input type="file" accept="application/json"
                     onChange={e=>e.target.files && importJSON(e.target.files[0])}
                     style={{display:"none"}}/>
            </label>
          </div>

          <ColorRow label="Page"       value={draft.page}      onChange={v=>setDraft(s=>({...s, page:v}))}/>
          <ColorRow label="Tile"       value={draft.tile}      onChange={v=>setDraft(s=>({...s, tile:v}))}/>
          <ColorRow label="Tile Hover" value={draft.tileHover} onChange={v=>setDraft(s=>({...s, tileHover:v}))}/>
          <ColorRow label="Nav"        value={draft.nav}       onChange={v=>setDraft(s=>({...s, nav:v}))}/>
          <ColorRow label="Active"     value={draft.active}    onChange={v=>setDraft(s=>({...s, active:v}))}/>
          <ColorRow label="Text"       value={draft.text}      onChange={v=>setDraft(s=>({...s, text:v}))}/>
          <ColorRow label="Text Soft"  value={draft.textSoft}  onChange={v=>setDraft(s=>({...s, textSoft:v}))}/>
          <ColorRow label="Title"      value={draft.title}     onChange={v=>setDraft(s=>({...s, title:v}))}/>
          <ColorRow label="Line"       value={draft.line}      onChange={v=>setDraft(s=>({...s, line:v}))}/>

          <NumRow label="Radius"   value={draft.radius} min={8}  max={28} onChange={v=>setDraft(s=>({...s, radius:v}))}/>
          <NumRow label="Shadow"   value={draft.shadow} min={8}  max={40} onChange={v=>setDraft(s=>({...s, shadow:v}))}/>
          <NumRow label="Grid Gap" value={draft.gap}     min={6}  max={24} onChange={v=>setDraft(s=>({...s, gap:v}))}/>
        </div>

        {/* Preview – NUR innerhalb dieses Containers werden die Variablen genutzt */}
        <div style={{display:"grid", gap:"var(--gap, 12px)"}}>
          <div style={{
            background:"var(--tile, #152A42)", border:"1px solid var(--line, #2C4A73)",
            borderRadius:"var(--radius, 16px)", padding:16, boxShadow:"var(--shadow, 0 8px 20px rgba(0,0,0,.25))"
          }}>
            <div style={{fontWeight:700, marginBottom:8}}>Card Preview</div>
            <div style={{height:60, border:"1px dashed var(--line, #2C4A73)", borderRadius:"var(--radius, 16px)"}}/>
            <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:10}}>
              <button style={{...btn, background:"var(--tile-hover, #1E3A5C)"}}>Primary</button>
              <button style={btn}>Secondary</button>
            </div>
          </div>

          <div style={{
            display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",
            gap:"var(--gap, 12px)"
          }}>
            {Array.from({length:6}).map((_,i)=>(
              <div key={i} style={{
                background:"var(--tile, #152A42)", border:"1px solid var(--line, #2C4A73)",
                borderRadius:"var(--radius, 16px)", padding:16, boxShadow:"var(--shadow, 0 8px 20px rgba(0,0,0,.25))"
              }}>
                <div style={{fontWeight:700, marginBottom:8}}>Tile {i+1}</div>
                <div style={{height:60, border:"1px dashed var(--line, #2C4A73)", borderRadius:"var(--radius, 16px)"}}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
