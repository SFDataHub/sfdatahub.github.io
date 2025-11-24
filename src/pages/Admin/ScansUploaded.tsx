import React from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CircleDot,
  Clock3,
  CloudUpload,
  Database,
  FileText,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  Users,
} from "lucide-react";
import ContentShell from "../../components/ContentShell";
import { db } from "../../lib/firebase";

const surfaceStyle: React.CSSProperties = {
  background: "#152A42",
  borderColor: "#2B4C73",
};

const insetSurfaceStyle: React.CSSProperties = {
  background: "#1A2F4A",
  borderColor: "#2B4C73",
};

type UploadStatus = "success" | "failed" | "processing" | "queued" | "unknown";

type UploadRecord = {
  id: string;
  status: UploadStatus;
  uploaderId: string | null;
  uploaderName: string | null;
  guildId: string | null;
  guildName: string | null;
  uploadedAt: Date | null;
  processingMs: number | null;
  fileSizeBytes: number | null;
  errorCode: string | null;
};

type StatusBreakdown = {
  status: UploadStatus;
  count: number;
  share: number;
};

type TimelinePoint = {
  hourLabel: string;
  total: number;
  success: number;
  failed: number;
  timestamp: Date;
};

type Leader = {
  id: string;
  name: string;
  count: number;
  successRate: number;
};

type Issue = {
  code: string;
  count: number;
  lastSeen: Date | null;
};

type OverviewData = {
  metrics: {
    totalUploads: number;
    last24h: number;
    successRate: number;
    failed: number;
    avgProcessingMs: number | null;
    p95ProcessingMs: number | null;
    uniqueUploaders: number;
    uniqueGuilds: number;
    totalFileSizeBytes: number;
  };
  statusBreakdown: StatusBreakdown[];
  timeline: TimelinePoint[];
  issues: Issue[];
  recentFailures: UploadRecord[];
  recentUploads: UploadRecord[];
  topUploaders: Leader[];
  topGuilds: Leader[];
};

type OverviewState = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  data: OverviewData;
  refresh: () => Promise<void>;
};

const FALLBACK_RECORDS: UploadRecord[] = [
  {
    id: "sim-001",
    status: "success",
    uploaderId: "ops-01",
    uploaderName: "Ops · Mira",
    guildId: "guild-emerald",
    guildName: "Emerald Vanguard",
    uploadedAt: new Date(Date.now() - 10 * 60 * 1000),
    processingMs: 4200,
    fileSizeBytes: 3_100_000,
    errorCode: null,
  },
  {
    id: "sim-002",
    status: "success",
    uploaderId: "ops-02",
    uploaderName: "Ops · Lyo",
    guildId: "guild-obsidian",
    guildName: "Obsidian Pact",
    uploadedAt: new Date(Date.now() - 28 * 60 * 1000),
    processingMs: 5100,
    fileSizeBytes: 2_870_000,
    errorCode: null,
  },
  {
    id: "sim-003",
    status: "failed",
    uploaderId: "ops-03",
    uploaderName: "Ops · Kaia",
    guildId: "guild-obsidian",
    guildName: "Obsidian Pact",
    uploadedAt: new Date(Date.now() - 45 * 60 * 1000),
    processingMs: 2900,
    fileSizeBytes: 3_320_000,
    errorCode: "pipeline/timeout",
  },
  {
    id: "sim-004",
    status: "success",
    uploaderId: "ops-01",
    uploaderName: "Ops · Mira",
    guildId: "guild-emerald",
    guildName: "Emerald Vanguard",
    uploadedAt: new Date(Date.now() - 68 * 60 * 1000),
    processingMs: 4700,
    fileSizeBytes: 3_050_000,
    errorCode: null,
  },
  {
    id: "sim-005",
    status: "processing",
    uploaderId: "ops-05",
    uploaderName: "Ops · Nira",
    guildId: "guild-aurora",
    guildName: "Aurora Syndicate",
    uploadedAt: new Date(Date.now() - 12 * 60 * 1000),
    processingMs: null,
    fileSizeBytes: 2_910_000,
    errorCode: null,
  },
  {
    id: "sim-006",
    status: "success",
    uploaderId: "ops-04",
    uploaderName: "Ops · Fynn",
    guildId: "guild-horizon",
    guildName: "Horizon Keep",
    uploadedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    processingMs: 5600,
    fileSizeBytes: 3_420_000,
    errorCode: null,
  },
  {
    id: "sim-007",
    status: "failed",
    uploaderId: "ops-01",
    uploaderName: "Ops · Mira",
    guildId: "guild-horizon",
    guildName: "Horizon Keep",
    uploadedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    processingMs: 6000,
    fileSizeBytes: 3_280_000,
    errorCode: "ingest/schema-mismatch",
  },
  {
    id: "sim-008",
    status: "success",
    uploaderId: "ops-02",
    uploaderName: "Ops · Lyo",
    guildId: "guild-aurora",
    guildName: "Aurora Syndicate",
    uploadedAt: new Date(Date.now() - 9 * 60 * 60 * 1000),
    processingMs: 4300,
    fileSizeBytes: 2_990_000,
    errorCode: null,
  },
  {
    id: "sim-009",
    status: "success",
    uploaderId: "ops-03",
    uploaderName: "Ops · Kaia",
    guildId: "guild-horizon",
    guildName: "Horizon Keep",
    uploadedAt: new Date(Date.now() - 11 * 60 * 60 * 1000),
    processingMs: 6200,
    fileSizeBytes: 3_560_000,
    errorCode: null,
  },
  {
    id: "sim-010",
    status: "success",
    uploaderId: "ops-06",
    uploaderName: "Ops · Theo",
    guildId: "guild-emerald",
    guildName: "Emerald Vanguard",
    uploadedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
    processingMs: 5100,
    fileSizeBytes: 3_120_000,
    errorCode: null,
  },
  {
    id: "sim-011",
    status: "failed",
    uploaderId: "ops-05",
    uploaderName: "Ops · Nira",
    guildId: "guild-aurora",
    guildName: "Aurora Syndicate",
    uploadedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
    processingMs: 3000,
    fileSizeBytes: 2_740_000,
    errorCode: "pipeline/timeout",
  },
  {
    id: "sim-012",
    status: "success",
    uploaderId: "ops-05",
    uploaderName: "Ops · Nira",
    guildId: "guild-aurora",
    guildName: "Aurora Syndicate",
    uploadedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    processingMs: 4900,
    fileSizeBytes: 2_830_000,
    errorCode: null,
  },
];

export default function AdminScansUploaded() {
  const { data, loading, refreshing, error, refresh } = useScansUploadedOverview();

  const summaryCards = React.useMemo(
    () => [
      {
        label: "Total uploads",
        value: formatNumber(data.metrics.totalUploads),
        hint: `${formatNumber(data.metrics.last24h)} in the last 24h`,
        icon: <CloudUpload className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />,
      },
      {
        label: "Success rate",
        value: formatPercent(data.metrics.successRate),
        hint: `${formatNumber(data.metrics.failed)} failed`,
        icon: <BarChart3 className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />,
      },
      {
        label: "Avg. processing",
        value: data.metrics.avgProcessingMs
          ? formatDuration(data.metrics.avgProcessingMs)
          : "–",
        hint: data.metrics.p95ProcessingMs
          ? `p95 ${formatDuration(data.metrics.p95ProcessingMs)}`
          : "Awaiting data",
        icon: <Clock3 className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />,
      },
      {
        label: "Data footprint",
        value: formatFileSize(data.metrics.totalFileSizeBytes),
        hint: "Across fetched window",
        icon: <Database className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />,
      },
      {
        label: "Active uploaders",
        value: formatNumber(data.metrics.uniqueUploaders),
        hint: `${formatNumber(data.metrics.uniqueGuilds)} guilds represented`,
        icon: <Users className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />,
      },
      {
        label: "Open failures",
        value: formatNumber(data.recentFailures.length),
        hint: "Latest 5 shown on the right",
        icon: <ShieldAlert className="h-4 w-4 text-[#F9A825]" aria-hidden="true" />,
      },
    ],
    [data],
  );

  return (
    <ContentShell
      title="Scans uploaded"
      subtitle="Operational analytics for ingestion volume, health, and failure recovery"
      centerFramed
      mode="page"
      stickyTopbar
      left={<LeftRail breakdown={data.statusBreakdown} onRefresh={refresh} loading={loading} refreshing={refreshing} />}
      right={<RightRail issues={data.issues} failures={data.recentFailures} uploaders={data.topUploaders} guilds={data.topGuilds} />}
      leftWidth={260}
      rightWidth={320}
      stickyRails
    >
      <div className="space-y-4">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <article
              key={card.label}
              className="rounded-2xl border p-4"
              style={surfaceStyle}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#F5F9FF]">
                    {card.icon}
                    {card.label}
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-white">{card.value}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-[#B0C4D9]">{card.hint}</div>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-2xl border p-4" style={surfaceStyle}>
            <header className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-[#F5F9FF]">Pipeline status</h2>
                <p className="text-xs text-[#B0C4D9]">
                  Distribution of ingest outcomes for the fetched upload window.
                </p>
              </div>
            </header>
            <ul className="mt-4 space-y-3">
              {data.statusBreakdown.map((item) => (
                <li
                  key={item.status}
                  className="rounded-xl border px-4 py-3"
                  style={insetSurfaceStyle}
                >
                  <div className="flex items-center justify-between text-sm text-[#F5F9FF]">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: statusColor(item.status) }}
                        aria-hidden="true"
                      />
                      {formatStatus(item.status)}
                    </span>
                    <span className="font-semibold">{formatNumber(item.count)}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full" style={{ background: "#0F2137" }} aria-hidden="true">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.min(item.share * 100, 100).toFixed(1)}%`,
                        backgroundColor: statusColor(item.status),
                      }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-[#8AA5C4]">
                    {formatPercent(item.share)} of window
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border p-4" style={surfaceStyle}>
            <header className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-[#F5F9FF]">Hourly throughput</h2>
                <p className="text-xs text-[#B0C4D9]">
                  Recent upload cadence with successes and failures in the last twelve hours.
                </p>
              </div>
            </header>
            <ul className="mt-4 space-y-3">
              {data.timeline.map((point) => (
                <li
                  key={point.hourLabel}
                  className="rounded-xl border px-4 py-3"
                  style={insetSurfaceStyle}
                >
                  <div className="flex items-center justify-between text-sm text-[#F5F9FF]">
                    <span className="font-semibold">{point.hourLabel}</span>
                    <span>{formatNumber(point.total)} uploads</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-[#8AA5C4]">
                    <div className="flex items-center gap-1">
                      <span
                        className="inline-flex h-2 w-2 rounded-full"
                        style={{ backgroundColor: statusColor("success") }}
                        aria-hidden="true"
                      />
                      Success {formatNumber(point.success)}
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <span
                        className="inline-flex h-2 w-2 rounded-full"
                        style={{ backgroundColor: statusColor("failed") }}
                        aria-hidden="true"
                      />
                      Failed {formatNumber(point.failed)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="rounded-2xl border" style={surfaceStyle}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "#2B4C73" }}>
            <div>
              <h2 className="text-sm font-semibold text-[#F5F9FF]">Recent uploads</h2>
              <p className="text-xs text-[#B0C4D9]">
                Latest activity pulled from Firestore. Includes success and failure cases.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#8AA5C4]">
              {loading ? (
                <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…</span>
              ) : error ? (
                <span className="inline-flex items-center gap-1 text-[#F9A825]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {error}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Live snapshot
                </span>
              )}
            </div>
          </header>
          <div className="grid grid-cols-[150px_130px_minmax(0,1fr)_minmax(0,1fr)_110px_110px] gap-4 border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ borderColor: "#2B4C73", color: "#D6E4F7" }}>
            <span>ID</span>
            <span>Status</span>
            <span>Uploader</span>
            <span>Guild</span>
            <span className="text-right">Processing</span>
            <span className="text-right">File size</span>
          </div>
          <ul>
            {data.recentUploads.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[150px_130px_minmax(0,1fr)_minmax(0,1fr)_110px_110px] gap-4 border-b px-5 py-3 text-sm"
                style={{ borderColor: "#2B4C73", color: "#FFFFFF" }}
              >
                <span className="font-mono text-xs text-[#8AA5C4]">{row.id}</span>
                <span>
                  <StatusBadge status={row.status} />
                </span>
                <div>
                  <div className="text-sm text-[#F5F9FF]">{row.uploaderName ?? row.uploaderId ?? "—"}</div>
                  <div className="mt-1 text-xs text-[#8AA5C4]">
                    {row.uploadedAt ? row.uploadedAt.toLocaleString() : "Timestamp missing"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-[#F5F9FF]">{row.guildName ?? row.guildId ?? "—"}</div>
                  <div className="mt-1 text-xs text-[#8AA5C4]">{row.errorCode ? `Issue: ${row.errorCode}` : "Healthy"}</div>
                </div>
                <span className="text-right text-xs text-[#B0C4D9]">
                  {row.processingMs ? formatDuration(row.processingMs) : "Pending"}
                </span>
                <span className="text-right text-xs text-[#B0C4D9]">
                  {row.fileSizeBytes ? formatFileSize(row.fileSizeBytes) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ContentShell>
  );
}

function LeftRail({
  breakdown,
  onRefresh,
  loading,
  refreshing,
}: {
  breakdown: StatusBreakdown[];
  onRefresh: () => Promise<void>;
  loading: boolean;
  refreshing: boolean;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-2xl border p-4" style={surfaceStyle}>
        <div className="flex items-center justify-between text-[#F5F9FF]">
          <span>Controls</span>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-xs"
            style={{ borderColor: "#2B4C73", color: "#F5F9FF" }}
            disabled={refreshing}
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
        <p className="mt-3 text-xs text-[#8AA5C4]">
          Pulls the newest ingest snapshot from Firestore. Uses a 100 item window ordered by upload time.
        </p>
      </div>
      <div className="rounded-2xl border p-4" style={surfaceStyle}>
        <div className="text-[#F5F9FF]">Status mix</div>
        <ul className="mt-3 space-y-2 text-xs text-[#B0C4D9]">
          {breakdown.map((item) => (
            <li key={item.status} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span
                  className="inline-flex h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: statusColor(item.status) }}
                  aria-hidden="true"
                />
                {formatStatus(item.status)}
              </span>
              <span>{formatPercent(item.share)}</span>
            </li>
          ))}
        </ul>
        {loading && (
          <div className="mt-3 inline-flex items-center gap-2 text-xs text-[#8AA5C4]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Synchronising…
          </div>
        )}
      </div>
      <div className="rounded-2xl border p-4" style={surfaceStyle}>
        <div className="text-[#F5F9FF]">Data guardrails</div>
        <ul className="mt-3 space-y-2 text-xs text-[#B0C4D9]">
          <li className="flex items-start gap-2">
            <CircleDot className="mt-0.5 h-3.5 w-3.5 text-[#5C8BC6]" aria-hidden="true" />
            <span>Pipeline SLA ≤ 6s avg processing. Monitor the Avg. processing metric above.</span>
          </li>
          <li className="flex items-start gap-2">
            <CircleDot className="mt-0.5 h-3.5 w-3.5 text-[#5C8BC6]" aria-hidden="true" />
            <span>Alert if failure share exceeds 8% within an hour or 3 consecutive failures happen.</span>
          </li>
          <li className="flex items-start gap-2">
            <CircleDot className="mt-0.5 h-3.5 w-3.5 text-[#5C8BC6]" aria-hidden="true" />
            <span>Review guild specific spikes — cross check with the guild table in the right rail.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function RightRail({
  issues,
  failures,
  uploaders,
  guilds,
}: {
  issues: Issue[];
  failures: UploadRecord[];
  uploaders: Leader[];
  guilds: Leader[];
}) {
  return (
    <div className="space-y-4 text-sm">
      <article className="rounded-2xl border p-4" style={surfaceStyle}>
        <header className="flex items-center gap-2 text-[#F5F9FF]">
          <ShieldAlert className="h-4 w-4 text-[#F9A825]" aria-hidden="true" />
          <span>Top failure signatures</span>
        </header>
        <ul className="mt-3 space-y-2 text-xs text-[#B0C4D9]">
          {issues.length === 0 ? (
            <li className="text-[#8AA5C4]">No failures detected in window.</li>
          ) : (
            issues.map((issue) => (
              <li key={issue.code} className="rounded-xl border px-3 py-2" style={insetSurfaceStyle}>
                <div className="flex items-center justify-between text-sm text-[#F5F9FF]">
                  <span>{issue.code}</span>
                  <span className="font-semibold">×{issue.count}</span>
                </div>
                <div className="mt-1 text-xs text-[#8AA5C4]">
                  Last seen: {issue.lastSeen ? issue.lastSeen.toLocaleString() : "Unknown"}
                </div>
              </li>
            ))
          )}
        </ul>
      </article>

      <article className="rounded-2xl border p-4" style={surfaceStyle}>
        <header className="flex items-center gap-2 text-[#F5F9FF]">
          <AlertTriangle className="h-4 w-4 text-[#FF6B6B]" aria-hidden="true" />
          <span>Latest failed uploads</span>
        </header>
        <ul className="mt-3 space-y-2 text-xs text-[#B0C4D9]">
          {failures.length === 0 ? (
            <li className="text-[#8AA5C4]">No failed uploads in snapshot.</li>
          ) : (
            failures.slice(0, 5).map((row) => (
              <li key={row.id} className="rounded-xl border px-3 py-2" style={insetSurfaceStyle}>
                <div className="flex items-center justify-between text-sm text-[#F5F9FF]">
                  <span className="font-mono text-xs text-[#8AA5C4]">{row.id}</span>
                  <span>{row.uploadedAt ? row.uploadedAt.toLocaleTimeString() : "—"}</span>
                </div>
                <div className="mt-1 text-xs text-[#8AA5C4]">
                  {row.errorCode ?? "No error code provided"}
                </div>
              </li>
            ))
          )}
        </ul>
      </article>

      <article className="rounded-2xl border p-4" style={surfaceStyle}>
        <header className="flex items-center gap-2 text-[#F5F9FF]">
          <Users className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />
          <span>Uploader leaderboard</span>
        </header>
        <ul className="mt-3 space-y-2 text-xs text-[#B0C4D9]">
          {uploaders.map((leader) => (
            <li key={leader.id} className="flex items-center justify-between rounded-xl border px-3 py-2" style={insetSurfaceStyle}>
              <div>
                <div className="text-sm text-[#F5F9FF]">{leader.name}</div>
                <div className="text-xs text-[#8AA5C4]">Success {formatPercent(leader.successRate)}</div>
              </div>
              <div className="text-sm font-semibold text-[#F5F9FF]">{formatNumber(leader.count)}</div>
            </li>
          ))}
        </ul>
      </article>

      <article className="rounded-2xl border p-4" style={surfaceStyle}>
        <header className="flex items-center gap-2 text-[#F5F9FF]">
          <FileText className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />
          <span>Guild spotlight</span>
        </header>
        <ul className="mt-3 space-y-2 text-xs text-[#B0C4D9]">
          {guilds.map((guild) => (
            <li key={guild.id} className="flex items-center justify-between rounded-xl border px-3 py-2" style={insetSurfaceStyle}>
              <div>
                <div className="text-sm text-[#F5F9FF]">{guild.name}</div>
                <div className="text-xs text-[#8AA5C4]">Success {formatPercent(guild.successRate)}</div>
              </div>
              <div className="text-sm font-semibold text-[#F5F9FF]">{formatNumber(guild.count)}</div>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}

function StatusBadge({ status }: { status: UploadStatus }) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide"
      style={{ borderColor: color, color }}
    >
      <CircleDot className="h-3 w-3" aria-hidden="true" />
      {formatStatus(status)}
    </span>
  );
}

function useScansUploadedOverview(): OverviewState {
  const [records, setRecords] = React.useState<UploadRecord[]>(FALLBACK_RECORDS);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const coll = collection(db, "scanUploads");
      const q = query(coll, orderBy("uploadedAt", "desc"), limit(100));
      const snap = await getDocs(q);
      const fetched = snap.docs.map((doc) => normaliseRecord(doc.id, doc.data()));
      if (fetched.length > 0) {
        setRecords(fetched);
        setError(null);
      } else {
        setRecords(FALLBACK_RECORDS);
        setError("No uploads in window – showing fallback snapshot");
      }
    } catch (err) {
      console.error("[ScansUploaded] Failed to load Firestore data", err);
      setError("Live data unavailable – fallback snapshot active");
      setRecords(FALLBACK_RECORDS);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void load(false);
  }, [load]);

  const data = React.useMemo(() => buildOverview(records), [records]);

  return {
    loading,
    refreshing,
    error,
    data,
    refresh: React.useCallback(() => load(true), [load]),
  };
}

function normaliseRecord(id: string, raw: Record<string, unknown>): UploadRecord {
  const status = normaliseStatus(raw.status);
  return {
    id,
    status,
    uploaderId: typeof raw.uploaderId === "string" ? raw.uploaderId : null,
    uploaderName: typeof raw.uploaderName === "string" ? raw.uploaderName : null,
    guildId: typeof raw.guildId === "string" ? raw.guildId : null,
    guildName: typeof raw.guildName === "string" ? raw.guildName : null,
    uploadedAt: raw.uploadedAt instanceof Timestamp
      ? raw.uploadedAt.toDate()
      : raw.uploadedAt instanceof Date
        ? raw.uploadedAt
        : null,
    processingMs: typeof raw.processingMs === "number" ? raw.processingMs : null,
    fileSizeBytes: typeof raw.fileSizeBytes === "number" ? raw.fileSizeBytes : null,
    errorCode: typeof raw.errorCode === "string" ? raw.errorCode : null,
  };
}

function normaliseStatus(status: unknown): UploadStatus {
  if (status === "success" || status === "failed" || status === "processing" || status === "queued") {
    return status;
  }
  return "unknown";
}

function buildOverview(records: UploadRecord[]): OverviewData {
  const statusCounts = new Map<UploadStatus, number>();
  const errorCounts = new Map<string, { count: number; lastSeen: Date | null }>();
  const uploaderCounts = new Map<string, { name: string; success: number; total: number }>();
  const guildCounts = new Map<string, { name: string; success: number; total: number }>();
  const processingTimes: number[] = [];
  let totalFileSize = 0;
  let last24h = 0;
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const timelineMap = new Map<string, TimelinePoint>();

  records.forEach((record) => {
    const current = statusCounts.get(record.status) ?? 0;
    statusCounts.set(record.status, current + 1);

    if (record.uploadedAt && record.uploadedAt.getTime() >= dayAgo) {
      last24h += 1;
    }

    if (record.processingMs != null) {
      processingTimes.push(record.processingMs);
    }

    if (record.fileSizeBytes != null) {
      totalFileSize += record.fileSizeBytes;
    }

    if (record.status === "failed" && record.errorCode) {
      const prev = errorCounts.get(record.errorCode) ?? { count: 0, lastSeen: null };
      errorCounts.set(record.errorCode, {
        count: prev.count + 1,
        lastSeen:
          !prev.lastSeen || (record.uploadedAt && prev.lastSeen < record.uploadedAt)
            ? record.uploadedAt
            : prev.lastSeen,
      });
    }

    const uploaderKey = record.uploaderId ?? record.uploaderName ?? `anon-${record.id}`;
    const uploaderPrev = uploaderCounts.get(uploaderKey) ?? { name: record.uploaderName ?? record.uploaderId ?? "Unknown", success: 0, total: 0 };
    uploaderCounts.set(uploaderKey, {
      name: record.uploaderName ?? record.uploaderId ?? "Unknown",
      success: uploaderPrev.success + (record.status === "success" ? 1 : 0),
      total: uploaderPrev.total + 1,
    });

    if (record.guildId || record.guildName) {
      const guildKey = record.guildId ?? record.guildName ?? `guild-${record.id}`;
      const guildPrev = guildCounts.get(guildKey) ?? { name: record.guildName ?? record.guildId ?? "Unknown", success: 0, total: 0 };
      guildCounts.set(guildKey, {
        name: record.guildName ?? record.guildId ?? "Unknown",
        success: guildPrev.success + (record.status === "success" ? 1 : 0),
        total: guildPrev.total + 1,
      });
    }

    if (record.uploadedAt) {
      const bucket = new Date(record.uploadedAt);
      bucket.setMinutes(0, 0, 0);
      const key = bucket.toISOString();
      const prev = timelineMap.get(key) ?? {
        hourLabel: formatHourLabel(bucket),
        timestamp: bucket,
        total: 0,
        success: 0,
        failed: 0,
      };
      timelineMap.set(key, {
        hourLabel: prev.hourLabel,
        timestamp: prev.timestamp,
        total: prev.total + 1,
        success: prev.success + (record.status === "success" ? 1 : 0),
        failed: prev.failed + (record.status === "failed" ? 1 : 0),
      });
    }
  });

  const total = records.length;
  const success = statusCounts.get("success") ?? 0;
  const failed = statusCounts.get("failed") ?? 0;

  const avgProcessingMs = processingTimes.length
    ? processingTimes.reduce((sum, value) => sum + value, 0) / processingTimes.length
    : null;

  const p95ProcessingMs = processingTimes.length
    ? percentile(processingTimes, 95)
    : null;

  const uniqueUploaders = uploaderCounts.size;
  const uniqueGuilds = guildCounts.size;

  const statusBreakdown = Array.from(statusCounts.entries())
    .map(([status, count]) => ({
      status,
      count,
      share: total ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const timeline = Array.from(timelineMap.values())
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 12);

  const issues = Array.from(errorCounts.entries())
    .map(([code, value]) => ({ code, ...value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const recentUploads = [...records]
    .sort((a, b) => (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0))
    .slice(0, 12);

  const recentFailures = records
    .filter((record) => record.status === "failed")
    .sort((a, b) => (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0));

  const topUploaders = Array.from(uploaderCounts.entries())
    .map(([id, value]) => ({
      id,
      name: value.name,
      count: value.total,
      successRate: value.total ? value.success / value.total : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topGuilds = Array.from(guildCounts.entries())
    .map(([id, value]) => ({
      id,
      name: value.name,
      count: value.total,
      successRate: value.total ? value.success / value.total : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    metrics: {
      totalUploads: total,
      last24h,
      successRate: total ? success / total : 0,
      failed,
      avgProcessingMs,
      p95ProcessingMs,
      uniqueUploaders,
      uniqueGuilds,
      totalFileSizeBytes: totalFileSize,
    },
    statusBreakdown,
    timeline,
    issues,
    recentFailures,
    recentUploads,
    topUploaders,
    topGuilds,
  };
}

function percentile(values: number[], perc: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const rank = (perc / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) {
    return sorted[low];
  }
  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: value > 0 && value < 0.1 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function statusColor(status: UploadStatus): string {
  switch (status) {
    case "success":
      return "#5CC689";
    case "failed":
      return "#FF6B6B";
    case "processing":
      return "#F9A825";
    case "queued":
      return "#5C8BC6";
    default:
      return "#8AA5C4";
  }
}

function formatStatus(status: UploadStatus): string {
  switch (status) {
    case "success":
      return "Success";
    case "failed":
      return "Failed";
    case "processing":
      return "Processing";
    case "queued":
      return "Queued";
    default:
      return "Unknown";
  }
}

function formatHourLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
