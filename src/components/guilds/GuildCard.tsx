import React from "react";
import { Minus } from "lucide-react";
import { SFDATAHUB_ACTION_BLUE } from "../../lib/ui/guildAccent";
import { GuildEmblemArtwork, useGuildEmblemVisual } from "./GuildEmblem";
import styles from "./GuildCard.module.css";

type GuildCardBaseProps = {
  active?: boolean;
  className?: string;
  disabled?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onClick?: () => void;
  onDragEnd?: React.DragEventHandler<HTMLButtonElement>;
  onDragStart?: React.DragEventHandler<HTMLButtonElement>;
};

export type GuildCardProps = GuildCardBaseProps & {
  kind?: "guild";
  name: string;
  server: string;
  memberCount?: number | null;
  memberLimit?: number;
  coaString?: string | null;
  emblemUrl?: string | null;
  fallbackLabel?: string;
  removeLabel?: string;
  selectLabel?: string;
  onRemove?: () => void;
};

export type AddGuildCardProps = GuildCardBaseProps & {
  kind: "add";
  label?: string;
  selectLabel?: string;
};

export type GuildCardComponentProps = GuildCardProps | AddGuildCardProps;

type GuildCardStyle = React.CSSProperties & {
  "--guild-card-accent"?: string;
};

function cx(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(" ");
}

function formatMemberCount(memberCount?: number | null, memberLimit = 50) {
  const safeCount = typeof memberCount === "number" && Number.isFinite(memberCount) ? memberCount : 0;
  return `${safeCount} / ${memberLimit}`;
}

export default function GuildCard(props: GuildCardComponentProps) {
  const isAddCard = props.kind === "add";
  const { accent: guildAccent, visualEmblemUrl } = useGuildEmblemVisual({
    coaString: isAddCard ? null : props.coaString,
    emblemUrl: isAddCard ? null : props.emblemUrl,
    name: isAddCard ? null : props.name,
  });
  const accent = isAddCard ? SFDATAHUB_ACTION_BLUE : guildAccent;
  const style: GuildCardStyle = { "--guild-card-accent": accent };
  const label = isAddCard ? props.label ?? "Gilde hinzufügen" : props.name;
  const ariaLabel =
    props.selectLabel ?? (isAddCard ? "Gilde hinzufügen" : `${props.name} aktivieren`);

  return (
    <span className={cx(styles.cardWrap, props.draggable && styles.draggable, props.dragging && styles.dragging, props.className)}>
      {!isAddCard && props.onRemove ? (
        <button
          type="button"
          className={styles.removeButton}
          draggable={false}
          aria-label={props.removeLabel ?? `${props.name} entfernen`}
          title={props.removeLabel ?? "Entfernen"}
          onDragStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            props.onRemove?.();
          }}
        >
          <Minus size={13} strokeWidth={3} aria-hidden />
        </button>
      ) : null}

      <button
        type="button"
        className={cx(styles.card, props.active && styles.active)}
        style={style}
        aria-pressed={props.active}
        aria-label={ariaLabel}
        title={isAddCard ? label : `${props.name} (${props.server})`}
        disabled={props.disabled}
        draggable={props.draggable ?? false}
        onClick={props.onClick}
        onDragEnd={props.onDragEnd}
        onDragStart={props.onDragStart}
      >
        <span className={styles.emblemZone}>
          <GuildEmblemArtwork
            kind={isAddCard ? "add" : "guild"}
            fallbackLabel={isAddCard ? undefined : props.fallbackLabel}
            visualEmblemUrl={visualEmblemUrl}
          />
        </span>

        <span className={styles.identityZone}>
          <span className={styles.name}>{label}</span>
          {!isAddCard ? <span className={styles.server}>{props.server}</span> : null}
        </span>

        <span className={styles.footerZone}>
          {!isAddCard ? (
            <span className={styles.memberCount}>{formatMemberCount(props.memberCount, props.memberLimit)}</span>
          ) : null}
        </span>
      </button>
    </span>
  );
}
