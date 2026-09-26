import type { CSSProperties } from "react";
import { resolvePotionAsset, type PotionAssetSize, type PotionAssetType } from "./potionAssets";
import styles from "./CombinedPotionIcon.module.css";

type PotionPlacement = {
  id: "left" | "center" | "right";
  type: PotionAssetType;
  size: PotionAssetSize | null;
  label: string;
  x: string;
  y: string;
  width: string;
  rotate: string;
  flipX?: boolean;
  zIndex: number;
};

export type CombinedPotionIconProps = {
  className?: string;
  size?: number | string;
  placements?: PotionPlacement[];
};

export const DEFAULT_COMBINED_POTION_PLACEMENTS: PotionPlacement[] = [
  {
    id: "center",
    type: "life",
    size: null,
    label: "Life potion",
    x: "50%",
    y: "38%",
    width: "45%",
    rotate: "0deg",
    zIndex: 3,
  },
  {
    id: "left",
    type: "strength",
    size: 25,
    label: "Strength potion",
    x: "35%",
    y: "68%",
    width: "47%",
    rotate: "-18deg",
    zIndex: 2,
  },
  {
    id: "right",
    type: "dexterity",
    size: 25,
    label: "Dexterity potion",
    x: "65%",
    y: "68%",
    width: "47%",
    rotate: "18deg",
    flipX: true,
    zIndex: 2,
  },
];

export default function CombinedPotionIcon({
  className,
  size = 320,
  placements = DEFAULT_COMBINED_POTION_PLACEMENTS,
}: CombinedPotionIconProps) {
  const rootStyle = {
    "--combined-potion-size": typeof size === "number" ? `${size}px` : size,
  } as CSSProperties;

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(" ")}
      style={rootStyle}
      role="img"
      aria-label="Combined potion icon"
    >
      {placements.map((placement) => {
        const resolved = resolvePotionAsset(placement.type, placement.size, 384);
        const itemStyle = {
          "--potion-x": placement.x,
          "--potion-y": placement.y,
          "--potion-width": placement.width,
          "--potion-rotate": placement.rotate,
          "--potion-flip-x": placement.flipX ? -1 : 1,
          "--potion-z": placement.zIndex,
        } as CSSProperties;

        if (!resolved?.asset.thumb) {
          return (
            <span
              key={placement.id}
              className={styles.fallback}
              style={itemStyle}
              data-potion-asset-key={resolved?.key ?? ""}
              aria-hidden="true"
            />
          );
        }

        return (
          <img
            key={placement.id}
            src={resolved.asset.thumb}
            alt=""
            className={styles.potion}
            style={itemStyle}
            data-potion-asset-key={resolved.key}
            draggable={false}
          />
        );
      })}
    </div>
  );
}
