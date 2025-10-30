// src/components/Flipbook/types.ts

export type SrcSetItem = {
  src: string;     // z.B. "pages/0001@1x.webp"
  width: number;   // z.B. 1400
};

export type PageEntry = {
  src: string;           // Fallback (kleinste Variante, z.B. @1x)
  thumb: string;         // z.B. "thumbs/0001.webp"
  srcset?: SrcSetItem[]; // optional: mehrere Auflösungen
};

export type FlipbookManifest = {
  title: string;
  pageCount: number;
  pageWidth: number;     // px, Einzelseite
  pageHeight: number;    // px, Einzelseite
  pages: PageEntry[];
  chapters?: Array<{ title: string; page: number }>;
};

export type FlipbookViewerProps = {
  /** Ordner-Name im /public/flipbooks/…  (z.B. "sf-history-book") */
  slug: string;
  /** Startseite (1-basiert). Default 1 */
  initialPage?: number;
  /** Bei schmalen Viewports Einzelseite, sonst Doppelseite (auto) */
  forceSinglePage?: boolean;
  /** Aufruf bei Seitenwechsel */
  onPageChange?: (page: number) => void;
  /** Aufruf wenn Manifest & erste Seite geladen */
  onReady?: () => void;
};
