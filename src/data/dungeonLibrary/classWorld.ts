export type DungeonLibraryFloor = {
  floor: number;
  enemyId: number;
};

export type DungeonLibraryDungeon = {
  dungeonId: number;
  floors: DungeonLibraryFloor[];
};

export type DungeonLibraryWorld = {
  worldId: string;
  title: string;
  dungeons: DungeonLibraryDungeon[];
};

const rangeFloors = (startEnemyId: number, count: number): DungeonLibraryFloor[] =>
  Array.from({ length: count }, (_, index) => ({
    floor: index + 1,
    enemyId: startEnemyId + index,
  }));

export const classWorld: DungeonLibraryWorld = {
  worldId: "class-world",
  title: "Klassenwelt",
  dungeons: [
    { dungeonId: 300, floors: rangeFloors(1260, 10) },
    { dungeonId: 301, floors: rangeFloors(1270, 10) },
    { dungeonId: 302, floors: rangeFloors(1280, 10) },
    { dungeonId: 303, floors: rangeFloors(1290, 10) },
    { dungeonId: 304, floors: rangeFloors(1420, 4) },
  ],
};
