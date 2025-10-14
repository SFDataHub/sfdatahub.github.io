// src/pages/guilds/Profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import ContentShell from "../../components/ContentShell";
import { guildIconUrlByName } from "../../data/guilds";

const PALETTE = {
  tileAlt: "var(--tile, #14273E)",
  line: "var(--line, #2C4A73)",
  title: "var(--title, #F5F9FF)",
  textSoft: "var(--text-soft, #B0C4D9)",
  active: "var(--active, #2D4E78)",
};

type Guild = {
  id: string;
  name: string;
  server: string | null;
  memberCount: number | null;
  hofRank: number | null;
  lastScanDays: number | null;
};

function Container({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px", ...style }}>{children}</div>;
}

/** Transparentes Gilden-Icon (Drive) mit Drop-Shadow – analog zu Spieler-Icons */
function GuildIcon({ name, size = 36 }: { name: string | null | undefined; size?: number }) {
  const url = guildIconUrlByName(name, size * 2);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        background: "transparent",
        borderRadius: 8,
        overflow: "visible",
      }}
      aria-hidden
    >
      {url ? (
        <img
          src={url}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "transparent",
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.28))",
          }}
          onError={(ev) => {
            // Fallback: Emoji, falls Bild nicht geladen werden kann
            const parent = ev.currentTarget.parentElement;
            if (parent) parent.innerHTML = `<div style="font-size:${Math.round(
              size * 0.7
            )}px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.28))">🏰</div>`;
          }}
        />
      ) : (
        <div
          style={{
            fontSize: Math.round(size * 0.72),
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.28))",
          }}
        >
          🏰
        </div>
      )}
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
        boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ fontSize: 12, color: PALETTE.textSoft, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, color: PALETTE.title, fontWeight: 700 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: PALETTE.textSoft, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: PALETTE.tileAlt,
        padding: 15,
        borderRadius: 12,
        border: `1px solid ${PALETTE.line}`,
        boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {children}
    </div>
  );
}

// helpers
const toNum = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const daysSince = (tsSec?: number | null) => {
  if (!tsSec) return null;
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - tsSec);
  return Math.floor(diff / 86400);
};

const TABS = ["Übersicht", "Rankings", "Historie"] as const;
type TabKey = (typeof TABS)[number];

export default function GuildProfile() {
  const params = useParams<Record<string, string>>();
  const guildId = params.id || params.gid || params.guildId || params.guild || "";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [tab, setTab] = useState<TabKey>("Übersicht");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const id = guildId.trim();
        if (!id) {
          setErr("Keine Gilde gewählt.");
          setLoading(false);
          return;
        }
        const ref = doc(db, `guilds/${id}/latest/latest`);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setErr("Gilde nicht gefunden.");
          setLoading(false);
          return;
        }
        const d = snap.data() as any;

        const name = d.name ?? d.values?.Name ?? id;
        const server = d.server ?? d.values?.Server ?? null;
        const memberCount =
          toNum(d.memberCount ?? d.values?.["Guild Member Count"] ?? d.values?.GuildMemberCount) ?? null;
        const hofRank =
          toNum(
            d.hofRank ??
              d.values?.["Hall of Fame Rank"] ??
              d.values?.HoF ??
              d.values?.Rank ??
              d.values?.["Guild Rank"]
          ) ?? null;
        const lastScanDays = daysSince(toNum(d.timestamp));

        const g: Guild = { id, name, server, memberCount, hofRank, lastScanDays };
        if (!cancelled) setGuild(g);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Fehler beim Laden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const NotFound = useMemo(
    () => (
      <div style={{ padding: 24, color: PALETTE.textSoft }}>
        {err ?? "Unbekannter Fehler."}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => navigate("/")}
            style={{
              padding: "8px 12px",
              background: PALETTE.active,
              border: "none",
              color: "#fff",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Zur Startseite
          </button>
        </div>
      </div>
    ),
    [err, navigate]
  );

  const Skeleton = <div style={{ padding: 16, color: PALETTE.textSoft }}>Lade Gildenprofil…</div>;

  const TabsBar = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: `1px solid ${PALETTE.line}`,
        marginTop: 16,
      }}
      role="tablist"
      aria-label="Gildenprofil Tabs"
    >
      {TABS.map((t) => {
        const active = t === tab;
        return (
          <button
            key={t}
            role="tab"
            aria-selected={active}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${active ? PALETTE.active : "transparent"}`,
              background: active ? "rgba(45,78,120,0.35)" : "transparent",
              color: PALETTE.title,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );

  const TabContent = (
    <div style={{ marginTop: 12 }}>
      {tab === "Übersicht" && (
        <SectionCard>
          <div style={{ color: PALETTE.textSoft }}>
            Platzhalter <b>Übersicht</b> – später: Mitgliederliste, Aktivität, Gildenbeschreibung.
          </div>
        </SectionCard>
      )}
      {tab === "Rankings" && (
        <SectionCard>
          <div style={{ color: PALETTE.textSoft }}>
            Platzhalter <b>Rankings</b> – Server-/Global-Ränge, Entwicklung.
          </div>
        </SectionCard>
      )}
      {tab === "Historie" && (
        <SectionCard>
          <div style={{ color: PALETTE.textSoft }}>
            Platzhalter <b>Historie</b> – wöchentliche / monatliche Aggregationen.
          </div>
        </SectionCard>
      )}
    </div>
  );

  const content =
    loading ? (
      Skeleton
    ) : !guild ? (
      NotFound
    ) : (
      <>
        {/* Sticky Header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: "transparent",
            borderBottom: `1px solid ${PALETTE.line}`,
          }}
        >
          <Container style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            {/* Transparentes Gilden-Icon mit Shadow (Drive) */}
            <GuildIcon name={guild.name} size={36} />
            <div>
              <div style={{ fontSize: 18, color: PALETTE.title, fontWeight: 700 }}>{guild.name}</div>
              <div style={{ fontSize: 12, color: PALETTE.textSoft }}>
                {guild.server ?? "Server ?"} •{" "}
                {guild.memberCount != null ? `${guild.memberCount} Mitglieder` : "Mitglieder ?"}{" "}
                {guild.hofRank != null ? `• HoF #${guild.hofRank}` : ""}
              </div>
            </div>
          </Container>
        </div>

        {/* Kopf + KPIs */}
        <Container style={{ paddingTop: 12, paddingBottom: 24 }}>
          <div
            style={{
              background: PALETTE.tileAlt,
              padding: 15,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: `1px solid ${PALETTE.line}`,
              boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: PALETTE.title, fontSize: 24, fontWeight: 800 }}>{guild.name}</h2>
              <div style={{ marginTop: 6, color: PALETTE.textSoft, fontSize: 13 }}>
                {guild.server ?? "Server ?"} •{" "}
                {guild.memberCount != null ? `${guild.memberCount} Mitglieder` : "Mitglieder ?"}{" "}
                {guild.hofRank != null ? `• HoF #${guild.hofRank}` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 13 }}>
              <span style={{ color: PALETTE.textSoft }}>
                Zuletzt aktualisiert: {guild.lastScanDays ?? 0} Tag(e) her
              </span>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "#4CAF50",
                  marginLeft: 8,
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16, marginTop: 16 }}>
            <StatTile label="Mitglieder" value={guild.memberCount ?? "?"} />
            <StatTile label="HoF-Rang" value={guild.hofRank != null ? `#${guild.hofRank}` : "?"} />
            <StatTile label="Server" value={guild.server ?? "—"} />
          </div>

          {/* Tabs & Panels */}
          {TabsBar}
          {TabContent}
        </Container>
      </>
    );

  return (
    <ContentShell title="Gildenprofil" subtitle="Gilde, KPIs & Verlauf" centerFramed={false} padded>
      {content}
    </ContentShell>
  );
}
