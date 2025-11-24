import React, { useCallback, useState } from "react";

type UploadState = "idle" | "validating" | "parsing" | "done" | "error";
type Result = { isHar: boolean; isSf: boolean; sizeKB: number; error?: string; summary?: string };

function detectType(text: string){ 
  const isHar = /"log"\s*:\s*\{/.test(text) && /"entries"\s*:\s*\[/.test(text);
  const isSf = /shakes|fidget|playa|sftools|guild|player|server/i.test(text);
  return { isHar, isSf };
}

export default function UploadSim(){
  const [state, setState] = useState<UploadState>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if(!file) return;
    setState("validating");
    try{
      const text = await file.text();
      const { isHar, isSf } = detectType(text);
      setState("parsing");
      await new Promise(r => setTimeout(r, 600));
      if(!isHar && !isSf){
        setState("error");
        setResult({ isHar, isSf, sizeKB: Math.round(file.size/1024), error: "Not recognized as HAR or S&F JSON." });
        return;
      }
      setState("done");
      setResult({ isHar, isSf, sizeKB: Math.round(file.size/1024), summary: `Detected: ${isHar ? "HAR" : isSf ? "S&F JSON" : "Unknown"}. Entries: ~${Math.floor(text.length/2500)} (rough).` });
    }catch(err:any){
      setState("error");
      setResult({ isHar:false, isSf:false, sizeKB:0, error: err?.message || "Parse failed" });
    }
  }, []);

  return (
    <div>
      <h2 style={{marginTop:0, color:"#F5F9FF"}}>Upload Simulator · HAR / JSON Detection</h2>
      <div
        onDragOver={(e)=>{e.preventDefault(); setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={onDrop}
        style={{ border:"2px dashed #2C4A73", borderRadius:16, padding:32, background: dragOver ? "#10263f" : "#0f2238" }}
      >
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:18, fontWeight:700, marginBottom:8}}>Drop HAR or S&F JSON here</div>
          <div style={{fontSize:12, color:"#B0C4D9"}}>Detection → Validation → Parsing → Summary</div>
        </div>
      </div>

      <div style={{marginTop:16, background:"#152A42", border:"1px solid #2C4A73", borderRadius:16, padding:16}}>
        <div><strong>Status:</strong> {state}</div>
        {result ? (
          <ul>
            <li>isHar: {String(result.isHar)}</li>
            <li>isSf: {String(result.isSf)}</li>
            <li>sizeKB: {result.sizeKB}</li>
            {result.error && <li style={{color:"#ff8a8a"}}>error: {result.error}</li>}
            {result.summary && <li>summary: {result.summary}</li>}
          </ul>
        ) : <p style={{fontSize:12, color:"#B0C4D9"}}>No file yet.</p>}
      </div>
    </div>
  );
}
