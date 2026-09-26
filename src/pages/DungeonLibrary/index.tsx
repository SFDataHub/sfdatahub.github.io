import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import ContentShell from "../../components/ContentShell";
import FlipbookCurlViewer from "../../components/Flipbook/FlipbookCurlViewer";
import AttributeStatBar, {
  ATTRIBUTE_STAT_ROWS,
  toStatFillPercent,
} from "../../components/shared/AttributeStatBar";
import { getPlayerStatAccentColor } from "../../components/player-profile/statAccents";
import { getClassMetaById } from "../../data/classes";
import { getDungeonMonsterImage } from "../../data/dungeonLibrary/dungeonLibraryAssets";
import { getLocalizedDungeonFloorName, getLocalizedDungeonName } from "../../data/dungeonLibrary/dungeonNames";
import { getDungeonFloorStats, type DungeonFloorStats } from "../../data/dungeonLibrary/dungeonStats";
import { dungeonWorlds, type DungeonDefinition, type DungeonFloor, type DungeonWorld } from "../../data/dungeonLibrary/worlds";
import { preloadDungeonMonster, preloadDungeonMonsters } from "../../lib/dungeonMonsterPreloader";
import { toDriveThumbProxy } from "../../lib/urls";
import "./DungeonLibrary.css";

type PageFlipLike = {
  turnToPage: (index: number, corner?: string) => void;
  flipNext: (corner?: string) => void;
  getCurrentPageIndex?: () => number;
  getOrientation?: () => "portrait" | "landscape";
};

type OpeningRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
};

type BookGeometry = {
  pageWidth: number;
  pageHeight: number;
  openWidth: number;
  scale: number;
  stageLeft: number;
  stageTop: number;
  spineX: number;
  centerX: number;
  centerY: number;
  isMobile: boolean;
};

type ReaderBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type WorldIndexSection = {
  dungeon: DungeonDefinition;
  floors: DungeonFloor[];
};

type PagePlan =
  | { kind: "worldIndex"; indexPage: number; indexPageCount: number; sections: WorldIndexSection[] }
  | { kind: "rangeOverview"; overviewIndex: number; overviewCount: number; ranges: FloorRange[] }
  | { kind: "floorSelector"; dungeon: DungeonDefinition; range: FloorRange; floors: DungeonFloor[]; selectorIndex: number; selectorCount: number }
  | { kind: "floor"; dungeon: DungeonDefinition; floor: DungeonFloor }
  | { kind: "dynamicFloorDetail"; dungeon: DungeonDefinition };

type FloorRange = {
  index: number;
  start: number;
  end: number;
  floors: DungeonFloor[];
};

type SelectedLongformFloor = {
  dungeon: DungeonDefinition;
  floor: DungeonFloor;
  backPage: number;
};

type ZoomedEnemy = {
  enemyId: number;
  name?: string;
} | null;

type EnemyDetailProps = {
  dungeon: DungeonDefinition;
  floor: DungeonFloor;
  dungeonName: string;
  monsterName: string;
  onOpenMonsterImage: (enemy: NonNullable<ZoomedEnemy>) => void;
};

const COVER_PAGE_COUNT = 2;
const OPENING_FRONTMATTER_PAGE_COUNT = 5;
const CONTENT_PAGE_OFFSET = COVER_PAGE_COUNT + OPENING_FRONTMATTER_PAGE_COUNT;
const OPENING_FRONTMATTER_PAGES = Array.from({ length: OPENING_FRONTMATTER_PAGE_COUNT }, (_, index) => index);
const DUNGEONS_PER_OVERVIEW_PAGE = 6;
const FLOORS_PER_OVERVIEW_PAGE = 20;
const WORLD_INDEX_DUNGEONS_PER_PAGE = 3;
const WORLD_INDEX_LONGFORM_FLOORS_PER_PAGE = 25;
const OPENING_FLIP_START_DELAY = 900;
const OPENING_FLIP_INTERVAL = 760;
const OPENING_DURATION_MS = 4200;
const OPENING_FLIPPING_TIME = 560;
const PAGE_ASPECT = 1200 / 900;
const DESKTOP_BOOK_BREAKPOINT = 1024;
const DUNGEON_DESKTOP_PAGE_WIDTH = 660;
const DUNGEON_DESKTOP_PAGE_HEIGHT = 880;
const DUNGEON_DESKTOP_OPEN_WIDTH = DUNGEON_DESKTOP_PAGE_WIDTH * 2;
const DUNGEON_DESKTOP_MAX_SCALE = 1.16;
const READER_SIDE_SAFE_PX = 0;
const READER_TOP_SAFE_PX = 4;
const READER_BOTTOM_SAFE_PX = 8;
const BOOK_VISUAL_LEFT_RESERVE_PX = 8;
const BOOK_VISUAL_RIGHT_RESERVE_PX = 52;
const BOOK_VISUAL_TOP_RESERVE_PX = 0;
const BOOK_HUD_RESERVE_PX = 58;
const READER_TOP_CSS_LENGTH = "var(--app-overlay-top, var(--topbar-h, 0px))";
const MONSTER_ZOOM_IMAGE_SIZE = 960;
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

const stopFlipGesture = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const balancedChunks = <T,>(items: T[], maxSize: number, preferEvenCount = false): T[][] => {
  if (items.length === 0) return [];
  const safeMaxSize = Math.max(1, maxSize);
  let chunkCount = Math.ceil(items.length / safeMaxSize);
  if (preferEvenCount && chunkCount % 2 === 1 && chunkCount < items.length) {
    chunkCount += 1;
  }

  const chunks: T[][] = [];
  let start = 0;
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const remainingItems = items.length - start;
    const remainingChunks = chunkCount - chunkIndex;
    const size = Math.min(safeMaxSize, Math.ceil(remainingItems / remainingChunks));
    chunks.push(items.slice(start, start + size));
    start += size;
  }

  return chunks.filter((group) => group.length > 0);
};

const buildFloorRanges = (floors: DungeonFloor[], chapterSize: number): FloorRange[] =>
  chunk(floors, chapterSize).map((rangeFloors, index) => ({
    index,
    start: rangeFloors[0]?.position ?? 0,
    end: rangeFloors[rangeFloors.length - 1]?.position ?? 0,
    floors: rangeFloors,
  }));

const getFloorPageKey = (dungeon: DungeonDefinition, floor: DungeonFloor) =>
  `${dungeon.dungeonId}:${floor.position}`;

const getFloorEnemyIds = (floors: DungeonFloor[]) =>
  Array.from(new Set(floors.map((floor) => floor.enemyId)));

const getOpeningPreloadEnemyIds = (world: DungeonWorld) => {
  const [dungeon] = world.dungeons;
  if (!dungeon) return [];

  const limit = world.type === "single-longform"
    ? Math.min(10, world.floorNavigation?.mode === "chapters" ? world.floorNavigation.pageSize : 10)
    : 10;

  return getFloorEnemyIds(dungeon.floors.slice(0, limit));
};

const formatDungeonNumber = (value: number, locale?: string) =>
  new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 0 }).format(value);

const getDungeonDisplayName = (
  dungeon: DungeonDefinition,
  locale: string | null | undefined,
  fallback: (dungeonId: number) => string
) => getLocalizedDungeonName(dungeon.dungeonId, locale) ?? fallback(dungeon.dungeonId);

const getMonsterDisplayName = (
  dungeon: DungeonDefinition,
  floor: DungeonFloor,
  locale: string | null | undefined,
  fallback: (enemyId: number) => string
) => getLocalizedDungeonFloorName(dungeon.dungeonId, floor.position, locale) ?? fallback(floor.enemyId);

const formatDungeonCompactNumber = (value: number, locale?: string) =>
  new Intl.NumberFormat(locale, {
    notation: "compact",
    compactDisplay: "long",
    maximumFractionDigits: value >= 1_000_000_000 ? 2 : 0,
  }).format(value);

const areBookGeometriesEqual = (a: BookGeometry | null, b: BookGeometry) =>
  Boolean(a) &&
  Math.abs(a!.pageWidth - b.pageWidth) < 0.5 &&
  Math.abs(a!.pageHeight - b.pageHeight) < 0.5 &&
  Math.abs(a!.openWidth - b.openWidth) < 0.5 &&
  Math.abs(a!.scale - b.scale) < 0.005 &&
  Math.abs(a!.stageLeft - b.stageLeft) < 0.5 &&
  Math.abs(a!.stageTop - b.stageTop) < 0.5 &&
  Math.abs(a!.spineX - b.spineX) < 0.5 &&
  Math.abs(a!.centerX - b.centerX) < 0.5 &&
  Math.abs(a!.centerY - b.centerY) < 0.5 &&
  a!.isMobile === b.isMobile;

const measureCssLengthPx = (cssLength: string): number => {
  if (typeof document === "undefined") return 0;

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.height = cssLength;
  probe.style.width = "0";
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();

  return Number.isFinite(height) ? height : 0;
};

const getReaderTop = () => Math.max(0, measureCssLengthPx(READER_TOP_CSS_LENGTH));

const getViewportReaderBounds = (left = 0, width = window.innerWidth): ReaderBounds => {
  const top = getReaderTop();

  return {
    left,
    top,
    width,
    height: Math.max(0, window.innerHeight - top),
  };
};

const getBookGeometry = (readerBounds: ReaderBounds = getViewportReaderBounds()): BookGeometry => {
  const isMobile = window.innerWidth < 760;
  const isDesktopBook = window.innerWidth >= DESKTOP_BOOK_BREAKPOINT;
  const horizontalSafe = isMobile ? 14 : READER_SIDE_SAFE_PX;
  const visualLeftReserve = isMobile ? 0 : BOOK_VISUAL_LEFT_RESERVE_PX;
  const visualRightReserve = isMobile ? 0 : BOOK_VISUAL_RIGHT_RESERVE_PX;
  const visualTopReserve = isMobile ? 0 : BOOK_VISUAL_TOP_RESERVE_PX;
  const hudReserve = BOOK_HUD_RESERVE_PX;
  const readerCenterX = readerBounds.left + readerBounds.width / 2;
  const readerTop = Math.max(0, readerBounds.top);
  const readerBottom = Math.min(window.innerHeight, readerTop + readerBounds.height);
  const readerHeight = Math.max(320, readerBottom - readerTop);
  const centerY = readerTop + readerHeight / 2;
  const availableWidth = Math.max(280, readerBounds.width - horizontalSafe * 2);
  const availableHeight = Math.max(
    280,
    readerHeight - READER_TOP_SAFE_PX - READER_BOTTOM_SAFE_PX - hudReserve - visualTopReserve
  );
  if (isDesktopBook) {
    const logicalVisualWidth = DUNGEON_DESKTOP_OPEN_WIDTH + visualLeftReserve + visualRightReserve;
    const scale = Math.min(
      DUNGEON_DESKTOP_MAX_SCALE,
      availableWidth / logicalVisualWidth,
      availableHeight / DUNGEON_DESKTOP_PAGE_HEIGHT
    );
    const scaledVisualWidth = logicalVisualWidth * scale;
    const scaledPageHeight = DUNGEON_DESKTOP_PAGE_HEIGHT * scale;
    const visualLeft = readerBounds.left + horizontalSafe + Math.max(0, (availableWidth - scaledVisualWidth) / 2);
    const stageVisualLeft = visualLeft + visualLeftReserve * scale;
    const stageLeft = stageVisualLeft - (DUNGEON_DESKTOP_OPEN_WIDTH * (1 - scale)) / 2;
    const stageTop = readerTop + READER_TOP_SAFE_PX + visualTopReserve + Math.max(0, (availableHeight - scaledPageHeight) / 2);
    const centerX = stageLeft + DUNGEON_DESKTOP_OPEN_WIDTH / 2;
    const centerY = stageTop + scaledPageHeight / 2;
    const spineX = centerX;

    return {
      pageWidth: DUNGEON_DESKTOP_PAGE_WIDTH,
      pageHeight: DUNGEON_DESKTOP_PAGE_HEIGHT,
      openWidth: DUNGEON_DESKTOP_OPEN_WIDTH,
      scale,
      stageLeft,
      stageTop,
      spineX,
      centerX,
      centerY,
      isMobile,
    };
  }

  const openWidthLimit = isMobile
    ? availableWidth
    : Math.min(Math.max(280, availableWidth - visualLeftReserve - visualRightReserve), 1180);
  const pageWidthFromHeight = availableHeight / PAGE_ASPECT;
  const pageWidthFromWidth = isMobile ? openWidthLimit : openWidthLimit / 2;
  const pageWidth = Math.min(pageWidthFromWidth, pageWidthFromHeight, isMobile ? 360 : 595);
  const pageHeight = pageWidth * PAGE_ASPECT;
  const openWidth = isMobile ? pageWidth : pageWidth * 2;
  const visualWidth = openWidth + visualLeftReserve + visualRightReserve;
  const visualLeft = readerBounds.left + horizontalSafe + Math.max(0, (availableWidth - visualWidth) / 2);
  const stageLeft = isMobile
    ? readerCenterX - pageWidth / 2
    : visualLeft + visualLeftReserve;
  const centerX = isMobile ? readerCenterX : stageLeft + openWidth / 2;
  const spineX = isMobile ? centerX - pageWidth / 2 : centerX;
  const stageTop = readerTop + READER_TOP_SAFE_PX + visualTopReserve + Math.max(0, (availableHeight - pageHeight) / 2);

  return { pageWidth, pageHeight, openWidth, scale: 1, stageLeft, stageTop, spineX, centerX, centerY, isMobile };
};

function EnemyClassBadge({ stats }: { stats?: DungeonFloorStats }) {
  const { t } = useTranslation();
  if (!stats) return null;

  const classMeta = getClassMetaById(stats.class);
  const iconUrl = classMeta?.iconUrl ? toDriveThumbProxy(classMeta.iconUrl, 40) : undefined;
  const label = classMeta
    ? t(`dungeonLibrary.classes.${classMeta.key}`, { defaultValue: classMeta.label })
    : t("dungeonLibrary.detail.unknownClass");

  return (
    <span className="enemy-detail-class-badge" aria-label={label} title={label}>
      {iconUrl ? (
        <img className="enemy-detail-class-icon" src={iconUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="enemy-detail-class-fallback" aria-hidden>
          {classMeta?.fallback ?? "?"}
        </span>
      )}
    </span>
  );
}

function EnemyArtwork({
  enemyId,
  monsterName,
  stats,
  onOpenMonsterImage,
}: {
  enemyId: number;
  monsterName: string;
  stats?: DungeonFloorStats;
  onOpenMonsterImage: (enemy: NonNullable<ZoomedEnemy>) => void;
}) {
  const { t, i18n } = useTranslation();
  const imageUrl = getDungeonMonsterImage(enemyId, 360);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    imageUrl ? "loading" : "error"
  );

  useEffect(() => {
    setStatus(imageUrl ? "loading" : "error");
  }, [imageUrl]);

  return (
    <figure
      className="enemy-detail-art"
      aria-label={t("dungeonLibrary.detail.monsterArtworkAria", { enemyId })}
    >
      {status === "loading" && (
        <div className="enemy-detail-image-placeholder" aria-hidden>
          {t("dungeonLibrary.detail.loadingArtwork")}
        </div>
      )}
      {status === "error" && (
        <div
          className="enemy-detail-image-placeholder"
          role="img"
          aria-label={t("dungeonLibrary.detail.noArtworkAria", { enemyId })}
        >
          {t("dungeonLibrary.detail.artworkUnavailable")}
        </div>
      )}
      {imageUrl && status !== "error" && (
        <button
          className="enemy-detail-image-button"
          type="button"
          data-flip-interactive
          aria-label={t("dungeonLibrary.detail.openMonsterImage")}
          onPointerDown={stopFlipGesture}
          onMouseDown={stopFlipGesture}
          onTouchStart={stopFlipGesture}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenMonsterImage({ enemyId, name: monsterName });
          }}
        >
          <img
            key={`${enemyId}-${imageUrl}`}
            className="enemy-detail-image"
            src={imageUrl}
            alt={t("dungeonLibrary.detail.monsterImageAlt", { enemyId })}
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
          />
        </button>
      )}
      {stats && (
        <figcaption className="enemy-detail-art-meta">
          <span className="enemy-detail-level">
            {t("dungeonLibrary.detail.levelShort", { level: formatDungeonNumber(stats.level, i18n.language) })}
          </span>
          <EnemyClassBadge stats={stats} />
        </figcaption>
      )}
    </figure>
  );
}

function MonsterImageZoomOverlay({
  enemy,
  onClose,
}: {
  enemy: NonNullable<ZoomedEnemy>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const imageUrl = getDungeonMonsterImage(enemy.enemyId, MONSTER_ZOOM_IMAGE_SIZE);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    imageUrl ? "loading" : "error"
  );

  useEffect(() => {
    setStatus(imageUrl ? "loading" : "error");
  }, [imageUrl]);

  const imageLabel = enemy.name || t("dungeonLibrary.detail.monsterImageAlt", { enemyId: enemy.enemyId });

  return (
    <div
      className="monster-image-zoom-overlay"
      data-flip-interactive
      role="presentation"
      onClick={onClose}
      onPointerDown={stopFlipGesture}
      onMouseDown={stopFlipGesture}
      onTouchStart={stopFlipGesture}
    >
      <div
        className="monster-image-zoom-frame"
        data-flip-interactive
        role="dialog"
        aria-modal="true"
        aria-label={imageLabel}
        onClick={stopFlipGesture}
      >
        <button
          className="monster-image-zoom-close"
          type="button"
          aria-label={t("dungeonLibrary.detail.closeMonsterImage")}
          onClick={(event) => {
            stopFlipGesture(event);
            onClose();
          }}
        >
          ×
        </button>
        {status === "loading" && (
          <div className="monster-image-zoom-status" role="status">
            {t("dungeonLibrary.detail.loadingMonsterImage")}
          </div>
        )}
        {status === "error" && (
          <div className="monster-image-zoom-status" role="status">
            {t("dungeonLibrary.detail.monsterImageUnavailable")}
          </div>
        )}
        {imageUrl && status !== "error" && (
          <img
            key={`${enemy.enemyId}-${imageUrl}`}
            className="monster-image-zoom-image"
            src={imageUrl}
            alt={imageLabel}
            decoding="async"
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
          />
        )}
      </div>
    </div>
  );
}

function EnemyStatsPanel({ stats }: { stats?: DungeonFloorStats }) {
  const { t, i18n } = useTranslation();

  if (!stats) {
    return (
      <div className="enemy-detail-stats enemy-detail-stats-empty" role="status">
        {t("dungeonLibrary.detail.statsUnavailable")}
      </div>
    );
  }

  const maxAttribute = Math.max(...ATTRIBUTE_STAT_ROWS.map((row) => stats[row.key]), 0);

  return (
    <div className="enemy-detail-stats" aria-label={t("dungeonLibrary.detail.enemyStatsAria")}>
      {ATTRIBUTE_STAT_ROWS.map((row) => (
        <AttributeStatBar
          key={row.key}
          statKey={row.key}
          label={row.label}
          iconAlt={t("dungeonLibrary.detail.statIconAlt", { stat: row.label })}
          value={stats[row.key]}
          displayValue={formatDungeonNumber(stats[row.key], i18n.language)}
          fillRatio={toStatFillPercent(stats[row.key], maxAttribute) / 100}
          variant="book"
          accentColor={getPlayerStatAccentColor(row.key)}
          classNamePrefix="dungeon-attribute-bar"
        />
      ))}
      <dl className="enemy-detail-damage" aria-label={t("dungeonLibrary.detail.enemyDamageAria")}>
        <div className="enemy-detail-damage-row">
          <dt>{t("dungeonLibrary.detail.minDamage")}</dt>
          <dd>{formatDungeonNumber(stats.min, i18n.language)}</dd>
        </div>
        <div className="enemy-detail-damage-row">
          <dt>{t("dungeonLibrary.detail.maxDamage")}</dt>
          <dd>{formatDungeonNumber(stats.max, i18n.language)}</dd>
        </div>
      </dl>
    </div>
  );
}

function EnemyHealthBar({ stats, locale }: { stats?: DungeonFloorStats; locale?: string }) {
  const { t } = useTranslation();

  if (!stats) {
    return (
      <div className="enemy-detail-hp enemy-detail-hp-empty" role="status">
        {t("dungeonLibrary.detail.hpUnavailable")}
      </div>
    );
  }

  return (
    <div
      className="enemy-detail-hp"
      aria-label={t("dungeonLibrary.detail.hpAria", { value: formatDungeonNumber(stats.health, locale) })}
    >
      <div className="enemy-detail-hp-label">
        {t("dungeonLibrary.detail.hpValue", {
          value: formatDungeonCompactNumber(stats.health, locale),
        })}
      </div>
      <div className="enemy-detail-hp-track" role="presentation">
        <span className="enemy-detail-hp-fill" aria-hidden />
      </div>
    </div>
  );
}

function EnemyDetail({ dungeon, floor, dungeonName, monsterName, onOpenMonsterImage }: EnemyDetailProps) {
  const { t, i18n } = useTranslation();
  const stats = getDungeonFloorStats(dungeon.dungeonId, floor.position);
  const lore = stats?.lore?.trim() || t("dungeonLibrary.detail.loreUnavailable");

  return (
    <div className="enemy-detail">
      <div className="enemy-detail-heading">
        <div className="enemy-detail-title-group">
          <h1>{dungeonName}</h1>
          <p className="enemy-detail-monster-name">{monsterName}</p>
        </div>
        <span className="enemy-detail-floor">
          {t("dungeonLibrary.detail.floorCounter", {
            current: floor.position,
            total: dungeon.floors.length,
          })}
        </span>
      </div>
      <div className="enemy-detail-reference">
        <div className="enemy-detail-media">
          <EnemyArtwork
            enemyId={floor.enemyId}
            monsterName={monsterName}
            stats={stats}
            onOpenMonsterImage={onOpenMonsterImage}
          />
          <EnemyHealthBar stats={stats} locale={i18n.language} />
        </div>
        <EnemyStatsPanel stats={stats} />
      </div>
      <section className="enemy-detail-lore" aria-labelledby={`enemy-lore-${dungeon.dungeonId}-${floor.position}`}>
        <h2 id={`enemy-lore-${dungeon.dungeonId}-${floor.position}`}>{t("dungeonLibrary.detail.lore")}</h2>
        <p>{lore}</p>
      </section>
      <strong className="enemy-detail-id">
        {t("dungeonLibrary.detail.enemyId", { enemyId: floor.enemyId })}
      </strong>
    </div>
  );
}

export default function DungeonLibraryPage() {
  const { t, i18n } = useTranslation();
  const pfRef = useRef<PageFlipLike | null>(null);
  const openingTimersRef = useRef<number[]>([]);
  const libraryRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"library" | "opening" | "reading">("library");
  const [selectedWorld, setSelectedWorld] = useState<DungeonWorld | null>(null);
  const [selectedLongformFloor, setSelectedLongformFloor] = useState<SelectedLongformFloor | null>(null);
  const [centered, setCentered] = useState(false);
  const [openingRect, setOpeningRect] = useState<OpeningRect | null>(null);
  const [bookGeometry, setBookGeometry] = useState<BookGeometry | null>(null);
  const [coverCentered, setCoverCentered] = useState(false);
  const [openRun, setOpenRun] = useState(0);
  const [currentContentPage, setCurrentContentPage] = useState(0);
  const [zoomedEnemy, setZoomedEnemy] = useState<ZoomedEnemy>(null);

  const getWorldTitle = useCallback((world: DungeonWorld) =>
    t(world.titleKey, { defaultValue: world.title }), [t]);
  const getLocalizedBookSubtitle = useCallback((world: DungeonWorld) =>
    world.type === "single-longform"
      ? t("dungeonLibrary.book.floorCount", { count: world.dungeons[0]?.floors.length ?? 0 })
      : t("dungeonLibrary.book.dungeonCount", { count: world.dungeons.length }), [t]);
  const openMonsterImage = useCallback((enemy: NonNullable<ZoomedEnemy>) => {
    setZoomedEnemy(enemy);
  }, []);
  const closeMonsterImage = useCallback(() => {
    setZoomedEnemy(null);
  }, []);

  const clearOpeningTimers = useCallback(() => {
    openingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    openingTimersRef.current = [];
  }, []);

  useEffect(() => clearOpeningTimers, [clearOpeningTimers]);

  const getReaderBounds = useCallback((): ReaderBounds => {
    const rect = libraryRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return getViewportReaderBounds();
    return getViewportReaderBounds(rect.left, rect.width);
  }, []);

  const pagePlan = useMemo(() => {
    const pages: PagePlan[] = [];
    const floorPageByKey: Record<string, number> = {};
    const floorSelectorPageByKey: Record<string, number> = {};
    const worldIndexPageByDungeonId: Record<number, number> = {};
    const worldIndexPageByFloorKey: Record<string, number> = {};
    let dynamicFloorDetailPage: number | null = null;

    if (!selectedWorld) {
      return {
        pages,
        floorPageByKey,
        floorSelectorPageByKey,
        worldIndexPageByDungeonId,
        worldIndexPageByFloorKey,
        dynamicFloorDetailPage,
        worldIndexPage: 0,
      };
    }

    if (selectedWorld.type === "single-longform") {
      const [dungeon] = selectedWorld.dungeons;
      if (!dungeon) {
        return {
          pages,
          floorPageByKey,
          floorSelectorPageByKey,
          worldIndexPageByDungeonId,
          worldIndexPageByFloorKey,
          dynamicFloorDetailPage,
          worldIndexPage: 0,
        };
      }

      if (selectedWorld.floorNavigation?.mode === "chapters") {
        const { chapterSize, pageSize } = selectedWorld.floorNavigation;
        const ranges = buildFloorRanges(dungeon.floors, chapterSize);
        const rangeChunks = chunk(ranges, DUNGEONS_PER_OVERVIEW_PAGE);

        rangeChunks.forEach((rangeGroup, index) => {
          pages.push({
            kind: "rangeOverview",
            overviewIndex: index,
            overviewCount: rangeChunks.length,
            ranges: rangeGroup,
          });
        });

        ranges.forEach((range) => {
          const selectorChunks = chunk(range.floors, pageSize);
          selectorChunks.forEach((floors, index) => {
            const selectorPage = pages.length;
            floors.forEach((floor) => {
              floorSelectorPageByKey[getFloorPageKey(dungeon, floor)] = selectorPage;
            });
            pages.push({
              kind: "floorSelector",
              dungeon,
              range,
              floors,
              selectorIndex: index,
              selectorCount: selectorChunks.length,
            });
          });
        });

        dynamicFloorDetailPage = pages.length;
        pages.push({ kind: "dynamicFloorDetail", dungeon });

        return {
          pages,
          floorPageByKey,
          floorSelectorPageByKey,
          worldIndexPageByDungeonId,
          worldIndexPageByFloorKey,
          dynamicFloorDetailPage,
          worldIndexPage: 0,
        };
      }

      const floorChunks = balancedChunks(dungeon.floors, WORLD_INDEX_LONGFORM_FLOORS_PER_PAGE, true);
      floorChunks.forEach((floors, index) => {
        const indexPage = pages.length;
        worldIndexPageByDungeonId[dungeon.dungeonId] ??= indexPage;
        floors.forEach((floor) => {
          worldIndexPageByFloorKey[getFloorPageKey(dungeon, floor)] = indexPage;
        });
        pages.push({
          kind: "worldIndex",
          indexPage: index,
          indexPageCount: floorChunks.length,
          sections: [{ dungeon, floors }],
        });
      });

      for (const floor of dungeon.floors) {
        floorPageByKey[getFloorPageKey(dungeon, floor)] = pages.length;
        pages.push({ kind: "floor", dungeon, floor });
      }

      return {
        pages,
        floorPageByKey,
        floorSelectorPageByKey,
        worldIndexPageByDungeonId,
        worldIndexPageByFloorKey,
        dynamicFloorDetailPage,
        worldIndexPage: 0,
      };
    }

    const dungeonChunks = balancedChunks(selectedWorld.dungeons, WORLD_INDEX_DUNGEONS_PER_PAGE, true);
    dungeonChunks.forEach((dungeons, index) => {
      const indexPage = pages.length;
      dungeons.forEach((dungeon) => {
        worldIndexPageByDungeonId[dungeon.dungeonId] = indexPage;
        dungeon.floors.forEach((floor) => {
          worldIndexPageByFloorKey[getFloorPageKey(dungeon, floor)] = indexPage;
        });
      });
      pages.push({
        kind: "worldIndex",
        indexPage: index,
        indexPageCount: dungeonChunks.length,
        sections: dungeons.map((dungeon) => ({ dungeon, floors: dungeon.floors })),
      });
    });

    for (const dungeon of selectedWorld.dungeons) {
      for (const floor of dungeon.floors) {
        floorPageByKey[getFloorPageKey(dungeon, floor)] = pages.length;
        pages.push({ kind: "floor", dungeon, floor });
      }
    }

    return {
      pages,
      floorPageByKey,
      floorSelectorPageByKey,
      worldIndexPageByDungeonId,
      worldIndexPageByFloorKey,
      dynamicFloorDetailPage,
      worldIndexPage: 0,
    };
  }, [selectedWorld]);

  const goToPage = useCallback((pageIndex: number) => {
    setCurrentContentPage(pageIndex);
    pfRef.current?.turnToPage(CONTENT_PAGE_OFFSET + pageIndex, "hard");
  }, []);

  const preloadForContentPage = useCallback((pageIndex: number) => {
    const page = pagePlan.pages[pageIndex];
    if (!page) return;

    if (page.kind === "worldIndex") {
      void preloadDungeonMonsters(getFloorEnemyIds(page.sections.flatMap((section) => section.floors)));
      return;
    }

    if (page.kind === "floorSelector") {
      void preloadDungeonMonsters(getFloorEnemyIds(page.floors));
      return;
    }

    if (page.kind === "floor") {
      void preloadDungeonMonster(page.floor.enemyId, "priority");
      return;
    }

    if (page.kind === "dynamicFloorDetail") {
      const selectedFloor = selectedLongformFloor?.dungeon.dungeonId === page.dungeon.dungeonId
        ? selectedLongformFloor.floor
        : page.dungeon.floors[0];
      if (selectedFloor) {
        void preloadDungeonMonster(selectedFloor.enemyId, "priority");
      }
    }
  }, [pagePlan, selectedLongformFloor]);

  const handlePageChange = useCallback((page0: number) => {
    const contentPageIndex = page0 - CONTENT_PAGE_OFFSET;
    if (contentPageIndex < 0) return;
    setCurrentContentPage(contentPageIndex);
    preloadForContentPage(contentPageIndex);
  }, [preloadForContentPage]);

  const handleReady = useCallback((pf: PageFlipLike) => {
    pfRef.current = pf;
    if (state !== "opening") return;

    pf.turnToPage(0, "hard");
    openingTimersRef.current.push(window.setTimeout(() => {
      setCoverCentered(false);
    }, Math.max(0, OPENING_FLIP_START_DELAY - 80)));

    const orientation = pf.getOrientation?.();
    const flipCount = orientation === "portrait"
      ? CONTENT_PAGE_OFFSET
      : Math.ceil(CONTENT_PAGE_OFFSET / 2);

    for (let index = 0; index < flipCount; index++) {
      openingTimersRef.current.push(window.setTimeout(() => {
        pf.flipNext(index % 2 === 0 ? "top" : "bottom");
      }, OPENING_FLIP_START_DELAY + index * OPENING_FLIP_INTERVAL));
    }

    openingTimersRef.current.push(window.setTimeout(() => {
      pf.turnToPage(CONTENT_PAGE_OFFSET, "hard");
    }, OPENING_DURATION_MS - 220));
  }, [state]);

  const openBook = useCallback((world: DungeonWorld, trigger: HTMLButtonElement) => {
    if (state !== "library") return;

    clearOpeningTimers();
    setSelectedWorld(world);
    setSelectedLongformFloor(null);
    setCurrentContentPage(0);
    setOpenRun((value) => value + 1);
    void preloadDungeonMonsters(getOpeningPreloadEnemyIds(world), "priority");
    const geometry = getBookGeometry(getReaderBounds());
    setBookGeometry(geometry);

    if (prefersReducedMotion()) {
      setOpeningRect(null);
      setCentered(false);
      setCoverCentered(false);
      setState("reading");
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const scale = Math.min(rect.width / geometry.pageWidth, rect.height / geometry.pageHeight);

    setOpeningRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      scale,
    });
    setState("opening");
    setCentered(false);
    setCoverCentered(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => setCentered(true));
    });

    openingTimersRef.current.push(window.setTimeout(() => {
      pfRef.current?.turnToPage(CONTENT_PAGE_OFFSET, "hard");
      setState("reading");
      setOpeningRect(null);
      setCentered(false);
      setCoverCentered(false);
    }, OPENING_DURATION_MS));
  }, [clearOpeningTimers, getReaderBounds, state]);

  const backToLibrary = useCallback(() => {
    clearOpeningTimers();
    pfRef.current?.turnToPage(0, "hard");
    pfRef.current = null;
    setZoomedEnemy(null);
    setState("library");
    setSelectedWorld(null);
    setSelectedLongformFloor(null);
    setCurrentContentPage(0);
    setOpeningRect(null);
    setCentered(false);
    setCoverCentered(false);
    setBookGeometry(null);
  }, [clearOpeningTimers]);

  useEffect(() => {
    if (!zoomedEnemy) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeMonsterImage();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [closeMonsterImage, zoomedEnemy]);

  useEffect(() => {
    if (state === "library") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      backToLibrary();
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [backToLibrary, state]);

  useEffect(() => {
    if (state === "library") return;

    const updateGeometry = () => {
      const geometry = getBookGeometry(getReaderBounds());
      setBookGeometry((current) => areBookGeometriesEqual(current, geometry) ? current : geometry);
    };

    updateGeometry();
    const target = libraryRef.current;
    const observer = target && "ResizeObserver" in window
      ? new ResizeObserver(updateGeometry)
      : null;
    if (target && observer) observer.observe(target);
    window.addEventListener("resize", updateGeometry, { passive: true });
    window.visualViewport?.addEventListener("resize", updateGeometry, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateGeometry);
      window.visualViewport?.removeEventListener("resize", updateGeometry);
    };
  }, [getReaderBounds, state]);

  const htmlPages = useMemo(() => {
    if (!selectedWorld) return [];
    const selectedWorldTitle = getWorldTitle(selectedWorld);
    const activeLocale = i18n.language;

    const controlProps = {
      onPointerDown: stopFlipGesture,
      onMouseDown: stopFlipGesture,
      onTouchStart: stopFlipGesture,
      onClick: stopFlipGesture,
    };

    const coverPages = [
      <section className="dungeon-book-cover-page dungeon-book-front-cover" data-density="hard" key="front-cover">
        <span className="dungeon-book-cover-inner-material" aria-hidden />
        <span className="dungeon-book-cover-spine" />
        <span className="dungeon-book-cover-title">{selectedWorldTitle}</span>
        <span className="dungeon-book-cover-subtitle">{getLocalizedBookSubtitle(selectedWorld)}</span>
      </section>,
      <section className="dungeon-book-cover-page dungeon-book-inside-cover" data-density="hard" key="inside-cover">
        <span className="opening-paper-warmth" />
      </section>,
    ];

    const openingPages = OPENING_FRONTMATTER_PAGES.map((page) => (
      <section className="opening-paper-page" key={`opening-frontmatter-${page}`}>
        <span className="opening-paper-warmth" />
      </section>
    ));

    const contentPages = pagePlan.pages.map((page, index) => {
      if (page.kind === "worldIndex") {
        return (
          <section className="dungeon-book-page world-index-page" key={`world-index-${page.indexPage}`}>
            <div className="page-kicker">{t("dungeonLibrary.title")}</div>
            <h1>{selectedWorldTitle}</h1>
            <div className="world-index-sections">
              {page.sections.map((section) => {
                const dungeonName = getDungeonDisplayName(section.dungeon, activeLocale, (dungeonId) =>
                  t("dungeonLibrary.fallbacks.dungeon", { dungeonId })
                );
                const firstFloor = section.floors[0]?.position;
                const lastFloor = section.floors[section.floors.length - 1]?.position;
                const showRange = section.floors.length !== section.dungeon.floors.length;

                return (
                  <section className="world-index-section" key={`${section.dungeon.dungeonId}-${firstFloor ?? 0}`}>
                    <div className="world-index-title-row">
                      <h2 className="world-index-title">{dungeonName}</h2>
                      <span className="world-index-section-meta">
                        {showRange
                          ? t("dungeonLibrary.book.floorRangeTitle", { start: firstFloor, end: lastFloor })
                          : t("dungeonLibrary.book.floorCount", { count: section.floors.length })}
                      </span>
                    </div>
                    <div
                      className="world-index-floor-grid"
                      aria-label={t("dungeonLibrary.book.floorGridAria", { title: dungeonName })}
                    >
                      {section.floors.map((floor) => {
                        const floorKey = getFloorPageKey(section.dungeon, floor);
                        const monsterName = getMonsterDisplayName(section.dungeon, floor, activeLocale, (enemyId) =>
                          t("dungeonLibrary.fallbacks.enemy", { enemyId })
                        );
                        const imageUrl = getDungeonMonsterImage(floor.enemyId, 360);

                        return (
                          <button
                            {...controlProps}
                            className="world-index-floor-tile"
                            data-flip-interactive
                            key={floor.position}
                            type="button"
                            aria-label={t("dungeonLibrary.book.floorTileAria", {
                              dungeon: dungeonName,
                              floor: floor.position,
                              monster: monsterName,
                            })}
                            onPointerEnter={() => {
                              void preloadDungeonMonster(floor.enemyId, "priority");
                            }}
                            onClick={(event) => {
                              stopFlipGesture(event);
                              void preloadDungeonMonster(floor.enemyId, "priority");
                              goToPage(pagePlan.floorPageByKey[floorKey]);
                            }}
                          >
                            <span className="world-index-floor-image-frame" aria-hidden>
                              {imageUrl ? (
                                <img
                                  className="world-index-floor-image"
                                  src={imageUrl}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <span className="world-index-floor-image-fallback">?</span>
                              )}
                            </span>
                            <span className="world-index-floor-number">{floor.position}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="page-note">
              {t("dungeonLibrary.book.worldIndexPageNote", {
                current: page.indexPage + 1,
                total: page.indexPageCount,
                page: index + 1,
              })}
            </p>
          </section>
        );
      }

      if (page.kind === "rangeOverview") {
        return (
          <section className="dungeon-book-page" key={`range-overview-${page.overviewIndex}`}>
            <div className="page-kicker">{t("dungeonLibrary.title")}</div>
            <h1>{selectedWorldTitle}</h1>
            <div className="world-dungeon-grid">
              {page.ranges.map((range) => {
                const firstFloor = range.floors[0];
                return (
                  <button
                    {...controlProps}
                    className="world-dungeon-card"
                    key={range.index}
                    type="button"
                    onClick={(event) => {
                      stopFlipGesture(event);
                      if (!firstFloor) return;
                      const preloadCount = selectedWorld.floorNavigation?.mode === "chapters"
                        ? selectedWorld.floorNavigation.pageSize
                        : FLOORS_PER_OVERVIEW_PAGE;
                      void preloadDungeonMonsters(getFloorEnemyIds(range.floors.slice(0, preloadCount)));
                      goToPage(pagePlan.floorSelectorPageByKey[getFloorPageKey(selectedWorld.dungeons[0], firstFloor)]);
                    }}
                  >
                    <span>{range.start}-{range.end}</span>
                    <strong>{t("dungeonLibrary.book.floorCount", { count: range.floors.length })}</strong>
                  </button>
                );
              })}
            </div>
            <p className="page-note">
              {t("dungeonLibrary.book.rangeOverviewPageNote", {
                current: page.overviewIndex + 1,
                total: page.overviewCount,
                page: index + 1,
              })}
            </p>
          </section>
        );
      }

      if (page.kind === "floorSelector") {
        const firstFloor = page.floors[0]?.position;
        const lastFloor = page.floors[page.floors.length - 1]?.position;

        return (
          <section className="dungeon-book-page" key={`floor-selector-${page.range.index}-${page.selectorIndex}`}>
            <div className="page-kicker">{selectedWorldTitle} · {page.range.start}-{page.range.end}</div>
            <h1>{t("dungeonLibrary.book.floorRangeTitle", { start: firstFloor, end: lastFloor })}</h1>
            <div
              className="floor-grid"
              aria-label={t("dungeonLibrary.book.floorRangeAria", {
                title: selectedWorldTitle,
                start: firstFloor,
                end: lastFloor,
              })}
            >
              {page.floors.map((floor) => (
                <button
                  {...controlProps}
                  className="floor-button"
                  key={floor.position}
                  type="button"
                  onPointerEnter={() => {
                    void preloadDungeonMonster(floor.enemyId, "priority");
                  }}
                  onClick={(event) => {
                    stopFlipGesture(event);
                    void preloadDungeonMonster(floor.enemyId, "priority");
                    const backPage = pagePlan.floorSelectorPageByKey[getFloorPageKey(page.dungeon, floor)];
                    setSelectedLongformFloor({ dungeon: page.dungeon, floor, backPage });
                    window.requestAnimationFrame(() => {
                      if (pagePlan.dynamicFloorDetailPage != null) {
                        goToPage(pagePlan.dynamicFloorDetailPage);
                      }
                    });
                  }}
                >
                  {floor.position}
                </button>
              ))}
            </div>
            <p className="page-note">
              {t("dungeonLibrary.book.selectorPageNote", {
                current: page.selectorIndex + 1,
                total: page.selectorCount,
              })}
            </p>
          </section>
        );
      }

      if (page.kind === "dynamicFloorDetail") {
        const selectedFloor = selectedLongformFloor?.dungeon.dungeonId === page.dungeon.dungeonId
          ? selectedLongformFloor.floor
          : page.dungeon.floors[0];

        return (
          <section className="dungeon-book-page" key={`dynamic-enemy-${page.dungeon.dungeonId}`}>
            <div className="page-kicker">{selectedWorldTitle}</div>
            <EnemyDetail
              dungeon={page.dungeon}
              floor={selectedFloor}
              dungeonName={getDungeonDisplayName(page.dungeon, activeLocale, (dungeonId) =>
                t("dungeonLibrary.fallbacks.dungeon", { dungeonId })
              )}
              monsterName={getMonsterDisplayName(page.dungeon, selectedFloor, activeLocale, (enemyId) =>
                t("dungeonLibrary.fallbacks.enemy", { enemyId })
              )}
              onOpenMonsterImage={openMonsterImage}
            />
            <p className="page-note">{t("dungeonLibrary.book.pageNote", { page: index + 1 })}</p>
          </section>
        );
      }

      return (
        <section className="dungeon-book-page" key={`enemy-${page.dungeon.dungeonId}-${page.floor.position}`}>
          <div className="page-kicker">{selectedWorldTitle}</div>
          <EnemyDetail
            dungeon={page.dungeon}
            floor={page.floor}
            dungeonName={getDungeonDisplayName(page.dungeon, activeLocale, (dungeonId) =>
              t("dungeonLibrary.fallbacks.dungeon", { dungeonId })
            )}
            monsterName={getMonsterDisplayName(page.dungeon, page.floor, activeLocale, (enemyId) =>
              t("dungeonLibrary.fallbacks.enemy", { enemyId })
            )}
            onOpenMonsterImage={openMonsterImage}
          />
          <p className="page-note">{t("dungeonLibrary.book.pageNote", { page: index + 1 })}</p>
        </section>
      );
    });

    return [...coverPages, ...openingPages, ...contentPages];
  }, [getLocalizedBookSubtitle, getWorldTitle, goToPage, i18n.language, openMonsterImage, pagePlan, selectedLongformFloor, selectedWorld, t]);

  const opened = state !== "library";
  const bookVisualState = state === "reading" ? "reading" : coverCentered ? "cover" : "opening";
  const toolbarBackAction = useMemo(() => {
    if (!selectedWorld) return undefined;
    const page = pagePlan.pages[currentContentPage];
    if (!page) return undefined;
    const makeAction = (label: string, targetPage: number | undefined) => {
      if (typeof targetPage !== "number") return undefined;
      return {
        label: `← ${label}`,
        shortLabel: "←",
        onClick: () => goToPage(targetPage),
      };
    };

    if (page.kind === "floorSelector") {
      return makeAction(t("dungeonLibrary.navigation.floorRanges"), pagePlan.worldIndexPage);
    }
    if (page.kind === "dynamicFloorDetail") {
      const targetPage = selectedLongformFloor?.dungeon.dungeonId === page.dungeon.dungeonId
        ? selectedLongformFloor.backPage
        : pagePlan.worldIndexPage;
      return makeAction(t("dungeonLibrary.navigation.floors"), targetPage);
    }
    if (page.kind === "floor") {
      const floorKey = getFloorPageKey(page.dungeon, page.floor);
      const targetPage = pagePlan.worldIndexPageByFloorKey[floorKey]
        ?? pagePlan.worldIndexPageByDungeonId[page.dungeon.dungeonId]
        ?? pagePlan.worldIndexPage;
      return makeAction(t("dungeonLibrary.navigation.worldOverview"), targetPage);
    }
    return undefined;
  }, [currentContentPage, goToPage, pagePlan, selectedLongformFloor, selectedWorld, t]);
  const toolbarLibraryAction = useMemo(() => ({
    label: t("dungeonLibrary.navigation.backToLibrary"),
    shortLabel: t("dungeonLibrary.navigation.backToLibraryShort"),
    onClick: backToLibrary,
  }), [backToLibrary, t]);
  const bookStageStyle = bookGeometry
    ? {
        ...(() => {
          const startScale = openingRect?.scale ?? 1;
          const coverPageOffset = bookGeometry.isMobile ? 0 : bookGeometry.pageWidth * startScale;
          return {
            ["--stage-start-x" as any]: openingRect
              ? `${openingRect.left - bookGeometry.stageLeft - coverPageOffset}px`
              : "0px",
            ["--stage-start-y" as any]: openingRect
              ? `${openingRect.top - bookGeometry.stageTop}px`
              : "0px",
            ["--stage-start-scale" as any]: startScale,
            ["--stage-cover-shift" as any]: bookGeometry.isMobile
              ? "0px"
              : `${-bookGeometry.pageWidth / 2}px`,
            ["--book-scale" as any]: bookGeometry.scale,
            ["--flipbook-hud-scale" as any]: bookGeometry.isMobile ? 1 : 1 / bookGeometry.scale,
            ["--flipbook-hud-bottom" as any]: bookGeometry.isMobile ? "-58px" : `${-58 / bookGeometry.scale}px`,
          };
        })(),
        left: `${bookGeometry.stageLeft}px`,
        top: `${bookGeometry.stageTop}px`,
        width: `${bookGeometry.openWidth}px`,
        height: `${bookGeometry.pageHeight}px`,
        aspectRatio: `${bookGeometry.openWidth} / ${bookGeometry.pageHeight}`,
        ["--book-page-width" as any]: `${bookGeometry.pageWidth}px`,
        ["--book-page-height" as any]: `${bookGeometry.pageHeight}px`,
      }
    : undefined;
  const readerStateClass = state === "reading" ? "is-reading" : "is-opening";
  const bookStageLayer = opened && bookGeometry && selectedWorld
    ? (
        <div className={`book-reader-stage-layer ${readerStateClass}`}>
          <div
            className={`book-stage ${centered ? "is-centered" : ""} ${coverCentered ? "is-cover-centered" : ""} ${bookGeometry.isMobile ? "is-mobile-stage" : ""}`}
            style={bookStageStyle}
          >
            <div className="content-flipbook-layer" aria-hidden={state !== "reading"}>
              <div className="dom-flipbook-host">
                <FlipbookCurlViewer
                  htmlPages={htmlPages}
                  htmlPagesKey={`${selectedWorld.worldId}-${openRun}`}
                  title={getWorldTitle(selectedWorld)}
                  pageWidth={bookGeometry.pageWidth}
                  pageHeight={bookGeometry.pageHeight}
                  initialPage={state === "opening" ? 1 : CONTENT_PAGE_OFFSET + 1}
                  minPageIndex={state === "reading" ? CONTENT_PAGE_OFFSET : 0}
                  displayPageOffset={CONTENT_PAGE_OFFSET}
                  displayPageCount={pagePlan.pages.length}
                  showHud={state === "reading"}
                  showCover
                  enableKeyboard={state === "reading"}
                  visualMode="book"
                  visualState={bookVisualState}
                  flippingTime={OPENING_FLIPPING_TIME}
                  syncPageIndex={state === "reading" ? CONTENT_PAGE_OFFSET : null}
                  toolbarBackAction={toolbarBackAction}
                  toolbarLibraryAction={toolbarLibraryAction}
                  onReady={handleReady}
                  onPageChange={handlePageChange}
                  noSound
                />
              </div>
            </div>
          </div>
        </div>
      )
    : null;
  const bookStagePortal = bookStageLayer && typeof document !== "undefined"
    ? createPortal(bookStageLayer, document.body)
    : null;
  const monsterZoomPortal = zoomedEnemy && typeof document !== "undefined"
    ? createPortal(
        <MonsterImageZoomOverlay enemy={zoomedEnemy} onClose={closeMonsterImage} />,
        document.body
      )
    : null;

  return (
    <ContentShell
      title={t("dungeonLibrary.title")}
      subtitle={t("dungeonLibrary.subtitle")}
      centerFramed={false}
      mode="page"
      outerPadding="p-4 md:p-6"
      stickyTopbar={false}
    >
      <div className={`dungeon-library ${opened ? "is-opened" : ""}`} ref={libraryRef}>
        <section className="library-shelf" aria-label={t("dungeonLibrary.aria.bookshelf")}>
          <div className="library-shelf-scroll">
            <div className="shelf-row">
              <div className="shelf-books">
                {dungeonWorlds.map((world) => {
                  const worldTitle = getWorldTitle(world);
                  return (
                    <button
                      className={`library-book ${world.worldId}-book`}
                      key={world.worldId}
                      type="button"
                      onClick={(event) => openBook(world, event.currentTarget)}
                      disabled={state !== "library"}
                    >
                      <span className="book-spine" />
                      <span className="book-title">{worldTitle}</span>
                      <span className="book-subtitle">{getLocalizedBookSubtitle(world)}</span>
                    </button>
                  );
                })}
              </div>
              <span className="shelf-visual" aria-hidden />
            </div>
          </div>
        </section>

        {opened && bookGeometry && selectedWorld && (
          <section className={`book-reader-overlay ${readerStateClass}`}>
            <div className="book-reader-backdrop" aria-hidden />
            {state !== "reading" && <div className="interaction-lock" aria-hidden />}
          </section>
        )}
        {bookStagePortal}
        {monsterZoomPortal}
      </div>
    </ContentShell>
  );
}
