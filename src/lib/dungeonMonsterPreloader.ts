import { getDungeonMonsterImage } from "../data/dungeonLibrary/dungeonLibraryAssets";

const DUNGEON_MONSTER_IMAGE_SIZE = 360;
const MAX_ACTIVE_PRELOADS = 4;

type PreloadPriority = "priority" | "background";

type QueueItem = {
  enemyId: number;
  url: string;
  resolve: () => void;
};

const preloadPromises = new Map<number, Promise<void>>();
const queuedItems = new Map<number, QueueItem>();
const priorityQueue: QueueItem[] = [];
const backgroundQueue: QueueItem[] = [];
let activePreloads = 0;

const normalizeEnemyId = (enemyId: number | string): number | null => {
  const value = typeof enemyId === "number" ? enemyId : Number(String(enemyId).trim());
  return Number.isInteger(value) ? value : null;
};

const runNext = () => {
  if (activePreloads >= MAX_ACTIVE_PRELOADS) return;

  const item = priorityQueue.shift() ?? backgroundQueue.shift();
  if (!item) return;
  queuedItems.delete(item.enemyId);

  activePreloads += 1;
  const image = new Image();

  const finish = () => {
    image.onload = null;
    image.onerror = null;
    activePreloads = Math.max(0, activePreloads - 1);
    item.resolve();
    runNext();
  };

  image.onload = finish;
  image.onerror = finish;
  image.src = item.url;
};

export function preloadDungeonMonster(
  enemyId: number | string,
  priority: PreloadPriority = "background"
): Promise<void> {
  if (typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve();
  }

  const normalizedEnemyId = normalizeEnemyId(enemyId);
  if (normalizedEnemyId == null) return Promise.resolve();

  const existing = preloadPromises.get(normalizedEnemyId);
  if (existing) {
    if (priority === "priority") {
      const queuedItem = queuedItems.get(normalizedEnemyId);
      const backgroundIndex = queuedItem ? backgroundQueue.indexOf(queuedItem) : -1;
      if (queuedItem && backgroundIndex >= 0) {
        backgroundQueue.splice(backgroundIndex, 1);
        priorityQueue.push(queuedItem);
        runNext();
      }
    }
    return existing;
  }

  const url = getDungeonMonsterImage(normalizedEnemyId, DUNGEON_MONSTER_IMAGE_SIZE);
  if (!url) return Promise.resolve();

  const promise = new Promise<void>((resolve) => {
    const item = { enemyId: normalizedEnemyId, url, resolve };
    if (priority === "priority") {
      priorityQueue.push(item);
    } else {
      backgroundQueue.push(item);
    }
    queuedItems.set(normalizedEnemyId, item);
    runNext();
  });

  preloadPromises.set(normalizedEnemyId, promise);
  return promise;
}

export function preloadDungeonMonsters(
  enemyIds: Array<number | string>,
  priority: PreloadPriority = "background"
): Promise<void> {
  const uniqueEnemyIds = Array.from(
    new Set(
      enemyIds
        .map(normalizeEnemyId)
        .filter((enemyId): enemyId is number => enemyId != null)
    )
  );

  return Promise.all(uniqueEnemyIds.map((enemyId) => preloadDungeonMonster(enemyId, priority))).then(
    () => undefined
  );
}
