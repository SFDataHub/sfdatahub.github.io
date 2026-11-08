import assert from "node:assert/strict";
import { excludeHiddenPickerServers, isHiddenPickerServer, serverPickerPresentation } from "../../src/components/Filters/serverPickerModel.ts";
import { buildServerGroupsFromCodes } from "../../src/components/Filters/serverGroups.ts";
import { buildToplistServerGroupsFromRegistry } from "../../src/pages/DataHub/localToplistPageModel.ts";
import { PageContextStore, PAGE_CONTEXT_PREFIX } from "../../src/lib/data-hub/pageContextStore.ts";
import { resolveServer, validateServerGraph } from "../../src/lib/servers/serverResolver.ts";
import { SERVERS } from "../../src/data/servers.ts";

const retained = ["EU8", "am1_net", "f28_net", "stumblesteppe_net"];
for (const hidden of ["SPEED", "speed", " speed ", "speed.sfgame.net", "https://speed.sfgame.net"]) {
  assert(isHiddenPickerServer(hidden), hidden);
  assert.deepEqual(excludeHiddenPickerServers([...retained, hidden]), retained);
}
for (const [code, name, short] of [
  ["BLACKFOREST", "Black Forest", "BF"], ["GNAROGRIM", "Gnarogrim", "GN"],
  ["MAERWYNN", "Maerwynn", "MW"], ["STUMBLESTEPPE", "Stumble Steppe", "STS"],
]) {
  const presentation = serverPickerPresentation(code);
  assert.equal(presentation.fullName, name);
  assert.equal(presentation.lines.join(" "), name);
  assert.equal(presentation.short, short);
  assert(presentation.fusion && presentation.named);
  for (const query of [name.toLowerCase(), short.toLowerCase(), code.toLowerCase()])
    assert(presentation.searchTerms.some(term => term.includes(query)));
  assert.equal(resolveServer(short), null, "Display abbreviations are not data keys");
}
assert.equal(serverPickerPresentation("stumblesteppe_net").short, "STS");
assert.equal(serverPickerPresentation("mearwynn").fullName, "Maerwynn");
assert.equal(serverPickerPresentation("f28_net").short, "F28");
assert(serverPickerPresentation("f28_net").fusion);
for (const code of ["EU8", "AM1", "EU31"]) assert(!serverPickerPresentation(code).fusion);
const groups = buildToplistServerGroupsFromRegistry();
assert(!Object.values(groups).flat().some(isHiddenPickerServer));
assert(groups.EU.includes("EU31"));
assert(groups.Fusion.includes("F29"));
for (const code of ["EU5", "EU6", "EU7", "EU8"]) assert(groups.EU.includes(code));
const configGroups = buildServerGroupsFromCodes(SERVERS.filter(server => server.active !== false).map(server => server.id));
assert.deepEqual(Object.values(configGroups).flat().map(code => resolveServer(code)?.code).sort(), Object.values(groups).flat().sort());
const bundled = buildServerGroupsFromCodes(["f28_net", "F28", "SPEED", "speed.sfgame.net", "F6", "F29", "stumblesteppe_net"]);
assert.deepEqual(bundled, { EU: [], US: [], INT: ["stumblesteppe_net"], Fusion: ["f28_net", "F29"] });

const values = new Map<string, string>();
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
values.set(PAGE_CONTEXT_PREFIX + "local-toplist", JSON.stringify({ schemaVersion: 1, feature: "local-toplist", generation: 1, initialized: true, guild: null, servers: [...retained, "SPEED"], targetKeys: [], error: null }));
const store = new PageContextStore(() => storage);
assert.deepEqual(store.get("local-toplist").servers, retained);
store.selectServers([...retained, "speed.sfgame.net"]);
assert.deepEqual(new PageContextStore(() => storage).get("local-toplist").servers, retained);
assert.deepEqual(validateServerGraph(), []);
console.log("PASS picker motifs, names/search, exact retained keys, active config/registry parity, SPEED in groups and restored/updated session selections");
