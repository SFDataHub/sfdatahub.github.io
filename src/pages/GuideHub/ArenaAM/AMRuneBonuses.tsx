// src/pages/GuideHub/ArenaAM/AMRuneBonuses.tsx
import React, { useMemo, useState } from "react";
import styles from "./AMRuneBonuses.module.css";

// === Manifest-Import (mit integrierten Fallbacks) ===
import {
  guideAssetByKey, // gibt { id, url, thumb, fallback } zurück
} from "../../../data/guidehub/assets";

/**
 * Tabelle wie im Screenshot:
 * - Gruppierte Tiers (linke Spalte mit rowSpan)
 * - Sticky Icon-Header (8 Rune-Kategorien)
 * - Hover-Glow für Datenzeilen + gruppenweiter Tier-Hover
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

// Achievement-Icon-Keys (optional)
const ACHIEV_ICON_KEYS: Record<string, string> = {
  Capitalist: "achiev_capitalist",
  "Stinking rich": "achiev_stinkingrich",
  "Rune Master": "achiev_runemaster",
};

function RuneIconHeader({ keyName, label }: { keyName: string; label: string }) {
  const info = guideAssetByKey(keyName, 36);
  return (
    <div className={styles.iconHead}>
      {info.thumb ? (
        <img
          src={info.thumb}
          alt={label}
          width={36}
          height={36}
          style={{ borderRadius: 6, border: "1px solid #2B4C73" }}
        />
      ) : (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: "#1A2F4A",
            border: "1px solid #2B4C73",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          {(info.fallback || label).slice(0, 1).toUpperCase()}
        </div>
      )}
      <span>{label}</span>
    </div>
  );
}

function AchievementBadge({ name }: { name: string }) {
  const key = Object.keys(ACHIEV_ICON_KEYS).find((k) =>
    name.toLowerCase().includes(k.toLowerCase())
  );
  const info = guideAssetByKey(key ? ACHIEV_ICON_KEYS[key] : "achiev_generic", 16);
  return (
    <div className={styles.achiev}>
      {info.thumb ? (
        <img
          src={info.thumb}
          alt={name}
          width={16}
          height={16}
          style={{ borderRadius: 3, border: "1px solid #2C4A73" }}
        />
      ) : (
        <div className={styles.achievImg} />
      )}
      <span>{name}</span>
    </div>
  );
}

/* ---------------- Daten ---------------- */

type Row = {
  tier: string; // "Thousand", "Million", ...
  amount: string; // "1 E3" ...
  gold?: string;
  xp?: string;
  hp?: string;
  totalRes?: string;
  singleRes?: string;
  elemDmg?: string;
  itemQuality?: string | number;
  epics?: string;
  note?: string; // "x2 Boost", "Achievement" ...
};

const ROWS: Row[] = [
  { tier: "Thousand", amount: "1 E3", gold: "2%", xp: "1%", hp: "1%", totalRes: "2%", singleRes: "3%", elemDmg: "2%", itemQuality: "+1", epics: "2%" },
  { tier: "Thousand", amount: "10 E4", singleRes: "4%", elemDmg: "3%" },
  { tier: "Thousand", amount: "100 E5", gold: "3%", epics: "3%" },

  { tier: "Million", amount: "1 E6", hp: "2%", singleRes: "5%", elemDmg: "4%" },
  { tier: "Million", amount: "10 E7", gold: "4%", epics: "4%" },
  { tier: "Million", amount: "100 E8", totalRes: "3%", singleRes: "6%", elemDmg: "5%" },

  { tier: "Billion", amount: "1 E9", gold: "5%", singleRes: "7%", elemDmg: "6%", epics: "5%" },
  { tier: "Billion", amount: "10 E10", xp: "2%", singleRes: "8%" },
  { tier: "Billion", amount: "100 E11", gold: "6%", elemDmg: "7%", epics: "6%" },

  { tier: "Trillion", amount: "1 E12", singleRes: "9%", elemDmg: "8%" },
  { tier: "Trillion", amount: "10 E13", gold: "7%", totalRes: "4%", singleRes: "10%", epics: "7%" },
  { tier: "Trillion", amount: "100 E14", singleRes: "11%", elemDmg: "9%" },

  { tier: "Quadrillion", amount: "1 E15", gold: "8%", singleRes: "12%", epics: "8%" },
  { tier: "Quadrillion", amount: "10 E16", hp: "3%", elemDmg: "10%" },
  { tier: "Quadrillion", amount: "100 E17", gold: "9%", singleRes: "13%", epics: "9%" },

  { tier: "Quintillion", amount: "1 E18", singleRes: "14%", elemDmg: "11%" },
  { tier: "Quintillion", amount: "10 E19", gold: "10%", totalRes: "5%", epics: "10%" },
  { tier: "Quintillion", amount: "100 E20", singleRes: "15%", elemDmg: "12%" },

  { tier: "Sextillion", amount: "1 E21", gold: "11%", epics: "11%" },
  { tier: "Sextillion", amount: "10 E22", singleRes: "16%", elemDmg: "13%" },
  { tier: "Sextillion", amount: "100 E23", gold: "12%", totalRes: "6%", epics: "12%" },

  { tier: "Septillion", amount: "1 E24", singleRes: "17%", elemDmg: "14%" },
  { tier: "Septillion", amount: "10 E25", gold: "13%", epics: "13%" },
  { tier: "Septillion", amount: "100 E26", totalRes: "7%", singleRes: "18%", elemDmg: "15%" },

  { tier: "Octillion", amount: "1 E27", gold: "14%", epics: "14%" },
  { tier: "Octillion", amount: "10 E28", singleRes: "19%", elemDmg: "16%" },
  { tier: "Octillion", amount: "100 E29", gold: "15%", totalRes: "8%", epics: "15%" },

  { tier: "Nonillion", amount: "1 E30", singleRes: "20%", elemDmg: "17%" },
  { tier: "Nonillion", amount: "10 E31", gold: "16%", epics: "16%" },
  { tier: "Nonillion", amount: "100 E32", totalRes: "9%", singleRes: "21%", elemDmg: "18%" },

  { tier: "Decillion", amount: "1 E33", gold: "17%", epics: "17%" },
  { tier: "Decillion", amount: "10 E34", singleRes: "22%", elemDmg: "19%", note: "x2 Boost" },
  { tier: "Decillion", amount: "100 E35", gold: "18%", totalRes: "10%", epics: "18%" },

  { tier: "Undecillion", amount: "1 E36", singleRes: "23%", elemDmg: "20%" },
  { tier: "Undecillion", amount: "10 E37", gold: "19%", epics: "19%" },
  { tier: "Undecillion", amount: "100 E38", totalRes: "11%", singleRes: "24%", elemDmg: "21%" },

  { tier: "Duodecillion", amount: "1 E39", gold: "20%", epics: "20%" },
  { tier: "Duodecillion", amount: "10 E40", singleRes: "25%", elemDmg: "22%" },
  { tier: "Duodecillion", amount: "100 E41", gold: "21%", totalRes: "12%", epics: "21%" },

  { tier: "Tredecillion", amount: "1 E42", singleRes: "26%", elemDmg: "23%" },
  { tier: "Tredecillion", amount: "10 E43", gold: "22%", epics: "22%" },
  { tier: "Tredecillion", amount: "100 E44", totalRes: "13%", singleRes: "27%", elemDmg: "24%" },

  { tier: "Quattuordecillion", amount: "1 E45", gold: "23%", epics: "23%" },
  { tier: "Quattuordecillion", amount: "10 E46", singleRes: "28%", elemDmg: "25%" },
  { tier: "Quattuordecillion", amount: "100 E47", gold: "24%", totalRes: "14%", epics: "24%" },

  { tier: "Quindecillion", amount: "1 E48", singleRes: "29%", elemDmg: "26%" },
  { tier: "Quindecillion", amount: "10 E49", gold: "25%", epics: "25%" },
  { tier: "Quindecillion", amount: "100 E50", totalRes: "15%", singleRes: "30%", elemDmg: "27%" },

  { tier: "Sexdecillion", amount: "1 E51", gold: "26%", epics: "26%" },
  { tier: "Sexdecillion", amount: "10 E52", singleRes: "31%", elemDmg: "28%" },
  { tier: "Sexdecillion", amount: "100 E53", gold: "27%", totalRes: "16%", epics: "27%" },

  { tier: "Septendecillion", amount: "1 E54", singleRes: "32%", elemDmg: "29%" },
  { tier: "Septendecillion", amount: "10 E55", gold: "28%", epics: "28%" },
  { tier: "Septendecillion", amount: "100 E56", totalRes: "17%", singleRes: "33%", elemDmg: "30%" },

  { tier: "Octodecillion", amount: "1 E57", gold: "29%", epics: "29%" },
  { tier: "Octodecillion", amount: "10 E58", singleRes: "34%", elemDmg: "31%" },
  { tier: "Octodecillion", amount: "100 E59", gold: "30%", totalRes: "18%", epics: "30%" },

  { tier: "Novemdecillion", amount: "1 E60", singleRes: "35%", elemDmg: "32%" },
  { tier: "Novemdecillion", amount: "10 E61", gold: "31%", epics: "31%" },
  { tier: "Novemdecillion", amount: "100 E62", totalRes: "19%", singleRes: "36%", elemDmg: "33%" },

  { tier: "Vigintillion", amount: "1 E63", gold: "32%", epics: "32%" },
  { tier: "Vigintillion", amount: "10 E64", singleRes: "37%", elemDmg: "34%" },
  { tier: "Vigintillion", amount: "100 E65", gold: "33%", totalRes: "20%", epics: "33%" },

  { tier: "Unvigintillion", amount: "1 E66", singleRes: "38%", elemDmg: "35%" },
  { tier: "Unvigintillion", amount: "10 E67", gold: "34%", epics: "34%" },
  { tier: "Unvigintillion", amount: "100 E68", totalRes: "21%", singleRes: "39%", elemDmg: "36%" },

  { tier: "Duovigintillion", amount: "1 E69", gold: "35%", epics: "35%" },
  { tier: "Duovigintillion", amount: "10 E70", note: "x12 Boost" },
  { tier: "Duovigintillion", amount: "100 E71", totalRes: "22%", singleRes: "40%", elemDmg: "37%" },

  { tier: "Trevigintillion", amount: "1 E72", gold: "36%", epics: "36%" },
  { tier: "Trevigintillion", amount: "10 E73", singleRes: "41%", elemDmg: "38%" },
  { tier: "Trevigintillion", amount: "100 E74", gold: "37%", totalRes: "23%", epics: "37%" },

  { tier: "Quattuorvigintillion", amount: "1 E75", singleRes: "42%", elemDmg: "39%" },
  { tier: "Quattuorvigintillion", amount: "10 E76", gold: "38%", epics: "38%" },
  { tier: "Quattuorvigintillion", amount: "100 E77", totalRes: "24%", singleRes: "43%", elemDmg: "40%" },

  { tier: "Quinvigintillion", amount: "1 E78", gold: "39%", epics: "39%" },
  { tier: "Quinvigintillion", amount: "10 E79", singleRes: "44%", elemDmg: "41%" },
  { tier: "Quinvigintillion", amount: "100 E80", gold: "40%", totalRes: "25%", epics: "40%" },

  { tier: "Sexvigintillion", amount: "1 E81", singleRes: "45%", elemDmg: "42%" },
  { tier: "Sexvigintillion", amount: "10 E82", gold: "41%", epics: "41%" },
  { tier: "Sexvigintillion", amount: "100 E83", totalRes: "26%", singleRes: "46%", elemDmg: "43%" },

  { tier: "Septenvigintillion", amount: "1 E84", gold: "42%", epics: "42%" },
  { tier: "Septenvigintillion", amount: "10 E85", singleRes: "47%", elemDmg: "44%" },
  { tier: "Septenvigintillion", amount: "100 E86", gold: "43%", totalRes: "27%", epics: "43%" },

  { tier: "Octovigintillion", amount: "1 E87", singleRes: "48%", elemDmg: "45%" },
  { tier: "Octovigintillion", amount: "10 E88", gold: "44%", epics: "44%" },
  { tier: "Octovigintillion", amount: "100 E89", totalRes: "28%", singleRes: "49%", elemDmg: "46%" },

  { tier: "Novemvigintillion", amount: "1 E90", gold: "45%", epics: "45%" },
  { tier: "Novemvigintillion", amount: "10 E91", singleRes: "50%", elemDmg: "47%" },
  { tier: "Novemvigintillion", amount: "100 E92", gold: "46%", totalRes: "29%", epics: "46%" },

  { tier: "Trigintillion", amount: "1 E93", singleRes: "51%", elemDmg: "48%" },
  { tier: "Trigintillion", amount: "10 E94", gold: "47%", epics: "47%" },
  { tier: "Trigintillion", amount: "100 E95", totalRes: "30%", singleRes: "52%", elemDmg: "49%" },

  { tier: "Untrigintillion", amount: "1 E96", gold: "48%", epics: "48%" },
  { tier: "Untrigintillion", amount: "10 E97", singleRes: "53%", elemDmg: "50%" },
  { tier: "Untrigintillion", amount: "100 E98", gold: "49%", totalRes: "31%", epics: "49%" },

  { tier: "Duotrigintillion", amount: "1 E99", singleRes: "54%", elemDmg: "51%" },
  { tier: "Duotrigintillion", amount: "10 E100", gold: "50%", epics: "50%" },
  { tier: "Duotrigintillion", amount: "100 E101", totalRes: "32%", singleRes: "55%", elemDmg: "52%" },

  { tier: "Trestrigintillion", amount: "1 E102", gold: "51%", epics: "51%" },
  { tier: "Trestrigintillion", amount: "10 E103", singleRes: "56%", elemDmg: "53%" },
  { tier: "Trestrigintillion", amount: "100 E104", gold: "52%", totalRes: "33%", epics: "52%" },

  { tier: "Quattuortrigintillion", amount: "1 E105", singleRes: "57%", elemDmg: "54%" },
  { tier: "Quattuortrigintillion", amount: "10 E106", gold: "53%", epics: "53%" },
  { tier: "Quattuortrigintillion", amount: "100 E107", totalRes: "34%", singleRes: "58%", elemDmg: "55%" },

  { tier: "Quintrigintillion", amount: "1 E108", gold: "54%", epics: "54%" },
  { tier: "Quintrigintillion", amount: "10 E109", singleRes: "59%", elemDmg: "56%" },
  { tier: "Quintrigintillion", amount: "100 E110", gold: "55%", totalRes: "35%", epics: "55%" },

  { tier: "Sextrigintillion", amount: "1 E111", singleRes: "60%", elemDmg: "57%", note: "x60 Boost" },
  { tier: "Sextrigintillion", amount: "10 E112", gold: "56%", epics: "56%" },
  { tier: "Sextrigintillion", amount: "100 E113", totalRes: "36%", singleRes: "61%", elemDmg: "58%" },

  { tier: "Septentrigintillion", amount: "1 E114", gold: "57%", epics: "57%" },
  { tier: "Septentrigintillion", amount: "10 E115", singleRes: "62%", elemDmg: "59%" },
  { tier: "Septentrigintillion", amount: "100 E116", gold: "58%", totalRes: "37%", epics: "58%" },

  { tier: "Octotrigintillion", amount: "1 E117", singleRes: "63%", elemDmg: "60%" },
  { tier: "Octotrigintillion", amount: "10 E118", gold: "59%", epics: "59%" },
  { tier: "Octotrigintillion", amount: "100 E119", gold: "60%", totalRes: "38%", epics: "60%" },

  { tier: "Noventrigintillion", amount: "1 E120", singleRes: "64%", elemDmg: "61%" },
  { tier: "Noventrigintillion", amount: "10 E121", gold: "61%", epics: "61%" },
  { tier: "Noventrigintillion", amount: "100 E122", gold: "62%", totalRes: "39%", epics: "62%" },

  { tier: "Quadragintillion", amount: "1 E123", singleRes: "65%", elemDmg: "62%" },
  { tier: "Quadragintillion", amount: "10 E124", gold: "63%", epics: "63%" },
  { tier: "Quadragintillion", amount: "100 E125", gold: "64%", totalRes: "40%", epics: "64%" },

  { tier: "Unquadragintillion", amount: "1 E126", singleRes: "66%", elemDmg: "63%" },
  { tier: "Unquadragintillion", amount: "10 E127", gold: "65%", epics: "65%" },
  { tier: "Unquadragintillion", amount: "100 E128", gold: "66%", totalRes: "41%", epics: "66%" },

  { tier: "Duoquadragintillion", amount: "1 E129", singleRes: "67%", elemDmg: "64%" },
  { tier: "Duoquadragintillion", amount: "10 E130", gold: "67%", epics: "67%" },
  { tier: "Duoquadragintillion", amount: "100 E131", gold: "68%", totalRes: "42%", epics: "68%" },

  { tier: "Trequadragintillion", amount: "1 E132", singleRes: "68%", elemDmg: "65%" },
  { tier: "Trequadragintillion", amount: "10 E133", gold: "69%", epics: "69%" },
  { tier: "Trequadragintillion", amount: "100 E134", gold: "70%", totalRes: "43%", epics: "70%" },

  { tier: "Quattuorquadragintillion", amount: "1 E135", singleRes: "69%", elemDmg: "66%" },
  { tier: "Quattuorquadragintillion", amount: "10 E136", gold: "71%", epics: "71%" },
  { tier: "Quattuorquadragintillion", amount: "100 E137", gold: "72%", totalRes: "44%", epics: "72%" },

  { tier: "Quinquadragintillion", amount: "1 E138", singleRes: "70%", elemDmg: "67%" },
  { tier: "Quinquadragintillion", amount: "10 E139", gold: "73%", epics: "73%" },
  { tier: "Quinquadragintillion", amount: "100 E140", gold: "74%", totalRes: "45%", epics: "74%" },

  { tier: "Sexquadragintillion", amount: "1 E141", singleRes: "71%", elemDmg: "68%" },
  { tier: "Sexquadragintillion", amount: "10 E142", gold: "75%", epics: "75%" },
  { tier: "Sexquadragintillion", amount: "100 E143", gold: "76%", totalRes: "46%", epics: "76%" },

  { tier: "Septenquadragintillion", amount: "1 E144", singleRes: "72%", elemDmg: "69%" },
  { tier: "Septenquadragintillion", amount: "10 E145", gold: "77%", epics: "77%" },
  { tier: "Septenquadragintillion", amount: "100 E146", gold: "78%", totalRes: "47%", epics: "78%" },

  { tier: "Octoquadragintillion", amount: "1 E147", singleRes: "73%", elemDmg: "70%" },
  { tier: "Octoquadragintillion", amount: "10 E148", gold: "79%", epics: "79%" },
  { tier: "Octoquadragintillion", amount: "100 E149", gold: "80%", totalRes: "48%", epics: "80%" },

  { tier: "Novenquadragintillion", amount: "1 E150", singleRes: "74%", elemDmg: "71%" },
  { tier: "Novenquadragintillion", amount: "10 E151", gold: "81%", epics: "81%" },
  { tier: "Novenquadragintillion", amount: "100 E152", gold: "82%", totalRes: "49%", epics: "82%" },

  { tier: "Quinquagintillion", amount: "1 E153", singleRes: "75%", elemDmg: "72%" },
  { tier: "Quinquagintillion", amount: "10 E154", gold: "83%", epics: "83%" },
  { tier: "Quinquagintillion", amount: "100 E155", gold: "84%", totalRes: "50%", epics: "84%" },
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
  return (
    t.includes("achievement") ||
    t.includes("rune master") ||
    t.includes("capitalist") ||
    t.includes("stinking rich")
  );
}
function breakpointTag(s: string | undefined): "x2" | "x12" | "x60" | "x8" | null {
  const t = (s ?? "").toLowerCase();
  if (t.includes("x60")) return "x60";
  if (t.includes("x12")) return "x12";
  if (t.includes("x8")) return "x8";
  if (t.includes("x2")) return "x2";
  return null;
}

/* Achievements pro Tier (Text) */
const ACHIEVEMENTS: Record<string, string | undefined> = {
  Quintillion: "Capitalist Achievement",
  Septillion: "Stinking rich Achievement",
  Decillion: "Rune Master",
};

const DESCRIPTION =
  "Komplette Übersicht der Arena-Manager-Runen mit ihren Bonuswerten. Gruppiert nach Tier; Max, Achievements und Breakpoints sind markiert.";

/* Suche lokal */
function useFilteredRows(q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return ROWS;
  return ROWS.filter((r) =>
    `${r.tier} ${r.amount} ${r.note ?? ""}`.toLowerCase().includes(query)
  );
}

export default function AMRuneBonuses() {
  const [q, setQ] = useState("");
  const [hoverTier, setHoverTier] = useState<string | null>(null); // <- Gruppennamen bei Hover

  const data = useFilteredRows(q);
  const maxScore = useMemo(
    () => Math.max(...ROWS.map((r) => parseAmountScore(r.amount))),
    []
  );

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of data) {
      if (!m.has(r.tier)) m.set(r.tier, []);
      m.get(r.tier)!.push(r);
    }
    const order = Array.from(new Set(ROWS.map((r) => r.tier)));
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

              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.gold} label="Gold Bonus" />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.xp} label="XP Bonus" />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.hp} label="HP Bonus" />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.totalRes} label="Total Resistance" />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.singleRes} label="Single Resistance" />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.elem} label="Elemental Damage" />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.item} label="Improved Item Quality" />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.epics} label="Chances of Epics" />
              </th>

              <th className={styles.th}>Tags</th>
            </tr>
          </thead>

          <tbody>
            {groups.map(([tier, rows]) => {
              const firstIdxScore = Math.max(
                ...rows.map((r) => parseAmountScore(r.amount))
              );
              return rows.map((r, idx) => {
                const isMax =
                  Math.abs(parseAmountScore(r.amount) - maxScore) < 1e-6;
                const bp = breakpointTag(r.note);
                return (
                  <tr
                    key={`${tier}-${idx}`}
                    className={styles.dataRow}
                    onMouseEnter={() => setHoverTier(tier)}
                    onMouseLeave={() => setHoverTier(null)}
                  >
                    {idx === 0 && (
                      <td
                        className={`${styles.td} ${styles.tierCell} ${
                          Math.abs(firstIdxScore - maxScore) < 1e-6
                            ? styles.tierMax
                            : ""
                        } ${hoverTier === tier ? styles.tierCellHover : ""}`}
                        rowSpan={rows.length}
                      >
                        <div className={styles.tierBox}>
                          <div className={styles.tierIcon}>
                            {tier.slice(0, 1).toUpperCase()}
                          </div>
                          <div className={styles.tierTexts}>
                            <div className={styles.tierName}>{tier}</div>
                            {ACHIEVEMENTS[tier] && (
                              <AchievementBadge name={ACHIEVEMENTS[tier]!} />
                            )}
                          </div>
                        </div>
                      </td>
                    )}

                    <td className={`${styles.td} ${styles.amountCell}`}>
                      {r.amount}
                    </td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>
                      {r.gold ?? ""}
                    </td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>
                      {r.xp ?? ""}
                    </td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>
                      {r.hp ?? ""}
                    </td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>
                      {r.totalRes ?? ""}
                    </td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>
                      {r.singleRes ?? ""}
                    </td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>
                      {r.elemDmg ?? ""}
                    </td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>
                      {r.itemQuality ?? ""}
                    </td>
                    <td className={`${styles.td} ${styles.bonusCell}`}>
                      {r.epics ?? ""}
                    </td>

                    <td className={`${styles.td} ${styles.tags}`}>
                      {isMax && (
                        <span className={`${styles.badge} ${styles.badgeMax}`}>
                          MAX
                        </span>
                      )}
                      {isAchievementNote(r.note) && (
                        <span
                          className={`${styles.badge} ${styles.badgeAchiev}`}
                        >
                          Achievement
                        </span>
                      )}
                      {bp === "x2" && (
                        <span className={`${styles.badge} ${styles.badgeX2}`}>
                          x2
                        </span>
                      )}
                      {bp === "x12" && (
                        <span className={`${styles.badge} ${styles.badgeX12}`}>
                          x12
                        </span>
                      )}
                      {bp === "x60" && (
                        <span className={`${styles.badge} ${styles.badgeX60}`}>
                          x60
                        </span>
                      )}
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
