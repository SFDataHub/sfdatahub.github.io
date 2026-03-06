export type LatestCommunityRecord = {
  id: string;
  title: string;
  playerName: string;
  className: string;
  server: string;
  value: string;
  timestamp: string;
  accentColor: string;
};

export const mockLatestCommunityRecords: LatestCommunityRecord[] = [
  {
    id: "cr-5",
    title: "Shadow Raid Marathon",
    playerName: "Krysal",
    className: "Battle Mage",
    server: "S1 EU",
    value: "526d",
    timestamp: "2026-03-05T22:30:00Z",
    accentColor: "#55C2FF",
  },
  {
    id: "cr-2",
    title: "Fortress Defense Chain",
    playerName: "Thornik",
    className: "Berserker",
    server: "S14 DE",
    value: "411d",
    timestamp: "2026-03-01T08:15:00Z",
    accentColor: "#72D6C7",
  },
  {
    id: "cr-4",
    title: "Underworld Progress Push",
    playerName: "Neritha",
    className: "Necromancer",
    server: "S9 INT",
    value: "368d",
    timestamp: "2026-03-04T10:05:00Z",
    accentColor: "#8CC5FF",
  },
  {
    id: "cr-1",
    title: "Guild Hydra Speed Clear",
    playerName: "Vexor",
    className: "Paladin",
    server: "S3 US",
    value: "332d",
    timestamp: "2026-02-27T19:45:00Z",
    accentColor: "#67B4FF",
  },
  {
    id: "cr-3",
    title: "Tower Streak Record",
    playerName: "Ilyan",
    className: "Demon Hunter",
    server: "S7 PL",
    value: "297d",
    timestamp: "2026-02-25T13:20:00Z",
    accentColor: "#7CB6FF",
  },
];
