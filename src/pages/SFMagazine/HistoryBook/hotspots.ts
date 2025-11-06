// src/pages/SFMagazine/HistoryBook/hotspots.ts
export type Hotspot =
  | {
      kind: "goto";
      page: number;            // Seite, auf der der Hotspot liegt (1-basiert)
      t: number; l: number;    // top/left in %
      w: number; h: number;    // width/height in %
      toPage: number;          // Ziel-Seite (1-basiert)
      label: string;           // A11y / Tooltip
    }
  | {
      kind: "link";
      page: number;
      t: number; l: number;
      w: number; h: number;
      href: string;            // externer Link
      label: string;
    };

// Beispiel: Inhaltsverzeichnis auf Seite 4 mit 9 Kapiteln.
// ➜ Koordinaten bitte nach deinem Layout anpassen (hier Platzhalter).
export const hotspotsByPage: Record<number, Hotspot[]> = {
  4: [
    { kind: "goto", page: 4, t: 14.5, l: 4.1,  w: 28.7, h: 20.2, toPage: 5,  label: "Jump to chapter »Before SFGame«" },
    { kind: "goto", page: 4, t: 14.5, l: 36.0, w: 28.7, h: 20.2, toPage: 10, label: "Jump to chapter »2009 – 2014«" },
    { kind: "goto", page: 4, t: 14.5, l: 67.9, w: 28.7, h: 20.2, toPage: 40, label: "Jump to chapter »2015 – 2018«" },
    { kind: "goto", page: 4, t: 37.6, l: 4.1,  w: 28.7, h: 20.2, toPage: 62, label: "Jump to chapter »2019 – 2022«" },
    { kind: "goto", page: 4, t: 37.6, l: 36.0, w: 28.7, h: 20.2, toPage: 85, label: "Jump to chapter »2023 – 2025«" },
    { kind: "goto", page: 4, t: 37.6, l: 67.9, w: 28.7, h: 20.2, toPage: 103,label: "Jump to chapter »Feature Evolution«" },
    { kind: "goto", page: 4, t: 60.7, l: 4.1,  w: 28.7, h: 20.2, toPage: 120,label: "Jump to chapter »Interviews«" },
    { kind: "goto", page: 4, t: 60.7, l: 36.0, w: 28.7, h: 20.2, toPage: 180,label: "Jump to chapter »Awards & Easter Eggs«" },
    { kind: "goto", page: 4, t: 60.7, l: 67.9, w: 28.7, h: 20.2, toPage: 186,label: "Jump to chapter »Epilogue«" },
  ],
  // Weitere Seiten hier ergänzen …
};
