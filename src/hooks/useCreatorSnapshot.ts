import { useEffect, useState } from "react";
import { Creator, CreatorSnapshot } from "../lib/creators/shared";

interface SnapshotResult {
  snapshot: CreatorSnapshot | null;
  error: string;
  loading: boolean;
  refresh: () => void;
}

function parseSnapshotPayload(payload: any): CreatorSnapshot {
  const data: Creator[] = Array.isArray(payload)
    ? (payload as Creator[])
    : Array.isArray(payload?.data)
    ? (payload.data as Creator[])
    : [];

  return {
    generatedAt: payload?.generatedAt ?? new Date().toISOString(),
    data,
    warnings: payload?.warnings ?? payload?.errors ?? [],
    stats: payload?.stats,
  };
}

export function useCreatorSnapshot(url = "/data/creators-live.json"): SnapshotResult {
  const [snapshot, setSnapshot] = useState<CreatorSnapshot | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const payload = await res.json();
        if (!cancelled) {
          setSnapshot(parseSnapshotPayload(payload));
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load creator snapshot");
          setSnapshot(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  return {
    snapshot,
    error,
    loading,
    refresh: () => setNonce((n) => n + 1),
  };
}
