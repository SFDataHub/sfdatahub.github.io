/** Shared page scroll contract from base.css; bounded dialogs retain their own scroller. */
export function getAppPageScrollport() {
  return {
    element: (document.scrollingElement ?? document.documentElement) as HTMLElement,
    events: window,
    get top() {
      return Math.max(0, document.querySelector("#app-shell > header")?.getBoundingClientRect().bottom ?? 0);
    },
  };
}
