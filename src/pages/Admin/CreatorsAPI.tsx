import React from "react";
import ContentShell from "../../components/ContentShell";
import { useCreatorSnapshot } from "../../hooks/useCreatorSnapshot";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article
      className="rounded-2xl border p-4"
      style={{ background: "#152A42", borderColor: "#2B4C73" }}
    >
      <div className="text-xs uppercase tracking-wide text-[#8AA5C4]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-[#B0C4D9]">{hint}</div>}
    </article>
  );
}

export default function AdminCreatorsAPI() {
  const { snapshot, error, loading, refresh } = useCreatorSnapshot();
  const warnings = snapshot?.warnings ?? [];
  const totalCreators = snapshot?.data?.length ?? 0;
  const stats = snapshot?.stats ?? {};

  return (
    <ContentShell
      title="Creator API Monitor"
      subtitle="Track the ingestion pipeline for YouTube & Twitch stats"
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-2xl border px-4 py-2 text-sm"
            style={{ borderColor: "#2B4C73", color: "#F5F9FF" }}
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh snapshot"}
          </button>
        </div>
      }
      centerFramed
      stickyRails
    >
      <div className="space-y-4">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            label="Last successful sync"
            value={snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : "not available"}
            hint={error ? "Falling back to static data" : ""}
          />
          <StatCard label="Creators tracked" value={totalCreators ? totalCreators.toString() : "0"} />
          <StatCard
            label="API lookups"
            value={`${stats.youtubeLookups ?? 0} • ${stats.twitchLookups ?? 0}`}
            hint="YouTube • Twitch"
          />
        </section>

        <section className="rounded-2xl border p-4" style={{ background: "#152A42", borderColor: "#2B4C73" }}>
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-[#F5F9FF]">Warnings</h2>
            <p className="text-xs text-[#B0C4D9]">Latest issues reported by the sync script.</p>
          </header>
          {warnings.length === 0 ? (
            <p className="text-xs text-[#8AA5C4]">No warnings logged in the last snapshot.</p>
          ) : (
            <ul className="space-y-2">
              {warnings.map((w, idx) => (
                <li
                  key={`${w.scope}-${idx}`}
                  className="rounded-xl border px-4 py-3"
                  style={{ borderColor: "#2B4C73", background: "#1A2F4A" }}
                >
                  <div className="text-sm font-semibold text-[#F5F9FF]">
                    {w.creator} • {w.scope}
                  </div>
                  <div className="text-xs text-[#B0C4D9]">{w.message}</div>
                  {w.source && (
                    <div className="text-[11px] text-[#8AA5C4]">{w.source}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border p-4" style={{ background: "#152A42", borderColor: "#2B4C73" }}>
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-[#F5F9FF]">How to update creator stats</h2>
            <p className="text-xs text-[#B0C4D9]">Run the sync script locally or on a scheduler.</p>
          </header>
          <ol className="list-decimal space-y-2 pl-5 text-xs text-[#B0C4D9]">
            <li>
              Add the following environment variables (e.g. in <code>.env.local</code>):
              <pre className="mt-2 rounded-xl bg-[#0F1E33] p-3 text-[11px] text-[#F5F9FF]">
YOUTUBE_API_KEY=...
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
              </pre>
            </li>
            <li>
              Execute the sync script:
              <pre className="mt-2 rounded-xl bg-[#0F1E33] p-3 text-[11px] text-[#F5F9FF]">
pnpm sync:creators
              </pre>
            </li>
            <li>
              Commit/deploy the generated <code>public/data/creators-live.json</code> or upload it to hosting so the
              frontend can pick up the latest snapshot.
            </li>
          </ol>
          {error && <p className="mt-3 text-xs text-[#ff90a3]">Live snapshot error: {error}</p>}
        </section>
      </div>
    </ContentShell>
  );
}
