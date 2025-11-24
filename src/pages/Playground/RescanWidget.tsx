import React, { useEffect, useMemo, useState } from "react";

type Entry = { id: string; name: string; server: string; lastScanMinsAgo: number };

function mockEntries(n=24): Entry[] {
  const out: Entry[] = [];
  for (let i=1;i<=n;i++){
    out.push({ id: String(i), name: `Player ${i}`, server: `EU${1+(i%3)}`, lastScanMinsAgo: 60 + (i*7)%240 });
  }
  return out;
}

export default function RescanWidget(){
  const [ttlMinutes, setTtlMinutes] = useState(120);
  const [list, setList] = useState<Entry[]>(()=>mockEntries(24));

  // Simuliere frische Scans (alle 5s irgendein Eintrag → 0 min)
  useEffect(()=>{
    const t = setInterval(()=>{
      setList(prev => {
        if (!prev.length) return prev;
        const idx = Math.floor(Math.random()*prev.length);
        const copy = [...prev];
        copy[idx] = { ...copy[idx], lastScanMinsAgo: 0 };
        return copy;
      });
    }, 5000);
    return ()=>clearInterval(t);
  }, []);

  // Altern: alle 15s +15 Minuten
  useEffect(()=>{
    const t = setInterval(()=>{
      setList(prev => prev.map(e => ({...e, lastScanMinsAgo: e.lastScanMinsAgo + 15})));
    }, 15000);
    return ()=>clearInterval(t);
  }, []);

  const stale = useMemo(()=> list.filter(e => e.lastScanMinsAgo > ttlMinutes), [list, ttlMinutes]);

  return (
    <div>
      <h2 style={{marginTop:0, color:"#F5F9FF"}}>Rescan Widget · Auto‑Removal</h2>
      <div style={{display:"flex", gap:12, flexWrap:"wrap", marginBottom:12}}>
        <label>Freshness TTL (min) <input type="number" value={ttlMinutes} onChange={e=>setTtlMinutes(parseInt(e.target.value||"0"))} style={{marginLeft:8, width:100}}/></label>
        <button onClick={()=>setList(mockEntries(24))}>Reset Demo Data</button>
      </div>
      <p style={{color:"#B0C4D9", fontSize:12}}>Einträge mit „last scan ≤ TTL“ verschwinden automatisch (keine Checkboxen).</p>

      <div style={{background:"#152A42", border:"1px solid #2C4A73", borderRadius:16, overflow:"hidden"}}>
        <div style={{display:"flex", justifyContent:"space-between", padding:"10px 12px", fontWeight:600, background:"rgba(255,255,255,.04)"}}>
          <div>Player</div><div style={{width:180, textAlign:"right"}}>Last Scan</div>
        </div>
        {stale.map(e => (
          <div key={e.id} style={{display:"flex", justifyContent:"space-between", padding:"10px 12px", borderTop:"1px solid rgba(255,255,255,.06)"}}>
            <div>{e.name} <span style={{fontSize:12, padding:"2px 8px", borderRadius:999, background:"#0f2a44", border:"1px solid #2b4c73"}}>{e.server}</span></div>
            <div style={{width:180, textAlign:"right"}}>{e.lastScanMinsAgo} min ago</div>
          </div>
        ))}
        {stale.length===0 && (
          <div style={{padding:"10px 12px", textAlign:"center", color:"#B0C4D9"}}>All fresh. Nothing to rescan 🎉</div>
        )}
      </div>
    </div>
  );
}
