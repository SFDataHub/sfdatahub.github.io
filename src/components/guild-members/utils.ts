export const THEME = {
  bg: "#0C1C2E",
  tile: "#1A2F4A",
  tileHover: "#25456B",
  border: "#2B4C73",
  text: "#FFFFFF",
  sub: "#B0C4D9",
  title: "#F5F9FF",
  icon: "#5C8BC6",
  header: "#1E3657",
  tableBg: "#14273E",
  line: "#2C4A73",
  glow: "rgba(92,139,198,0.45)",
};

export const mergeTheme = (a: any, b?: any) => ({ ...(a || {}), ...(b || {}) });

export const fmtDate = (d?: Date | string) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

export const timeAgo = (d?: Date | string) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
};

export const sumBaseStats = (base?: Record<string, number>) =>
  Object.values(base || {}).reduce((a, b) => a + (b || 0), 0);
