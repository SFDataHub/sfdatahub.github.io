// src/pages/Playground/AMRuneBonusesDemos.tsx
import React, { useMemo, useState } from "react";
import styles from "./AMRuneBonusesDemos.module.css";

/** --- Datenmodell --- */
type Row = {
  tier: string;          // z. B. "Thousand", "Achievement", "Capitalist", ...
  amount: string;        // z. B. "1 E3"
  gold?: string;
  xp?: string;
  hp?: string;
  totalRes?: string;
  singleRes?: string;
  elemDmg?: string;
  itemQuality?: string | number;
  epics?: string;
  note?: string;         // z. B. "x2 Boost", "x12 Boost", "x60 Boost", "Achievement"
};

const RAW: Row[] = [
  { tier: "Thousand", amount: "1 E3", gold: "2%", xp: "1%", hp: "1%", totalRes: "2%", singleRes: "3%", elemDmg: "2%", itemQuality: "+1", epics: "2%" },
  { tier: "", amount: "10 E4", gold: "4%", xp: "3%" },
  { tier: "", amount: "100 E5", gold: "3%", xp: "3%" },
  { tier: "Million", amount: "1 E6", gold: "2%", xp: "5%", hp: "4%" },
  { tier: "", amount: "10 E7", gold: "4%", xp: "4%" },
  { tier: "", amount: "100 E8", gold: "3%", xp: "6%", hp: "5%" },
  { tier: "Billion", amount: "1 E9", gold: "5%", xp: "7%", hp: "6%", totalRes: "5%" },
  { tier: "", amount: "10 E10", gold: "2%", xp: "8%" },
  { tier: "", amount: "100 E11", gold: "6%", xp: "7%", hp: "6%" },
  { tier: "Trillion", amount: "1 E12", gold: "9%", xp: "8%" },
  { tier: "", amount: "10 E13", gold: "7%", xp: "4%", hp: "10%", totalRes: "7%" },
  { tier: "", amount: "100 E14", gold: "11%", xp: "9%" },
  { tier: "Quadrillion", amount: "1 E15", gold: "8%", xp: "12%", hp: "8%" },
  { tier: "", amount: "10 E16", gold: "3%", xp: "10%" },
  { tier: "", amount: "100 E17", gold: "9%", xp: "13%", hp: "11%", totalRes: "9%" },
  { tier: "Quintillion", amount: "1 E18", gold: "5%", xp: "14%" },
  { tier: "Capitalist", amount: "10 E19", gold: "10%", xp: "12%", itemQuality: "+2", epics: "10%", note: "Achievement" },
  { tier: "Achievement", amount: "100 E20", gold: "15%", note: "Achievement" },
  { tier: "Sextillion", amount: "1 E21", gold: "16%", xp: "13%" },
  { tier: "", amount: "10 E22", gold: "11%", xp: "17%", hp: "14%", totalRes: "11%" },
  { tier: "", amount: "100 E23", gold: "4%", xp: "6%", hp: "18%" },
  { tier: "Septillion", amount: "1 E24", gold: "12%", xp: "15%", hp: "12%" },
  { tier: "Stinking rich", amount: "10 E25", gold: "13%", xp: "3%", hp: "19%", totalRes: "16%", note: "Achievement" },
  { tier: "Achievement", amount: "100 E26", gold: "20%", xp: "13%", note: "Achievement" },
  { tier: "Octillion", amount: "1 E27", gold: "7%", xp: "21%", hp: "17%" },
  { tier: "", amount: "10 E28", gold: "14%", xp: "22%", totalRes: "14%" },
  { tier: "", amount: "100 E29", gold: "15%", xp: "18%" },
  { tier: "Nonillion", amount: "1 E30", gold: "5%", xp: "23%", hp: "15%" },
  { tier: "", amount: "10 E31", gold: "8%", xp: "24%", totalRes: "19%" },
  { tier: "", amount: "100 E32", gold: "16%", xp: "25%", hp: "20%", totalRes: "16%" },
  { tier: "Decillion", amount: "1 E33", gold: "4%", xp: "26%" },
  { tier: "Rune Master", amount: "10 E34", gold: "17%", xp: "9%", hp: "21%", totalRes: "17%", note: "Achievement" },
  { tier: "Achievement", amount: "100 E35", gold: "27%", xp: "22%", note: "Achievement" },
  { tier: "Undecillion", amount: "1 E36", gold: "18%", xp: "6%", hp: "28%", totalRes: "18%" },
  { tier: "", amount: "10 E37", xp: "23%" },
  { tier: "", amount: "100 E38", gold: "19%", xp: "10%", hp: "29%", totalRes: "19%" },
  { tier: "Duodecillion", amount: "1 E39", xp: "24%", note: "x2 Boost" },
  { tier: "", amount: "10 E40", gold: "20%", xp: "30%", hp: "25%", totalRes: "20%" },
  { tier: "", amount: "100 E41", xp: "31%" },
  { tier: "Tredecillion", amount: "1 E42", gold: "21%", xp: "11%", hp: "32%", totalRes: "26%", singleRes: "21%" },
  { tier: "", amount: "10 E43", gold: "7%", xp: "33%" },
  { tier: "", amount: "100 E44", gold: "22%", xp: "34%", hp: "27%", totalRes: "22%" },
  { tier: "Quattuordecillion", amount: "1 E45", gold: "5%", xp: "28%" },
  { tier: "", amount: "10 E46", gold: "23%", xp: "12%", hp: "35%", totalRes: "23%" },
  { tier: "", amount: "100 E47", xp: "36%", hp: "29%" },
  { tier: "Quindecillion", amount: "1 E48", gold: "24%", xp: "24%", note: "x12 Boost" },
  { tier: "", amount: "10 E49", xp: "37%", hp: "30%" },
  { tier: "", amount: "100 E50", gold: "25%", xp: "8%", hp: "13%", totalRes: "38%", singleRes: "25%" },
  { tier: "Sexdecillion", amount: "1 E51", xp: "39%", hp: "31%", itemQuality: "+3" },
  { tier: "", amount: "10 E52", gold: "26%", xp: "26%" },
  { tier: "", amount: "100 E53", xp: "40%", hp: "32%" },
  { tier: "Septendecillion", amount: "1 E54", gold: "27%", xp: "14%", hp: "41%", totalRes: "33%", singleRes: "27%" },
  { tier: "", amount: "10 E55", gold: "6%" },
  { tier: "", amount: "100 E56", gold: "28%", xp: "9%", hp: "42%", totalRes: "34%", singleRes: "28%" },
  { tier: "Octodecillion", amount: "1 E57", xp: "43%", hp: "35%", note: "x8 Boost" },
  { tier: "", amount: "10 E58", gold: "29%", xp: "15%", hp: "44%", totalRes: "29%" },
  { tier: "", amount: "100 E59", xp: "45%", hp: "36%" },
  { tier: "Novendecillion", amount: "1 E60", gold: "30%", xp: "30%" },
  { tier: "", amount: "10 E61", xp: "46%", hp: "37%" },
  { tier: "", amount: "100 E62", gold: "31%", xp: "16%", hp: "47%", totalRes: "31%" },
  { tier: "Vigintillion", amount: "1 E63", gold: "10%", xp: "48%", hp: "38%" },
  { tier: "", amount: "10 E64", gold: "32%", xp: "49%", totalRes: "32%" },
  { tier: "", amount: "100 E65", gold: "7%", xp: "39%" },
  { tier: "Unvigintillion", amount: "1 E66", gold: "33%", xp: "17%", hp: "40%", totalRes: "33%" },
  { tier: "", amount: "10 E67", xp: "50%" },
];

function parseAmountScore(amount: string): number {
  // "10 E34" → base=10, exp=34 → score ≈ log10(base) + exp
  const m = amount.match(/(\d+)\s*E\s*(\d+)/i);
  if (!m) return 0;
  const base = Number(m[1] || 1);
  const exp = Number(m[2] || 0);
  return Math.log10(base) + exp;
}

function isAchievement(r: Row): boolean {
  return /achievement|capitalist|stinking rich|rune master/i.test(`${r.tier} ${r.note ?? ""}`);
}
function breakpointTag(r: Row): "x2" | "x12" | "x60" | null {
  const t = r.note?.toLowerCase() ?? "";
  if (t.includes("x60")) return "x60";
  if (t.includes("x12")) return "x12";
  if (t.includes("x2")) return "x2";
  return null;
}

/** Icon-Platzhalter – später via assets-map ersetzbar */
function RuneIcon({ label }: { label: string }) {
  const short = (label || "?").slice(0, 1).toUpperCase();
  return <div className={styles.iconBtn} title={label || "Rune"}>{short}</div>;
}
function RuneIconXL({ label }: { label: string }) {
  const short = (label || "?").slice(0, 1).toUpperCase();
  return <div className={styles.iconXL} title={label || "Rune"}>{short}</div>;
}

/** Gruppierung nach Tier (Thousand / Million / …) */
function groupByTier(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.tier && r.tier.trim() !== "" ? r.tier : "(no tier)";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries());
}

/** Bonus-Chips kompakt */
function BonusChips({ r }: { r: Row }) {
  const chips: string[] = [];
  if (r.gold) chips.push(`Gold ${r.gold}`);
  if (r.xp) chips.push(`XP ${r.xp}`);
  if (r.hp) chips.push(`HP ${r.hp}`);
  if (r.totalRes) chips.push(`Total Res ${r.totalRes}`);
  if (r.singleRes) chips.push(`Single Res ${r.singleRes}`);
  if (r.elemDmg) chips.push(`Elem ${r.elemDmg}`);
  if (r.itemQuality) chips.push(`Item ${r.itemQuality}`);
  if (r.epics) chips.push(`Epics ${r.epics}`);
  return (
    <div className={styles.chips}>
      {chips.map((c, i) => (
        <span key={i} className={styles.chip}>{c}</span>
      ))}
    </div>
  );
}

function Badges({ r, isMax }: { r: Row; isMax: boolean }) {
  const tags: { label: string; cls?: string }[] = [];
  if (isMax) tags.push({ label: "MAX", cls: styles.badgeMax });
  if (isAchievement(r)) tags.push({ label: "Achievement", cls: styles.badgeAchiev });
  const bp = breakpointTag(r);
  if (bp === "x2") tags.push({ label: "x2", cls: styles.badgeX2 });
  if (bp === "x12") tags.push({ label: "x12", cls: styles.badgeX12 });
  if (bp === "x60") tags.push({ label: "x60", cls: styles.badgeX60 });

  if (tags.length === 0) return null;
  return (
    <div className={styles.badges}>
      {tags.map((t, i) => (
        <span key={i} className={`${styles.badge} ${t.cls ?? ""}`}>{t.label}</span>
      ))}
    </div>
  );
}

/** Suche (lokal) */
function useFilteredRows(q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return RAW;
  return RAW.filter(r =>
    `${r.tier} ${r.amount} ${r.note ?? ""}`.toLowerCase().includes(query)
  );
}

/** --- Varianten --- */

/* A) Compact Table 2.0 */
function VariantA({ data }: { data: Row[] }) {
  const maxScore = Math.max(...data.map(d => parseAmountScore(d.amount)));
  const tiers = useMemo(() => Array.from(new Set(data.map(r => r.tier || "(no tier)"))), [data]);

  function scrollToTier(t: string) {
    const el = document.querySelector(`[data-tier="${CSS.escape(t || "(no tier)")}"`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <div className={styles.stickyIcons}>
        {tiers.map((t, i) => (
          <div key={i} onClick={() => scrollToTier(t)}>
            <RuneIcon label={t || "(no tier)"} />
          </div>
        ))}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} style={{ width: 42 }}></th>
              <th className={styles.th} style={{ width: 120 }}>Amount</th>
              <th className={styles.th}>Bonuses</th>
              <th className={styles.th} style={{ width: 220 }}>Tags</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const isMax = Math.abs(parseAmountScore(r.amount) - maxScore) < 0.000001;
              return (
                <tr key={i} className={styles.row} data-tier={r.tier || "(no tier)"}>
                  <td className={styles.td}><RuneIcon label={r.tier || ""} /></td>
                  <td className={styles.td}>{r.amount}</td>
                  <td className={styles.td}><BonusChips r={r} /></td>
                  <td className={styles.td}><Badges r={r} isMax={isMax} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* B) Card Track */
function VariantB({ data }: { data: Row[] }) {
  const groups = groupByTier(data);
  const maxScore = Math.max(...data.map(d => parseAmountScore(d.amount)));
  return (
    <>
      {groups.map(([tier, rows]) => (
        <section key={tier} className={styles.section}>
          <div className={styles.sectionHeader}>{tier}</div>
          <div className={styles.cardList}>
            {rows.map((r, i) => {
              const isMax = Math.abs(parseAmountScore(r.amount) - maxScore) < 0.000001;
              return (
                <div key={i} className={`${styles.card} ${isMax ? styles.cardMax : ""}`}>
                  <RuneIconXL label={tier} />
                  <div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <strong>{r.amount}</strong>
                      <Badges r={r} isMax={isMax} />
                    </div>
                    <BonusChips r={r} />
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>{tier}</div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

/* C) Two-Pane */
function VariantC({ data }: { data: Row[] }) {
  const tiers = Array.from(new Set(data.map(r => r.tier || "(no tier)")));
  const [active, setActive] = useState<string>(tiers[0] ?? "");
  const list = data.filter(r => (r.tier || "(no tier)") === active);
  const maxScore = Math.max(...data.map(d => parseAmountScore(d.amount)));

  return (
    <div className={styles.split}>
      <div className={styles.left}>
        {tiers.map(t => (
          <button
            key={t}
            className={`${styles.leftBtn} ${t === active ? styles.leftBtnActive : ""}`}
            onClick={() => setActive(t)}
          >
            <RuneIcon label={t} />
            <span>{t}</span>
          </button>
        ))}
      </div>
      <div className={styles.detail}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <RuneIconXL label={active} />
          <div>
            <div style={{ fontWeight: 700 }}>{active}</div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>Levels in this tier</div>
          </div>
        </div>
        {list.map((r, i) => {
          const isMax = Math.abs(parseAmountScore(r.amount) - maxScore) < 0.000001;
          return (
            <div key={i} className={styles.card} style={{ gridTemplateColumns: "1fr auto" }}>
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <strong>{r.amount}</strong>
                  <Badges r={r} isMax={isMax} />
                </div>
                <BonusChips r={r} />
              </div>
              <div style={{ opacity: 0.75, fontSize: 12, alignSelf: "start" }}>Amount</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* D) Icon Grid + Drawer */
function VariantD({ data }: { data: Row[] }) {
  const [sel, setSel] = useState<Row | null>(null);
  const maxScore = Math.max(...data.map(d => parseAmountScore(d.amount)));
  return (
    <>
      <div className={styles.grid}>
        {data.map((r, i) => (
          <div key={i} className={styles.tile} onClick={() => setSel(r)} title={r.tier || ""}>
            <div style={{ display: "grid", gap: 6, placeItems: "center" }}>
              <RuneIcon label={r.tier || ""} />
              <div style={{ fontSize: 12, opacity: 0.85 }}>{r.amount}</div>
            </div>
          </div>
        ))}
      </div>
      {sel && (
        <div className={styles.drawer}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <RuneIconXL label={sel.tier || ""} />
              <div>
                <div style={{ fontWeight: 700 }}>{sel.amount}</div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>{sel.tier || ""}</div>
              </div>
            </div>
            <button className={styles.tab} onClick={() => setSel(null)}>Close</button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Badges r={sel} isMax={Math.abs(parseAmountScore(sel.amount) - maxScore) < 0.000001} />
          </div>
          <BonusChips r={sel} />
        </div>
      )}
    </>
  );
}

/* E) Timeline / Stepper */
function VariantE({ data }: { data: Row[] }) {
  const maxScore = Math.max(...data.map(d => parseAmountScore(d.amount)));
  const sorted = [...data].sort((a,b) => parseAmountScore(a.amount) - parseAmountScore(b.amount));
  return (
    <div className={styles.timeline}>
      {sorted.map((r, i) => {
        const isMax = Math.abs(parseAmountScore(r.amount) - maxScore) < 0.000001;
        return (
          <div key={i} className={styles.node}>
            <div className={styles.dot}>{(r.tier || "?").slice(0,1).toUpperCase()}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong>{r.amount}</strong>
                <Badges r={r} isMax={isMax} />
              </div>
              <BonusChips r={r} />
            </div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>{r.tier || ""}</div>
          </div>
        );
      })}
    </div>
  );
}

/** --- Seite (Switcher A–E + Suche) --- */
const VARIANTS = ["A: Compact Table", "B: Card Track", "C: Two-Pane", "D: Icon Grid + Drawer", "E: Timeline"] as const;
type VariantKey = typeof VARIANTS[number];

export default function AMRuneBonusesDemos() {
  const [tab, setTab] = useState<VariantKey>("A: Compact Table");
  const [q, setQ] = useState("");
  const data = useFilteredRows(q);

  return (
    <div className={styles.page}>
      {/* Top Controls */}
      <div className={styles.topBar}>
        <div className={styles.tabs}>
          {VARIANTS.map(v => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className={`${styles.tab} ${tab === v ? styles.tabActive : ""}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className={styles.searchWrap}>
          <input
            className={styles.input}
            placeholder="Suche (z. B. thousand, x60, E34)…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Variant Content */}
      {tab === "A: Compact Table" && <VariantA data={data} />}
      {tab === "B: Card Track" && <VariantB data={data} />}
      {tab === "C: Two-Pane" && <VariantC data={data} />}
      {tab === "D: Icon Grid + Drawer" && <VariantD data={data} />}
      {tab === "E: Timeline" && <VariantE data={data} />}
    </div>
  );
}
