import React, { useEffect, useRef, useState } from "react";
import styles from "./GuildMonthlyProgressTab.module.css";
import { formatScanDateTimeLabel } from "../../../../lib/ui/formatScanDateTimeLabel";
import GuildMonthlyProgressPngExportButton from "./GuildMonthlyProgressPngExportButton";
import GuildMonthlyProgressExportView from "./GuildMonthlyProgressExportView";
import GuildMonthlyProgressHudBarList from "./GuildMonthlyProgressHudBarList";
import type {
  GuildMonthlyProgressData,
  MonthOption,
  TableBlock,
} from "./GuildMonthlyProgressTab.types";

type Props = {
  data: GuildMonthlyProgressData;
  onMonthChange?: (monthKey: string) => void;
};

function fmtDate(dISO: string) {
  return formatScanDateTimeLabel(dISO);
}

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
  const groups = (block.groups ?? []).filter((group) => (group.rows ?? []).length > 0);
  const hasRows = (block.rows ?? []).length > 0;
  const scopeBase = block.title ?? "hud";
  return (
    <div className={styles.tableWrap} role="region" aria-label={block.title ?? "table"}>
      {groups.length > 0 ? (
        <div className={styles.groupList}>
          {groups.map((group) => (
            <section key={group.key} className={styles.groupBlock}>
              <header className={styles.groupHeader}>
                <span className={styles.groupTitle}>{group.label}</span>
                {group.subtitle ? <span className={styles.groupSubtitle}>{group.subtitle}</span> : null}
              </header>
              <GuildMonthlyProgressHudBarList
                columns={block.columns}
                rows={group.rows ?? []}
                scopeKey={`${scopeBase}-${group.key}`}
              />
            </section>
          ))}
        </div>
      ) : hasRows ? (
        <GuildMonthlyProgressHudBarList
          columns={block.columns}
          rows={block.rows ?? []}
          scopeKey={scopeBase}
        />
      ) : (
        <div className={styles.hudNoData}>No data</div>
      )}
      {block.footer && <div className={styles.tableFooter}>{block.footer}</div>}
    </div>
  );
};

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
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useClickOutside(anchorRef, () => setOpen(false));
  const list = months ?? [];
  const hasList = Boolean(currentKey && list.length > 0);

  useEffect(() => {
    if (!hasList && open) setOpen(false);
  }, [hasList, open]);

  if (!hasList) return <div className={styles.bannerSub}>{fallbackDate ?? ""}</div>;

  const current = list.find((m) => m.key === currentKey);
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
          <svg className={styles.chev} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M7 10l5 5 5-5z" />
          </svg>
        </button>

        {open && (
          <ul className={styles.monthList} role="listbox">
            {list.map((m) => (
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

const EmblemPanel: React.FC<{ emblemUrl?: string }> = ({ emblemUrl }) => (
  <div className={styles.emblemPanel}>
    <div className={styles.emblemFrame}>
      {emblemUrl ? (
        <img
          src={emblemUrl}
          alt="Guild Emblem"
          className={styles.emblemImg}
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="sync"
        />
      ) : (
        <div className={styles.emblemPlaceholder}>Emblem</div>
      )}
      <div className={styles.emblemShimmer} />
    </div>
  </div>
);

const SectionDivider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.sectionDivider}>
    <div className={styles.sectionStripe} />
    <div className={styles.sectionTitle}>{children}</div>
    <div className={styles.sectionStripe} />
  </div>
);

const GuildMonthlyProgressTab: React.FC<Props> = ({ data, onMonthChange }) => {
  const { header, topRow, sections } = data;
  const exportCardRef = useRef<HTMLDivElement>(null);
  const exportRootIdRef = useRef(`monthly-progress-export-${Math.random().toString(36).slice(2, 10)}`);
  const exportRootId = exportRootIdRef.current;

  return (
    <div className={styles.exportShell}>
      <div className={styles.exportToolbar}>
        <GuildMonthlyProgressPngExportButton
          targetRef={exportCardRef}
          fileBaseName={`${header.title ?? "guild-monthly-progress"}-${header.currentMonthKey ?? "latest"}`}
          exportRootId={exportRootId}
        />
      </div>

      <GuildMonthlyProgressExportView exportRef={exportCardRef} exportRootId={exportRootId}>
        <Banner
          title={header.title}
          monthRange={header.monthRange}
          months={header.months}
          currentMonthKey={header.currentMonthKey}
          onMonthChange={onMonthChange}
        />

        <div className={styles.topRow}>
          <BlockCard title={topRow.xpBlock.title} subtitle={topRow.xpBlock.subtitle}>
            <DataTable block={topRow.xpBlock} />
          </BlockCard>

          <EmblemPanel emblemUrl={header.emblemUrl} />

          <BlockCard
            title={topRow.rightPlaceholder?.title}
            subtitle={topRow.rightPlaceholder?.subtitle}
          >
            <div className={styles.placeholderPanel}>{topRow.rightPlaceholder?.body ?? " "}</div>
          </BlockCard>
        </div>

        <SectionDivider>Most Base Stats gained</SectionDivider>
        <div className={styles.sectionGrid}>
          {sections.mostBaseStatsGained.map((block, idx) => (
            <BlockCard key={`most-${idx}`} title={block.title} subtitle={block.subtitle}>
              <DataTable block={block} />
            </BlockCard>
          ))}
        </div>

        <SectionDivider>Highest Base Stats</SectionDivider>
        <div className={styles.sectionGrid}>
          {sections.highestBaseStats.map((block, idx) => (
            <BlockCard key={`high-${idx}`} title={block.title} subtitle={block.subtitle}>
              <DataTable block={block} />
            </BlockCard>
          ))}
        </div>
      </GuildMonthlyProgressExportView>
    </div>
  );
};

export default GuildMonthlyProgressTab;
