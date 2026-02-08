import React from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ContentShell from "../../components/ContentShell";
import { categories } from "../../components/guidehub/config";
import { guideAssetByKey } from "../../data/guidehub/assets";
import guideHubLogo from "../../assets/logo_guidehub.png";
import type { Lang } from "../../i18n";
import { loadGuideMarkdown, type GuideSelection, type MarkdownDoc } from "./markdown";
import { AMRuneBonusesTable } from "../GuideHub/GameFeatures/ArenaAM/AMRuneBonuses";
import { PackageSkipOrderTable } from "../GuideHub/GameFeatures/Fortress/PackageSkipOrder";
import FortressCalculator from "../GuideHub/Calculators/FortressCalculator";
import UnderworldCalculator from "../GuideHub/Calculators/UnderworldCalculator";
import HudBox from "../../components/ui/hud/box/HudBox";
import InfographicsGallery from "./Infographics/InfographicsGallery";
import styles from "./GuideHubV2.module.css";

type GuideEntry = {
  id: string;
  label: string;
  tab: string;
  sub?: string;
  sub2?: string;
  categoryLabel: string;
};

type NavSelection = {
  tab: string;
  sub?: string;
  sub2?: string;
};

type TranslationFn = ReturnType<typeof useTranslation>["t"];

type GuideHubSidebarProps = {
  tab: string;
  sub: string;
  sub2: string;
  isHome: boolean;
  openTabs: Record<string, boolean>;
  openSubs: Record<string, Record<string, boolean>>;
  onToggleTab: (tabKey: string) => void;
  onToggleSub: (tabKey: string, subKey: string) => void;
  onNavigate: (next: NavSelection) => void;
  onNavigateHome: () => void;
  onNavigateCategory: (tabKey: string) => void;
  onNavigateSub: (tabKey: string, subKey: string) => void;
  t: TranslationFn;
};

const FortressLinkButtons: React.FC = () => {
  const [params, setParams] = useSearchParams();

  const openSub = (sub2: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", "gamefeatures");
    next.set("sub", "fortress");
    next.set("sub2", sub2);
    setParams(next, { replace: false, preventScrollReset: true });
  };

  return (
    <div className={styles.hudButtonGrid}>
      <button
        type="button"
        className={styles.hudButton}
        onClick={() => openSub("fortress-attack-duplication")}
      >
        <HudBox padding="md" hover className={styles.hudButtonBox}>
          <span className={styles.hudButtonText}>Fortress attack duplication guide</span>
        </HudBox>
      </button>
      <button
        type="button"
        className={styles.hudButton}
        onClick={() => openSub("fortress-calculator")}
      >
        <HudBox padding="md" hover className={styles.hudButtonBox}>
          <span className={styles.hudButtonText}>Fortress Calculator</span>
        </HudBox>
      </button>
      <button
        type="button"
        className={styles.hudButton}
        onClick={() => openSub("fortress-package-skip-order")}
      >
        <HudBox padding="md" hover className={styles.hudButtonBox}>
          <span className={styles.hudButtonText}>Fortress Package skip order</span>
        </HudBox>
      </button>
    </div>
  );
};

const ArenaAMLinkButtons: React.FC = () => {
  const [params, setParams] = useSearchParams();

  const openSub = (sub2: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", "gamefeatures");
    next.set("sub", "arenaam");
    next.set("sub2", sub2);
    setParams(next, { replace: false, preventScrollReset: true });
  };

  return (
    <div className={styles.hudButtonGrid}>
      <button
        type="button"
        className={styles.hudButton}
        onClick={() => openSub("am-rune-bonuses")}
      >
        <HudBox padding="md" hover className={styles.hudButtonBox}>
          <span className={styles.hudButtonText}>Rune Bonuses</span>
        </HudBox>
      </button>
      <button
        type="button"
        className={styles.hudButton}
        onClick={() => openSub("am-build-order")}
      >
        <HudBox padding="md" hover className={styles.hudButtonBox}>
          <span className={styles.hudButtonText}>Build Order</span>
        </HudBox>
      </button>
    </div>
  );
};

const ArenaAMRelatedButtons: React.FC = () => {
  const { i18n } = useTranslation();
  const isGerman = i18n.language?.startsWith("de");
  const relatedLinks = [
    {
      label: "SF Tavernen Discord FAQ",
      href: "https://discord.com/channels/551152314329858048/1415410382981562542",
    },
    {
      label: "SF Tools",
      href: "https://sftools.mar21.eu/idle.html",
    },
    {
      label: "SF Coaching",
      href: isGerman
        ? "https://discord.com/channels/1381647290606817452/1420471280284733491"
        : "https://discord.com/channels/1381647290606817452/1420473511364923432",
    },
  ];

  return (
    <div className={styles.hudButtonGrid}>
      {relatedLinks.map((item) => (
        <a
          key={item.href}
          className={`${styles.hudButton} ${styles.hudButtonLink}`}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <HudBox padding="md" hover className={styles.hudButtonBox}>
            <span className={styles.hudButtonText}>{item.label}</span>
          </HudBox>
        </a>
      ))}
    </div>
  );
};

const FortressRelatedButtons: React.FC = () => {
  const relatedLinks = [
    {
      label: "SF Coaching",
      href: "https://discord.com/channels/1381647290606817452/1420473231256850584",
    },
    {
      label: "SF Tavernen Discord FAQ",
      href: "https://discord.com/channels/551152314329858048/1415410624606896279",
    },
    {
      label: "SF Tools",
      href: "https://sftools.mar21.eu/fortress.html",
    },
  ];

  return (
    <div className={styles.hudButtonGrid}>
      {relatedLinks.map((item) => (
        <a
          key={item.href}
          className={`${styles.hudButton} ${styles.hudButtonLink}`}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <HudBox padding="md" hover className={styles.hudButtonBox}>
            <span className={styles.hudButtonText}>{item.label}</span>
          </HudBox>
        </a>
      ))}
    </div>
  );
};

function buildGuideEntries(): GuideEntry[] {
  const entries: GuideEntry[] = [];

  categories.forEach((cat) => {
    (cat.sub || []).forEach((subItem) => {
      if (subItem.sub2 && subItem.sub2.length) {
        const hasDeeper = subItem.sub2.some((s2) => s2.sub2 && s2.sub2.length);
        if (hasDeeper) {
          subItem.sub2.forEach((s2) => {
            if (s2.sub2 && s2.sub2.length) {
              s2.sub2.forEach((s3) => {
                entries.push({
                  id: s3.key,
                  label: s3.label,
                  tab: cat.key,
                  sub: subItem.key,
                  sub2: s3.key,
                  categoryLabel: cat.label,
                });
              });
            }
          });
        } else {
          subItem.sub2.forEach((s2) => {
            entries.push({
              id: s2.key,
              label: s2.label,
              tab: cat.key,
              sub: subItem.key,
              sub2: s2.key,
              categoryLabel: cat.label,
            });
          });
        }
      } else {
        entries.push({
          id: subItem.key,
          label: subItem.label,
          tab: cat.key,
          sub: subItem.key,
          categoryLabel: cat.label,
        });
      }
    });
  });

  return entries;
}

function normalizeLang(value: string | undefined): Lang {
  return value?.startsWith("de") ? "de" : "en";
}

const MIN_LOADING_MS = 330;

const GuideHubSidebar: React.FC<GuideHubSidebarProps> = ({
  tab,
  sub,
  sub2,
  isHome,
  openTabs,
  openSubs,
  onToggleTab,
  onToggleSub,
  onNavigate,
  onNavigateHome,
  onNavigateCategory,
  onNavigateSub,
  t,
}) => {
  const [query, setQuery] = React.useState("");
  const queryLower = query.trim().toLowerCase();
  const orderedCategories = React.useMemo(() => {
    const featured = categories.find((cat) => cat.key === "gamefeatures");
    if (!featured) return categories;
    return [featured, ...categories.filter((cat) => cat.key !== "gamefeatures")];
  }, []);
  const matchText = React.useCallback(
    (value: string) => !queryLower || value.toLowerCase().includes(queryLower),
    [queryLower]
  );

  const renderNavEntries = () =>
    orderedCategories.map((cat) => {
      const catMatches = matchText(cat.label);
      const subBlocks = (cat.sub || []).map((subItem) => {
        const subMatches = catMatches || matchText(subItem.label);
        let leafBlocks: React.ReactNode[] = [];

        if (subItem.sub2 && subItem.sub2.length) {
          const hasDeeper = subItem.sub2.some((s2) => s2.sub2 && s2.sub2.length);
          if (hasDeeper) {
            leafBlocks = subItem.sub2
              .map((s2) => {
                if (!s2.sub2 || !s2.sub2.length) return null;
                const groupMatches = subMatches || matchText(s2.label);
                const leaves = s2.sub2.filter((s3) => groupMatches || matchText(s3.label));
                if (!leaves.length) return null;
                return (
                  <div key={`${cat.key}-${subItem.key}-${s2.key}`} className={styles.subGroup}>
                    <div className={styles.navSubTitle}>{s2.label}</div>
                    {leaves.map((s3) => (
                      <button
                        key={`${cat.key}-${subItem.key}-${s3.key}`}
                        className={`${styles.navItem} ${styles.navItemIndented} ${
                          tab === cat.key && sub === subItem.key && sub2 === s3.key
                            ? styles.navItemActive
                            : ""
                        }`}
                        onClick={() => onNavigate({ tab: cat.key, sub: subItem.key, sub2: s3.key })}
                        type="button"
                      >
                        {s3.label}
                      </button>
                    ))}
                  </div>
                );
              })
              .filter(Boolean) as React.ReactNode[];
          } else {
            const leaves = subItem.sub2.filter((s2) => subMatches || matchText(s2.label));
            leafBlocks = leaves.map((s2) => (
              <button
                key={`${cat.key}-${subItem.key}-${s2.key}`}
                className={`${styles.navItem} ${styles.navItemIndented} ${
                  tab === cat.key && sub === subItem.key && sub2 === s2.key
                    ? styles.navItemActive
                    : ""
                }`}
                onClick={() => onNavigate({ tab: cat.key, sub: subItem.key, sub2: s2.key })}
                type="button"
              >
                {s2.label}
              </button>
            ));
          }
        }

        const hasLeafContent = leafBlocks.length > 0;
        if (!subMatches && !hasLeafContent) return null;
        const isSubOpen =
          !!openSubs[cat.key]?.[subItem.key] ||
          (!!queryLower && hasLeafContent);

        return (
          <div key={`${cat.key}-${subItem.key}`} className={styles.subSection}>
            <button
              className={`${styles.navRow} ${styles.subRow} ${
                tab === cat.key && sub === subItem.key && !sub2
                  ? styles.navItemActive
                  : ""
              }`}
              onClick={() => {
                onToggleSub(cat.key, subItem.key);
                onNavigateSub(cat.key, subItem.key);
              }}
              aria-expanded={isSubOpen}
              type="button"
            >
              <span className={styles.navRowLabel}>{subItem.label}</span>
              <span className={`${styles.navRowChevron} ${isSubOpen ? styles.navRowChevronOpen : ""}`} />
            </button>
            <div className={`${styles.subEntryList} ${isSubOpen ? styles.entryListOpen : styles.entryListClosed}`}>
              {isSubOpen ? leafBlocks : null}
            </div>
          </div>
        );
      });

      const visibleSubBlocks = subBlocks.filter(Boolean) as React.ReactNode[];
      const hasContent = visibleSubBlocks.length > 0;
      if (!catMatches && !hasContent && queryLower) return null;
      const isOpen =
        !!openTabs[cat.key] ||
        (!!queryLower && (catMatches || hasContent));

      return (
        <div key={cat.key} className={styles.navSection}>
          <button
            className={`${styles.navRow} ${styles.categoryRow} ${
              tab === cat.key && !sub && !sub2 ? styles.navItemActive : ""
            }`}
            onClick={() => {
              onToggleTab(cat.key);
              onNavigateCategory(cat.key);
            }}
            aria-expanded={isOpen}
            type="button"
          >
            <span className={styles.navRowLabel}>{cat.label}</span>
            <span className={`${styles.navRowChevron} ${isOpen ? styles.navRowChevronOpen : ""}`} />
          </button>
          <div className={`${styles.entryList} ${isOpen ? styles.entryListOpen : styles.entryListClosed}`}>
            {isOpen ? visibleSubBlocks : null}
          </div>
        </div>
      );
    });

  return (
    <div className={styles.nav}>
      <div className={styles.navCard}>
        <div className={styles.navHeader}>
          <div className={styles.logoWrap}>
            <img
              src={guideHubLogo}
              alt="Guide Hub"
              className={styles.logoImg}
            />
          </div>
          <div className={styles.divider} />
          <input
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("guides.v2.searchPlaceholder", { defaultValue: "Search guides" })}
            aria-label={t("guides.v2.searchLabel", { defaultValue: "Search guides" })}
          />
        </div>
        <div className={styles.navScroller}>
          <div className={styles.navHomeWrap}>
            <button
              className={`${styles.navItem} ${isHome ? styles.navItemActive : ""}`}
              onClick={onNavigateHome}
              type="button"
            >
              {t("guides.v2.navHomeLabel", { defaultValue: "Home" })}
            </button>
          </div>
          {renderNavEntries()}
        </div>
      </div>
    </div>
  );
};

const GuideHubV2: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);

  const tab = params.get("tab") || "";
  const sub = params.get("sub") || "";
  const sub2 = params.get("sub2") || "";
  const selection = React.useMemo<GuideSelection>(
    () => ({
      tab: tab || undefined,
      sub: sub || undefined,
      sub2: sub2 || undefined,
    }),
    [tab, sub, sub2]
  );
  const [displayedSelection, setDisplayedSelection] = React.useState<GuideSelection>(() => ({
    tab: tab || undefined,
    sub: sub || undefined,
    sub2: sub2 || undefined,
  }));
  const displayedTab = displayedSelection.tab || "";
  const displayedSub = displayedSelection.sub || "";
  const displayedSub2 = displayedSelection.sub2 || "";
  const isHome = !displayedTab && !displayedSub && !displayedSub2;
  const isInfographics = displayedTab === "infographics" && !displayedSub && !displayedSub2;

  const entries = React.useMemo(() => buildGuideEntries(), []);
  const activeEntry = React.useMemo(
    () =>
      entries.find(
        (entry) =>
          entry.tab === displayedTab &&
          entry.sub === displayedSub &&
          (entry.sub2 ?? "") === displayedSub2
      ) || null,
    [entries, displayedTab, displayedSub, displayedSub2]
  );
  const activeCategory = React.useMemo(
    () => categories.find((cat) => cat.key === displayedTab) || null,
    [displayedTab]
  );
  const activeSub = React.useMemo(
    () => activeCategory?.sub?.find((item) => item.key === displayedSub) || null,
    [activeCategory, displayedSub]
  );

  const [openTabs, setOpenTabs] = React.useState<Record<string, boolean>>({});
  const [openSubs, setOpenSubs] = React.useState<Record<string, Record<string, boolean>>>({});

  const [doc, setDoc] = React.useState<MarkdownDoc | null>(null);
  const [viewStatus, setViewStatus] = React.useState<"idle" | "ready" | "missing">("idle");
  const [isLoading, setIsLoading] = React.useState(false);
  const loadSeqRef = React.useRef(0);
  const overlayStartRef = React.useRef(0);
  const swapTimerRef = React.useRef<number | null>(null);

  const clearSwapTimer = React.useCallback(() => {
    if (!swapTimerRef.current) return;
    window.clearTimeout(swapTimerRef.current);
    swapTimerRef.current = null;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    clearSwapTimer();
    overlayStartRef.current = Date.now();
    setIsLoading(true);

    loadGuideMarkdown(selection, lang).then((result) => {
      if (cancelled || loadSeqRef.current !== seq) return;

      const nextStatus: "ready" | "missing" = result ? "ready" : "missing";
      const applySwap = () => {
        if (cancelled || loadSeqRef.current !== seq) return;
        setDoc(result);
        setViewStatus(nextStatus);
        setDisplayedSelection(selection);
        setIsLoading(false);
      };

      const elapsed = Date.now() - overlayStartRef.current;
      const remaining = MIN_LOADING_MS - elapsed;
      if (remaining <= 0) {
        applySwap();
      } else {
        swapTimerRef.current = window.setTimeout(applySwap, remaining);
      }
    });

    return () => {
      cancelled = true;
      clearSwapTimer();
    };
  }, [selection, lang, clearSwapTimer]);

  React.useEffect(() => {
    if (!tab) return;
    setOpenTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }, [tab]);

  React.useEffect(() => {
    if (!tab || !sub) return;
    setOpenSubs((prev) => {
      const tabState = prev[tab] || {};
      if (tabState[sub]) return prev;
      return {
        ...prev,
        [tab]: { ...tabState, [sub]: true },
      };
    });
  }, [tab, sub]);

  const handleNavigate = React.useCallback(
    (next: NavSelection) => {
      const updated = new URLSearchParams(params);
      updated.set("tab", next.tab);
      if (next.sub) updated.set("sub", next.sub);
      else updated.delete("sub");
      if (next.sub2) updated.set("sub2", next.sub2);
      else updated.delete("sub2");
      setParams(updated, { replace: false, preventScrollReset: true });
    },
    [params, setParams]
  );

  const handleNavigateHome = React.useCallback(() => {
    const updated = new URLSearchParams(params);
    updated.delete("tab");
    updated.delete("sub");
    updated.delete("sub2");
    setParams(updated, { replace: false, preventScrollReset: true });
  }, [params, setParams]);

  const handleToggleTab = React.useCallback((tabKey: string) => {
    setOpenTabs((prev) => ({ ...prev, [tabKey]: !prev[tabKey] }));
  }, []);

  const handleNavigateCategory = React.useCallback(
    (tabKey: string) => {
      const updated = new URLSearchParams(params);
      updated.set("tab", tabKey);
      updated.delete("sub");
      updated.delete("sub2");
      setParams(updated, { replace: false, preventScrollReset: true });
    },
    [params, setParams]
  );

  const handleToggleSub = React.useCallback((tabKey: string, subKey: string) => {
    setOpenSubs((prev) => {
      const tabState = prev[tabKey] || {};
      return {
        ...prev,
        [tabKey]: { ...tabState, [subKey]: !tabState[subKey] },
      };
    });
  }, []);

  const handleNavigateSub = React.useCallback(
    (tabKey: string, subKey: string) => {
      const updated = new URLSearchParams(params);
      updated.set("tab", tabKey);
      updated.set("sub", subKey);
      updated.delete("sub2");
      setParams(updated, { replace: false, preventScrollReset: true });
    },
    [params, setParams]
  );

  const scrollToSection = React.useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const container = target.closest("main");
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const top = targetRect.top - containerRect.top + container.scrollTop - 12;
      container.scrollTo({ top, behavior: "smooth" });
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const title =
    doc?.frontmatter.title ||
    activeEntry?.label ||
    activeSub?.label ||
    activeCategory?.label ||
    "";
  const category =
    doc?.frontmatter.category ||
    activeCategory?.label ||
    activeEntry?.categoryLabel ||
    "";
  const tocItems = React.useMemo(
    () => (doc?.toc || []).filter((item) => item.id !== "overview"),
    [doc]
  );

  const galleryItems = React.useMemo(() => {
    if (!doc?.frontmatter.gallery || doc.frontmatter.gallery.length === 0) return [];
    return doc.frontmatter.gallery
      .map((item) => {
        if (!item) return null;
        const isUrl = /^https?:\/\//i.test(item);
        if (isUrl) {
          return { key: item, thumb: item, full: item };
        }
        const asset = guideAssetByKey(item, 640);
        const thumb = asset.thumb || asset.url;
        const full = asset.url || asset.thumb;
        if (!thumb || !full) return null;
        return { key: item, thumb, full };
      })
      .filter(Boolean) as Array<{ key: string; thumb: string; full: string }>;
  }, [doc]);

  const [activeImage, setActiveImage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activeImage) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveImage(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeImage]);

  const contentGridClass = galleryItems.length
    ? `${styles.contentGrid} ${styles.contentGridHasGallery}`
    : styles.contentGrid;
  const markdownClass = isHome
    ? `${styles.markdown} ${styles.markdownHome}`
    : styles.markdown;
  const renderTocPanel = () => (
    <div className={styles.tocRow}>
      <div className={styles.tocLabel}>
        {t("guides.v2.sectionsLabel", { defaultValue: "Sections" })}
      </div>
      <div className={styles.tocPills}>
        {tocItems.length === 0 ? (
          <span className={styles.galleryEmpty}>
            {t("guides.v2.noSections", { defaultValue: "No sections" })}
          </span>
        ) : (
          tocItems.map((item) => (
            <button
              key={item.id}
              className={styles.tocPill}
              onClick={() => scrollToSection(item.id)}
              type="button"
            >
              {item.text}
            </button>
          ))
        )}
      </div>
    </div>
  );

  const renderMarkdown = () => {
    if (!doc) return null;
    const infographicsBlock = isInfographics ? <InfographicsGallery /> : null;
    const embedRegistry = {
      "am-rune-bonuses-table": AMRuneBonusesTable,
      "arenaam-link-buttons": ArenaAMLinkButtons,
      "arenaam-related-buttons": ArenaAMRelatedButtons,
      "fortress-link-buttons": FortressLinkButtons,
      "fortress-related-buttons": FortressRelatedButtons,
      "fortress-package-skip-order-table": PackageSkipOrderTable,
      "fortress-calculator": FortressCalculator,
      "underworld-calculator": UnderworldCalculator,
    } as const;
    const hasEmbeds = Object.keys(embedRegistry).some((key) =>
      doc.html.includes(`data-embed="${key}"`)
    );
    const hasAssets = doc.html.includes('data-asset="');
    const hasDynamicBlocks = hasEmbeds || hasAssets;

    const renderHtmlWithEmbeds = (html: string) => {
      if (!hasDynamicBlocks) {
        return <div dangerouslySetInnerHTML={{ __html: html }} />;
      }

      const regex = /<div data-(embed|asset)="([a-z0-9-_]+)"><\/div>/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let chunkIndex = 0;
      const nodes: React.ReactNode[] = [];

      while ((match = regex.exec(html))) {
        const before = html.slice(lastIndex, match.index);
        if (before) {
          nodes.push(
            <div
              key={`html-${chunkIndex}`}
              dangerouslySetInnerHTML={{ __html: before }}
            />
          );
          chunkIndex += 1;
        }

        const blockType = match[1];
        const blockKey = match[2];
        if (blockType === "embed") {
          const EmbedComponent = embedRegistry[blockKey as keyof typeof embedRegistry];
          if (EmbedComponent) {
            nodes.push(<EmbedComponent key={`embed-${blockKey}-${chunkIndex}`} />);
            chunkIndex += 1;
          } else {
            nodes.push(
              <div
                key={`html-${chunkIndex}`}
                dangerouslySetInnerHTML={{ __html: match[0] }}
              />
            );
            chunkIndex += 1;
          }
        } else {
          const asset = guideAssetByKey(blockKey, 960);
          const src = asset.thumb || asset.url;
          if (src) {
            nodes.push(
              <img
                key={`asset-${blockKey}-${chunkIndex}`}
                src={src}
                alt={blockKey}
              />
            );
            chunkIndex += 1;
          } else {
            nodes.push(<div key={`asset-${blockKey}-${chunkIndex}`} />);
            chunkIndex += 1;
          }
        }

        lastIndex = match.index + match[0].length;
      }

      const rest = html.slice(lastIndex);
      if (rest) {
        nodes.push(
          <div
            key={`html-${chunkIndex}`}
            dangerouslySetInnerHTML={{ __html: rest }}
          />
        );
      }

      if (nodes.length === 0) {
        return <div dangerouslySetInnerHTML={{ __html: html }} />;
      }

      return (
        <>
          {nodes}
        </>
      );
    };

    const overviewTag = '<h2 id="overview">';
    const overviewIndex = doc.html.indexOf(overviewTag);
    if (overviewIndex === -1) {
      if (!hasDynamicBlocks) {
        return (
          <div className={markdownClass}>
            <div dangerouslySetInnerHTML={{ __html: doc.html }} />
            {infographicsBlock}
          </div>
        );
      }
      return (
        <div className={markdownClass}>
          {renderHtmlWithEmbeds(doc.html)}
          {infographicsBlock}
        </div>
      );
    }

    const headingEnd = doc.html.indexOf("</h2>", overviewIndex);
    if (headingEnd === -1) {
      if (!hasDynamicBlocks) {
        return (
          <div className={markdownClass}>
            <div dangerouslySetInnerHTML={{ __html: doc.html }} />
            {infographicsBlock}
          </div>
        );
      }
      return (
        <div className={markdownClass}>
          {renderHtmlWithEmbeds(doc.html)}
          {infographicsBlock}
        </div>
      );
    }

    const before = doc.html.slice(0, headingEnd + 5);
    const after = doc.html.slice(headingEnd + 5);

    if (!hasDynamicBlocks) {
      return (
        <div className={markdownClass}>
          <div dangerouslySetInnerHTML={{ __html: before }} />
          {renderTocPanel()}
          {infographicsBlock}
          <div dangerouslySetInnerHTML={{ __html: after }} />
        </div>
      );
    }

    return (
      <div className={markdownClass}>
        {renderHtmlWithEmbeds(before)}
        {renderTocPanel()}
        {infographicsBlock}
        {renderHtmlWithEmbeds(after)}
      </div>
    );
  };

  const sidebar = (
    <GuideHubSidebar
      tab={tab}
      sub={sub}
      sub2={sub2}
      isHome={isHome}
      openTabs={openTabs}
      openSubs={openSubs}
      onToggleTab={handleToggleTab}
      onToggleSub={handleToggleSub}
      onNavigate={handleNavigate}
      onNavigateHome={handleNavigateHome}
      onNavigateCategory={handleNavigateCategory}
      onNavigateSub={handleNavigateSub}
      t={t}
    />
  );

  return (
    <ContentShell left={sidebar} leftWidth={280} leftFullHeight>
      <div className={styles.viewerWrap}>
        <section className={styles.viewer}>
          <div className={styles.viewerCard}>
            {viewStatus === "missing" && (
              <div className={styles.missingState}>
                <div className={styles.emptyTitle}>
                  {t("guides.v2.missingTitle", { defaultValue: "Guide not available yet" })}
                </div>
                <div>
                  {t("guides.v2.missingBody", {
                    defaultValue: "This guide does not have markdown content yet.",
                  })}
                </div>
              </div>
            )}

            {doc && viewStatus !== "missing" && (
              <>
                <div className={styles.viewerHeader}>
                  <div>
                    <h1 className={styles.viewerTitle}>{title}</h1>
                    <div className={styles.metaRow}>
                      <span>
                        <span className={styles.metaLabel}>
                          {t("guides.v2.createdLabel", { defaultValue: "Created" })}:
                        </span>
                        {doc.frontmatter.createdAt || "-"}
                      </span>
                      <span>
                        <span className={styles.metaLabel}>
                          {t("guides.v2.updatedLabel", { defaultValue: "Last edited" })}:
                        </span>
                        {doc.frontmatter.updatedAt || "-"}
                      </span>
                    </div>
                  </div>
                  {category && <div className={styles.categoryPill}>{category}</div>}
                </div>

                <div className={contentGridClass}>
                  {renderMarkdown()}

                  {galleryItems.length > 0 && (
                    <aside className={styles.galleryCard}>
                      <div className={styles.galleryTitle}>
                        {t("guides.v2.galleryLabel", { defaultValue: "Gallery" })}
                      </div>
                      <div className={styles.galleryGrid}>
                        {galleryItems.map((item) => (
                          <img
                            key={item.key}
                            src={item.thumb}
                            alt={item.key}
                            className={styles.galleryThumb}
                            onClick={() => setActiveImage(item.full)}
                          />
                        ))}
                      </div>
                    </aside>
                  )}
                </div>
              </>
            )}

            <div
              className={`${styles.viewerLoadingOverlay} ${
                isLoading ? styles.viewerLoadingOverlayVisible : ""
              }`}
            >
              <div className={styles.loadingState}>
                <div className={styles.loadingOverlayContent}>
                  <span className={styles.loadingSpinner} aria-hidden />
                  <span>{t("guides.v2.loading", { defaultValue: "Loading guide..." })}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {activeImage && (
        <div className={styles.overlay} onClick={() => setActiveImage(null)}>
          <div className={styles.overlayPanel} onClick={(event) => event.stopPropagation()}>
            <button className={styles.overlayClose} onClick={() => setActiveImage(null)} type="button">
              {t("guides.v2.closeLabel", { defaultValue: "Close" })}
            </button>
            <img className={styles.overlayImage} src={activeImage} alt="Guide preview" />
          </div>
        </div>
      )}
    </ContentShell>
  );
};

export default GuideHubV2;
