import React from "react";
import { useFilters } from "./FilterContext";

/** Rendert die Liste je nach View (Cards | Buttons | Table). */
export default function ListSwitcher() {
  const { list, filtered, listView } = useFilters();

  return (
    <div style={{ background:"#1A2F4A", border:"1px solid #2B4C73", borderRadius:16, padding:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, color:"#B0C4D9", fontSize:13 }}>
        <div>Showing {filtered.length} / {list.length}</div>
      </div>

      {listView === "cards" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(1,minmax(0,1fr))", gap:12 }}>
          {filtered.slice(0,36).map(p => (
            <div key={p.id} style={{ background:"#14273E", border:"1px solid #2B4C73", borderRadius:14, padding:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <div style={{ fontWeight:600, color:"#F5F9FF" }}>{p.name}</div>
                <div style={{ color:"#B0C4D9", fontSize:12 }}>{p.server}</div>
              </div>
              <div style={{ color:"#B0C4D9", fontSize:14, marginBottom:8 }}>
                Class: <span style={{ textTransform:"uppercase" }}>{p.class}</span> • Lv {p.level} • Scrap {p.scrapbook}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", fontSize:12 }}>
                <Badge>{p.active ? "Active" : "Idle"}</Badge>
                {p.favorite && <Badge>★ Fav</Badge>}
                <Badge>{`Scan ${p.lastScanDays}d`}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {listView === "buttons" && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {filtered.slice(0,72).map(p => (
            <button key={p.id} type="button" style={{ background:"#14273E", border:"1px solid #2B4C73", borderRadius:999, padding:"6px 10px", color:"#F5F9FF" }}>
              {p.favorite && "★ "}{p.name}
              <span style={{ marginLeft:8, fontSize:12, color:"#B0C4D9" }}>({p.server} • Lv {p.level})</span>
            </button>
          ))}
        </div>
      )}

      {listView === "table" && (
        <div style={{ overflow:"auto", border:"1px solid #2B4C73", borderRadius:14 }}>
          <table style={{ width:"100%", minWidth:720, borderCollapse:"separate", borderSpacing:0, color:"#F5F9FF" }}>
            <thead style={{ position:"sticky", top:0, zIndex:1, background:"#1E3657" }}>
              <tr>
                <Th>Name</Th><Th>Server</Th><Th>Class</Th><Th right>Level</Th><Th right>Scrapbook</Th><Th>Active</Th><Th right>Last Scan (d)</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0,100).map((p, idx)=>(
                <tr key={p.id} style={{ background: idx%2 ? "#14273E" : "#162A44" }}>
                  <Td>{p.name}</Td><Td>{p.server}</Td><Td style={{ textTransform:"uppercase" }}>{p.class}</Td>
                  <Td right>{p.level}</Td><Td right>{p.scrapbook}</Td><Td>{p.active ? "Yes" : "No"}</Td><Td right>{p.lastScanDays}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Badge({ children }:{ children: React.ReactNode }){
  return <span style={{ background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.15)", borderRadius:999, padding:"2px 8px", fontSize:11 }}>{children}</span>;
}
function Th({ children, right }:{ children:React.ReactNode; right?:boolean }){
  return <th style={{ padding:"8px 12px", textAlign:right?"right":"left", fontSize:12, fontWeight:600 }}>{children}</th>;
}
function Td({ children, right }:{ children:React.ReactNode; right?:boolean }){
  return <td style={{ padding:"8px 12px", textAlign:right?"right":"left", color:"#B0C4D9" }}>{children}</td>;
}
