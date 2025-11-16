import { GuildHubParams } from "./hooks/useGuildHubParams";

export type WaitlistStatus = "new" | "in_review" | "accepted" | "declined" | "withdrawn";
export type FreshnessCode = "f0" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "unknown";

export type WaitlistApplicant = {
  id: string;
  name: string;
  classRole: string;
  level: number;
  server: string;
  status: WaitlistStatus;
  notes: string;
  contact: string;
  source: string;
  tags: string[];
  lastScanAt: string;
  updatedAt: string;
  history: Array<{
    date: string;
    message: string;
  }>;
  freshness: FreshnessCode;
};

export type WaitlistFilterState = {
  q: string;
  status: WaitlistStatus | "all";
  classes: string[];
  servers: string[];
  lvMin: number;
  lvMax: number;
  sort: "name" | "level" | "status" | "lastScan" | "updatedAt";
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const CLASS_OPTIONS = [
  "Warrior",
  "Mage",
  "Scout",
  "Assassin",
  "Battle Mage",
  "Druid",
  "Bard",
] as const;

export const SERVER_OPTIONS = ["EU-01", "EU-02", "US-01", "US-02", "ASIA-01"] as const;

export const STATUS_LABELS: Record<WaitlistStatus, string> = {
  new: "Neu",
  in_review: "In Review",
  accepted: "Zugesagt",
  declined: "Abgelehnt",
  withdrawn: "Zurueckgezogen",
};

export const FRESHNESS_DISPLAY: Record<FreshnessCode, string> = {
  f0: "F0 - <1h",
  f1: "F1 - 1-4h",
  f2: "F2 - 4-12h",
  f3: "F3 - 12-24h",
  f4: "F4 - 1-2d",
  f5: "F5 - 2-4d",
  f6: "F6 - 4-7d",
  f7: "F7 - >7d",
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

export const DEFAULT_FILTERS: WaitlistFilterState = {
  q: "",
  status: "all",
  classes: [],
  servers: [],
  lvMin: 1,
  lvMax: 200,
  sort: "updatedAt",
  dir: "desc",
  page: 1,
  pageSize: 6,
};

export const SAMPLE_APPLICANTS: WaitlistApplicant[] = [
  {
    id: "wl-001",
    name: "Lyra Ashwood",
    classRole: "Mage",
    level: 192,
    server: "EU-01",
    status: "in_review",
    notes:
      "Hohe Aktivitaet, bringt Raid-Heal mit. Hat Interesse an Support-Rollen. Discord verifiziert.",
    contact: "Discord: lyra#0291",
    source: "Community Waitlist",
    tags: ["raid", "support"],
    lastScanAt: hoursAgoISO(2),
    updatedAt: hoursAgoISO(3),
    freshness: "f1",
    history: [
      { date: daysAgoISO(1), message: "Interview abgeschlossen" },
      { date: daysAgoISO(3), message: "Profil angelegt" },
    ],
  },
  {
    id: "wl-002",
    name: "Torren Vale",
    classRole: "Warrior",
    level: 185,
    server: "EU-02",
    status: "new",
    notes: "Tank fuer Abend-Raids, bisher ohne Gilde. Gute Logs, keine Streaming-Praesenz.",
    contact: "Email: torren@example.com",
    source: "Offline Bewerbungsformular",
    tags: ["tank"],
    lastScanAt: hoursAgoISO(10),
    updatedAt: hoursAgoISO(11),
    freshness: "f3",
    history: [{ date: daysAgoISO(2), message: "Wartet auf Erstgespraech" }],
  },
  {
    id: "wl-003",
    name: "Seris Bloom",
    classRole: "Druid",
    level: 178,
    server: "US-01",
    status: "accepted",
    notes: "Healer + Flex-Scout. Bereits auf dem Discord. Benoetigt Transferhilfe.",
    contact: "Discord: seris#0177",
    source: "Guild Referral",
    tags: ["healer", "flex"],
    lastScanAt: hoursAgoISO(20),
    updatedAt: hoursAgoISO(5),
    freshness: "f4",
    history: [
      { date: daysAgoISO(4), message: "Probe erfolgreich" },
      { date: daysAgoISO(6), message: "Bewerbung angenommen" },
    ],
  },
  {
    id: "wl-004",
    name: "Draxen Holt",
    classRole: "Scout",
    level: 165,
    server: "US-02",
    status: "declined",
    notes: "PvP Spieler, konnte Raid-Pflichten nicht sicherstellen. Freundlich verabschiedet.",
    contact: "Discord: draxen#0901",
    source: "Seasonal Event",
    tags: ["pvp"],
    lastScanAt: daysAgoISO(2),
    updatedAt: daysAgoISO(2),
    freshness: "f5",
    history: [{ date: daysAgoISO(2), message: "Absage gesendet" }],
  },
  {
    id: "wl-005",
    name: "Mira Lios",
    classRole: "Battle Mage",
    level: 188,
    server: "EU-01",
    status: "withdrawn",
    notes: "Hat ein anderes Angebot angenommen. Moegliche Rueckkehr offen lassen.",
    contact: "Email: mira@example.com",
    source: "Discord DM",
    tags: ["backup"],
    lastScanAt: daysAgoISO(3),
    updatedAt: daysAgoISO(1),
    freshness: "f6",
    history: [
      { date: daysAgoISO(1), message: "Bewerbung zurueckgezogen" },
      { date: daysAgoISO(5), message: "Interview geplant" },
    ],
  },
  {
    id: "wl-006",
    name: "Kael Thorn",
    classRole: "Assassin",
    level: 190,
    server: "ASIA-01",
    status: "new",
    notes: "Fokus auf Mythic Dungeons. Gute Logs, benoetigt Uebergangshilfe.",
    contact: "Discord: kael#4488",
    source: "Community Waitlist",
    tags: ["mythic"],
    lastScanAt: hoursAgoISO(5),
    updatedAt: hoursAgoISO(5),
    freshness: "f2",
    history: [{ date: daysAgoISO(1), message: "Profil verifiziert" }],
  },
];

export function parseFilters(params: GuildHubParams): WaitlistFilterState {
  return {
    ...DEFAULT_FILTERS,
    q: params.q ?? "",
    status: (params.status as WaitlistFilterState["status"]) || "all",
    classes: params.class ? params.class.split(",").filter(Boolean) : [],
    servers: params.server ? params.server.split(",").filter(Boolean) : [],
    lvMin: params.lvMin ? Number(params.lvMin) : DEFAULT_FILTERS.lvMin,
    lvMax: params.lvMax ? Number(params.lvMax) : DEFAULT_FILTERS.lvMax,
    sort: (params.sort as WaitlistFilterState["sort"]) || DEFAULT_FILTERS.sort,
    dir: (params.dir as WaitlistFilterState["dir"]) || DEFAULT_FILTERS.dir,
    page: params.page ? Number(params.page) : DEFAULT_FILTERS.page,
    pageSize: params.pageSize ? Number(params.pageSize) : DEFAULT_FILTERS.pageSize,
  };
}

export function serializeFilters(filters: WaitlistFilterState) {
  return {
    q: filters.q || undefined,
    status: filters.status === "all" ? undefined : filters.status,
    class: filters.classes.length ? filters.classes.join(",") : undefined,
    server: filters.servers.length ? filters.servers.join(",") : undefined,
    lvMin: filters.lvMin !== DEFAULT_FILTERS.lvMin ? filters.lvMin : undefined,
    lvMax: filters.lvMax !== DEFAULT_FILTERS.lvMax ? filters.lvMax : undefined,
    sort: filters.sort,
    dir: filters.dir,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export function sanitizeFilters(filters: WaitlistFilterState): WaitlistFilterState {
  return {
    ...filters,
    lvMin: Math.max(1, filters.lvMin),
    lvMax: Math.max(filters.lvMin, Math.min(200, filters.lvMax)),
    page: Math.max(1, filters.page),
    pageSize: Math.min(25, Math.max(4, filters.pageSize)),
    classes: Array.from(new Set(filters.classes)),
    servers: Array.from(new Set(filters.servers)),
  };
}

export function applyFilters(
  applicants: WaitlistApplicant[],
  filters: WaitlistFilterState,
  q: string,
) {
  const query = q.toLowerCase();
  return applicants.filter((item) => {
    const matchesQuery =
      query === "" ||
      item.name.toLowerCase().includes(query) ||
      item.notes.toLowerCase().includes(query) ||
      item.server.toLowerCase().includes(query);

    const matchesStatus = filters.status === "all" || item.status === filters.status;
    const matchesClass =
      filters.classes.length === 0 || filters.classes.includes(item.classRole as any);
    const matchesServer = filters.servers.length === 0 || filters.servers.includes(item.server);
    const matchesLevel = item.level >= filters.lvMin && item.level <= filters.lvMax;

    return matchesQuery && matchesStatus && matchesClass && matchesServer && matchesLevel;
  });
}

export function sortApplicants(
  list: WaitlistApplicant[],
  sort: WaitlistFilterState["sort"],
  dir: WaitlistFilterState["dir"],
) {
  const sorted = [...list];
  sorted.sort((a, b) => {
    let diff = 0;
    switch (sort) {
      case "name":
        diff = a.name.localeCompare(b.name);
        break;
      case "level":
        diff = a.level - b.level;
        break;
      case "status":
        diff = a.status.localeCompare(b.status);
        break;
      case "lastScan":
        diff = new Date(a.lastScanAt).getTime() - new Date(b.lastScanAt).getTime();
        break;
      case "updatedAt":
      default:
        diff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
    }
    return dir === "asc" ? diff : -diff;
  });
  return sorted;
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
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
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

export function computeFreshness(applicants: WaitlistApplicant[]) {
  if (!applicants.length) return null;
  return applicants.reduce((worst: WaitlistApplicant | null, item) => {
    if (!worst) return item;
    return FRESHNESS_WEIGHT[item.freshness] > FRESHNESS_WEIGHT[worst.freshness] ? item : worst;
  }, null);
}

function daysAgoISO(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function hoursAgoISO(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

function hoursFromNowISO(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}
