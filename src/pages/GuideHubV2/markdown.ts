import type { Lang } from "../../i18n";

export type Frontmatter = {
  title: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  gallery: string[];
};

export type TocItem = { id: string; text: string };

export type MarkdownDoc = {
  id: string;
  lang: Lang;
  frontmatter: Frontmatter;
  body: string;
  html: string;
  toc: TocItem[];
};

export type GuideSelection = {
  tab?: string;
  sub?: string;
  sub2?: string;
};

const RAW_MARKDOWN = import.meta.glob("../../content/guidehub-v2/**/*.md", {
  query: "?raw",
  import: "default",
});
const CACHE = new Map<string, Promise<MarkdownDoc | null>>();

const EMPTY_FRONTMATTER: Frontmatter = {
  title: "",
  category: "",
  createdAt: "",
  updatedAt: "",
  gallery: [],
};

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1);
    return inner
      .split(",")
      .map((item) => stripQuotes(item).trim())
      .filter(Boolean);
  }
  return [stripQuotes(trimmed)].filter(Boolean);
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const cleaned = raw.replace(/^\uFEFF/, "");
  const match = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: { ...EMPTY_FRONTMATTER }, body: cleaned };

  const frontmatter: Frontmatter = { ...EMPTY_FRONTMATTER };
  const lines = match[1].split(/\r?\n/);
  let currentKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const listMatch = trimmed.match(/^-+\s+(.*)$/);
    if (currentKey === "gallery" && listMatch) {
      frontmatter.gallery.push(stripQuotes(listMatch[1]));
      continue;
    }

    const keyMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (!keyMatch) continue;

    const key = keyMatch[1];
    const value = keyMatch[2] ?? "";
    currentKey = key;

    if (key === "gallery") {
      frontmatter.gallery = parseInlineList(value);
      continue;
    }

    if (key === "title" || key === "category" || key === "createdAt" || key === "updatedAt") {
      frontmatter[key] = stripQuotes(value);
    }
  }

  const body = cleaned.slice(match[0].length);
  return { frontmatter, body };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdown(value: string): string {
  let out = escapeHtml(value);

  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const safeAlt = escapeAttr(String(alt ?? ""));
    const safeUrl = escapeAttr(String(url ?? ""));
    return `<img src="${safeUrl}" alt="${safeAlt}" />`;
  });

  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safeText = escapeHtml(String(text ?? ""));
    const safeUrl = escapeAttr(String(url ?? ""));
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeText}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildHtml(body: string): { html: string; toc: TocItem[] } {
  const lines = body.split(/\r?\n/);
  const html: string[] = [];
  const toc: TocItem[] = [];
  const usedIds = new Set<string>();
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  const uniqueId = (base: string) => {
    let id = base || "section";
    let i = 1;
    while (usedIds.has(id)) {
      id = `${base}-${i}`;
      i += 1;
    }
    usedIds.add(id);
    return id;
  };

  const extractAnchor = (text: string) => {
    const match = text.match(/\s*\{#([a-zA-Z0-9\-_]+)\}\s*$/);
    if (!match) return { text, anchor: null as string | null };
    const cleaned = text.replace(match[0], "").trimEnd();
    return { text: cleaned, anchor: match[1] };
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      closeList();
      html.push("<hr />");
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const rawText = headingMatch[2].trim();
      const { text, anchor } = extractAnchor(rawText);
      const content = inlineMarkdown(text);
      const baseId = anchor || slugify(text) || "section";
      if (level === 2) {
        const id = uniqueId(baseId);
        toc.push({ id, text });
        html.push(`<h2 id="${id}">${content}</h2>`);
      } else if (level === 1) {
        if (anchor) {
          const id = uniqueId(baseId);
          html.push(`<h1 id="${id}">${content}</h1>`);
        } else {
          html.push(`<h1>${content}</h1>`);
        }
      } else {
        if (anchor) {
          const id = uniqueId(baseId);
          html.push(`<h3 id="${id}">${content}</h3>`);
        } else {
          html.push(`<h3>${content}</h3>`);
        }
      }
      continue;
    }

    const listMatch = trimmed.match(/^-+\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  closeList();
  return { html: html.join("\n"), toc };
}

function buildPath(lang: Lang, selection: GuideSelection): string {
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

export async function loadGuideMarkdown(
  selection: GuideSelection,
  lang: Lang
): Promise<MarkdownDoc | null> {
  const cacheKey = `${lang}:${selection.tab ?? ""}:${selection.sub ?? ""}:${selection.sub2 ?? ""}`;
  if (CACHE.has(cacheKey)) {
    return CACHE.get(cacheKey)!;
  }

  const task = (async () => {
    const localizedPath = buildPath(lang, selection);
    const fallbackPath = buildPath("en", selection);
    const loader =
      (RAW_MARKDOWN as Record<string, () => Promise<string>>)[localizedPath] ||
      (RAW_MARKDOWN as Record<string, () => Promise<string>>)[fallbackPath];

    if (!loader) return null;

    const raw = await loader();
    const { frontmatter, body } = parseFrontmatter(raw);
    const { html, toc } = buildHtml(body);
    const finalLang = (RAW_MARKDOWN as Record<string, () => Promise<string>>)[localizedPath]
      ? lang
      : "en";

    return {
      id: selection.sub2 || selection.sub || selection.tab || "home",
      lang: finalLang,
      frontmatter,
      body,
      html,
      toc,
    };
  })();

  CACHE.set(cacheKey, task);
  return task;
}
