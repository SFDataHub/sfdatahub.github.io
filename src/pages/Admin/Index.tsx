import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ActivitySquare, ServerCog, Users } from "lucide-react";
import ContentShell from "../../components/ContentShell";

const metricCards = [
  {
    icon: <Users className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />,
    label: "Active Sessions",
    value: "1,248",
    hint: "+5.2% vs. last week",
  },
  {
    icon: <ActivitySquare className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />,
    label: "Ingestion Rate",
    value: "98.4%",
    hint: "Stable in the last 24h",
  },
  {
    icon: <ServerCog className="h-4 w-4 text-[#5C8BC6]" aria-hidden="true" />,
    label: "Service Health",
    value: "Operational",
    hint: "No incidents detected",
  },
];

const errorPreview = [
  {
    id: "job-sync",
    title: "Background job stalled",
    time: "2 minutes ago",
    scope: "jobs/pipeline",
  },
  {
    id: "webhook-42",
    title: "Webhook delivery failed",
    time: "18 minutes ago",
    scope: "webhooks/guild-sync",
  },
  {
    id: "scan-queue",
    title: "Scan queue retry limit reached",
    time: "36 minutes ago",
    scope: "scans/queue",
  },
];

const deployments = [
  {
    env: "Production",
    version: "2024.06.18",
    status: "Healthy",
    time: "Deployed 4h ago",
  },
  {
    env: "Staging",
    version: "2024.06.20-rc1",
    status: "Needs verification",
    time: "Awaiting QA sign-off",
  },
];

export default function AdminIndex() {
  return (
    <ContentShell
      title="Admin Control Center"
      subtitle="Operational overview for administrators"
      actions={
        <div className="flex gap-2">
          <Link
            to="/admin/errors"
            className="rounded-2xl border px-4 py-2 text-sm no-underline"
            style={{ borderColor: "#2B4C73", color: "#F5F9FF" }}
          >
            View error log
          </Link>
          <button
            type="button"
            className="rounded-2xl border px-4 py-2 text-sm"
            style={{ borderColor: "#2B4C73", color: "#F5F9FF" }}
          >
            Refresh data
          </button>
        </div>
      }
      left={<LeftRail />}
      right={<RightRail />}
      centerFramed
      leftWidth={260}
      rightWidth={320}
      stickyRails
    >
      <div className="space-y-4">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {metricCards.map((card) => (
            <article
              key={card.label}
              className="rounded-2xl border p-4"
              style={{ background: "#152A42", borderColor: "#2B4C73" }}
            >
              <div className="flex items-start justify-between">
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

        <section
          className="rounded-2xl border p-4"
          style={{ background: "#152A42", borderColor: "#2B4C73" }}
        >
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F9FF]">Recent incidents</h2>
              <p className="text-xs text-[#B0C4D9]">
                Latest critical signals collected across the platform.
              </p>
            </div>
            <Link
              to="/admin/errors"
              className="text-xs no-underline"
              style={{ color: "#5C8BC6" }}
            >
              Go to log
            </Link>
          </header>
          <ul className="space-y-3">
            {errorPreview.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border px-4 py-3"
                style={{ borderColor: "#2B4C73", background: "#1A2F4A" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#F5F9FF]">
                      <AlertTriangle className="h-4 w-4 text-[#F9A825]" aria-hidden="true" />
                      {item.title}
                    </div>
                    <div className="mt-1 text-xs text-[#B0C4D9]">Scope: {item.scope}</div>
                  </div>
                  <span className="text-xs text-[#8AA5C4]">{item.time}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ContentShell>
  );
}

function LeftRail() {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="text-[#F5F9FF]">Quick access</div>
        <div className="mt-2 flex flex-col gap-2">
          <Link
            to="/dashboard"
            className="rounded-xl border px-3 py-2 text-xs no-underline"
            style={{ borderColor: "#2B4C73", background: "#1A2F4A", color: "#F5F9FF" }}
          >
            Global dashboard
          </Link>
          <Link
            to="/admin/scans-uploaded"
            className="rounded-xl border px-3 py-2 text-xs no-underline"
            style={{ borderColor: "#2B4C73", background: "#1A2F4A", color: "#F5F9FF" }}
          >
            Scans uploaded
          </Link>
          <Link
            to="/admin/errors"
            className="rounded-xl border px-3 py-2 text-xs no-underline"
            style={{ borderColor: "#2B4C73", background: "#1A2F4A", color: "#F5F9FF" }}
          >
            Error log
          </Link>
        </div>
      </div>
      <div>
        <div className="text-[#F5F9FF]">Escalation</div>
        <ul className="mt-2 space-y-1 text-xs text-[#B0C4D9]">
          <li>• Pager rotation: Ops Team</li>
          <li>• Slack channel: #sf-alerts</li>
          <li>• Next review: Today 17:00</li>
        </ul>
      </div>
    </div>
  );
}

function RightRail() {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="text-[#F5F9FF]">Deployment status</div>
        <ul className="mt-3 space-y-2">
          {deployments.map((release) => (
            <li
              key={release.env}
              className="rounded-xl border px-4 py-3"
              style={{ borderColor: "#2B4C73", background: "#1A2F4A" }}
            >
              <div className="text-xs uppercase tracking-wide text-[#8AA5C4]">
                {release.env}
              </div>
              <div className="mt-1 text-sm font-semibold text-[#F5F9FF]">
                {release.version}
              </div>
              <div className="mt-1 text-xs text-[#B0C4D9]">{release.status}</div>
              <div className="mt-1 text-[11px] text-[#8AA5C4]">{release.time}</div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-[#F5F9FF]">Maintenance</div>
        <p className="mt-2 text-xs text-[#B0C4D9]">
          Window scheduled for Sunday 02:00–04:00 UTC. Expect short downtime for guild
          aggregation services.
        </p>
      </div>
    </div>
  );
}