import React from "react";
import ContentShell from "../../components/ContentShell";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./Waitlist.module.css";
import {
  WaitlistApplicant,
  WaitlistFilterState,
  WaitlistStatus,
  CLASS_OPTIONS,
  SERVER_OPTIONS,
  STATUS_LABELS,
  FRESHNESS_DISPLAY,
  DEFAULT_FILTERS,
  SAMPLE_APPLICANTS,
  sanitizeFilters,
  applyFilters,
  sortApplicants,
  paginate,
  formatDate,
  formatRelative,
  computeFreshness,
} from "./waitlistData";

export default function GuildHubWaitlist() {
  const [items, setItems] = React.useState<WaitlistApplicant[]>(SAMPLE_APPLICANTS);

  const [appliedFilters, setAppliedFilters] =
    React.useState<WaitlistFilterState>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = React.useState<WaitlistFilterState>(DEFAULT_FILTERS);

  const debouncedQuery = useDebouncedValue(appliedFilters.q, 300);
  const filtered = React.useMemo(() => {
    const scoped = applyFilters(items, appliedFilters, debouncedQuery);
    return sortApplicants(scoped, appliedFilters.sort, appliedFilters.dir);
  }, [items, appliedFilters, debouncedQuery]);

  const paginated = React.useMemo(
    () => paginate(filtered, appliedFilters.page, appliedFilters.pageSize),
    [filtered, appliedFilters.page, appliedFilters.pageSize],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / appliedFilters.pageSize));

  const isMdUp = useMediaQuery("(min-width: 768px)");
  const isLgUp = useMediaQuery("(min-width: 1024px)");

  const [isFilterSheetOpen, setFilterSheetOpen] = React.useState(false);

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const detailItem = items.find((entry) => entry.id === detailId) ?? null;
  const detailRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(detailRef, !!detailItem && !isLgUp);

  const [formItem, setFormItem] = React.useState<WaitlistApplicant | null>(null);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  useFocusTrap(formRef, isFormOpen);

  const freshnessMeta = React.useMemo(() => computeFreshness(items), [items]);
  const countdown =
    freshnessMeta && freshnessMeta.lastScanAt
      ? formatRelative(freshnessMeta.lastScanAt)
      : "unbekannt";

  const applyFilterState = (next: WaitlistFilterState) => {
    const sanitized = sanitizeFilters(next);
    setAppliedFilters(sanitized);
    setDraftFilters(sanitized);
  };

  const handleInlineChange = <K extends keyof WaitlistFilterState>(
    key: K,
    value: WaitlistFilterState[K],
  ) => {
    const next = sanitizeFilters({
      ...appliedFilters,
      [key]: value,
      page: key === "page" ? (value as number) : 1,
    });
    applyFilterState(next);
  };

  const handleSheetApply = () => {
    applyFilterState(draftFilters);
    setFilterSheetOpen(false);
  };

  const handleSheetReset = () => {
    applyFilterState(DEFAULT_FILTERS);
    setFilterSheetOpen(false);
  };

  const updateStatus = (id: string, status: WaitlistStatus) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item,
      ),
    );
  };

  const handleFormSubmit = (payload: WaitlistApplicant) => {
    setItems((prev) => {
      const exists = prev.some((item) => item.id === payload.id);
      if (exists) {
        return prev.map((item) => (item.id === payload.id ? payload : item));
      }
      return [payload, ...prev];
    });
    setFormOpen(false);
  };

  return (
    <ContentShell title="Guild Hub" subtitle="Waitlist" centerFramed={false}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerStack}>
            <div>
              <p className={styles.kicker}>Recruiting</p>
              <h1 className={styles.title}>Waitlist</h1>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => {
                  setFormItem(null);
                  setFormOpen(true);
                }}
              >
                Neuer Eintrag
              </button>
              {!isMdUp && (
                <button
                  type="button"
                  className={styles.secondaryAction}
                  aria-label="Filter oeffnen"
                  onClick={() => setFilterSheetOpen(true)}
                >
                  Filter
                </button>
              )}
            </div>
          </div>

          <div className={styles.infoStrip}>
            <InfoPill label="Neu" value={filtered.filter((item) => item.status === "new").length} />
            <InfoPill
              label="In Review"
              value={filtered.filter((item) => item.status === "in_review").length}
            />
            <InfoPill
              label="Zugesagt"
              value={filtered.filter((item) => item.status === "accepted").length}
            />
            {freshnessMeta && (
              <FreshnessBadge
                label={FRESHNESS_DISPLAY[freshnessMeta.freshness]}
                updatedAt={freshnessMeta.lastScanAt}
                countdown={countdown}
              />
            )}
          </div>
        </header>

        <section className={styles.filterToolbar}>
          {isMdUp ? (
            <InlineFilters
              filters={appliedFilters}
              onChange={handleInlineChange}
              onToggleClass={(value) => {
                const next = appliedFilters.classes.includes(value)
                  ? appliedFilters.classes.filter((entry) => entry !== value)
                  : [...appliedFilters.classes, value];
                handleInlineChange("classes", next);
              }}
              onToggleServer={(value) => {
                const next = appliedFilters.servers.includes(value)
                  ? appliedFilters.servers.filter((entry) => entry !== value)
                  : [...appliedFilters.servers, value];
                handleInlineChange("servers", next);
              }}
            />
          ) : (
            <button
              type="button"
              className={styles.filterSheetButton}
              onClick={() => setFilterSheetOpen(true)}
            >
              Filter & Sortierung
            </button>
          )}
        </section>

        <section className={styles.listBody}>
          {isMdUp ? (
            <WaitlistTable
              items={paginated}
              sort={appliedFilters.sort}
              dir={appliedFilters.dir}
              onSortChange={(key) => {
                const dir =
                  appliedFilters.sort === key && appliedFilters.dir === "asc" ? "desc" : "asc";
                handleInlineChange("sort", key);
                handleInlineChange("dir", dir as WaitlistFilterState["dir"]);
              }}
              onSelect={setDetailId}
              onStatusChange={updateStatus}
            />
          ) : (
            <WaitlistCards
              items={paginated}
              onSelect={setDetailId}
              onStatusChange={updateStatus}
            />
          )}
        </section>

        <Pagination
          page={appliedFilters.page}
          totalPages={totalPages}
          onChange={(page) => handleInlineChange("page", page)}
        />
      </div>

      {isFilterSheetOpen && (
        <FilterSheet
          filters={draftFilters}
          onChange={setDraftFilters}
          onToggleClass={(value) =>
            setDraftFilters((prev) => ({
              ...prev,
              classes: prev.classes.includes(value)
                ? prev.classes.filter((entry) => entry !== value)
                : [...prev.classes, value],
            }))
          }
          onToggleServer={(value) =>
            setDraftFilters((prev) => ({
              ...prev,
              servers: prev.servers.includes(value)
                ? prev.servers.filter((entry) => entry !== value)
                : [...prev.servers, value],
            }))
          }
          onClose={() => setFilterSheetOpen(false)}
          onApply={handleSheetApply}
          onReset={handleSheetReset}
        />
      )}

      {detailItem && (
        <DetailPanel
          ref={detailRef}
          item={detailItem}
          mode={isLgUp ? "drawer" : "modal"}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setFormItem(detailItem);
            setFormOpen(true);
            setDetailId(null);
          }}
        />
      )}

      {isFormOpen && (
        <WaitlistForm
          ref={formRef}
          item={formItem}
          entries={items}
          onClose={() => setFormOpen(false)}
          onSubmit={handleFormSubmit}
        />
      )}
    </ContentShell>
  );
}

function InfoPill({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.infoPill}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FreshnessBadge({
  label,
  updatedAt,
  countdown,
}: {
  label: string;
  updatedAt: string;
  countdown: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={styles.freshnessWrapper}>
      <button
        type="button"
        className={styles.freshnessBadge}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className={styles.popover}>
          <div>
            <span className={styles.popoverLabel}>Letzter Scan</span>
            <strong>{formatDate(updatedAt)}</strong>
          </div>
          <div>
            <span className={styles.popoverLabel}>Aktualisiert</span>
            <strong>{countdown}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

type InlineFiltersProps = {
  filters: WaitlistFilterState;
  onChange: <K extends keyof WaitlistFilterState>(key: K, value: WaitlistFilterState[K]) => void;
  onToggleClass: (value: string) => void;
  onToggleServer: (value: string) => void;
};

function InlineFilters({ filters, onChange, onToggleClass, onToggleServer }: InlineFiltersProps) {
  return (
    <div className={styles.inlineFilters}>
      <input
        type="search"
        name="waitlistSearch"
        aria-label="Waitlist Suche"
        className={styles.searchInput}
        placeholder="Suchen..."
        value={filters.q}
        onChange={(event) => onChange("q", event.target.value)}
      />
      <select
        name="waitlistStatus"
        aria-label="Waitlist Status"
        className={styles.select}
        value={filters.status}
        onChange={(event) => onChange("status", event.target.value as WaitlistFilterState["status"])}
      >
        <option value="all">Status (alle)</option>
        <option value="new">Neu</option>
        <option value="in_review">In Review</option>
        <option value="accepted">Zugesagt</option>
        <option value="declined">Abgelehnt</option>
        <option value="withdrawn">Zurueckgezogen</option>
      </select>

      <div className={styles.chipGroup}>
        {CLASS_OPTIONS.map((option) => {
          const active = filters.classes.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ""}`}
              onClick={() => onToggleClass(option)}
            >
              {option}
            </button>
          );
        })}
      </div>

      <div className={styles.chipGroup}>
        {SERVER_OPTIONS.map((option) => {
          const active = filters.servers.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ""}`}
              onClick={() => onToggleServer(option)}
            >
              {option}
            </button>
          );
        })}
      </div>

      <div className={styles.levelRow}>
        <label>
          Lv min
          <input
            type="number"
            name="waitlistLvMin"
            aria-label="Level Minimum"
            value={filters.lvMin}
            min={1}
            max={filters.lvMax}
            onChange={(event) => onChange("lvMin", Number(event.target.value))}
          />
        </label>
        <label>
          Lv max
          <input
            type="number"
            name="waitlistLvMax"
            aria-label="Level Maximum"
            value={filters.lvMax}
            min={filters.lvMin}
            max={200}
            onChange={(event) => onChange("lvMax", Number(event.target.value))}
          />
        </label>
      </div>

      <div className={styles.sortControls}>
        <label className={styles.sortLabel}>Sortieren</label>
        <select
          value={filters.sort}
          name="waitlistSort"
          aria-label="Sortierung"
          onChange={(event) =>
            onChange("sort", event.target.value as WaitlistFilterState["sort"])
          }
        >
          <option value="name">Name</option>
          <option value="level">Level</option>
          <option value="status">Status</option>
          <option value="lastScan">Letzter Scan</option>
          <option value="updatedAt">Aktualisiert</option>
        </select>
        <button
          type="button"
          className={styles.directionButton}
          onClick={() => onChange("dir", filters.dir === "asc" ? "desc" : "asc")}
        >
          {filters.dir === "asc" ? "ASC" : "DESC"}
        </button>
      </div>
    </div>
  );
}

type TableProps = {
  items: WaitlistApplicant[];
  sort: WaitlistFilterState["sort"];
  dir: WaitlistFilterState["dir"];
  onSortChange: (key: WaitlistFilterState["sort"]) => void;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: WaitlistStatus) => void;
};

function WaitlistTable({ items, sort, dir, onSortChange, onSelect, onStatusChange }: TableProps) {
  const indicator = (key: WaitlistFilterState["sort"]) =>
    sort === key ? (dir === "asc" ? " ▲" : " ▼") : "";

  if (!items.length) return <EmptyState />;

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.stickyColumn} onClick={() => onSortChange("name")}>
              Name{indicator("name")}
            </th>
            <th>Klasse</th>
            <th onClick={() => onSortChange("level")}>Level{indicator("level")}</th>
            <th>Server</th>
            <th onClick={() => onSortChange("status")}>Status{indicator("status")}</th>
            <th>Notizen</th>
            <th onClick={() => onSortChange("lastScan")}>Letzter Scan{indicator("lastScan")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className={styles.stickyColumn}>
                <button type="button" className={styles.rowButton} onClick={() => onSelect(item.id)}>
                  {item.name}
                </button>
              </td>
              <td>{item.classRole}</td>
              <td>{item.level}</td>
              <td>{item.server}</td>
              <td>
                <select
                  className={styles.statusSelect}
                  name={`waitlistStatus-${item.id}`}
                  aria-label={`Status fuer ${item.name}`}
                  value={item.status}
                  onChange={(event) => onStatusChange(item.id, event.target.value as WaitlistStatus)}
                >
                  <option value="new">Neu</option>
                  <option value="in_review">In Review</option>
                  <option value="accepted">Zugesagt</option>
                  <option value="declined">Abgelehnt</option>
                  <option value="withdrawn">Zurueckgezogen</option>
                </select>
              </td>
              <td>{item.notes.slice(0, 64)}...</td>
              <td>
                <span className={styles.scanBadge}>{FRESHNESS_DISPLAY[item.freshness]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CardProps = {
  items: WaitlistApplicant[];
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: WaitlistStatus) => void;
};

function WaitlistCards({ items, onSelect, onStatusChange }: CardProps) {
  if (!items.length) return <EmptyState />;

  return (
    <div className={styles.cardList}>
      {items.map((item) => (
        <article key={item.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <button type="button" className={styles.cardTitle} onClick={() => onSelect(item.id)}>
                {item.name}
              </button>
              <p className={styles.cardMeta}>
                {item.classRole} - Lv {item.level} - {item.server}
              </p>
            </div>
            <span className={styles.scanBadge}>{FRESHNESS_DISPLAY[item.freshness]}</span>
          </div>
          <p className={styles.cardNotes}>{item.notes.slice(0, 160)}...</p>
          <div className={styles.cardFooter}>
            <select
              className={styles.statusSelect}
              name={`waitlistStatusCard-${item.id}`}
              aria-label={`Status fuer ${item.name}`}
              value={item.status}
              onChange={(event) => onStatusChange(item.id, event.target.value as WaitlistStatus)}
            >
              <option value="new">Neu</option>
              <option value="in_review">In Review</option>
              <option value="accepted">Zugesagt</option>
              <option value="declined">Abgelehnt</option>
              <option value="withdrawn">Zurueckgezogen</option>
            </select>
            <button type="button" className={styles.secondaryAction} onClick={() => onSelect(item.id)}>
              Details
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <p>Keine Eintraege fuer die aktuellen Filter.</p>
    </div>
  );
}

type FilterSheetProps = {
  filters: WaitlistFilterState;
  onChange: React.Dispatch<React.SetStateAction<WaitlistFilterState>>;
  onToggleClass: (value: string) => void;
  onToggleServer: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
};

function FilterSheet({
  filters,
  onChange,
  onToggleClass,
  onToggleServer,
  onClose,
  onApply,
  onReset,
}: FilterSheetProps) {
  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
        <div className={styles.sheetHandle} />
        <div className={styles.sheetBody}>
          <h2>Filter</h2>
          <label className={styles.sheetLabel}>
            Suche
            <input
              type="search"
              name="waitlistSheetSearch"
              aria-label="Waitlist Suche"
              value={filters.q}
              onChange={(event) => onChange((prev) => ({ ...prev, q: event.target.value }))}
            />
          </label>
          <label className={styles.sheetLabel}>
            Status
            <select
              name="waitlistSheetStatus"
              aria-label="Waitlist Status"
              value={filters.status}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, status: event.target.value as WaitlistFilterState["status"] }))
              }
            >
              <option value="all">Alle</option>
              <option value="new">Neu</option>
              <option value="in_review">In Review</option>
              <option value="accepted">Zugesagt</option>
              <option value="declined">Abgelehnt</option>
              <option value="withdrawn">Zurueckgezogen</option>
            </select>
          </label>
          <div className={styles.sheetLabel}>
            Klassen
            <div className={styles.chipGroup}>
              {CLASS_OPTIONS.map((option) => {
                const active = filters.classes.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                  className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                  aria-label={`Klasse ${option}`}
                  onClick={() => onToggleClass(option)}
                >
                  {option}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={styles.sheetLabel}>
            Server
            <div className={styles.chipGroup}>
              {SERVER_OPTIONS.map((option) => {
                const active = filters.servers.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                  className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                  aria-label={`Server ${option}`}
                  onClick={() => onToggleServer(option)}
                >
                  {option}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={styles.levelRow}>
            <label>
              Lv min
              <input
                type="number"
                name="waitlistSheetLvMin"
                aria-label="Level Minimum"
                value={filters.lvMin}
                onChange={(event) =>
                  onChange((prev) => ({ ...prev, lvMin: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              Lv max
              <input
                type="number"
                name="waitlistSheetLvMax"
                aria-label="Level Maximum"
                value={filters.lvMax}
                onChange={(event) =>
                  onChange((prev) => ({ ...prev, lvMax: Number(event.target.value) }))
                }
              />
            </label>
          </div>
        </div>
        <div className={styles.sheetActions}>
          <button type="button" onClick={onReset}>
            Zuruecksetzen
          </button>
          <button type="button" className={styles.primaryAction} onClick={onApply}>
            Anwenden
          </button>
        </div>
      </div>
    </div>
  );
}

type DetailProps = {
  item: WaitlistApplicant;
  mode: "drawer" | "modal";
  onClose: () => void;
  onEdit: () => void;
};

const DetailPanel = React.forwardRef<HTMLDivElement, DetailProps>(
  ({ item, mode, onClose, onEdit }, ref) => (
    <div className={styles.overlay}>
      <div ref={ref} className={`${styles.panel} ${mode === "drawer" ? styles.drawer : styles.modal}`}>
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.cardMeta}>
              {item.classRole} - Lv {item.level} - {item.server}
            </p>
            <h2>{item.name}</h2>
          </div>
          <button type="button" className={styles.secondaryAction} onClick={onClose}>
            Schliessen
          </button>
        </header>

        <section className={styles.section}>
          <h3>Kontakt</h3>
          <p>{item.contact}</p>
          <p>Quelle: {item.source}</p>
        </section>

        <section className={styles.section}>
          <h3>Notizen</h3>
          <p>{item.notes}</p>
        </section>

        <section className={styles.section}>
          <h3>Tags</h3>
          <div className={styles.tagRow}>
            {item.tags.length ? item.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>Keine</span>}
          </div>
        </section>

        <section className={styles.section}>
          <h3>Historie</h3>
          <ul className={styles.historyList}>
            {item.history.map((entry) => (
              <li key={`${entry.date}-${entry.message}`}>
                <span>{formatDate(entry.date)}</span>
                <p>{entry.message}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h3>Scan-Infos</h3>
          <p>Letzter Scan: {formatDate(item.lastScanAt)}</p>
          <p>Aktualisiert: {formatDate(item.updatedAt)}</p>
        </section>

        <footer className={styles.panelFooter}>
          <button type="button" className={styles.secondaryAction} onClick={onEdit}>
            Bearbeiten
          </button>
          <button type="button" className={styles.primaryAction} onClick={onClose}>
            Schliessen
          </button>
        </footer>
      </div>
    </div>
  ),
);

DetailPanel.displayName = "DetailPanel";

type FormProps = {
  item: WaitlistApplicant | null;
  entries: WaitlistApplicant[];
  onClose: () => void;
  onSubmit: (item: WaitlistApplicant) => void;
};

const WaitlistForm = React.forwardRef<HTMLFormElement, FormProps>(
  ({ item, entries, onClose, onSubmit }, ref) => {
    const [state, setState] = React.useState<WaitlistApplicant>(() =>
      item ?? {
        id: `wl-${Date.now()}`,
        name: "",
        classRole: CLASS_OPTIONS[0],
        level: 1,
        server: SERVER_OPTIONS[0],
        status: "new",
        notes: "",
        contact: "",
        source: "",
        tags: [],
        lastScanAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        freshness: "unknown",
        history: [],
      },
    );

    React.useEffect(() => {
      if (item) setState(item);
    }, [JSON.stringify(item)]);

    const handleSubmit = (event: React.FormEvent) => {
      event.preventDefault();
      onSubmit({ ...state, updatedAt: new Date().toISOString() });
    };

    const duplicateWarning = entries.some(
      (entry) =>
        entry.id !== state.id &&
        entry.name.toLowerCase() === state.name.toLowerCase() &&
        entry.server === state.server,
    );

    return (
      <div className={styles.formOverlay}>
        <form ref={ref} className={styles.formPanel} onSubmit={handleSubmit}>
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.cardMeta}>{item ? "Bearbeiten" : "Neu"}</p>
              <h2>{item ? item.name : "Neuer Bewerber"}</h2>
            </div>
            <button type="button" className={styles.secondaryAction} onClick={onClose}>
              Schliessen
            </button>
          </header>

          {duplicateWarning && (
            <div className={styles.warning}>Hinweis: moegliche Dublette (Name+Server).</div>
          )}

          <label className={styles.sheetLabel}>
            Name
            <input
              name="waitlistFormName"
              value={state.name}
              onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>

          <div className={styles.formGrid}>
            <label>
              Klasse
              <select
                name="waitlistFormClass"
                value={state.classRole}
                onChange={(event) => setState((prev) => ({ ...prev, classRole: event.target.value }))}
              >
                {CLASS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Level
              <input
                type="number"
                name="waitlistFormLevel"
                value={state.level}
                min={1}
                max={200}
                onChange={(event) => setState((prev) => ({ ...prev, level: Number(event.target.value) }))}
              />
            </label>
            <label>
              Server
              <select
                name="waitlistFormServer"
                value={state.server}
                onChange={(event) => setState((prev) => ({ ...prev, server: event.target.value }))}
              >
                {SERVER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                name="waitlistFormStatus"
                value={state.status}
                onChange={(event) => setState((prev) => ({ ...prev, status: event.target.value as WaitlistStatus }))}
              >
                <option value="new">Neu</option>
                <option value="in_review">In Review</option>
                <option value="accepted">Zugesagt</option>
                <option value="declined">Abgelehnt</option>
                <option value="withdrawn">Zurueckgezogen</option>
              </select>
            </label>
          </div>

          <label className={styles.sheetLabel}>
            Kontakt
            <input
              name="waitlistFormContact"
              value={state.contact}
              onChange={(event) => setState((prev) => ({ ...prev, contact: event.target.value }))}
            />
          </label>

          <label className={styles.sheetLabel}>
            Quelle
            <input
              name="waitlistFormSource"
              value={state.source}
              onChange={(event) => setState((prev) => ({ ...prev, source: event.target.value }))}
            />
          </label>

          <label className={styles.sheetLabel}>
            Notizen
            <textarea
              name="waitlistFormNotes"
              value={state.notes}
              onChange={(event) => setState((prev) => ({ ...prev, notes: event.target.value }))}
              rows={4}
            />
          </label>

          <footer className={styles.panelFooter}>
            <button type="button" className={styles.secondaryAction} onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className={styles.primaryAction}>
              Speichern
            </button>
          </footer>
        </form>
      </div>
    );
  },
);

WaitlistForm.displayName = "WaitlistForm";

type PaginationProps = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
};

function Pagination({ page, totalPages, onChange }: PaginationProps) {
  return (
    <div className={styles.pagination}>
      <button type="button" className={styles.secondaryAction} onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}>
        Zurueck
      </button>
      <span>
        Seite {page} / {totalPages}
      </span>
      <button
        type="button"
        className={styles.secondaryAction}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
      >
        Weiter
      </button>
    </div>
  );
}
