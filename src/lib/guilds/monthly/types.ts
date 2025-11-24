export type MonthKey = `${number}-${"01"|"02"|"03"|"04"|"05"|"06"|"07"|"08"|"09"|"10"|"11"|"12"}`;

export type Member = {
  playerId: string;
  name?: string | null;
  class?: string | null;
  level?: number | null;
  baseMain?: number | null;
  conBase?: number | null;
  sumBaseTotal?: number | null;
  attrTotal?: number | null;
  conTotal?: number | null;
  totalStats?: number | null;
};

export type MembersSummaryDoc = {
  guildId: string;
  updatedAt?: string | null;
  updatedAtMs?: number | null; // ms
  timestamp?: number | null;   // s
  members: Member[];
};

export type ProgressDoc = {
  meta: {
    monthKey: MonthKey;
    label: string;
    fromISO: string | null;
    toISO: string;
    fromTs: number | null;
    toTs: number;
    daysSpan: number | null;
    guildId: string;
    server?: string | null;
  };
  status: { available: boolean; reason?: "INSUFFICIENT_DATA" | "SPAN_GT_40D" };
  mostBaseGained?: any[];
  sumBaseStats?: any[];
  highestBaseStats?: any[];
  highestTotalStats?: any[];
  mainAndCon?: any[];
};
