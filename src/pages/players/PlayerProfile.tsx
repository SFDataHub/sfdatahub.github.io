import React, { useMemo, useState } from "react";

/**
 * PlayerProfile – durchgehende Seite (ohne iframe)
 * - Header (sticky)
 * - Character-Switcher (unter dem Header), eigene + Favoriten in einer Reihe
 * - Kacheln/Stats reagieren auf aktiven Charakter
 * - LEGACY-SEKTION: jetzt nativ & FULL-BLEED und reagiert ebenfalls auf aktiven Charakter
 * - Keine zusätzlichen Libraries notwendig
 */

const PALETTE = {
  page: "#0C1C2E",
  tile: "#152A42",
  tileAlt: "#14273E",
  line: "#2C4A73",
  text: "#FFFFFF",
  textSoft: "#B0C4D9",
  title: "#F5F9FF",
  active: "#2D4E78",
};

type Character = {
  id: string;
  name: string;
  className: string;
  level: number;
  guild: string;
  server: string;
  scrapbookPct?: number;
  totalStats?: number;
  lastScanDays?: number;
  activityScore?: number; // 0..100
};

// --- Demo-Daten (später durch echte ersetzen) ---
const DEMO_OWN: Character[] = [
  { id: "nox", name: "Nox", className: "Demon Hunter", level: 500, guild: "Night Watch", server: "EU 1", scrapbookPct: 96.7, totalStats: 123456, lastScanDays: 2, activityScore: 82 },
  { id: "nox-alt", name: "Nox Alt", className: "Warrior", level: 420, guild: "Night Watch", server: "EU 1", scrapbookPct: 88.3, totalStats: 98765, lastScanDays: 5, activityScore: 61 },
];
const DEMO_FAVS: Character[] = [
  { id: "ally-1", name: "Ari", className: "Mage", level: 505, guild: "Night Watch", server: "EU 1", scrapbookPct: 94.2, totalStats: 121000, lastScanDays: 1, activityScore: 90 },
  { id: "ally-2", name: "Rook", className: "Scout", level: 498, guild: "Blackfeather", server: "EU 2", scrapbookPct: 92.5, totalStats: 118200, lastScanDays: 3, activityScore: 78 },
];

// ---------- kleine UI-Bausteine ----------
function AvatarCircle({ label, size = 48 }: { label: string; size?: number }) {
  const initials = label
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(135deg, ${PALETTE.tileAlt}, ${PALETTE.active})`,
        color: PALETTE.title, fontSize: Math.round(size * 0.36), fontWeight: 800,
        border: `1px solid ${PALETTE.line}`, boxShadow: "0 0 0 3px rgba(45,78,120,.25)",
      }}
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}

type StatTileProps = { label: string; value: string | number; hint?: string };
function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div
      style={{
        background: PALETTE.tileAlt,
        border: `1px solid ${PALETTE.line}`,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: PALETTE.textSoft, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, color: PALETTE.title, fontWeight: 700 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: PALETTE.textSoft, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

// ---------- Switcher (transparent, integriert, own+favs kombiniert) ----------
function CharacterSwitcher({
  all,
  favIds,
  activeId,
  onPick,
}: {
  all: Character[];
  favIds: Set<string>;
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div style={{ background: "transparent", borderBottom: `1px solid ${PALETTE.line}` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 16px 8px" }}>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
          {all.map((c) => {
            const isActive = c.id === activeId;
            const isFav = favIds.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  padding: "6px 10px", borderRadius: 16, border: "none",
                  background: "transparent", color: isActive ? PALETTE.title : "#d2e3ff",
                  cursor: "pointer", position: "relative",
                  boxShadow: isActive ? "0 2px 14px rgba(19,33,53,.45)" : "none",
                  outline: isActive ? `1px solid ${PALETTE.active}` : "1px solid transparent",
                  transition: "transform .12s ease, outline-color .12s ease", whiteSpace: "nowrap",
                }}
                title={`${c.name} • ${c.className} • L${c.level}`}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.98)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <AvatarCircle label={c.name} size={48} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.05 }}>
                    {c.name}{isFav ? " ★" : ""}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {c.className} • L{c.level}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** -------- ehemals „Legacy Canvas“ – jetzt nativ, full-bleed, DYNAMISCH --------
 * Diese Sektion erhält den aktiven Charakter als Prop und rendert alle Texte entsprechend.
 */
function LegacySectionNative({ char }: { char: Character }) {
  const [tab, setTab] = useState<"overview" | "stats" | "charts" | "progress" | "compare" | "history">("overview");
  const [subtab, setSubtab] = useState<"basestats" | "totalstats" | "fortress" | "gems">("basestats");
  const [filter, setFilter] = useState<"manual" | "class" | "server" | "guild" | "top100" | "top1000">("manual");

  const TabsButton = ({ value, children }: { value: typeof tab; children: React.ReactNode }) => (
    <button
      onClick={() => setTab(value)}
      style={{
        flex: 1, padding: 12, background: tab === value ? PALETTE.active : "#1A2F4A",
        color: tab === value ? "#fff" : PALETTE.textSoft, border: "none", cursor: "pointer", fontSize: 14,
      }}
    >
      {children}
    </button>
  );

  const SubButton = ({ value, children }: { value: typeof subtab; children: React.ReactNode }) => (
    <button
      onClick={() => setSubtab(value)}
      style={{
        padding: 12, background: subtab === value ? PALETTE.active : "#1A2F4A",
        color: subtab === value ? "#fff" : PALETTE.textSoft, border: "none", cursor: "pointer", fontSize: 14, minWidth: 120,
      }}
    >
      {children}
    </button>
  );

  const FilterButton = ({ value, children }: { value: typeof filter; children: React.ReactNode }) => (
    <button
      onClick={() => setFilter(value)}
      style={{
        flex: 1, padding: 12, background: filter === value ? PALETTE.active : "#1A2F4A",
        color: filter === value ? "#fff" : PALETTE.textSoft, border: "none", cursor: "pointer", fontSize: 14,
      }}
    >
      {children}
    </button>
  );

  const SectionCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ background: PALETTE.tileAlt, padding: 15, borderRadius: 12 }}>{children}</div>
  );

  /** Full-bleed Wrapper (läuft von Sidebar bis ganz rechts) */
  const FullBleed: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div
      style={{
        position: "relative", left: "50%", right: "50%",
        marginLeft: "-50vw", marginRight: "-50vw", width: "100vw", background: PALETTE.page,
      }}
    >
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 16px 32px" }}>{children}</div>
    </div>
  );

  // Hilfswerte aus char
  const level = char.level ?? 0;
  const scrapbook = (char.scrapbookPct ?? 0).toFixed(1);

  return (
    <FullBleed>
      {/* Kopfbereich – dynamisch */}
      <div
        style={{
          background: PALETTE.tileAlt, padding: 15, borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8,
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: PALETTE.title, fontSize: 24, fontWeight: 800 }}>{char.name}</h2>
          <div style={{ fontSize: 14, color: PALETTE.textSoft }}>
            Level {char.level} • {char.className} • Server {char.server} • Gilde: {char.guild}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 13 }}>
          <span style={{ color: PALETTE.textSoft }}>
            Zuletzt aktualisiert: {char.lastScanDays ?? 0} Tag(e) her
          </span>
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#4CAF50", marginLeft: 8 }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#1A2F4A", marginTop: 12, borderRadius: 6, overflow: "hidden" }}>
        <TabsButton value="overview">Übersicht</TabsButton>
        <TabsButton value="stats">Statistiken</TabsButton>
        <TabsButton value="charts">Charts</TabsButton>
        <TabsButton value="progress">Fortschritt</TabsButton>
        <TabsButton value="compare">Vergleich</TabsButton>
        <TabsButton value="history">Historie</TabsButton>
      </div>

      {/* Inhalte */}
      {tab === "overview" && (
        <SectionCard>
          <h3 style={{ marginTop: 0, color: PALETTE.title }}>Allgemeine Übersicht</h3>
          <p style={{ color: PALETTE.textSoft }}>
            Account: {char.name} · Klasse: {char.className} · Level: {char.level} · Gilde: {char.guild} · Server: {char.server}
          </p>
        </SectionCard>
      )}

      {tab === "stats" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", background: "#1A2F4A", borderRadius: 6, overflow: "hidden", gap: 8, padding: 8 }}>
            <SubButton value="basestats">Base Stats</SubButton>
            <SubButton value="totalstats">Total Stats</SubButton>
            <SubButton value="fortress">Festung</SubButton>
            <SubButton value="gems">Edelsteine</SubButton>
          </div>

          {subtab === "basestats" && (
            <SectionCard>
              <h3 style={{ marginTop: 0, color: PALETTE.title }}>Base Stats – {char.name}</h3>
              <div style={{ margin: "8px 0" }}>⚔️ Stärke: {(char.totalStats ?? 0) * 0.18 >> 0}</div>
              <div style={{ margin: "8px 0" }}>🏹 Geschick: {(char.totalStats ?? 0) * 0.16 >> 0}</div>
              <div style={{ margin: "8px 0" }}>📖 Intelligenz: {(char.totalStats ?? 0) * 0.14 >> 0}</div>
              <div style={{ margin: "8px 0" }}>🛡️ Ausdauer: {(char.totalStats ?? 0) * 0.28 >> 0}</div>
              <div style={{ margin: "8px 0" }}>🍀 Glück: {(char.totalStats ?? 0) * 0.24 >> 0}</div>
              <div style={{ fontSize: 12, color: PALETTE.textSoft }}>* Demo-Aufteilung aus Gesamtwerten berechnet</div>
            </SectionCard>
          )}

          {subtab === "totalstats" && (
            <SectionCard>
              <h3 style={{ marginTop: 0, color: PALETTE.title }}>Total Stats – {char.name}</h3>
              <div style={{ margin: "8px 0" }}>⚔️ Gesamtstärke: {(char.totalStats ?? 0) * 0.36 >> 0}</div>
              <div style={{ margin: "8px 0" }}>🏹 Gesamtgeschick: {(char.totalStats ?? 0) * 0.32 >> 0}</div>
              <div style={{ margin: "8px 0" }}>📖 Gesamtintelligenz: {(char.totalStats ?? 0) * 0.28 >> 0}</div>
              <div style={{ margin: "8px 0" }}>🛡️ Gesamtausdauer: {(char.totalStats ?? 0) * 0.52 >> 0}</div>
              <div style={{ margin: "8px 0" }}>🍀 Gesamtglück: {(char.totalStats ?? 0) * 0.26 >> 0}</div>
              <div style={{ fontSize: 12, color: PALETTE.textSoft }}>* Demo-Formeln – ersetze später durch echte</div>
            </SectionCard>
          )}

          {subtab === "fortress" && (
            <SectionCard>
              <h3 style={{ marginTop: 0, color: PALETTE.title }}>Festung</h3>
              <p style={{ color: PALETTE.textSoft }}>Fortress-Daten für {char.name} (Platzhalter).</p>
            </SectionCard>
          )}

          {subtab === "gems" && (
            <SectionCard>
              <h3 style={{ marginTop: 0, color: PALETTE.title }}>Edelsteine</h3>
              <p style={{ color: PALETTE.textSoft }}>Edelstein-Übersicht für {char.name} (Platzhalter).</p>
            </SectionCard>
          )}
        </div>
      )}

      {tab === "charts" && (
        <SectionCard>
          <div>📈 Level-Verlauf (L{level})</div>
          <div>📊 Scrapbook-Fortschritt ({scrapbook}%)</div>
        </SectionCard>
      )}

      {tab === "progress" && (
        <SectionCard>
          <h3 style={{ marginTop: 0, color: PALETTE.title }}>Fortschritt</h3>
          <p style={{ color: PALETTE.textSoft }}>
            Level- und Scrapbook-Entwicklung von {char.name} über die Zeit (Demo).
          </p>
        </SectionCard>
      )}

      {tab === "compare" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", background: "#1A2F4A", borderRadius: 6, overflow: "hidden" }}>
            <FilterButton value="manual">Manuell wählen</FilterButton>
            <FilterButton value="class">Klassen-Ranking</FilterButton>
            <FilterButton value="server">Server-Ranking</FilterButton>
            <FilterButton value="guild">Gilden-Ranking</FilterButton>
            <FilterButton value="top100">Top 100</FilterButton>
            <FilterButton value="top1000">Top 1000</FilterButton>
          </div>

          {/* Beispielhafte dynamische Karten */}
          {filter === "manual" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
              {[{ you: true, name: char.name, cls: char.className, lvl: char.level, srv: char.server },
                { you: false, name: "Spieler X", cls: "Mage", lvl: Math.max(char.level - 2, 1), srv: "EU 2" }].map((p, i) => (
                <div key={i} style={{ background: "#1A2F4A", padding: 15, borderRadius: 8, position: "relative" }}>
                  <h4 style={{ margin: "0 0 5px", color: PALETTE.title }}>
                    {p.you ? `${p.name} (Du)` : p.name}
                  </h4>
                  <div style={{ fontSize: 13, color: PALETTE.textSoft, marginBottom: 10 }}>
                    Level {p.lvl} • {p.cls} • Server {p.srv}
                  </div>
                  <div style={{ position: "absolute", top: 10, right: 15, fontSize: 12, color: PALETTE.textSoft }}>
                    Update: {p.you ? `${char.lastScanDays ?? 0}d` : "3d"}{" "}
                    <span
                      style={{
                        display: "inline-block", width: 12, height: 12, borderRadius: "50%",
                        background: p.you ? "#4CAF50" : "#FFEB3B", verticalAlign: "middle", marginLeft: 6,
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0", padding: 6, borderBottom: "1px solid #2D4E78" }}>
                    <span>⚔️ Stärke</span>
                    <span style={{ color: p.you ? "#4CAF50" : PALETTE.text }}>
                      {p.you ? ((char.totalStats ?? 0) * 0.36 >> 0) : ((char.totalStats ?? 50000) * 0.33 >> 0)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0", padding: 6, borderBottom: "1px solid #2D4E78" }}>
                    <span>🏹 Geschick</span>
                    <span style={{ color: p.you ? "#F44336" : "#4CAF50" }}>
                      {p.you ? ((char.totalStats ?? 0) * 0.32 >> 0) : ((char.totalStats ?? 50000) * 0.35 >> 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filter === "class" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
              {[{ you: true, name: char.name, cls: char.className, lvl: char.level, srv: char.server },
                { you: false, name: "Spieler A", cls: char.className, lvl: char.level + 1, srv: char.server }].map((p, i) => (
                <div key={i} style={{ background: "#1A2F4A", padding: 15, borderRadius: 8, position: "relative" }}>
                  <h4 style={{ margin: "0 0 5px", color: PALETTE.title }}>
                    {p.you ? `${p.name} (Du)` : p.name}
                  </h4>
                  <div style={{ fontSize: 13, color: PALETTE.textSoft, marginBottom: 10 }}>
                    Level {p.lvl} • {p.cls} • Server {p.srv}
                  </div>
                  <div style={{ position: "absolute", top: 10, right: 15, fontSize: 12, color: PALETTE.textSoft }}>
                    Update: {p.you ? `${char.lastScanDays ?? 0}d` : "4d"}{" "}
                    <span
                      style={{
                        display: "inline-block", width: 12, height: 12, borderRadius: "50%",
                        background: p.you ? "#4CAF50" : "#FF9800", verticalAlign: "middle", marginLeft: 6,
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0", padding: 6, borderBottom: "1px solid #2D4E78" }}>
                    <span>⚔️ Stärke</span>
                    <span>{p.you ? ((char.totalStats ?? 0) * 0.36 >> 0) : ((char.totalStats ?? 0) * 0.35 >> 0)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0", padding: 6, borderBottom: "1px solid #2D4E78" }}>
                    <span>🏹 Geschick</span>
                    <span style={{ color: p.you ? PALETTE.text : "#4CAF50" }}>
                      {p.you ? ((char.totalStats ?? 0) * 0.32 >> 0) : ((char.totalStats ?? 0) * 0.34 >> 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filter === "server" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
              {[{ you: true, name: char.name, cls: char.className, lvl: char.level, srv: char.server },
                { you: false, name: "Spieler B", cls: "Mage", lvl: char.level + 2, srv: char.server }].map((p, i) => (
                <div key={i} style={{ background: "#1A2F4A", padding: 15, borderRadius: 8, position: "relative" }}>
                  <h4 style={{ margin: "0 0 5px", color: PALETTE.title }}>
                    {p.you ? `${p.name} (Du)` : p.name}
                  </h4>
                  <div style={{ fontSize: 13, color: PALETTE.textSoft, marginBottom: 10 }}>
                    Level {p.lvl} • {p.cls} • Server {p.srv}
                  </div>
                  <div style={{ position: "absolute", top: 10, right: 15, fontSize: 12, color: PALETTE.textSoft }}>
                    Update: {p.you ? `${char.lastScanDays ?? 0}d` : "7d"}{" "}
                    <span
                      style={{
                        display: "inline-block", width: 12, height: 12, borderRadius: "50%",
                        background: p.you ? "#4CAF50" : "#F44336", verticalAlign: "middle", marginLeft: 6,
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0", padding: 6, borderBottom: "1px solid #2D4E78" }}>
                    <span>⚔️ Stärke</span>
                    <span>{p.you ? ((char.totalStats ?? 0) * 0.36 >> 0) : ((char.totalStats ?? 0) * 0.38 >> 0)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0", padding: 6, borderBottom: "1px solid #2D4E78" }}>
                    <span>🏹 Geschick</span>
                    <span>{p.you ? ((char.totalStats ?? 0) * 0.32 >> 0) : ((char.totalStats ?? 0) * 0.30 >> 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(filter === "top100" || filter === "top1000") && (
            <SectionCard>
              <div style={{ color: PALETTE.textSoft }}>
                {filter === "top100" ? `Top 100 – (Demo) für ${char.className} / ${char.server}` : `Top 1000 – (Demo) für ${char.className} / ${char.server}`}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {tab === "history" && (
        <SectionCard>
          <h3 style={{ marginTop: 0, color: PALETTE.title }}>Historie</h3>
          <p style={{ color: PALETTE.textSoft }}>
            Scan-Historie von {char.name}. Letzter Scan: {(char.lastScanDays ?? 0)} Tag(e) her.
          </p>
        </SectionCard>
      )}
    </FullBleed>
  );
}

// ---------- Hauptseite ----------
export default function PlayerProfile() {
  // aktive Quelle: own + favs gemerged
  const [own] = useState<Character[]>(DEMO_OWN);
  const [favs] = useState<Character[]>(DEMO_FAVS);
  const [activeId, setActiveId] = useState<string>(own[0]?.id ?? favs[0]?.id ?? "active");

  const favIds = useMemo(() => new Set(favs.map((f) => f.id)), [favs]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    const merged: Character[] = [];
    [...own, ...favs].forEach((c) => {
      if (!seen.has(c.id)) { seen.add(c.id); merged.push(c); }
    });
    return merged;
  }, [own, favs]);

  const active = useMemo(
    () =>
      all.find((c) => c.id === activeId) ??
      all[0] ??
      { id: "fallback", name: "Nox", className: "Demon Hunter", level: 500, guild: "Night Watch", server: "EU 1", scrapbookPct: 96.7, totalStats: 123456, lastScanDays: 2, activityScore: 82 },
    [all, activeId]
  );

  return (
    <div style={{ background: PALETTE.page, color: PALETTE.text, minHeight: "100vh" }}>
      {/* Header */}
      <div
        style={{
          position: "sticky", top: 0, zIndex: 2, background: "#0A1728", borderBottom: `1px solid ${PALETTE.line}`,
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <AvatarCircle label={active.name} size={36} />
          <div>
            <div style={{ fontSize: 18, color: PALETTE.title, fontWeight: 700 }}>{active.name}</div>
            <div style={{ fontSize: 12, color: PALETTE.textSoft }}>
              {active.className} • {active.guild} • {active.server}
            </div>
          </div>
        </div>
      </div>

      {/* Character Switcher – unter dem Header */}
      <CharacterSwitcher all={all} favIds={favIds} activeId={active.id} onPick={setActiveId} />

      {/* Contained Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        {/* Row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
          <StatTile label="Level" value={active.level ?? 500} hint="Main character shown first" />
          <StatTile label="Total Stats" value={(active.totalStats ?? 123456).toLocaleString()} />
          <StatTile label="Guild" value={active.guild ?? "Night Watch"} hint={active.server ?? "EU 1"} />
        </div>

        {/* Row 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16, marginTop: 16 }}>
          <div
            style={{
              gridColumn: "span 2", background: PALETTE.tileAlt, border: `1px solid ${PALETTE.line}`,
              borderRadius: 16, padding: 16,
            }}
          >
            <div style={{ color: PALETTE.title, fontWeight: 600, marginBottom: 8 }}>Comparison vs. Averages</div>
            <div style={{ color: PALETTE.textSoft, fontSize: 12, marginBottom: 8 }}>
              Benchmarks consider level, class, and server. (Demo values)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={{ border: `1px solid ${PALETTE.line}`, padding: "6px 10px", borderRadius: 12 }}>
                +8% DMG vs. class avg (L{active.level ?? 500})
              </span>
              <span style={{ border: `1px solid ${PALETTE.line}`, padding: "6px 10px", borderRadius: 12 }}>
                -3% HP vs. class avg
              </span>
              <span style={{ border: `1px solid ${PALETTE.line}`, padding: "6px 10px", borderRadius: 12 }}>
                Top 15% Scrapbook ({(active.scrapbookPct ?? 96.7).toFixed(1)}%)
              </span>
              <span style={{ border: `1px solid ${PALETTE.line}`, padding: "6px 10px", borderRadius: 12 }}>
                Top 10% Level gain (30d)
              </span>
            </div>
          </div>

          <div
            style={{
              background: PALETTE.tileAlt, border: `1px solid ${PALETTE.line}`, borderRadius: 16, padding: 16,
            }}
          >
            <div style={{ color: PALETTE.title, fontWeight: 600, marginBottom: 8 }}>Freshness & Activity</div>
            <div style={{ color: PALETTE.textSoft, fontSize: 12, marginBottom: 8 }}>
              Last scan: {(active.lastScanDays ?? 2).toString()} day(s) ago
            </div>
            <div style={{ height: 8, background: PALETTE.tile, border: `1px solid ${PALETTE.line}`, borderRadius: 99 }}>
              <div
                style={{
                  width: `${active.activityScore ?? 82}%`, height: "100%", borderRadius: 99,
                  background: `linear-gradient(90deg, ${PALETTE.active}, ${PALETTE.line})`,
                }}
              />
            </div>
            <div style={{ color: PALETTE.textSoft, fontSize: 12, marginTop: 4, textAlign: "right" }}>
              {active.activityScore ?? 82}%
            </div>
          </div>
        </div>

        {/* Row 3 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16, marginTop: 16 }}>
          <StatTile label="Class" value={active.className ?? "Demon Hunter"} />
          <StatTile label="Scrapbook" value={`${(active.scrapbookPct ?? 96.7).toFixed(1)}%`} />
          <StatTile label="Notes" value="Demo profile – static data" />
        </div>
      </div>

      {/* Full-bleed Legacy – jetzt dynamisch */}
      <LegacySectionNative char={active} />
    </div>
  );
}
