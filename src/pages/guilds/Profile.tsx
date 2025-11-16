// src/pages/guilds/Profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import ContentShell from "../../components/ContentShell";
import { db } from "../../lib/firebase";
import { guildIconUrlByName } from "../../data/guilds";

// Mitglieder-Browser
import { GuildMemberBrowser } from "../../components/guilds/guild-tabs/guild-members";

// Broadcast-Tile
import GuildBaseStatsBroadcastTile from "../../components/guilds/GuildBaseStatsBroadcastTile";

// Neuer Container-Tab (Firebase-verdrahtet)
import GuildMonthlyProgressTabContainer from "../../components/guilds/guild-tabs/GuildMonthlyProgressTab/GuildMonthlyProgressTabContainer";

// Mittel-Block (ausgelagert)
import GuildProfileInfo from "../../components/guilds/GuildProfileInfo/GuildProfileInfo";
import type {
  MembersSnapshotLike,
  GuildLike,
  MemberSummaryLike,
} from "../../components/guilds/GuildProfileInfo/GuildProfileInfo.types";
import type { Member as GuildMember } from "../../components/guilds/guild-tabs/guild-members/types";

// Right-Rail: einzelne Views (nicht verändern)
import ClassCrestGrid from "../../components/guilds/GuildClassOverview/ClassCrestGrid";
import ClassDonut from "../../components/guilds/GuildClassOverview/ClassDonut";

// Utils exakt wie im Container genutzt
import { adaptClassMeta } from "../../components/guilds/GuildClassOverview/utils";
import { CLASSES } from "../../data/classes";

// Globale HUD-Tabs (nur Seitencode)
import HudLabel from "../../components/ui/hud/HudLabel";

const C = {
  tile: "#152A42",
  tileAlt: "#14273E",
  line: "#2B4C73",
  title: "#F5F9FF",
  soft: "#B0C4D9",
  header: "#1E3657",
  icon: "#5C8BC6",
};

type Guild = GuildLike;
type MemberSummary = GuildMember;
type MembersSnapshot = MembersSnapshotLike;

const normalizeMember = (entry: MemberSummaryLike): MemberSummary => ({
  id: entry.id,
  name: entry.name ?? "Unknown",
  class: entry.class ?? "Unknown",
  role: entry.role ?? "Unknown",
  level: entry.level ?? undefined,
  scrapbook: undefined,
  lastOnline: entry.lastActivityMs ?? null,
  server: null,
  baseStats: {
    main: entry.baseMain ?? undefined,
    con: entry.conBase ?? undefined,
    sumBaseTotal: entry.sumBaseTotal ?? undefined,
  },
  totalStats: entry.totalStats ?? undefined,
  values: {
    treasury: entry.treasury ?? undefined,
    mine: entry.mine ?? undefined,
    attrTotal: entry.attrTotal ?? undefined,
    conTotal: entry.conTotal ?? undefined,
    lastScan: entry.lastScan ?? undefined,
    lastActivity: entry.lastActivity ?? undefined,
  },
});

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

function LeftRail({ guild }: { guild: Guild }) {
  const emblemUrl = guildIconUrlByName(guild.name, 800);
  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border p-3"
        style={{ borderColor: "transparent", background: "transparent" }}
      >
        <div
          className="w-full mx-auto max-w-[480px]"
          style={{
            aspectRatio: "3 / 4",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "1px solid transparent",
            overflow: "hidden",
          }}
        >
          {emblemUrl ? (
            <img
              src={emblemUrl}
              alt=""
              className="max-h-full max-w-full"
              style={{
                maxHeight: "115%",
                maxWidth: "115%",
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

export default function GuildProfile() {
  const params = useParams<Record<string, string>>();
  const guildId = params.id || params.gid || params.guildId || params.guild || "";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [snapshot, setSnapshot] = useState<MembersSnapshot | null>(null);

  // Right-Rail Umschalter (Tabs)
  const [rightView, setRightView] = useState<"grid" | "donut">("grid");

  // WICHTIG: classMeta wie im Container erstellen
  const safeMeta = useMemo(
    () =>
      (Array.isArray(CLASSES) ? (CLASSES as any[]) : [])
        .map(adaptClassMeta)
        .filter(Boolean),
    []
  );

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

        // Latest-Gildeninfo
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

        // Members-Snapshot (falls vorhanden)
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
            members: Array.isArray(sdata.members)
              ? (sdata.members as MemberSummaryLike[])
              : [],
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
    () => (snapshot?.members ?? []).map((m) => normalizeMember(m)),
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
          <div className="min-w-[120px]">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: C.tile, border: `1px solid ${C.line}`, color: C.title }}
            >
              {guild.server ?? "S?.EU"}
            </span>
          </div>
          <div className="flex-1 text-center">
            <div className="font-extrabold" style={{ color: C.title, fontSize: 26, lineHeight: 1.15 }}>
              {guild.name}
            </div>
          </div>
          <div className="min-w-[220px] text-right text-xs" style={{ color: C.soft }}>
            Zuletzt aktualisiert:&nbsp;
            {snapshot?.updatedAt ? snapshot.updatedAt : "—"}{" "}
            <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#4CAF50" }} />
          </div>
        </div>
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

  return (
    <ContentShell title="Gildenprofil" subtitle="Gilde, KPIs & Verlauf" centerFramed={false}>
      {SecondHeader}

      <div className="px-6 pb-8">
        <div className="grid grid-cols-12 gap-4">
          {/* LEFT RAIL */}
          <div className="col-span-12 md:col-span-3">
            <LeftRail guild={guild} />
          </div>

          {/* MITTELSPALTE */}
          <div className="col-span-12 md:col-span-6 space-y-4">
            <GuildProfileInfo
              guild={guild}
              snapshot={snapshot}
              emblemUrl={guildIconUrlByName(guild.name, 512) || undefined}
              colors={C}
            />

            <div className="flex justify-center">
              <div className="w-full max-w-[980px]">
                <GuildBaseStatsBroadcastTile
                  guildName={guild.name}
                  server={guild.server ?? "—"}
                  emblemUrl={guildIconUrlByName(guild.name, 512) || undefined}
                  lastScanISO={snapshot?.updatedAtMs ? new Date(snapshot.updatedAtMs).toISOString() : undefined}
                  members={guild.memberCount ?? 0}
                  avgLevel={snapshot?.avgLevel ?? 0}
                  totalPower={snapshot?.avgTotalStats ?? undefined}
                  tickerItems={
                    snapshot?.updatedAt
                      ? [`Updated ${snapshot.updatedAt}`, `Members ${guild.memberCount ?? 0}`]
                      : undefined
                  }
                />
              </div>
            </div>

            <Tabs
              members={membersForList}
              guildId={guild.id}
              guildName={guild.name}
              guildServer={guild.server}
            />
          </div>

          {/* RIGHT RAIL */}
          <div className="col-span-12 md:col-span-3">
            {/* Tabs (nur Buttons über der ersten Komponente) */}
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setRightView("grid")} aria-label="Klassenübersicht">
                <HudLabel text="Klassenübersicht" tone={rightView === "grid" ? "accent" : "default"} />
              </button>
              <button onClick={() => setRightView("donut")} aria-label="Klassenverteilung">
                <HudLabel text="Klassenverteilung" tone={rightView === "donut" ? "accent" : "default"} />
              </button>
            </div>

            {/* Umschalten zwischen den zwei vorhandenen Komponenten – ohne Extra-Container */}
            {rightView === "grid" ? (
              <ClassCrestGrid
                data={membersForList}
                classMeta={safeMeta as any}
                onPickClass={(id) => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("tab", "Übersicht");
                  url.searchParams.set("class", id);
                  window.location.href = url.toString();
                }}
              />
            ) : (
              <ClassDonut data={membersForList} classMeta={safeMeta as any} />
            )}
          </div>
          {/* /RIGHT RAIL */}
        </div>
      </div>
    </ContentShell>
  );
}

function Tabs({
  members,
  guildId,
  guildName,
  guildServer,
}: {
  members: MemberSummary[];
  guildId: string;
  guildName: string;
  guildServer: string | null;
}) {
  const [tab, setTab] = useState<"Übersicht" | "Rankings" | "Monthly Progress" | "Historie">("Übersicht");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b" style={{ borderColor: C.line }} role="tablist">
        {(["Übersicht", "Rankings", "Monthly Progress", "Historie"] as const).map((t) => {
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
        {tab === "Übersicht" && (
          <GuildMemberBrowser
            members={members}
            defaultView="list"
            defaultSort={{ key: "level", dir: "desc" }}
          />
        )}

        {tab === "Rankings" && (
          <div className="text-sm" style={{ color: C.soft }}>
            Platzhalter <b>Rankings</b> – Inhalt folgt.
          </div>
        )}

        {tab === "Monthly Progress" && (
          <GuildMonthlyProgressTabContainer
            guildId={guildId}
            guildName={guildName}
            guildServer={guildServer}
          />
        )}

        {tab === "Historie" && (
          <div className="text-sm" style={{ color: C.soft }}>
            Platzhalter <b>Historie</b> – Inhalt folgt.
          </div>
        )}
      </Section>
    </div>
  );
}


