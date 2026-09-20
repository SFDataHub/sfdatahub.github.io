import { cyclicFloors, type DungeonWorld } from "./types";

export const sandstormEnemyCycle = [
  501,
  507,
  508,
  515,
  516,
  517,
  518,
  519,
  526,
  528,
] as const;

export const sandstormWorld: DungeonWorld = {
  worldId: "sandstorm",
  title: "Sandsturm",
  titleKey: "dungeonLibrary.worlds.sandstorm",
  type: "single-longform",
  order: 7,
  source: "sf-tools",
  confidence: "confirmed",
  floorNavigation: { mode: "chapters", chapterSize: 100, pageSize: 20 },
  dungeons: [
    {
      dungeonId: 204,
      order: 1,
      floors: cyclicFloors(sandstormEnemyCycle, 1000),
    },
  ],
};
