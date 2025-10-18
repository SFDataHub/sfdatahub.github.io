// src/pages/guilds/Profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import ContentShell from "../../components/ContentShell";
import { db } from "../../lib/firebase";
import { guildIconUrlByName } from "../../data/guilds";

// Mitglieder-Browser (unverändert verwenden)
import { GuildMemberBrowser } from "../../components/guild-members";

/* Farben wie auf deinen Screens */
const C = {
  tile: "#152A42",
  tileAlt: "#14273E",
  line: "#2B4C73",
  title: "#F5F9FF",
  soft: "#B0C4D9",
  header: "#1E3657",
  icon: "#5C8BC6",
};

type Guild = {
  id: string;
  name: string;
  server: string | null;
  memberCount: number | null;
  hofRank: number | null;
  lastScanDays: number | null;
};

type MemberSummary = {
  id: string;
  name: string | null;
  class: string | null;       // Rohwert
  role: string | null;        // Rohwert
  level: number | null;
  treasury: number | null;
  mine: number | null;
  baseMain: number | null;
  conBase: number | null;
  sumBaseTotal: number | null;
  attrTotal: number | null;
  conTotal: number | null;
  totalStats: number | null;
  lastScan: string | null;      // Roh-String
  lastActivity: string | null;  // Roh-String
  lastScanMs: number | null;    // intern
  lastActivityMs: number | null;// intern
};

type MembersSnapshot = {
  guildId: string;
  updatedAt: string;     // Roh-String, Anzeige
  updatedAtMs: number;   // intern
  count: number;
  hash: string;
  // Averages (Root)
  avgLevel?: number | null;
  avgTreasury?: number | null;
  avgMine?: number | null;
  avgBaseMain?: number | null;
  avgConBase?: number | null;
  avgSumBaseTotal?: number | null;
  avgAttrTotal?: number | null;
  avgConTotal?: number | null;
  avgTotalStats?: number | null;
  // Liste
  members: MemberSummary[];
};

/* kleine Utils */
const toNum = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const daysSince = (tsSec?: number | null) => {
  if (!tsSec) return null;
  const diff = Math.max(0, Date.now() / 1000 - tsSec);
  return Math.floor(diff / 86400);
};

/* Mini-Bausteine */
function Section({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl shadow-lg"
      style={{ background: C.tile, border: `1px solid ${C.line}` }}
    >
      {(title || right) && (
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: C.line }}
        >
          <div className="text-sm tracking-wide uppercase" style={{ color: C.soft }}>
            {title}
          </div>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="opacity-80">{k}</span>
      <span className="font-semibold" style={{ color: C.title }}>
        {v}
      </span>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="h-64 w-full">
      <div className="flex items-end gap-4 h-full w-full">
        {data.map((d) => (
          <div
            key={d.label}
            className="flex flex-col items-center gap-2"
            style={{ width: `${100 / data.length}%` }}
          >
            <div className="w-full rounded-t-md" style={{ height: `${(d.value / max) * 90}%`, background: C.icon }} />
            <div className="text-[11px] text-center leading-tight opacity-80 select-none rotate-45 origin-top-left" style={{ transform: "rotate(45deg)" }}>
              {d.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Left Rail */
function LeftRail({ guild }: { guild: Guild }) {
  const emblemUrl = guildIconUrlByName(guild.name, 800);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-3" style={{ borderColor: C.line, background: C.tile }}>
        <div
          className="w-full"
          style={{
            aspectRatio: "3 / 4",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: C.tileAlt,
            border: `1px solid ${C.line}`,
            overflow: "hidden",
          }}
        >
          {emblemUrl ? (
            <img
              src={emblemUrl}
              alt=""
              className="max-h-full max-w-full"
              style={{
                objectFit: "contain",
                filter:
                  "drop-shadow(0 2px 3px rgba(0,0,0,.45)) drop-shadow(0 8px 16px rgba(0,0,0,.35))",
              }}
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
            />
          ) : (
            <div className="text-6xl">🏰</div>
          )}
        </div>
      </div>

      <Section title="GILDEN INFO">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <StatRow k="Mitglieder" v={guild.memberCount ?? "—"} />
          <StatRow k="HoF-Rang" v={guild.hofRank != null ? `#${guild.hofRank}` : "—"} />
          <StatRow k="Server" v={guild.server ?? "—"} />
          <StatRow k="Inaktiv" v="0" />
          <StatRow k="Aktivität" v="100%" />
        </div>
      </Section>
    </div>
  );
}

/* Right Rail */
function RightRail() {
  const CLASS_BARS = [
    { label: "Bard", value: 5 },
    { label: "Demon Hunter", value: 8 },
    { label: "Battle Mage", value: 3 },
    { label: "Berserker", value: 16 },
    { label: "Warrior", value: 4 },
    { label: "Scout", value: 8 },
    { label: "Mage", value: 2 },
    { label: "Druid", value: 3 },
    { label: "Paladin", value: 1 },
  ];
  return (
    <div className="space-y-4">
      <Section right={<div className="text-xs opacity-70">Class Distribution</div>}>
        <BarChart data={CLASS_BARS} />
      </Section>
      <Section>
        <div className="text-center text-sm opacity-80">ø</div>
      </Section>
    </div>
  );
}

export default function GuildProfile() {
  const params = useParams<Record<string, string>>();
  const guildId = params.id || params.gid || params.guildId || params.guild || "";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [guild, setGuild] = useState<Guild | null>(null);

  // NEU: Snapshot-State
  const [snapshot, setSnapshot] = useState<MembersSnapshot | null>(null);

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

        // 1) Guild-Latest (bestehend) für Header/Kacheln
        const refLatest = doc(db, `guilds/${id}/latest/latest`);
        const snapLatest = await getDoc(refLatest);
        if (!snapLatest.exists()) {
          setErr("Gilde nicht gefunden.");
          setLoading(false);
          return;
        }
        const d = snapLatest.data() as any;
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

        // 2) NEU: Snapshot laden (1 Read) – Mitgliederliste & Averages
        const refSnap = doc(db, `guilds/${id}/snapshots/members_summary`);
        const snap = await getDoc(refSnap);
        if (snap.exists() && !cancelled) {
          const sdata = snap.data() as any;
          const s: MembersSnapshot = {
            guildId: String(sdata.guildId ?? id),
            updatedAt: String(sdata.updatedAt ?? d.values?.Timestamp ?? ""),
            updatedAtMs: Number(sdata.updatedAtMs ?? d.timestamp * 1000 ?? 0),
            count: Number(sdata.count ?? 0),
            hash: String(sdata.hash ?? ""),

            avgLevel: sdata.avgLevel ?? null,
            avgTreasury: sdata.avgTreasury ?? null,
            avgMine: sdata.avgMine ?? null,
            avgBaseMain: sdata.avgBaseMain ?? null,
            avgConBase: sdata.avgConBase ?? null,
            avgSumBaseTotal: sdata.avgSumBaseTotal ?? null,
            avgAttrTotal: sdata.avgAttrTotal ?? null,
            avgConTotal: sdata.avgConTotal ?? null,
            avgTotalStats: sdata.avgTotalStats ?? null,

            members: Array.isArray(sdata.members) ? (sdata.members as MemberSummary[]) : [],
          };
          setSnapshot(s);
        }
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

  const membersForList = useMemo<MemberSummary[]>(
    () => snapshot?.members ?? [],
    [snapshot]
  );

  if (loading) {
    return (
      <ContentShell title="Gildenprofil" subtitle="Gilde, KPIs & Verlauf" centerFramed>
        <div className="text-sm" style={{ color: C.soft }}>Lade Gildenprofil…</div>
      </ContentShell>
    );
  }

  if (!guild) {
    return (
      <ContentShell title="Gildenprofil" subtitle="Gilde, KPIs & Verlauf" centerFramed>
        <div className="text-sm" style={{ color: C.soft }}>
          {err ?? "Unbekannter Fehler."}
          <div className="mt-3">
            <button
              onClick={() => navigate("/")}
              className="rounded-xl px-3 py-2 text-white"
              style={{ background: "#2D4E78" }}
            >
              Zur Startseite
            </button>
          </div>
        </div>
      </ContentShell>
    );
  }

  /* ============ ZWEITER HEADER (Server • Name zentriert • Zuletzt aktualisiert) ============ */
  const SecondHeader = (
    <div className="mt-2">
      <div className="px-6">
        <div
          className="flex items-center justify-between gap-3"
          style={{
            paddingTop: 10,
            paddingBottom: 10,
            borderTop: `1px solid ${C.line}`,
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* LINKS: Server */}
          <div className="min-w-[120px]">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: C.tile, border: `1px solid ${C.line}`, color: C.title }}
            >
              {guild.server ?? "S?.EU"}
            </span>
          </div>

          {/* MITTE: Name */}
          <div className="flex-1 text-center">
            <div className="font-extrabold" style={{ color: C.title, fontSize: 26, lineHeight: 1.15 }}>
              {guild.name}
            </div>
          </div>

          {/* RECHTS: Zuletzt aktualisiert – Roh-String aus Snapshot */}
          <div className="min-w-[220px] text-right text-xs" style={{ color: C.soft }}>
            Zuletzt aktualisiert:&nbsp;
            {snapshot?.updatedAt ? snapshot.updatedAt : "—"}{" "}
            <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#4CAF50" }} />
          </div>
        </div>

        {/* Divider-Linie unten */}
        <div
          style={{
            height: 1,
            background: C.line,
            opacity: 0.9,
            marginTop: 4,
            marginBottom: 20,
            position: "relative",
            zIndex: 2,
          }}
        />
      </div>
    </div>
  );

  /* ====================== PAGE CONTENT ====================== */
  return (
    <ContentShell
      title="Gildenprofil"
      subtitle="Gilde, KPIs & Verlauf"
      centerFramed={false}
    >
      {SecondHeader}

      <div className="px-6 pb-8">
        <div className="grid grid-cols-12 gap-4">
          {/* Left 3/12 */}
          <div className="col-span-12 md:col-span-3">
            <LeftRail guild={guild} />
          </div>

          {/* Center 6/12 */}
          <div className="col-span-12 md:col-span-6 space-y-4">
            {/* KPI-Zeile – nutzt Averages aus Snapshot, wenn vorhanden */}
            <Section>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 text-sm">
                <StatRow k="ø Treasury" v={snapshot?.avgTreasury ?? "—"} />
                <StatRow k="# on Server" v={1} />
                <StatRow k="ø Mine" v={snapshot?.avgMine ?? "—"} />
                <StatRow k="# in Europe" v={6} />
                <StatRow k="ø level" v={snapshot?.avgLevel ?? "—"} />
              </div>
            </Section>

            {/* Base Stats */}
            <Section title="BASE STATS">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* links */}
                <div>
                  <div
                    className="rounded-xl p-4"
                    style={{ background: C.tileAlt, border: `1px solid ${C.line}` }}
                  >
                    <StatRow k="player in Top 100 on Server" v={41} />
                    <StatRow k="player in Top 100 each class" v={42} />
                    <StatRow k="player in Top 1000" v={45} />
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      className="px-4 py-2 rounded-xl text-sm text-white"
                      style={{ background: C.header, border: `1px solid ${C.line}` }}
                    >
                      highest in ..
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="opacity-80 mb-1">Main</div>
                      <div className="font-semibold" style={{ color: C.title }}>
                        {snapshot?.avgBaseMain ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="opacity-80 mb-1">Con</div>
                      <div className="font-semibold" style={{ color: C.title }}>
                        {snapshot?.avgConBase ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="opacity-80 mb-1">Sum Base Stats</div>
                      <div className="font-semibold" style={{ color: C.title }}>
                        {snapshot?.avgSumBaseTotal ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* rechts */}
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="opacity-80">Top Player</div>
                      <div className="font-semibold" style={{ color: C.title }}>
                        {/* Platzhalter – später aus Snapshot ableiten */}
                        —
                      </div>
                    </div>
                    <div>
                      <div className="opacity-80">2nd</div>
                      <div className="font-semibold" style={{ color: C.title }}>
                        —
                      </div>
                    </div>
                    <div>
                      <div className="opacity-80">3rd</div>
                      <div className="font-semibold" style={{ color: C.title }}>
                        —
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-xl p-4"
                    style={{ background: C.tileAlt, border: `1px solid ${C.line}` }}
                  >
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="opacity-80">⌀</div>
                      <div className="text-right opacity-80">—</div>
                      <div>Main</div>
                      <div className="text-right font-semibold" style={{ color: C.title }}>
                        {snapshot?.avgAttrTotal ?? "—"}
                      </div>
                      <div>Con</div>
                      <div className="text-right font-semibold" style={{ color: C.title }}>
                        {snapshot?.avgConTotal ?? "—"}
                      </div>
                      <div>Total Stats</div>
                      <div className="text-right font-semibold" style={{ color: C.title }}>
                        {snapshot?.avgTotalStats ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Players joined/left – ÜBER den Tabs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Section title="PLAYER JOINED">
                <div className="text-sm opacity-70">—</div>
              </Section>
              <Section title="PLAYER LEFT">
                <div className="text-sm opacity-70">—</div>
              </Section>
            </div>

            {/* Tabs */}
            <Tabs members={membersForList} updatedAtMs={snapshot?.updatedAtMs ?? null} />
          </div>

          {/* Right 3/12 */}
          <div className="col-span-12 md:col-span-3">
            <RightRail />
          </div>
        </div>
      </div>
    </ContentShell>
  );
}

/* Tabs */
function Tabs({
  members,
  updatedAtMs,
}: {
  members: MemberSummary[];
  updatedAtMs: number | null;
}) {
  const [tab, setTab] = useState<"Übersicht" | "Rankings" | "Historie">("Übersicht");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b" style={{ borderColor: C.line }} role="tablist">
        {(["Übersicht", "Rankings", "Historie"] as const).map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                border: `1px solid ${active ? C.header : "transparent"}`,
                background: active ? "rgba(45,78,120,0.35)" : "transparent",
                color: C.title,
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <Section>
        {tab === "Übersicht" ? (
          // WICHTIG: Mitgliederliste bekommt jetzt die Snapshot-Members (1 Read) statt mock data
          <GuildMemberBrowser
            members={members}
            defaultView="list"
            defaultSort={{ key: "level", dir: "desc" }}
            // Hinweis für Schritt C · Teil 2:
            // Beim Klick werden wir docId = floor(updatedAtMs/1000) verwenden,
            // um players/{playerId}/scans/{docId} zu lesen (nur wenn nötig).
            // Anzeige von lastScan/lastActivity bleibt Roh-String.
          />
        ) : (
          <div className="text-sm" style={{ color: C.soft }}>
            Platzhalter <b>{tab}</b> – später: Mitgliederliste, Aktivität, Gildenbeschreibung / Ränge / Historie.
          </div>
        )}
      </Section>
    </div>
  );
}
