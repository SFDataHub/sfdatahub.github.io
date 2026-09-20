import { rangeFloors, type DungeonWorld } from "./types";

export const fairyTower: DungeonWorld = {
  worldId: "fairy-tower",
  title: "Märchenturm",
  titleKey: "dungeonLibrary.worlds.fairyTower",
  type: "single-longform",
  order: 4,
  source: "sf-tools",
  confidence: "confirmed",
  dungeons: [
    {
      dungeonId: 201,
      order: 1,
      floors: rangeFloors(400, 100),
    },
  ],
};
