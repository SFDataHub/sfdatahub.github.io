import React from "react";
import ContentShell from "../../components/ContentShell";

const errorRows = [
  {
    id: "ERR-1201",
    time: "2024-06-20 12:42 UTC",
    service: "scans/ingest",
    severity: "critical",
    message: "Queue depth exceeded threshold (depth=1,200)",
  },
  {
    id: "ERR-1199",
    time: "2024-06-20 12:11 UTC",
    service: "webhooks/guild-sync",
    severity: "warning",
    message: "Webhook delivery failed after 3 retries",
  },
  {
    id: "ERR-1197",
    time: "2024-06-20 11:38 UTC",
    service: "jobs/pipeline",
    severity: "critical",
    message: "Worker heartbeat missing for shard eu-west-2",
  },
  {
    id: "ERR-1188",
    time: "2024-06-20 09:26 UTC",
    service: "api/public",
    severity: "info",
    message: "Client rate limited (userId=84322)",
  },
];

export default function AdminErrorLog() {
  return (
    <ContentShell
      title="Error log"
      subtitle="Chronological record of platform level issues"
      centerFramed
      mode="page"
      stickyTopbar
    >
      <div className="rounded-2xl border" style={{ borderColor: "#2B4C73", background: "#152A42" }}>
        <div
          className="grid grid-cols-[120px_170px_minmax(0,1fr)_120px] gap-4 border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide"
          style={{ borderColor: "#2B4C73", color: "#D6E4F7" }}
        >
          <span>ID</span>
          <span>Time</span>
          <span>Service</span>
          <span className="text-right">Severity</span>
        </div>
        <ul>
          {errorRows.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-[120px_170px_minmax(0,1fr)_120px] gap-4 border-t px-5 py-4 text-sm"
              style={{ borderColor: "#2B4C73", color: "#FFFFFF" }}
            >
              <span className="font-mono text-[#8AA5C4]">{row.id}</span>
              <span className="text-xs text-[#B0C4D9]">{row.time}</span>
              <div>
                <div className="text-sm text-[#F5F9FF]">{row.service}</div>
                <div className="mt-1 text-xs text-[#B0C4D9]">{row.message}</div>
              </div>
              <span
                className="text-xs font-semibold uppercase tracking-wide text-right"
                style={{ color: severityColor(row.severity) }}
              >
                {row.severity}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ContentShell>
  );
}

function severityColor(level: string) {
  switch (level) {
    case "critical":
      return "#FF6B6B";
    case "warning":
      return "#F9A825";
    default:
      return "#8AA5C4";
  }

}


