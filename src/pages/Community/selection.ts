export type CommunityTab = "creators" | "records";

/** The hub has two views; removed and unknown selections open Creator Hub. */
export function communityTab(search: string): CommunityTab {
  return new URLSearchParams(search).get("tab") === "records" ? "records" : "creators";
}

export function communityAnalyticsPath(pathname: string, search: string): string {
  if (pathname !== "/community") return pathname;
  const tab = new URLSearchParams(search).get("tab");
  return tab === "creators" || tab === "records" ? `/community/${tab}` : "/community";
}
