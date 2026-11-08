import React from "react";
import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import PortraitPreview from "../../components/avatar/PortraitPreview";
import { useGuildEmblemVisual } from "../../components/guilds/GuildEmblem";
import { getClassIconUrl } from "../../components/ui/shared/classIcons";
import { getClassMetaById } from "../../data/classes";
import { searchClassId, type HubSearchAppearance } from "../../lib/data-hub/hubSearchAppearance";
import styles from "./HubSearchDropdown.module.css";

export default function SearchArtwork({ kind, name, appearance, archiveClassId }: { kind: "player" | "guild"; name: string; appearance?: HubSearchAppearance; archiveClassId?: unknown }) {
  const { t } = useTranslation();
  const canvasId = React.useId();
  const { visualEmblemUrl } = useGuildEmblemVisual({ coaString: kind === "guild" ? appearance?.coaString : null, name });
  const meta = getClassMetaById(appearance?.classId ?? searchClassId(archiveClassId));
  const icon = getClassIconUrl(meta?.label, 64);
  const [failedIcon, setFailedIcon] = React.useState<string>();
  return <span className={styles.artwork} data-search-artwork={kind}>
    {kind === "guild" ? visualEmblemUrl ? <img src={visualEmblemUrl} alt="" className={styles.emblem} data-search-coa loading="lazy" />
      : <span className={styles.fallback} data-search-coa-fallback>G</span>
      : <>
        <PortraitPreview config={appearance?.portrait ?? undefined} label={name} showStatus={false} canvasId={`hub-search-${canvasId}`}
          className={styles.portrait} shellClassName={styles.portraitShell} canvasClassName={styles.portraitCanvas}
          fallbackNode={<span className={styles.fallback} data-search-portrait-fallback><UserRound size={24} aria-hidden /></span>} />
        <span className={styles.classIcon}>{icon && failedIcon !== icon ? <img src={icon} alt={meta ? t(`toplists.classes.${meta.key}`, { defaultValue: meta.label }) : ""} data-search-class={meta?.id} loading="lazy" onError={() => setFailedIcon(icon)} /> : <span aria-label="?">?</span>}</span>
      </>}
  </span>;
}

