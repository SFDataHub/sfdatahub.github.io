export type DungeonWorldType = "collection" | "shadow-collection" | "single-longform";

export type DungeonDataSource = "sf-tools" | "sfdatahub-curated" | "mixed";

export type DungeonDataConfidence = "confirmed" | "strongly-supported" | "curated";

export type DungeonFloorNavigation =
  | { mode: "paged"; pageSize: number }
  | { mode: "chapters"; chapterSize: number; pageSize: number };

export type DungeonFloor = {
  position: number;
  enemyId: number;
};

export type DungeonDefinition = {
  dungeonId: number;
  order: number;
  floors: DungeonFloor[];
  baseDungeonId?: number;
};

export type DungeonWorld = {
  worldId: string;
  title: string;
  titleKey: string;
  type: DungeonWorldType;
  order: number;
  source: DungeonDataSource;
  confidence: DungeonDataConfidence;
  floorNavigation?: DungeonFloorNavigation;
  dungeons: DungeonDefinition[];
};

export const rangeFloors = (startEnemyId: number, count: number): DungeonFloor[] =>
  Array.from({ length: count }, (_, index) => ({
    position: index + 1,
    enemyId: startEnemyId + index,
  }));

export const explicitFloors = (enemyIds: number[]): DungeonFloor[] =>
  enemyIds.map((enemyId, index) => ({
    position: index + 1,
    enemyId,
  }));

export const enemyIdsToFloors = (enemyIds: readonly number[]): DungeonFloor[] =>
  enemyIds.map((enemyId, index) => ({
    position: index + 1,
    enemyId,
  }));

export const cyclicFloors = (enemyIdCycle: readonly number[], count: number): DungeonFloor[] =>
  Array.from({ length: count }, (_, index) => ({
    position: index + 1,
    enemyId: enemyIdCycle[index % enemyIdCycle.length],
  }));
