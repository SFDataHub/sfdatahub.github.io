export const formatToplistNumberWithSpaceGrouping = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat("de-DE", options)
    .formatToParts(value)
    .map((part) => (part.type === "group" ? " " : part.value))
    .join("");

export const formatToplistDelta = (
  value: number | null | undefined,
  formatNumber: (value: number) => string = formatToplistNumberWithSpaceGrouping,
) => {
  if (value == null) return "";
  const formatted = formatNumber(Math.abs(value));
  if (!formatted) return String(value);
  return value > 0 ? `+${formatted}` : `-${formatted}`;
};

export const getToplistRankDeltaDisplay = (
  value: number | string | null | undefined,
  compareMissing: boolean,
  formatNumber: (value: number) => string = formatToplistNumberWithSpaceGrouping,
) => {
  if (compareMissing) {
    return { text: "n/a", variant: "na" as const };
  }
  if (value == null || value === "") {
    return { text: "n/a", variant: "na" as const };
  }
  let parsed: number | null = null;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /^n\/a$/i.test(trimmed)) {
      return { text: "n/a", variant: "na" as const };
    }
    const numeric = Number(trimmed);
    parsed = Number.isFinite(numeric) ? numeric : null;
  }
  if (parsed == null || !Number.isFinite(parsed)) {
    return { text: "n/a", variant: "na" as const };
  }
  if (parsed === 0 || Object.is(parsed, -0)) {
    return { text: "-", variant: "zero" as const };
  }
  const absText = formatNumber(Math.abs(parsed));
  const signedText = parsed > 0 ? `+${absText}` : `-${absText}`;
  return { text: signedText, variant: parsed > 0 ? "pos" as const : "neg" as const };
};
