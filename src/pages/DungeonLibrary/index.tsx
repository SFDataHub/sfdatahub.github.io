import React, { useCallback, useMemo, useRef, useState } from "react";
import ContentShell from "../../components/ContentShell";
import FlipbookCurlViewer from "../../components/Flipbook/FlipbookCurlViewer";
import { classWorld, type DungeonLibraryDungeon, type DungeonLibraryFloor } from "../../data/dungeonLibrary/classWorld";
import "./DungeonLibrary.css";

type PageFlipLike = {
  turnToPage: (index: number, corner?: string) => void;
};

type OpeningRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
  scale: number;
};

type PagePlan =
  | { kind: "world" }
  | { kind: "dungeon"; dungeon: DungeonLibraryDungeon }
  | { kind: "floor"; dungeon: DungeonLibraryDungeon; floor: DungeonLibraryFloor };

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

const stopFlipGesture = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

export default function DungeonLibraryPage() {
  const pfRef = useRef<PageFlipLike | null>(null);
  const bookButtonRef = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<"library" | "opening" | "open">("library");
  const [centered, setCentered] = useState(false);
  const [openingRect, setOpeningRect] = useState<OpeningRect | null>(null);
  const [openRun, setOpenRun] = useState(0);

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
    pfRef.current?.turnToPage(pageIndex, "hard");
  }, []);

  const handleReady = useCallback((pf: PageFlipLike) => {
    pfRef.current = pf;
  }, []);

  const openBook = useCallback(() => {
    if (state !== "library") return;

    setOpenRun((value) => value + 1);

    if (prefersReducedMotion()) {
      setOpeningRect(null);
      setCentered(false);
      setState("open");
      return;
    }

    const rect = bookButtonRef.current?.getBoundingClientRect();
    if (!rect) {
      setState("open");
      return;
    }

    const targetWidth = Math.min(window.innerWidth * 0.72, 520);
    const targetHeight = Math.min(window.innerHeight * 0.62, targetWidth * 1.38);
    const scale = Math.min(targetWidth / rect.width, targetHeight / rect.height);
    const targetCenterX = window.innerWidth / 2;
    const targetCenterY = window.innerHeight / 2;
    const currentCenterX = rect.left + rect.width / 2;
    const currentCenterY = rect.top + rect.height / 2;

    setOpeningRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      dx: targetCenterX - currentCenterX,
      dy: targetCenterY - currentCenterY,
      scale,
    });
    setState("opening");
    setCentered(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => setCentered(true));
    });

    window.setTimeout(() => {
      setState("open");
      setOpeningRect(null);
      setCentered(false);
    }, 2150);
  }, [state]);

  const backToLibrary = useCallback(() => {
    pfRef.current?.turnToPage(0, "hard");
    pfRef.current = null;
    setState("library");
    setOpeningRect(null);
    setCentered(false);
  }, []);

  const htmlPages = useMemo(() => {
    const controlProps = {
      onPointerDown: stopFlipGesture,
      onMouseDown: stopFlipGesture,
      onTouchStart: stopFlipGesture,
      onClick: stopFlipGesture,
    };

    return pagePlan.pages.map((page, index) => {
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
  }, [goToPage, pagePlan]);

  const opened = state !== "library";

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

        {opened && (
          <section className={`open-book-panel ${state === "open" ? "is-interactive" : ""}`}>
            <div className="open-book-toolbar">
              <button className="library-back-button" type="button" onClick={backToLibrary}>
                ← Dungeon Library
              </button>
            </div>
            <div className="dom-flipbook-host" aria-hidden={state !== "open"}>
              <FlipbookCurlViewer
                htmlPages={htmlPages}
                htmlPagesKey={`${classWorld.worldId}-${openRun}`}
                title={classWorld.title}
                pageWidth={900}
                pageHeight={1200}
                initialPage={1}
                onReady={handleReady}
                noSound
              />
            </div>
            {state !== "open" && <div className="interaction-lock" aria-hidden />}
          </section>
        )}

        {state === "opening" && openingRect && (
          <div
            className={`opening-book-flight ${centered ? "is-centered" : ""}`}
            style={{
              left: openingRect.left,
              top: openingRect.top,
              width: openingRect.width,
              height: openingRect.height,
              ["--open-dx" as any]: `${openingRect.dx}px`,
              ["--open-dy" as any]: `${openingRect.dy}px`,
              ["--open-scale" as any]: openingRect.scale,
            }}
            aria-hidden
          >
            <div className="opening-book-assembly">
              <div className="opening-book-back" />
              <div className="opening-fake-page opening-fake-page-1" />
              <div className="opening-fake-page opening-fake-page-2" />
              <div className="opening-fake-page opening-fake-page-3" />
              <div className="opening-fake-page opening-fake-page-4" />
              <div className="opening-fake-page opening-fake-page-5" />
              <div className="opening-book-cover">
                <span>{classWorld.title}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </ContentShell>
  );
}
