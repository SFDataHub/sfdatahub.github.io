// src/components/ImportCsv/ImportCsv.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { importCsvToDB, type ImportCsvKind, type ImportCsvOptions, type ImportReport } from "../../lib/import/csv";
import { writeGuildSnapshotsFromRows } from "../../lib/import/importer";

type Row = Record<string, any>;
const norm = (s: any) => String(s ?? "").trim();
const CANON = (s: string) => s.toLowerCase().replace(/[\s_\u00a0]+/g, "");

function detectDelimiter(headerLine: string) {
  const c = [",",";","\t","|"];
  let best = ",", n = -1;
  for (const d of c) {
    const cnt = (headerLine.match(new RegExp(`\\${d}`,"g"))||[]).length;
    if (cnt>n){ best=d; n=cnt; }
  }
  return best;
}
function parseCsv(text: string): { headers: string[]; rows: Row[]; delimiter: string } {
  let t = text.replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  const lines = t.split("\n");
  if (!lines.length) return { headers: [], rows: [], delimiter: "," };
  const delim = detectDelimiter(lines[0] ?? "");

  const parseLine = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i=0;i<line.length;i++){
      const ch=line[i];
      if (ch === '"'){ if (q && line[i+1]==='"'){ cur+='"'; i++; } else q=!q; }
      else if (ch===delim && !q){ out.push(cur); cur=""; }
      else cur+=ch;
    }
    out.push(cur);
    return out;
  };

  const headerCells = lines[0] ? parseLine(lines[0]).map(norm) : [];
  const headers = headerCells.map((h,i)=>h||`col${i}`);
  const rows: Row[] = [];
  for (let li=1; li<lines.length; li++){
    if (!lines[li]) continue;
    const cells = parseLine(lines[li]);
    if (cells.every(c=>norm(c)==="")) continue;
    const row: Row = {};
    for (let ci=0; ci<headers.length; ci++) row[headers[ci]] = cells[ci]!=null ? norm(cells[ci]) : "";
    rows.push(row);
  }
  return { headers, rows, delimiter: delim };
}

/** Spalten (fix) */
const COL = {
  PLAYERS: {
    IDENTIFIER:       CANON("Identifier"),
    GUILD_IDENTIFIER: CANON("Guild Identifier"),
    TIMESTAMP:        CANON("Timestamp"),
    NAME:             CANON("Name"),
    SERVER:           CANON("Server"),
    OWN:              CANON("Own"),
  },
  GUILDS: {
    GUILD_IDENTIFIER:   CANON("Guild Identifier"),
    GUILD_MEMBER_COUNT: CANON("Guild Member Count"),
    NAME:               CANON("Name"),
    TIMESTAMP:          CANON("Timestamp"),
  }
} as const;

const hasCols = (headers: string[], requiredCanon: string[]) => {
  const S = new Set(headers.map(CANON));
  return requiredCanon.every(k => S.has(k));
};
const pickByCanon = (row: Row, canonKey: string): any => {
  for (const k of Object.keys(row)) if (CANON(k) === canonKey) return row[k];
  return undefined;
};

/** Dateiname → Typ; Fallback: Header-Scoring */
function detectKindFromFilename(name: string): ImportCsvKind | "unknown" {
  const s = name.toLowerCase();
  if (/^players\.\d+\.csv$/.test(s)) return "players";
  if (/^groups\.\d+\.csv$/.test(s)) return "guilds";
  return "unknown";
}
function detectKindFromHeaders(headers: string[]): ImportCsvKind | "unknown" {
  const H = headers.map(CANON);
  const has = (k: string) => H.includes(k);
  let sp = 0, sg = 0;
  if (has(COL.PLAYERS.GUILD_IDENTIFIER)) sp += 2;
  if (has(COL.PLAYERS.IDENTIFIER))       sp += 2;
  if (has(COL.PLAYERS.TIMESTAMP))        sp += 1;

  if (has(COL.GUILDS.GUILD_IDENTIFIER))   sg += 2;
  if (has(COL.GUILDS.GUILD_MEMBER_COUNT)) sg += 3;
  if (has(COL.GUILDS.TIMESTAMP))          sg += 1;

  if (sp===0 && sg===0) return "unknown";
  if (sg>sp) return "guilds";
  if (sp>sg) return "players";
  return has(COL.PLAYERS.IDENTIFIER) ? "players" : "guilds";
}
function detectCsvKind(name: string, headers: string[]): { kind: ImportCsvKind | "unknown"; via: "filename"|"headers"|"unknown"; warn?: string } {
  const byName = detectKindFromFilename(name);
  if (byName !== "unknown") {
    const byHead = detectKindFromHeaders(headers);
    if (byHead !== "unknown" && byHead !== byName) {
      return { kind: byName, via: "filename", warn: `Per Dateiname als "${byName}" klassifiziert, Header deuten auf "${byHead}".` };
    }
    return { kind: byName, via: "filename" };
  }
  const byHead = detectKindFromHeaders(headers);
  return { kind: byHead, via: byHead === "unknown" ? "unknown" : "headers" };
}

/** Slim & Preview */
function toSec(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s)/1000);
  if (/^\d{10}$/.test(s)) return Number(s);
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

type PlayerSlim = {
  id?: string;
  name?: string;
  own?: boolean;
  server?: string;
  guildIdentifier: string;
  tsSec?: number | null;
};
type GuildSlim = {
  guildIdentifier: string;
  name?: string;
  memberCount: number;
  tsSec?: number;
};

function slimPlayers(rows: Row[], headers: string[]): PlayerSlim[] {
  const out: PlayerSlim[] = [];
  if (!hasCols(headers, [COL.PLAYERS.GUILD_IDENTIFIER])) return out;
  for (const r of rows) {
    const gid = pickByCanon(r, COL.PLAYERS.GUILD_IDENTIFIER);
    if (!gid) continue;
    const rawServer = pickByCanon(r, COL.PLAYERS.SERVER);
    const server = rawServer && String(rawServer).trim() !== "" ? String(rawServer).trim().toUpperCase() : undefined; // KEIN UNKNOWN
    out.push({
      guildIdentifier: String(gid),
      id: pickByCanon(r, COL.PLAYERS.IDENTIFIER) || undefined,
      name: pickByCanon(r, COL.PLAYERS.NAME) || undefined,
      own: ["1","true","✓","yes","y","ja"].includes(String(pickByCanon(r, COL.PLAYERS.OWN)).toLowerCase()),
      server,
      tsSec: toSec(pickByCanon(r, COL.PLAYERS.TIMESTAMP)) ?? undefined,
    });
  }
  return out;
}
function slimGuilds(rows: Row[], headers: string[]): GuildSlim[] {
  const out: GuildSlim[] = [];
  if (!hasCols(headers, [COL.GUILDS.GUILD_IDENTIFIER, COL.GUILDS.GUILD_MEMBER_COUNT])) return out;
  for (const r of rows) {
    const gid = pickByCanon(r, COL.GUILDS.GUILD_IDENTIFIER);
    const mc  = Number(pickByCanon(r, COL.GUILDS.GUILD_MEMBER_COUNT));
    if (!gid || !Number.isFinite(mc)) continue;
    const ts  = toSec(pickByCanon(r, COL.GUILDS.TIMESTAMP));
    out.push({
      guildIdentifier: String(gid),
      name: pickByCanon(r, COL.GUILDS.NAME) || undefined,
      memberCount: mc,
      tsSec: ts ?? undefined
    });
  }
  return out;
}

/** Zusammenfassung */
type PlayerListItem = { server?: string; id: string; name: string; own: boolean };
type GuildListItem  = { id: string; name: string; declaredCount: number; playersCount: number; full: boolean };

type QuickSummary = {
  totalPlayers: number;
  uniquePlayerIds: number;
  ownPlayers: number;
  servers: number;
  perServer: Array<{server:string; players:number}>;
  guildsRepresented: number;
  fullyScannedGuilds: number;
  notes: string[];
  playersList: PlayerListItem[];
  guildsList: GuildListItem[];
};

function buildSummary(players: PlayerSlim[], guilds: GuildSlim[]): QuickSummary {
  const notes: string[] = [];

  const uniq = new Map<string, PlayerListItem>();
  for (const p of players) {
    const id = p.id || "";
    const server = p.server?.toUpperCase();
    if (id) {
      const key = `${server ?? "NO"}::${id}`;
      if (!uniq.has(key)) uniq.set(key, { server, id, name: p.name || "", own: !!p.own });
    }
  }
  const uniquePlayerIds = uniq.size;
  const totalPlayers = players.length;
  const ownPlayers = Array.from(uniq.values()).filter(v => v.own).length;

  const perServerMap = new Map<string, number>();
  for (const p of uniq.values()) {
    if (!p.server) continue; // KEIN UNKNOWN-Bucket
    perServerMap.set(p.server, (perServerMap.get(p.server) ?? 0) + 1);
  }
  const perServer = Array.from(perServerMap.entries()).map(([server,players]) => ({server, players})).sort((a,b)=>b.players-a.players);
  const servers = perServer.length;

  // Gezählt: Spieler je Gilde
  const playersCountByGuild = new Map<string, number>();
  for (const p of players) playersCountByGuild.set(p.guildIdentifier, (playersCountByGuild.get(p.guildIdentifier) ?? 0) + 1);

  // Deklariert + Name: aus Guilds-CSV
  const guildsSet = new Set<string>();
  const info = new Map<string, { name: string; declared: number }>();
  for (const g of guilds) {
    guildsSet.add(g.guildIdentifier);
    info.set(g.guildIdentifier, { name: g.name || "", declared: g.memberCount });
  }
  for (const gid of playersCountByGuild.keys()) guildsSet.add(gid);

  let fullyScannedGuilds = 0;
  const guildsList: GuildListItem[] = [];
  for (const gid of guildsSet) {
    const declared = info.get(gid)?.declared;
    const counted = playersCountByGuild.get(gid) ?? 0;
    const full = declared != null && counted === declared;
    if (full) fullyScannedGuilds++;
    guildsList.push({ id: gid, name: info.get(gid)?.name || "", declaredCount: declared ?? 0, playersCount: counted, full });
  }

  if (![...info.values()].some(v => Number.isFinite(v.declared))) {
    notes.push("Keine 'Guild Member Count' Information gefunden – vollständig gescannte Gilden nicht sicher bestimmbar.");
  }

  guildsList.sort((a,b)=> a.name ? a.name.localeCompare(b.name) : a.id.localeCompare(b.id));
  const playersList = Array.from(uniq.values()).sort((a,b)=> {
    if ((a.server||"") === (b.server||"")) return a.name.localeCompare(b.name);
    return (a.server||"").localeCompare(b.server||"");
  });

  return {
    totalPlayers, uniquePlayerIds, ownPlayers, servers, perServer,
    guildsRepresented: guildsSet.size, fullyScannedGuilds, notes, playersList, guildsList
  };
}

/** UI State */
type FilePreview = {
  name: string;
  size: number;
  rows: number;
  delimiter: string;
  text: string;
  kind: ImportCsvKind | "unknown";
  warn?: string;
};

export default function ImportCsv() {
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [summary, setSummary] = useState<QuickSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [reports, setReports] = useState<ImportReport[]>([]);
  const [progress, setProgress] = useState<{phase:"prepare"|"write"|"done"; current:number; total:number} | null>(null);

  useEffect(()=>{ const p=document.body.style.overflowX; document.body.style.overflowX="hidden"; return ()=>{ document.body.style.overflowX=p; }; },[]);

  const analyzeMany = useCallback(async (blobList: FileList | File[]) => {
    setBusy(true); setErr(null); setSummary(null); setReports([]); setImportMsg(null);
    try {
      const arr = Array.from(blobList).slice(0,2);
      const previews: FilePreview[] = [];
      let playersAll: any[] = [];
      let guildsAll:  any[] = [];

      for (const f of arr) {
        const file = f as File;
        const text = await file.text();
        const parsed = parseCsv(text);
        const { kind, warn } = detectCsvKind(file.name, parsed.headers);

        previews.push({
          name: file.name,
          size: file.size || text.length,
          rows: parsed.rows.length,
          delimiter: parsed.delimiter,
          text,
          kind,
          warn
        });

        if (kind === "players") playersAll = playersAll.concat(slimPlayers(parsed.rows, parsed.headers));
        else if (kind === "guilds") guildsAll  = guildsAll.concat(slimGuilds(parsed.rows, parsed.headers));
      }

      setFiles(previews);
      setSummary(buildSummary(playersAll, guildsAll));
    } catch (e:any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  const onFiles = useCallback(async (fl: FileList | null) => {
    if (!fl || fl.length===0) return;
    await analyzeMany(fl);
  }, [analyzeMany]);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const fl = e.dataTransfer.files;
    if (!fl || !fl.length) return;
    await analyzeMany(fl);
  }, [analyzeMany]);

  async function handleImportToDB() {
    if (!files.length) return;
    setImportBusy(true); setProgress({phase:"prepare", current:0, total:0});
    setImportMsg(null); setReports([]);

    try {
      let playersRows: Row[] = [];
      let guildsRows: Row[]  = [];

      for (const f of files) {
        const parsed = parseCsv(f.text);
        const { kind } = detectCsvKind(f.name, parsed.headers);
        if (kind === "players") playersRows = playersRows.concat(parsed.rows);
        if (kind === "guilds")  guildsRows  = guildsRows.concat(parsed.rows);
      }

      console.info("[UploadCenter] start import", {
        hasPlayersCsv: !!playersRows.length,
        hasGuildsCsv: !!guildsRows.length,
        playersRows: playersRows.length,
        guildsRows: guildsRows.length,
      });

      if (!guildsRows.length)  throw new Error("Guilds-CSV mit „Guild Identifier“ + „Guild Member Count“ + „Timestamp“ nicht gefunden.");
      if (!playersRows.length) throw new Error("Players-CSV mit „Guild Identifier“ nicht gefunden.");

      const repGuilds = await importCsvToDB(null, {
        kind: "guilds",
        rows: guildsRows,
        onProgress: p => setProgress(p),
      } as ImportCsvOptions);
      console.info("[Import Report] guilds", repGuilds);

      const repPlayers = await importCsvToDB(null, {
        kind: "players",
        rows: playersRows,
        onProgress: p => setProgress(p),
      } as ImportCsvOptions);
      console.info("[Import Report] players", repPlayers);

      // Snapshots NACH den beiden Imports schreiben (1 Doc pro Gilde)
      await writeGuildSnapshotsFromRows(playersRows, guildsRows);

      setProgress({ phase:"done", current:1, total:1 });
      setReports([repGuilds, repPlayers]);
      setImportMsg("Import abgeschlossen.");
    } catch (e:any) {
      console.error("[UploadCenter] Import error:", e);
      setImportMsg(`Fehler beim Import: ${e?.message ?? e}`);
    } finally {
      setImportBusy(false);
      setTimeout(()=>setProgress(null), 1200);
    }
  }

  const fileBadges = useMemo(()=> files.map(f=>`${f.name} (${f.rows} rows, “${f.delimiter}”, ${f.kind}${f.warn ? " ⚠️" : ""})`), [files]);
  const totalParsedRows = useMemo(()=> files.reduce((a,b)=>a+b.rows,0), [files]);
  const percent = progress ? Math.floor(100 * progress.current / Math.max(1, progress.total || 1)) : 0;

  return (
    <div
      className="uc-panel"
      style={{
        boxSizing:"border-box",
        width:"100%",
        maxWidth:"1200px",
        margin:"0 auto",
        maxHeight:"80vh",
        overflow:"auto",
        background:"#152A42",
        border:"1px solid #2B4C73",
        borderRadius:12,
        padding:16
      }}
    >
      <style>{`
        .uc-panel::-webkit-scrollbar { width: 10px; height: 10px; }
        .uc-panel::-webkit-scrollbar-track { background: transparent; }
        .uc-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 8px; }
        .uc-chip { background:#0F2238; border:1px solid #24456E; border-radius:999px; padding:4px 10px; color:#D6E4F7; font-size:12px; }
        .uc-chip + .uc-chip { margin-left:6px; }
        .uc-btn { background:#2E75F0; color:#fff; border:none; border-radius:8px; padding:8px 12px; }
        .uc-btn:disabled { opacity:.6; cursor:not-allowed; }
      `}</style>

      <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        <h3 style={{ margin:0, color:"#F5F9FF" }}>Upload Center</h3>

        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {fileBadges.map((t,i)=> <span className="uc-chip" key={i} title={files[i].warn || ""}>{t}</span>)}
          {files.length>0 && <span className="uc-chip">Total: {totalParsedRows} rows</span>}
        </div>

        <div style={{ marginLeft:"auto", display:"flex", gap:12, alignItems:"center" }}>
          {progress && (
            <div style={{ minWidth:180, display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:120, height:8, background:"#27456E", borderRadius:6, overflow:"hidden" }}>
                <div style={{ width:`${percent}%`, height:"100%", background:"#2E75F0" }}/>
              </div>
              <span style={{ color:"#D6E4F7" }}>{percent}%</span>
            </div>
          )}
          <button
            onClick={handleImportToDB}
            disabled={!files.length || !summary || importBusy}
            className="uc-btn"
          >
            {importBusy ? "Loading…" : "Load to DB"}
          </button>
          {importMsg && (
            <span style={{ color: importMsg.startsWith("Fehler") ? "#ff9e9e" : "#B0E3A1" }}>
              {importMsg}
            </span>
          )}
        </div>
      </div>

      <div style={{ display:"grid", gap:12, gridTemplateColumns:"1fr auto", alignItems:"center", marginTop:8 }}>
        <label style={{ opacity:0.9 }}>Dateien wählen (max. 2) oder hierher ziehen</label>
        <input type="file" accept=".csv,text/csv" multiple onChange={(e)=>onFiles(e.target.files)} disabled={busy} />
      </div>

      <div
        onDragOver={(e)=>e.preventDefault()}
        onDrop={onDrop}
        style={{ marginTop:12, padding:20, border:"2px dashed #2C4A73", borderRadius:10, textAlign:"center", color:"#B0C4D9" }}
      >
        Drop 1–2 CSV files here
      </div>

      {busy && <div style={{ marginTop:12, color:"#B0C4D9" }}>Analysiere CSV(s)…</div>}
      {err && <div style={{ marginTop:12, color:"#ff9e9e" }}><b>Fehler:</b> {err}</div>}

      {summary && (
        <div style={{ marginTop:12, padding:12, background:"#0F2238", border:"1px solid #24456E", borderRadius:10 }}>
          <div style={{ color:"#D6E4F7", marginBottom:8 }}><b>Gesamtübersicht (nur Vorschau)</b></div>

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
              <summary style={{ cursor:"pointer", color:"#D6E4F7", fontWeight:600 }}>
                Spieler-Liste anzeigen ({summary.playersList.length})
              </summary>
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
                      <tr key={`${p.server ?? "NO"}-${p.id}-${i}`} style={{ borderBottom:"1px solid #1E3556" }}>
                        <td>{p.server ?? "—"}</td><td>{p.id}</td><td>{p.name || "—"}</td><td>{p.own ? "✓" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details open>
              <summary style={{ cursor:"pointer", color:"#D6E4F7", fontWeight:600 }}>
                Gilden-Liste anzeigen ({summary.guildsList.length})
              </summary>
              <div style={{ marginTop:8 }}>
                <table style={{ width:"100%", tableLayout:"fixed", borderCollapse:"collapse", color:"#DDE8F7" }}>
                  <thead><tr style={{ borderBottom:"1px solid #2C4A73" }}>
                    <th style={{ textAlign:"left" }}>Guild-ID</th>
                    <th style={{ textAlign:"left" }}>Name</th>
                    <th style={{ textAlign:"right" }}>Deklariert</th>
                    <th style={{ textAlign:"right" }}>Gezählt</th>
                    <th style={{ textAlign:"center" }}>Vollständig</th>
                  </tr></thead>
                  <tbody>
                    {summary.guildsList.map((g,i)=> (
                      <tr key={`${g.id}-${i}`} style={{ borderBottom:"1px solid #1E3556" }}>
                        <td>{g.id}</td>
                        <td>{g.name || "—"}</td>
                        <td style={{ textAlign:"right" }}>{g.declaredCount || 0}</td>
                        <td style={{ textAlign:"right" }}>{g.playersCount}</td>
                        <td style={{ textAlign:"center" }}>{g.full ? "✓" : ""}</td>
                      </tr>
                    ))}
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
