// src/components/guilds/guild-tabs/guild-members/types.ts

/** UI-View */
export type ViewMode = "list" | "cards";

/** Sortierschlüssel – ohne "power" */
export type SortKey =
  | "level"
  | "scrapbook"
  | "name"
  | "role"
  | "sumBaseStats"
  | "totalStats";

export type SortDir = "asc" | "desc";

/** Basiswerte eines Members (optional) */
export type MemberBaseStats = {
  main?: number | null;          // Main-Attribut
  con?: number | null;           // Konstitution
  sumBaseTotal?: number | null;  // bereits voraggregiert (falls vorhanden)
};

/** Minimales Member-Modell für Browser/Listen/Card/Detail */
export type Member = {
  id: string;
  name: string;
  class: string;
  role: string;

  level?: number | null;
  scrapbook?: number | null;

  /** ms-Timestamp (Last Online) – optional */
  lastOnline?: number | null;

  /** Serverkennung (optional, Anzeigezweck) */
  server?: string | null;

  /** Basiswerte/Stats */
  baseStats?: MemberBaseStats;
  totalStats?: number | null;

  /** Beliebige Rohwerte aus Snapshots */
  values?: Record<string, any> | null;

  /** Beliebige weitere Felder, die im Projekt kursieren dürfen */
  [k: string]: any;
};
