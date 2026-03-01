// src/components/toplists/GuildToplists.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  getLatestGuildToplistSnapshotCached,
  type FirestoreToplistGuildRow,
  type FirestoreLatestGuildToplistSnapshot,
  type FirestoreLatestGuildToplistResult,
} from "../../lib/api/toplistsFirestore";
import { SERVERS } from "../../data/servers";
import i18n from "../../i18n";
import { useFilters } from "../../components/Filters/FilterContext";
import { useAuth } from "../../context/AuthContext";

type GuildToplistsProps = {
  serverCodes?: string[];
};

const normalizeServerList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = String(entry || "").trim().toUpperCase();
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
};

const normalizeFavoriteIdentifier = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || null;
};

const buildCanonicalFavoriteServerKey = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (/^[a-z0-9]+_(?:eu|net)$/.test(raw)) return raw;

  const euMatch = raw.match(/^s?(\d+)$/);
  if (euMatch) return `s${euMatch[1]}_eu`;
  const euCodeMatch = raw.match(/^eu(\d+)$/);
  if (euCodeMatch) return `s${euCodeMatch[1]}_eu`;
  const fusionMatch = raw.match(/^f(\d+)$/);
  if (fusionMatch) return `f${fusionMatch[1]}_net`;
  const amMatch = raw.match(/^am(\d+)$/);
  if (amMatch) return `am${amMatch[1]}_net`;
  return null;
};

const buildGuildFavoriteIdentifierFromRow = (row: FirestoreToplistGuildRow): string | null => {
  const guildId = String(row.guildId ?? "").trim();
  if (!guildId) return null;
  const serverKey = buildCanonicalFavoriteServerKey(row.server);
  if (!serverKey) return null;
  return `${serverKey}_g${guildId}`.toLowerCase();
};

const parseLastScanString = (value: string): number | null => {
  const raw = value.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  const datePart = parts[0] ?? "";
  const timePart = parts[1] ?? "";
  const dateBits = datePart.split(".");
  if (dateBits.length !== 3) return null;
  const day = Number(dateBits[0]);
  const month = Number(dateBits[1]);
  const year = Number(dateBits[2]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  let hours = 0;
  let minutes = 0;
  if (timePart) {
    const timeBits = timePart.split(":");
    if (timeBits.length < 2) return null;
    hours = Number(timeBits[0]);
    minutes = Number(timeBits[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  }
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getTime();
};

const toMsFromLastScan = (value: string | number | null | undefined): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  return parseLastScanString(raw);
};

const formatLastScanDisplay = (value: string | number | null | undefined): string => {
  if (value == null || value === "") return "";
  const ms = toMsFromLastScan(value);
  if (ms == null) return String(value);
  return new Date(ms).toLocaleString();
};

export default function GuildToplists({ serverCodes }: GuildToplistsProps) {
  const { favoritesOnly } = useFilters();
  const { user } = useAuth();
  const [rows, setRows] = useState<FirestoreToplistGuildRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [rowLimit, setRowLimit] = useState<number | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const resolvedServers = useMemo(() => {
    const normalized = normalizeServerList(serverCodes ?? []);
    if (normalized.length) return normalized;
    const fallback = SERVERS.find((server) => server.id)?.id || "EU1";
    const fallbackCode = String(fallback).toUpperCase();
    return fallbackCode ? [fallbackCode] : [];
  }, [serverCodes]);
  const resolvedServerKey = useMemo(() => resolvedServers.join(","), [resolvedServers]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    if (!resolvedServers.length) {
      setRows([]);
      setUpdatedAt(null);
      setRowLimit(null);
      setError(i18n.t("toplistsPage.errors.noSnapshot", "No snapshot yet for this server."));
      setLoading(false);
      return () => {
        active = false;
      };
    }

    type SnapshotError = { error: string; detail?: string };
    Promise.all(resolvedServers.map((serverCode) => getLatestGuildToplistSnapshotCached(serverCode)))
      .then((results) => {
        if (!active) return;
        const snapshots: FirestoreLatestGuildToplistSnapshot[] = [];
        let firstErrorCode: string | null = null;
        let firstErrorDetail: string | null = null;

        results.forEach((result: FirestoreLatestGuildToplistResult) => {
          if (result.ok) {
            snapshots.push(result.snapshot);
          } else if (!firstErrorCode) {
            const err: any = result;
            firstErrorCode = err.error ?? null;
            firstErrorDetail = err.detail ?? null;
          }
        });

        if (!snapshots.length) {
          const detail = firstErrorDetail ? ` (${firstErrorDetail})` : "";
          let errorMsg = "Firestore Fehler";
          if (firstErrorCode === "not_found") {
            errorMsg = i18n.t("toplistsPage.errors.noSnapshot", "No snapshot yet for this server.");
          } else if (firstErrorCode === "decode_error") {
            errorMsg = "Fehler beim Lesen der Daten";
          }
          setRows([]);
          setUpdatedAt(null);
          setRowLimit(null);
          setError(`${errorMsg}${detail}`);
          return;
        }

        let nextUpdatedAt: number | null = null;
        let nextLimit = 0;
        const merged: FirestoreToplistGuildRow[] = [];

        snapshots.forEach((snapshot) => {
          if (snapshot.updatedAt != null) {
            nextUpdatedAt = nextUpdatedAt == null ? snapshot.updatedAt : Math.max(nextUpdatedAt, snapshot.updatedAt);
          }
          const guilds = Array.isArray(snapshot.guilds) ? snapshot.guilds : [];
          nextLimit = Math.max(nextLimit, guilds.length);
          guilds.forEach((row: FirestoreToplistGuildRow) => {
            merged.push(row.server ? row : row);
          });
        });

        setRows(merged);
        setUpdatedAt(nextUpdatedAt);
        setRowLimit(nextLimit || null);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        console.error("[GuildToplists] unexpected error", err);
        setRows([]);
        setUpdatedAt(null);
        setRowLimit(null);
        setError("Unerwarteter Fehler beim Laden");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [resolvedServerKey]);

  const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("en").format(n));
  const fmtDate = (ts: number | null | undefined) => {
    if (ts == null) return null;
    const ms = ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms).toLocaleString();
  };
  const favoriteGuildSet = useMemo(() => {
    const keys = Object.keys(user?.favorites?.guilds ?? {});
    return new Set(keys.map((key) => normalizeFavoriteIdentifier(key)).filter((v): v is string => !!v));
  }, [user?.favorites?.guilds]);

  const displayRows = useMemo(() => {
    let list = Array.isArray(rows) ? [...rows] : [];
    if (!list.length) return list;

    if (favoritesOnly && user) {
      list = list.filter((row) => {
        const identifier = buildGuildFavoriteIdentifierFromRow(row);
        return !!(identifier && favoriteGuildSet.has(identifier));
      });
    }

    const compareNumber = (aVal: number | null, bVal: number | null) => {
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      return bVal - aVal;
    };

    list.sort((a, b) => compareNumber(a.sumAvg, b.sumAvg));

    if (rowLimit != null && rowLimit > 0 && list.length > rowLimit) {
      list = list.slice(0, rowLimit);
    }

    return list;
  }, [rows, rowLimit, favoritesOnly, user, favoriteGuildSet]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ opacity: 0.8, fontSize: 12 }}>
        Guilds - snapshots (latest){resolvedServers.length ? ` - ${resolvedServers.join(", ")}` : ""}
      </div>
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>{loading ? "Loading..." : error ? "Error" : "Ready"} - {displayRows.length} rows</div>
        <div>{updatedAt ? `Updated: ${fmtDate(updatedAt)}` : null}</div>
      </div>

      {error && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div style={{ wordBreak: "break-all" }}>{error}</div>
          <button
            onClick={() => navigate(`${location.pathname}${location.search}${location.hash}`)}
            style={{ marginTop: 8 }}
          >
            Retry
          </button>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2C4A73" }}>
              <th style={{ padding: "8px 6px" }}>#</th>
              <th style={{ padding: "8px 6px" }}>Server</th>
              <th style={{ padding: "8px 6px" }}>Name</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Members</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Avg Lv</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Avg Sum</th>
              <th style={{ padding: "8px 6px" }}>Last Scan</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((g, idx) => (
              <tr key={`${g.guildId}-${g.server}`} style={{ borderBottom: "1px solid #2C4A73" }}>
                <td style={{ padding: "8px 6px" }}>{idx + 1}</td>
                <td style={{ padding: "8px 6px" }}>{g.server}</td>
                <td style={{ padding: "8px 6px" }}>{g.name}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(g.memberCount)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(g.avgLevel)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(g.sumAvg)}</td>
                <td style={{ padding: "8px 6px" }}>{formatLastScanDisplay(g.lastScan)}</td>
              </tr>
            ))}
            {loading && displayRows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 12 }}>Loading...</td></tr>
            )}
            {!loading && !error && displayRows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 12 }}>No results</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
