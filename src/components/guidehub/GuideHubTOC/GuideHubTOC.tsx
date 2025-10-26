import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";
import type { Category, SubCategory } from "../config";

type Props = {
  /** Kategorien direkt aus components/guidehub/config (1:1) */
  categories: Category[];
  /** Setzt URL-Params (tab/sub/sub2) in der aufrufenden Seite */
  onNavigate: (p: { tab: string; sub?: string; sub2?: string }) => void;
  /** Optional: Fokus initial auf Suche */
  autoFocusSearch?: boolean;
};

/** ----- Helfer: Highlight ----- */
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function highlightHTML(text: string, term: string) {
  if (!term) return text;
  const re = new RegExp(`(${escapeRegExp(term)})`, "ig");
  return text.replace(
    re,
    `<mark class="${styles.mark}">$1</mark>`
  );
}

/** ----- Helfer: Leaf-Zählung (rekursiv) ----- */
function countLeaves(sub?: SubCategory[]): number {
  if (!sub || !sub.length) return 0;
  let n = 0;
  for (const s of sub) {
    if (s.sub2 && s.sub2.length) {
      // Sonderfall: sub2 enthält wiederum sub2 (z. B. Dungeon Pause)
      const deeper = s.sub2.some((x) => x.sub2 && x.sub2.length);
      if (deeper) {
        for (const s2 of s.sub2) {
          if (s2.sub2 && s2.sub2.length) n += s2.sub2.length;
          else n += 1;
        }
      } else {
        n += s.sub2.length;
      }
    } else {
      n += 1;
    }
  }
  return n;
}

/** ----- Spotlight: Flatten aller Ziele (cat/sub/sub2) ----- */
type SpotRow = { full: string; catKey: string; subKey?: string; sub2Key?: string };

function buildSpotRows(categories: Category[]): SpotRow[] {
  const rows: SpotRow[] = [];
  for (const cat of categories) {
    const catTitle = cat.label;
    if (!cat.sub || !cat.sub.length) continue;

    for (const sub of cat.sub) {
      // sub mit weiterer Ebene?
      if (sub.sub2 && sub.sub2.length) {
        // Prüfen, ob in der sub2-Ebene noch eine weitere sub2 existiert (Spezialfall „Dungeon Pause“)
        const hasDeeper = sub.sub2.some((x) => x.sub2 && x.sub2.length);
        if (hasDeeper) {
          for (const s2 of sub.sub2) {
            if (s2.sub2 && s2.sub2.length) {
              for (const s3 of s2.sub2) {
                rows.push({
                  full: `${catTitle} › ${sub.label} › ${s2.label} › ${s3.label}`,
                  catKey: cat.key,
                  subKey: sub.key,
                  sub2Key: s3.key,
                });
              }
            } else {
              rows.push({
                full: `${catTitle} › ${sub.label} › ${s2.label}`,
                catKey: cat.key,
                subKey: sub.key,
                sub2Key: s2.key,
              });
            }
          }
        } else {
          for (const s2 of sub.sub2) {
            rows.push({
              full: `${catTitle} › ${sub.label} › ${s2.label}`,
              catKey: cat.key,
              subKey: sub.key,
              sub2Key: s2.key,
            });
          }
        }
      } else {
        // sub ist bereits „Ziel“
        rows.push({
          full: `${catTitle} › ${sub.label}`,
          catKey: cat.key,
          subKey: sub.key,
        });
      }
    }
  }
  return rows;
}

/** ----- ActiveCat auswählen, robust auch nach Suchfilter ----- */
function firstKey(list: Category[], fallback?: string): string {
  if (fallback && list.some((c) => c.key === fallback)) return fallback;
  return list?.[0]?.key || "";
}

const GuideHubTOC: React.FC<Props> = ({ categories, onNavigate, autoFocusSearch }) => {
  const [activeCatKey, setActiveCatKey] = useState<string>(() => categories?.[0]?.key || "");
  const [query, setQuery] = useState<string>("");

  // Spotlight
  const [spotOpen, setSpotOpen] = useState(false);
  const spotInputRef = useRef<HTMLInputElement>(null);

  // Suche: filtert Kategorien + deren Subebenen
  const filteredCats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;

    const match = (txt: string) => txt.toLowerCase().includes(q);

    return categories
      .map((cat) => {
        const catHit = match(cat.label);
        const subFiltered: SubCategory[] = [];

        for (const sub of cat.sub || []) {
          const subHit = match(sub.label);
          if (sub.sub2 && sub.sub2.length) {
            const hasDeeper = sub.sub2.some((x) => x.sub2 && x.sub2.length);

            if (hasDeeper) {
              const s2mapped: SubCategory[] = [];
              for (const s2 of sub.sub2) {
                if (s2.sub2 && s2.sub2.length) {
                  const s3Keep = s2.sub2.filter((s3) => match(s3.label));
                  if (s3Keep.length) {
                    s2mapped.push({ ...s2, sub2: s3Keep });
                  }
                } else if (match(s2.label)) {
                  s2mapped.push(s2);
                }
              }
              if (subHit || s2mapped.length) {
                subFiltered.push({ ...sub, sub2: s2mapped });
              }
            } else {
              const keep = sub.sub2.filter((s2) => match(s2.label));
              if (subHit || keep.length) subFiltered.push({ ...sub, sub2: keep });
            }
          } else {
            if (subHit) subFiltered.push(sub);
          }
        }

        if (catHit || subFiltered.length) {
          return { ...cat, sub: subFiltered.length ? subFiltered : cat.sub };
        }
        return null;
      })
      .filter(Boolean) as Category[];
  }, [categories, query]);

  // Aktive Kategorie-Objekt unter Berücksichtigung des Filters
  const activeCatObj = useMemo(() => {
    const base = filteredCats.length ? filteredCats : categories;
    const key = firstKey(base, activeCatKey);
    return base.find((c) => c.key === key) || base[0] || null;
  }, [filteredCats, categories, activeCatKey]);

  // Spotlight-Daten
  const spotRows = useMemo(() => buildSpotRows(categories), [categories]);
  const [spotQuery, setSpotQuery] = useState("");
  const spotFiltered = useMemo(() => {
    const q = spotQuery.trim().toLowerCase();
    if (!q) return spotRows;
    return spotRows.filter((x) => x.full.toLowerCase().includes(q));
  }, [spotRows, spotQuery]);

  // Keyboard: Cmd/Ctrl+K → Spotlight
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setSpotOpen(true);
        setTimeout(() => spotInputRef.current?.focus(), 0);
      }
      if (e.key === "Escape") {
        setSpotOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Suche auto-fokus
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusSearch) searchRef.current?.focus();
  }, [autoFocusSearch]);

  // Enter → Top-Treffer öffnen
  const handleEnterOpenTopHit = () => {
    const q = query.trim().toLowerCase();
    const first =
      (q ? spotRows.find((x) => x.full.toLowerCase().includes(q)) : spotRows[0]) || null;
    if (first) {
      onNavigate({ tab: first.catKey, sub: first.subKey, sub2: first.sub2Key });
      return;
    }
    // Fallback: erstes sichtbares Item der aktiven Kategorie
    const cat = activeCatObj;
    const s = cat?.sub?.[0];
    if (!cat || !s) return;
    if (s.sub2 && s.sub2.length) {
      // evtl. noch eine dritte Ebene darunter
      const deeper = s.sub2.some((x) => x.sub2 && x.sub2.length);
      if (deeper) {
        const firstS2 = s.sub2[0];
        if (firstS2.sub2 && firstS2.sub2.length) {
          onNavigate({ tab: cat.key, sub: s.key, sub2: firstS2.sub2[0].key });
        } else {
          onNavigate({ tab: cat.key, sub: s.key, sub2: firstS2.key });
        }
      } else {
        onNavigate({ tab: cat.key, sub: s.key, sub2: s.sub2[0].key });
      }
    } else {
      onNavigate({ tab: cat.key, sub: s.key });
    }
  };

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <div className={styles.side}>
        <div className={styles.sideHead}>
          <input
            ref={searchRef}
            className={styles.search}
            type="search"
            placeholder="Suche…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEnterOpenTopHit();
            }}
          />
          <button
            className={styles.spotBtn}
            type="button"
            onClick={() => {
              setSpotOpen(true);
              setTimeout(() => spotInputRef.current?.focus(), 0);
            }}
            title="Spotlight (Ctrl/Cmd+K)"
          >
            Spotlight
          </button>
        </div>

        <div className={styles.sideList}>
          {(filteredCats.length ? filteredCats : categories).map((cat) => (
            <div
              key={cat.key}
              className={`${styles.sideItem} ${activeCatObj?.key === cat.key ? styles.active : ""}`}
              onClick={() => setActiveCatKey(cat.key)}
            >
              <span className={styles.sideTitle}>
                {cat.icon ? <span className={styles.ico} aria-hidden>{cat.icon}</span> : null}
                {cat.label}
              </span>
              <span className={styles.badge}>{countLeaves(cat.sub)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className={styles.detail}>
        {!activeCatObj ? (
          <div className={styles.empty}>Keine Kategorie gefunden.</div>
        ) : (
          <div className={styles.detailInner}>
            <div className={styles.detailHead}>
              <h3 className={styles.detailTitle}>
                {activeCatObj.icon ? <span className={styles.ico} aria-hidden>{activeCatObj.icon}</span> : null}
                {activeCatObj.label}
              </h3>
              <div className={styles.badge}>
                {countLeaves(activeCatObj.sub)} Einträge
              </div>
            </div>

            {/* Level 1 */}
            <div className={styles.grid}>
              {(activeCatObj.sub || []).map((sub) => {
                const hasSub2 = sub.sub2 && sub.sub2.length > 0;
                const hasDeeper = hasSub2 && sub.sub2!.some((x) => x.sub2 && x.sub2.length);

                return (
                  <div key={sub.key} className={styles.card}>
                    <div
                      className={styles.cardHead}
                      dangerouslySetInnerHTML={{
                        __html: highlightHTML(sub.label, query),
                      }}
                    />

                    {/* Level 2 / ggf. Level 3 */}
                    {hasSub2 ? (
                      <div className={styles.btnGrid}>
                        {hasDeeper
                          ? // sub2 enthält wiederum sub2 (3. Ebene sichtbar machen)
                            sub.sub2!.flatMap((s2) =>
                              s2.sub2 && s2.sub2.length
                                ? s2.sub2.map((s3) => (
                                    <button
                                      key={`${s2.key}__${s3.key}`}
                                      className={styles.itemBtn}
                                      onClick={() =>
                                        onNavigate({
                                          tab: activeCatObj.key,
                                          sub: sub.key,
                                          sub2: s3.key,
                                        })
                                      }
                                      dangerouslySetInnerHTML={{
                                        __html: highlightHTML(`${s2.label} › ${s3.label}`, query),
                                      }}
                                    />
                                  ))
                                : [
                                    <button
                                      key={s2.key}
                                      className={styles.itemBtn}
                                      onClick={() =>
                                        onNavigate({
                                          tab: activeCatObj.key,
                                          sub: sub.key,
                                          sub2: s2.key,
                                        })
                                      }
                                      dangerouslySetInnerHTML={{
                                        __html: highlightHTML(s2.label, query),
                                      }}
                                    />,
                                  ]
                            )
                          : // Normale 2. Ebene
                            sub.sub2!.map((s2) => (
                              <button
                                key={s2.key}
                                className={styles.itemBtn}
                                onClick={() =>
                                  onNavigate({
                                    tab: activeCatObj.key,
                                    sub: sub.key,
                                    sub2: s2.key,
                                  })
                                }
                                dangerouslySetInnerHTML={{
                                  __html: highlightHTML(s2.label, query),
                                }}
                              />
                            ))}
                      </div>
                    ) : (
                      <div className={styles.btnGrid}>
                        <button
                          className={styles.itemBtn}
                          onClick={() =>
                            onNavigate({
                              tab: activeCatObj.key,
                              sub: sub.key,
                            })
                          }
                          dangerouslySetInnerHTML={{
                            __html: highlightHTML(sub.label, query),
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Empty state bei Suche ohne Treffer innerhalb aktiver Kategorie */}
            {query &&
            activeCatObj.sub &&
            activeCatObj.sub.length > 0 &&
            // alle Karten leer gefiltert?
            activeCatObj.sub.every((s) => {
              if (!s.sub2 || !s.sub2.length) {
                return !s.label.toLowerCase().includes(query.trim().toLowerCase());
              }
              // falls sub2 hat: prüfen, ob auf beliebiger Tiefe Treffer bleiben
              const deeper = s.sub2.some((x) => x.sub2 && x.sub2.length);
              if (deeper) {
                return s.sub2.every((x) => {
                  if (x.sub2 && x.sub2.length) {
                    return x.sub2.every(
                      (z) => !z.label.toLowerCase().includes(query.trim().toLowerCase())
                    );
                  }
                  return !x.label.toLowerCase().includes(query.trim().toLowerCase());
                });
              }
              return s.sub2.every(
                (x) => !x.label.toLowerCase().includes(query.trim().toLowerCase())
              );
            }) ? (
              <div className={styles.empty}>
                Keine Treffer in „{activeCatObj.label}“.
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Spotlight Overlay */}
      {spotOpen && (
        <div className={styles.spotWrap} onClick={() => setSpotOpen(false)}>
          <div className={styles.spot} onClick={(e) => e.stopPropagation()}>
            <div className={styles.spotHead}>
              <input
                ref={spotInputRef}
                className={styles.spotSearch}
                type="search"
                placeholder="Schnellsuche… (Themen & Unterpunkte)"
                value={spotQuery}
                onChange={(e) => setSpotQuery(e.target.value)}
              />
              <button className={styles.spotClose} onClick={() => setSpotOpen(false)}>
                Esc
              </button>
            </div>
            <div className={styles.spotList}>
              {spotFiltered.length === 0 ? (
                <div className={styles.spotItemEmpty}>Keine Treffer</div>
              ) : (
                spotFiltered.map((x, idx) => (
                  <div
                    key={idx}
                    className={styles.spotItem}
                    onClick={() => {
                      setSpotOpen(false);
                      onNavigate({ tab: x.catKey, sub: x.subKey, sub2: x.sub2Key });
                    }}
                  >
                    <div className={styles.spotCat}>{x.catKey}</div>
                    <div className={styles.spotLabel}>{x.full}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuideHubTOC;
