export type Align = "left" | "center" | "right";

export type TableColumn = {
  key: string;
  label: string;
  width?: string | number;
  align?: Align;
  format?: "text" | "num";
  render?: (row: TableRow) => React.ReactNode;
};

export type TableRow = {
  id?: string | number;
  [key: string]: any;
};

export type TableBlock = {
  title?: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: TableRow[];
  footer?: string | React.ReactNode;
};

/**
 * Monatseintrag fürs Dropdown.
 * - key:      "YYYY-MM"
 * - label:    "Okt 2025"
 * - fromISO:  ISO-Zeitpunkt (Baseline / erster Scan im Monat)
 * - toISO:    ISO-Zeitpunkt (aktueller/letzter Vergleichspunkt)
 * - daysSpan: Abstand in Tagen (to - from)
 * - available:false, wenn 40-Tage-Regel verletzt oder Daten fehlen
 */
export type MonthOption = {
  key: string;
  label: string;
  fromISO: string;   // z.B. "2025-09-18T00:00:00.000Z"
  toISO: string;     // z.B. "2025-10-18T00:00:00.000Z"
  daysSpan: number;
  available: boolean;
  reason?: "SPAN_GT_40D" | "INSUFFICIENT_DATA";
};

export type GuildMonthlyProgressData = {
  header: {
    title: string;            // e.g. "WiW – Monthly Progress"
    monthRange?: string;      // Fallback-Datum, wenn kein Dropdown
    emblemUrl?: string;
    centerCaption?: string;
    // Dropdown:
    months?: MonthOption[];
    currentMonthKey?: string;
  };
  panels?: {
    leftImageUrl?: string;
    rightImageUrl?: string;
  };
  tablesTop: TableBlock[];
  tablesBottom: TableBlock[];
};
