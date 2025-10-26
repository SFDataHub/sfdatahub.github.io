// src/pages/GuideHub/ArenaAM/AMRuneBonuses.tsx
import React, { useMemo, useState } from "react";
import styles from "./AMRuneBonuses.module.css";

// === Manifest-Import (mit integrierten Fallbacks) ===
import {
  guideAssetByKey,       // gibt { id, url, thumb, fallback } zurück
} from "../../../data/guidehub/assets";

/**
 * Tabelle wie im Screenshot:
 * - Gruppierte Tiers (linke Spalte mit rowSpan)
 * - Sticky Icon-Header (8 Rune-Kategorien)
 * - Hover-Glow für Datenzeilen
 * - Max-Rune, Achievements, Breakpoints x2/x12/x60 hervorgehoben
 * - Lokale Suche (Tier/Amount/Note)
 *
 * Icons/Images: kommen aus dem Manifest `data/guidehub/assets.ts`.
 *  - Falls dort (noch) keine File-IDs stehen, greift dessen interner Fallback.
 */

// Header-Icon-Keys im Manifest (bitte bei dir befüllen)
const HEADER_ICON_KEYS = {
  gold: "rune_gold",
  xp: "rune_xp",
  hp: "rune_hp",
  totalRes: "rune_totalres",
  singleRes: "rune_singleres",
  elem: "rune_elemental",
  item: "rune_itemquality",
  epics: "rune_epics",
} as const;

// Achievement-Icon-Keys (optional; wenn leer, nutzt Manifest-Fallback)
const ACHIEV_ICON_KEYS: Record<string, string> = {
  Capitalist: "achiev_capitalist",
  "Stinking rich": "achiev_stinkingrich",
  "Rune Master": "achiev_runemaster",
  // weitere bei Bedarf…
};

/* ---------------- kleine Icon-Komponenten, die Manifest-Fallbacks nutzen ---------------- */
function RuneIconHeader({ keyName, label }: { keyName: string; label: string }) {
  const info = guideAssetByKey(keyName, 36);
  return (
    <div className={styles.iconHead}>
      {info.thumb ? (
        <img src={info.thumb} alt={label} width={36} height={36} style={{ borderRadius: 6, border: "1px solid #2B4C73" }} />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: 6, background: "#1A2F4A",
          border: "1px solid #2B4C73", display: "grid", placeItems: "center",
          color: "#fff", fontWeight: 800
        }}>
          {(info.fallback || label).slice(0,1).toUpperCase()}
        </div>
      )}
      <span>{label}</span>
    </div>
  );
}

function AchievementBadge({ name }: { name: string }) {
  // name z. B. "Capitalist Achievement" oder "Rune Master"
  // wir suchen ein bekanntes Präfix, um den richtigen Key zu bekommen
  const key = Object.keys(ACHIEV_ICON_KEYS).find(k => name.toLowerCase().includes(k.toLowerCase()));
  const info = guideAssetByKey(key ? ACHIEV_ICON_KEYS[key] : "achiev_generic", 16);
  return (
    <div className={styles.achiev}>
      {info.thumb ? (
        <img src={info.thumb} alt={name} width={16} height={16} style={{ borderRadius: 3, border: "1px solid #2C4A73" }} />
      ) : (
        <div className={styles.achievImg} />
      )}
      <span>{name}</span>
    </div>
  );
}

/* ---------------- Daten ---------------- */

type Row = {
  tier: string;     // "Thousand", "Million", ...
  amount: string;   // "1 E3" ...
  gold?: string; xp?: string; hp?: string;
  totalRes?: string; singleRes?: string; elemDmg?: string;
  itemQuality?: string | number; epics?: string;
  note?: string;    // "x2 Boost", "Achievement" ...
};

const ROWS: Row[] = [
  { tier: "Thousand", amount: "1 E3", gold: "2%", xp: "1%", hp: "1%", totalRes: "2%", singleRes: "3%", elemDmg: "2%", itemQuality: "+1", epics: "2%" },
  { tier: "Thousand", amount: "10 E4", gold: "4%", xp: "3%" },
  { tier: "Thousand", amount: "100 E5", gold: "3%", xp: "3%" },

  { tier: "Million", amount: "1 E6", gold: "2%", xp: "5%", hp: "4%" },
  { tier: "Million", amount: "10 E7", gold: "4%", xp: "4%" },
  { tier: "Million", amount: "100 E8", gold: "3%", xp: "6%", hp: "5%" },

  { tier: "Billion", amount: "1 E9", gold: "5%", xp: "7%", hp: "6%", totalRes: "5%" },
  { tier: "Billion", amount: "10 E10", gold: "2%", xp: "8%" },
  { tier: "Billion", amount: "100 E11", gold: "6%", xp: "7%", hp: "6%" },

  { tier: "Trillion", amount: "1 E12", gold: "9%", xp: "8%" },
  { tier: "Trillion", amount: "10 E13", gold: "7%", xp: "4%", hp: "10%", totalRes: "7%" },
  { tier: "Trillion", amount: "100 E14", gold: "11%", xp: "9%" },

  { tier: "Quadrillion", amount: "1 E15", gold: "8%", xp: "12%", hp: "8%" },
  { tier: "Quadrillion", amount: "10 E16", gold: "3%", xp: "10%" },
  { tier: "Quadrillion", amount: "100 E17", gold: "9%", xp: "13%", hp: "11%", totalRes: "9%" },

  { tier: "Quintillion", amount: "1 E18", gold: "5%", xp: "14%" },
  { tier: "Quintillion", amount: "10 E19", gold: "10%", xp: "12%", itemQuality: "+2", epics: "10%", note: "Capitalist Achievement" },
  { tier: "Quintillion", amount: "100 E20", gold: "15%", note: "Achievement" },

  { tier: "Sextillion", amount: "1 E21", gold: "16%", xp: "13%" },
  { tier: "Sextillion", amount: "10 E22", gold: "11%", xp: "17%", hp: "14%", totalRes: "11%" },
  { tier: "Sextillion", amount: "100 E23", gold: "4%", xp: "6%", hp: "18%" },

  { tier: "Septillion", amount: "1 E24", gold: "12%", xp: "15%", hp: "12%" },
  { tier: "Septillion", amount: "10 E25", gold: "13%", xp: "3%", hp: "19%", totalRes: "16%", note: "Stinking rich Achievement" },
  { tier: "Septillion", amount: "100 E26", gold: "20%", xp: "13%", note: "Achievement" },

  { tier: "Octillion", amount: "1 E27", gold: "7%", xp: "21%", hp: "17%" },
  { tier: "Octillion", amount: "10 E28", gold: "14%", xp: "22%", totalRes: "14%" },
  { tier: "Octillion", amount: "100 E29", gold: "15%", xp: "18%" },

  { tier: "Nonillion", amount: "1 E30", gold: "5%", xp: "23%", hp: "15%" },
  { tier: "Nonillion", amount: "10 E31", gold: "8%", xp: "24%", totalRes: "19%" },
  { tier: "Nonillion", amount: "100 E32", gold: "16%", xp: "25%", hp: "20%", totalRes: "16%" },

  { tier: "Decillion", amount: "1 E33", gold: "4%", xp: "26%" },
  { tier: "Decillion", amount: "10 E34", gold: "17%", xp: "9%", hp: "21%", totalRes: "17%", note: "Rune Master" },
  { tier: "Decillion", amount: "100 E35", gold: "27%", xp: "22%", note: "Achievement" },

  { tier: "Undecillion", amount: "1 E36", gold: "18%", xp: "6%", hp: "28%", totalRes: "18%" },
  { tier: "Undecillion", amount: "10 E37", xp: "23%" },
  { tier: "Undecillion", amount: "100 E38", gold: "19%", xp: "10%", hp: "29%", totalRes: "19%" },

  { tier: "Duodecillion", amount: "1 E39", xp: "24%", note: "x2 Boost" },
  { tier: "Duodecillion", amount: "10 E40", gold: "20%", xp: "30%", hp: "25%", totalRes: "20%" },
  { tier: "Duodecillion", amount: "100 E41", xp: "31%" },

  { tier: "Tredecillion", amount: "1 E42", gold: "21%", xp: "11%", hp: "32%", totalRes: "26%", singleRes: "21%" },
  { tier: "Tredecillion", amount: "10 E43", gold: "7%", xp: "33%" },
  { tier: "Tredecillion", amount: "100 E44", gold: "22%", xp: "34%", hp: "27%", totalRes: "22%" },

  { tier: "Quattuordecillion", amount: "1 E45", gold: "5%", xp: "28%" },
  { tier: "Quattuordecillion", amount: "10 E46", gold: "23%", xp: "12%", hp: "35%", totalRes: "23%" },
  { tier: "Quattuordecillion", amount: "100 E47", xp: "36%", hp: "29%" },

  { tier: "Quindecillion", amount: "1 E48", gold: "24%", xp: "24%", note: "x12 Boost" },
  { tier: "Quindecillion", amount: "10 E49", xp: "37%", hp: "30%" },
  { tier: "Quindecillion", amount: "100 E50", gold: "25%", xp: "8%", hp: "13%", totalRes: "38%", singleRes: "25%" },

  { tier: "Sexdecillion", amount: "1 E51", xp: "39%", hp: "31%", itemQuality: "+3" },
  { tier: "Sexdecillion", amount: "10 E52", gold: "26%", xp: "26%" },
  { tier: "Sexdecillion", amount: "100 E53", xp: "40%", hp: "32%" },

  { tier: "Septendecillion", amount: "1 E54", gold: "27%", xp: "14%", hp: "41%", totalRes: "33%", singleRes: "27%" },
  { tier: "Septendecillion", amount: "10 E55", gold: "6%" },
  { tier: "Septendecillion", amount: "100 E56", gold: "28%", xp: "9%", hp: "42%", totalRes: "34%", singleRes: "28%" },

  { tier: "Octodecillion", amount: "1 E57", xp: "43%", hp: "35%", note: "x8 Boost" },
  { tier: "Octodecillion", amount: "10 E58", gold: "29%", xp: "15%", hp: "44%", totalRes: "29%" },
  { tier: "Octodecillion", amount: "100 E59", xp: "45%", hp: "36%" },

  { tier: "Novendecillion", amount: "1 E60", gold: "30%", xp: "30%" },
  { tier: "Novendecillion", amount: "10 E61", xp: "46%", hp: "37%" },
  { tier: "Novendecillion", amount: "100 E62", gold: "31%", xp: "16%", hp: "47%", totalRes: "31%" },

  { tier: "Vigintillion", amount: "1 E63", gold: "10%", xp: "48%", hp: "38%" },
  { tier: "Vigintillion", amount: "10 E64", gold: "32%", xp: "49%", totalRes: "32%" },
  { tier: "Vigintillion", amount: "100 E65", gold: "7%", xp: "39%" },

  { tier: "Unvigintillion", amount: "1 E66", gold: "33%", xp: "17%", hp: "40%", totalRes: "33%" },
  { tier: "Unvigintillion", amount: "10 E67", xp: "50%" },
];

function parseAmountScore(amount: string): number {
  const m = amount.match(/(\d+)\s*E\s*(\d+)/i);
  if (!m) return 0;
  const base = Number(m[1] || 1);
  const exp = Number(m[2] || 0);
  return Math.log10(base) + exp;
}

function isAchievementNote(s: string | undefined) {
  const t = (s ?? "").toLowerCase();
  return t.includes("achievement") || t.includes("rune master") || t.includes("capitalist") || t.includes("stinking rich");
}
function breakpointTag(s: string | undefined): "x2" | "x12" | "x60" | "x8" | null {
  const t = (s ?? "").toLowerCase();
  if (t.includes("x60")) return "x60";
  if (t.includes("x12")) return "x12";
  if (t.includes("x8")) return "x8";
  if (t.includes("x2")) return "x2";
  return null;
}

/* Achievements pro Tier (Text); Icon-Key wird oben aus ACHIEV_ICON_KEYS abgeleitet */
const ACHIEVEMENTS: Record<string, string | undefined> = {
  Quintillion: "Capitalist Achievement",
  Septillion: "Stinking rich Achievement",
  Decillion: "Rune Master",
  // weitere bei Bedarf …
};

const DESCRIPTION =
  "Komplette Übersicht der Arena-Manager-Runen mit ihren Bonuswerten. Gruppiert nach Tier; Max, Achievements und Breakpoints sind markiert.";

/* Suche lokal */
function useFilteredRows(q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return ROWS;
  return ROWS.filter(r =>
    `${r.tier} ${r.amount} ${r.note ?? ""}`.toLowerCase().includes(query)
  );
}

export default function AMRuneBonuses() {
  const [q, setQ] = useState("");
  const data = useFilteredRows(q);
  const maxScore = useMemo(() => Math.max(...ROWS.map(r => parseAmountScore(r.amount))), []);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of data) {
      if (!m.has(r.tier)) m.set(r.tier, []);
      m.get(r.tier)!.push(r);
    }
    // Reihenfolge wie in ROWS
    const order = Array.from(new Set(ROWS.map(r => r.tier)));
    return Array.from(m.entries()).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
  }, [data]);

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.headerBar}>
        <h2 className={styles.title}>Arena Manager – Rune bonuses</h2>
        <span className={styles.meta}>last updated: 15.01.2025</span>
      </div>
      <p className={styles.description}>{DESCRIPTION}</p>

      {/* lokale Suche */}
      <div className={styles.controls}>
        <input
          className={styles.search}
          placeholder="Suche (z. B. thousand, E34, x60)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Tabelle */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr className={styles.headRow}>
              <th className={`${styles.th} ${styles.tierCell}`}>Tier</th>
              <th className={`${styles.th} ${styles.amountCell}`}>Amount</th>

              <th className={styles.th}><RuneIconHeader keyName={HEADER_ICON_KEYS.gold} label="Gold Bonus" /></th>
              <th className={styles.th}><RuneIconHeader keyName={HEADER_ICON_KEYS.xp} label="XP Bonus" /></th>
              <th className={styles.th}><RuneIconHeader keyName={HEADER_ICON_KEYS.hp} label="HP Bonus" /></th>
              <th className={styles.th}><RuneIconHeader keyName={HEADER_ICON_KEYS.totalRes} label="Total Resistance" /></th>
              <th className={styles.th}><RuneIconHeader keyName={HEADER_ICON_KEYS.singleRes} label="Single Resistance" /></th>
              <th className={styles.th}><RuneIconHeader keyName={HEADER_ICON_KEYS.elem} label="Elemental Damage" /></th>
              <th className={styles.th}><RuneIconHeader keyName={HEADER_ICON_KEYS.item} label="Improved Item Quality" /></th>
              <th className={styles.th}><RuneIconHeader keyName={HEADER_ICON_KEYS.epics} label="Chances of Epics" /></th>

              <th className={styles.th}>Tags</th>
            </tr>
          </thead>

          <tbody>
            {groups.map(([tier, rows]) => {
              const firstIdxScore = Math.max(...rows.map(r => parseAmountScore(r.amount)));
              return rows.map((r, idx) => {
                const isMax = Math.abs(parseAmountScore(r.amount) - maxScore) < 1e-6;
                const bp = breakpointTag(r.note);
                return (
                  <tr key={`${tier}-${idx}`} className={styles.dataRow}>
                    {idx === 0 && (
                      <td
                        className={`${styles.td} ${styles.tierCell} ${Math.abs(firstIdxScore - maxScore) < 1e-6 ? styles.tierMax : ""}`}
                        rowSpan={rows.length}
                      >
                        <div className={styles.tierBox}>
                          {/* Tier-Icon bleibt vorerst als Letter-Fallback (kein spezieller Asset-Key) */}
                          <div className={styles.tierIcon}>{tier.slice(0,1).toUpperCase()}</div>
                          <div className={styles.tierTexts}>
                            <div className={styles.tierName}>{tier}</div>
                            {ACHIEVEMENTS[tier] && <AchievementBadge name={ACHIEVEMENTS[tier]!} />}
                          </div>
                        </div>
                      </td>
                    )}

                    <td className={`${styles.td} ${styles.amountCell}`}>{r.amount}</td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>{r.gold ?? ""}</td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>{r.xp ?? ""}</td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>{r.hp ?? ""}</td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>{r.totalRes ?? ""}</td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>{r.singleRes ?? ""}</td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>{r.elemDmg ?? ""}</td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>{r.itemQuality ?? ""}</td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>{r.epics ?? ""}</td>

                    <td className={`${styles.td} ${styles.tags}`}>
                      {isMax && <span className={`${styles.badge} ${styles.badgeMax}`}>MAX</span>}
                      {isAchievementNote(r.note) && <span className={`${styles.badge} ${styles.badgeAchiev}`}>Achievement</span>}
                      {bp === "x2" && <span className={`${styles.badge} ${styles.badgeX2}`}>x2</span>}
                      {bp === "x12" && <span className={`${styles.badge} ${styles.badgeX12}`}>x12</span>}
                      {bp === "x60" && <span className={`${styles.badge} ${styles.badgeX60}`}>x60</span>}
                      {bp === "x8" && <span className={styles.badge}>x8</span>}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
