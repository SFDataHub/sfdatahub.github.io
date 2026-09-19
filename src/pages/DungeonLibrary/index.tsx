import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ContentShell from "../../components/ContentShell";
import FlipbookCurlViewer from "../../components/Flipbook/FlipbookCurlViewer";
import { classWorld, type DungeonLibraryDungeon, type DungeonLibraryFloor } from "../../data/dungeonLibrary/classWorld";
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
  stageLeft: number;
  stageTop: number;
  spineX: number;
  centerX: number;
  centerY: number;
  isMobile: boolean;
};

type PagePlan =
  | { kind: "world" }
  | { kind: "dungeon"; dungeon: DungeonLibraryDungeon }
  | { kind: "floor"; dungeon: DungeonLibraryDungeon; floor: DungeonLibraryFloor };

const COVER_PAGE_COUNT = 2;
const OPENING_FRONTMATTER_PAGE_COUNT = 5;
const CONTENT_PAGE_OFFSET = COVER_PAGE_COUNT + OPENING_FRONTMATTER_PAGE_COUNT;
const OPENING_FRONTMATTER_PAGES = Array.from({ length: OPENING_FRONTMATTER_PAGE_COUNT }, (_, index) => index);
const OPENING_FLIP_START_DELAY = 760;
const OPENING_FLIP_INTERVAL = 380;
const OPENING_DURATION_MS = 2580;
const OPENING_FLIPPING_TIME = 360;
const PAGE_ASPECT = 1200 / 900;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

const stopFlipGesture = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

const getBookGeometry = (): BookGeometry => {
  const isMobile = window.innerWidth < 760;
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const availableWidth = Math.max(280, window.innerWidth - (isMobile ? 28 : 64));
  const availableHeight = Math.max(320, window.innerHeight * (isMobile ? 0.62 : 0.66));
  const openWidthLimit = isMobile ? availableWidth : Math.min(availableWidth, 1080);
  const pageWidthFromHeight = availableHeight / PAGE_ASPECT;
  const pageWidthFromWidth = isMobile ? openWidthLimit : openWidthLimit / 2;
  const pageWidth = Math.min(pageWidthFromWidth, pageWidthFromHeight, isMobile ? 360 : 540);
  const pageHeight = pageWidth * PAGE_ASPECT;
  const openWidth = isMobile ? pageWidth : pageWidth * 2;
  const spineX = isMobile ? centerX - pageWidth / 2 : centerX;
  const stageLeft = isMobile ? spineX : spineX - pageWidth;
  const stageTop = centerY - pageHeight / 2;

  return { pageWidth, pageHeight, openWidth, stageLeft, stageTop, spineX, centerX, centerY, isMobile };
};

export default function DungeonLibraryPage() {
  const pfRef = useRef<PageFlipLike | null>(null);
  const bookButtonRef = useRef<HTMLButtonElement | null>(null);
  const openingTimersRef = useRef<number[]>([]);
  const [state, setState] = useState<"library" | "opening" | "reading">("library");
  const [centered, setCentered] = useState(false);
  const [openingRect, setOpeningRect] = useState<OpeningRect | null>(null);
  const [bookGeometry, setBookGeometry] = useState<BookGeometry | null>(null);
  const [coverCentered, setCoverCentered] = useState(false);
  const [openRun, setOpenRun] = useState(0);

  const clearOpeningTimers = useCallback(() => {
    openingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    openingTimersRef.current = [];
  }, []);

  useEffect(() => clearOpeningTimers, [clearOpeningTimers]);

  const pagePlan = useMemo(() => {
    const pages: PagePlan[] = [{ kind: "world" }];
    const dungeonPageById: Record<number, number> = {};
    const enemyPageById: Record<number, number> = {};

    for (const dungeon of classWorld.dungeons) {
      dungeonPageById[dungeon.dungeonId] = pages.length;
      pages.push({ kind: "dungeon", dungeon });

      for (const floor of dungeon.floors) {
        enemyPageById[floor.enemyId] = pages.length;
        pages.push({ kind: "floor", dungeon, floor });
      }
    }

    return { pages, dungeonPageById, enemyPageById, worldOverviewPage: 0 };
  }, []);

  const goToPage = useCallback((pageIndex: number) => {
    pfRef.current?.turnToPage(CONTENT_PAGE_OFFSET + pageIndex, "hard");
  }, []);

  const handleReady = useCallback((pf: PageFlipLike) => {
    pfRef.current = pf;
    if (state !== "opening") return;

    pf.turnToPage(0, "hard");
    openingTimersRef.current.push(window.setTimeout(() => {
      setCoverCentered(false);
    }, Math.max(0, OPENING_FLIP_START_DELAY - 180)));

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

  const openBook = useCallback(() => {
    if (state !== "library") return;

    clearOpeningTimers();
    setOpenRun((value) => value + 1);
    const geometry = getBookGeometry();
    setBookGeometry(geometry);

    if (prefersReducedMotion()) {
      setOpeningRect(null);
      setCentered(false);
      setCoverCentered(false);
      setState("reading");
      return;
    }

    const rect = bookButtonRef.current?.getBoundingClientRect();
    if (!rect) {
      setCoverCentered(false);
      setState("reading");
      return;
    }

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
  }, [clearOpeningTimers, state]);

  const backToLibrary = useCallback(() => {
    clearOpeningTimers();
    pfRef.current?.turnToPage(0, "hard");
    pfRef.current = null;
    setState("library");
    setOpeningRect(null);
    setCentered(false);
    setCoverCentered(false);
    setBookGeometry(null);
  }, [clearOpeningTimers]);

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

  const htmlPages = useMemo(() => {
    const controlProps = {
      onPointerDown: stopFlipGesture,
      onMouseDown: stopFlipGesture,
      onTouchStart: stopFlipGesture,
      onClick: stopFlipGesture,
    };

    const coverPages = [
      <section className="dungeon-book-cover-page dungeon-book-front-cover" data-density="hard" key="front-cover">
        <span className="dungeon-book-cover-spine" />
        <span className="dungeon-book-cover-title">{classWorld.title}</span>
        <span className="dungeon-book-cover-subtitle">5 Dungeons</span>
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
      if (page.kind === "world") {
        return (
          <section className="dungeon-book-page" key="world">
            <div className="page-kicker">Dungeon Library</div>
            <h1>{classWorld.title}</h1>
            <div className="world-dungeon-grid">
              {classWorld.dungeons.map((dungeon) => (
                <button
                  {...controlProps}
                  className="world-dungeon-card"
                  key={dungeon.dungeonId}
                  type="button"
                  onClick={(event) => {
                    stopFlipGesture(event);
                    goToPage(pagePlan.dungeonPageById[dungeon.dungeonId]);
                  }}
                >
                  <span>Dungeon {dungeon.dungeonId}</span>
                  <strong>{dungeon.floors.length} Floors</strong>
                </button>
              ))}
            </div>
            <p className="page-note">Page {index + 1}</p>
          </section>
        );
      }

      if (page.kind === "dungeon") {
        return (
          <section className="dungeon-book-page" key={`dungeon-${page.dungeon.dungeonId}`}>
            <button
              {...controlProps}
              className="book-link-button"
              type="button"
              onClick={(event) => {
                stopFlipGesture(event);
                goToPage(pagePlan.worldOverviewPage);
              }}
            >
              ← Klassenwelt
            </button>
            <div className="page-kicker">Klassenwelt</div>
            <h1>Dungeon {page.dungeon.dungeonId}</h1>
            <div className="floor-grid" aria-label={`Dungeon ${page.dungeon.dungeonId} Floors`}>
              {page.dungeon.floors.map((floor) => (
                <button
                  {...controlProps}
                  className="floor-button"
                  key={floor.enemyId}
                  type="button"
                  onClick={(event) => {
                    stopFlipGesture(event);
                    goToPage(pagePlan.enemyPageById[floor.enemyId]);
                  }}
                >
                  {floor.floor}
                </button>
              ))}
            </div>
            <p className="page-note">{page.dungeon.floors.length} Floors</p>
          </section>
        );
      }

      return (
        <section className="dungeon-book-page" key={`enemy-${page.floor.enemyId}`}>
          <button
            {...controlProps}
            className="book-link-button"
            type="button"
            onClick={(event) => {
              stopFlipGesture(event);
              goToPage(pagePlan.dungeonPageById[page.dungeon.dungeonId]);
            }}
          >
            ← Dungeon Overview
          </button>
          <div className="page-kicker">Klassenwelt</div>
          <h1>Dungeon {page.dungeon.dungeonId}</h1>
          <div className="enemy-detail">
            <span>Floor {page.floor.floor} / {page.dungeon.floors.length}</span>
            <strong>Enemy ID {page.floor.enemyId}</strong>
          </div>
          <p className="page-note">Page {index + 1}</p>
        </section>
      );
    });

    return [...coverPages, ...openingPages, ...contentPages];
  }, [goToPage, pagePlan]);

  const opened = state !== "library";
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

  return (
    <ContentShell
      title="Dungeon Library"
      subtitle="Technischer Vertical Slice"
      centerFramed
      stickyTopbar={false}
    >
      <div className={`dungeon-library ${opened ? "is-opened" : ""}`}>
        <section className="library-shelf" aria-label="Dungeon Library bookshelf">
          <div className="shelf-row">
            <button
              className="library-book class-world-book"
              ref={bookButtonRef}
              type="button"
              onClick={openBook}
              disabled={state !== "library"}
            >
              <span className="book-spine" />
              <span className="book-title">{classWorld.title}</span>
              <span className="book-subtitle">5 Dungeons</span>
            </button>
          </div>
        </section>

        {opened && bookGeometry && (
          <section className={`book-reader-overlay ${state === "reading" ? "is-reading" : "is-opening"}`}>
            <div className="book-reader-backdrop" aria-hidden />
            <button className="reader-close-button" type="button" onClick={backToLibrary} aria-label="Zurück zur Dungeon Library">
              ×
            </button>
            <div
              className={`book-stage ${centered ? "is-centered" : ""} ${coverCentered ? "is-cover-centered" : ""} ${bookGeometry.isMobile ? "is-mobile-stage" : ""}`}
              style={bookStageStyle}
            >
              <div className="content-flipbook-layer" aria-hidden={state !== "reading"}>
                <div className="dom-flipbook-host">
                  <FlipbookCurlViewer
                    htmlPages={htmlPages}
                    htmlPagesKey={`${classWorld.worldId}-${openRun}`}
                    title={classWorld.title}
                    pageWidth={900}
                    pageHeight={1200}
                    initialPage={state === "opening" ? 1 : CONTENT_PAGE_OFFSET + 1}
                    minPageIndex={state === "reading" ? CONTENT_PAGE_OFFSET : 0}
                    displayPageOffset={CONTENT_PAGE_OFFSET}
                    displayPageCount={pagePlan.pages.length}
                    showHud={state === "reading"}
                    showCover
                    enableKeyboard={state === "reading"}
                    visualMode="book"
                    flippingTime={OPENING_FLIPPING_TIME}
                    syncPageIndex={state === "reading" ? CONTENT_PAGE_OFFSET : null}
                    onReady={handleReady}
                    noSound
                  />
                </div>
              </div>
            </div>
            {state !== "reading" && <div className="interaction-lock" aria-hidden />}
          </section>
        )}

      </div>
    </ContentShell>
  );
}
