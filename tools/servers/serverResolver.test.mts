import assert from "node:assert/strict";

import {
  areFusionRelated,
  createServerGraph,
  getDirectFusionDestination,
  getDirectFusionOrigins,
  getFusionAncestorEvents,
  getFusionEvent,
  getFusionEventById,
  getFusionEventForTarget,
  getFusionEventStatus,
  getFusionLineage,
  getFusionOrigins,
  getServerByCode,
  isFusionAncestor,
  isFusionEventEffective,
  resolveServer,
  resolveServerNumericId,
  validateServerGraph,
} from "../../src/lib/servers/serverResolver.ts";
import type { LocalServerFusionEvent } from "../../src/data/serverFusions.ts";
import type { LocalServerDefinition } from "../../src/data/serverRegistry.ts";

const eu3Inputs = ["EU3", "eu3", "s3_eu", "s3eu", "s3.sfgame.eu", "https://s3.sfgame.eu/profile"];

eu3Inputs.forEach((input) => {
  assert.equal(resolveServer(input)?.code, "EU3", input);
});

assert.equal(resolveServer(462)?.code, "EU3");
assert.equal(resolveServerNumericId(462)?.code, "EU3");
assert.equal(resolveServerNumericId("462")?.code, "EU3");

assert.equal(resolveServer("F28")?.code, "F28");
assert.equal(resolveServer("f28_net")?.code, "F28");
assert.equal(resolveServer("f28.sfgame.net")?.code, "F28");
assert.equal(resolveServer(549)?.code, "F28");
assert.equal(resolveServer("EU1")?.releaseDate, "2023-01-06");
assert.equal(resolveServer("EU2")?.releaseDate, "2023-02-24");
assert.equal(resolveServer("EU3")?.releaseDate, "2023-04-14");
assert.equal(resolveServer("EU4")?.releaseDate, "2023-05-26");

assert.equal(resolveServer("EU5")?.code, "EU5");
assert.equal(resolveServer("EU5")?.active, true);
assert.equal(resolveServer(466)?.code, "EU5");
assert.equal(resolveServer("s5.sfgame.eu")?.code, "EU5");
assert.equal(resolveServer("F29")?.code, "F29");
assert.equal(resolveServer("F29")?.active, false);
assert.equal(resolveServer("f29_net")?.code, "F29");
assert.equal(resolveServer(550)?.code, "F29");
assert.equal(resolveServer("black_forest")?.code, "BLACKFOREST");
assert.equal(resolveServer("granogrim_net")?.code, "GNAROGRIM");
assert.equal(resolveServer("stumplesteppe_net")?.code, "STUMBLESTEPPE");

assert.equal(getServerByCode("eu3")?.code, "EU3");
assert.equal(getDirectFusionDestination("EU3")?.code, "F28");
assert.equal(getFusionEvent("EU3", "F28")?.id, "fusion-f28");
assert.equal(getFusionEvent("EU3", "F28")?.compensationPolicy, "levelGoldV1");
assert.equal(getFusionEventById("FUSION-F28")?.target, "F28");
assert.equal(getFusionEventForTarget("F28")?.id, "fusion-f28");
assert.deepEqual(
  getFusionLineage("EU3").map((server) => server.code),
  ["EU3", "F28"],
);
assert.deepEqual(
  getDirectFusionOrigins("F28").map((server) => server.code).sort(),
  ["EU1", "EU2", "EU3", "EU4"],
);
assert.deepEqual(
  getFusionOrigins("F28").map((server) => server.code).sort(),
  ["EU1", "EU2", "EU3", "EU4"],
);

assert.deepEqual(
  getDirectFusionOrigins("MAERWYNN").map((server) => server.code).sort(),
  ["F1", "F2", "F3", "F4", "F5"],
);
const maerwynnOrigins = getFusionOrigins("MAERWYNN").map((server) => server.code);
assert.equal(maerwynnOrigins.includes("F1"), false);
assert.equal(maerwynnOrigins.includes("BR1"), true);
assert.equal(maerwynnOrigins.includes("US10"), true);
assert.equal(maerwynnOrigins.includes("ES12"), true);
assert.equal(maerwynnOrigins.includes("MINIJUEGOS"), true);
assert.deepEqual(
  getFusionAncestorEvents("MAERWYNN").map((event) => event.id),
  ["fusion-f1", "fusion-f2", "fusion-f3", "fusion-f4", "fusion-f5", "fusion-maerwynn"],
);

const f29 = getFusionEventForTarget("F29");
assert.equal(f29?.id, "fusion-f29");
assert.equal(getFusionEventStatus(f29!, "2026-09-23"), "future");
assert.equal(isFusionEventEffective(f29!, "2026-09-23"), false);
assert.equal(getFusionEventStatus(f29!, "2026-10-16"), "effective");
assert.equal(isFusionEventEffective(f29!, "2026-10-16"), true);
assert.equal(
  getFusionEventStatus({ id: "unknown-date", origins: ["EU1"], target: "F28", compensationPolicy: "none" }),
  "unknown-effective-date",
);

assert.equal(areFusionRelated("EU3", "F28"), true);
assert.equal(areFusionRelated("EU1", "EU3"), true);
assert.equal(areFusionRelated("BR1", "MAERWYNN"), true);
assert.equal(isFusionAncestor("F1", "MAERWYNN"), true);
assert.equal(isFusionAncestor("BR1", "MAERWYNN"), true);
assert.equal(areFusionRelated("unknown", "EU3"), false);
assert.equal(resolveServer("unknown"), null);

const syntheticServers: LocalServerDefinition[] = [
  { code: "DEMO_A", displayName: "Demo A", host: "demo-a.test", hosts: ["demo-a.test"], region: "Test", type: "origin", active: false, aliases: [] },
  { code: "DEMO_B", displayName: "Demo B", host: "demo-b.test", hosts: ["demo-b.test"], region: "Test", type: "origin", active: false, aliases: [] },
  { code: "DEMO_C", displayName: "Demo C", host: "demo-c.test", hosts: ["demo-c.test"], region: "Test", type: "origin", active: true, aliases: [] },
  { code: "DEMO_F1", displayName: "Demo Fusion 1", host: "demo-f1.test", hosts: ["demo-f1.test"], region: "Test", type: "fusion", active: false, aliases: [] },
  { code: "DEMO_NAMED", displayName: "Demo Named", host: "demo-named.test", hosts: ["demo-named.test"], region: "Test", type: "named", active: true, aliases: [] },
];
const syntheticEvents: LocalServerFusionEvent[] = [
  { id: "demo-f1", origins: ["DEMO_A", "DEMO_B"], target: "DEMO_F1", effectiveDate: "2024-01-01", compensationPolicy: "none" },
  { id: "demo-named", origins: ["DEMO_F1", "DEMO_C"], target: "DEMO_NAMED", effectiveDate: "2024-02-01", compensationPolicy: "unknown" },
];
const syntheticGraph = createServerGraph(syntheticServers, syntheticEvents);
assert.deepEqual(
  syntheticGraph.getDirectFusionOrigins("DEMO_NAMED").map((server) => server.code).sort(),
  ["DEMO_C", "DEMO_F1"],
);
assert.deepEqual(
  syntheticGraph.getFusionOrigins("DEMO_NAMED").map((server) => server.code).sort(),
  ["DEMO_A", "DEMO_B", "DEMO_C"],
);
assert.equal(syntheticGraph.isFusionAncestor("DEMO_F1", "DEMO_NAMED"), true);

const issueCodes = (servers: LocalServerDefinition[], events: LocalServerFusionEvent[]) =>
  validateServerGraph(servers, events).map((issue) => issue.code);
assert.equal(issueCodes([{ ...syntheticServers[0] }, { ...syntheticServers[0] }], []).includes("duplicate-server-code"), true);
assert.equal(
  issueCodes([{ ...syntheticServers[0] }, { ...syntheticServers[1], numericId: syntheticServers[0].numericId ?? 1 }, { ...syntheticServers[0], code: "DEMO_X", numericId: 1 }], []).includes("duplicate-numeric-id"),
  true,
);
assert.equal(issueCodes(syntheticServers, [{ id: "bad-origin", origins: ["MISSING"], target: "DEMO_F1", compensationPolicy: "none" }]).includes("unknown-origin"), true);
assert.equal(issueCodes(syntheticServers, [{ id: "bad-target", origins: ["DEMO_A"], target: "MISSING", compensationPolicy: "none" }]).includes("unknown-target"), true);
assert.equal(issueCodes(syntheticServers, [{ id: "self", origins: ["DEMO_A"], target: "DEMO_A", compensationPolicy: "none" }]).includes("self-reference"), true);
assert.equal(
  issueCodes(syntheticServers, [
    { id: "cycle-a", origins: ["DEMO_A"], target: "DEMO_F1", compensationPolicy: "none" },
    { id: "cycle-b", origins: ["DEMO_F1"], target: "DEMO_A", compensationPolicy: "none" },
  ]).includes("cycle"),
  true,
);
assert.equal(
  issueCodes(syntheticServers, [
    { id: "out-a", origins: ["DEMO_A"], target: "DEMO_F1", compensationPolicy: "none" },
    { id: "out-b", origins: ["DEMO_A"], target: "DEMO_NAMED", compensationPolicy: "none" },
  ]).includes("duplicate-fusion-origin"),
  true,
);

console.log("serverResolver test passed");
