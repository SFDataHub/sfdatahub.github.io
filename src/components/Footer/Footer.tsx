import { useId, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toAnalyticsPath } from "../../lib/analytics/pageViews";
import { usePublicMetrics } from "../../lib/analytics/publicMetrics";
import tiles from "../../pages/DataHub/Index.module.css";
import styles from "./Footer.module.css";

export default function Footer() {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const path = toAnalyticsPath(location.pathname, location.search, location.hash);
  const { data, error } = usePublicMetrics(path);
  const manifest = data?.manifest;
  const language = i18n.resolvedLanguage || "en";
  const numbers = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const dates = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "Europe/Berlin" });
  const berlinToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const today = ["year", "month", "day"].map(key => berlinToday.find(part => part.type === key)!.value).join("-");
  const expired = manifest && Date.now() - Date.parse(manifest.asOf) > 2 * 3600000;
  const ready = manifest?.state === "ready" && !expired;
  const rows = [
    ["websiteToday", ready && manifest.today === today ? manifest.website?.today : null],
    ["websiteTotal", ready ? manifest.website?.total : null],
    ["websiteAverage", ready ? manifest.website?.dailyAverage : null],
    ["pageToday", ready && manifest.today === today ? data?.page?.today : null],
    ["pageTotal", ready ? data?.page?.total : null],
    ["pageAverage", ready ? data?.page?.dailyAverage : null],
  ] as const;
  const stateKey = error ? "unavailable" : !manifest ? "loading" : expired ? "stale" : manifest.state;
  const formatDay = (day: string) => dates.format(new Date(day + "T12:00:00Z"));
  const asOf = manifest ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(manifest.asOf)) : "";
  return (
    <footer className={styles.footer} aria-label={t("footer.about.title")}>
      <div className={styles.surface}>
        <div className={styles.head}>
          <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)}>
            {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
            <span>{t("footer.about.title")}</span>
            <span className="sr-only">{t(open ? "footer.metrics.collapse" : "footer.metrics.expand")}</span>
          </button>
          <dl className={styles.metrics} title={t("footer.metrics.definition")}>
            {rows.map(([key, value]) => (
              <div key={key} className={`${tiles.tile} ${styles.metric}`}>
                <dt className={tiles.tileTitle}>{t(`footer.metrics.${key}`)}</dt>
                <dd className={styles.value} aria-label={value == null ? t("footer.metrics.unavailableValue") : undefined}>{value == null ? "—" : numbers.format(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className={styles.note} role="status">
          {stateKey === "ready" && manifest?.effectiveStartDate
            ? t("footer.metrics.period", { start: formatDay(manifest.effectiveStartDate), days: manifest.website?.days.length, asOf })
            : t(`footer.metrics.${stateKey}`)}
          {manifest?.state === "not_started" && manifest.effectiveStartDate ? ` ${formatDay(manifest.effectiveStartDate)} (Europe/Berlin)` : ""}
          {manifest?.startDate && manifest.effectiveStartDate && manifest.startDate < manifest.effectiveStartDate ? ` ${t("footer.metrics.limitedStart", { start: formatDay(manifest.effectiveStartDate) })}` : ""}
        </p>
        <div id={bodyId} className={styles.body} hidden={!open}>
          {t("footer.about.body").split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          <div className={styles.legal}>
            <div>{t("footer.copyright")}</div>
            <div>{t("footer.shortDisclaimer")}</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
