// src/lib/api/toplists.ts

export type ToplistItem = {
  playerId: string;
  server: string;
  name: string;
  class: string;
  guild: string | null;
  level: number | null;
  main: string; // main base stat (Rohwert, keine Normalisierung)
  constitution: number | null;
  baseStatsSum: number | null;
  ratio: number | null;
  gemMine: number | null;
  treasury: number | null;
  lastScan: string | null;       // ISO
  lastActivity: string | null;   // ISO
  rank: number | null;           // reine Anzeige (aus Quelle), nicht für Sort/Delta
  delta: number | null;          // Rank-Delta im Range (filter-sensitiv)
  statsPlus: number | null;      // Wert-Delta im Range (last-first)
};

export type ToplistResponse =
  | {
      ok: true;
      count: number;
      items: ToplistItem[];
      meta: {
        filters: {
          server: string[];
          clazz: string[];
          search: string | null;
          range: string;
          sort: string;
          order: "asc" | "desc";
        };
        pagination: {
          limit: number;
          offset: number;
          returned: number;
        };
        generatedAt: string;
        source: { sheetId: string; tab: string };
      };
    }
  | { ok: false; error: string; detail?: string; headers?: string[] };

export type FetchParams = {
  baseUrl: string;          // Apps Script Web-App URL (ohne Query)
  servers: string[];        // aus Server-Picker
  classes: string[];        // aus Klassenfilter
  search?: string | null;   // Suchfeld
  range: "3d" | "7d" | "14d" | "30d" | "60d" | "90d" | "all";
  sort: "sum" | "main" | "constitution" | "level" | "delta" | "last_activity" | "rank";
  order: "asc" | "desc";
  limit: number;            // 120 empfohlen (dein Paging)
  offset: number;           // (pageIndex * limit)
  signal?: AbortSignal;
};

export function buildQuery(p: FetchParams): string {
  const q = new URLSearchParams();
  if (p.servers.length) q.set("server", p.servers.join(","));
  if (p.classes.length) q.set("class", p.classes.join(","));
  if (p.search) q.set("search", p.search.trim());
  q.set("range", p.range);
  q.set("sort", p.sort);
  q.set("order", p.order);
  q.set("limit", String(p.limit));
  q.set("offset", String(p.offset));
  return `${p.baseUrl}?${q.toString()}`;
}

export async function fetchToplists(p: FetchParams): Promise<ToplistResponse> {
  const url = buildQuery(p);
  const res = await fetch(url, { method: "GET", signal: p.signal, credentials: "omit" });
  const data = await res.json();
  return data as ToplistResponse;
}
