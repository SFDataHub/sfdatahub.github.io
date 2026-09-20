import assert from "node:assert/strict";

import {
  resolveGuildFusions,
  type GuildFusionObservation,
  type GuildFusionPlayerMatch,
} from "../../src/lib/identities/guildFusionResolver.ts";

const OLD_TS = Date.parse("2026-01-31T10:00:00Z");
const NEW_TS = Date.parse("2026-04-03T10:00:00Z");
const COA_A = "00112233445566778899aa";
const COA_B = "ffeeddccbbaa9988776655";

const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}_p${index + 1}`);

const oldGuild = (overrides: Partial<GuildFusionObservation> = {}): GuildFusionObservation => ({
  guildIdentifier: "eu1_g1",
  serverCode: "EU1",
  timestamp: OLD_TS,
  name: "Guild A",
  memberIdentifiers: ids("eu1", 6),
  memberCount: 6,
  coa: COA_A,
  ...overrides,
});

const newGuild = (overrides: Partial<GuildFusionObservation> = {}): GuildFusionObservation => ({
  guildIdentifier: "f28_g1",
  serverCode: "F28",
  timestamp: NEW_TS,
  name: "Guild A",
  memberIdentifiers: ids("f28", 6),
  memberCount: 6,
  coa: COA_A,
  ...overrides,
});

const match = (oldIdentifier: string, newIdentifier: string): GuildFusionPlayerMatch => ({
  oldIdentifier,
  oldName: oldIdentifier,
  newIdentifier,
  newName: newIdentifier,
});

const mapMembers = (oldPrefix: string, newPrefix: string, count: number, oldOffset = 0, newOffset = 0) =>
  Array.from({ length: count }, (_, index) =>
    match(`${oldPrefix}_p${oldOffset + index + 1}`, `${newPrefix}_p${newOffset + index + 1}`),
  );

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild()],
    newGuildObservations: [newGuild()],
    highConfidencePlayerMatches: mapMembers("eu1", "f28", 4),
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates[0]?.autoEligible, true);
  assert.equal(result.identityCandidates[0]?.exactName, true);
  assert.equal(result.identityCandidates[0]?.sameCoA, true);
  assert.equal(result.identityCandidates[0]?.mutualDominant, true);
  assert.equal(result.identityCandidates[0]?.matchedMemberCount, 4);
}

{
  const hangoverMembers = ids("hangover_old", 25);
  const sladkyMembers = ids("sladky_old", 7);
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({
        guildIdentifier: "eu1_hangover",
        name: "Hangover",
        coa: COA_A,
        memberIdentifiers: hangoverMembers,
        memberCount: hangoverMembers.length,
      }),
      oldGuild({
        guildIdentifier: "eu1_sladky",
        name: "Sladky domov",
        coa: null,
        memberIdentifiers: sladkyMembers,
        memberCount: sladkyMembers.length,
      }),
    ],
    newGuildObservations: [
      newGuild({
        guildIdentifier: "f28_hangover",
        name: "Hangover",
        coa: COA_A,
        memberIdentifiers: [...ids("hangover_new", 25), ...ids("sladky_new", 7)],
        memberCount: 32,
      }),
    ],
    highConfidencePlayerMatches: [
      ...mapMembers("hangover_old", "hangover_new", 25),
      ...mapMembers("sladky_old", "sladky_new", 7),
    ],
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates.length, 1);
  assert.equal(result.identityCandidates[0]?.oldGuildIdentifier, "eu1_hangover");
  assert.equal(result.identityCandidates[0]?.autoEligible, true);
  assert.equal(result.memberMigrationEdges.length, 1);
  assert.equal(result.memberMigrationEdges[0]?.oldGuildIdentifier, "eu1_sladky");
  assert.equal(result.memberMigrationEdges[0]?.matchedMemberCount, 7);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "Old A", coa: null })],
    newGuildObservations: [newGuild({ name: "New A", coa: null })],
    highConfidencePlayerMatches: [match("eu1_p1", "f28_p1")],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.memberMigrationEdges.length, 1);
  assert.equal(result.memberMigrationEdges[0]?.matchedMemberCount, 1);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "Old A", coa: null })],
    newGuildObservations: [newGuild({ name: "New A", coa: null })],
    highConfidencePlayerMatches: mapMembers("eu1", "f28", 2),
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.memberMigrationEdges[0]?.matchedMemberCount, 2);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "Old A", coa: null })],
    newGuildObservations: [newGuild({ name: "New A", coa: null })],
    highConfidencePlayerMatches: mapMembers("eu1", "f28", 5),
  }).results[0];

  assert.equal(result.status, "reviewRequired");
  assert.equal(result.identityCandidates[0]?.autoEligible, false);
  assert.equal(result.identityCandidates[0]?.mutualDominant, true);
  assert.equal(result.identityCandidates[0]?.exactName, false);
  assert.equal(result.identityCandidates[0]?.sameCoA, false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "Dead End", coa: COA_A })],
    newGuildObservations: [newGuild({ name: "Erben im Wandel", coa: COA_A })],
    highConfidencePlayerMatches: mapMembers("eu1", "f28", 4),
  }).results[0];

  assert.equal(result.identityCandidates[0]?.relationType, "identityContinuity");
  assert.equal(result.identityCandidates[0]?.reviewRequired, true);
  assert.equal(result.identityCandidates[0]?.autoEligible, false);
  assert.equal(result.identityCandidates[0]?.sameCoA, true);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "Der weisse Lotus", coa: COA_A })],
    newGuildObservations: [newGuild({ name: "Der weisse Lotus", coa: COA_B })],
    highConfidencePlayerMatches: mapMembers("eu1", "f28", 4),
  }).results[0];

  assert.equal(result.status, "reviewRequired");
  assert.equal(result.identityCandidates[0]?.exactName, true);
  assert.equal(result.identityCandidates[0]?.sameCoA, false);
  assert.equal(result.identityCandidates[0]?.autoEligible, false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_g1", name: "Die Legion", coa: null, memberIdentifiers: ids("eu1", 5) }),
      oldGuild({ guildIdentifier: "eu4_g2", name: "GenerationZ", coa: COA_A, memberIdentifiers: ids("eu4", 5) }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_g1", name: "Legion Z", coa: COA_A, memberIdentifiers: ids("f28", 10) })],
    highConfidencePlayerMatches: [...mapMembers("eu1", "f28", 5), ...mapMembers("eu4", "f28", 4, 0, 5)],
  }).results[0];

  assert.equal(result.status, "convergence");
  assert.equal(result.convergenceCandidate, true);
  assert.equal(result.identityCandidates.some((candidate) => candidate.oldGuildIdentifier === "eu4_g2" && candidate.autoEligible), false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu1_g1", name: "Split Guild", coa: COA_A, memberIdentifiers: ids("eu1", 8) })],
    newGuildObservations: [
      newGuild({ guildIdentifier: "f28_g1", name: "Split Guild", coa: COA_A, memberIdentifiers: ids("f28a", 4) }),
      newGuild({ guildIdentifier: "f28_g2", name: "Other Split", coa: null, memberIdentifiers: ids("f28b", 4) }),
    ],
    highConfidencePlayerMatches: [...mapMembers("eu1", "f28a", 4), ...mapMembers("eu1", "f28b", 3, 4)],
  });

  const first = result.results.find((entry) => entry.newGuild.guildIdentifier === "f28_g1");
  assert.equal(first?.status, "autoEligible");
  assert.equal(first?.splitCandidate, false);
  assert.equal(first?.identityCandidates[0]?.autoEligible, true);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu1_g1", name: "Split Guild", coa: COA_A, memberIdentifiers: ids("eu1", 8) })],
    newGuildObservations: [
      newGuild({ guildIdentifier: "f28_g1", name: "Split Guild", coa: COA_A, memberIdentifiers: ids("f28a", 4) }),
      newGuild({ guildIdentifier: "f28_g2", name: "Split Guild", coa: COA_A, memberIdentifiers: ids("f28b", 4) }),
    ],
    highConfidencePlayerMatches: [...mapMembers("eu1", "f28a", 4), ...mapMembers("eu1", "f28b", 3, 4)],
  });

  const first = result.results.find((entry) => entry.newGuild.guildIdentifier === "f28_g1");
  assert.equal(first?.status, "split");
  assert.equal(first?.splitCandidate, true);
  assert.equal(first?.identityCandidates[0]?.autoEligible, false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [],
    newGuildObservations: [newGuild()],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.status, "noHistoricalData");
  assert.equal(result.identityCandidates.length, 0);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "Old Name", coa: null, memberIdentifiers: [] })],
    newGuildObservations: [newGuild({ name: "New Name", coa: null, memberIdentifiers: [] })],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
}

console.log("guildFusionResolver V2 test passed");
