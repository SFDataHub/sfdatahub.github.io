import React, { useMemo, useState } from "react";

/**
 * PlayerProfile – contained layout (kein full-bleed mehr)
 * - Einheitlicher Container (maxWidth 1200px, padding 0 16px) für:
 *   Header, Switcher, KPI-Tiles, Tabs und Inhalte
 * - Keine 50vw/negative margins → Tabs & Header fluchten sauber
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
function Container({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px", ...style }}>
      {children}
    </div>
  );
}

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

// ---------- Switcher ----------
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
      <Container style={{ padding: "10px 16px 8px" }}>
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
      </Container>
    </div>
  );
}

// ---------- Tabs + Inhalte (contained) ----------
function ProfileTabs({ char }: { char: Character }) {
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

  const level = char.level ?? 0;
  const scrapbook = (char.scrapbookPct ?? 0).toFixed(1);

  return (
    <Container style={{ paddingTop: 12, paddingBottom: 24 }}>
      {/* Kopfbereich */}
      <div
        style={{
          background: PALETTE.tileAlt, padding: 15, borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: PALETTE.title, fontSize: 24, fontWeight: 800 }}>{char.name}</h2>
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

      {/* Inhalte (reduziert) */}
      <SectionCard>
        <div>📈 Level-Verlauf (L{level})</div>
        <div>📊 Scrapbook-Fortschritt ({scrapbook}%)</div>
      </SectionCard>
    </Container>
  );
}

// ---------- Hauptseite ----------
export default function PlayerProfile() {
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
      {/* Sticky Header im gleichen Container */}
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "#0A1728", borderBottom: `1px solid ${PALETTE.line}` }}>
        <Container style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <AvatarCircle label={active.name} size={36} />
          <div>
            <div style={{ fontSize: 18, color: PALETTE.title, fontWeight: 700 }}>{active.name}</div>
            <div style={{ fontSize: 12, color: PALETTE.textSoft }}>
              {active.className} • {active.guild} • {active.server}
            </div>
          </div>
        </Container>
      </div>

      {/* Character Switcher */}
      <CharacterSwitcher all={all} favIds={favIds} activeId={active.id} onPick={setActiveId} />

      {/* KPIs */}
      <Container style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
          <StatTile label="Level" value={active.level ?? 500} hint="Main character shown first" />
          <StatTile label="Total Stats" value={(active.totalStats ?? 123456).toLocaleString()} />
          <StatTile label="Guild" value={active.guild ?? "Night Watch"} hint={active.server ?? "EU 1"} />
        </div>
      </Container>

      {/* Tabs & Inhalte (contained) */}
      <ProfileTabs char={active} />
    </div>
  );
}
