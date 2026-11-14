import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { usageEvent, dungeonBookIds } = require("../../auth-api/src/internal/analytics/visitor/events.ts") as typeof import("../../auth-api/src/internal/analytics/visitor/events");
import { qaTopics } from "../../src/lib/help/qaCatalog";
import { LOCAL_SERVER_REGISTRY } from "../../src/data/serverRegistry";
const { uploadViewEvents, scanViewEvents, fightViewEvents, playerViewEvents, guildViewEvents, analyticsViewEvents, fusionViewEvents } = require("../../src/lib/analytics/localEvents.ts") as typeof import("../../src/lib/analytics/localEvents");
let cases = 0;
for (const catalog of [uploadViewEvents, scanViewEvents, fightViewEvents, playerViewEvents, guildViewEvents, analyticsViewEvents, fusionViewEvents]) {
  for (const event of Object.values(catalog)) { assert(usageEvent(event), event); cases++; }
}
for (const topic of qaTopics) for (const section of topic.sections) for (const id of section.questions) {
  assert(usageEvent(`help/qa/question-open/${id}`), id); cases++;
}
for (const server of LOCAL_SERVER_REGISTRY) for (const tab of ["players", "guilds"]) {
  assert(usageEvent(`datahub/toplist/${tab}/server-view/${server.code}`), server.code); cases++;
}
for (const id of dungeonBookIds) { assert(usageEvent(`dungeons/library/book-open/${id}`)); cases++; }
console.log(JSON.stringify({ contractCases: cases }));
