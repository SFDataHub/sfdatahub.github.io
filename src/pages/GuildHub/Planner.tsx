import React from "react";
import ContentShell from "../../components/ContentShell";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./Planner.module.css";
import {
  PlannerItem,
  PlannerStatus,
  FilterState,
  TEAM_MEMBERS,
  STATUS_LABELS,
  TYPE_LABELS,
  PRIORITY_LABELS,
  FRESHNESS_DISPLAY,
  DEFAULT_FILTERS,
  SAMPLE_ITEMS,
  sanitizeFilters,
  applyFilters,
  sortItems,
  paginate,
  formatDate,
  formatRelative,
  formatCountdown,
  computeFreshness,
  FreshnessCode,
  PlannerPriority,
} from "./plannerData";

export default function GuildHubPlanner() {
  const [items, setItems] = React.useState<PlannerItem[]>(SAMPLE_ITEMS);
  const [appliedFilters, setAppliedFilters] = React.useState<FilterState>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = React.useState<FilterState>(DEFAULT_FILTERS);

  const debouncedQuery = useDebouncedValue(appliedFilters.q, 300);

  const filteredItems = React.useMemo(() => {
    const scoped = applyFilters(items, appliedFilters, debouncedQuery);
    return sortItems(scoped, appliedFilters.sort, appliedFilters.dir);
  }, [items, appliedFilters, debouncedQuery]);

  const paginatedItems = React.useMemo(
    () => paginate(filteredItems, appliedFilters.page, appliedFilters.pageSize),
    [filteredItems, appliedFilters.page, appliedFilters.pageSize],
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / appliedFilters.pageSize));

  const owners = React.useMemo(() => Array.from(new Set(items.map((item) => item.owner))), [items]);

  const isMdUp = useMediaQuery("(min-width: 768px)");
  const isLgUp = useMediaQuery("(min-width: 1024px)");

  const [isFilterSheetOpen, setFilterSheetOpen] = React.useState(false);

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const detailItem = items.find((item) => item.id === detailId) ?? null;
  const detailPanelRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(detailPanelRef, !!detailItem && !isLgUp);

  const [formItem, setFormItem] = React.useState<PlannerItem | null>(null);
  const [isFormOpen, setFormOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  useFocusTrap(formRef, isFormOpen);

  const freshnessMeta = React.useMemo(() => computeFreshness(items), [items]);
  const countdown = React.useMemo(
    () => (freshnessMeta ? formatCountdown(freshnessMeta.nextUpdateAt, Date.now()) : ""),
    [freshnessMeta],
  );

  const showTable = isMdUp;
  const showDrawer = isLgUp;

  const headerActions = (
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
  );

  const applyFiltersState = (next: FilterState) => {
    const sanitized = sanitizeFilters(next);
    setAppliedFilters(sanitized);
    setDraftFilters(sanitized);
  };

  const handleInlineFilterChange = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    const next = sanitizeFilters({
      ...appliedFilters,
      [key]: value,
      page: key === "page" || key === "pageSize" ? (value as number) : 1,
    });
    applyFiltersState(next);
  };

  const handleSheetApply = () => {
    applyFiltersState(draftFilters);
    setFilterSheetOpen(false);
  };

  const handleSheetReset = () => {
    applyFiltersState(DEFAULT_FILTERS);
    setFilterSheetOpen(false);
  };

  const handleOwnerToggle = (ownerName: string, useDraft = false) => {
    if (useDraft) {
      setDraftFilters((prev) => {
        const exists = prev.owner.includes(ownerName);
        const nextOwners = exists
          ? prev.owner.filter((value) => value !== ownerName)
          : [...prev.owner, ownerName];
        return { ...prev, owner: nextOwners };
      });
    } else {
      const exists = appliedFilters.owner.includes(ownerName);
      const nextOwners = exists
        ? appliedFilters.owner.filter((value) => value !== ownerName)
        : [...appliedFilters.owner, ownerName];
      handleInlineFilterChange("owner", nextOwners as FilterState["owner"]);
    }
  };

  const handleStatusUpdate = (id: string, status: PlannerStatus) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
  };

  const handleFormSubmit = (payload: PlannerItem) => {
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
    <ContentShell title="Guild Hub" subtitle="Planner" centerFramed={false}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerStack}>
            <div>
              <p className={styles.kicker}>Deployment</p>
              <h1 className={styles.title}>Planer</h1>
            </div>
            {headerActions}
          </div>

          <div className={styles.infoStrip}>
            <div className={styles.infoBlock}>
              <span className={styles.infoLabel}>Offen</span>
              <strong>{filteredItems.filter((item) => item.status === "open").length}</strong>
            </div>
            <div className={styles.infoBlock}>
              <span className={styles.infoLabel}>In Arbeit</span>
              <strong>
                {filteredItems.filter((item) => item.status === "in_progress").length}
              </strong>
            </div>
            {freshnessMeta && (
              <FreshnessBadge
                code={freshnessMeta.freshness}
                label={FRESHNESS_DISPLAY[freshnessMeta.freshness]}
                updatedAt={freshnessMeta.lastScanAt}
                nextUpdateAt={freshnessMeta.nextUpdateAt}
                countdown={countdown}
              />
            )}
          </div>
        </header>

        <section className={styles.filterToolbar}>
          {isMdUp ? (
            <InlineFilters
              filters={appliedFilters}
              owners={owners}
              onChange={handleInlineFilterChange}
              onOwnerToggle={(owner) => handleOwnerToggle(owner, false)}
            />
          ) : (
            <button
              type="button"
              className={styles.filterSheetButton}
              onClick={() => setFilterSheetOpen(true)}
              aria-haspopup="dialog"
            >
              Filter & Sortierung
            </button>
          )}
        </section>

        <section className={styles.listBody}>
          {showTable ? (
            <PlannerTable
              items={paginatedItems}
              sort={appliedFilters.sort}
              dir={appliedFilters.dir}
              onSortChange={(key) => {
                const dir =
                  appliedFilters.sort === key && appliedFilters.dir === "asc" ? "desc" : "asc";
                handleInlineFilterChange("sort", key);
                handleInlineFilterChange("dir", dir as FilterState["dir"]);
              }}
              onSelect={(item) => setDetailId(item.id)}
              onStatusChange={handleStatusUpdate}
              onEdit={(item) => {
                setFormItem(item);
                setFormOpen(true);
              }}
            />
          ) : (
            <PlannerCards
              items={paginatedItems}
              onSelect={(item) => setDetailId(item.id)}
              onStatusChange={handleStatusUpdate}
              onEdit={(item) => {
                setFormItem(item);
                setFormOpen(true);
              }}
            />
          )}
        </section>

        <Pagination
          page={appliedFilters.page}
          totalPages={totalPages}
          onChange={(page) => handleInlineFilterChange("page", page)}
        />
      </div>

      {isFilterSheetOpen && (
        <FilterSheet
          filters={draftFilters}
          owners={owners}
          onChange={setDraftFilters}
          onOwnerToggle={(owner) => handleOwnerToggle(owner, true)}
          onClose={() => setFilterSheetOpen(false)}
          onApply={handleSheetApply}
          onReset={handleSheetReset}
        />
      )}

      {detailItem && (
        <DetailPanel
          ref={detailPanelRef}
          item={detailItem}
          mode={showDrawer ? "drawer" : "modal"}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setFormItem(detailItem);
            setFormOpen(true);
            setDetailId(null);
          }}
          onStatusChange={handleStatusUpdate}
        />
      )}

      {isFormOpen && (
        <PlannerFormOverlay
          ref={formRef}
          owners={owners.length ? owners : TEAM_MEMBERS}
          item={formItem}
          onClose={() => setFormOpen(false)}
          onSubmit={handleFormSubmit}
        />
      )}
    </ContentShell>
  );
}

type FreshnessBadgeProps = {
  code: FreshnessCode;
  label: string;
  updatedAt: string;
  nextUpdateAt: string;
  countdown: string;
};

function FreshnessBadge({ code, label, updatedAt, nextUpdateAt, countdown }: FreshnessBadgeProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={styles.freshnessWrapper}>
      <button
        type="button"
        className={`${styles.freshnessBadge} ${styles[`badge_${code}`] ?? ""}`}
        aria-label={`Freshness ${label}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label}
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Freshness Details">
          <div>
            <span className={styles.popoverLabel}>Zuletzt gescannt</span>
            <strong>{formatDate(updatedAt)}</strong>
          </div>
          <div>
            <span className={styles.popoverLabel}>Naechster Scan</span>
            <strong>{formatDate(nextUpdateAt)}</strong>
          </div>
          <div>
            <span className={styles.popoverLabel}>Countdown</span>
            <strong>{countdown}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

type InlineFiltersProps = {
  filters: FilterState;
  owners: string[];
  onChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onOwnerToggle: (owner: string) => void;
};

function InlineFilters({ filters, owners, onChange, onOwnerToggle }: InlineFiltersProps) {
  return (
    <div className={styles.inlineFilters}>
      <input
        type="search"
        name="plannerSearch"
        aria-label="Planner Suche"
        className={styles.searchInput}
        placeholder="Suchen..."
        value={filters.q}
        onChange={(event) => onChange("q", event.target.value)}
      />

      <select
        className={styles.select}
        name="plannerType"
        aria-label="Planner Typ"
        value={filters.type}
        onChange={(event) => onChange("type", event.target.value as FilterState["type"])}
      >
        <option value="all">Typ (alle)</option>
        <option value="raid">Raid</option>
        <option value="event">Event</option>
        <option value="task">Task</option>
      </select>

      <select
        className={styles.select}
        name="plannerStatus"
        aria-label="Planner Status"
        value={filters.status}
        onChange={(event) => onChange("status", event.target.value as FilterState["status"])}
      >
        <option value="all">Status (alle)</option>
        <option value="open">Offen</option>
        <option value="in_progress">In Arbeit</option>
        <option value="done">Erledigt</option>
        <option value="canceled">Abgebrochen</option>
      </select>

      <select
        className={styles.select}
        name="plannerRange"
        aria-label="Planner Zeitraum"
        value={filters.range}
        onChange={(event) => onChange("range", event.target.value as FilterState["range"])}
      >
        <option value="7d">7 Tage</option>
        <option value="30d">30 Tage</option>
        <option value="90d">90 Tage</option>
        <option value="all">Alle</option>
      </select>

      <div className={styles.ownerGroup}>
        {owners.map((owner) => {
          const active = filters.owner.includes(owner);
          return (
            <button
              key={owner}
              type="button"
              className={`${styles.ownerChip} ${active ? styles.ownerChipActive : ""}`}
              onClick={() => onOwnerToggle(owner)}
            >
              {owner}
            </button>
          );
        })}
      </div>

      <div className={styles.sortGroup}>
        <label htmlFor="planner-sort" className={styles.sortLabel}>
          Sortieren
        </label>
        <select
          id="planner-sort"
          name="plannerSort"
          className={styles.select}
          value={filters.sort}
          onChange={(event) => onChange("sort", event.target.value as FilterState["sort"])}
        >
          <option value="dueAt">Faelligkeitsdatum</option>
          <option value="updatedAt">Aktualisiert</option>
          <option value="priority">Prioritaet</option>
          <option value="title">Titel</option>
        </select>
        <button
          type="button"
          aria-label="Sortierrichtung wechseln"
          className={styles.directionButton}
          onClick={() => onChange("dir", filters.dir === "asc" ? "desc" : "asc")}
        >
          {filters.dir === "asc" ? "↑" : "↓"}
        </button>
      </div>
    </div>
  );
}

type PlannerTableProps = {
  items: PlannerItem[];
  sort: FilterState["sort"];
  dir: FilterState["dir"];
  onSortChange: (sort: FilterState["sort"]) => void;
  onSelect: (item: PlannerItem) => void;
  onStatusChange: (id: string, status: PlannerStatus) => void;
  onEdit: (item: PlannerItem) => void;
};

function PlannerTable({
  items,
  sort,
  dir,
  onSortChange,
  onSelect,
  onStatusChange,
  onEdit,
}: PlannerTableProps) {
  const renderSortLabel = (key: FilterState["sort"]) =>
    sort === key ? (dir === "asc" ? " ↑" : " ↓") : "";

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.stickyColumn} onClick={() => onSortChange("title")}>
              Titel{renderSortLabel("title")}
            </th>
            <th>Typ</th>
            <th>Owner</th>
            <th onClick={() => onSortChange("dueAt")}>Termin{renderSortLabel("dueAt")}</th>
            <th>Status</th>
            <th onClick={() => onSortChange("updatedAt")}>
              Aktualisiert{renderSortLabel("updatedAt")}
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className={styles.stickyColumn}>
                <button
                  type="button"
                  className={styles.rowTitleButton}
                  onClick={() => onSelect(item)}
                >
                  {item.title}
                </button>
              </td>
              <td>{TYPE_LABELS[item.type]}</td>
              <td>{item.owner}</td>
              <td>{formatDate(item.dueAt)}</td>
              <td>
                <select
                  name={`plannerStatus-${item.id}`}
                  aria-label={`Status fuer ${item.title}`}
                  className={styles.tableStatus}
                  value={item.status}
                  onChange={(event) =>
                    onStatusChange(item.id, event.target.value as PlannerStatus)
                  }
                >
                  <option value="open">Offen</option>
                  <option value="in_progress">In Arbeit</option>
                  <option value="done">Erledigt</option>
                  <option value="canceled">Abgebrochen</option>
                </select>
              </td>
              <td>{formatRelative(item.updatedAt)}</td>
              <td>
                <RowActionsMenu
                  onEdit={() => onEdit(item)}
                  onComplete={() => onStatusChange(item.id, "done")}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PlannerCardsProps = {
  items: PlannerItem[];
  onSelect: (item: PlannerItem) => void;
  onStatusChange: (id: string, status: PlannerStatus) => void;
  onEdit: (item: PlannerItem) => void;
};

function PlannerCards({ items, onSelect, onStatusChange, onEdit }: PlannerCardsProps) {
  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className={styles.cardList}>
      {items.map((item) => (
        <article key={item.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <button
                type="button"
                className={styles.cardTitle}
                onClick={() => onSelect(item)}
              >
                {item.title}
              </button>
              <div className={styles.cardMeta}>
                <span>{TYPE_LABELS[item.type]}</span>
                <span>{STATUS_LABELS[item.status]}</span>
                <span>Due {formatDate(item.dueAt)}</span>
              </div>
            </div>
            <RowActionsMenu
              onEdit={() => onEdit(item)}
              onComplete={() => onStatusChange(item.id, "done")}
            />
          </div>

          <p className={styles.cardDescription}>{item.description}</p>

          <div className={styles.cardFooter}>
            <div>
              <span className={styles.cardLabel}>Owner</span>
              <strong>{item.owner}</strong>
            </div>
            <select
              name={`plannerCardStatus-${item.id}`}
              aria-label={`Status fuer ${item.title}`}
              className={styles.tableStatus}
              value={item.status}
              onChange={(event) => onStatusChange(item.id, event.target.value as PlannerStatus)}
            >
              <option value="open">Offen</option>
              <option value="in_progress">In Arbeit</option>
              <option value="done">Erledigt</option>
              <option value="canceled">Abgebrochen</option>
            </select>
            <span className={styles.scanBadge}>Letzter Scan {formatRelative(item.lastScanAt)}</span>
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
  filters: FilterState;
  owners: string[];
  onChange: React.Dispatch<React.SetStateAction<FilterState>>;
  onOwnerToggle: (owner: string) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
};

function FilterSheet({
  filters,
  owners,
  onChange,
  onOwnerToggle,
  onClose,
  onApply,
  onReset,
}: FilterSheetProps) {
  return (
    <div className={styles.sheetBackdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-label="Filter"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.sheetHandle} />
        <div className={styles.sheetBody}>
          <h2>Filter</h2>
          <label className={styles.sheetLabel}>
            Suche
            <input
              type="search"
              name="plannerSheetSearch"
              value={filters.q}
              onChange={(event) => onChange((prev) => ({ ...prev, q: event.target.value }))}
            />
          </label>

          <label className={styles.sheetLabel}>
            Typ
            <select
              name="plannerSheetType"
              value={filters.type}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, type: event.target.value as FilterState["type"] }))
              }
            >
              <option value="all">Alle</option>
              <option value="raid">Raid</option>
              <option value="event">Event</option>
              <option value="task">Task</option>
            </select>
          </label>

          <label className={styles.sheetLabel}>
            Status
            <select
              name="plannerSheetStatus"
              value={filters.status}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  status: event.target.value as FilterState["status"],
                }))
              }
            >
              <option value="all">Alle</option>
              <option value="open">Offen</option>
              <option value="in_progress">In Arbeit</option>
              <option value="done">Erledigt</option>
              <option value="canceled">Abgebrochen</option>
            </select>
          </label>

          <label className={styles.sheetLabel}>
            Zeitraum
            <select
              name="plannerSheetRange"
              value={filters.range}
              onChange={(event) =>
                onChange((prev) => ({ ...prev, range: event.target.value as FilterState["range"] }))
              }
            >
              <option value="7d">7 Tage</option>
              <option value="30d">30 Tage</option>
              <option value="90d">90 Tage</option>
              <option value="all">Alle</option>
            </select>
          </label>

          <div className={styles.sheetLabel}>
            Owner
            <div className={styles.ownerGroup}>
              {owners.map((owner) => {
                const active = filters.owner.includes(owner);
                return (
                  <button
                    key={owner}
                    type="button"
                    className={`${styles.ownerChip} ${active ? styles.ownerChipActive : ""}`}
                    onClick={() => onOwnerToggle(owner)}
                  >
                    {owner}
                  </button>
                );
              })}
            </div>
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

type DetailPanelProps = {
  item: PlannerItem;
  mode: "drawer" | "modal";
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (id: string, status: PlannerStatus) => void;
};

const DetailPanel = React.forwardRef<HTMLDivElement, DetailPanelProps>(
  ({ item, mode, onClose, onEdit, onStatusChange }, ref) => {
    return (
      <div className={styles.overlay}>
        <div
          ref={ref}
          className={`${styles.panel} ${mode === "drawer" ? styles.drawer : styles.modal}`}
        >
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.cardLabel}>{TYPE_LABELS[item.type]}</p>
              <h2>{item.title}</h2>
            </div>
            <button type="button" className={styles.secondaryAction} onClick={onClose}>
              Schliessen
            </button>
          </header>

          <div className={styles.panelControls}>
            <label>
              Status
              <select
                value={item.status}
                onChange={(event) => onStatusChange(item.id, event.target.value as PlannerStatus)}
              >
                <option value="open">Offen</option>
                <option value="in_progress">In Arbeit</option>
                <option value="done">Erledigt</option>
                <option value="canceled">Abgebrochen</option>
              </select>
            </label>
            <label>
              Prioritaet
              <select disabled value={item.priority}>
                <option value="urgent">Urgent</option>
                <option value="high">Hoch</option>
                <option value="medium">Mittel</option>
                <option value="low">Niedrig</option>
              </select>
            </label>
          </div>

          <p className={styles.panelDescription}>{item.description}</p>

          <dl className={styles.detailGrid}>
            <div>
              <dt>Owner</dt>
              <dd>{item.owner}</dd>
            </div>
            <div>
              <dt>Assignees</dt>
              <dd>{item.assignees.join(", ")}</dd>
            </div>
            <div>
              <dt>Termin</dt>
              <dd>{formatDate(item.dueAt)}</dd>
            </div>
            <div>
              <dt>Zuletzt aktualisiert</dt>
              <dd>{formatRelative(item.updatedAt)}</dd>
            </div>
            <div>
              <dt>Erstellt</dt>
              <dd>{formatDate(item.createdAt)}</dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd>{item.tags.join(", ")}</dd>
            </div>
          </dl>

          <div className={styles.panelFooter}>
            <button type="button" className={styles.secondaryAction} onClick={onEdit}>
              Bearbeiten
            </button>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => onStatusChange(item.id, "done")}
            >
              Als erledigt markieren
            </button>
          </div>
        </div>
      </div>
    );
  },
);

DetailPanel.displayName = "DetailPanel";

type PlannerFormOverlayProps = {
  owners: string[];
  item: PlannerItem | null;
  onClose: () => void;
  onSubmit: (item: PlannerItem) => void;
};

const PlannerFormOverlay = React.forwardRef<HTMLFormElement, PlannerFormOverlayProps>(
  ({ owners, item, onClose, onSubmit }, ref) => {
    const [state, setState] = React.useState<PlannerItem>(() =>
      item ?? {
        id: `planner-${Date.now()}`,
        title: "",
        type: "task",
        status: "open",
        owner: owners[0] ?? TEAM_MEMBERS[0],
        assignees: [],
        dueAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        priority: "medium",
        tags: [],
        description: "",
        freshness: "unknown",
        lastScanAt: new Date().toISOString(),
        nextUpdateAt: new Date().toISOString(),
      },
    );

    React.useEffect(() => {
      if (item) {
        setState(item);
      }
    }, [JSON.stringify(item)]);

    const handleSubmit = (event: React.FormEvent) => {
      event.preventDefault();
      if (!state.title.trim()) return;
      onSubmit({ ...state, updatedAt: new Date().toISOString() });
    };

    const toggleTag = (tag: string) => {
      setState((prev) => {
        const exists = prev.tags.includes(tag);
        const tags = exists ? prev.tags.filter((value) => value !== tag) : [...prev.tags, tag];
        return { ...prev, tags };
      });
    };

    return (
      <div className={styles.formOverlay}>
        <form ref={ref} className={styles.formPanel} onSubmit={handleSubmit}>
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.cardLabel}>{item ? "Eintrag bearbeiten" : "Neuer Eintrag"}</p>
              <h2>{item ? item.title : "Planner Task"}</h2>
            </div>
            <button type="button" className={styles.secondaryAction} onClick={onClose}>
              Schliessen
            </button>
          </header>

          <label className={styles.sheetLabel}>
            Titel
            <input
              name="plannerFormTitle"
              value={state.title}
              onChange={(event) => setState((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
          </label>

          <label className={styles.sheetLabel}>
            Beschreibung
            <textarea
              name="plannerFormDescription"
              value={state.description}
              onChange={(event) =>
                setState((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={4}
            />
          </label>

          <div className={styles.formGrid}>
            <label>
              Typ
              <select
                name="plannerFormType"
                value={state.type}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, type: event.target.value as PlannerItem["type"] }))
                }
              >
                <option value="raid">Raid</option>
                <option value="event">Event</option>
                <option value="task">Task</option>
              </select>
            </label>

            <label>
              Status
              <select
                name="plannerFormStatus"
                value={state.status}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    status: event.target.value as PlannerStatus,
                  }))
                }
              >
                <option value="open">Offen</option>
                <option value="in_progress">In Arbeit</option>
                <option value="done">Erledigt</option>
                <option value="canceled">Abgebrochen</option>
              </select>
            </label>

            <label>
              Owner
              <select
                name="plannerFormOwner"
                value={state.owner}
                onChange={(event) => setState((prev) => ({ ...prev, owner: event.target.value }))}
              >
                {owners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Prioritaet
              <select
                name="plannerFormPriority"
                value={state.priority}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    priority: event.target.value as PlannerPriority,
                  }))
                }
              >
                <option value="urgent">Urgent</option>
                <option value="high">Hoch</option>
                <option value="medium">Mittel</option>
                <option value="low">Niedrig</option>
              </select>
            </label>
          </div>

          <label className={styles.sheetLabel}>
            Termin
            <input
              type="datetime-local"
              name="plannerFormDueAt"
              value={state.dueAt.slice(0, 16)}
              onChange={(event) =>
                setState((prev) => ({ ...prev, dueAt: new Date(event.target.value).toISOString() }))
              }
            />
          </label>

          <div className={styles.sheetLabel}>
            Tags
            <div className={styles.ownerGroup}>
              {["raid", "fusion", "ops", "community", "recruiting"].map((tag) => {
                const active = state.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`${styles.ownerChip} ${active ? styles.ownerChipActive : ""}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

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

PlannerFormOverlay.displayName = "PlannerFormOverlay";

type RowActionsMenuProps = {
  onEdit: () => void;
  onComplete: () => void;
};

function RowActionsMenu({ onEdit, onComplete }: RowActionsMenuProps) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={styles.menuWrapper} ref={menuRef}>
      <button
        type="button"
        className={styles.dotsButton}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        ...
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button type="button" onClick={() => onEdit()}>
            Bearbeiten
          </button>
          <button type="button" onClick={() => onComplete()}>
            Als erledigt
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Mehr
          </button>
        </div>
      )}
    </div>
  );
}

type PaginationProps = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
};

function Pagination({ page, totalPages, onChange }: PaginationProps) {
  return (
    <div className={styles.pagination}>
      <button
        type="button"
        className={styles.secondaryAction}
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
      >
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
