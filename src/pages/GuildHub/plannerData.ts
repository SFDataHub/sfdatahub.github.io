import { GuildHubParams } from "./hooks/useGuildHubParams";

export type PlannerType = "raid" | "event" | "task";
export type PlannerStatus = "open" | "in_progress" | "done" | "canceled";
export type PlannerPriority = "low" | "medium" | "high" | "urgent";
export type FreshnessCode = "f0" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "unknown";

export type PlannerItem = {
  id: string;
  title: string;
  type: PlannerType;
  status: PlannerStatus;
  owner: string;
  assignees: string[];
  dueAt: string;
  updatedAt: string;
  createdAt: string;
  priority: PlannerPriority;
  tags: string[];
  description: string;
  freshness: FreshnessCode;
  lastScanAt: string;
  nextUpdateAt: string;
};

export type FilterState = {
  q: string;
  type: PlannerType | "all";
  status: PlannerStatus | "all";
  range: "7d" | "30d" | "90d" | "all";
  owner: string[];
  sort: "dueAt" | "updatedAt" | "priority" | "title";
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const TEAM_MEMBERS = ["Ari", "Borin", "Celeste", "Doran", "Lena", "Nix"];

export const STATUS_LABELS: Record<PlannerStatus, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  done: "Erledigt",
  canceled: "Abgebrochen",
};

export const TYPE_LABELS: Record<PlannerType, string> = {
  raid: "Raid",
  event: "Event",
  task: "Task",
};

export const PRIORITY_LABELS: Record<PlannerPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  urgent: "Urgent",
};

export const FRESHNESS_DISPLAY: Record<FreshnessCode, string> = {
  f0: "F0 - < 1h",
  f1: "F1 - 1-4h",
  f2: "F2 - 4-12h",
  f3: "F3 - 12-24h",
  f4: "F4 - 1-2d",
  f5: "F5 - 2-4d",
  f6: "F6 - 4-7d",
  f7: "F7 - > 7d",
  unknown: "Unbekannt",
};

const FRESHNESS_WEIGHT: Record<FreshnessCode, number> = {
  f0: 0,
  f1: 1,
  f2: 2,
  f3: 3,
  f4: 4,
  f5: 5,
  f6: 6,
  f7: 7,
  unknown: 8,
};

const PRIORITY_WEIGHT: Record<PlannerPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const RANGE_TO_DAYS: Record<FilterState["range"], number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

export const DEFAULT_FILTERS: FilterState = {
  q: "",
  type: "all",
  status: "all",
  range: "30d",
  owner: [],
  sort: "dueAt",
  dir: "asc",
  page: 1,
  pageSize: 6,
};

export const SAMPLE_ITEMS: PlannerItem[] = [
  {
    id: "planner-001",
    title: "Trial of Valor Raid",
    type: "raid",
    status: "open",
    owner: "Ari",
    assignees: ["Ari", "Celeste"],
    dueAt: daysFromNowISO(5, 20),
    createdAt: daysAgoISO(2, 14),
    updatedAt: daysAgoISO(1, 11),
    priority: "urgent",
    tags: ["raid", "fusion"],
    description:
      "Koordiniere die Vorbereitung fuer den Trial of Valor Raid. Stelle sicher, dass Elixiere und Edelsteine auf Lager sind und alle Tanks das neue Setup kennen.",
    freshness: "f2",
    lastScanAt: hoursAgoISO(3),
    nextUpdateAt: hoursFromNowISO(5),
  },
  {
    id: "planner-002",
    title: "Waitlist Sync - Woche 39",
    type: "task",
    status: "in_progress",
    owner: "Lena",
    assignees: ["Lena", "Nix"],
    dueAt: daysFromNowISO(2, 12),
    createdAt: daysAgoISO(4, 9),
    updatedAt: daysAgoISO(1, 8),
    priority: "high",
    tags: ["waitlist", "ops"],
    description:
      "Verifiziere offene Bewerbungen, aktualisiere Klassentargets und markiere Kandidaten mit kritischen Notizen.",
    freshness: "f3",
    lastScanAt: hoursAgoISO(8),
    nextUpdateAt: hoursFromNowISO(12),
  },
  {
    id: "planner-003",
    title: "Fusion Discovery Call",
    type: "event",
    status: "open",
    owner: "Celeste",
    assignees: ["Celeste", "Doran"],
    dueAt: daysFromNowISO(7, 17),
    createdAt: daysAgoISO(1, 10),
    updatedAt: daysAgoISO(1, 9),
    priority: "medium",
    tags: ["fusion", "negotiation"],
    description:
      'Vorbereitung auf das Discovery-Meeting mit Gilde "Astral Echoes". Fokus: Kulturabgleich und Zeitleiste.',
    freshness: "f4",
    lastScanAt: hoursAgoISO(22),
    nextUpdateAt: hoursFromNowISO(26),
  },
  {
    id: "planner-004",
    title: "Event: Ingame Jubilaeum",
    type: "event",
    status: "done",
    owner: "Borin",
    assignees: ["Borin"],
    dueAt: daysAgoISO(1, 19),
    createdAt: daysAgoISO(9, 10),
    updatedAt: daysAgoISO(1, 21),
    priority: "low",
    tags: ["community"],
    description:
      "Recap fertigstellen, Screenshots ins Archiv laden und Feedback-Umfrage versenden.",
    freshness: "f5",
    lastScanAt: daysAgoISO(1, 19),
    nextUpdateAt: daysFromNowISO(3, 9),
  },
  {
    id: "planner-005",
    title: "Raid Lead Rotation",
    type: "task",
    status: "open",
    owner: "Nix",
    assignees: ["Nix", "Doran"],
    dueAt: daysFromNowISO(12, 18),
    createdAt: daysAgoISO(6, 15),
    updatedAt: daysAgoISO(2, 13),
    priority: "medium",
    tags: ["ops"],
    description:
      "Rotation vorbereiten, Onboarding-Dokument aktualisieren und Backup-Lead einarbeiten.",
    freshness: "f1",
    lastScanAt: hoursAgoISO(1),
    nextUpdateAt: hoursFromNowISO(8),
  },
  {
    id: "planner-006",
    title: "Recruitment Push EU-02",
    type: "task",
    status: "in_progress",
    owner: "Doran",
    assignees: ["Doran", "Ari"],
    dueAt: daysFromNowISO(18, 13),
    createdAt: daysAgoISO(12, 18),
    updatedAt: daysAgoISO(3, 8),
    priority: "high",
    tags: ["recruiting"],
    description:
      "Discord Outreach finalisieren, Server-Werbung aktualisieren und Referal-Bonus ankuendigen.",
    freshness: "f6",
    lastScanAt: daysAgoISO(2, 16),
    nextUpdateAt: daysFromNowISO(4, 9),
  },
];

function daysFromNowISO(days: number, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function hoursFromNowISO(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() + hours, date.getMinutes(), 0, 0);
  return date.toISOString();
}

function daysAgoISO(days: number, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function hoursAgoISO(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - hours, date.getMinutes(), 0, 0);
  return date.toISOString();
}

export function parseFilters(params: GuildHubParams): FilterState {
  const owner = params.owner ? params.owner.split(",").filter(Boolean) : [];
  return {
    ...DEFAULT_FILTERS,
    q: params.q ?? DEFAULT_FILTERS.q,
    type: (params.type as FilterState["type"]) || DEFAULT_FILTERS.type,
    status: (params.status as FilterState["status"]) || DEFAULT_FILTERS.status,
    range: (params.range as FilterState["range"]) || DEFAULT_FILTERS.range,
    owner,
    sort: (params.sort as FilterState["sort"]) || DEFAULT_FILTERS.sort,
    dir: (params.dir as FilterState["dir"]) || DEFAULT_FILTERS.dir,
    page: Number(params.page ?? DEFAULT_FILTERS.page),
    pageSize: Number(params.pageSize ?? DEFAULT_FILTERS.pageSize),
  };
}

export function serializeFilters(filters: FilterState) {
  return {
    q: filters.q || undefined,
    type: filters.type === "all" ? undefined : filters.type,
    status: filters.status === "all" ? undefined : filters.status,
    range: filters.range === DEFAULT_FILTERS.range ? undefined : filters.range,
    owner: filters.owner.length ? filters.owner.join(",") : undefined,
    sort: filters.sort,
    dir: filters.dir,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export function sanitizeFilters(filters: FilterState): FilterState {
  return {
    ...filters,
    page: Math.max(1, filters.page),
    pageSize: Math.min(25, Math.max(4, filters.pageSize)),
    owner: Array.from(new Set(filters.owner)),
  };
}

export function applyFilters(items: PlannerItem[], filters: FilterState, q: string) {
  const now = Date.now();
  const rangeLimit = RANGE_TO_DAYS[filters.range];

  return items.filter((item) => {
    const matchesQuery =
      q === "" ||
      item.title.toLowerCase().includes(q.toLowerCase()) ||
      item.description.toLowerCase().includes(q.toLowerCase());

    const matchesType = filters.type === "all" || item.type === filters.type;
    const matchesStatus = filters.status === "all" || item.status === filters.status;
    const matchesOwner =
      filters.owner.length === 0 ||
      filters.owner.includes(item.owner) ||
      item.assignees.some((assignee) => filters.owner.includes(assignee));

    let matchesRange = true;
    if (rangeLimit !== null) {
      const due = new Date(item.dueAt).getTime();
      const maxRange = now + rangeLimit * 24 * 60 * 60 * 1000;
      matchesRange = due <= maxRange;
    }

    return matchesQuery && matchesType && matchesStatus && matchesOwner && matchesRange;
  });
}

export function sortItems(
  items: PlannerItem[],
  sort: FilterState["sort"],
  dir: FilterState["dir"],
) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    let value = 0;
    switch (sort) {
      case "dueAt":
        value = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        break;
      case "updatedAt":
        value = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case "priority":
        value = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        break;
      case "title":
        value = a.title.localeCompare(b.title);
        break;
      default:
        value = 0;
    }
    return dir === "asc" ? value : -value;
  });
  return sorted;
}

export function paginate(items: PlannerItem[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function formatDate(date: string) {
  const d = new Date(date);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(date: string) {
  const delta = Date.now() - new Date(date).getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

export function formatCountdown(target: string, now: number) {
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "faellig";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

export function computeFreshness(items: PlannerItem[]) {
  if (items.length === 0) return null;
  return items.reduce((worst: PlannerItem | null, item) => {
    if (!worst) return item;
    return FRESHNESS_WEIGHT[item.freshness] > FRESHNESS_WEIGHT[worst.freshness] ? item : worst;
  }, null);
}
