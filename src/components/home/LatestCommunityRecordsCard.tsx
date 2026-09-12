import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import RecordShowcase from "../ui/shared/RecordShowcase";
import type { RecordShowcaseLabels } from "../ui/shared/RecordShowcase";
import type { DiscordRecordAnnouncementItem } from "../../pages/Home/newsFeed.types";

type LatestCommunityRecordsCardProps = {
  records?: DiscordRecordAnnouncementItem[];
};

const MAX_HOME_RECORDS = 15;

function parseFiniteDayCount(days: string) {
  const parsed = Number(days);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function LatestCommunityRecordsCard({ records = [] }: LatestCommunityRecordsCardProps) {
  const { t, i18n } = useTranslation();

  const labels = useMemo<RecordShowcaseLabels>(
    () => ({
      title: t("home.records.title"),
      subtitle: t("home.records.subtitle"),
      empty: t("home.records.empty"),
      fallbackTitle: t("home.records.fallbackTitle"),
      previousRecord: t("home.records.front.previousRecord"),
      newRecord: t("home.records.front.newRecord"),
      record: t("home.records.back.record"),
      category: t("home.records.back.category"),
      newRecordholder: t("home.records.back.newRecordholder"),
      server: t("home.records.back.server"),
      postedAt: t("home.records.back.postedAt"),
      timeTaken: t("home.records.back.timeTaken"),
      previousRecordholder: t("home.records.back.previousRecordholder"),
      previousTime: t("home.records.back.previousTime"),
      classLabel: t("home.records.category.class"),
      anyClass: t("home.records.category.any"),
      guildCategory: t("home.records.category.guild"),
      overallRecord: t("home.records.scope.overallRecord"),
      classRecord: (className) => t("home.records.scope.classRecord", { className }),
      guildRecord: t("home.records.scope.guildRecord"),
      previousRecords: t("home.records.nav.previous"),
      nextRecords: t("home.records.nav.next"),
      recordCard: (recordLabel) => t("home.records.recordCardAria", { record: recordLabel }),
      formatDays: (days) => {
        const cleanDays = String(days ?? "").trim();
        const count = parseFiniteDayCount(cleanDays);
        return count == null
          ? t("home.records.daysValue", { days: cleanDays })
          : t("home.records.daysCount", { count });
      },
    }),
    [t],
  );

  return (
    <RecordShowcase
      records={records}
      labels={labels}
      locale={i18n.resolvedLanguage || i18n.language}
      visibleRecords={5}
      maxRecords={MAX_HOME_RECORDS}
    />
  );
}
