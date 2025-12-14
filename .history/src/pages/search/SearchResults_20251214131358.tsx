import React from "react";
import { useSearchParams } from "react-router-dom";
import {
  collectionGroup,
  endAt,
  getDocs,
  limit,
  orderBy,
  query as fsQuery,
  startAfter,
  startAt,
} from "firebase/firestore";
import ContentShell from "../../components/ContentShell";
import { db } from "../../lib/firebase";
import { beginReadScope, endReadScope, traceGetDocs } from "../../lib/debug/firestoreReadTrace";

type PlayerHit = {
  id: string;
  name: string | null;
  server: string | null;
  className: string | null;
  level: number | null;
};

type GuildHit = {
  id: string;
  name: string | null;
  server: string | null;
  memberCount: number | null;
  hofRank: number | null;
};

const PAGE_SIZE = 50;
const MIN_CHARS = 3;

const fold = (s?: string | null) =>
  String(s ?? "")
    .normalize("NFD")
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const toNumberLoose = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export default function SearchResultsPage() {
  const [params] = useSearchParams();
  const queryText = params.get("q")?.trim() ?? "";
  const folded = fold(queryText);

  const [players, setPlayers] = React.useState<PlayerHit[]>([]);
  const [guilds, setGuilds] = React.useState<GuildHit[]>([]);
  const [playersCursor, setPlayersCursor] = React.useState<any>(null);
  const [guildsCursor, setGuildsCursor] = React.useState<any>(null);
  const [playersHasMore, setPlayersHasMore] = React.useState(false);
  const [guildsHasMore, setGuildsHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const runPage = async (cursor?: any) => {
    const scope = beginReadScope("Search:results");
    try {
      const baseQuery = fsQuery(
        collectionGroup(db, "latest"),
        orderBy("nameFold"),
        startAt(folded),
        endAt(folded + "\uf8ff"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(PAGE_SIZE),
      );
      const snap = await traceGetDocs(scope, baseQuery, () => getDocs(baseQuery), { collectionHint: "latest" });
      const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;

      const nextPlayers: PlayerHit[] = [];
      const nextGuilds: GuildHit[] = [];

      snap.forEach((docSnap) => {
        const d = docSnap.data() as any;
        const parent = docSnap.ref.parent?.parent;
        const root = parent?.parent?.id;
        const safeId = parent?.id ?? docSnap.id;
        if (root === "players") {
          nextPlayers.push({
            id: safeId,
            name: d.name ?? d.values?.Name ?? null,
            server: d.server ?? d.values?.Server ?? null,
            className: d.className ?? d.values?.Class ?? null,
            level: toNumberLoose(d.level ?? d.values?.Level),
          });
        } else if (root === "guilds") {
          nextGuilds.push({
            id: safeId,
            name: d.name ?? d.values?.Name ?? null,
            server: d.server ?? d.values?.Server ?? null,
            memberCount: toNumberLoose(
              d.memberCount ?? d.values?.["Guild Member Count"] ?? d.values?.GuildMemberCount,
            ),
            hofRank: toNumberLoose(
              d.hofRank ?? d.values?.["Hall of Fame Rank"] ?? d.values?.HoF ?? d.values?.Rank ?? d.values?.["Guild Rank"],
            ),
          });
        }
      });

      setPlayers((prev) => [...prev, ...nextPlayers]);
      setGuilds((prev) => [...prev, ...nextGuilds]);
      setPlayersCursor(nextCursor);
      setGuildsCursor(nextCursor);
      setPlayersHasMore(snap.docs.length === PAGE_SIZE);
      setGuildsHasMore(snap.docs.length === PAGE_SIZE);
    } finally {
      endReadScope(scope);
    }
  };

  React.useEffect(() => {
    if (folded.length < MIN_CHARS) {
      setError("Type at least 3 characters to search.");
      return;
    }
    setError(null);
    setPlayers([]);
    setGuilds([]);
    setPlayersCursor(null);
    setGuildsCursor(null);
    setPlayersHasMore(false);
    setGuildsHasMore(false);
    setLoading(true);
    runPage()
      .catch((e) => setError(e?.message || "Search failed"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folded]);

  const loadMore = () => {
    if (loading) return;
    setLoading(true);
    runPage(playersCursor || guildsCursor)
      .catch((e) => setError(e?.message || "Search failed"))
      .finally(() => setLoading(false));
  };

  return (
    <ContentShell title="Search" subtitle={queryText ? `Results for “${queryText}”` : ""}>
      {error && <p style={{ color: "#ff9c9c", marginBottom: 12 }}>{error}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section>
          <h3>Players</h3>
          {players.map((p) => (
            <div key={p.id} style={{ padding: 8, border: "1px solid #1f3248", borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>{p.name ?? p.id}</div>
              <div style={{ opacity: 0.8 }}>
                {p.className ?? "?"} · {p.server ?? "?"} · {p.level != null ? `Lvl ${p.level}` : "Lvl ?"}
              </div>
            </div>
          ))}
        </section>
        <section>
          <h3>Guilds</h3>
          {guilds.map((g) => (
            <div key={g.id} style={{ padding: 8, border: "1px solid #1f3248", borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>{g.name ?? g.id}</div>
              <div style={{ opacity: 0.8 }}>
                {g.server ?? "?"} ·{" "}
                {g.memberCount != null ? `${g.memberCount} members` : "Members ?"} ·{" "}
                {g.hofRank != null ? `HoF #${g.hofRank}` : "HoF ?"}
              </div>
            </div>
          ))}
        </section>
      </div>
      {(playersHasMore || guildsHasMore) && (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={loadMore} disabled={loading} style={{ padding: "10px 14px" }}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </ContentShell>
  );
}
