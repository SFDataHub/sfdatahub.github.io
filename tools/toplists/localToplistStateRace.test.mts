import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const toplistSource = () => fs.readFileSync(path.join(repoRoot, "src/pages/GuildHub/Toplist.tsx"), "utf8");

describe("local toplist state and race guards", () => {
  test("starts new data runs without keeping stale result rows under a new dataset id", () => {
    const source = toplistSource();

    assert.match(source, /const latestDataRunKeyRef = React\.useRef\(""\)/);
    assert.match(source, /latestDataRunKeyRef\.current = datasetId/);
    assert.match(source, /\{ result: null, datasetId, loading: true, error: null \}/);
    assert.equal(source.includes("setDataState((state) => ({ ...state, datasetId, loading: true, error: null }))"), false);
  });

  test("applies async data and worker results only for the latest recorded run key", () => {
    const source = toplistSource();

    assert.match(source, /controller\.signal\.aborted \|\| latestDataRunKeyRef\.current !== datasetId/);
    assert.match(source, /const latestViewRequestKeyRef = React\.useRef\(""\)/);
    assert.match(source, /latestViewRequestKeyRef\.current = viewRequest\.key/);
    assert.match(source, /latestViewRequestKeyRef\.current === viewRequest\.key/);
    assert.match(source, /latestViewRequestKeyRef\.current !== viewRequest\.key/);
  });

  test("local lazy rendering remains outside the worker view request dependencies", () => {
    const source = toplistSource();
    const activeViewRequestStart = source.indexOf("const activeViewRequest = React.useMemo");
    const activeViewEffectStart = source.indexOf("React.useEffect(() => {\n    const worker = workerRef.current;", activeViewRequestStart);
    const activeViewEffectEnd = source.indexOf("const staticToplistsValue = React.useMemo", activeViewEffectStart);
    assert.ok(activeViewRequestStart >= 0);
    assert.ok(activeViewEffectStart > activeViewRequestStart);
    assert.ok(activeViewEffectEnd > activeViewEffectStart);

    const workerRequestSection = source.slice(activeViewRequestStart, activeViewEffectEnd);
    assert.equal(workerRequestSection.includes("visiblePlayerCount"), false);
    assert.equal(workerRequestSection.includes("setVisiblePlayerCount"), false);
  });
});

console.log("localToplistStateRace.test: ok");
