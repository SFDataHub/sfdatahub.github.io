// src/components/toplists/GuildToplists.tsx
import React, { useEffect, useMemo, useState } from "react";

import { getLatestGuildToplistSnapshot, type FirestoreToplistGuildRow } from "../../lib/api/toplistsFirestore";
import { SERVERS } from "../../data/servers";
import i18n from "../../i18n";

type GuildToplistsProps = {
  serverCode?: string;
};

export default function GuildToplists({ serverCode }: GuildToplistsProps) {
  const [rows, setRows] = useState<FirestoreToplistGuildRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const resolvedServer = useMemo(() => {
    const fromParam = (serverCode || "").trim();
    if (fromParam) return fromParam.toUpperCase();
    const fallback = SERVERS.find((server) => server.id)?.id || "EU1";
    return String(fallback).toUpperCase();
  }, [serverCode]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getLatestGuildToplistSnapshot(resolvedServer)
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setRows(result.snapshot.guilds);
          setUpdatedAt(result.snapshot.updatedAt ?? null);
          setError(null);
          return;
        }

        const detail = result.detail ? ` (${result.detail})` : "";
        let errorMsg = "Firestore Fehler";
        if (result.error === "not_found") {
          errorMsg = i18n.t("toplistsPage.errors.noSnapshot", "No snapshot yet for this server.");
        } else if (result.error === "decode_error") {
          errorMsg = "Fehler beim Lesen der Daten";
        }
        setRows([]);
        setUpdatedAt(null);
        setError(`${errorMsg}${detail}`);
      })
      .catch((err) => {
        if (!active) return;
        console.error("[GuildToplists] unexpected error", err);
        setRows([]);
        setUpdatedAt(null);
        setError("Unerwarteter Fehler beim Laden");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [resolvedServer]);

  const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("en").format(n));
  const fmtDate = (ts: number | null | undefined) => {
    if (ts == null) return null;
    const ms = ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms).toLocaleString();
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ opacity: 0.8, fontSize: 12 }}>
        Guilds - snapshot (latest){resolvedServer ? ` - ${resolvedServer}` : ""}
      </div>
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>{loading ? "Loading..." : error ? "Error" : "Ready"} - {rows.length} rows</div>
        <div>{updatedAt ? `Updated: ${fmtDate(updatedAt)}` : null}</div>
      </div>

      {error && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div style={{ wordBreak: "break-all" }}>{error}</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      {rows.map((g, idx) => (
        <div
          key={`${g.guildId}-${idx}`}
          style={{
            display: "grid",
            gridTemplateColumns: "56px 1fr 140px 140px",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #2C4A73",
            background: "#14273E",
            fontSize: 14,
            alignItems: "center",
          }}
        >
          <div>#{idx + 1}</div>
          <div>{g.name} - {g.server}</div>
          <div>Avg Lv {fmtNum(g.avgLevel)}</div>
          <div>Avg Sum {fmtNum(g.sumAvg)}</div>
        </div>
      ))}

      {loading && rows.length === 0 && (
        <div style={{ padding: 12 }}>Loading...</div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div style={{ padding: 12 }}>No results</div>
      )}
    </div>
  );
}
