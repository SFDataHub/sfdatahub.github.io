import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AnchoredLineChart from "../../src/components/ui/charts/AnchoredLineChart.tsx";
import { buildGuildAnalyticsFusionMarkers } from "../../src/lib/guilds/guildAnalyticsFusionMarkers.ts";
import { parseServerFromGuildIdentifier } from "../../src/lib/guilds/localScanLibrary.ts";
import { createServerGraph } from "../../src/lib/servers/serverResolver.ts";
import type { LocalServerFusionEvent } from "../../src/data/serverFusions.ts";
import type { LocalServerDefinition } from "../../src/data/serverRegistry.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const compareSource = fs.readFileSync(path.join(repoRoot, "src/pages/GuildHub/compareGuilds.tsx"), "utf8");
const chartSource = fs.readFileSync(path.join(repoRoot, "src/components/ui/charts/AnchoredLineChart.tsx"), "utf8");
const markerSource = fs.readFileSync(path.join(repoRoot, "src/lib/guilds/guildAnalyticsFusionMarkers.ts"), "utf8");

const syntheticServers: LocalServerDefinition[] = [
  defineServer("DEMO_A", false),
  defineServer("DEMO_B", false),
  defineServer("DEMO_C", true),
  defineServer("DEMO_D", false),
  defineServer("DEMO_E", true),
  defineServer("DEMO_X", false),
  defineServer("DEMO_Y", true),
  defineServer("DEMO_SOLO", true),
  defineServer("DEMO_ORIGIN_A", false),
  defineServer("DEMO_ORIGIN_B", false),
  defineServer("DEMO_ORIGIN_C", false),
  defineServer("DEMO_F6", true, "F6"),
  defineServer("DEMO_F12", true, "F12"),
  defineServer("DEMO_F20", true, "F20"),
  defineServer("DEMO_STUMBLE", true, "Stumble Steppe"),
  defineServer("DEMO_CHAIN_F6", true, "F6"),
  defineServer("DEMO_CHAIN_F20", true, "F20"),
  defineServer("DEMO_CHAIN_STUMBLE", true, "Stumble Steppe"),
];

const syntheticEvents: LocalServerFusionEvent[] = [
  { id: "demo-a-b", origins: ["DEMO_A"], target: "DEMO_B", effectiveDate: "2026-02-01", compensationPolicy: "none" },
  { id: "demo-b-c", origins: ["DEMO_B"], target: "DEMO_C", effectiveDate: "2026-03-01", compensationPolicy: "none" },
  { id: "demo-d-e", origins: ["DEMO_D"], target: "DEMO_E", compensationPolicy: "unknown" },
  { id: "demo-x-y", origins: ["DEMO_X"], target: "DEMO_Y", effectiveDate: "2026-04-01", compensationPolicy: "none" },
  {
    id: "demo-origins-f6",
    origins: ["DEMO_ORIGIN_A", "DEMO_ORIGIN_B", "DEMO_ORIGIN_C"],
    target: "DEMO_F6",
    effectiveDate: "2026-05-01",
    compensationPolicy: "none",
  },
  {
    id: "demo-f6-stumble",
    origins: ["DEMO_F6", "DEMO_F12", "DEMO_F20"],
    target: "DEMO_STUMBLE",
    effectiveDate: "2026-06-01",
    compensationPolicy: "none",
  },
  {
    id: "demo-chain-f6-f20",
    origins: ["DEMO_CHAIN_F6"],
    target: "DEMO_CHAIN_F20",
    effectiveDate: "2026-07-01",
    compensationPolicy: "none",
  },
  {
    id: "demo-chain-f20-stumble",
    origins: ["DEMO_CHAIN_F20"],
    target: "DEMO_CHAIN_STUMBLE",
    effectiveDate: "2026-08-01",
    compensationPolicy: "none",
  },
];

const graph = createServerGraph(syntheticServers, syntheticEvents);
const fullDomain = {
  startMs: Date.UTC(2026, 0, 1),
  endMs: Date.UTC(2026, 11, 31),
};
const now = "2026-12-31";

const singleMarkers = buildGuildAnalyticsFusionMarkers(["DEMO_A", "DEMO_B"], fullDomain, { graph, now });
assert.equal(singleMarkers.length, 1, "Single fusion lineage should create one marker.");
assert.equal(singleMarkers[0]?.eventId, "demo-a-b");
assert.equal(singleMarkers[0]?.timestampMs, Date.UTC(2026, 1, 1));
assert.equal(singleMarkers[0]?.targetServerDisplayName, "DEMO_B");
assert.deepEqual(singleMarkers[0]?.originServerDisplayNames, ["DEMO_A"]);
assert.equal(singleMarkers[0]?.effectiveDate, "2026-02-01");

const multiStageMarkers = buildGuildAnalyticsFusionMarkers(["DEMO_A", "DEMO_B", "DEMO_C"], fullDomain, { graph, now });
assert.deepEqual(
  multiStageMarkers.map((marker) => marker.eventId),
  ["demo-a-b", "demo-b-c"],
  "Multi-stage lineage should create one marker per visible fusion event.",
);

const f6Markers = buildGuildAnalyticsFusionMarkers(["DEMO_ORIGIN_A", "DEMO_ORIGIN_B", "DEMO_ORIGIN_C", "DEMO_F6"], fullDomain, { graph, now });
assert.deepEqual(
  f6Markers.map((marker) => marker.eventId),
  ["demo-origins-f6"],
  "Multi-origin traversal should create one marker for the shared target event.",
);
assert.deepEqual(
  f6Markers.map((marker) => marker.targetServerDisplayName),
  ["F6"],
  "Marker label should use the target server display name from the registry.",
);

const duplicateTraversalMarkers = buildGuildAnalyticsFusionMarkers(
  ["DEMO_ORIGIN_A", "DEMO_ORIGIN_B", "DEMO_ORIGIN_C", "DEMO_F6", "DEMO_F6"],
  fullDomain,
  { graph, now },
);
assert.deepEqual(
  duplicateTraversalMarkers.map((marker) => marker.eventId),
  ["demo-origins-f6"],
  "Duplicate traversal paths for the same fusion event should produce one marker.",
);

const stumbleMarkers = buildGuildAnalyticsFusionMarkers(["DEMO_ORIGIN_A", "DEMO_F6", "DEMO_STUMBLE"], fullDomain, { graph, now });
assert.deepEqual(
  stumbleMarkers.map((marker) => marker.eventId),
  ["demo-origins-f6", "demo-f6-stumble"],
  "Two real fusion events should produce two chronologically ordered markers.",
);
assert.deepEqual(
  stumbleMarkers.map((marker) => marker.targetServerDisplayName),
  ["F6", "Stumble Steppe"],
  "Multi-stage labels should name each event target server.",
);
const multiOriginMarker = stumbleMarkers.find((marker) => marker.eventId === "demo-f6-stumble");
assert.ok(multiOriginMarker, "Multi-origin fusion event should create one marker.");
assert.deepEqual(
  multiOriginMarker.originServerDisplayNames,
  ["F6", "F12", "F20"],
  "Multi-origin tooltip data should include every origin display name from the registry.",
);
assert.equal(
  stumbleMarkers.filter((marker) => marker.eventId === "demo-f6-stumble").length,
  1,
  "Multi-origin fusion should remain one marker, not one marker per origin.",
);

const reconstructedLineageMarkers = buildGuildAnalyticsFusionMarkers(
  ["DEMO_CHAIN_F6", "DEMO_CHAIN_STUMBLE"],
  fullDomain,
  { graph, now },
);
assert.deepEqual(
  reconstructedLineageMarkers.map((marker) => marker.eventId),
  ["demo-chain-f6-f20", "demo-chain-f20-stumble"],
  "Server lineage between observed guild-history servers should keep every direct fusion stage.",
);

const observedMultiStageMarkers = buildGuildAnalyticsFusionMarkers(
  ["DEMO_CHAIN_F6", "DEMO_CHAIN_F20", "DEMO_CHAIN_STUMBLE"],
  fullDomain,
  { graph, now },
);
assert.deepEqual(
  observedMultiStageMarkers.map((marker) => marker.eventId),
  ["demo-chain-f6-f20", "demo-chain-f20-stumble"],
  "Observed multi-stage guild history should keep multiple fusion markers.",
);

const rangeMarkers = buildGuildAnalyticsFusionMarkers(
  ["DEMO_A", "DEMO_B", "DEMO_C"],
  { startMs: Date.UTC(2026, 2, 15), endMs: Date.UTC(2026, 11, 31) },
  { graph, now },
);
assert.deepEqual(rangeMarkers, [], "Fusion events outside the visible chart range should not render.");

const unknownDateMarkers = buildGuildAnalyticsFusionMarkers(["DEMO_D", "DEMO_E"], fullDomain, { graph, now });
assert.deepEqual(unknownDateMarkers, [], "Fusion events without a valid effectiveDate should not render.");

const currentServerOnlyMarkers = buildGuildAnalyticsFusionMarkers("DEMO_C", fullDomain, { graph, now });
assert.deepEqual(
  currentServerOnlyMarkers,
  [],
  "Current server alone should not render broad ancestor fusion markers without guild history context.",
);

const unrelatedMarkers = buildGuildAnalyticsFusionMarkers(["DEMO_A", "DEMO_B", "DEMO_C"], fullDomain, { graph, now });
assert.equal(
  unrelatedMarkers.some((marker) => marker.eventId === "demo-x-y"),
  false,
  "Fusion events from unrelated server trees should not render.",
);

const noFusionMarkers = buildGuildAnalyticsFusionMarkers("DEMO_SOLO", fullDomain, { graph, now });
assert.deepEqual(noFusionMarkers, [], "Servers without fusion lineage should leave the chart unchanged.");

const renderedChart = renderToStaticMarkup(
  React.createElement(AnchoredLineChart, {
    points: [],
    series: [
      {
        key: "demo-series",
        label: "Demo",
        points: [],
        timePoints: [
          { timestampMs: fullDomain.startMs, value: 1 },
          { timestampMs: fullDomain.endMs, value: 2 },
        ],
      },
    ],
    timeDomain: fullDomain,
    verticalMarkers: singleMarkers.map((marker, index) => ({ ...marker, tooltipIndex: index })),
    showAvg: false,
    showFill: false,
    showDots: false,
  }),
);
const renderedMarkerX = Number(
  renderedChart.match(/player-profile__trend-vertical-marker[\s\S]*?<line x1="([^"]+)"/)?.[1],
);
const expectedMarkerX = 68 + ((Date.UTC(2026, 1, 1) - fullDomain.startMs) / (fullDomain.endMs - fullDomain.startMs)) * (600 - 68 - 40);
assert.equal(
  Math.abs(renderedMarkerX - expectedMarkerX) < 0.001,
  true,
  "Vertical marker x should be projected with the chart time scale.",
);
assert.doesNotMatch(renderedChart, />DEMO_B</, "Vertical markers should not render permanent target server labels.");
assert.doesNotMatch(renderedChart, /<title>/, "Fusion details should move out of SVG title labels.");
assert.match(renderedChart, /player-profile__trend-vertical-marker-hitline/, "Vertical markers should expose a hover hitline.");

assert.equal(
  [...compareSource.matchAll(/verticalMarkers=\{fusionMarkers\}/g)].length,
  0,
  "Guild charts should pass prepared generic vertical markers with tooltip indexes.",
);
assert.equal(
  [...compareSource.matchAll(/verticalMarkers=\{verticalFusionMarkers\}/g)].length,
  2,
  "Guild Development and Fight Participation charts should both receive prepared fusion markers.",
);
assert.match(
  compareSource,
  /collectGuildFusionServerInputs\(analyticsData, activeGuild, series\.allPoints\)/,
  "Fusion markers should be scoped from matched guild history observations.",
);
assert.match(
  compareSource,
  /parseServerFromGuildIdentifier\(guild\.guildIdentifier\)/,
  "Fusion marker input should recover server codes from historical guild identifiers through the shared helper.",
);
assert.doesNotMatch(
  compareSource,
  /function readServerCodeFromGuildIdentifier|_g\[a-z0-9\]/,
  "Guild Fusion marker path should not keep a second local guild-identifier parsing regex.",
);
assert.match(
  compareSource,
  /function FusionMarkerTooltip/,
  "Fusion event details should render through the chart hover overlay.",
);
assert.match(
  compareSource,
  /marker\.originServerDisplayNames\.join\(", "\)/,
  "Fusion tooltip should render all origin display names.",
);
assert.match(
  chartSource,
  /const projectedVerticalMarkers(?:: ProjectedVerticalMarker\[\])? =[\s\S]*?x = scaleTimeX\(marker\.timestampMs\)/,
  "Vertical markers should use the existing chart time scale.",
);
assert.ok(
  chartSource.indexOf("player-profile__trend-vertical-markers") < chartSource.indexOf("player-profile__trend-line"),
  "Vertical markers should render before data lines.",
);
assert.doesNotMatch(
  chartSource,
  /<text x=\{marker\./,
  "Vertical markers should not render permanent text labels in the chart.",
);
assert.match(
  chartSource,
  /tooltipIndex:\s*marker\.tooltipIndex/,
  "Vertical markers should carry generic tooltip indexes.",
);
assert.doesNotMatch(markerSource, /Stumble Steppe|STUMBLESTEPPE/, "Marker builder should use registry display names instead of hardcoded server labels.");

assert.equal(parseServerFromGuildIdentifier("f6_g8"), "F6");
assert.equal(parseServerFromGuildIdentifier("f20_g1"), "F20");
assert.equal(parseServerFromGuildIdentifier("stumblesteppe_net_g66309"), "STUMBLESTEPPE_NET");

function defineServer(code: string, active: boolean, displayName = code): LocalServerDefinition {
  return {
    code,
    displayName,
    host: `${code.toLowerCase()}.test`,
    hosts: [`${code.toLowerCase()}.test`],
    region: "Test",
    type: active ? "fusion" : "origin",
    active,
    aliases: [],
  };
}

console.log("guildAnalyticsFusionMarkers test passed");
