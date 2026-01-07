import React from "react";
import { Link } from "react-router-dom";
import styles from "./FeaturedPreviewCard.module.css";

type FeaturedPreviewCardProps = {
  href?: string;
  title: string;
  subtitle?: string;
  headerIconSrc?: string;
  headerIconAlt?: string;
  previewImageSrc: string;
  previewAlt: string;
  variant?: "icon" | "cover";
  previewHeightOverride?: string;
  className?: string;
  i18nScope?: string;
  titleI18nKey?: string;
  subtitleI18nKey?: string;
  previewAltI18nKey?: string;
  linkAriaLabel?: string;
  linkAriaI18nKey?: string;
};

const FeaturedPreviewCard: React.FC<FeaturedPreviewCardProps> = ({
  href,
  title,
  subtitle,
  headerIconSrc,
  headerIconAlt = "",
  previewImageSrc,
  previewAlt,
  variant = "icon",
  previewHeightOverride,
  className,
  i18nScope,
  titleI18nKey,
  subtitleI18nKey,
  previewAltI18nKey,
  linkAriaLabel,
  linkAriaI18nKey,
}) => {
  const cardClassName = [styles.card, className].filter(Boolean).join(" ");
  const linkHref = typeof href === "string" && href.trim() ? href : null;
  const isExternal = linkHref ? /^https?:\/\//i.test(linkHref) : false;
  const ariaLabel = linkAriaLabel || title;
  const iconDecorative = !headerIconAlt;
  const cardStyle = previewHeightOverride
    ? ({ ["--featured-preview-height-override" as any]: previewHeightOverride } as React.CSSProperties)
    : undefined;
  const previewImageClassName = [
    styles.previewImage,
    variant === "cover" ? styles.previewImageCover : styles.previewImageIcon,
  ]
    .filter(Boolean)
    .join(" ");
  const previewSurfaceClassName = [
    styles.previewSurface,
    linkHref ? styles.previewLink : styles.previewStatic,
  ]
    .filter(Boolean)
    .join(" ");
  const previewSurfaceClickable = linkHref ? "true" : "false";

  return (
    <section className={cardClassName} data-i18n-scope={i18nScope} style={cardStyle}>
      <div className={styles.previewWrap}>
        {linkHref ? (
          isExternal ? (
            <a
              href={linkHref}
              className={previewSurfaceClassName}
              aria-label={ariaLabel}
              data-i18n-aria-label={linkAriaI18nKey}
              data-clickable={previewSurfaceClickable}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={previewImageSrc}
                alt={previewAlt}
                data-i18n={previewAltI18nKey}
                className={previewImageClassName}
                loading="eager"
                decoding="async"
              />
            </a>
          ) : (
            <Link
              to={linkHref}
              className={previewSurfaceClassName}
              aria-label={ariaLabel}
              data-i18n-aria-label={linkAriaI18nKey}
              data-clickable={previewSurfaceClickable}
            >
              <img
                src={previewImageSrc}
                alt={previewAlt}
                data-i18n={previewAltI18nKey}
                className={previewImageClassName}
                loading="eager"
                decoding="async"
              />
            </Link>
          )
        ) : (
          <div className={previewSurfaceClassName} data-clickable={previewSurfaceClickable}>
            <img
              src={previewImageSrc}
              alt={previewAlt}
              data-i18n={previewAltI18nKey}
              className={previewImageClassName}
              loading="eager"
              decoding="async"
            />
          </div>
        )}
      </div>
      <header className={styles.header}>
        <div className={styles.headerGroup}>
          {headerIconSrc && (
            <img
              src={headerIconSrc}
              alt={headerIconAlt}
              className={styles.headerIcon}
              aria-hidden={iconDecorative}
            />
          )}
          <div className={styles.headerText}>
            <span className={styles.title} data-i18n={titleI18nKey}>
              {title}
            </span>
            {subtitle && (
              <span className={styles.subtitle} data-i18n={subtitleI18nKey}>
                {subtitle}
              </span>
            )}
          </div>
        </div>
      </header>
    </section>
  );
};

export default FeaturedPreviewCard;
