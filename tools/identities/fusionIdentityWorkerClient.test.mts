import assert from "node:assert/strict";

import {
  FusionIdentityWorkerCancelledError,
  startFusionIdentityWorkerRun,
  type FusionIdentityWorkerLike,
} from "../../src/lib/identities/fusionIdentityWorkerClient.ts";
import type {
  FusionIdentityWorkerRequest,
  FusionIdentityWorkerResponse,
} from "../../src/lib/identities/fusionIdentityWorkerTypes.ts";

const emptyReport = {
  scope: {
    label: "EU1-EU4 -> F28",
    originServerCodes: ["EU1", "EU2", "EU3", "EU4"],
    targetServerCode: "F28",
    allSnapshotCount: 0,
    historicalSnapshotCount: 0,
    postFusionSnapshotCount: 0,
    firstHistoricalTimestamp: null,
    lastHistoricalTimestamp: null,
    firstPostFusionTimestamp: null,
    lastPostFusionTimestamp: null,
    playerObservationCount: 0,
    guildObservationCount: 0,
  },
  summary: { total: 0, ready: 0, review: 0, unresolved: 0, noHistoricalObservation: 0, noHistory: 0, completed: 0, players: 0, guilds: 0 },
  items: [],
  currentAliases: [],
  historicalAliases: [],
};

const guildClassificationReport = {
  ...emptyReport,
  summary: { ...emptyReport.summary, total: 1, ready: 1, guilds: 1 },
  items: [
    {
      id: "guild:f28_g1",
      entityType: "guild",
      status: "ready",
      currentIdentifier: "f28_g1",
      currentName: "The Brotherhood (s2eu)",
      currentServer: "F28",
      observations: [],
      firstSeen: 0,
      lastSeen: 0,
      historicalIdentifiers: [],
      candidates: [
        {
          entityType: "guild",
          historicalIdentifier: "eu2_g1",
          historicalName: "The Brotherhood",
          historicalServer: "EU2",
          ready: true,
          rejected: false,
          assignedToOtherIdentity: false,
          evidence: {
            relationType: "identityContinuity",
            oldGuildIdentifier: "eu2_g1",
            oldServer: "EU2",
            oldName: "The Brotherhood",
            oldMemberCount: 0,
            oldCoa: null,
            newGuildIdentifier: "f28_g1",
            newName: "The Brotherhood (s2eu)",
            newMemberCount: 0,
            exactName: false,
            fusionBaseName: true,
            fusionBaseNameOrigin: "EU2",
            sameCoA: false,
            leadership: {
              oldLeaderIdentifier: null,
              newLeaderIdentifier: null,
              oldLeaderResolved: false,
              newLeaderResolved: false,
              sameLogicalLeader: null,
              oldOfficerCount: 0,
              newOfficerCount: 0,
              oldOfficerResolvedCount: 0,
              newOfficerResolvedCount: 0,
              continuedOfficers: 0,
              leadershipCoreOverlap: 0,
            },
            classification: "strong",
            evidenceEntries: [{ type: "fusion-base-name", strength: "strongSupport", label: "Fusion base guild name" }],
            actionable: true,
            assignmentConflict: false,
            reservedByReadyAssignment: false,
            matchedMembers: [],
            splitEvidence: { relevant: false, topCount: 0, secondCount: 0, topGuildIdentifier: null, secondGuildIdentifier: null },
            convergenceEvidence: { relevant: false, topCount: 0, secondCount: 0, topGuildIdentifier: null, secondGuildIdentifier: null },
            autoEligible: true,
            reviewRequired: false,
            matchedMemberCount: 0,
            oldMappedMemberCount: 0,
            newMappedMemberCount: 0,
            oldShare: 0,
            newShare: 0,
            oldTopDestination: null,
            oldSecondDestination: null,
            newTopSource: null,
            newSecondSource: null,
            isOldTopDestination: false,
            isNewTopSource: false,
            isUniqueOldTop: false,
            isUniqueNewTop: false,
            mutualDominant: false,
          },
        },
      ],
      memberMigrationEdges: [],
      reasons: [],
      reasonCodes: [],
      diagnostics: null,
      readyCandidateIdentifier: "eu2_g1",
      completedEntityId: null,
      completedAliases: [],
    },
  ],
};

class FakeWorker implements FusionIdentityWorkerLike {
  messages: FusionIdentityWorkerRequest[] = [];
  terminated = false;
  private messageListeners = new Set<(event: MessageEvent<FusionIdentityWorkerResponse>) => void>();
  private errorListeners = new Set<(event: ErrorEvent) => void>();

  postMessage(message: FusionIdentityWorkerRequest) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  addEventListener(type: "message", listener: (event: MessageEvent<FusionIdentityWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  addEventListener(type: "message" | "error", listener: ((event: MessageEvent<FusionIdentityWorkerResponse>) => void) | ((event: ErrorEvent) => void)) {
    if (type === "message") this.messageListeners.add(listener as (event: MessageEvent<FusionIdentityWorkerResponse>) => void);
    else this.errorListeners.add(listener as (event: ErrorEvent) => void);
  }

  removeEventListener(type: "message", listener: (event: MessageEvent<FusionIdentityWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message" | "error", listener: ((event: MessageEvent<FusionIdentityWorkerResponse>) => void) | ((event: ErrorEvent) => void)) {
    if (type === "message") this.messageListeners.delete(listener as (event: MessageEvent<FusionIdentityWorkerResponse>) => void);
    else this.errorListeners.delete(listener as (event: ErrorEvent) => void);
  }

  emit(message: FusionIdentityWorkerResponse) {
    this.messageListeners.forEach((listener) => listener({ data: message } as MessageEvent<FusionIdentityWorkerResponse>));
  }

  emitError(message: string) {
    this.errorListeners.forEach((listener) => listener({ message } as ErrorEvent));
  }
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({ requestId: "a", workerFactory: () => worker });
  assert.deepEqual(worker.messages, [{ type: "build-report", requestId: "a" }]);
  worker.emit({ type: "complete", requestId: "a", report: emptyReport, timings: [{ phase: "total", durationMs: 42 }] });
  const result = await run.promise;
  assert.equal(result.report.summary.total, 0);
  assert.equal(result.timings[0]?.durationMs, 42);
  assert.equal(worker.terminated, true);
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({
    requestId: "scoped",
    workerFactory: () => worker,
    scope: {
      id: "F28",
      label: "EU1-EU4 -> F28",
      targetServerCode: "F28",
      targetServerName: "Fusion 28",
      originServerCodes: ["EU1", "EU2", "EU3", "EU4"],
      originServerNames: ["EU 1", "EU 2", "EU 3", "EU 4"],
    },
  });
  assert.deepEqual(worker.messages, [
    {
      type: "build-report",
      requestId: "scoped",
      scope: {
        id: "F28",
        label: "EU1-EU4 -> F28",
        targetServerCode: "F28",
        targetServerName: "Fusion 28",
        originServerCodes: ["EU1", "EU2", "EU3", "EU4"],
        originServerNames: ["EU 1", "EU 2", "EU 3", "EU 4"],
      },
    },
  ]);
  run.cancel();
  await assert.rejects(run.promise, FusionIdentityWorkerCancelledError);
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({ requestId: "guild-classification", workerFactory: () => worker });
  worker.emit({ type: "complete", requestId: "guild-classification", report: guildClassificationReport as typeof emptyReport, timings: [] });
  const result = await run.promise;
  const candidate = result.report.items[0]?.candidates[0];
  assert.equal(candidate?.entityType, "guild");
  assert.equal(candidate?.entityType === "guild" ? candidate.evidence.classification : null, "strong");
  assert.equal(candidate?.entityType === "guild" ? candidate.evidence.evidenceEntries[0]?.type : null, "fusion-base-name");
}

{
  const worker = new FakeWorker();
  const progressMessages: string[] = [];
  const run = startFusionIdentityWorkerRun({
    requestId: "b",
    workerFactory: () => worker,
    onProgress: (progress) => progressMessages.push(progress.message),
  });
  worker.emit({ type: "progress", requestId: "b", progress: { phase: "loading", message: "Loading local scans" } });
  worker.emit({ type: "complete", requestId: "b", report: emptyReport, timings: [] });
  await run.promise;
  assert.deepEqual(progressMessages, ["Loading local scans"]);
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({ requestId: "c", workerFactory: () => worker });
  worker.emit({ type: "complete", requestId: "stale", report: { ...emptyReport, summary: { ...emptyReport.summary, total: 99 } }, timings: [] });
  worker.emit({ type: "complete", requestId: "c", report: emptyReport, timings: [] });
  const result = await run.promise;
  assert.equal(result.report.summary.total, 0);
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({ requestId: "d", workerFactory: () => worker });
  worker.emit({ type: "error", requestId: "d", phase: "report", message: "boom" });
  await assert.rejects(run.promise, /boom/);
  assert.equal(worker.terminated, true);
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({ requestId: "e", workerFactory: () => worker });
  run.cancel();
  await assert.rejects(run.promise, FusionIdentityWorkerCancelledError);
  assert.equal(worker.terminated, true);
  assert.deepEqual(worker.messages.at(-1), { type: "cancel", requestId: "e" });
}

console.log("fusionIdentityWorkerClient test passed");
