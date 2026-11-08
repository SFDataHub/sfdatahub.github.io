export const DAY = 86_400_000;
export const start = Date.UTC(2026, 5, 1, 12);
export const anchor = start + 65 * DAY;
export const player = (time: number, id = 1, server = "f8_net", xp: number | null = 1000, base: number | null = 100, rank = 12) => ({
  identifier: `${server}_p${id}`, prefix: server, timestamp: time, name: id === 1 ? "Hero" : "Peer", class: 1, level: 100,
  guildIdentifier: `${server}_g1`, guildName: "Fixture Guild", xpTotal: xp, baseMain: base, conBase: 100, rank,
  strengthBase: base, dexterityBase: 0, intelligenceBase: 30, constitutionBase: 100, luckBase: 20,
});
export const group = (time: number, server = "f8_net", count = 2) => ({ identifier: `${server}_g1`, prefix: server, timestamp: time, name: "Fixture Guild", rank: 5, memberCount: count });
export const inputs = [
  { id: "w06-old", rawData: { players: [player(start, 1, "f7_net", 0, 0, 40), player(start, 2, "f7_net", 600, 300, 50)], groups: [group(start, "f7_net")] } },
  { id: "w06-mid", rawData: { players: [player(start + 30 * DAY, 1, "f8_net", 900), player(start + 30 * DAY, 2, "f8_net", 3000)], groups: [group(start + 30 * DAY)] } },
  { id: "w06-tie-a", rawData: { players: [player(start + 30 * DAY, 1, "f8_net", 500), player(start + 30 * DAY, 2, "f8_net", 500)], groups: [group(start + 30 * DAY)] } },
  { id: "w06-current", rawData: { players: [player(anchor, 1, "f8_net", 800, 120, 10), player(anchor, 2, "f8_net", 2000, 400, 20), player(anchor + 20 * DAY, 1, "f8_net", 5000, 150, 3), player(anchor + 20 * DAY, 2)], groups: [group(anchor), group(anchor + 20 * DAY)] } },
  { id: "w06-partial", rawData: { players: [player(start + 20 * DAY, 1, "f8_net", null, null)], groups: [group(start + 20 * DAY, "f8_net", 3)] } },
  { id: "w06-missing-start", rawData: { players: [player(start + 10 * DAY, 2), player(start + 10 * DAY, 3)], groups: [group(start + 10 * DAY)] } },
  { id: "w06-foreign", rawData: { players: [player(anchor, 1, "f9_net", 999999)], groups: [group(anchor, "f9_net", 1)] } },
];

// Additional original-builder reference for complete Current cores: real zero,
// per-attribute missing member and the existing valid-member arithmetic mean.
function richPlayer(time: number, id: number) {
  const row = player(time, id, "s50_net", 1000 + id * 500, 120 + id * 10, id + 2);
  if (id === 3) return row;
  const save: Array<number | null> = Array.from({ length: 70 }, () => 0);
  save[1] = id; save[3] = 100; save[4] = 1000; save[7] = id + 2; save[20] = 1;
  save[30] = id === 1 ? 0 : 300; save[31] = id === 1 ? null : 50;
  save[32] = 30; save[33] = 100; save[34] = 20;
  return { ...row, saveVersion: 2, save };
}
export const richInputs = [start, anchor].map((time, i) => ({ id: `w06-rich-${i}`, rawData: { players: [1, 2, 3].map(id => richPlayer(time, id)), groups: [group(time, "s50_net", 3)] } }));
