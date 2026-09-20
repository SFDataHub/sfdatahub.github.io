import { rangeFloors, type DungeonWorld } from "./types";

export const continuousLoop: DungeonWorld = {
  worldId: "continuous-loop",
  title: "Dauerschleife der Idole",
  titleKey: "dungeonLibrary.worlds.continuousLoop",
  type: "single-longform",
  order: 5,
  source: "sf-tools",
  confidence: "confirmed",
  dungeons: [
    {
      dungeonId: 202,
      order: 1,
      floors: rangeFloors(1320, 30),
    },
  ],
};
