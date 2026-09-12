import { useId } from "react";
import PortraitPreview from "../../avatar/PortraitPreview";
import type { PortraitOptions } from "../../player-profile/types";
import type { LucideIcon } from "lucide-react";
import styles from "./SpecialAvatarArtwork.module.css";

type SpecialAvatarArtworkProps = {
  special: number;
  label: string;
  fallbackIcon: LucideIcon;
};

export default function SpecialAvatarArtwork({ special, label, fallbackIcon: FallbackIcon }: SpecialAvatarArtworkProps) {
  const id = useId();
  const config: Partial<PortraitOptions> = {
    special,
    background: "",
    frame: "",
    showBorder: false,
    mirrorHorizontal: true,
  };

  return (
    <span className={styles.artwork}>
      <PortraitPreview
        config={config}
        label={label}
        canvasId={`special-avatar-${id}`}
        className={styles.portrait}
        shellClassName={styles.shell}
        canvasClassName={styles.canvas}
        showStatus={false}
        fallbackNode={
          <span className={styles.fallback} aria-hidden="true">
            <FallbackIcon />
          </span>
        }
      />
    </span>
  );
}
