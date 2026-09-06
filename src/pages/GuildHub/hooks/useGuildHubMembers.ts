import React from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { readTtlCache, writeTtlCache } from "../../../lib/cache/localStorageTtl";
import {
  beginReadScope,
  endReadScope,
  traceGetDoc,
  type FirestoreTraceScope,
} from "../../../lib/debug/firestoreReadTrace";
import type {
  MemberSummaryLike,
  MembersSnapshotLike,
} from "../../../components/guilds/GuildProfileInfo/GuildProfileInfo.types";

type MembersSnapshot = MembersSnapshotLike & { coaString?: string };

type GuildHubMembersResult =
  | { ok: true; snapshot: MembersSnapshot }
  | { ok: false; error: "missing_guild" | "not_found" | "firestore_error"; detail?: string };

type CacheValue = { cachedAt: number; result: GuildHubMembersResult };

const GUILD_MEMBERS_CACHE_PREFIX = "sfh:guild-hub:members:v1:";
const GUILD_MEMBERS_CACHE_TTL_MS = 60 * 60 * 1000;
const GUILD_PROFILE_CACHE_PREFIX = "sf_profile_guild__";
const GUILD_PROFILE_SERVER_INDEX_KEY = "sf_profile_guild_server_index";

const membersInFlight = new Map<string, Promise<GuildHubMembersResult>>();
const membersMemory = new Map<string, CacheValue>();

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const normalizeMembers = (value: unknown): MemberSummaryLike[] =>
  Array.isArray(value) ? (value as MemberSummaryLike[]) : [];

const normalizeSnapshot = (guildId: string, data: any): MembersSnapshot => ({
  guildId: String(data?.guildId ?? guildId),
  updatedAt: String(data?.updatedAt ?? ""),
  updatedAtMs: toNumber(data?.updatedAtMs),
  count: toNumber(data?.count ?? normalizeMembers(data?.members).length),
  hash: String(data?.hash ?? ""),
  coaString: typeof data?.coaString === "string" ? data.coaString : "",
  avgLevel: data?.avgLevel ?? null,
  avgTreasury: data?.avgTreasury ?? null,
  avgMine: data?.avgMine ?? null,
  avgBaseMain: data?.avgBaseMain ?? null,
  avgConBase: data?.avgConBase ?? null,
  avgSumBaseTotal: data?.avgSumBaseTotal ?? null,
  avgAttrTotal: data?.avgAttrTotal ?? null,
  avgConTotal: data?.avgConTotal ?? null,
  avgTotalStats: data?.avgTotalStats ?? null,
  members: normalizeMembers(data?.members),
});

const readProfileCacheSnapshot = (guildId: string): MembersSnapshot | null => {
  if (typeof window === "undefined") return null;
  try {
    const indexRaw = window.localStorage.getItem(GUILD_PROFILE_SERVER_INDEX_KEY);
    const index = indexRaw ? JSON.parse(indexRaw) : null;
    const server = index && typeof index === "object" ? String(index[guildId] ?? "") : "";
    if (!server) return null;
    const cached = readTtlCache(`${GUILD_PROFILE_CACHE_PREFIX}${server}__${guildId}`, GUILD_MEMBERS_CACHE_TTL_MS);
    const snapshot = cached && typeof cached === "object" ? (cached as any).snapshot : null;
    if (!snapshot || typeof snapshot !== "object") return null;
    return normalizeSnapshot(guildId, snapshot);
  } catch {
    return null;
  }
};

export async function loadGuildHubMembersSnapshotCached(guildId: string): Promise<GuildHubMembersResult> {
  const id = guildId.trim();
  if (!id) return { ok: false, error: "missing_guild" };

  const cacheKey = `${GUILD_MEMBERS_CACHE_PREFIX}${id}`;
  const now = Date.now();
  const memoryHit = membersMemory.get(cacheKey);
  if (memoryHit) {
    if (now - memoryHit.cachedAt < GUILD_MEMBERS_CACHE_TTL_MS) return memoryHit.result;
    membersMemory.delete(cacheKey);
  }

  const cached = readTtlCache(cacheKey, GUILD_MEMBERS_CACHE_TTL_MS);
  if (cached && typeof cached === "object") {
    const result = cached as GuildHubMembersResult;
    membersMemory.set(cacheKey, { cachedAt: now, result });
    return result;
  }

  const profileSnapshot = readProfileCacheSnapshot(id);
  if (profileSnapshot) {
    const result: GuildHubMembersResult = { ok: true, snapshot: profileSnapshot };
    membersMemory.set(cacheKey, { cachedAt: now, result });
    writeTtlCache(cacheKey, result);
    return result;
  }

  const existing = membersInFlight.get(id);
  if (existing) return existing;

  const promise = (async (): Promise<GuildHubMembersResult> => {
    let scope: FirestoreTraceScope = null;
    try {
      scope = beginReadScope("GuildHubMembers:load");
      const membersRef = doc(db, `guilds/${id}/snapshots/members_summary`);
      const snap = await traceGetDoc(scope, membersRef, () => getDoc(membersRef));
      if (!snap.exists()) return { ok: false, error: "not_found" };
      const result: GuildHubMembersResult = {
        ok: true,
        snapshot: normalizeSnapshot(id, snap.data()),
      };
      writeTtlCache(cacheKey, result);
      membersMemory.set(cacheKey, { cachedAt: Date.now(), result });
      return result;
    } catch (error: any) {
      const result: GuildHubMembersResult = {
        ok: false,
        error: "firestore_error",
        detail: error?.message,
      };
      membersMemory.set(cacheKey, { cachedAt: Date.now(), result });
      return result;
    } finally {
      endReadScope(scope);
    }
  })();

  membersInFlight.set(id, promise);
  try {
    return await promise;
  } finally {
    membersInFlight.delete(id);
  }
}

export function useGuildHubMembers(guildId: string | null | undefined) {
  const [snapshot, setSnapshot] = React.useState<MembersSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = String(guildId ?? "").trim();
    let cancelled = false;

    if (!id) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    loadGuildHubMembersSnapshotCached(id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setSnapshot(result.snapshot);
        setError(null);
      } else {
        setSnapshot(null);
        setError(
          result.error === "not_found"
            ? "Keine Member-Daten fuer diese Gilde gefunden."
            : "Member-Daten konnten nicht geladen werden.",
        );
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [guildId]);

  return { snapshot, members: snapshot?.members ?? [], loading, error };
}
