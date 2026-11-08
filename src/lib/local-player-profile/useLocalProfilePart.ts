import { auditResultId } from "../data-hub/runtimeAudit";
import { useRuntimeAuditCommit } from "../data-hub/useRuntimeAuditCommit";
import { useEffect, useState, useRef } from "react";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import type { LocalProfilePart } from "./contract";
import { acquireLocalPlayerProfile, type LocalProfileArea, type LocalProfileValues, type LocalProfileLease } from "./coordinator";
import { localProfileContextKey } from "./historyBasis";

export function useLocalProfilePart<K extends LocalProfileArea>(profile: LocalPlayerProfileModel, area: K, comparison?: number | null, enabled = true) {
  const key = localProfileContextKey(profile);
  const acceptedAuditId = useRef<string>();
  const leaseRef = useRef<LocalProfileLease>();
  const [state, setState] = useState<{ key: string; area: K; comparison?: number | null; part: LocalProfilePart<LocalProfileValues[K]> }>({ key, area, comparison, part: { status: "loading", value: null } });
  useEffect(() => {
    const lease = acquireLocalPlayerProfile(profile);
    leaseRef.current = lease;
    return () => { lease.release(); if (leaseRef.current === lease) leaseRef.current = undefined; };
  }, [key]);
  useEffect(() => {
    if (!enabled) return;
    const lease = leaseRef.current!;
    return lease.watch(area, comparison, part => {
      acceptedAuditId.current = auditResultId(part);
      setState(previous => ({ key, area, comparison, part: part.status === "loading" && area !== "current" && area !== "currentInsights" &&
        previous.key === key && previous.area === area && previous.comparison === comparison && previous.part.value
        ? { ...part, value: previous.part.value } : part }));
    });
  }, [key, area, comparison, enabled]);
  // A new target must never render the previous target's values for one frame.
  const part = state.key === key && state.area === area && state.comparison === comparison ? state.part : { status: "loading" as const, value: null };
  useRuntimeAuditCommit(part.value, part.status === "ready" || part.status === "partial", `profile:${area}`, acceptedAuditId.current);
  return { ...part, retry: () => leaseRef.current?.retry() };
}
