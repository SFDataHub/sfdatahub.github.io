// src/pages/guilds/Profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { useTranslation } from "react-i18next";
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
import GuildMonthlyProgressTabContainer, {
  type GuildMonthlyProgressSeedData,
} from "../../components/guilds/guild-tabs/GuildMonthlyProgressTab/GuildMonthlyProgressTabContainer";

import type {
  MembersSnapshotLike,
  GuildLike,
  MemberSummaryLike,
} from "../../components/guilds/GuildProfileInfo/GuildProfileInfo.types";
import GuildHeroPanel, {
  type GuildHeroPanelData,
  type GuildHeroTransferEntry,
  type GuildHeroTransfersData,
} from "../../components/guilds/GuildHeroPanel";
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
  transfers: GuildHeroTransfersData;
  monthlySeed: GuildMonthlyProgressSeedData;
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
const INACTIVE_THRESHOLD_MS = 48 * 60 * 60 * 1000;
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const EMPTY_TRANSFERS: GuildHeroTransfersData = {
  joined: [],
  left: [],
  hasMonthlyComparison: false,
  comparisonFromLabel: null,
  comparisonToLabel: null,
};
const EMPTY_MONTHLY_SEED: GuildMonthlyProgressSeedData = {
  latestLatest: null,
  latestSummary: null,
  monthSnapshotsByKey: {},
  latestSummaryMissing: false,
  knownMissingMonthKeys: [],
};

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
const toEpochMs = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const daysSince = (tsSec?: number | null) => {
  if (!tsSec) return null;
  const diff = Math.max(0, Date.now() / 1000 - tsSec);
  return Math.floor(diff / 86400);
};

const normalizeToplistServerCode = (value: string | null | undefined): string => {
  const raw = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  const withoutSuffix = raw.replace(/\.(EU|NET)$/, "");
  const hostMatch = withoutSuffix.match(/^S(\d+)$/);
  if (hostMatch) return `EU${hostMatch[1]}`;
  return withoutSuffix;
};

const toMonthKey = (year: number, monthIndexZeroBased: number): string | null => {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndexZeroBased)) return null;
  if (monthIndexZeroBased < 0 || monthIndexZeroBased > 11) return null;
  return `${year}-${String(monthIndexZeroBased + 1).padStart(2, "0")}`;
};

const toMonthKeyFromMs = (epochMs: number | null | undefined): string | null => {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs) || epochMs <= 0) return null;
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return null;
  const monthKey = toMonthKey(d.getFullYear(), d.getMonth());
  return monthKey && MONTH_KEY_RE.test(monthKey) ? monthKey : null;
};

const toPrevMonthKey = (monthKey: string): string | null => {
  if (!MONTH_KEY_RE.test(monthKey)) return null;
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  return MONTH_KEY_RE.test(prevKey) ? prevKey : null;
};

const extractMonthKeyFromDateText = (value: string | null | undefined): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const yearMonth = raw.match(/^(\d{4})-(0[1-9]|1[0-2])/);
  if (yearMonth) {
    const key = `${yearMonth[1]}-${yearMonth[2]}`;
    return MONTH_KEY_RE.test(key) ? key : null;
  }

  const germanDate = raw.match(/^([0-2]?\d|3[0-1])[./-](0?[1-9]|1[0-2])[./-](\d{4})/);
  if (germanDate) {
    const key = `${germanDate[3]}-${String(Number(germanDate[2])).padStart(2, "0")}`;
    return MONTH_KEY_RE.test(key) ? key : null;
  }

  return null;
};

const resolveLatestSnapshotMonthKey = (snapshot: MembersSnapshot | null): string | null => {
  if (!snapshot) return null;
  const fromUpdatedAtText = extractMonthKeyFromDateText(snapshot.updatedAt);
  if (fromUpdatedAtText) return fromUpdatedAtText;

  const fromUpdatedAtMs = toMonthKeyFromMs(snapshot.updatedAtMs);
  if (fromUpdatedAtMs) return fromUpdatedAtMs;

  const fromUpdatedAt = toMonthKeyFromMs(toEpochMs(snapshot.updatedAt));
  if (fromUpdatedAt) return fromUpdatedAt;

  const memberScanMs = (snapshot.members ?? [])
    .map((member) => toEpochMs((member as any)?.lastScanMs) ?? toEpochMs((member as any)?.lastScan))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (memberScanMs.length === 0) return null;
  return toMonthKeyFromMs(Math.max(...memberScanMs));
};

const toSnapshotMemberId = (member: any): string =>
  String(member?.id ?? member?.playerId ?? "").trim();

const toTransferEntryMap = (members: any[]): Map<string, GuildHeroTransferEntry> => {
  const map = new Map<string, GuildHeroTransferEntry>();
  for (const member of members) {
    const memberId = toSnapshotMemberId(member);
    if (!memberId) continue;
    const name = String(member?.name ?? "").trim() || memberId;
    const classLabel = String(member?.class ?? "").trim() || "Unknown";
    const levelRaw = Number(member?.level);
    map.set(memberId, {
      memberId,
      name,
      classLabel,
      classKey: classLabel,
      level: Number.isFinite(levelRaw) ? levelRaw : null,
    });
  }
  return map;
};

const sortTransferEntries = (a: GuildHeroTransferEntry, b: GuildHeroTransferEntry): number => {
  const levelA = typeof a.level === "number" && Number.isFinite(a.level) ? a.level : -1;
  const levelB = typeof b.level === "number" && Number.isFinite(b.level) ? b.level : -1;
  if (levelB !== levelA) return levelB - levelA;
  return a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" });
};

const buildTransfersFromMembers = (latestMembers: any[], compareMembers: any[]): GuildHeroTransfersData => {
  const latestById = toTransferEntryMap(latestMembers);
  const compareById = toTransferEntryMap(compareMembers);

  const joined: GuildHeroTransferEntry[] = [];
  const left: GuildHeroTransferEntry[] = [];

  latestById.forEach((entry, memberId) => {
    if (!compareById.has(memberId)) joined.push(entry);
  });
  compareById.forEach((entry, memberId) => {
    if (!latestById.has(memberId)) left.push(entry);
  });

  joined.sort(sortTransferEntries);
  left.sort(sortTransferEntries);

  return {
    joined,
    left,
    hasMonthlyComparison: true,
  };
};

const normalizeTransfers = (value: any): GuildHeroTransfersData => ({
  joined: Array.isArray(value?.joined) ? value.joined : [],
  left: Array.isArray(value?.left) ? value.left : [],
  hasMonthlyComparison: Boolean(value?.hasMonthlyComparison),
  comparisonFromLabel:
    typeof value?.comparisonFromLabel === "string" && value.comparisonFromLabel.trim().length > 0
      ? value.comparisonFromLabel
      : null,
  comparisonToLabel:
    typeof value?.comparisonToLabel === "string" && value.comparisonToLabel.trim().length > 0
      ? value.comparisonToLabel
      : null,
});

const normalizeLoadResult = (value: any): GuildProfileLoadResult => ({
  guild: value?.guild as Guild,
  snapshot: (value?.snapshot as MembersSnapshot | null) ?? null,
  transfers: normalizeTransfers(value?.transfers),
  monthlySeed:
    value?.monthlySeed && typeof value.monthlySeed === "object"
      ? {
          latestLatest:
            value.monthlySeed.latestLatest && typeof value.monthlySeed.latestLatest === "object"
              ? value.monthlySeed.latestLatest
              : null,
          latestSummary:
            value.monthlySeed.latestSummary && typeof value.monthlySeed.latestSummary === "object"
              ? value.monthlySeed.latestSummary
              : null,
          monthSnapshotsByKey:
            value.monthlySeed.monthSnapshotsByKey && typeof value.monthlySeed.monthSnapshotsByKey === "object"
              ? (value.monthlySeed.monthSnapshotsByKey as Record<string, Record<string, any>>)
              : {},
          latestSummaryMissing: value.monthlySeed.latestSummaryMissing === true,
          knownMissingMonthKeys: Array.isArray(value.monthlySeed.knownMissingMonthKeys)
            ? value.monthlySeed.knownMissingMonthKeys
                .map((entry: unknown) => String(entry ?? "").trim())
                .filter((entry: string) => entry.length > 0)
            : [],
        }
      : {
          latestLatest: null,
          latestSummary:
            value?.snapshot && typeof value.snapshot === "object"
              ? {
                  guildId: String(value.snapshot.guildId ?? ""),
                  updatedAt: value.snapshot.updatedAt ?? null,
                  updatedAtMs: Number(value.snapshot.updatedAtMs ?? 0),
                  members: Array.isArray(value.snapshot.members) ? value.snapshot.members : [],
                }
              : null,
          monthSnapshotsByKey: {},
          latestSummaryMissing: false,
          knownMissingMonthKeys: [],
        },
});

function Section({
  title,
  right,
  children,
  containerStyle,
}: {
  title?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  containerStyle?: React.CSSProperties;
}) {
  return (
    <div
      className="rounded-2xl shadow-lg"
      style={{ background: C.tile, border: `1px solid ${C.line}`, ...containerStyle }}
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
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [snapshot, setSnapshot] = useState<MembersSnapshot | null>(null);
  const [transfers, setTransfers] = useState<GuildHeroTransfersData>(EMPTY_TRANSFERS);
  const [monthlySeed, setMonthlySeed] = useState<GuildMonthlyProgressSeedData>(EMPTY_MONTHLY_SEED);

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
      setMonthlySeed(EMPTY_MONTHLY_SEED);
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
              setTransfers(normalizeTransfers(mem.data.transfers));
              setMonthlySeed(mem.data.monthlySeed ?? EMPTY_MONTHLY_SEED);
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
          const data = normalizeLoadResult(cached);
          guildProfileMemory.set(cacheKey, { cachedAt: Date.now(), data });
          if (!cancelled) {
            setGuild(data.guild);
            setSnapshot(data.snapshot);
            setTransfers(data.transfers);
            setMonthlySeed(data.monthlySeed ?? EMPTY_MONTHLY_SEED);
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
          let nextTransfers: GuildHeroTransfersData = EMPTY_TRANSFERS;
          const monthlySeed: GuildMonthlyProgressSeedData = {
            latestLatest: d && typeof d === "object" ? d : null,
            latestSummary: null,
            monthSnapshotsByKey: {},
            latestSummaryMissing: false,
            knownMissingMonthKeys: [],
          };

          const refSnap = doc(db, `guilds/${id}/snapshots/members_summary`);
          const snap = await traceGetDoc(scope, refSnap, () => getDoc(refSnap));
          if (snap.exists()) {
            const sdata = snap.data() as any;
            monthlySeed.latestSummary = sdata && typeof sdata === "object" ? sdata : null;
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
          } else {
            monthlySeed.latestSummaryMissing = true;
          }

          const latestMonthKey = resolveLatestSnapshotMonthKey(nextSnapshot);
          const comparisonMonthKey = latestMonthKey ? toPrevMonthKey(latestMonthKey) : null;
          if (nextSnapshot && comparisonMonthKey) {
            const comparisonRef = doc(db, `guilds/${id}/snapshots/members_summary__${comparisonMonthKey}`);
            const comparisonSnap = await traceGetDoc(scope, comparisonRef, () => getDoc(comparisonRef));
            if (comparisonSnap.exists()) {
              const compareData = comparisonSnap.data() as any;
              monthlySeed.monthSnapshotsByKey = {
                ...(monthlySeed.monthSnapshotsByKey ?? {}),
                [comparisonMonthKey]: compareData,
              };
              const compareMembers = Array.isArray(compareData?.members) ? compareData.members : [];
              const comparisonFromLabel = formatScanDateTimeLabel(compareData?.updatedAtMs ?? compareData?.updatedAt ?? null);
              const comparisonToLabel = formatScanDateTimeLabel(
                nextSnapshot.updatedAtMs ?? nextSnapshot.updatedAt ?? null,
              );
              nextTransfers = {
                ...buildTransfersFromMembers(nextSnapshot.members ?? [], compareMembers),
                comparisonFromLabel: comparisonFromLabel !== "—" ? comparisonFromLabel : null,
                comparisonToLabel: comparisonToLabel !== "—" ? comparisonToLabel : null,
              };
            } else {
              monthlySeed.knownMissingMonthKeys = [
                ...(monthlySeed.knownMissingMonthKeys ?? []),
                comparisonMonthKey,
              ];
            }
          }

          return { guild: g, snapshot: nextSnapshot, transfers: nextTransfers, monthlySeed };
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
          setTransfers(result.transfers);
          setMonthlySeed(result.monthlySeed ?? EMPTY_MONTHLY_SEED);
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
  const activityPct = useMemo(() => {
    const members = snapshot?.members ?? [];
    const totalMembers = members.length;
    if (!totalMembers) return null;

    let activeMembers = 0;
    for (const member of members) {
      const lastScanMs = toEpochMs(member.lastScanMs) ?? toEpochMs(member.lastScan);
      const lastActivityMs = toEpochMs(member.lastActivityMs) ?? toEpochMs(member.lastActivity);
      if (lastScanMs == null || lastActivityMs == null) continue;

      const inactiveForTooLong = lastScanMs - lastActivityMs > INACTIVE_THRESHOLD_MS;
      if (!inactiveForTooLong) activeMembers += 1;
    }

    return (activeMembers / totalMembers) * 100;
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
    if (actionKey === "open_guild") {
      navigate(`/guilds/profile/${encodeURIComponent(guild.id)}`);
      return;
    }
    if (actionKey !== "show_in_top_list") return;
    const serverKey = normalizeToplistServerCode(guild.server);
    const guildIdentifier = String(guild.id ?? "").trim().toLowerCase();
    const focusIdentifier = `${serverKey.toLowerCase()}__${guildIdentifier}`;
    if (!serverKey || !guildIdentifier) return;
    const params = new URLSearchParams();
    params.set("tab", "guilds");
    params.set("server", serverKey);
    params.set("focus", focusIdentifier);
    if (typeof guild.hofRank === "number" && Number.isFinite(guild.hofRank)) {
      params.set("rank", String(Math.max(1, Math.trunc(guild.hofRank))));
    }
    navigate({
      pathname: "/toplists",
      search: `?${params.toString()}`,
    });
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
        activityPct,
        metrics: [],
        transfers,
        actions: [
          {
            key: heroOnly ? "open_guild" : "show_in_top_list",
            label: heroOnly
              ? t("playerProfile.heroPanel.actions.openGuild", { defaultValue: "Open guild" })
              : t("playerProfile.heroPanel.actions.showInTopList", { defaultValue: "Show in Top List" }),
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
    return heroPanelData ? <GuildHeroPanel data={heroPanelData} onAction={handleHeroAction} context="overlay" /> : null;
  }

  return (
    <ContentShell centerFramed={false}>
      <div className="px-6 pb-8">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-4">
            {heroPanelData ? <GuildHeroPanel data={heroPanelData} onAction={handleHeroAction} context="profile" /> : null}

            <Tabs
              members={membersForList}
              guildId={guild.id}
              guildName={guild.name}
              guildServer={guild.server}
              monthlySeed={monthlySeed}
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
  monthlySeed,
}: {
  members: MemberSummary[];
  guildId: string;
  guildName: string;
  guildServer: string | null;
  monthlySeed: GuildMonthlyProgressSeedData;
}) {
  const [tab, setTab] = useState<"Uebersicht" | "Rankings" | "Monthly Progress" | "Historie">("Uebersicht");
  const isMonthlyTab = tab === "Monthly Progress";
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

      <Section
        containerStyle={
          isMonthlyTab
            ? {
                background: "linear-gradient(135deg, rgba(20, 39, 62, 0.9), rgba(9, 21, 41, 0.95))",
                boxShadow: "0 30px 60px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
              }
            : undefined
        }
      >
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
            seedData={monthlySeed}
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
