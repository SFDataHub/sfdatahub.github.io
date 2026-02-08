// src/pages/GuideHub/ArenaAM/AMRuneBonuses.tsx
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./AMRuneBonuses.module.css";
import Tooltip from "../../../../components/ui/Tooltip/Tooltip";

// === Manifest-Import (mit integrierten Fallbacks) ===
import {
  guideAssetByKey, // gibt { id, url, thumb, fallback } zurück
} from "../../../../data/guidehub/assets";

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
  gold: "goldrune",
  xp: "xprune",
  hp: "healthrune",
  totalRes: "totalresrune",
  singleRes: "lightresrune",
  elem: "lightdmgrune",
  item: "itemqualrune",
  epics: "epicrune",
} as const;

const HEADER_ICON_SIZE = 44;
const ACHIEV_ICON_SIZE = 72;

type AchievementId = "capitalist" | "stinkingrich" | "runemaster";

/* Achievements pro Tier (IDs) */
const ACHIEVEMENTS: Record<string, AchievementId | undefined> = {
  Quintillion: "capitalist",
  Septillion: "stinkingrich",
  Decillion: "runemaster",
};

function RuneIconHeader({ keyName, label }: { keyName: string; label: string }) {
  const info = guideAssetByKey(keyName, HEADER_ICON_SIZE);
  return (
    <Tooltip content={label} placement="bottom">
      <div className={styles.iconHead}>
        {info.thumb ? (
          <img
            src={info.thumb}
            alt={label}
            width={HEADER_ICON_SIZE}
            height={HEADER_ICON_SIZE}
            style={{ borderRadius: 6, border: "1px solid #2B4C73" }}
          />
        ) : (
          <div
            style={{
              width: HEADER_ICON_SIZE,
              height: HEADER_ICON_SIZE,
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
      </div>
    </Tooltip>
  );
}

export default function AMRuneBonuses() {
  return <AMRuneBonusesTable />;
}

function AchievementBadge({ id, label }: { id: AchievementId; label: string }) {
  const info = guideAssetByKey(id, ACHIEV_ICON_SIZE);
  return (
    <Tooltip content={label} placement="bottom" className={styles.achievTooltip}>
      <div className={styles.achiev}>
        {info.thumb ? (
          <img
            src={info.thumb}
            alt={label}
            width={ACHIEV_ICON_SIZE}
            height={ACHIEV_ICON_SIZE}
            style={{ borderRadius: 3, border: "1px solid #2C4A73" }}
          />
        ) : (
          <div className={styles.achievImg} />
        )}
      </div>
    </Tooltip>
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
  { tier: "Thousand", amount: "1 E3", gold: "2%", xp: "1%", hp: "1%", totalRes: "2%", singleRes: "3%", elemDmg: "2%", itemQuality: "+1%", epics: "2%" },
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
  { tier: "Quadrillion", amount: "100 E17", gold: "9%", singleRes: "13%", elemDmg: "11%", epics: "9%" },

  { tier: "Quintillion", amount: "1 E18", totalRes: "5%", singleRes: "14%"},
  { tier: "Quintillion", amount: "10 E19", gold: "10%", elemDmg: "12%", itemQuality: "+2%", epics: "10%" },
  { tier: "Quintillion", amount: "100 E20", singleRes: "15%"},

  { tier: "Sextillion", amount: "1 E21", singleRes: "16%", elemDmg: "13%" },
  { tier: "Sextillion", amount: "10 E22", gold: "11%", singleRes: "17%", elemDmg: "14%", epics: "11%" },
  { tier: "Sextillion", amount: "100 E23", hp: "4%", totalRes: "6%", singleRes: "18%", },

  { tier: "Septillion", amount: "1 E24", gold: "12%", elemDmg: "15%", epics: "12%" },
  { tier: "Septillion", amount: "10 E25", gold: "13%", xp: "3%", singleRes: "19%", elemDmg: "16%" },
  { tier: "Septillion", amount: "100 E26", singleRes: "20%", epics: "13%" },

  { tier: "Octillion", amount: "1 E27", totalRes: "7%", singleRes: "21%", elemDmg: "17%" },
  { tier: "Octillion", amount: "10 E28", gold: "14%", singleRes: "22%", epics: "14%" },
  { tier: "Octillion", amount: "100 E29", gold: "15%", elemDmg: "18%" },

  { tier: "Nonillion", amount: "1 E30", hp: "5%", singleRes: "23%", epics: "15%" },
  { tier: "Nonillion", amount: "10 E31", totalRes: "8%", singleRes: "24%", elemDmg: "19%" },
  { tier: "Nonillion", amount: "100 E32", gold: "16%", singleRes: "25%", elemDmg: "20%", epics: "16%" },

  { tier: "Decillion", amount: "1 E33", xp: "4%", singleRes: "26%" },
  { tier: "Decillion", amount: "10 E34", gold: "17%", totalRes: "9%", elemDmg: "21%", epics: "17%" },
  { tier: "Decillion", amount: "100 E35", singleRes: "27%", elemDmg: "22%" },

  { tier: "Undecillion", amount: "1 E36", gold: "18%", hp: "6%", singleRes: "28%", epics: "18%" },
  { tier: "Undecillion", amount: "10 E37", elemDmg: "23%" },
  { tier: "Undecillion", amount: "100 E38", gold: "19%", totalRes: "10%", singleRes: "29%", epics: "19%" },

  { tier: "Duodecillion", amount: "1 E39", elemDmg: "24%", note: "x2 Boost" },
  { tier: "Duodecillion", amount: "10 E40", gold: "20%", singleRes: "30%", elemDmg: "25%", epics: "20%" },
  { tier: "Duodecillion", amount: "100 E41", singleRes: "31%" },

  { tier: "Tredecillion", amount: "1 E42", gold: "21%", totalRes: "11%", singleRes: "32%", elemDmg: "26%", epics: "21%" },
  { tier: "Tredecillion", amount: "10 E43", hp: "7%", singleRes: "33%" },
  { tier: "Tredecillion", amount: "100 E44", gold: "22%", singleRes: "34%", elemDmg: "27%", epics: "22%" },

  { tier: "Quattuordecillion", amount: "1 E45", xp: "5%", elemDmg: "28%" },
  { tier: "Quattuordecillion", amount: "10 E46", gold: "23%", totalRes: "12%", singleRes: "35%", epics: "23%" },
  { tier: "Quattuordecillion", amount: "100 E47", singleRes: "36%", elemDmg: "29%" },

  { tier: "Quindecillion", amount: "1 E48", gold: "24%", epics: "24%", note: "x12 Boost" },
  { tier: "Quindecillion", amount: "10 E49",  singleRes: "37%", elemDmg: "30%" },
  { tier: "Quindecillion", amount: "100 E50", gold: "25%", hp: "8%", totalRes: "13%", singleRes: "38%", itemQuality: "+3%", epics: "25%" },

  { tier: "Sexdecillion", amount: "1 E51", singleRes: "39%", elemDmg: "31%" },
  { tier: "Sexdecillion", amount: "10 E52", gold: "26%", epics: "26%" },
  { tier: "Sexdecillion", amount: "100 E53", singleRes: "40%", elemDmg: "32%" },

  { tier: "Septendecillion", amount: "1 E54", gold: "27%", totalRes: "14%", singleRes: "41%", elemDmg: "33%", epics: "27%" },
  { tier: "Septendecillion", amount: "10 E55",  xp: "6%" },
  { tier: "Septendecillion", amount: "100 E56", gold: "28%", hp: "9%", singleRes: "42%", elemDmg: "34%", epics: "28%" },

  { tier: "Octodecillion", amount: "1 E57", singleRes: "43%", elemDmg: "35%", note: "x8 Boost" },
  { tier: "Octodecillion", amount: "10 E58", gold: "29%", totalRes: "15%", singleRes: "44%", epics: "29%" },
  { tier: "Octodecillion", amount: "100 E59", singleRes: "45%", elemDmg: "36%" },

  { tier: "Novendecillion", amount: "1 E60", gold: "30%", epics: "30%" },
  { tier: "Novendecillion", amount: "10 E61", singleRes: "46%", elemDmg: "37%" },
  { tier: "Novendecillion", amount: "100 E62", gold: "31%", totalRes: "19%", singleRes: "47%", epics: "31%" },

  { tier: "Vigintillion", amount: "1 E63", hp: "10%", singleRes: "48%", elemDmg: "38%" },
  { tier: "Vigintillion", amount: "10 E64", gold: "32%", singleRes: "49%", epics: "32%" },
  { tier: "Vigintillion", amount: "100 E65", xp: "7%", elemDmg: "39%" },

  { tier: "Unvigintillion", amount: "1 E66", gold: "33%", totalRes: "17%", elemDmg: "40%", epics: "33%" },
  { tier: "Unvigintillion", amount: "10 E67", singleRes: "50%" },
  { tier: "Unvigintillion", amount: "100 E68", gold: "34%", singleRes: "51%", epics: "34%" },

  { tier: "Duovigintillion", amount: "1 E69", singleRes: "52%", elemDmg: "41%" },
  { tier: "Duovigintillion", amount: "10 E70", gold: "35%", hp: "11%", totalRes: "18%", singleRes: "53%", elemDmg: "42%", itemQuality: "+4%", epics: "35%", note: "x60 Boost" },
  { tier: "Duovigintillion", amount: "100 E71", singleRes: "54%", elemDmg: "43%" },

  { tier: "Trevigintillion", amount: "1 E72", gold: "36%", epics: "36%" },
  { tier: "Trevigintillion", amount: "10 E73", singleRes: "55%", elemDmg: "44%" },
  { tier: "Trevigintillion", amount: "100 E74", gold: "37%", totalRes: "19%", elemDmg: "45%", epics: "37%" },

  { tier: "Quattuorvigintillion", amount: "1 E75", xp: "8%", singleRes: "56%" },
  { tier: "Quattuorvigintillion", amount: "10 E76", gold: "38%", singleRes: "57%", elemDmg: "46%", epics: "38%" },
  { tier: "Quattuorvigintillion", amount: "100 E77", hp: "12%", singleRes: "58%", elemDmg: "47%" },

  { tier: "Quinquavigintillion", amount: "1 E78", gold: "39%", totalRes: "20%", elemDmg: "48%", epics: "39%" },
  { tier: "Quinquavigintillion", amount: "10 E79", singleRes: "59%", elemDmg: "49%" },
  { tier: "Quinquavigintillion", amount: "100 E80", gold: "40%", singleRes: "60%", elemDmg: "50%", epics: "40%" },

  { tier: "Sesvigintillion", amount: "1 E81", singleRes: "61%" },
  { tier: "Sesvigintillion", amount: "10 E82", gold: "41%", totalRes: "21%", singleRes: "62%", elemDmg: "51%", epics: "41%" },
  { tier: "Sesvigintillion", amount: "100 E83", },

  { tier: "Septemvigintillion", amount: "1 E84", gold: "42%", hp: "13%", singleRes: "63%", elemDmg: "52%", epics: "42%" },
  { tier: "Septemvigintillion", amount: "10 E85", xp: "9%", singleRes: "64%" },
  { tier: "Septemvigintillion", amount: "100 E86", gold: "43%", totalRes: "22%", epics: "43%" },

  { tier: "Octovigintillion", amount: "1 E87", singleRes: "65%", elemDmg: "53%" },
  { tier: "Octovigintillion", amount: "10 E88", gold: "44%", epics: "44%" },
  { tier: "Octovigintillion", amount: "100 E89", singleRes: "66%" },

  { tier: "Novemvigintillion", amount: "1 E90", gold: "45%", totalRes: "23%", singleRes: "67%", epics: "45%" },
  { tier: "Novemvigintillion", amount: "10 E91", hp: "14%", singleRes: "68%" },
  { tier: "Novemvigintillion", amount: "100 E92", gold: "46%", itemQuality: "+5%", epics: "46%" },

  { tier: "Trigintillion", amount: "1 E93", singleRes: "69%" },
  { tier: "Trigintillion", amount: "10 E94", gold: "47%", totalRes: "24%",  singleRes: "70%", epics: "47%" },
  { tier: "Trigintillion", amount: "100 E95", xp: "10%", singleRes: "71%", elemDmg: "56%" },

  { tier: "Untrigintillion", amount: "1 E96", gold: "48%", epics: "48%" },
  { tier: "Untrigintillion", amount: "10 E97", singleRes: "72%" },
  { tier: "Untrigintillion", amount: "100 E98", gold: "49%", hp: "15%", totalRes: "25%", singleRes: "73%", epics: "49%" },

  { tier: "Duotrigintillion", amount: "1 E99", singleRes: "74%" },
  { tier: "Duotrigintillion", amount: "10 E100", gold: "50%", singleRes: "75%", elemDmg: "60%", epics: "50%", note: "MAX" },
  { tier: "Duotrigintillion", amount: "100 E101",},

  { tier: "Trestrigintillion", amount: "1 E102",},
  { tier: "Trestrigintillion", amount: "10 E103",},
  { tier: "Trestrigintillion", amount: "100 E104",},
  
  { tier: "Quattuortrigintillion", amount: "1 E105",},
  { tier: "Quattuortrigintillion", amount: "10 E106",},
  { tier: "Quattuortrigintillion", amount: "100 E107",},

  { tier: "Quinquatrigintillion", amount: "1 E108",},
  { tier: "Quinquatrigintillion", amount: "10 E109",},
  { tier: "Quinquatrigintillion", amount: "100 E110",},

  { tier: "Sextrigintillion", amount: "1 E111",},
  { tier: "Sextrigintillion", amount: "10 E112",},
  { tier: "Sextrigintillion", amount: "100 E113",},

  { tier: "Septentrigintillion", amount: "1 E114",},
  { tier: "Septentrigintillion", amount: "10 E115",},
  { tier: "Septentrigintillion", amount: "100 E116",},

  { tier: "Octotrigintillion", amount: "1 E117",},
  { tier: "Octotrigintillion", amount: "10 E118",},
  { tier: "Octotrigintillion", amount: "100 E119",},

  { tier: "Noventrigintillion", amount: "1 E120",},
  { tier: "Noventrigintillion", amount: "10 E121",},
  { tier: "Noventrigintillion", amount: "100 E122",},

  { tier: "Quadragintillion", amount: "1 E123",},
  { tier: "Quadragintillion", amount: "10 E124",},
  { tier: "Quadragintillion", amount: "100 E125",},

  { tier: "Unquadragintillion", amount: "1 E126",},
  { tier: "Unquadragintillion", amount: "10 E127",},
  { tier: "Unquadragintillion", amount: "100 E128",},

  { tier: "Duoquadragintillion", amount: "1 E129",},
  { tier: "Duoquadragintillion", amount: "10 E130",},
  { tier: "Duoquadragintillion", amount: "100 E131",},

  { tier: "Trequadragintillion", amount: "1 E132",},
  { tier: "Trequadragintillion", amount: "10 E133",},
  { tier: "Trequadragintillion", amount: "100 E134",},

  { tier: "Quattuorquadragintillion", amount: "1 E135",},
  { tier: "Quattuorquadragintillion", amount: "10 E136",},
  { tier: "Quattuorquadragintillion", amount: "100 E137",},

  { tier: "Quinquadragintillion", amount: "1 E138",},
  { tier: "Quinquadragintillion", amount: "10 E139",},
  { tier: "Quinquadragintillion", amount: "100 E140",},

  { tier: "Sexquadragintillion", amount: "1 E141",},
  { tier: "Sexquadragintillion", amount: "10 E142",},
  { tier: "Sexquadragintillion", amount: "100 E143",},

  { tier: "Septenquadragintillion", amount: "1 E144",},
  { tier: "Septenquadragintillion", amount: "10 E145",},
  { tier: "Septenquadragintillion", amount: "100 E146",},

  { tier: "Octoquadragintillion", amount: "1 E147",},
  { tier: "Octoquadragintillion", amount: "10 E148",},
  { tier: "Octoquadragintillion", amount: "100 E149",},

  { tier: "Novenquadragintillion", amount: "1 E150",},
  { tier: "Novenquadragintillion", amount: "10 E151",},
  { tier: "Novenquadragintillion", amount: "100 E152",},

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


/* Suche lokal */
function useFilteredRows(q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return ROWS;
  return ROWS.filter((r) =>
    `${r.tier} ${r.amount} ${r.note ?? ""}`.toLowerCase().includes(query)
  );
}

export function AMRuneBonusesTable() {
  const { t } = useTranslation();
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
      <p className={styles.description}>
        {t("guidehub.arenaManager.amRuneBonuses.description")}
      </p>

      {/* lokale Suche */}
      <div className={styles.controls}>
        <input
          className={styles.search}
          placeholder={t("guidehub.arenaManager.amRuneBonuses.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Tabelle */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr className={styles.headRow}>
              <th className={`${styles.th} ${styles.tierCell}`}>{t("guidehub.arenaManager.amRuneBonuses.table.tier")}</th>
              <th className={`${styles.th} ${styles.amountCell}`}>{t("guidehub.arenaManager.amRuneBonuses.table.amount")}</th>

              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.gold} label={t("guidehub.arenaManager.amRuneBonuses.table.goldBonus")} />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.xp} label={t("guidehub.arenaManager.amRuneBonuses.table.xpBonus")} />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.hp} label={t("guidehub.arenaManager.amRuneBonuses.table.hpBonus")} />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.totalRes} label={t("guidehub.arenaManager.amRuneBonuses.table.totalResistance")} />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.singleRes} label={t("guidehub.arenaManager.amRuneBonuses.table.singleResistance")} />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.elem} label={t("guidehub.arenaManager.amRuneBonuses.table.elementalDamage")} />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.item} label={t("guidehub.arenaManager.amRuneBonuses.table.improvedItemQuality")} />
              </th>
              <th className={styles.th}>
                <RuneIconHeader keyName={HEADER_ICON_KEYS.epics} label={t("guidehub.arenaManager.amRuneBonuses.table.chancesOfEpics")} />
              </th>

              <th className={styles.th}>{t("guidehub.arenaManager.amRuneBonuses.table.tags")}</th>
            </tr>
          </thead>

          <tbody>
            {groups.map(([tier, rows]) => {
              const firstIdxScore = Math.max(
                ...rows.map((r) => parseAmountScore(r.amount))
              );
              const tierLabel = t(
                `guidehub.arenaManager.amRuneBonuses.tiers.${tier.toLowerCase()}`
              );
              const achievementId = ACHIEVEMENTS[tier];
              const achievementLabel = achievementId
                ? t(
                    `guidehub.arenaManager.amRuneBonuses.achievements.${achievementId}`
                  )
                : null;
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
                            {tierLabel.slice(0, 1).toUpperCase()}
                          </div>
                          <div className={styles.tierTexts}>
                            <div className={styles.tierName}>{tierLabel}</div>
                            {achievementId && achievementLabel && (
                              <AchievementBadge
                                id={achievementId}
                                label={achievementLabel}
                              />
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
                          {t("guidehub.arenaManager.amRuneBonuses.badges.max")}
                        </span>
                      )}
                      {isAchievementNote(r.note) && (
                        <span
                          className={`${styles.badge} ${styles.badgeAchiev}`}
                        >
                          {t(
                            "guidehub.arenaManager.amRuneBonuses.badges.achievement"
                          )}
                        </span>
                      )}
                      {bp === "x2" && (
                        <span className={`${styles.badge} ${styles.badgeX2}`}>
                          {t("guidehub.arenaManager.amRuneBonuses.badges.x2")}
                        </span>
                      )}
                      {bp === "x12" && (
                        <span className={`${styles.badge} ${styles.badgeX12}`}>
                          {t("guidehub.arenaManager.amRuneBonuses.badges.x12")}
                        </span>
                      )}
                      {bp === "x60" && (
                        <span className={`${styles.badge} ${styles.badgeX60}`}>
                          {t("guidehub.arenaManager.amRuneBonuses.badges.x60")}
                        </span>
                      )}
                      {bp === "x8" && (
                        <span className={styles.badge}>
                          {t("guidehub.arenaManager.amRuneBonuses.badges.x8")}
                        </span>
                      )}
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
