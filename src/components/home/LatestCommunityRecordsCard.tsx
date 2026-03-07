import React from "react";
import { useTranslation } from "react-i18next";
import styles from "./LatestCommunityRecordsCard.module.css";
import type { DiscordRecordAnnouncementItem } from "../../pages/Home/newsFeed.types";
import { guideAssetUrlByKey } from "../../data/guidehub/assets";
import { getClassIconUrl } from "../ui/shared/classIcons";

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

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function scopeToClassLabel(scopeLabel: string | null | undefined): string | null {
  const scope = String(scopeLabel ?? "").trim();
  if (!scope) return null;
  const lower = scope.toLowerCase();
  if (lower.endsWith(" class")) {
    return scope.slice(0, Math.max(0, scope.length - " class".length)).trim() || null;
  }
  return scope;
}

function resolveRecordIconUrl(record: DiscordRecordAnnouncementItem): string | null {
  const family = normalizeToken(record.recordFamily);
  const key = normalizeToken(record.recordKey);
  const label = normalizeToken(record.recordLabel);
  const token = `${family} ${key} ${label}`;

  const candidates: string[] = [];

  if (token.includes("goldpit")) {
    candidates.push("goldpitgif");
  } else if (token.includes("mine")) {
    candidates.push("gemminegif");
  }
  if (token.includes("fortress")) candidates.push("fortressgif");
  if (token.includes("hallofknights") || token.includes("knighthall")) candidates.push("fortificationgif");
  if (token.includes("raid") || family === "guild" || token.includes("averageguildlevel")) {
    candidates.push("guildskillcost");
  }
  if (family === "level" || token.includes("level")) {
    candidates.push("levelzweibiszweihundert");
  }
  if (token.includes("demonportal")) {
    candidates.push("uwgategif");
  }

  for (const keyCandidate of candidates) {
    const url = guideAssetUrlByKey(keyCandidate, 96);
    if (url) return url;
  }
  return null;
}

function recordIconFallback(record: DiscordRecordAnnouncementItem): string {
  const key = normalizeToken(record.recordKey);
  if (key.startsWith("level")) return "Lv";
  if (key.includes("fortress")) return "Fo";
  if (key.includes("mine")) return "Mi";
  if (key.includes("goldpit")) return "GP";
  if (key.includes("raid")) return "Ra";
  return "R";
}

type LatestCommunityRecordsCardProps = {
  records?: DiscordRecordAnnouncementItem[];
};

const LatestCommunityRecordsCard: React.FC<LatestCommunityRecordsCardProps> = ({ records = [] }) => {
  const { t } = useTranslation();
  const latestRecords = [...records]
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
    .slice(0, 5);

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h3 className={styles.title} data-i18n="home.records.title">{t("home.records.title")}</h3>
          <p className={styles.subtitle} data-i18n="home.records.subtitle">{t("home.records.subtitle")}</p>
        </div>
      </header>

      <ul className={styles.list}>
        {latestRecords.map((record, idx) => {
          const titleText = clampText(
            record.recordLabel || record.content || t("home.records.fallbackTitle"),
            84,
          );
          const scopeClassLabel = scopeToClassLabel(record.scopeLabel);
          const classIconUrl = scopeClassLabel ? getClassIconUrl(scopeClassLabel, 40) : undefined;
          const parsedMetaHolder = String(record.holderDisplay ?? "").trim();
          const parsedMetaServer = String(record.server ?? "").trim();
          const parsedScopeLabel = String(record.scopeLabel ?? "").trim();
          const fallbackMeta = joinMetaParts([
            record.author || t("home.records.fallbackAuthor"),
            record.channelName || record.channelId || t("home.records.fallbackChannel"),
          ]);
          const hasParsedMeta = Boolean(parsedMetaHolder || parsedScopeLabel || parsedMetaServer);
          const recordIconUrl = resolveRecordIconUrl(record);
          const recordIconText = recordIconFallback(record);

          const previousHolderDisplay = String(record.previousHolderDisplay ?? "").trim();
          const previousDays = String(record.previousDays ?? "").trim();
          const showPrevious = previousHolderDisplay.length > 0 && previousDays.length > 0;

          const days = String(record.days ?? "").trim();
          const hasDays = days.length > 0;

          return (
            <li className={styles.bar} key={record.messageId || record.id || `${record.channelId}-${record.postedAt}-${idx}`}>
              <span className={styles.badge} aria-hidden>
                {recordIconUrl ? (
                  <img src={recordIconUrl} alt="" className={styles.badgeImage} loading="lazy" decoding="async" />
                ) : (
                  <span className={styles.badgeFallback}>{recordIconText}</span>
                )}
              </span>

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
                <div className={styles.meta}>
                  {hasParsedMeta ? (
                    <>
                      {parsedMetaHolder && <span>{parsedMetaHolder}</span>}
                      {parsedMetaHolder && (parsedScopeLabel || parsedMetaServer) && (
                        <span className={styles.metaSeparator}>•</span>
                      )}
                      {parsedScopeLabel && (
                        <span className={styles.scopeMeta}>
                          {classIconUrl && (
                            <img
                              src={classIconUrl}
                              alt=""
                              className={styles.scopeIcon}
                              loading="lazy"
                              decoding="async"
                            />
                          )}
                          <span>{parsedScopeLabel}</span>
                        </span>
                      )}
                      {parsedScopeLabel && parsedMetaServer && (
                        <span className={styles.metaSeparator}>•</span>
                      )}
                      {parsedMetaServer && <span>{parsedMetaServer}</span>}
                    </>
                  ) : (
                    fallbackMeta
                  )}
                </div>
                {showPrevious && (
                  <div className={styles.previousMeta}>
                    {t("home.records.previous", {
                      holder: previousHolderDisplay,
                      days: previousDays,
                    })}
                  </div>
                )}
              </div>

              <div className={styles.valueBlock}>
                <div className={styles.value}>{hasDays ? days : "—"}</div>
                {hasDays && (
                  <div className={styles.valueLabel} data-i18n="home.records.daysLabel">
                    {t("home.records.daysLabel")}
                  </div>
                )}
                <div className={styles.date}>{formatRecordDate(record.postedAt)}</div>
              </div>
            </li>
          );
        })}
        {latestRecords.length === 0 && (
          <li className={styles.emptyState} data-i18n="home.records.empty">{t("home.records.empty")}</li>
        )}
      </ul>
    </section>
  );
};

export default LatestCommunityRecordsCard;
