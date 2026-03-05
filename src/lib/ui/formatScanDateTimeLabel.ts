const DASH = "—";
const DIGITS_ONLY_RE = /^\d+$/;
const LEGACY_DMY_RE =
  /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const pad2 = (value: number): string => String(value).padStart(2, "0");

const formatFixedDateTime = (date: Date): string => {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = pad2(date.getFullYear() % 100);
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${day}/${month}/${year} ${hour}:${minute}`;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};

const parseLegacyDmyToMs = (raw: string): number | null => {
  const match = raw.match(LEGACY_DMY_RE);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const second = match[6] ? Number(match[6]) : 0;
  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }
  return date.getTime();
};

const toScanDateTimeMs = (value: unknown): number | null => {
  if (value == null) return null;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 1e12 ? value * 1000 : value;
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;

    if (DIGITS_ONLY_RE.test(raw)) {
      if (raw.length === 10) {
        const seconds = Number(raw);
        return Number.isFinite(seconds) ? seconds * 1000 : null;
      }
      if (raw.length === 13) {
        const milliseconds = Number(raw);
        return Number.isFinite(milliseconds) ? milliseconds : null;
      }
      return null;
    }

    const legacyMs = parseLegacyDmyToMs(raw);
    if (legacyMs != null) return legacyMs;

    const parsedMs = Date.parse(raw);
    return Number.isFinite(parsedMs) ? parsedMs : null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const seconds = toFiniteNumber(record.seconds ?? record._seconds);
    if (seconds != null) return seconds * 1000;

    const millis = toFiniteNumber(record.milliseconds ?? record.ms);
    if (millis != null) return millis;

    const toMillis = record.toMillis;
    if (typeof toMillis === "function") {
      const ms = toFiniteNumber((toMillis as () => unknown)());
      return ms;
    }
  }

  return null;
};

export function formatScanDateTimeLabel(value: unknown): string {
  const ms = toScanDateTimeMs(value);
  if (ms == null) return DASH;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return DASH;
  return formatFixedDateTime(date);
}
