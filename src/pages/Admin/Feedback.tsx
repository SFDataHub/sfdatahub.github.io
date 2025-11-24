import React from "react";
import ContentShell from "../../components/ContentShell";
import { MessageSquare, Smile, Meh, Frown } from "lucide-react";

type Sentiment = "positive" | "neutral" | "negative";

type FeedbackItem = {
  id: string;
  user: string;
  channel: string;
  submittedAt: string;
  sentiment: Sentiment;
  summary: string;
  detail: string;
  status: string;
};

const feedback: FeedbackItem[] = [
  {
    id: "FDB-3401",
    user: "@ArcaneScout",
    channel: "In-app",
    submittedAt: "2024-06-19 21:45 UTC",
    sentiment: "positive",
    summary: "Guild Hub revamp",
    detail: "Really like the new roles overview. Could we pin favorite members?",
    status: "Triaged",
  },
  {
    id: "FDB-3398",
    user: "@ShadowScribe",
    channel: "Discord",
    submittedAt: "2024-06-19 20:18 UTC",
    sentiment: "neutral",
    summary: "Scan delays",
    detail: "Scans seemed slower tonight (~5m). Was there maintenance?",
    status: "Investigating",
  },
  {
    id: "FDB-3394",
    user: "@GuildLeader87",
    channel: "Email",
    submittedAt: "2024-06-19 18:02 UTC",
    sentiment: "negative",
    summary: "Roster export",
    detail: "Export CSV is missing player class data after last update.",
    status: "Open",
  },
  {
    id: "FDB-3389",
    user: "@PotionMaster",
    channel: "In-app",
    submittedAt: "2024-06-19 16:50 UTC",
    sentiment: "positive",
    summary: "New timeline",
    detail: "Timeline filters are great! Would love to save custom presets.",
    status: "In review",
  },
];

export default function AdminFeedback() {
  return (
    <ContentShell
      title="Feedback overview"
      subtitle="Monitor and triage incoming player feedback"
      centerFramed
      left={<SentimentBreakdown />}
      right={<FollowUpQueue />}
      leftWidth={240}
      rightWidth={280}
      stickyRails
      mode="page"
    >
      <div
        className="rounded-2xl border"
        style={{ borderColor: "#2B4C73", background: "#152A42" }}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "#2B4C73" }}
        >
          <div>
            <h2 className="text-sm font-semibold text-[#F5F9FF]">
              Latest submissions
            </h2>
            <p className="text-xs text-[#B0C4D9]">
              Sorted by most recent feedback across all channels.
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs"
            style={{ borderColor: "#2B4C73", color: "#F5F9FF" }}
          >
            <MessageSquare className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />
            Export thread
          </button>
        </header>
        <ul className="divide-y" style={{ borderColor: "#2B4C73" }}>
          {feedback.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[120px_160px_minmax(0,1fr)_120px] gap-4 px-5 py-4"
            >
              <div>
                <div className="font-mono text-xs text-[#8AA5C4]">{item.id}</div>
                <div className="text-sm text-[#F5F9FF]">{item.user}</div>
                <div className="text-xs text-[#B0C4D9]">{item.channel}</div>
              </div>
              <div className="text-xs text-[#B0C4D9]">{item.submittedAt}</div>
              <div>
                <div className="text-sm font-semibold text-[#F5F9FF]">
                  {item.summary}
                </div>
                <div className="mt-1 text-xs text-[#B0C4D9]">{item.detail}</div>
              </div>
              <div className="flex flex-col items-end gap-2 text-right">
                <SentimentBadge value={item.sentiment} />
                <span
                  className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide"
                  style={{ borderColor: "#2B4C73", color: "#F5F9FF" }}
                >
                  {item.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ContentShell>
  );
}

function SentimentBadge({ value }: { value: Sentiment }) {
  const map: Record<Sentiment, { label: string; color: string; Icon: React.ComponentType<any> }> = {
    positive: { label: "Positive", color: "#38B26C", Icon: Smile },
    neutral: { label: "Neutral", color: "#F9A825", Icon: Meh },
    negative: { label: "Negative", color: "#FF6B6B", Icon: Frown },
  };

  const { label, color, Icon } = map[value];

  return (
    <span
      className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: "#1A2F4A", color }}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}

function SentimentBreakdown() {
  const entries: Array<{ label: string; value: string; color: string }> = [
    { label: "Positive", value: "48%", color: "#38B26C" },
    { label: "Neutral", value: "32%", color: "#F9A825" },
    { label: "Negative", value: "20%", color: "#FF6B6B" },
  ];

  return (
    <aside className="space-y-4 text-sm">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8AA5C4]">
          Sentiment mix
        </h3>
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.label}
              className="flex items-center justify-between rounded-xl border px-3 py-2"
              style={{ borderColor: "#2B4C73", background: "#1A2F4A" }}
            >
              <span className="text-xs text-[#B0C4D9]">{entry.label}</span>
              <span className="text-sm font-semibold" style={{ color: entry.color }}>
                {entry.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8AA5C4]">
          Last sync
        </h3>
        <p className="mt-2 text-xs text-[#B0C4D9]">
          Feedback sources synced 12 minutes ago. Next pull scheduled in 5 minutes.
        </p>
      </div>
    </aside>
  );
}

function FollowUpQueue() {
  const actions = [
    { label: "Assign to product", detail: "2 waiting", color: "#5C8BC6" },
    { label: "Reply templates", detail: "Updated yesterday", color: "#8AA5C4" },
    { label: "Quarterly NPS", detail: "Survey closes in 3 days", color: "#F9A825" },
  ];

  return (
    <aside className="space-y-4 text-sm">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8AA5C4]">
          Follow-ups
        </h3>
        <ul className="mt-3 space-y-2">
          {actions.map((action) => (
            <li
              key={action.label}
              className="rounded-xl border px-4 py-3"
              style={{ borderColor: "#2B4C73", background: "#1A2F4A" }}
            >
              <div className="text-sm font-semibold text-[#F5F9FF]">{action.label}</div>
              <div className="mt-1 text-xs" style={{ color: action.color }}>
                {action.detail}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8AA5C4]">
          Insights
        </h3>
        <p className="mt-2 text-xs text-[#B0C4D9]">
          Trending requests highlight roster export improvements and saved filter presets.
        </p>
      </div>
    </aside>
  );
}
