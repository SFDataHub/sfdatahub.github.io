import React from "react";
import styles from "./LatestCommunityRecordsCard.module.css";
import type { DiscordRecordAnnouncementItem } from "../../pages/Home/newsFeed.types";

function formatRecordDate(timestamp: string | null | undefined): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function clampText(value: string | null | undefined, maxChars: number): string {
  const text = String(value ?? "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function joinMetaParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(" • ");
}

type LatestCommunityRecordsCardProps = {
  records?: DiscordRecordAnnouncementItem[];
};

const LatestCommunityRecordsCard: React.FC<LatestCommunityRecordsCardProps> = ({ records = [] }) => {
  const latestRecords = [...records]
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
    .slice(0, 5);

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h3 className={styles.title}>Latest Community Records</h3>
          <p className={styles.subtitle}>Live snapshot</p>
        </div>
      </header>

      <ul className={styles.list}>
        {latestRecords.map((record, idx) => {
          const titleText = clampText(
            record.recordLabel || record.content || "Record announcement",
            84,
          );
          const parsedMeta = joinMetaParts([
            record.holderDisplay,
            record.scopeLabel,
            record.server,
          ]);
          const fallbackMeta = joinMetaParts([
            record.author || "Discord",
            record.channelName || record.channelId || "Records",
          ]);
          const metaText = parsedMeta || fallbackMeta;

          const previousHolderDisplay = String(record.previousHolderDisplay ?? "").trim();
          const previousDays = String(record.previousDays ?? "").trim();
          const showPrevious = previousHolderDisplay.length > 0 && previousDays.length > 0;

          const days = String(record.days ?? "").trim();
          const hasDays = days.length > 0;

          return (
            <li className={styles.bar} key={record.messageId || record.id || `${record.channelId}-${record.postedAt}-${idx}`}>
              <span className={styles.badge} aria-hidden />

              <div className={styles.main}>
                {record.jumpUrl ? (
                  <a
                    className={styles.recordTitle}
                    href={record.jumpUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {titleText}
                  </a>
                ) : (
                  <div className={styles.recordTitle}>{titleText}</div>
                )}
                <div className={styles.meta}>{metaText}</div>
                {showPrevious && (
                  <div className={styles.previousMeta}>
                    Previous: {previousHolderDisplay} • {previousDays}d
                  </div>
                )}
              </div>

              <div className={styles.valueBlock}>
                <div className={styles.value}>{hasDays ? days : "—"}</div>
                {hasDays && <div className={styles.valueLabel}>days</div>}
                <div className={styles.date}>{formatRecordDate(record.postedAt)}</div>
              </div>
            </li>
          );
        })}
        {latestRecords.length === 0 && (
          <li className={styles.emptyState}>No record announcements yet.</li>
        )}
      </ul>
    </section>
  );
};

export default LatestCommunityRecordsCard;
