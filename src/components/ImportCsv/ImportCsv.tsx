// src/components/ImportCsv/ImportCsv.tsx
import React, { useCallback, useState } from "react";
import { importCsvToDB } from "../../lib/import/csv";

export default function ImportCsv() {
  const [report, setReport] = useState<null | {
    detectedType: string | null;
    counts: Record<string, number>;
    errors: string[];
    warnings: string[];
    durationMs: number;
  }>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [defaultServer, setDefaultServer] = useState<string>("");

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files[0]) return;
    setBusy(true);
    setErr(null);
    setReport(null);
    try {
      const text = await files[0].text();
      const rep = await importCsvToDB(text, { defaultServer: defaultServer || undefined });
      setReport(rep);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [defaultServer]);

  return (
    <div style={{ background:"#152A42", border:"1px solid #2B4C73", borderRadius:12, padding:16 }}>
      <h3 style={{ marginTop:0, color:"#F5F9FF" }}>CSV Import</h3>

      <div style={{display:"grid", gap:12, gridTemplateColumns:"1fr auto", alignItems:"center"}}>
        <label style={{opacity:0.9}}>Datei wählen oder hierher ziehen</label>
        <input type="file" accept=".csv,text/csv" onChange={(e)=>onFiles(e.target.files)} disabled={busy}/>
      </div>

      <div style={{ display:"grid", gap:8, marginTop:10 }}>
        <label style={{ color:"#B0C4D9" }}>
          Fallback-Server (optional, wenn CSV keine <code>server</code>-Spalte hat)
        </label>
        <input
          value={defaultServer}
          onChange={(e)=>setDefaultServer(e.target.value)}
          placeholder="z. B. EU1, FUS1 …"
          style={{
            background:"#14273E", color:"#FFFFFF", border:"1px solid #2C4A73",
            padding:8, borderRadius:8
          }}
        />
      </div>

      <div
        onDragOver={(e)=>{e.preventDefault();}}
        onDrop={(e)=>{e.preventDefault(); onFiles(e.dataTransfer.files);}}
        style={{
          marginTop:12,
          padding:20,
          border:"2px dashed #2C4A73",
          borderRadius:10,
          textAlign:"center",
          color:"#B0C4D9"
        }}
      >
        Drop CSV here
      </div>

      {busy && <div style={{ marginTop:12, color:"#B0C4D9" }}>Import läuft…</div>}
      {err && <div style={{ marginTop:12, color:"#ff9e9e" }}>Fehler: {err}</div>}

      {report && (
        <div style={{ marginTop:12, padding:12, background:"#14273E", border:"1px solid #2C4A73", borderRadius:10 }}>
          <div style={{ color:"#D6E4F7" }}>Detected: <b>{report.detectedType ?? "—"}</b></div>
          <div style={{ marginTop:8 }}>
            <div style={{ color:"#B0C4D9" }}>Counts:</div>
            <ul>
              {Object.entries(report.counts).map(([k,v])=>(
                <li key={k} style={{ color:"#FFFFFF" }}>{k}: {v}</li>
              ))}
            </ul>
          </div>
          {!!report.warnings.length && (
            <div style={{ color:"#ffd27a" }}>
              Warnungen:
              <ul>{report.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
            </div>
          )}
          {!!report.errors.length && (
            <div style={{ color:"#ff9e9e" }}>
              Fehler:
              <ul>{report.errors.map((e,i)=><li key={i}>{e}</li>)}</ul>
            </div>
          )}
          <div style={{ color:"#B0C4D9", marginTop:8 }}>Dauer: {Math.round(report.durationMs)} ms</div>
        </div>
      )}
    </div>
  );
}
