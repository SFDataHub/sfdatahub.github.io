// src/components/ImportJson/ImportJson.tsx
import React, { useCallback, useEffect, useState } from "react";
import { importJsonToDB } from "../../lib/import/importer";

/* ===================== GAS Web App URL ===================== */
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbxKUyihus18ksaIQWt-raYvIpuUC5TqtXFF2KvLVmGVDWWBTZYWAiiaos2nEOr7ZgE5/exec";

/* ===================== Helpers ===================== */
type Obj = Record<string, any>;
const isObj = (v: any): v is Obj => v && typeof v === "object" && !Array.isArray(v);
const norm = (s: any) => String(s ?? "").trim();
const up = (s: any) => norm(s).toUpperCase();

const PLAYER_ID_KEYS = ["identifier","id","link identifier","player_id","pid","playerid","ID","Identifier"];
const PLAYER_NAME_KEYS = ["name","player","player_name","nickname","nick","Character Name"];
const PLAYER_GUILD_KEYS = ["guildId","guild_id","guild","Guild","Guild ID","guildid"];
const OWN_KEYS = ["own","is_own","mine"];
const GUILD_ID_KEYS = ["identifier","id","guild_id","gid","Identifier","Guild ID"];
const GUILD_NAME_KEYS = ["name","guild_name","Guild","title"];

function guessServer(o: Obj): string | undefined {
  const fromGroup = typeof o.group === "string" ? o.group.split("_").slice(0,2).join("_") : undefined;
  const fromGroupName = typeof o.groupname === "string" ? o.groupname.split(" ")[0] : undefined;
  const s = o.server ?? o.prefix ?? o.world ?? o.realm ?? o.srv ?? fromGroup ?? fromGroupName ?? o.shard;
  return s ? up(s) : undefined;
}
function pick(o: Obj, keys: string[]) {
  for (const k of keys) {
    if (o[k] != null && String(o[k]).length) return o[k];
    const lower = k.toLowerCase(), upper = k.toUpperCase();
    if (o[lower] != null && String(o[lower]).length) return o[lower];
    if (o[upper] != null && String(o[upper]).length) return o[upper];
    const spaced = k.replace(/_/g," ");
    if (o[spaced] != null && String(o[spaced]).length) return o[spaced];
  }
  return undefined;
}
function isPlayerId(id?: string){ if(!id) return false; const last = id.split("_").pop()||""; return last.startsWith("p"); }
function isGuildId(id?: string){ if(!id) return false; const last = id.split("_").pop()||""; return last.startsWith("g"); }

/* ===================== Slim Types ===================== */
type SlimPlayer = { id?: string; name?: string; server?: string; own?: boolean; guildId?: string; _key?: string; };
type SlimGuild  = { id: string; name?: string; server?: string; declaredCount?: number; names?: string[]; };
type PlayerListItem = { server: string; id: string; name: string; own: boolean };
type GuildListItem  = { server: string; id: string; name: string; declaredCount?: number; playersCount: number };

function slimPlayer(o: Obj): SlimPlayer {
  const id = pick(o, PLAYER_ID_KEYS)?.toString();
  const name = pick(o, PLAYER_NAME_KEYS)?.toString();
  const server = up(guessServer(o) ?? "UNKNOWN");
  const key = id && isPlayerId(id) ? `${server}::${id}` : undefined;
  return { id, name, server, own: !!pick(o, OWN_KEYS), guildId: pick(o, PLAYER_GUILD_KEYS)?.toString(), _key: key };
}
function slimGuildFromGroup(o: Obj): SlimGuild | null {
  const id = pick(o, GUILD_ID_KEYS)?.toString();
  if (!id || !isGuildId(id)) return null;
  const server = guessServer(o);
  const name = pick(o, GUILD_NAME_KEYS)?.toString();
  const names = Array.isArray(o.names) ? o.names.map((n:any)=>String(n)) : undefined;
  const declaredCount = names ? names.length : undefined;
  return { id, name, server: server ? up(server) : undefined, names, declaredCount };
}

/* ===================== Scan JSON ===================== */
function deepFindObjectArrays(root: any, limit = 50000): Obj[][] {
  const out: Obj[][] = []; let seen=0; const stack=[root];
  while (stack.length && seen<limit) {
    const cur=stack.pop(); seen++;
    if (Array.isArray(cur) && cur.length && isObj(cur[0])) out.push(cur as Obj[]);
    else if (isObj(cur)) for (const v of Object.values(cur)) stack.push(v);
  }
  return out;
}

function collectAggregates(json: any) {
  const arrays = deepFindObjectArrays(json);

  const players: SlimPlayer[]=[];
  if (Array.isArray(json.players) && json.players.length && isObj(json.players[0])) {
    for (const o of json.players as Obj[]) players.push(slimPlayer(o));
  }
  for (const arr of arrays) {
    const pHits = arr.filter(o => pick(o,PLAYER_ID_KEYS)||pick(o,PLAYER_NAME_KEYS)||pick(o,OWN_KEYS)).length;
    const gHits = arr.filter(o => pick(o,GUILD_ID_KEYS)||Array.isArray(o.names)).length;
    if (pHits > 0 && pHits >= gHits) for (const o of arr) players.push(slimPlayer(o));
  }

  const guilds: SlimGuild[]=[];
  if (Array.isArray(json.groups) && json.groups.length && isObj(json.groups[0])) {
    for (const g of json.groups as Obj[]) { const gg=slimGuildFromGroup(g); if (gg) guilds.push(gg); }
  }
  for (const arr of arrays) {
    if (arr.some(o => pick(o,GUILD_ID_KEYS) && Array.isArray(o.names))) {
      for (const o of arr) { const gg=slimGuildFromGroup(o); if (gg) guilds.push(gg); }
    }
  }

  const normPlayers = players.map(p => ({...p, server: up(p.server ?? "UNKNOWN"), name: p.name?String(p.name):undefined}))
                             .filter(p => p.id || p.name);

  const guildMap = new Map<string, SlimGuild>();
  for (const g of guilds) {
    const server = up(g.server ?? "UNKNOWN");
    const key = `${server}::${g.id}`;
    const prev = guildMap.get(key);
    if (!prev) guildMap.set(key, { ...g, server });
    else {
      const betterCount =
        g.declaredCount!=null && prev.declaredCount!=null ? Math.max(g.declaredCount, prev.declaredCount)
                                                          : g.declaredCount ?? prev.declaredCount;
      const mergedNames = prev.names && g.names ? Array.from(new Set([...prev.names, ...g.names])) : prev.names ?? g.names;
      guildMap.set(key, { ...prev, name: prev.name ?? g.name, declaredCount: betterCount, names: mergedNames });
    }
  }

  // Spieler pro Gilde: via guildId + via names (beides als unique PlayerKeys)
  const playersByGuild = new Map<string, Set<string>>();

  // 1) ID-basiert
  for (const p of normPlayers) {
    const gid = p.guildId ? String(p.guildId) : null;
    if (!gid || !isGuildId(gid) || !p._key) continue;
    const key = `${p.server}::${gid}`;
    if (!playersByGuild.has(key)) playersByGuild.set(key, new Set());
    playersByGuild.get(key)!.add(p._key);
  }
  // 2) name-basiert (nur Spieler mit echter ID; so bleiben es unique IDs)
  const byServerName = new Map<string, Map<string, Set<string>>>();
  for (const p of normPlayers) {
    if (!p._key || !p.name) continue;
    const server = p.server!, nm = p.name.toLowerCase();
    if (!byServerName.has(server)) byServerName.set(server, new Map());
    const m = byServerName.get(server)!;
    if (!m.has(nm)) m.set(nm, new Set());
    m.get(nm)!.add(p._key);
  }
  for (const [key, g] of guildMap.entries()) {
    if (!g.names || !g.names.length) continue;
    const server = key.split("::")[0];
    const map = byServerName.get(server);
    if (!map) continue;
    if (!playersByGuild.has(key)) playersByGuild.set(key, new Set());
    const set = playersByGuild.get(key)!;
    for (const nm of g.names) {
      const s = map.get(String(nm).toLowerCase());
      if (s) for (const pk of s) set.add(pk);
    }
  }

  return { normPlayers, guildMap, playersByGuild };
}

/* ===================== Summary ===================== */
type QuickSummary = {
  totalPlayers: number; uniquePlayerIds: number; ownPlayers: number;
  servers: number; perServer: Array<{server:string; players:number}>;
  guildsRepresented: number; fullyScannedGuilds: number; notes: string[];
  playersList: PlayerListItem[]; guildsList: GuildListItem[];
};

function summarize(json: any): QuickSummary {
  const notes: string[]=[];
  const { normPlayers, guildMap, playersByGuild } = collectAggregates(json);

  const uniqueMap = new Map<string, PlayerListItem>();
  for (const p of normPlayers) {
    if (!p.id || !isPlayerId(String(p.id))) continue;
    const key = `${p.server}::${String(p.id)}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, {server: p.server!, id: String(p.id), name: String(p.name ?? ""), own: !!p.own});
  }
  const totalPlayers = normPlayers.filter(x => x.id && isPlayerId(String(x.id))).length;
  const uniquePlayerIds = uniqueMap.size;
  const ownPlayers = Array.from(uniqueMap.values()).filter(p=>p.own).length;

  const perServerSets = new Map<string, Set<string>>();
  for (const [key, pl] of uniqueMap.entries()) {
    const set = perServerSets.get(pl.server) ?? new Set<string>(); set.add(key); perServerSets.set(pl.server,set);
  }
  const perServer = Array.from(perServerSets.entries()).map(([server,set])=>({server, players:set.size})).sort((a,b)=>b.players-a.players);
  const servers = perServer.length;

  const allGuildKeys = new Set<string>(); for (const k of guildMap.keys()) allGuildKeys.add(k); for (const k of playersByGuild.keys()) allGuildKeys.add(k);
  const guildsRepresented = allGuildKeys.size;

  let fullyScannedGuilds=0, anyDeclared=false;
  const guildsList: GuildListItem[]=[];
  for (const key of allGuildKeys) {
    const info = guildMap.get(key);
    const playersCount = playersByGuild.get(key)?.size ?? 0;
    const [server, gid] = key.split("::");
    guildsList.push({ server, id: gid, name: info?.name ?? "", declaredCount: info?.declaredCount, playersCount });
    if (info?.declaredCount!=null) {
      anyDeclared = true;
      if (playersCount === info.declaredCount) fullyScannedGuilds++;
      else if (playersCount > info.declaredCount) notes.push(`Mehr Spieler gezählt (${playersCount}) als deklariert (${info.declaredCount}) für ${key}.`);
    }
  }
  if (!anyDeclared) notes.push("Keine 'memberCount' Information gefunden – vollständig gescannte Gilden nicht sicher bestimmbar.");

  const playersList = Array.from(uniqueMap.values()).sort((a,b)=> a.server===b.server ? a.name.localeCompare(b.name) : a.server.localeCompare(b.server));
  guildsList.sort((a,b)=> a.server===b.server ? (a.name||a.id).localeCompare(b.name||b.id) : a.server.localeCompare(b.server));

  return { totalPlayers, uniquePlayerIds, ownPlayers, servers, perServer, guildsRepresented, fullyScannedGuilds, notes, playersList, guildsList };
}

/* ===================== GAS Upload (text/plain → kein Preflight) ===================== */
async function uploadToSheetsInline(payload: unknown) {
  if (!GAS_URL) throw new Error("GAS_URL ist nicht gesetzt.");
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Sheets upload failed: ${res.status} ${await res.text().catch(()=> "")}`);
  return res.json();
}

/* ===================== Component ===================== */
export default function ImportJson() {
  const [report, setReport] = useState<null | { detectedType: string | null; counts: Record<string,number>; errors: string[]; warnings: string[]; durationMs: number; }>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<QuickSummary | null>(null);
  const [lastJson, setLastJson] = useState<any>(null);
  const [sheetsBusy, setSheetsBusy] = useState(false);
  const [sheetsMsg, setSheetsMsg] = useState<string | null>(null);

  useEffect(()=>{ const prev=document.body.style.overflowX; document.body.style.overflowX="hidden"; return ()=>{ document.body.style.overflowX=prev; }; },[]);
  useEffect(()=>{ try{ const s=sessionStorage.getItem("uc:lastSummary"); const r=sessionStorage.getItem("uc:lastReport"); const raw=sessionStorage.getItem("uc:lastRaw"); if(s) setSummary(JSON.parse(s)); if(r) setReport(JSON.parse(r)); if(raw) setLastJson(JSON.parse(raw)); }catch{} },[]);

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files[0]) return;
    setBusy(true); setErr(null); setReport(null); setSummary(null); setSheetsMsg(null);
    try {
      const text = await files[0].text();
      const json = JSON.parse(text);
      setLastJson(json); try{ sessionStorage.setItem("uc:lastRaw", JSON.stringify(json)); }catch{}
      const s = summarize(json); setSummary(s); try{ sessionStorage.setItem("uc:lastSummary", JSON.stringify(s)); }catch{}
      const rep = await importJsonToDB(json); setReport(rep); try{ sessionStorage.setItem("uc:lastReport", JSON.stringify(rep)); }catch{}
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  async function handleUploadToSheets() {
    if (!lastJson) return;
    setSheetsBusy(true); setSheetsMsg(null);
    try {
      const resp = await uploadToSheetsInline(lastJson);
      setSheetsMsg(
        resp.duplicate
          ? `Duplikat – nichts eingefügt (Sekunde & Inhalt identisch). Tab: ${resp.sheet}`
          : `OK → Tab: ${resp.sheet}, eingefügt: ${resp.inserted}/${resp.totalParsed}`
      );
    } catch (e: any) {
      setSheetsMsg(`Fehler: ${e?.message ?? e}`);
    } finally {
      setSheetsBusy(false);
    }
  }

  return (
    <div className="uc-panel" style={{ boxSizing:"border-box", width:"100%", maxWidth:"1200px", margin:"0 auto", maxHeight:"80vh", overflow:"auto", background:"#152A42", border:"1px solid #2B4C73", borderRadius:12, padding:16 }}>
      <style>{`
        .uc-panel::-webkit-scrollbar { width: 10px; height: 10px; }
        .uc-panel::-webkit-scrollbar-track { background: transparent; }
        .uc-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 8px; }
        .uc-panel { scrollbar-color: rgba(255,255,255,0.2) transparent; scrollbar-width: thin; overflow-x: hidden; }
        .uc-panel * { min-width: 0; }
        .uc-panel table { width: 100%; table-layout: fixed; border-collapse: collapse; }
        .uc-panel th, .uc-panel td { padding: 6px 4px; word-break: break-word; white-space: normal; }
        .uc-panel summary { outline: none; }
        .uc-panel input[type=file] { max-width: 100%; }
      `}</style>

      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <h3 style={{ margin:0, color:"#F5F9FF" }}>Upload Center</h3>
        <div style={{ marginLeft:"auto" }}>
          <button onClick={handleUploadToSheets} disabled={!lastJson || sheetsBusy} style={{ background:"#2E75F0", color:"#fff", border:"none", borderRadius:8, padding:"8px 12px", cursor: lastJson && !sheetsBusy ? "pointer" : "not-allowed", opacity: lastJson && !sheetsBusy ? 1 : 0.6 }}>
            {sheetsBusy ? "Sende…" : "Nach Google Sheets senden"}
          </button>
          {sheetsMsg && <span style={{ marginLeft:8, color: sheetsMsg.startsWith("Fehler") ? "#ff9e9e" : "#B0E3A1" }}>{sheetsMsg}</span>}
        </div>
      </div>

      <div style={{ display:"grid", gap:12, gridTemplateColumns:"1fr auto", alignItems:"center", marginTop:8 }}>
        <label style={{ opacity:0.9 }}>Datei wählen oder hierher ziehen</label>
        <input type="file" accept="application/json,.json" onChange={(e)=>onFiles(e.target.files)} disabled={busy} />
      </div>

      <div onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault(); onFiles(e.dataTransfer.files);}} style={{ marginTop:12, padding:20, border:"2px dashed #2C4A73", borderRadius:10, textAlign:"center", color:"#B0C4D9" }}>
        Drop JSON here
      </div>

      {busy && <div style={{ marginTop:12, color:"#B0C4D9" }}>Import läuft…</div>}
      {err && <div style={{ marginTop:12, color:"#ff9e9e" }}><b>Fehler:</b> {err}</div>}
      {!summary && !report && !busy && !err && <div style={{ marginTop:12, color:"#B0C4D9" }}>Noch nichts geladen – wähle oder ziehe eine JSON-Datei hierher.</div>}

      {report && (
        <div style={{ marginTop:12, padding:12, background:"#14273E", border:"1px solid #2C4A73", borderRadius:10 }}>
          <div style={{ color:"#D6E4F7" }}>Detected: <b>{report.detectedType ?? "—"}</b></div>
          <div style={{ marginTop:8 }}>
            <div style={{ color:"#B0C4D9" }}>Counts:</div>
            <ul>{Object.entries(report.counts).map(([k,v])=> <li key={k} style={{ color:"#FFFFFF" }}>{k}: {v}</li>)}</ul>
          </div>
          {!!report.warnings.length && <div style={{ color:"#ffd27a" }}>Warnungen:<ul>{report.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
          {!!report.errors.length && <div style={{ color:"#ff9e9e" }}>Fehler:<ul>{report.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
          <div style={{ color:"#B0C4D9", marginTop:8 }}>Dauer: {Math.round(report.durationMs)} ms</div>
        </div>
      )}

      {summary && (
        <div style={{ marginTop:12, padding:12, background:"#0F2238", border:"1px solid #24456E", borderRadius:10 }}>
          <div style={{ color:"#D6E4F7", marginBottom:8 }}><b>Gesamtübersicht (Datei-Inhalt)</b></div>

          <div style={{ display:"grid", gap:8, gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Stat label="Eigene Charaktere (unique IDs)" value={summary.ownPlayers} />
            <Stat label="Spieler in Datei (eindeutige IDs)" value={summary.uniquePlayerIds} hint={`Total (mit ID): ${summary.totalPlayers}`} />
            <Stat label="Vertretene Gilden (mit ID)" value={summary.guildsRepresented} />
            <Stat label="Vollständig gescannte Gilden" value={summary.fullyScannedGuilds} />
            <Stat label="Verschiedene Server" value={summary.servers} />
          </div>

          <div style={{ marginTop:12 }}>
            <div style={{ color:"#B0C4D9", marginBottom:6 }}>Spieler pro Server (eindeutige IDs):</div>
            <table style={{ width:"100%", tableLayout:"fixed", borderCollapse:"collapse", color:"#DDE8F7" }}>
              <thead><tr style={{ borderBottom:"1px solid #2C4A73" }}>
                <th style={{ textAlign:"left" }}>Server</th>
                <th style={{ textAlign:"right" }}>Spieler</th>
              </tr></thead>
              <tbody>
                {summary.perServer.map(r => (
                  <tr key={r.server} style={{ borderBottom:"1px solid #1E3556" }}>
                    <td>{r.server}</td><td style={{ textAlign:"right" }}>{r.players}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop:12, display:"grid", gap:12, gridTemplateColumns:"repeat(auto-fit, minmax(360px, 1fr))" }}>
            <details>
              <summary style={{ cursor:"pointer", color:"#D6E4F7", fontWeight:600 }}>Spieler-Liste anzeigen ({summary.playersList.length})</summary>
              <div style={{ marginTop:8 }}>
                <table style={{ width:"100%", tableLayout:"fixed", borderCollapse:"collapse", color:"#DDE8F7" }}>
                  <thead><tr style={{ borderBottom:"1px solid #2C4A73" }}>
                    <th style={{ textAlign:"left" }}>Server</th>
                    <th style={{ textAlign:"left" }}>Spieler-ID</th>
                    <th style={{ textAlign:"left" }}>Name</th>
                    <th style={{ textAlign:"left" }}>Own</th>
                  </tr></thead>
                  <tbody>
                    {summary.playersList.map((p,i)=>(
                      <tr key={`${p.server}-${p.id}-${i}`} style={{ borderBottom:"1px solid #1E3556" }}>
                        <td>{p.server}</td><td>{p.id}</td><td>{p.name || "—"}</td><td>{p.own ? "✓" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details>
              <summary style={{ cursor:"pointer", color:"#D6E4F7", fontWeight:600 }}>Gilden-Liste anzeigen ({summary.guildsList.length})</summary>
              <div style={{ marginTop:8 }}>
                <table style={{ width:"100%", tableLayout:"fixed", borderCollapse:"collapse", color:"#DDE8F7" }}>
                  <thead><tr style={{ borderBottom:"1px solid #2C4A73" }}>
                    <th style={{ textAlign:"left" }}>Server</th>
                    <th style={{ textAlign:"left" }}>Guild-ID</th>
                    <th style={{ textAlign:"left" }}>Name</th>
                    <th style={{ textAlign:"right" }}>Deklariert</th>
                    <th style={{ textAlign:"right" }}>Gezählt</th>
                    <th style={{ textAlign:"center" }}>Vollständig</th>
                  </tr></thead>
                  <tbody>
                    {summary.guildsList.map((g,i)=> {
                      const full = g.declaredCount!=null && g.playersCount===g.declaredCount;
                      return (
                        <tr key={`${g.server}-${g.id}-${i}`} style={{ borderBottom:"1px solid #1E3556" }}>
                          <td>{g.server}</td><td>{g.id}</td><td>{g.name || "—"}</td>
                          <td style={{ textAlign:"right" }}>{g.declaredCount!=null ? g.declaredCount : "—"}</td>
                          <td style={{ textAlign:"right" }}>{g.playersCount}</td>
                          <td style={{ textAlign:"center" }}>{full ? "✓" : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          {!!summary.notes.length && (
            <div style={{ marginTop:10, color:"#ffd27a" }}>
              Hinweise:
              <ul>{summary.notes.map((n,i)=><li key={i}>{n}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div style={{ background:"#14273E", border:"1px solid #2B4C73", borderRadius:10, padding:12, color:"#FFFFFF" }}>
      <div style={{ fontSize:12, opacity:0.85 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:700 }}>{value}</div>
      {hint && <div style={{ fontSize:12, opacity:0.7, marginTop:2 }}>{hint}</div>}
    </div>
  );
}
