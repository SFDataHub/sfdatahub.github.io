import { buildPrimaryAttributeRadar, primaryRadarFraction, type PrimaryRadarBasis } from "../../../../src/lib/local-player-profile/primaryAttributeRadar";
import { buildPlayerIdentityResolutionIndex, buildGuildIdentityResolutionIndex } from "../../../../src/lib/identities/identityResolution";
import type { ProfileHistoryMember } from "../../../../src/lib/local-player-profile/profileSumHistory";
import type { LocalPlayerProfileModel } from "../../../../src/components/local-player-profile/types";

/** Supplementary edge cases; original-data rendering is checked separately. */
export function verifyFixedBuildingRadar() {
  const assert = (ok: unknown, message: string) => { if (!ok) throw Error(message); };
  const at = Date.parse("2026-09-05T09:00:00Z"), latest = at + 40 * 86400000;
  const member = (id: number, source: string, timestamp: number, value: number, mine: number | null, treasury: number | null) => ({
    id: `${source}-${id}`, memberRef: `s5_eu_p${id}`, server: "EU5", classId: "Scout", sourceScanId: source,
    sourceGeneration: "generation", snapshotId: `${source}::${timestamp}`, snapshotTimestamp: timestamp,
    sourceScanFilename: source + ".json", guildIdentifier: "s5_eu_g1", level: value, mine, treasury,
    baseMain: value, conBase: 0, attrTotal: 2 * value, conTotal: 0, focusedBaseStats: value, focusedTotalStats: 2 * value,
    profileSums: { "main-con": { base: value, total: 2 * value } },
  } as ProfileHistoryMember);
  const monthly = [member(1, "monthly", at, 100, null, null), member(2, "monthly", at, 300, null, null)];
  const local = [member(1, "user", latest, 200, 68, 45), member(2, "user", latest, 200, 50, 25)];
  const sources = ["monthly", "user"].map(sourceScanId => ({ sourceScanId, sourceGeneration: "generation", contentHash: "hash",
    snapshotTimestamps: [sourceScanId === "monthly" ? at : latest] }));
  const basis: PrimaryRadarBasis = {
    identity: { players: buildPlayerIdentityResolutionIndex([]), guilds: buildGuildIdentityResolutionIndex([]) }, sources: sources.slice(0, 1),
    local: { sources, data: { snapshots: [], members: [...monthly, ...local], guilds: [{ id: "guild", sourceScanId: "user",
      sourceScanFilename: "user.json", sourceGeneration: "generation", snapshotId: `user::${latest}`, snapshotTimestamp: latest,
      guildIdentifier: "s5_eu_g1", guildName: "Guild", server: "EU5", guildSegment: "1", memberCount: 2, declaredMemberCount: 2,
      averageLevel: null, averageBaseStats: null, averageTotalStats: null }] } },
  };
  const profile = { sourceScanId: "user", sourcePlayerKey: "s5_eu_p1", analytics: { server: "EU5", memberRef: "s5_eu_p1" } } as LocalPlayerProfileModel;
  const modes = ["main", "class", "guild", "server"] as const;
  const models = modes.map(mode => buildPrimaryAttributeRadar(monthly, profile, "2026-09", "main-con", basis, mode)!);
  models.forEach((model, index) => {
    assert(JSON.stringify(model.axes.map(axis => axis.maximum)) === "[300,600,300,100,45]", "Fixed buildings and monthly stats in " + modes[index]);
    assert(primaryRadarFraction(model.axes[3].player, model.axes[3].maximum) === 0.68, "Mine 68/100");
    assert(primaryRadarFraction(model.axes[4].player, model.axes[4].maximum) === 1, "Treasury 45/45");
    if (modes[index] !== "guild") assert(model.axes.slice(3).every(axis => axis.average === null && axis.count === 0), "Missing averages stay null/n=0");
    else assert(model.axes[3].average === 59 && model.axes[4].average === 35 && model.axes[3].count === 2, "Valid guild averages use the same fixed scale");
  });
  local[0].mine = null;
  assert(buildPrimaryAttributeRadar(monthly, profile, "2026-09", "main-con", basis)!.axes[3].player === null, "Missing player remains missing");
  local[0].mine = 0;
  assert(primaryRadarFraction(buildPrimaryAttributeRadar(monthly, profile, "2026-09", "main-con", basis)!.axes[3].player, 100) === 0, "Valid player zero retained");
  local[0].mine = 120; local[0].treasury = 60;
  monthly[0].mine = 999; monthly[0].treasury = 999;
  const overflow = buildPrimaryAttributeRadar(monthly, profile, "2026-09", "main-con", basis)!;
  assert(overflow.axes[3].player === 120 && overflow.axes[4].player === 60, "Actual overflow values retained");
  assert(overflow.axes[3].maximum === 100 && overflow.axes[4].maximum === 45, "Observations never enlarge building maxima");
  assert(overflow.axes.slice(3).every(axis => primaryRadarFraction(axis.player, axis.maximum) === 1), "Overflow clipped only graphically");
  return { modes: [...modes], missing: true, zero: true, overflow };
}
