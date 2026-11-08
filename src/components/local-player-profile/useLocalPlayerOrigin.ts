import { useEffect, useState } from "react";
import type { LocalPlayerProfileModel } from "./types";
import { loadIdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { resolvePlayerOriginServer } from "../../lib/identities/playerOrigin";
import { subscribeToLocalDataDependencies } from "../../lib/local-data/localDataDependencies";

export function useLocalPlayerOrigin(profile: LocalPlayerProfileModel) {
  const identifier = profile.currentSeed?.rawIdentifier ?? profile.analytics.memberRef ?? profile.sourcePlayerKey;
  const raw = profile.currentSeed?.rawPlayer ?? null;
  const [result, setResult] = useState<{ identifier: string; raw: typeof raw; label: string | null }>();
  useEffect(() => {
    let stopped = false, generation = 0;
    const load = async () => {
      const attempt = ++generation;
      setResult(undefined);
      try {
        const identity = await loadIdentityResolutionSnapshot();
        const origin = resolvePlayerOriginServer(identity, identifier, raw);
        if (!stopped && generation === attempt) setResult({ identifier, raw, label: origin?.displayName ?? null });
      } catch { if (!stopped && generation === attempt) setResult({ identifier, raw, label: null }); }
    };
    void load();
    const stop = subscribeToLocalDataDependencies({ allIdentities: true }, () => { void load(); });
    return () => { stopped = true; generation++; stop(); };
  }, [identifier, raw]);
  return result?.identifier === identifier && result.raw === raw ? result.label : null;
}
