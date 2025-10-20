import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./GuildMonthlyProgressTab.module.css";
import type {
  GuildMonthlyProgressData,
  TableBlock,
  TableColumn,
  TableRow,
  MonthOption,
} from "./GuildMonthlyProgressTab.types";

type Props = {
  data: GuildMonthlyProgressData;
  onMonthChange?: (monthKey: string) => void;
};

/* ====================== Helpers ====================== */

function formatNum(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "number" ? n : Number(String(n).replace(/[^\d.-]/g, ""));
  if (!isFinite(v)) return String(n);
  if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + "B";
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(2) + "K";
  return v.toLocaleString("en-US");
}

function fmtDate(dISO: string, locale = "de-DE") {
  const d = new Date(dISO);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

/* ====================== Reusable UI ====================== */

const BlockCard: React.FC<{
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  rightBadge?: React.ReactNode;
}> = ({ title, subtitle, children, rightBadge }) => (
  <section className={styles.card}>
    {(title || subtitle || rightBadge) && (
      <header className={styles.cardHeader}>
        <div className={styles.headerTitles}>
          {title && <h3 className={styles.cardTitle}>{title}</h3>}
          {subtitle && <div className={styles.cardSubtitle}>{subtitle}</div>}
        </div>
        {rightBadge && <div className={styles.headerRight}>{rightBadge}</div>}
      </header>
    )}
    <div className={styles.cardBody}>{children}</div>
  </section>
);

const DataTable: React.FC<{ block: TableBlock }> = ({ block }) => {
  const cols = block.columns;
  const rows = block.rows ?? [];
  return (
    <div className={styles.tableWrap} role="region" aria-label={block.title ?? "table"}>
      {block.title && <div className={styles.tableTitle}>{block.title}</div>}
      <table className={styles.table}>
        <thead>
          <tr>
            {cols.map((c: TableColumn) => (
              <th key={c.key} className={styles.th} style={{ width: c.width }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={styles.tdEmpty} colSpan={cols.length}>
                No data
              </td>
            </tr>
          ) : (
            rows.map((r: TableRow, i: number) => (
              <tr key={r.id ?? i}>
                {cols.map((c) => {
                  const raw = r[c.key];
                  const val =
                    typeof raw === "number" || typeof raw === "string" ? raw : "";
                  const display =
                    c.format === "num" ? formatNum(val as any) : (val as any);
                  return (
                    <td key={c.key} className={styles.td} data-align={c.align ?? "left"}>
                      {c.render ? c.render(r) : display}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {block.footer && <div className={styles.tableFooter}>{block.footer}</div>}
    </div>
  );
};

/* ====================== Custom Dropdown ====================== */

const useClickOutside = (ref: React.RefObject<HTMLElement>, onClose: () => void) => {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
};

const MonthDropdown: React.FC<{
  months?: MonthOption[];
  currentKey?: string;
  onChange?: (k: string) => void;
  fallbackDate?: string;
}> = ({ months, currentKey, onChange, fallbackDate }) => {
  const hasList = Array.isArray(months) && months.length > 0 && currentKey;
  if (!hasList) return <div className={styles.bannerSub}>{fallbackDate ?? ""}</div>;

  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useClickOutside(anchorRef, () => setOpen(false));

  const current = months!.find((m) => m.key === currentKey);
  const badge = current
    ? `${fmtDate(current.fromISO)}–${fmtDate(current.toISO)} • ${current.daysSpan}d${
        current.available ? "" : " • n/a"
      }`
    : undefined;

  return (
    <div className={styles.monthPickerWrap}>
      <div className={styles.monthPickerLabel}>Monat</div>

      <div className={styles.monthPicker} ref={anchorRef}>
        <button
          type="button"
          className={styles.monthButton}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={styles.monthButtonText}>{current?.label ?? "—"}</span>
          <svg
            className={styles.chev}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path fill="currentColor" d="M7 10l5 5 5-5z" />
          </svg>
        </button>

        {open && (
          <ul className={styles.monthList} role="listbox">
            {months!.map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  className={styles.monthOption}
                  onClick={() => {
                    setOpen(false);
                    onChange?.(m.key);
                  }}
                  role="option"
                  aria-selected={m.key === currentKey}
                >
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {badge && <span className={styles.monthBadge}>{badge}</span>}
    </div>
  );
};

/* ====================== Banner & Layout ====================== */

/** Banner: Zeile 1 = Titel mit Linien links/rechts, Zeile 2 = Dropdown darunter */
const Banner: React.FC<{
  title: string;
  monthRange?: string;
  months?: MonthOption[];
  currentMonthKey?: string;
  onMonthChange?: (k: string) => void;
}> = ({ title, monthRange, months, currentMonthKey, onMonthChange }) => (
  <div className={styles.banner}>
    <div className={styles.bannerRowTop}>
      <div className={styles.bannerStripe} />
      <div className={styles.bannerTitle}>{title}</div>
      <div className={styles.bannerStripe} />
    </div>
    <div className={styles.bannerRowBottom}>
      <MonthDropdown
        months={months}
        currentKey={currentMonthKey}
        onChange={onMonthChange}
        fallbackDate={monthRange}
      />
    </div>
  </div>
);

const EmblemPanel: React.FC<{ emblemUrl?: string; caption?: string }> = ({
  emblemUrl,
  caption,
}) => (
  <div className={styles.emblemPanel}>
    <div className={styles.emblemFrame}>
      {emblemUrl ? (
        <img src={emblemUrl} alt="Guild Emblem" className={styles.emblemImg} />
      ) : (
        <div className={styles.emblemPlaceholder}>Emblem</div>
      )}
      <div className={styles.emblemShimmer} />
    </div>
    {caption && <div className={styles.emblemCaption}>{caption}</div>}
  </div>
);

const SideImage: React.FC<{ imgUrl?: string; alt?: string }> = ({ imgUrl, alt }) => (
  <div className={styles.sideImage}>
    {imgUrl ? <img src={imgUrl} alt={alt ?? "side"} /> : <div className={styles.sideImagePh}>Image</div>}
  </div>
);

const GridRow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={`${styles.gridRow} ${className ?? ""}`}>{children}</div>;

const SectionDivider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.sectionDivider}>
    <div className={styles.sectionStripe} />
    <div className={styles.sectionTitle}>{children}</div>
    <div className={styles.sectionStripe} />
  </div>
);

/* ====================== Main ====================== */

const GuildMonthlyProgressTab: React.FC<Props> = ({ data, onMonthChange }) => {
  const { header, panels, tablesTop, tablesBottom } = data;

  return (
    <div className={styles.wrap}>
      <Banner
        title={header.title}
        monthRange={header.monthRange}
        months={header.months}
        currentMonthKey={header.currentMonthKey}
        onMonthChange={onMonthChange}
      />

      <GridRow>
        <SideImage imgUrl={panels?.leftImageUrl} alt="left" />
        <EmblemPanel emblemUrl={header.emblemUrl} caption={header.centerCaption} />
        <SideImage imgUrl={panels?.rightImageUrl} alt="right" />
      </GridRow>

      <GridRow>
        {tablesTop.map((block, idx) => (
          <BlockCard key={idx} title={block.title} subtitle={block.subtitle}>
            <DataTable block={block} />
          </BlockCard>
        ))}
      </GridRow>

      <SectionDivider>Guild Overview</SectionDivider>

      <GridRow className={styles.gridRowBottom}>
        {tablesBottom.map((block, idx) => (
          <BlockCard key={idx} title={block.title} subtitle={block.subtitle}>
            <DataTable block={block} />
          </BlockCard>
        ))}
      </GridRow>
    </div>
  );
};

export default GuildMonthlyProgressTab;
