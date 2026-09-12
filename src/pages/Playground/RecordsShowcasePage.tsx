import type { ReactNode } from "react";
import ContentShell from "../../components/ContentShell";
import RecordShowcase from "../../components/ui/shared/RecordShowcase";
import type { RecordShowcaseLabels } from "../../components/ui/shared/RecordShowcase";
import SpecialAvatarArtwork from "../../components/ui/shared/SpecialAvatarArtwork";
import type { DiscordRecordAnnouncementItem } from "../Home/newsFeed.types";
import { Radar } from "lucide-react";
import styles from "./RecordsShowcasePage.module.css";

type ShowcaseRecord = DiscordRecordAnnouncementItem & {
  previewOnly?: boolean;
  artwork?: () => ReactNode;
};

const VISIBLE_RECORDS = 4;

const PLAYGROUND_LABELS: RecordShowcaseLabels = {
  title: "Community Records",
  subtitle: "Latest record holders across level, guild, class and special records.",
  empty: "No record announcements yet.",
  fallbackTitle: "Record announcement",
  previousRecord: "Previous Record",
  newRecord: "New Record",
  record: "Record",
  category: "Category",
  newRecordholder: "New Recordholder",
  server: "Server",
  postedAt: "Posted At",
  timeTaken: "Time Taken",
  previousRecordholder: "Previous Recordholder",
  previousTime: "Previous Time",
  classLabel: "Class",
  anyClass: "Any",
  guildCategory: "Guild",
  overallRecord: "Overall Record",
  classRecord: (className) => `Class Record: ${className}`,
  guildRecord: "Guild Record",
  previousRecords: "Previous records",
  nextRecords: "Next records",
  recordCard: (recordLabel) => `${recordLabel} record card`,
  formatDays: (days) => `${days} ${Number(days) === 1 ? "day" : "days"}`,
};

const SHOWCASE_RECORDS: ShowcaseRecord[] = [
  {
    id: "snapshot-level-600",
    messageId: "snapshot-level-600",
    channelId: "records-snapshot",
    channelName: "Community Records",
    postedAt: "2026-09-05T13:05:00+02:00",
    content: "BaShFX broke the record of fastest Level 600 with Mage class on server s5.sfgame.eu. It took 1155 days. Previous record was Vendetta Vulcun with 1165 days.",
    author: "Discord",
    imageUrl: null,
    jumpUrl: "",
    recordLabel: "Level 600",
    holderDisplay: "BaShFX",
    scopeLabel: "Mage class",
    server: "s5.sfgame.eu",
    days: "1155",
    previousHolderDisplay: "Vendetta Vulcun",
    previousDays: "1165",
    recordKey: "level-600__mage",
    recordFamily: "level",
  },
  {
    id: "snapshot-average-guild-level-300",
    messageId: "snapshot-average-guild-level-300",
    channelId: "records-snapshot",
    channelName: "Community Records",
    postedAt: "2026-09-01T08:34:00+02:00",
    content: "FreeDiculous broke the record of fastest Average Guild Level 300 with Guild class on server s30.sfgame.eu. It took 11 days. Previous record was The Worldguard with 22 days.",
    author: "Discord",
    imageUrl: null,
    jumpUrl: "",
    recordLabel: "Average Guild Level 300",
    holderDisplay: "FreeDiculous",
    scopeLabel: "Guild class",
    server: "s30.sfgame.eu",
    days: "11",
    previousHolderDisplay: "The Worldguard",
    previousDays: "22",
    recordKey: "average-guild-level-300__guild",
    recordFamily: "guild",
  },
  {
    id: "snapshot-level-300-battlemage",
    messageId: "snapshot-level-300-battlemage",
    channelId: "records-snapshot",
    channelName: "Community Records",
    postedAt: "2026-08-30T09:53:00+02:00",
    content: "Fluxhy broke the record of fastest Level 300 with Battlemage class on server s30.sfgame.eu. It took 10 days. Previous record was Vaaz with 11 days.",
    author: "Discord",
    imageUrl: null,
    jumpUrl: "",
    recordLabel: "Level 300",
    holderDisplay: "Fluxhy",
    scopeLabel: "Battlemage class",
    server: "s30.sfgame.eu",
    days: "10",
    previousHolderDisplay: "Vaaz",
    previousDays: "11",
    recordKey: "level-300__battlemage",
    recordFamily: "level",
  },
  {
    id: "snapshot-jack-the-hammer-battlemage",
    messageId: "snapshot-jack-the-hammer-battlemage",
    channelId: "records-snapshot",
    channelName: "Community Records",
    postedAt: "2026-08-30T09:51:00+02:00",
    content: "Rinkiari broke the record of fastest Jack the Hammerer with Battlemage class on server s30.sfgame.eu. It took 9 days. Previous record was Vaaz with 10 days.",
    author: "Discord",
    imageUrl: null,
    jumpUrl: "",
    recordLabel: "Jack the Hammerer",
    holderDisplay: "Rinkiari",
    scopeLabel: "Battlemage class",
    server: "s30.sfgame.eu",
    days: "9",
    previousHolderDisplay: "Vaaz",
    previousDays: "10",
    recordKey: "jack-the-hammerer__battlemage",
    recordFamily: null,
  },
  {
    id: "snapshot-level-300-druid",
    messageId: "snapshot-level-300-druid",
    channelId: "records-snapshot",
    channelName: "Community Records",
    postedAt: "2026-08-29T14:36:00+02:00",
    content: "Shahmen broke the record of fastest Level 300 with Druid class on server s30.sfgame.eu. It took 9 days. Previous record was Bekker with 10 days.",
    author: "Discord",
    imageUrl: null,
    jumpUrl: "",
    recordLabel: "Level 300",
    holderDisplay: "Shahmen",
    scopeLabel: "Druid class",
    server: "s30.sfgame.eu",
    days: "9",
    previousHolderDisplay: "Bekker",
    previousDays: "10",
    recordKey: "level-300__druid",
    recordFamily: "level",
  },
  {
    id: "preview-mozone-artwork",
    messageId: "preview-mozone-artwork",
    channelId: "records-showcase-preview",
    channelName: "Playground Preview",
    postedAt: "2026-08-13T12:00:00+02:00",
    content: "Separate Mozone artwork rendering sample for the badge design.",
    author: "Playground",
    imageUrl: null,
    jumpUrl: "",
    recordLabel: "Mozone Artwork Test",
    holderDisplay: "Visual Preview",
    scopeLabel: "Any class",
    server: null,
    days: null,
    previousHolderDisplay: null,
    previousDays: null,
    recordKey: "mozone-artwork-preview",
    recordFamily: "mozone",
    previewOnly: true,
    artwork: () => <SpecialAvatarArtwork special={287} label="Mozone Special Avatar" fallbackIcon={Radar} />,
  },
];

export default function RecordsShowcasePage() {
  return (
    <ContentShell
      title="Records Showcase"
      subtitle="Playground-only simulation of a future Community Records module using the global RecordBadge."
      centerFramed
    >
      <div className={styles.page}>
        <RecordShowcase
          records={SHOWCASE_RECORDS}
          labels={PLAYGROUND_LABELS}
          locale="en-GB"
          visibleRecords={VISIBLE_RECORDS}
          artworkForRecord={(record) => record.artwork?.()}
        />
      </div>
    </ContentShell>
  );
}
