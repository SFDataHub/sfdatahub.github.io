// src/pages/guilds/Profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import ContentShell from "../../components/ContentShell";
import { db } from "../../lib/firebase";
import { guildIconUrlByIdentifier } from "../../data/guilds";
import {
  beginReadScope,
  endReadScope,
  traceGetDoc,
  type FirestoreTraceScope,
} from "../../lib/debug/firestoreReadTrace";

// Mitglieder-Browser
import { GuildMemberBrowser } from "../../components/guilds/guild-tabs/guild-members";

// Neuer Container-Tab (Firebase-verdrahtet)
import GuildMonthlyProgressTabContainer from "../../components/guilds/guild-tabs/GuildMonthlyProgressTab/GuildMonthlyProgressTabContainer";

import type {
  MembersSnapshotLike,
  GuildLike,
  MemberSummaryLike,
} from "../../components/guilds/GuildProfileInfo/GuildProfileInfo.types";
import GuildHeroPanel, { type GuildHeroPanelData } from "../../components/guilds/GuildHeroPanel";
import type { Member as GuildMember } from "../../components/guilds/guild-tabs/guild-members/types";

// Utils exakt wie im Container genutzt
import { adaptClassMeta } from "../../components/guilds/GuildClassOverview/utils";
import { CLASSES } from "../../data/classes";
import { readTtlCache, writeTtlCache } from "../../lib/cache/localStorageTtl";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";

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
type GuildProfileLoadResult = {
  guild: Guild;
  snapshot: MembersSnapshot | null;
};
type GuildProfileProps = {
  heroOnly?: boolean;
};
type GuildProfileCacheValue = { cachedAt: number; data: GuildProfileLoadResult };
const guildProfileInFlight = new Map<string, Promise<GuildProfileLoadResult>>();
const guildProfileMemory = new Map<string, GuildProfileCacheValue>();

const GUILD_CACHE_PREFIX = "sf_profile_guild__";
const GUILD_SERVER_INDEX_KEY = "sf_profile_guild_server_index";
const GUILD_CACHE_TTL_MS = 60 * 60 * 1000;

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

export default function GuildProfile({ heroOnly = false }: GuildProfileProps) {
  const params = useParams<Record<string, string>>();
  const guildId = params.id || params.gid || params.guildId || params.guild || "";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [snapshot, setSnapshot] = useState<MembersSnapshot | null>(null);

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
      const id = guildId.trim();
      if (!id) {
        setErr("Keine Gilde gewaehlt.");
        setLoading(false);
        return;
      }

      const readServerIndex = (): Record<string, string> => {
        if (typeof window === "undefined") return {};
        try {
          const raw = window.localStorage.getItem(GUILD_SERVER_INDEX_KEY);
          if (!raw) return {};
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
        } catch {
          return {};
        }
      };

      const cachedServer = readServerIndex()[id];
      const cacheKey = cachedServer ? `${GUILD_CACHE_PREFIX}${cachedServer}__${id}` : null;

      if (cacheKey) {
        const mem = guildProfileMemory.get(cacheKey);
        if (mem) {
          if (Date.now() - mem.cachedAt < GUILD_CACHE_TTL_MS) {
            if (!cancelled) {
              setGuild(mem.data.guild);
              setSnapshot(mem.data.snapshot);
              setLoading(false);
            }
            return;
          } else {
            guildProfileMemory.delete(cacheKey);
          }
        }
      }

      if (cacheKey) {
        const cached = readTtlCache(cacheKey, GUILD_CACHE_TTL_MS);
        if (cached && typeof cached === "object") {
          const data = cached as GuildProfileLoadResult;
          guildProfileMemory.set(cacheKey, { cachedAt: Date.now(), data });
          if (!cancelled) {
            setGuild(data.guild);
            setSnapshot(data.snapshot);
            setLoading(false);
          }
          return;
        }
      }

      const fetchProfile = async (): Promise<GuildProfileLoadResult> => {
        let scope: FirestoreTraceScope = null;
        try {
          scope = beginReadScope("GuildProfile:load");

          const refLatest = doc(db, `guilds/${id}/latest/latest`);
          const snapLatest = await traceGetDoc(scope, refLatest, () => getDoc(refLatest));
          if (!snapLatest.exists()) {
            throw new Error("Gilde nicht gefunden.");
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
          let nextSnapshot: MembersSnapshot | null = null;

          const refSnap = doc(db, `guilds/${id}/snapshots/members_summary`);
          const snap = await traceGetDoc(scope, refSnap, () => getDoc(refSnap));
          if (snap.exists()) {
            const sdata = snap.data() as any;
            nextSnapshot = {
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
          }

          return { guild: g, snapshot: nextSnapshot };
        } finally {
          endReadScope(scope);
        }
      };

      const inFlightKey = cacheKey ?? id.toLowerCase();
      const existing = guildProfileInFlight.get(inFlightKey);
      const promise = existing ?? fetchProfile();
      if (!existing) {
        guildProfileInFlight.set(inFlightKey, promise);
      }

      try {
        const result = await promise;

        const normalizedServer = String(result.guild.server ?? "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const cacheServer = normalizedServer || "unknown";
        const nextCacheKey = `${GUILD_CACHE_PREFIX}${cacheServer}__${id}`;

        if (typeof window !== "undefined") {
          try {
            const index = readServerIndex();
            index[id] = cacheServer;
            window.localStorage.setItem(GUILD_SERVER_INDEX_KEY, JSON.stringify(index));
            writeTtlCache(nextCacheKey, result);
          } catch {
            // ignore cache write errors
          }
        }

        guildProfileMemory.set(nextCacheKey, { cachedAt: Date.now(), data: result });
        if (!cancelled) {
          setGuild(result.guild);
          setSnapshot(result.snapshot);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Fehler beim Laden.");
      } finally {
        if (!existing) guildProfileInFlight.delete(inFlightKey);
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
  const top3Stats = useMemo(() => {
    const members = snapshot?.members ?? [];
    const topN = (key: "baseMain" | "conBase" | "sumBaseTotal" | "attrTotal" | "conTotal" | "totalStats") =>
      [...members]
        .filter((m) => typeof (m as any)[key] === "number")
        .sort((a, b) => ((b as any)[key] ?? 0) - ((a as any)[key] ?? 0))
        .slice(0, 3)
        .map((m) => ({
          name: m.name ?? "—",
          classLabel: m.class ?? null,
          value: ((m as any)[key] as number | null | undefined) ?? null,
        }));

    return {
      base: {
        main: topN("baseMain"),
        con: topN("conBase"),
        sum: topN("sumBaseTotal"),
      },
      total: {
        main: topN("attrTotal"),
        con: topN("conTotal"),
        total: topN("totalStats"),
      },
    };
  }, [snapshot?.members]);

  if (loading) {
    if (heroOnly) {
      return <div className="text-sm" style={{ color: C.soft, padding: 16 }}>Loading guild profile...</div>;
    }
    return (
      <ContentShell centerFramed>
        <div className="text-sm" style={{ color: C.soft }}>Lade Gildenprofil...</div>
      </ContentShell>
    );
  }

  if (!guild) {
    if (heroOnly) {
      return (
        <div className="text-sm" style={{ color: C.soft, padding: 16 }}>
          {err ?? "Unknown error."}
        </div>
      );
    }
    return (
      <ContentShell centerFramed>
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

  const updatedScanLabel = formatScanDateTimeLabel(snapshot?.updatedAtMs ?? snapshot?.updatedAt ?? null);
  const hasUpdatedScanLabel = updatedScanLabel !== "—";
  const emblemUrl = guildIconUrlByIdentifier(guild.id, 512) || undefined;
  const handleHeroAction = (actionKey: string) => {
    if (actionKey !== "open_guild") return;
    navigate(`/guilds/profile/${encodeURIComponent(guild.id)}`);
  };
  const heroPanelData: GuildHeroPanelData | null = guild.name
    ? {
        guildName: guild.name,
        server: guild.server ?? undefined,
        memberCount: guild.memberCount ?? null,
        hofRank: guild.hofRank ?? null,
        emblemUrl: emblemUrl ?? null,
        lastScanAtLabel: hasUpdatedScanLabel ? updatedScanLabel : null,
        lastScanDays: guild.lastScanDays ?? null,
        averageStats: {
          base: {
            main: snapshot?.avgBaseMain ?? null,
            con: snapshot?.avgConBase ?? null,
            sum: snapshot?.avgSumBaseTotal ?? null,
          },
          total: {
            main: snapshot?.avgAttrTotal ?? null,
            con: snapshot?.avgConTotal ?? null,
            total: snapshot?.avgTotalStats ?? null,
          },
        },
        activityPct: 100,
        metrics: [],
        actions: [
          {
            key: "open_guild",
            label: "Open guild",
          },
        ],
        top3: top3Stats,
        classTabs: {
          data: membersForList,
          classMeta: safeMeta as any,
          onPickClass: (id) => {
            const url = new URL(window.location.href);
            url.searchParams.set("tab", "Uebersicht");
            url.searchParams.set("class", id);
            window.location.href = url.toString();
          },
        },
      }
    : null;

  if (heroOnly) {
    return heroPanelData ? <GuildHeroPanel data={heroPanelData} onAction={handleHeroAction} /> : null;
  }

  return (
    <ContentShell centerFramed={false}>
      <div className="px-6 pb-8">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-4">
            {heroPanelData ? <GuildHeroPanel data={heroPanelData} onAction={handleHeroAction} /> : null}

            <Tabs
              members={membersForList}
              guildId={guild.id}
              guildName={guild.name}
              guildServer={guild.server}
            />
          </div>
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
  const [tab, setTab] = useState<"Uebersicht" | "Rankings" | "Monthly Progress" | "Historie">("Uebersicht");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b" style={{ borderColor: C.line }} role="tablist">
        {(["Uebersicht", "Rankings", "Monthly Progress", "Historie"] as const).map((t) => {
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
        {tab === "Uebersicht" && (
          <GuildMemberBrowser
            members={members}
            defaultView="list"
            defaultSort={{ key: "level", dir: "desc" }}
          />
        )}

        {tab === "Rankings" && (
          <div className="text-sm" style={{ color: C.soft }}>
            Platzhalter <b>Rankings</b> - Inhalt folgt.
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
            Platzhalter <b>Historie</b> - Inhalt folgt.
          </div>
        )}
      </Section>
    </div>
  );
}


