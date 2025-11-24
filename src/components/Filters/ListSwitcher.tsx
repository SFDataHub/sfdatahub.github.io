import React from "react";
import { useFilters } from "./FilterContext";

/** Rendert NUR Cards oder Buttons.
 *  Bei listView === "table" rendert diese Komponente NICHTS
 *  (die echte Tabelle kommt von der Toplists-Seite).
 */
export default function ListSwitcher() {
  // defensiv: list/filtered können initial undefined sein → auf [] fallbacken
  const f = useFilters() as any;
  const listView: "cards" | "buttons" | "table" = f?.listView ?? "table";
  const list: any[] = Array.isArray(f?.list) ? f.list : [];
  const filtered: any[] = Array.isArray(f?.filtered) ? f.filtered : list;

  // Table-View wird extern gerendert → hier nichts anzeigen
  if (listView === "table") return null;

  return (
    <div style={{ background:"#1A2F4A", border:"1px solid #2B4C73", borderRadius:16, padding:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, color:"#B0C4D9", fontSize:13 }}>
        <div>Showing {filtered.length} / {list.length}</div>
      </div>

      {listView === "cards" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(1,minmax(0,1fr))", gap:12 }}>
          {filtered.slice(0, 36).map((p: any) => (
            <div key={p.id ?? `${p.name}-${p.server}`} style={{ background:"#14273E", border:"1px solid #2B4C73", borderRadius:14, padding:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <div style={{ fontWeight:600, color:"#F5F9FF" }}>{p.name ?? ""}</div>
                <div style={{ color:"#B0C4D9", fontSize:12 }}>{p.server ?? ""}</div>
              </div>
              <div style={{ color:"#B0C4D9", fontSize:14, marginBottom:8 }}>
                Class: <span style={{ textTransform:"uppercase" }}>{p.class ?? ""}</span> • Lv {p.level ?? ""} • Scrap {p.scrapbook ?? ""}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", fontSize:12 }}>
                <Badge>{p.active ? "Active" : "Idle"}</Badge>
                {p.favorite && <Badge>★ Fav</Badge>}
                <Badge>{`Scan ${p.lastScanDays ?? "?"}d`}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {listView === "buttons" && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {filtered.slice(0, 72).map((p: any) => (
            <button
              key={p.id ?? `${p.name}-${p.server}`}
              type="button"
              style={{ background:"#14273E", border:"1px solid #2B4C73", borderRadius:999, padding:"6px 10px", color:"#F5F9FF" }}
            >
              {p.favorite && "★ "}{p.name ?? ""}
              <span style={{ marginLeft:8, fontSize:12, color:"#B0C4D9" }}>({p.server ?? ""} • Lv {p.level ?? ""})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ children }:{ children: React.ReactNode }){
  return (
    <span
      style={{
        background:"rgba(255,255,255,.06)",
        border:"1px solid rgba(255,255,255,.15)",
        borderRadius:999,
        padding:"2px 8px",
        fontSize:11
      }}
    >
      {children}
    </span>
  );
}
