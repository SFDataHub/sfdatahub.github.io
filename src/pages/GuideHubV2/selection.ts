import type { Lang } from "../../i18n";

export type GuideSelection = {
  tab?: string;
  sub?: string;
  sub2?: string;
};

export const RAW_MARKDOWN = import.meta.glob("../../content/guidehub-v2/**/*.md", {
  query: "?raw",
  import: "default",
});
export function buildPath(lang: Lang, selection: GuideSelection): string {
  const { tab, sub, sub2 } = selection;
  if (!tab && !sub && !sub2) {
    return `../../content/guidehub-v2/${lang}/home.md`;
  }
  if (tab && !sub && !sub2) {
    return `../../content/guidehub-v2/${lang}/${tab}/index.md`;
  }
  if (tab && sub && !sub2) {
    return `../../content/guidehub-v2/${lang}/${tab}/${sub}/index.md`;
  }
  if (tab && sub && sub2) {
    return `../../content/guidehub-v2/${lang}/${tab}/${sub}/${sub2}.md`;
  }
  return `../../content/guidehub-v2/${lang}/home.md`;
}

/** Resolve the same content file as the viewer, independently of language.
 * Unknown selections share its single unavailable screen; malformed shapes that
 * the viewer ignores resolve to home. Never use unchecked query values as paths.
 */
export function guideHubAnalyticsPath(search: string): string {
  const params = new URLSearchParams(search);
  const file = buildPath("en", {
    tab: params.get("tab") || undefined,
    sub: params.get("sub") || undefined,
    sub2: params.get("sub2") || undefined,
  }).replace("../../content/guidehub-v2/en/", "");
  const known = Object.keys(RAW_MARKDOWN).some(path =>
    path.replace(/^.*\/guidehub-v2\/[^/]+\//, "") === file
  );
  if (!known) return "/guidehub-v2/unavailable";
  if (file === "home.md") return "/guidehub-v2";
  return "/guidehub-v2/" + file.replace(/(?:\/index)?\.md$/, "");
}
