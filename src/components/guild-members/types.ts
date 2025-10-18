export type Role = "Guild Master" | "Officer" | "Member" | "Recruit" | string;

export type Member = {
  id: string;
  name: string;
  class: string;
  role: Role;
  level: number;
  power: number;
  scrapbook?: number;
  server?: string;                      // nicht in Suche verwendet
  baseStats?: Record<string, number>;   // z.B. { str, dex, int, con, luck }
  totalStats?: number;                  // optional, inkl. Boni
  activity?: number[];                  // 7 Werte für Heatmap
  online?: boolean;
  joinedAt?: Date | string;
  lastOnline?: Date | string;
};

export type ViewMode = "list" | "cards";
export type SortKey =
  | "level" | "power" | "scrapbook" | "name" | "role"
  | "sumBaseStats" | "totalStats";
export type SortDir = "asc" | "desc";
