import assert from "node:assert/strict";
import { formatScanDateTimeLabel, getScanAgeDays } from "../../src/lib/ui/formatScanDateTimeLabel.ts";

process.env.TZ = "Europe/Berlin";
const at = (date: string) => new Date(date).getTime();
const scan = at("2026-11-02T21:40:17.034+01:00");
assert.equal(formatScanDateTimeLabel(scan), "02/11/26 21:40");
for (const [now, days] of [
  ["2026-11-02T23:59:59+01:00", 0],
  ["2026-11-03T00:00:00+01:00", 1],
  ["2026-11-03T14:59:48+01:00", 1],
  ["2026-11-04T00:00:00+01:00", 2],
  ["2026-11-04T12:00:00+01:00", 2],
] as const) assert.equal(getScanAgeDays(scan, at(now)), days, now);

// Calendar boundaries, including both DST transitions, use display-local dates.
assert.equal(getScanAgeDays(at("2026-03-28T23:40:00+01:00"), at("2026-03-29T23:10:00+02:00")), 1);
assert.equal(getScanAgeDays(at("2026-10-24T23:40:00+02:00"), at("2026-10-26T00:10:00+01:00")), 2);
assert.equal(getScanAgeDays(at("2025-12-31T23:59:00+01:00"), at("2026-01-01T00:01:00+01:00")), 1);
for (const value of [scan, scan / 1000, String(scan), new Date(scan), "2026-11-02T20:40:17.034Z", { seconds: scan / 1000 }]) {
  assert.equal(getScanAgeDays(value, at("2026-11-04T12:00:00+01:00")), 2);
  assert.equal(formatScanDateTimeLabel(value), "02/11/26 21:40");
}
for (const value of [null, undefined, "", "invalid", NaN, Infinity, 0, -1, new Date(NaN)]) {
  assert.equal(getScanAgeDays(value), null);
}
assert.equal(getScanAgeDays(scan, NaN), null);
assert.equal(getScanAgeDays(scan, at("2026-11-01T12:00:00+01:00")), 0);
process.env.TZ = "America/New_York";
assert.equal(formatScanDateTimeLabel("2026-11-03T00:30:00Z"), "02/11/26 19:30");
assert.equal(getScanAgeDays("2026-11-03T00:30:00Z", at("2026-11-03T06:00:00Z")), 1);
console.log("PASS scan freshness: calendar days, exact observed time, local display timezone, DST, unknown and future values");
