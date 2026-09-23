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

  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.memberMigrationEdges[0]?.mutualDominant, true);
  assert.equal(result.memberMigrationEdges[0]?.matchedMemberCount, 5);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "Dead End", coa: COA_A })],
    newGuildObservations: [newGuild({ name: "Erben im Wandel", coa: COA_A })],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.identityCandidates[0]?.relationType, "identityContinuity");
  assert.equal(result.identityCandidates[0]?.reviewRequired, true);
  assert.equal(result.identityCandidates[0]?.autoEligible, false);
  assert.equal(result.identityCandidates[0]?.sameCoA, true);
  assert.equal(result.identityCandidates[0]?.classification, "plausible");
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "Der weisse Lotus", coa: COA_A })],
    newGuildObservations: [newGuild({ name: "Der weisse Lotus", coa: COA_B })],
    highConfidencePlayerMatches: mapMembers("eu1", "f28", 4),
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates[0]?.exactName, true);
  assert.equal(result.identityCandidates[0]?.sameCoA, false);
  assert.equal(result.identityCandidates[0]?.classification, "strong");
  assert.equal(result.identityCandidates[0]?.autoEligible, true);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "ARMIA-like", coa: null })],
    newGuildObservations: [newGuild({ name: "ARMIA-like", coa: COA_B })],
    highConfidencePlayerMatches: mapMembers("eu1", "f28", 3),
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates[0]?.classification, "strong");
  assert.equal(result.identityCandidates[0]?.sameCoA, false);
  assert.equal(result.identityCandidates[0]?.autoEligible, true);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu2_g42", serverCode: "EU2", name: "The Brotherhood", coa: null, memberIdentifiers: [], memberCount: 0 }),
    ],
    newGuildObservations: [
      newGuild({ guildIdentifier: "f28_g42", serverCode: "F28", name: "The Brotherhood (s2eu)", coa: null, memberIdentifiers: [], memberCount: 0 }),
    ],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates[0]?.fusionBaseName, true);
  assert.equal(result.identityCandidates[0]?.fusionBaseNameOrigin, "EU2");
  assert.equal(result.identityCandidates[0]?.classification, "strong");
  assert.equal(result.identityCandidates[0]?.exactName, false);
  assert.equal(result.identityCandidates[0]?.evidenceEntries.some((entry) => entry.type === "fusion-base-name"), true);
  assert.equal(result.reliableHistoricalLookup?.baseName, "The Brotherhood");
  assert.equal(result.reliableHistoricalLookup?.originServer, "EU2");
  assert.equal(result.reliableHistoricalLookup?.matchingObservationCount, 1);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu2_g42", serverCode: "EU2", name: "The Brotherhood", coa: null, memberIdentifiers: [], memberCount: 0 }),
    ],
    newGuildObservations: [
      newGuild({ guildIdentifier: "f28_g42", serverCode: "F28", name: "The Brotherhood (abc)", coa: null, memberIdentifiers: [], memberCount: 0 }),
    ],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.reliableHistoricalLookup, null);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu2_g42", serverCode: "EU2", name: "The Brotherhood", coa: null, memberIdentifiers: [], memberCount: 0 }),
    ],
    newGuildObservations: [
      newGuild({ guildIdentifier: "eu3_g42", serverCode: "EU3", name: "The Brotherhood (s2eu)", coa: null, memberIdentifiers: [], memberCount: 0 }),
    ],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.reliableHistoricalLookup, null);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu2_g42", serverCode: "EU2", name: "Guild", coa: null, memberIdentifiers: [], memberCount: 0 }),
    ],
    newGuildObservations: [
      newGuild({ guildIdentifier: "f28_g42", serverCode: "F28", name: "Guild (Raid Team)", coa: null, memberIdentifiers: [], memberCount: 0 }),
    ],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.reliableHistoricalLookup, null);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ name: "Růženky", coa: null, memberIdentifiers: [], memberCount: 0 })],
    newGuildObservations: [newGuild({ name: "Ruzenky", coa: null, memberIdentifiers: [], memberCount: 0 })],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_g1", name: "Die Legion", coa: null, memberIdentifiers: ids("eu1", 5), leaderIdentifier: "eu1_p1" }),
      oldGuild({ guildIdentifier: "eu4_g2", name: "GenerationZ", coa: COA_A, memberIdentifiers: ids("eu4", 5), leaderIdentifier: "eu4_p1" }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_g1", name: "Legion Z", coa: COA_A, memberIdentifiers: ids("f28", 10), leaderIdentifier: "f28_p1" })],
    highConfidencePlayerMatches: [...mapMembers("eu1", "f28", 5), ...mapMembers("eu4", "f28", 4, 0, 5)],
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.convergenceCandidate, false);
  assert.equal(result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_g1")?.classification, "strong");
  assert.equal(result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_g1")?.autoEligible, true);
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
  const second = result.results.find((entry) => entry.newGuild.guildIdentifier === "f28_g2");
  assert.equal(first?.status, "autoEligible");
  assert.equal(first?.splitCandidate, false);
  assert.equal(first?.identityCandidates[0]?.autoEligible, true);
  assert.equal(second?.status, "unresolved");
  assert.equal(second?.identityCandidates.length, 0);
  assert.equal(second?.memberMigrationEdges[0]?.oldGuildIdentifier, "eu1_g1");
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
  const second = result.results.find((entry) => entry.newGuild.guildIdentifier === "f28_g2");
  assert.equal(first?.status, "split");
  assert.equal(first?.splitCandidate, true);
  assert.equal(first?.identityCandidates[0]?.autoEligible, false);
  assert.equal(second?.status, "split");
  assert.equal(second?.splitCandidate, true);
  assert.equal(second?.identityCandidates[0]?.assignmentConflict, true);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({
        guildIdentifier: "eu1_g1",
        name: "Legion A",
        coa: COA_A,
        memberIdentifiers: ids("eu1", 4),
        officerIdentifiers: ["eu1_p1", "eu1_p2"],
      }),
      oldGuild({
        guildIdentifier: "eu2_g1",
        name: "Legion B",
        coa: COA_A,
        memberIdentifiers: ids("eu2", 4),
        officerIdentifiers: ["eu2_p1", "eu2_p2"],
      }),
    ],
    newGuildObservations: [
      newGuild({
        guildIdentifier: "f28_g1",
        name: "Legion Z",
        coa: COA_A,
        memberIdentifiers: ids("f28", 8),
        officerIdentifiers: ["f28_p1", "f28_p2", "f28_p3", "f28_p4"],
      }),
    ],
    highConfidencePlayerMatches: [
      ...mapMembers("eu1", "f28", 2),
      ...mapMembers("eu2", "f28", 2, 0, 2),
    ],
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates.filter((candidate) => candidate.classification === "strong").length, 2);
  assert.equal(result.identityCandidates.filter((candidate) => candidate.relevantCompetitor).length, 0);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu1_g1", name: "Sladky domov", coa: null, memberIdentifiers: ids("sladky_old", 6) })],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_g1", name: "Sladky domov", coa: null, memberIdentifiers: ids("sladky_new", 6) })],
    highConfidencePlayerMatches: mapMembers("sladky_old", "sladky_new", 6),
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates[0]?.uniqueExactName, true);
  assert.equal(result.identityCandidates[0]?.classification, "strong");
  assert.equal(result.identityCandidates[0]?.autoEligible, true);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu2_ordnungsamt", serverCode: "EU2", name: "Ordnungsamt", coa: COA_A, memberIdentifiers: ids("ordnung_old", 1) })],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_ordnungsamt", name: "Ordnungsamt", coa: COA_A, memberIdentifiers: ids("ordnung_new", 1) })],
    highConfidencePlayerMatches: mapMembers("ordnung_old", "ordnung_new", 1),
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates[0]?.exactName, true);
  assert.equal(result.identityCandidates[0]?.uniqueExactName, true);
  assert.equal(result.identityCandidates[0]?.sameCoA, true);
  assert.equal(result.identityCandidates[0]?.matchedMemberCount, 1);
  assert.equal(result.identityCandidates[0]?.classification, "strong");
  assert.equal(result.identityCandidates[0]?.autoEligible, true);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu2_tiny", serverCode: "EU2", name: "Tiny Office", coa: COA_A, memberIdentifiers: ids("tiny_old", 1) })],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_tiny", name: "Tiny Office", coa: COA_A, memberIdentifiers: ids("tiny_new", 1) })],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.status, "reviewRequired");
  assert.equal(result.identityCandidates[0]?.exactName, true);
  assert.equal(result.identityCandidates[0]?.uniqueExactName, true);
  assert.equal(result.identityCandidates[0]?.sameCoA, true);
  assert.equal(result.identityCandidates[0]?.matchedMemberCount, 0);
  assert.equal(result.identityCandidates[0]?.classification, "plausible");
  assert.equal(result.identityCandidates[0]?.autoEligible, false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_twin", name: "Twin", coa: COA_A, memberIdentifiers: ids("twin1", 5), officerIdentifiers: ["twin1_p1"] }),
      oldGuild({ guildIdentifier: "eu2_twin", serverCode: "EU2", name: "Twin", coa: COA_A, memberIdentifiers: ids("twin2", 5), officerIdentifiers: ["twin2_p1"] }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_twin", name: "Twin", coa: COA_A, memberIdentifiers: [...ids("f28_twin1", 5), ...ids("f28_twin2", 5)], officerIdentifiers: ["f28_twin1_p1", "f28_twin2_p1"] })],
    highConfidencePlayerMatches: [...mapMembers("twin1", "f28_twin1", 5), ...mapMembers("twin2", "f28_twin2", 5)],
  }).results[0];

  assert.equal(result.status, "convergence");
  assert.equal(result.identityCandidates.filter((candidate) => candidate.classification === "strong").length, 2);
  assert.equal(result.identityCandidates.filter((candidate) => candidate.relevantCompetitor).length, 1);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu1_g1", name: "Gluecksbaerchies", coa: null, memberIdentifiers: ids("glueck_old", 1) })],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_g1", name: "Gluecksbaerchies", coa: null, memberIdentifiers: ids("glueck_new", 1) })],
    highConfidencePlayerMatches: mapMembers("glueck_old", "glueck_new", 1),
  }).results[0];

  assert.equal(result.status, "reviewRequired");
  assert.equal(result.identityCandidates[0]?.uniqueExactName, true);
  assert.equal(result.identityCandidates[0]?.classification, "plausible");
  assert.equal(result.identityCandidates[0]?.autoEligible, false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu1_exact_only", name: "Exact Only", coa: null, memberIdentifiers: ids("exact_old", 1) })],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_exact_only", name: "Exact Only", coa: null, memberIdentifiers: ids("exact_new", 1) })],
    highConfidencePlayerMatches: [],
  }).results[0];

  assert.equal(result.status, "reviewRequired");
  assert.equal(result.identityCandidates[0]?.exactName, true);
  assert.equal(result.identityCandidates[0]?.uniqueExactName, true);
  assert.equal(result.identityCandidates[0]?.sameCoA, false);
  assert.equal(result.identityCandidates[0]?.matchedMemberCount, 0);
  assert.equal(result.identityCandidates[0]?.classification, "plausible");
  assert.equal(result.identityCandidates[0]?.autoEligible, false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_g1", name: "Twin Name", coa: null, memberIdentifiers: ids("eu1", 3) }),
      oldGuild({ guildIdentifier: "eu2_g1", serverCode: "EU2", name: "Twin Name", coa: null, memberIdentifiers: ids("eu2", 3) }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_g1", name: "Twin Name", coa: null, memberIdentifiers: ids("f28", 3) })],
    highConfidencePlayerMatches: mapMembers("eu1", "f28", 3),
  }).results[0];

  const matched = result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_g1");
  assert.equal(matched?.exactName, true);
  assert.equal(matched?.uniqueExactName, false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_collision", name: "Collision", coa: null, memberIdentifiers: ids("collision1", 3), leaderIdentifier: "collision1_p1" }),
      oldGuild({ guildIdentifier: "eu2_collision", serverCode: "EU2", name: "Collision", coa: null, memberIdentifiers: ids("collision2", 3), leaderIdentifier: "collision2_p1" }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_collision", name: "Collision", coa: null, memberIdentifiers: ids("collision_new", 3), leaderIdentifier: "collision_new_p1" })],
    highConfidencePlayerMatches: [],
  }).results[0];

  const collision = result.candidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_collision");
  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.candidates.length, 2);
  assert.equal(collision?.exactName, true);
  assert.equal(collision?.uniqueExactName, false);
  assert.equal(collision?.matchedMemberCount, 0);
  assert.equal(collision?.sameCoA, false);
  assert.equal(collision?.leadership.sameLogicalLeader, null);
  assert.equal(collision?.classification, "weak");
  assert.equal(collision?.actionable, false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_same_coa", name: "Same CoA Name", coa: COA_A, memberIdentifiers: ids("samecoa1", 3) }),
      oldGuild({ guildIdentifier: "eu2_same_coa", serverCode: "EU2", name: "Same CoA Name", coa: COA_B, memberIdentifiers: ids("samecoa2", 3) }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_same_coa", name: "Same CoA Name", coa: COA_A, memberIdentifiers: ids("samecoa_new", 3) })],
    highConfidencePlayerMatches: [],
  }).results[0];

  const sameCoa = result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_same_coa");
  assert.equal(result.status, "reviewRequired");
  assert.equal(sameCoa?.exactName, true);
  assert.equal(sameCoa?.uniqueExactName, false);
  assert.equal(sameCoa?.sameCoA, true);
  assert.equal(sameCoa?.matchedMemberCount, 0);
  assert.equal(sameCoa?.classification, "plausible");
  assert.equal(sameCoa?.actionable, true);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_leader", name: "Leader Name", coa: null, memberIdentifiers: ids("leader1", 3), leaderIdentifier: "leader1_p1" }),
      oldGuild({ guildIdentifier: "eu2_leader", serverCode: "EU2", name: "Leader Name", coa: null, memberIdentifiers: ids("leader2", 3), leaderIdentifier: "leader2_p1" }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_leader", name: "Leader Name", coa: null, memberIdentifiers: ids("leader_new", 3), leaderIdentifier: "leader_new_p1" })],
    highConfidencePlayerMatches: [match("leader1_p1", "leader_new_p1")],
  }).results[0];

  const leader = result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_leader");
  assert.equal(result.status, "autoEligible");
  assert.equal(leader?.exactName, true);
  assert.equal(leader?.uniqueExactName, false);
  assert.equal(leader?.matchedMemberCount, 1);
  assert.equal(leader?.leadership.sameLogicalLeader, true);
  assert.equal(leader?.classification, "strong");
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu4_dead", serverCode: "EU4", name: "Dead End", coa: COA_A, memberIdentifiers: ids("dead_old", 13) })],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_erben", name: "Erben im Wandel", coa: COA_A, memberIdentifiers: ids("erben_new", 13) })],
    highConfidencePlayerMatches: mapMembers("dead_old", "erben_new", 13),
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates[0]?.classification, "strong");
  assert.equal(result.identityCandidates[0]?.sameCoA, true);
  assert.equal(result.identityCandidates[0]?.autoEligible, true);
}

{
  const historicalGuilds: GuildFusionObservation[] = [
    oldGuild({ guildIdentifier: "eu1_exil", name: "Exil", coa: null, memberIdentifiers: ids("exil", 49), memberCount: 49 }),
    oldGuild({ guildIdentifier: "eu1_sniff", name: "Sniffindor", coa: null, memberIdentifiers: ids("sniff", 7), memberCount: 7 }),
    oldGuild({ guildIdentifier: "eu1_dead", name: "Dead End", coa: null, memberIdentifiers: ids("dead", 5), memberCount: 5 }),
    oldGuild({ guildIdentifier: "eu1_misc1", name: "Misc 1", coa: null, memberIdentifiers: ids("misc1", 5), memberCount: 5 }),
    oldGuild({ guildIdentifier: "eu1_misc2", name: "Misc 2", coa: null, memberIdentifiers: ids("misc2", 5), memberCount: 5 }),
    oldGuild({ guildIdentifier: "eu1_misc3", name: "Misc 3", coa: null, memberIdentifiers: ids("misc3", 5), memberCount: 5 }),
    oldGuild({ guildIdentifier: "eu1_misc4", name: "Misc 4", coa: null, memberIdentifiers: ids("misc4", 5), memberCount: 5 }),
    oldGuild({ guildIdentifier: "eu1_misc5", name: "Misc 5", coa: null, memberIdentifiers: ids("misc5", 5), memberCount: 5 }),
  ];
  const result = resolveGuildFusions({
    historicalGuildObservations: historicalGuilds,
    newGuildObservations: [
      newGuild({ guildIdentifier: "f28_seelen", name: "Seelen im Wandel", coa: null, memberIdentifiers: [...ids("seelen_exil", 17), ...ids("seelen_sniff", 7), ...ids("seelen_dead", 5), ...ids("seelen_misc1", 5), ...ids("seelen_misc2", 5), ...ids("seelen_misc3", 5), ...ids("seelen_misc4", 5), ...ids("seelen_misc5", 5)], memberCount: 57 }),
      newGuild({ guildIdentifier: "f28_other1", name: "Other 1", coa: null, memberIdentifiers: ids("other1", 7), memberCount: 7 }),
      newGuild({ guildIdentifier: "f28_other2", name: "Other 2", coa: null, memberIdentifiers: ids("other2", 5), memberCount: 5 }),
      newGuild({ guildIdentifier: "f28_other3", name: "Other 3", coa: null, memberIdentifiers: ids("other3", 5), memberCount: 5 }),
      newGuild({ guildIdentifier: "f28_other4", name: "Other 4", coa: null, memberIdentifiers: ids("other4", 5), memberCount: 5 }),
      newGuild({ guildIdentifier: "f28_other5", name: "Other 5", coa: null, memberIdentifiers: ids("other5", 5), memberCount: 5 }),
      newGuild({ guildIdentifier: "f28_other6", name: "Other 6", coa: null, memberIdentifiers: ids("other6", 5), memberCount: 5 }),
    ],
    highConfidencePlayerMatches: [
      ...mapMembers("exil", "seelen_exil", 17),
      ...mapMembers("exil", "other1", 7, 17),
      ...mapMembers("exil", "other2", 5, 24),
      ...mapMembers("exil", "other3", 5, 29),
      ...mapMembers("exil", "other4", 5, 34),
      ...mapMembers("exil", "other5", 5, 39),
      ...mapMembers("exil", "other6", 5, 44),
      ...mapMembers("sniff", "seelen_sniff", 7),
      ...mapMembers("dead", "seelen_dead", 5),
      ...mapMembers("misc1", "seelen_misc1", 5),
      ...mapMembers("misc2", "seelen_misc2", 5),
      ...mapMembers("misc3", "seelen_misc3", 5),
      ...mapMembers("misc4", "seelen_misc4", 5),
      ...mapMembers("misc5", "seelen_misc5", 5),
    ],
  }).results.find((entry) => entry.newGuild.guildIdentifier === "f28_seelen");

  const exil = result?.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_exil");
  assert.equal(result?.status, "autoEligible");
  assert.equal(exil?.classification, "strong");
  assert.equal(exil?.structuralRename, true);
  assert.equal(exil?.autoEligible, true);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_top", name: "Top", coa: null, memberIdentifiers: ids("top", 12), memberCount: 12 }),
      oldGuild({ guildIdentifier: "eu1_close", name: "Close", coa: null, memberIdentifiers: ids("close", 10), memberCount: 10 }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_target", name: "Target", coa: null, memberIdentifiers: [...ids("target_top", 12), ...ids("target_close", 10)], memberCount: 22 })],
    highConfidencePlayerMatches: [...mapMembers("top", "target_top", 12), ...mapMembers("close", "target_close", 10)],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.identityCandidates.length, 0);
  assert.equal(result.memberMigrationEdges.length, 2);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu3_welten", serverCode: "EU3", name: "Welten im Wandel", coa: COA_A, memberIdentifiers: ids("eu3", 29) }),
      oldGuild({ guildIdentifier: "eu1_welten", serverCode: "EU1", name: "Welten im Wandel", coa: null, memberIdentifiers: [], memberCount: 0 }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_welten", name: "Welten im Wandel", coa: COA_A, memberIdentifiers: ids("f28", 29) })],
    highConfidencePlayerMatches: mapMembers("eu3", "f28", 29),
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu3_welten")?.classification, "anchored");
  assert.equal(result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu3_welten")?.autoEligible, true);
  assert.equal(result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_welten"), undefined);
  assert.equal(result.candidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_welten")?.classification, "weak");
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_marathon", name: "Marathon Runners", coa: COA_A, memberIdentifiers: ids("marathon", 36), officerIdentifiers: ids("marathon", 8) }),
      oldGuild({ guildIdentifier: "eu4_storm", serverCode: "EU4", name: "ThunderStorm", coa: null, memberIdentifiers: ids("storm", 7), leaderIdentifier: "storm_p1", officerIdentifiers: ["storm_p2"] }),
    ],
    newGuildObservations: [
      newGuild({
        guildIdentifier: "f28_marathon",
        name: "Marathon Runners",
        coa: COA_A,
        memberIdentifiers: [...ids("f28_marathon", 36), ...ids("f28_storm", 7)],
        leaderIdentifier: "f28_storm_p1",
        officerIdentifiers: ["f28_storm_p2", ...ids("f28_marathon", 8)],
      }),
    ],
    highConfidencePlayerMatches: [
      ...mapMembers("marathon", "f28_marathon", 36),
      match("storm_p1", "f28_storm_p1"),
      match("storm_p2", "f28_storm_p2"),
      ...mapMembers("storm", "f28_storm", 5, 2, 2),
    ],
  }).results[0];

  assert.equal(result.status, "autoEligible");
  assert.equal(result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_marathon")?.classification, "anchored");
  assert.equal(result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu1_marathon")?.autoEligible, true);
  assert.equal(result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu4_storm")?.classification, "strong");
  assert.equal(result.identityCandidates.find((candidate) => candidate.oldGuildIdentifier === "eu4_storm")?.relevantCompetitor, false);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [
      oldGuild({ guildIdentifier: "eu1_a", name: "Guild A", coa: COA_A, memberIdentifiers: ids("a", 5) }),
      oldGuild({ guildIdentifier: "eu2_b", serverCode: "EU2", name: "Guild A", coa: COA_A, memberIdentifiers: ids("b", 5) }),
    ],
    newGuildObservations: [newGuild({ guildIdentifier: "f28_mix", name: "Guild A", coa: COA_A, memberIdentifiers: [...ids("f28_a", 5), ...ids("f28_b", 5)] })],
    highConfidencePlayerMatches: [...mapMembers("a", "f28_a", 5), ...mapMembers("b", "f28_b", 5)],
  }).results[0];

  assert.equal(result.status, "convergence");
  assert.equal(result.identityCandidates.filter((candidate) => candidate.classification === "strong").length, 2);
  assert.equal(result.identityCandidates.filter((candidate) => candidate.relevantCompetitor).length, 1);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu1_dup", name: "Duplicate", coa: COA_A, memberIdentifiers: ids("dup", 5) })],
    newGuildObservations: [
      newGuild({ guildIdentifier: "f28_dup", name: "Duplicate", coa: COA_A, memberIdentifiers: ids("dup_new", 5), timestamp: NEW_TS }),
      newGuild({ guildIdentifier: "f28_dup", name: "Duplicate", coa: COA_A, memberIdentifiers: ids("dup_new", 5), timestamp: NEW_TS + 1000 }),
    ],
    highConfidencePlayerMatches: mapMembers("dup", "dup_new", 5),
  });

  assert.equal(result.results.filter((entry) => entry.newGuild.guildIdentifier === "f28_dup").length, 1);
  assert.equal(result.results[0]?.identityCandidates.length, 1);
}

{
  const result = resolveGuildFusions({
    historicalGuildObservations: [oldGuild({ guildIdentifier: "eu1_exil", name: "Exil", coa: null, memberIdentifiers: ids("exil_dup", 1) })],
    newGuildObservations: [
      newGuild({ guildIdentifier: "f28_ordnungsamt", name: "Ordnungsamt", coa: COA_A, memberIdentifiers: ids("ordnung_dup", 1), timestamp: NEW_TS }),
      newGuild({ guildIdentifier: "f28_ordnungsamt", name: "Ordnungsamt", coa: COA_A, memberIdentifiers: ids("ordnung_dup", 1), timestamp: NEW_TS + 1000 }),
    ],
    highConfidencePlayerMatches: mapMembers("exil_dup", "ordnung_dup", 1),
  });

  assert.equal(result.results.filter((entry) => entry.newGuild.guildIdentifier === "f28_ordnungsamt").length, 1);
  assert.equal(result.results[0]?.memberMigrationEdges.length, 1);
  assert.equal(result.results[0]?.memberMigrationEdges[0]?.oldGuildIdentifier, "eu1_exil");
  assert.equal(result.results[0]?.memberMigrationEdges[0]?.matchedMemberCount, 1);
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

console.log("guildFusionResolver V3 test passed");
