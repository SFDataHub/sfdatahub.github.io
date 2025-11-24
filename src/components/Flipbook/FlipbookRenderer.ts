// src/components/Flipbook/FlipbookRenderer.ts
export type ViewMode = "single" | "spread";
export type EffectMode = "curl" | "crossfade";

export type LayoutDims = {
  bookW: number;  // berechnete Buchbreite im Container
  bookH: number;  // berechnete Buchhöhe im Container
  scale: number;  // relativ zu nativer pageHeight
};

export function decideViewMode(containerW: number, pageWidth: number): ViewMode {
  return containerW < 900 ? "single" : "spread";
}

export function calcLayoutDims(
  containerW: number,
  containerH: number,
  view: ViewMode,
  pageW: number,
  pageH: number,
  zoom: number
): LayoutDims {
  const aspect = pageW / pageH;
  const targetW = view === "spread" ? containerW * 0.96 : containerW * 0.72;
  const targetH = containerH * 0.92;

  let bookW = targetW;
  let bookH = targetW / (view === "spread" ? (2 * aspect) : aspect);
  if (bookH > targetH) {
    bookH = targetH;
    bookW = bookH * (view === "spread" ? (2 * aspect) : aspect);
  }

  bookW *= zoom;
  bookH *= zoom;

  const scale = (bookH / pageH);
  return { bookW, bookH, scale };
}

export function shouldUseCrossfade(prefersReducedMotion: boolean, fpsEstimate: number | null): boolean {
  if (prefersReducedMotion) return true;
  if (fpsEstimate !== null && fpsEstimate < 40) return true;
  return false;
}

export function clampPage(target: number, pageCount: number) {
  if (target < 1) return 1;
  if (target > pageCount) return pageCount;
  return target;
}
