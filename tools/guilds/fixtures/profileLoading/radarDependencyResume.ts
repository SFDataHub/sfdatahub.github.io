import { subscribeToLocalDataDependencies } from "../../../../src/lib/local-data/localDataDependencies";

/** Runs in an isolated browser; no product source or identity mutations. */
export async function verifyRadarDependencyResume() {
  const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
  const until = async (predicate: () => boolean) => {
    for (let i = 0; i < 400; i++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw Error("Dependency resume fixture timed out");
  };
  let selected = "September", checked = selected, calls = 0, notifications = 0, active = 0, maximumActive = 0;
  let release: (() => void) | undefined;
  let hold = true;
  const errors: unknown[] = [];
  const stop = subscribeToLocalDataDependencies({}, () => { notifications++; }, error => errors.push(error), undefined, async () => {
    calls++; active++; maximumActive = Math.max(maximumActive, active);
    const snapshot = selected;
    try {
      if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; }); }
      const changed = snapshot !== checked;
      checked = snapshot;
      return changed;
    } finally { active--; }
  });
  try {
    window.dispatchEvent(new Event("focus"));
    await until(() => Boolean(release));
    selected = "August";
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    release!();
    await until(() => calls === 2 && active === 0 && notifications === 1);
    assert(maximumActive === 1, "Concurrent external probes must serialize");
    assert(checked === "August", "Changes during a probe must reach the pending pass");
    window.dispatchEvent(new Event("focus"));
    await until(() => calls === 3 && active === 0);
    assert(notifications === 1, "Unchanged selection must not notify consumers");
    assert(errors.length === 0, "Resume checks must succeed");
    return { calls, notifications, maximumActive, checked };
  } finally { stop(); }
}
