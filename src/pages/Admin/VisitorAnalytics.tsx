import React from "react";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { AlertTriangle, Loader2, RefreshCcw } from "lucide-react";

import ContentShell from "../../components/ContentShell";
import { db } from "../../lib/firebase";

type RangeKey = "today" | "last7d" | "last30d";

type VisitorTopEntry = {
  path: string;
  count: number;
  type: string;
  identifier?: string;
  slug?: string;
};

type VisitorAnalyticsSnapshot = {
  timezone: string;
  updatedAt: Date | null;
  totals: Record<RangeKey, number>;
  topPages: Record<Exclude<RangeKey, "today">, VisitorTopEntry[]>;
  topPlayers: Record<Exclude<RangeKey, "today">, VisitorTopEntry[]>;
  topGuilds: Record<Exclude<RangeKey, "today">, VisitorTopEntry[]>;
  topGuides: Record<Exclude<RangeKey, "today">, VisitorTopEntry[]>;
};

const cardStyle: React.CSSProperties = {
  borderColor: "#2B4C73",
  background: "#152A42",
};

const nestedCardStyle: React.CSSProperties = {
  borderColor: "#2B4C73",
  background: "#1A2F4A",
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const parseNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const parseDate = (value: unknown): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value && typeof value === "object" && "toDate" in value) {
    const maybeToDate = (value as { toDate?: () => Date }).toDate;
    if (typeof maybeToDate === "function") {
      try {
        const parsed = maybeToDate();
        return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
      } catch {
        return null;
      }
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
};

const parseTopEntries = (value: unknown, fallbackType: string): VisitorTopEntry[] => {
  if (!Array.isArray(value)) return [];
  const parsed: VisitorTopEntry[] = [];
  for (const row of value) {
    const record = asRecord(row);
    if (!record) continue;
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (!path) continue;
    const count = parseNumber(record.count);
    if (count <= 0) continue;
    const type = typeof record.type === "string" && record.type.trim().length > 0
      ? record.type
      : fallbackType;
    const identifier = typeof record.identifier === "string" && record.identifier.trim().length > 0
      ? record.identifier
      : undefined;
    const slug = typeof record.slug === "string" && record.slug.trim().length > 0
      ? record.slug
      : undefined;
    parsed.push({ path, count, type, ...(identifier ? { identifier } : {}), ...(slug ? { slug } : {}) });
  }
  return parsed;
};

const parseVisits = (totalsRecord: Record<string, unknown> | null, key: RangeKey): number => {
  const windowRecord = totalsRecord ? asRecord(totalsRecord[key]) : null;
  if (!windowRecord) return 0;
  return parseNumber(windowRecord.visits);
};

const parseWindowList = (
  rootRecord: Record<string, unknown> | null,
  key: "last7d" | "last30d",
  fallbackType: string,
): VisitorTopEntry[] => {
  const section = rootRecord ? rootRecord[key] : null;
  return parseTopEntries(section, fallbackType);
};

const parseSnapshot = (data: Record<string, unknown>): VisitorAnalyticsSnapshot => {
  const timezone =
    typeof data.timezone === "string" && data.timezone.trim().length > 0
      ? data.timezone
      : "Europe/Berlin";
  const updatedAt = parseDate(data.updatedAt) ?? parseDate(data.updatedAtIso);
  const totalsRecord = asRecord(data.totals);
  const topPagesRecord = asRecord(data.topPages);
  const topPlayersRecord = asRecord(data.topPlayers);
  const topGuildsRecord = asRecord(data.topGuilds);
  const topGuidesRecord = asRecord(data.topGuides);

  return {
    timezone,
    updatedAt,
    totals: {
      today: parseVisits(totalsRecord, "today"),
      last7d: parseVisits(totalsRecord, "last7d"),
      last30d: parseVisits(totalsRecord, "last30d"),
    },
    topPages: {
      last7d: parseWindowList(topPagesRecord, "last7d", "page"),
      last30d: parseWindowList(topPagesRecord, "last30d", "page"),
    },
    topPlayers: {
      last7d: parseWindowList(topPlayersRecord, "last7d", "player_profile"),
      last30d: parseWindowList(topPlayersRecord, "last30d", "player_profile"),
    },
    topGuilds: {
      last7d: parseWindowList(topGuildsRecord, "last7d", "guild_profile"),
      last30d: parseWindowList(topGuildsRecord, "last30d", "guild_profile"),
    },
    topGuides: {
      last7d: parseWindowList(topGuidesRecord, "last7d", "guide"),
      last30d: parseWindowList(topGuidesRecord, "last30d", "guide"),
    },
  };
};

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-2xl border p-4" style={cardStyle}>
      <div className="text-xs uppercase tracking-wide text-[#8AA5C4]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[#B0C4D9]">{hint}</div> : null}
    </article>
  );
}

function TopListCard({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: VisitorTopEntry[];
  emptyText: string;
}) {
  return (
    <article className="rounded-2xl border p-4" style={cardStyle}>
      <h3 className="text-sm font-semibold text-[#F5F9FF]">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-[#8AA5C4]">{emptyText}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map((item, idx) => (
            <li
              key={`${item.path}:${idx}`}
              className="rounded-xl border px-3 py-2"
              style={nestedCardStyle}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#F5F9FF]">
                    {idx + 1}. {item.path}
                  </div>
                  {item.identifier ? (
                    <div className="text-[11px] text-[#8AA5C4]">Identifier: {item.identifier}</div>
                  ) : null}
                  {item.slug ? (
                    <div className="text-[11px] text-[#8AA5C4]">Slug: {item.slug}</div>
                  ) : null}
                </div>
                <div className="whitespace-nowrap text-sm font-semibold text-white">
                  {new Intl.NumberFormat("en-US").format(item.count)} visits
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function SectionPair({
  title,
  last7d,
  last30d,
  emptyText,
}: {
  title: string;
  last7d: VisitorTopEntry[];
  last30d: VisitorTopEntry[];
  emptyText: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8AA5C4]">{title}</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopListCard title={`${title} · last 7d`} items={last7d} emptyText={emptyText} />
        <TopListCard title={`${title} · last 30d`} items={last30d} emptyText={emptyText} />
      </div>
    </section>
  );
}

export default function AdminVisitorAnalyticsPage() {
  const [snapshot, setSnapshot] = React.useState<VisitorAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasDocument, setHasDocument] = React.useState(false);

  const loadSnapshot = React.useCallback(async (manual: boolean) => {
    if (manual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const snapshotRef = doc(db, "analytics", "visitor_analytics");
      const docSnapshot = await getDoc(snapshotRef);

      if (!docSnapshot.exists()) {
        setSnapshot(null);
        setHasDocument(false);
        return;
      }

      const rawData = docSnapshot.data() as Record<string, unknown>;
      setSnapshot(parseSnapshot(rawData));
      setHasDocument(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load analytics snapshot");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSnapshot(false);
  }, [loadSnapshot]);

  const formattedLastUpdated = React.useMemo(() => {
    if (!snapshot?.updatedAt) return "Not available";
    const formatter = new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: snapshot.timezone,
    });
    return `${formatter.format(snapshot.updatedAt)} (${snapshot.timezone})`;
  }, [snapshot]);

  return (
    <ContentShell
      title="Visitor Analytics"
      subtitle="Snapshot-based Visits dashboard (GoatCounter sync via auth-api)"
      centerFramed
      mode="page"
      stickyTopbar
      actions={(
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm text-white"
          style={{ borderColor: "#2B4C73" }}
          onClick={() => void loadSnapshot(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          {refreshing ? "Refreshing..." : "Refresh snapshot"}
        </button>
      )}
    >
      {loading ? (
        <div className="flex h-full items-center justify-center text-[#B0C4D9]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading visitor analytics snapshot...
        </div>
      ) : (
        <div className="space-y-4">
          {error ? (
            <section className="rounded-2xl border p-4 text-sm text-[#FFD6D6]" style={cardStyle}>
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Snapshot load failed
              </div>
              <p className="mt-2 text-xs text-[#FFD6D6]">{error}</p>
            </section>
          ) : null}

          {!hasDocument || !snapshot ? (
            <section className="rounded-2xl border p-6 text-sm text-[#B0C4D9]" style={cardStyle}>
              Visitor analytics snapshot not available yet. Trigger the internal sync endpoint or wait for the hourly
              scheduler run.
            </section>
          ) : (
            <>
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Visits today"
                  value={new Intl.NumberFormat("en-US").format(snapshot.totals.today)}
                  hint="Europe/Berlin"
                />
                <MetricCard
                  label="Visits last 7d"
                  value={new Intl.NumberFormat("en-US").format(snapshot.totals.last7d)}
                  hint="Rolling window (incl. today)"
                />
                <MetricCard
                  label="Visits last 30d"
                  value={new Intl.NumberFormat("en-US").format(snapshot.totals.last30d)}
                  hint="Rolling window (incl. today)"
                />
                <MetricCard label="Last updated" value={formattedLastUpdated} hint="Snapshot timestamp" />
              </section>

              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TopListCard
                  title="Top Pages · last 7d"
                  items={snapshot.topPages.last7d}
                  emptyText="No page visits captured for last 7d."
                />
                <TopListCard
                  title="Top Pages · last 30d"
                  items={snapshot.topPages.last30d}
                  emptyText="No page visits captured for last 30d."
                />
              </section>

              <SectionPair
                title="Top Player Profiles"
                last7d={snapshot.topPlayers.last7d}
                last30d={snapshot.topPlayers.last30d}
                emptyText="No player-profile visits in this window."
              />

              <SectionPair
                title="Top Guild Profiles"
                last7d={snapshot.topGuilds.last7d}
                last30d={snapshot.topGuilds.last30d}
                emptyText="No guild-profile visits in this window."
              />

              <SectionPair
                title="Top Guides"
                last7d={snapshot.topGuides.last7d}
                last30d={snapshot.topGuides.last30d}
                emptyText="No guide visits in this window."
              />
            </>
          )}
        </div>
      )}
    </ContentShell>
  );
}
