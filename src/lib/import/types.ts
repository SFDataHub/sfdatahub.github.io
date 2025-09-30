// src/lib/import/types.ts
export type ImportReport = {
  detectedType: string | null;
  counts: Record<string, number>;   // z. B. { players: 10, guilds: 2, scans: 1 }
  errors: string[];
  warnings: string[];
  durationMs: number;
};

export type DetectedPayload<T = any> = {
  type: string;
  raw: T;
};
