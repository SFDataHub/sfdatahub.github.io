import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Hammer,
  Radar,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import RecordBadge, { getRecordScopeThemeStyle } from "./RecordBadge";
import type { RecordBadgeFamily, RecordBadgeScope } from "./RecordBadge";
import styles from "./RecordShowcase.module.css";

export type RecordShowcaseRecord = {
  id?: string;
  messageId?: string;
  channelId?: string;
  channelName?: string;
  postedAt?: string | null;
  content?: string | null;
  author?: string | null;
  imageUrl?: string | null;
  jumpUrl?: string | null;
  recordLabel?: string | null;
  holderDisplay?: string | null;
  scopeLabel?: string | null;
  server?: string | null;
  days?: string | null;
  previousHolderDisplay?: string | null;
  previousDays?: string | null;
  recordKey?: string | null;
  recordFamily?: string | null;
};

export type RecordShowcaseLabels = {
  title: string;
  subtitle?: string;
  empty: string;
  fallbackTitle: string;
  previousRecord: string;
  newRecord: string;
  record: string;
  category: string;
  newRecordholder: string;
  server: string;
  postedAt: string;
  timeTaken: string;
  previousRecordholder: string;
  previousTime: string;
  classLabel: string;
  anyClass: string;
  guildCategory: string;
  overallRecord: string;
  classRecord: (className: string) => string;
  guildRecord: string;
  previousRecords: string;
  nextRecords: string;
  recordCard: (recordLabel: string) => string;
  formatDays: (days: string) => string;
};

export type RecordShowcaseProps<TRecord extends RecordShowcaseRecord = RecordShowcaseRecord> = {
  records?: TRecord[];
  labels: RecordShowcaseLabels;
  locale?: string;
  visibleRecords?: number;
  minCardWidth?: number;
  maxRecords?: number;
  className?: string;
  artworkForRecord?: (record: TRecord) => ReactNode;
};

function cleanScopeLabel(scopeLabel: string | null | undefined) {
  const scope = String(scopeLabel ?? "").trim();
  if (!scope) return "Any";
  return scope.toLowerCase().endsWith(" class") ? scope.slice(0, -" class".length).trim() || "Any" : scope;
}

function badgeScopeFromRecord(record: RecordShowcaseRecord): RecordBadgeScope {
  const label = cleanScopeLabel(record.scopeLabel);
  if (label.toLowerCase() === "any") return { type: "overall" };

  const classScope = { type: "class", classId: label } satisfies RecordBadgeScope;
  if (getRecordScopeThemeStyle(classScope)) return classScope;

  return { type: "neutral", label };
}

function familyFromRecord(record: RecordShowcaseRecord): RecordBadgeFamily {
  const family = String(record.recordFamily ?? "").trim().toLowerCase();
  const key = String(record.recordKey ?? "").trim().toLowerCase();

  if (family === "level") return "level";
  if (family === "guild") return "guild";
  if (family === "twister") return "twister";
  if (family === "sandstorm") return "sandstorm";
  if (family === "mozone") return "mozone";
  if (family === "demon-portal") return "demonPortal";
  if (key.includes("jack-the-hammer")) return "boss";
  if (family === "base") {
    if (key.includes("mine") || key.includes("gold-pit")) return "mine";
    if (key.includes("fortress") || key.includes("hall-of-knights")) return "fortress";
  }
  return "boss";
}

function iconFromRecord(record: RecordShowcaseRecord): LucideIcon {
  const family = familyFromRecord(record);
  if (family === "guild") return Users;
  if (family === "mozone") return Radar;
  if (family === "boss") return Hammer;
  return CircleGauge;
}

function formatPostedAt(postedAt: string, locale?: string) {
  const date = new Date(postedAt);
  if (Number.isNaN(date.getTime())) return postedAt;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPostedDate(postedAt: string, locale?: string) {
  const date = new Date(postedAt);
  if (Number.isNaN(date.getTime())) return postedAt;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function recordTimeLine(
  name: string | null | undefined,
  days: string | null | undefined,
  formatDays: (days: string) => string,
) {
  const cleanName = String(name ?? "").trim();
  const cleanDays = String(days ?? "").trim();
  if (!cleanName || !cleanDays) return null;
  return `${cleanName} · ${formatDays(cleanDays)}`;
}

function categoryFromScope(scope: RecordBadgeScope, labels: RecordShowcaseLabels) {
  if (scope.type === "overall") return `${labels.classLabel}: ${labels.anyClass}`;
  if (scope.type === "class") return `${labels.classLabel}: ${scope.classId}`;
  return scope.label.toLowerCase() === "guild" ? labels.guildCategory : scope.label;
}

function scopeTextFromScope(scope: RecordBadgeScope, labels: RecordShowcaseLabels) {
  if (scope.type === "overall") return labels.overallRecord;
  if (scope.type === "class") return labels.classRecord(scope.classId);
  return scope.label.toLowerCase() === "guild" ? labels.guildRecord : `${scope.label} ${labels.record}`;
}

function detailRows(
  record: RecordShowcaseRecord,
  recordLabel: string,
  scope: RecordBadgeScope,
  labels: RecordShowcaseLabels,
  locale?: string,
) {
  return [
    [labels.record, recordLabel],
    [labels.category, categoryFromScope(scope, labels)],
    [labels.newRecordholder, record.holderDisplay],
    [labels.server, record.server],
    [labels.postedAt, record.postedAt ? formatPostedAt(record.postedAt, locale) : null],
    [labels.timeTaken, record.days ? labels.formatDays(record.days) : null],
    [labels.previousRecordholder, record.previousHolderDisplay],
    [labels.previousTime, record.previousDays ? labels.formatDays(record.previousDays) : null],
  ].filter(([, value]) => Boolean(value));
}

export default function RecordShowcase<TRecord extends RecordShowcaseRecord = RecordShowcaseRecord>({
  records = [],
  labels,
  locale,
  visibleRecords = 4,
  minCardWidth = 196,
  maxRecords,
  className,
  artworkForRecord,
}: RecordShowcaseProps<TRecord>) {
  const [startIndex, setStartIndex] = useState(0);
  const [flippedIds, setFlippedIds] = useState<Set<string>>(() => new Set());
  const [measuredVisibleRecords, setMeasuredVisibleRecords] = useState(visibleRecords);
  const showcaseRef = useRef<HTMLElement | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const latestRecords = useMemo(() => {
    const sortedRecords = [...records].sort((a, b) => {
      const aTime = new Date(a.postedAt ?? "").getTime();
      const bTime = new Date(b.postedAt ?? "").getTime();
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
    return typeof maxRecords === "number" ? sortedRecords.slice(0, maxRecords) : sortedRecords;
  }, [maxRecords, records]);

  useEffect(() => {
    const element = showcaseRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      setMeasuredVisibleRecords(visibleRecords);
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const inlineSize = entry.contentRect.width;
      const gridGap = 14;
      const nextVisibleRecords = Math.max(
        1,
        Math.min(visibleRecords, Math.floor((inlineSize + gridGap) / (minCardWidth + gridGap))),
      );
      setMeasuredVisibleRecords((current) => (current === nextVisibleRecords ? current : nextVisibleRecords));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [minCardWidth, visibleRecords]);

  const visibleCount = Math.max(1, Math.min(measuredVisibleRecords, latestRecords.length || measuredVisibleRecords));
  const canNavigate = latestRecords.length > visibleCount;
  const maxStartIndex = Math.max(0, latestRecords.length - visibleCount);
  const effectiveStartIndex = canNavigate ? Math.min(startIndex, maxStartIndex) : 0;
  const visibleItems = useMemo(
    () =>
      latestRecords.length === 0
        ? []
        : latestRecords.slice(effectiveStartIndex, effectiveStartIndex + visibleCount),
    [effectiveStartIndex, latestRecords, visibleCount],
  );

  const toggleCard = (recordId: string) => {
    setFlippedIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleCardClick = (recordId: string, event: MouseEvent<HTMLElement>) => {
    const pointerStart = pointerStartRef.current;
    pointerStartRef.current = null;
    if (pointerStart) {
      const deltaX = Math.abs(event.clientX - pointerStart.x);
      const deltaY = Math.abs(event.clientY - pointerStart.y);
      if (deltaX > 6 || deltaY > 6) return;
    }
    toggleCard(recordId);
  };

  const move = (direction: -1 | 1) => {
    setStartIndex((current) => {
      if (maxStartIndex <= 0) return 0;
      if (direction < 0) return current <= 0 ? maxStartIndex : current - 1;
      return current >= maxStartIndex ? 0 : current + 1;
    });
  };

  const visibleEnd = latestRecords.length
    ? Math.min(effectiveStartIndex + visibleCount, latestRecords.length)
    : 0;

  return (
    <section ref={showcaseRef} className={[styles.showcaseModule, className].filter(Boolean).join(" ")} aria-label={labels.title}>
      <header className={styles.moduleHeader}>
        <div className={styles.headerText}>
          <h3 className={styles.moduleTitle}>{labels.title}</h3>
          {labels.subtitle ? <p className={styles.moduleSubtitle}>{labels.subtitle}</p> : null}
        </div>
        {canNavigate ? (
          <div className={styles.controls} aria-label={labels.title}>
            <button className={styles.navButton} type="button" onClick={() => move(-1)} aria-label={labels.previousRecords}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className={styles.positionLabel}>
              {effectiveStartIndex + 1}-{visibleEnd} / {latestRecords.length}
            </span>
            <button className={styles.navButton} type="button" onClick={() => move(1)} aria-label={labels.nextRecords}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </header>

      {visibleItems.length ? (
        <div
          className={styles.recordGrid}
          style={{ "--record-visible-count": visibleCount } as CSSProperties}
        >
          {visibleItems.map((record, index) => {
            const recordId = record.messageId || record.id || `${record.channelId ?? "record"}-${record.postedAt ?? index}`;
            const isFlipped = flippedIds.has(recordId);
            const artwork = artworkForRecord?.(record);
            const scope = badgeScopeFromRecord(record);
            const themeStyle = getRecordScopeThemeStyle(scope);
            const family = familyFromRecord(record);
            const Icon = iconFromRecord(record);
            const recordLabel = record.recordLabel || record.content || labels.fallbackTitle;
            const previousRecordLine = recordTimeLine(record.previousHolderDisplay, record.previousDays, labels.formatDays);
            const newRecordLine = recordTimeLine(record.holderDisplay, record.days, labels.formatDays);
            const postedDate = record.postedAt ? formatPostedDate(record.postedAt, locale) : null;

            return (
              <article
                key={recordId}
                className={styles.flipCard}
                data-flipped={isFlipped}
                style={themeStyle}
                onPointerDown={handlePointerDown}
                onClick={(event) => handleCardClick(recordId, event)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleCard(recordId);
                  }
                }}
                tabIndex={0}
                aria-label={labels.recordCard(recordLabel)}
              >
                <div className={styles.flipInner}>
                  <div className={styles.faceFront}>
                    <RecordBadge
                      label={recordLabel}
                      family={family}
                      scope={scope}
                      scopeText={scopeTextFromScope(scope, labels)}
                      token={record.recordKey ?? undefined}
                      icon={Icon}
                      artwork={artwork}
                      concept="medallion"
                      size="large"
                      scopeMode={scope.type === "class" ? "dominant" : undefined}
                      showValueFallback={false}
                      rootClassName={styles.flipBadgeFront}
                    >
                      <div className={styles.frontCopy}>
                        {previousRecordLine ? (
                          <div className={styles.frontRecordBlock}>
                            <div className={styles.frontBlockLabel}>{labels.previousRecord}</div>
                            <div className={styles.frontBlockValue}>{previousRecordLine}</div>
                          </div>
                        ) : null}
                        {newRecordLine ? (
                          <div className={styles.frontRecordBlock}>
                            <div className={styles.frontBlockLabel}>{labels.newRecord}</div>
                            <div className={styles.frontBlockValue}>{newRecordLine}</div>
                            {postedDate ? <div className={styles.frontDate}>{postedDate}</div> : null}
                          </div>
                        ) : null}
                      </div>
                    </RecordBadge>
                  </div>

                  <div className={styles.faceBack} data-family={family} data-scope={scope.type}>
                    <span className={styles.backMotif} aria-hidden="true" />
                    <div className={styles.backScrollArea}>
                      <dl className={styles.detailsList}>
                        {detailRows(record, recordLabel, scope, labels, locale).map(([label, value]) => (
                          <div key={`${recordId}-${label}`} className={styles.detailRow}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>{labels.empty}</div>
      )}
    </section>
  );
}
