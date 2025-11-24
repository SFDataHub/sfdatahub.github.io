export type ThemeTokens = {
  page: string; tile: string; tileHover: string; nav: string; active: string;
  text: string; textSoft: string; title: string; line: string;
  radius: number; shadow: number; gap: number;
};

export const DEFAULT_THEME: ThemeTokens = {
  page:"#0C1C2E", tile:"#152A42", tileHover:"#1E3A5C", nav:"#0A1728", active:"#1F3B5D",
  text:"#FFFFFF", textSoft:"#B0C4D9", title:"#F5F9FF", line:"#2C4A73",
  radius:16, shadow:20, gap:12,
};

export const PRESETS: Record<string, ThemeTokens> = {
  Arcade: {
    ...DEFAULT_THEME,
    tile:"#1A2F4A", tileHover:"#25456B", active:"#2D4E78",
    shadow:28, radius:18,
  },
  Mythic: {
    ...DEFAULT_THEME,
    tile:"#14273E", tileHover:"#1E3657", active:"#2B4C73",
    text:"#F5F9FF", textSoft:"#D6E4F7", shadow:32, radius:20,
  },
};
