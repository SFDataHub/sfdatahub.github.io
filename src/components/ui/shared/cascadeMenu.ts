import type React from "react";

/** Shared by toplist headers and favorite cards: fixed, adjoining menu levels. */
export function positionCascade(levels: (HTMLElement | null)[], origin: { x: number; y: number }) {
  const fit = (n: number, size: number, limit: number) => Math.max(4, Math.min(n, limit - size - 4));
  let direction = 1;
  levels.forEach((el, level) => {
    if (!el) return;
    const owner = levels[level - 1];
    const anchor = owner?.querySelector<HTMLElement>('[aria-expanded="true"]')?.getBoundingClientRect();
    const rect = owner?.getBoundingClientRect();
    const width = el.offsetWidth;
    if (rect && (direction === 1 ? rect.right + width > window.innerWidth - 4 : rect.left - width < 4)) direction *= -1;
    const left = rect ? direction === 1 ? rect.right : rect.left - width : origin.x;
    el.style.left = `${fit(left, width, window.innerWidth)}px`;
    el.style.top = `${fit(anchor?.top ?? origin.y, el.offsetHeight, window.innerHeight)}px`;
  });
}

export function menuKeys(event: React.KeyboardEvent, close: () => void) {
  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
  const node = event.target as HTMLElement;
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const items = [...(node.closest('[role="menu"]') ?? event.currentTarget).querySelectorAll<HTMLElement>("button:not(:disabled)")].filter(el => el.getClientRects().length);
  const index = items.indexOf(node);
  items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
}
