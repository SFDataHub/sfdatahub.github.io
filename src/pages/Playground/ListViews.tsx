import React, { useMemo, useState } from "react";

type Player = {
  id: string;
  name: string;
  className: string;
  level: number;
  guild?: string;
  kpi?: number;
};

const CLASSES = ["Demon Hunter","Warrior","Mage","Assassin","Berserker","Scout"];

function mockPlayers(n=120): Player[] {
  const arr: Player[] = [];
  for (let i=1;i<=n;i++){
    arr.push({
      id: String(i),
      name: `Player ${i}`,
      className: CLASSES[i % CLASSES.length],
      level: 200 + (i % 50),
      guild: i % 3 === 0 ? `Guild ${i%10}` : undefined,
      kpi: Math.round(Math.random()*1000)/10
    });
  }
  return arr;
}

const box: React.CSSProperties = {
  background: "#152A42",
  border: "1px solid #2C4A73",
  borderRadius: 16,
  padding: 16,
};

export default function ListViews(){
  const [view, setView] = useState<"rows"|"cards"|"masonry">("rows");
  const [minLevel, setMinLevel] = useState(0);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(60);

  const data = useMemo(()=> mockPlayers(240), []);
  const filtered = useMemo(()=> data
    .filter(p=>p.level >= minLevel)
    .filter(p=>p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, limit)
  , [data, minLevel, search, limit]);

  return (
    <div>
      <h2 style={{marginTop:0, color:"#F5F9FF"}}>List‑View Switcher</h2>
      <div style={{display:"flex", gap:12, flexWrap:"wrap", marginBottom:12}}>
        <select value={view} onChange={e=>setView(e.target.value as any)}>
          <option value="rows">Compact Rows</option>
          <option value="cards">Card Grid</option>
          <option value="masonry">Masonry</option>
        </select>
        <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} />
        <label>Min Level <input type="number" value={minLevel} onChange={e=>setMinLevel(parseInt(e.target.value||"0"))} style={{marginLeft:8, width:90}}/></label>
        <label>Limit <input type="number" value={limit} onChange={e=>setLimit(parseInt(e.target.value||"0"))} style={{marginLeft:8, width:90}}/></label>
      </div>

      {view==="rows" && (
        <div style={{...box, padding:0, overflow:"hidden"}}>
          {filtered.map(p => (
            <div key={p.id} style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderBottom:"1px solid rgba(255,255,255,.06)"}}>
              <div style={{display:"flex", alignItems:"center", gap:12}}>
                <div style={{width:28, height:28, borderRadius:8, background:"#1A2F4A", border:"1px solid #2C4A73"}}/>
                <div>
                  <div style={{fontWeight:700}}>{p.name} <span style={{fontSize:12, padding:"2px 8px", borderRadius:999, background:"#0f2a44", border:"1px solid #2b4c73", marginLeft:8}}>{p.className}</span></div>
                  <div style={{fontSize:12, color:"#B0C4D9"}}>Lvl {p.level} {p.guild ? `· ${p.guild}` : ""}</div>
                </div>
              </div>
              <div style={{display:"flex", alignItems:"center", gap:12}}>
                <div title="Sparkline placeholder" style={{width:100, height:28, display:"inline-block", background:"linear-gradient(to top, rgba(255,255,255,.12), rgba(255,255,255,.02))", borderRadius:6, border:"1px solid rgba(255,255,255,.08)"}}/>
                <div style={{fontSize:24, fontWeight:700}}>{p.kpi?.toFixed(1)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view==="cards" && (
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12}}>
          {filtered.map(p => (
            <div key={p.id} style={box}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <div style={{fontWeight:700}}>{p.name}</div>
                <span style={{fontSize:12, padding:"2px 8px", borderRadius:999, background:"#0f2a44", border:"1px solid #2b4c73"}}>{p.className}</span>
              </div>
              <div style={{fontSize:12, color:"#B0C4D9", margin:"6px 0 10px"}}>Lvl {p.level} {p.guild ? `· ${p.guild}` : ""}</div>
              <div style={{height:80, border:"1px dashed rgba(255,255,255,.15)", borderRadius:8, display:"grid", placeItems:"center"}}>Media</div>
              <div style={{display:"flex", justifyContent:"space-between", marginTop:10}}>
                <span style={{fontSize:12, color:"#B0C4D9"}}>Trend</span>
                <span style={{fontSize:24, fontWeight:700}}>{p.kpi?.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {view==="masonry" && (
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12}}>
          {filtered.map(p => (
            <div key={p.id} style={{...box, height: 140 + ((parseInt(p.id)%3)*40)}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <div style={{fontWeight:700}}>{p.name}</div>
                <span style={{fontSize:12, padding:"2px 8px", borderRadius:999, background:"#0f2a44", border:"1px solid #2b4c73"}}>{p.className}</span>
              </div>
              <div style={{fontSize:12, color:"#B0C4D9"}}>Lvl {p.level} {p.guild ? `· ${p.guild}` : ""}</div>
              <div style={{marginTop:8, width:100, height:28, display:"inline-block", background:"linear-gradient(to top, rgba(255,255,255,.12), rgba(255,255,255,.02))", borderRadius:6, border:"1px solid rgba(255,255,255,.08)"}} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
