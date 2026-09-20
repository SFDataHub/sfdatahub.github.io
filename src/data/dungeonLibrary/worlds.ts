import { classWorld } from "./classWorld";
import { continuousLoop } from "./continuousLoop";
import { fairyTower } from "./fairyTower";
import { lightWorld } from "./lightWorld";
import { sandstormWorld } from "./sandstormWorld";
import { shadowWorld } from "./shadowWorld";
import { twisterWorld } from "./twisterWorld";
import type { DungeonWorld } from "./types";

export const dungeonWorlds: DungeonWorld[] = [
  lightWorld,
  shadowWorld,
  classWorld,
  fairyTower,
  continuousLoop,
  twisterWorld,
  sandstormWorld,
].sort((a, b) => a.order - b.order);

export type { DungeonDefinition, DungeonFloor, DungeonFloorNavigation, DungeonWorld } from "./types";
