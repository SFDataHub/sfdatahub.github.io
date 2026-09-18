import assert from "node:assert/strict";

import {
  areFusionRelated,
  getDirectFusionDestination,
  getFusionLineage,
  getFusionOrigins,
  getServerByCode,
  resolveServer,
  resolveServerNumericId,
} from "../../src/lib/servers/serverResolver.ts";

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

assert.equal(getServerByCode("eu3")?.code, "EU3");
assert.equal(getDirectFusionDestination("EU3")?.code, "F28");
assert.deepEqual(
  getFusionLineage("EU3").map((server) => server.code),
  ["EU3", "F28"],
);
assert.deepEqual(
  getFusionOrigins("F28").map((server) => server.code).sort(),
  ["EU1", "EU2", "EU3", "EU4"],
);

assert.equal(areFusionRelated("EU3", "F28"), true);
assert.equal(areFusionRelated("EU1", "EU3"), true);
assert.equal(areFusionRelated("unknown", "EU3"), false);
assert.equal(resolveServer("unknown"), null);

console.log("serverResolver test passed");
