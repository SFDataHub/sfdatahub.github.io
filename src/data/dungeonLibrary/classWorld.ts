import { rangeFloors, type DungeonWorld } from "./types";

export const classWorld: DungeonWorld = {
  worldId: "class-world",
  title: "Klassenwelt",
  titleKey: "dungeonLibrary.worlds.classWorld",
  type: "collection",
  order: 3,
  source: "mixed",
  confidence: "curated",
  dungeons: [
    { dungeonId: 300, order: 1, floors: rangeFloors(1260, 10) },
    { dungeonId: 301, order: 2, floors: rangeFloors(1270, 10) },
    { dungeonId: 302, order: 3, floors: rangeFloors(1280, 10) },
    { dungeonId: 303, order: 4, floors: rangeFloors(1290, 10) },
    { dungeonId: 304, order: 5, floors: rangeFloors(1420, 4) },
  ],
};
