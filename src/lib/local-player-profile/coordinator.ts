import type { PreparedProfileHistory } from "./profileExecution";
import { auditBegin, auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditDiscard, auditCaught, auditCall, auditCurrent, auditLink, auditPromiseId, auditAccept, auditExpectGraph, auditResultId, auditResultTrigger } from "../data-hub/runtimeAudit";
import { sharedAnalyticsPreparation, type AnalyticsPreparationLease } from "./sharedPreparation";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import { type LocalPlayerAnalyticsResult } from "../../components/local-player-profile/localPlayerAnalyticsModel";
import { buildCurrentScanInsights, type LocalCurrentInsights, type LocalPlayerInsightsModel } from "../../components/local-player-profile/localPlayerInsightsModel";
import { buildLocalPlayerProfileModel } from "../../pages/GuildHub/localPlayerProfileAdapter";
import { isLocalPlayerCurrentSeedValid, resolveLocalPlayerCurrentSeed, type LocalPlayerCurrentSeed } from "../../pages/GuildHub/localPlayerCurrentSeed";
import { subscribeToLocalDataDependencies, type LocalDependencySubscription } from "../local-data/localDataDependencies";
import { subscribeToLocalDataChanges, type LocalDataDependencies } from "../local-data/localDataChanges";
import { readGuildAnalyticsResetCertificate } from "../guilds/localGuildAnalyticsStore";
import { checkProfileWork, profileAbortError, protectProfileBasis, type LocalProfilePart } from "./contract";
import { emptyProfileBuildCounters, initialProfileNeed, isLocalProfileEvidenceCurrent, localProfileContextKey, localProfileHistoryContextKey, type LocalProfileHistoryTarget, LOCAL_PROFILE_PROJECTION_VERSION, type ProfileBuildCounters } from "./historyBasis";

import type { LocalProfileComparison, PlayerChartArea, PlayerContentView } from "./viewCharts";
import type { AttributeSumMode } from "../settings/preferences";

export type LocalProfileValues = Record<PlayerChartArea, LocalPlayerAnalyticsResult> & {
  current: Omit<LocalPlayerProfileModel, "currentSeed">;
  history: PreparedProfileHistory;
  analytics: LocalPlayerAnalyticsResult;
  comparison: LocalPlayerAnalyticsResult["comparison"];
  career: LocalPlayerAnalyticsResult["career"];
  currentInsights: LocalCurrentInsights;
  bests: LocalPlayerInsightsModel["personalBests"];
};
export type LocalProfileArea = keyof LocalProfileValues;
type Flight<T> = { controller: AbortController; users: Set<symbol>; promise: Promise<T> };
type AnyPart = LocalProfilePart<LocalProfileValues[LocalProfileArea]>;
type Watcher = { area: LocalProfileArea; run: () => void };
export type LocalProfileLease = {
  request: <K extends LocalProfileArea>(area: K, comparison?: LocalProfileComparison) => Promise<LocalProfilePart<LocalProfileValues[K]>>;
  watch: <K extends LocalProfileArea>(area: K, comparison: LocalProfileComparison | undefined, listener: (part: LocalProfilePart<LocalProfileValues[K]>) => void) => () => void;
  retry: () => void;
  revalidate: () => Promise<void>;
  release: () => void;
  readonly counters: ProfileBuildCounters;
};

/** Realm-local sharing, exclusively while at least one context lease is active.
 * Controllers belong to flights. Consumer signals only release their own lease.
 * Raw/Derived commits and foreign acquisition/worker controllers are untouched. */
export function createLocalPlayerProfileCoordinator() {
  const contexts = new Map<string, ProfileContext>();
  const histories = new Map<string, SharedHistory>();
  function acquire(profile: LocalPlayerProfileModel, signal?: AbortSignal, playerChartsOnly = false): LocalProfileLease {
    const key = JSON.stringify([localProfileContextKey(profile), playerChartsOnly]);
    let context = contexts.get(key);
    if (!context) {
      const historyKey = localProfileHistoryContextKey({ ...profile, playerChartsOnly });
      let history = histories.get(historyKey);
      if (!history) {
        history = new SharedHistory(profile, () => { if (histories.get(historyKey) === history) histories.delete(historyKey); }, playerChartsOnly);
        histories.set(historyKey, history);
      }
      context = new ProfileContext(profile, history, () => { if (contexts.get(key) === context) contexts.delete(key); });
      contexts.set(key, context);
    }
    return context.acquire(signal);
  }
  return { acquire, activeContextCount: () => contexts.size, activeHistoryCount: () => histories.size };
}

class ProfileContext {
  readonly counters: ProfileBuildCounters;
  private leases = 0;
  private get historyGeneration() { return this.shared.generation; }
  private currentGeneration = 0;
  private projectionFlights = new Map<string, Flight<AnyPart>>();
  private finishedProjections = new Map<string, AnyPart>();
  private current: LocalPlayerCurrentSeed | undefined;
  private watchers = new Set<Watcher>();
  private stopShared?: () => void;
  private stopCurrent?: LocalDependencySubscription;
  private stopResume?: () => void;
  private validating?: Promise<void>;
  private disposed = false;
  private publishedChartGeneration = -1;
  private chartPublications = new Set<() => void>();

  constructor(private profile: LocalPlayerProfileModel, private shared: SharedHistory, private disposeRegistry: () => void) {
    this.counters = shared.counters;
  }

  acquire(signal?: AbortSignal): LocalProfileLease {
    if (this.disposed) throw profileAbortError();
    this.leases++;
    if (this.leases === 1) {
      this.stopShared = this.shared.retain(() => this.invalidateHistory());
      this.stopCurrent = subscribeToLocalDataDependencies({ sourceIds: [this.profile.sourceScanId] }, () => this.invalidateCurrent(), error => this.failSubscription("current", error), { consumer: "profile-current-dependencies" });
      if (typeof window !== "undefined") {
        const resume = (event: Event) => { if (document.visibilityState !== "hidden") void this.revalidate(event.type, false).catch(error => this.failSubscription("history", error)); };
        window.addEventListener("focus", resume); window.addEventListener("pageshow", resume);
        document.addEventListener("visibilitychange", resume); document.addEventListener("resume", resume);
        this.stopResume = () => { window.removeEventListener("focus", resume); window.removeEventListener("pageshow", resume); document.removeEventListener("visibilitychange", resume); document.removeEventListener("resume", resume); };
      }
    }
    let released = false;
    const tokens = new Set<symbol>();
    const ownedWatchers = new Set<Watcher>();
    const newToken = () => { const token = Symbol("profile consumer generation"); tokens.add(token); return token; };
    const endToken = (token: symbol) => { tokens.delete(token); this.detach(token); };
    const request = async <K extends LocalProfileArea>(area: K, comparison?: LocalProfileComparison): Promise<LocalProfilePart<LocalProfileValues[K]>> => {
      if (released) return { status: "cancelled", value: null, reason: "Consumer released" };
      const token = newToken();
      try {
        const part = await this.request(area, comparison, token, () => !released && tokens.has(token));
        this.noteChartPublication(area, part);
        return part;
      }
      finally { endToken(token); }
    };
    const watch = <K extends LocalProfileArea>(area: K, comparison: LocalProfileComparison | undefined, listener: (part: LocalProfilePart<LocalProfileValues[K]>) => void) => {
      if (released) return () => {};
      let generation = 0, stopped: boolean = released, token: symbol | undefined, published = false;
      const watcher: Watcher = { area, run: () => {
        if (stopped || released) return;
        const ownGeneration = ++generation;
        if (token) endToken(token);
        token = newToken(); const ownToken = token;
        listener({ status: "loading", value: null, reason: published || (area === "current" || area === "currentInsights") && this.currentGeneration > 0 ? "Revalidating selected observation" : "Requested local profile data" });
        void this.request(area, comparison, ownToken, () => !stopped && !released && generation === ownGeneration).then(part => {
          if (!stopped && !released && generation === ownGeneration) {
            published = true; listener(part); this.noteChartPublication(area, part);
          }
        }).finally(() => endToken(ownToken));
      } };
      this.watchers.add(watcher); ownedWatchers.add(watcher); watcher.run();
      return () => { stopped = true; generation++; if (token) endToken(token); this.watchers.delete(watcher); ownedWatchers.delete(watcher); };
    };
    const release = () => {
      if (released) return;
      released = true;
      signal?.removeEventListener("abort", release);
      for (const watcher of ownedWatchers) this.watchers.delete(watcher);
      ownedWatchers.clear();
      for (const token of tokens) this.detach(token);
      tokens.clear();
      if (--this.leases === 0) this.dispose();
    };
    signal?.addEventListener("abort", release, { once: true });
    if (signal?.aborted) release();
    return { request, watch, release, retry: () => { if (!released) ownedWatchers.forEach(watcher => watcher.run()); },
      revalidate: () => released ? Promise.resolve() : this.revalidate(), counters: this.counters };
  }

  private notify(current: boolean) {
    for (const watcher of this.watchers) if ((watcher.area === "current" || watcher.area === "currentInsights") === current) watcher.run();
  }
  private noteChartPublication(area: LocalProfileArea, part: AnyPart) {
    if (!area.startsWith("charts:") || part.status === "cancelled" || this.disposed) return;
    this.publishedChartGeneration = this.historyGeneration;
    for (const publish of [...this.chartPublications]) publish();
  }
  private async waitForFirstChart(signal: AbortSignal) {
    // A bests-only consumer has no chart to await. Full profiles already have
    // their selected chart watcher by the time shared discovery finishes.
    if (this.publishedChartGeneration === this.historyGeneration || ![...this.watchers].some(watcher => watcher.area.startsWith("charts:"))) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { this.chartPublications.delete(publish); signal.removeEventListener("abort", abort); };
      const publish = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(profileAbortError()); };
      this.chartPublications.add(publish);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    checkProfileWork(signal);
  }
  private invalidateHistory() {
    if (this.disposed) return;
    for (const [key, flight] of this.projectionFlights) if (!key.startsWith("current:")) { flight.controller.abort(); this.projectionFlights.delete(key); }
    for (const key of this.finishedProjections.keys()) if (!key.startsWith("current:")) this.finishedProjections.delete(key);
    this.notify(false);
  }
  private invalidateCurrent() {
    if (this.disposed) return;
    this.currentGeneration++; this.current = undefined;
    for (const [key, flight] of this.projectionFlights) if (key.startsWith("current:")) { flight.controller.abort(); this.projectionFlights.delete(key); }
    for (const key of this.finishedProjections.keys()) if (key.startsWith("current:")) this.finishedProjections.delete(key);
    this.notify(true);
  }
  private failSubscription(area: "history" | "current", error: unknown) {
    // A durable-read failure cannot certify previously displayed data as valid.
    console.error("[LocalPlayerProfile] dependency check failed", error);
    if (area === "history") this.shared.invalidate(); else this.invalidateCurrent();
  }
  private revalidate(trigger = "explicit-profile-revalidate", checkDependencies = true): Promise<void> {
    if (this.validating) return this.validating;
    const audit = auditBegin("S06", "profile-revalidation", null);
    auditFields(audit, { trigger, consumer: "profile-context-resume", currentGeneration: this.currentGeneration, historyGeneration: this.historyGeneration,
      dependencyCheckOwner: checkDependencies ? "self" : "durable-subscriptions-with-scope-and-baseline-fallback" });
    const job = (async () => {
      const currentGeneration = this.currentGeneration;
      const current = this.current;
      await auditCall(audit, "history-evidence-revalidation", () => this.shared.revalidate(trigger, checkDependencies), "async-elapsed");
      const currentValid = current ? await auditCall(audit, "current-evidence-revalidation", () => isLocalPlayerCurrentSeedValid(current, current, { trigger, consumer: "profile-current-resume" }, !checkDependencies && !!this.stopCurrent?.matches(current.dependencies.need)), "async-elapsed") : true;
      if (!currentValid && currentGeneration === this.currentGeneration) this.invalidateCurrent();
    })().catch(error => { auditError(audit, error); throw error; }).finally(() => { auditLeave(audit); if (this.validating === job) this.validating = undefined; });
    this.validating = job; return job;
  }

  private detach(token: symbol) {
    this.shared.detach(token);
    for (const registry of [this.projectionFlights]) for (const [key, flight] of registry) {
      flight.users.delete(token);
      if (!flight.users.size) { flight.controller.abort(); registry.delete(key); }
    }
  }
  private flight<T>(registry: Map<string, Flight<T>>, key: string, token: symbol, work: (signal: AbortSignal) => Promise<T>) {
    const __audit1 = auditPhaseBegin("flight", undefined, "sync-elapsed");
    try {
    const previous = registry.get(key);
    if (previous && !previous.controller.signal.aborted) {
      previous.users.add(token); this.counters.projectionJoins++;
      return auditReturn(__audit1, previous.promise);
    }
    const entry: Flight<T> = { users: new Set([token]), controller: new AbortController(), promise: undefined! };
    registry.set(key, entry);
    entry.promise = Promise.resolve().then(() => { checkProfileWork(entry.controller.signal); return __audit1 ? auditCall(__audit1, "physical-profile-flight", () => work(entry.controller.signal), "async-container") : work(entry.controller.signal); }).finally(() => {
      if (registry.get(key) === entry) registry.delete(key);
    });
    return auditReturn(__audit1, entry.promise);

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}
  private async request<K extends LocalProfileArea>(area: K, comparison: LocalProfileComparison | undefined, token: symbol, allowed: () => boolean): Promise<LocalProfilePart<LocalProfileValues[K]>> {
    const __audit2 = auditBegin(area === "current" ? "F17" : "F18", "request");
    if (area === "analytics" || area === "current") auditExpectGraph(__audit2);
    if (__audit2) auditFields(__audit2, { trigger: __audit2.record?.fields.trigger === "unbekannt" ? "profile-consumer-request" : __audit2.record?.fields.trigger, consumer: "local-player-profile", profileEntryRunId: auditResultId(this.profile), profileEntryTrigger: auditResultTrigger(this.profile), area, comparison: typeof comparison === "object" && comparison ? JSON.stringify(comparison) : comparison ?? null, currentGeneration: this.currentGeneration, historyGeneration: this.historyGeneration });
    try {
    const isCurrent = area === "current" || area === "currentInsights";
    const generation = isCurrent ? this.currentGeneration : this.historyGeneration;
    const validGeneration = () => allowed() && !this.disposed && generation === (isCurrent ? this.currentGeneration : this.historyGeneration);
    try {
      if (!validGeneration()) throw profileAbortError();
      let part: AnyPart;
      if (isCurrent) {
        if (this.current && !await (auditValue(__audit2, auditEnter(__audit2, "isLocalPlayerCurrentSeedValid"), (isLocalPlayerCurrentSeedValid(this.current, this.current))))) { if (generation === this.currentGeneration) this.invalidateCurrent(); throw profileAbortError(); }
        const key = `current:${generation}`;
        part = await (auditValue(__audit2, auditEnter(__audit2, "this.project"), (this.project(key, token, async signal => {
          const seed = await resolveLocalPlayerCurrentSeed({ sourceScanId: this.profile.sourceScanId, sourcePlayerKey: this.profile.sourcePlayerKey,
            sourceMemberRef: this.profile.analytics.memberRef, scannedAtMs: this.profile.analytics.scannedAtMs,
            scannedAtIso: new Date(this.profile.analytics.scannedAtMs).toISOString(),
            guild: this.profile.currentSeed?.guild ?? { name: this.profile.analytics.guildName, server: this.profile.analytics.server, identifier: this.profile.analytics.guildIdentifier } },
          this.profile.currentSeed, () => !signal.aborted && generation === this.currentGeneration,
          () => { this.counters.currentRawReads++; }, false);
          checkProfileWork(signal);
          if (!seed) return { status: "empty", value: null, reason: "Selected local observation is missing or ambiguous" };
          if (!await isLocalPlayerCurrentSeedValid(seed, seed)) throw profileAbortError();
          checkProfileWork(signal);
          this.current = seed;
          this.counters.currentProjections++;
          const { currentSeed: _privateSeed, ...preparedCurrent } = buildLocalPlayerProfileModel({ ...seed, rawPlayer: seed.rawPlayer, currentSeed: seed });
          // Current Raw rows/core lookup remain private to this observation owner.
          // Display leases receive immutable prepared fields, never mutable Raw maps.
          return { status: "ready", value: protectProfileBasis(preparedCurrent), evidence: { key: JSON.stringify([key, seed.validity, seed.contentHash, seed.snapshotId]),
            dependencies: seed.dependencies, sourceIds: [seed.sourceScanId], resetCertificate: null } };
        }))));
        if (area === "currentInsights" && part.value) {
          const seed = this.current;
          if (!seed) throw profileAbortError();
          part = await (auditValue(__audit2, auditEnter(__audit2, "this.project"), (this.project(`${key}:insights`, token, async signal => {
            checkProfileWork(signal); this.counters.currentProjections++;
            const insightSeed = await resolveLocalPlayerCurrentSeed({ sourceScanId: seed.sourceScanId,
              sourcePlayerKey: seed.sourcePlayerKey, sourceMemberRef: seed.sourceMemberRef,
              scannedAtMs: seed.scannedAtMs, scannedAtIso: seed.scannedAtIso, guild: seed.guild, guildRole: seed.guildRole },
              seed, () => !signal.aborted && generation === this.currentGeneration,
              () => { this.counters.currentRawReads++; });
            checkProfileWork(signal);
            if (!insightSeed) throw profileAbortError();
            const value = protectProfileBasis(buildCurrentScanInsights(this.profile, insightSeed));
            if (!await isLocalPlayerCurrentSeedValid(insightSeed, insightSeed)) throw profileAbortError();
            checkProfileWork(signal);
            return { status: "ready", value, evidence: part.evidence };
          }))));
        }
      } else {
        const basis = await (auditValue(__audit2, auditEnter(__audit2, "this.shared.history"), (this.shared.history(token))));
        if (!validGeneration()) throw profileAbortError();
        if (area === "history") part = { status: basis.coverage === "partial" ? "partial" : basis.snapshotCount ? "ready" : "empty", value: basis, evidence: basis.evidence };
        else {
          const chartRequest = area.startsWith("charts:") ? area.split(":") : null;
          const binding = area === "bests" ? "all-matched-history-ranks-and-positive-xp" : comparison ?? null;
          const key = (auditValue(__audit2, auditEnter(__audit2, "JSON.stringify", "sync-elapsed"), (JSON.stringify([LOCAL_PROFILE_PROJECTION_VERSION, basis.evidence.key, localProfileContextKey(this.profile), chartRequest ? area : area === "bests" ? "bests" : "analytics", binding, basis.coverage, "existing-complete-guild-xp-base-rules"]))));
          part = await (auditValue(__audit2, auditEnter(__audit2, "this.project"), (this.project(key, token, async signal => {
            checkProfileWork(signal);
            if (area === "bests") {
              await this.waitForFirstChart(signal);
              checkProfileWork(signal);
              this.counters.bestsProjections++;const bestsAt=performance.now();
              let value: LocalPlayerInsightsModel["personalBests"], reason: string | undefined;
              const result = await this.shared.run<{ value: LocalPlayerInsightsModel["personalBests"]; reason?: string }>(key,
                { kind: "profile-bests", profile: this.shared.target, history: basis }, signal);
              value = result.value; reason = result.reason;
              this.counters.bestsElapsedMs+=performance.now()-bestsAt;
              if (!await isLocalProfileEvidenceCurrent(basis.evidence)) throw profileAbortError();
              checkProfileWork(signal);
              return { status: reason || basis.coverage === "partial" ? "partial" : basis.snapshotCount ? "ready" : "empty", value: protectProfileBasis(value), reason, evidence: basis.evidence };
            }
            this.counters.analyticsProjections++;
            const analyticsAt=performance.now();
            const value = protectProfileBasis(await this.shared.run<LocalPlayerAnalyticsResult>(key,
              { kind: "profile-analytics", profile: this.shared.target, history: basis, comparison: typeof comparison === "number" ? comparison : null, range: comparison && typeof comparison === "object" ? comparison : undefined, view: chartRequest?.[1] as PlayerContentView | undefined, sumMode: chartRequest?.[2] as AttributeSumMode | undefined }, signal));
            this.counters.analyticsCpuMs+=performance.now()-analyticsAt;
            if (!await isLocalProfileEvidenceCurrent(basis.evidence)) throw profileAbortError();
            checkProfileWork(signal);
            return { status: basis.coverage === "partial" ? "partial" : value.snapshotCount ? "ready" : "empty", value, evidence: basis.evidence };
          }))));
          if (part.value && (area === "career" || area === "comparison")) part = { ...part, value: (part.value as LocalPlayerAnalyticsResult)[area as "career" | "comparison"] };
        }
      }
      if (!validGeneration()) throw profileAbortError();
      // All publication paths recheck the held dependency receipt, including finished hits.
      if (isCurrent ? this.current && !await (auditValue(__audit2, auditEnter(__audit2, "isLocalPlayerCurrentSeedValid"), (isLocalPlayerCurrentSeedValid(this.current, this.current)))) : part.evidence && !await (auditValue(__audit2, auditEnter(__audit2, "isLocalProfileEvidenceCurrent"), (isLocalProfileEvidenceCurrent(part.evidence))))) throw profileAbortError();
      if (!validGeneration()) throw profileAbortError();
      auditAccept(__audit2, part.value);
      return auditReturn(__audit2, part as LocalProfilePart<LocalProfileValues[K]>);
    } catch (error) { auditCaught(__audit2, error);
      return auditReturn(__audit2, { status: !validGeneration() || error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "error", value: null, reason: String(error) });
    }

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
}

  private project(key: string, token: symbol, work: (signal: AbortSignal) => Promise<AnyPart>) {
    const __audit3 = auditPhaseBegin("project", undefined, "sync-elapsed");
    try {
    const finished = this.finishedProjections.get(key);
    if (finished) { this.counters.projectionHits++; return auditReturn(__audit3, Promise.resolve(finished)); }
    return auditReturn(__audit3, this.flight(this.projectionFlights, key, token, async signal => {
      const part = await work(signal);
      checkProfileWork(signal);
      // Partial/empty/error/cancelled results never install a completed-key veto.
      if (part.status === "ready") this.finishedProjections.set(key, part);
      return part;
    }));

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
}
  private dispose() {
    this.disposed = true;
    this.stopShared?.(); this.stopCurrent?.(); this.stopResume?.();
    for (const flight of this.projectionFlights.values()) flight.controller.abort();
    this.projectionFlights.clear(); this.finishedProjections.clear();
    this.current = undefined; this.watchers.clear();
    // Release caller/seed/Raw references even if a noninterruptible operation is unwinding.
    this.profile = undefined!;
    this.disposeRegistry();
  }
}

class SharedHistory {
  readonly counters = emptyProfileBuildCounters();
  generation = 0;
  private discoveryFlights = new Map<string, Flight<PreparedProfileHistory>>();
  private basisFlights = new Map<string, Flight<PreparedProfileHistory>>();
  private finishedBases = new Map<string, PreparedProfileHistory>();
  private listeners = new Set<() => void>();
  private need: LocalDataDependencies;
  private stopHistory?: LocalDependencySubscription;
  private stopReset?: () => void;
  private disposed = false;
  private profile: LocalProfileHistoryTarget;
  private preparation?: AnalyticsPreparationLease;

  constructor(profile: LocalPlayerProfileModel, private disposeRegistry: () => void, playerChartsOnly = false) {
    // Historical target metadata only; no selected Current Raw/core references.
    this.profile = { sourceScanId: profile.sourceScanId, sourcePlayerKey: profile.sourcePlayerKey, analytics: { ...profile.analytics }, playerChartsOnly };
    this.need = initialProfileNeed(this.profile);
  }
  retain(listener: () => void) {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.preparation = sharedAnalyticsPreparation.acquire("profile");
      this.setNeed(this.need);
      this.stopReset = subscribeToLocalDataChanges(change => {
        if (change.owner === "analytics" && change.kinds.includes("reset") &&
            (!change.sourceIds.length || change.sourceIds.some(id => this.need.sourceIds?.includes(id)))) this.invalidate();
      });
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.disposed = true;
        this.stopHistory?.(); this.stopReset?.();
        this.abortFlights(); this.finishedBases.clear(); this.preparation?.release(); this.preparation = undefined; this.profile = undefined!;
        this.disposeRegistry();
      }
    };
  }
  get target() { return this.profile; }
  run<T>(key: string, work: import("./profileExecution").ProfileWork, signal: AbortSignal) {
    if (!this.preparation) throw profileAbortError();
    return this.preparation.runProfile<T>(key, work, signal);
  }
  private setNeed(need: LocalDataDependencies) {
    if (this.disposed || JSON.stringify(this.need) === JSON.stringify(need) && this.stopHistory) return;
    this.need = need; this.stopHistory?.();
    this.stopHistory = subscribeToLocalDataDependencies(need, () => this.invalidate(), error => {
      console.error("[LocalPlayerProfile] history dependency check failed", error); this.invalidate();
    }, { consumer: "profile-history-dependencies" });
  }
  invalidate() {
    if (this.disposed) return;
    this.generation++; this.abortFlights(); this.finishedBases.clear();
    this.preparation?.release(); this.preparation = sharedAnalyticsPreparation.acquire("profile");
    for (const listener of this.listeners) listener();
  }
  private abortFlights() {
    for (const registry of [this.discoveryFlights, this.basisFlights]) {
      for (const flight of registry.values()) flight.controller.abort();
      registry.clear();
    }
  }
  detach(token: symbol) {
    for (const registry of [this.discoveryFlights, this.basisFlights]) for (const [key, flight] of registry) {
      flight.users.delete(token);
      if (!flight.users.size) { flight.controller.abort(); registry.delete(key); }
    }
  }
  async revalidate(trigger = "explicit-history-revalidate", checkDependencies = true) {
    const generation = this.generation;
    const basis = this.finishedBases.values().next().value as PreparedProfileHistory | undefined;
    if (!basis) return;
    // Its durable subscription catches up Sources/Identities on every return;
    // the reset certificate is separate evidence and still needs a read.
    const current = !checkDependencies && this.stopHistory?.matches(basis.evidence.dependencies.need)
      ? basis.evidence.resetCertificate === null || await auditCall(auditCurrent(), "history-reset-certificate-proof", () => readGuildAnalyticsResetCertificate(basis.evidence.sourceIds), "async-elapsed") === basis.evidence.resetCertificate
      : await isLocalProfileEvidenceCurrent(basis.evidence, { trigger, consumer: "profile-history-resume" });
    if (!current && generation === this.generation) this.invalidate();
  }
  private flight(registry: Map<string, Flight<PreparedProfileHistory>>, key: string, token: symbol, work: (signal: AbortSignal) => Promise<PreparedProfileHistory>) {
    const __audit4 = auditPhaseBegin("flight", undefined, "sync-elapsed");
    try {
    const existing = registry.get(key);
    if (existing && !existing.controller.signal.aborted) { existing.users.add(token); this.counters.basisJoins++; auditLink(auditCurrent(), auditPromiseId(existing.promise), "in-flight-join"); return auditReturn(__audit4, existing.promise); }
    const entry: Flight<PreparedProfileHistory> = { users: new Set([token]), controller: new AbortController(), promise: undefined! };
    registry.set(key, entry);
    entry.promise = Promise.resolve().then(() => { checkProfileWork(entry.controller.signal); return __audit4 ? auditCall(__audit4, "physical-history-flight", () => work(entry.controller.signal), "async-container") : work(entry.controller.signal); }).finally(() => {
      if (registry.get(key) === entry) registry.delete(key);
    });
    return auditReturn(__audit4, entry.promise);

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
}
  async history(token: symbol) {
    const __audit5 = auditPhaseBegin("history", undefined, "async-container");
    try {
    const generation = this.generation;
    const finished = this.finishedBases.values().next().value as PreparedProfileHistory | undefined;
    if (finished) {
      if (await (auditValue(__audit5, auditEnter(__audit5, "isLocalProfileEvidenceCurrent"), (isLocalProfileEvidenceCurrent(finished.evidence)))) && generation === this.generation && !this.disposed) { this.counters.basisHits++; return (__audit5 && auditDiscard(__audit5), auditReturn(__audit5, finished)); }
      if (generation === this.generation) this.invalidate();
      throw profileAbortError();
    }
    // Join discovery before metadata reads. Once demand is known, register the
    // same flight under its actual source/alias/version binding, expanding that
    // binding only when the builder's own fallback discovers additional demand.
    const running = this.basisFlights.entries().next().value as [string, Flight<PreparedProfileHistory>] | undefined;
    if (running) return auditReturn(__audit5, this.flight(this.basisFlights, running[0], token, async () => { throw Error("Unreachable basis join"); }));
    const discoveryKey = (auditValue(__audit5, auditEnter(__audit5, "JSON.stringify", "sync-elapsed"), (JSON.stringify([localProfileHistoryContextKey(this.profile), generation, LOCAL_PROFILE_PROJECTION_VERSION]))));
    return auditReturn(__audit5, this.flight(this.discoveryFlights, discoveryKey, token, async signal => {
      const entry = this.discoveryFlights.get(discoveryKey)!;
      try {
        const basis = await this.run<PreparedProfileHistory>(discoveryKey, { kind: "profile-history", profile: this.profile }, signal);
        if (generation === this.generation && !signal.aborted) {
          this.setNeed(basis.evidence.dependencies.need);
          if (this.discoveryFlights.get(discoveryKey) === entry) this.discoveryFlights.delete(discoveryKey);
          this.basisFlights.set(basis.evidence.key, entry);
        }
        checkProfileWork(signal);
        if (generation !== this.generation || !await isLocalProfileEvidenceCurrent(basis.evidence)) throw profileAbortError();
        checkProfileWork(signal);
        if (basis.coverage === "complete" && basis.snapshotCount) this.finishedBases.set(basis.evidence.key, basis);
        return basis;
      } finally {
        for (const [key, flight] of this.basisFlights) if (flight === entry) this.basisFlights.delete(key);
      }
    }));

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
}

}

const realmCoordinator = createLocalPlayerProfileCoordinator();
export const acquireLocalPlayerProfile = realmCoordinator.acquire;
