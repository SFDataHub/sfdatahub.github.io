import React from "react";
import "./GamifiedTab3.css";

type Sample = {
  id: string;
  categoryId: string;
  title: string;
  subtitle: string;
  tags?: string[];
  previewId: string;
};

type Category = {
  id: string;
  title: string;
  description: string;
  items: Sample[];
};

const categories: Category[] = [
  {
    id: "badges",
    title: "Badges & Titles",
    description: "Unlocks, nameplates, and medal visuals.",
    items: [
      { id: "1", categoryId: "badges", title: "Achievement Unlocked", subtitle: "Shimmer check", tags: ["mock", "ui"], previewId: "g3_badge_unlock_ring" },
      { id: "2", categoryId: "badges", title: "Locked Badge Mask", subtitle: "Silhouette lock", tags: ["mock"], previewId: "g3_badge_lock_mask" },
      { id: "3", categoryId: "badges", title: "Rarity Fan", subtitle: "Common to mythic fan", tags: ["concept"], previewId: "g3_rarity_fan" },
      { id: "4", categoryId: "badges", title: "Mastery Tiers", subtitle: "I-V concentric", tags: ["ui"], previewId: "g3_mastery_tiers" },
      { id: "5", categoryId: "badges", title: "Title Plate Frame", subtitle: "Nameplate glow", tags: ["mock"], previewId: "g3_title_plate" },
      { id: "6", categoryId: "badges", title: "Medal Banner", subtitle: "Bronze/Silver/Gold bar", tags: ["ui"], previewId: "g3_medal_banner" },
      { id: "7", categoryId: "badges", title: "Badge Glow Card", subtitle: "Starburst pop", tags: ["concept"], previewId: "g3_badge_glow" },
      { id: "8", categoryId: "badges", title: "Approved Stamp", subtitle: "Circular stamp", tags: ["mock"], previewId: "g3_stamp_card" },
      { id: "9", categoryId: "badges", title: "Showcase Strip", subtitle: "Static carousel", tags: ["ui"], previewId: "g3_showcase_strip" },
      { id: "10", categoryId: "badges", title: "First Scan Popover", subtitle: "Speech bubble", tags: ["mock"], previewId: "g3_first_popover" },
    ],
  },
  {
    id: "progress",
    title: "Progress & Gauges",
    description: "Bars, gauges, and segmented tracks.",
    items: [
      { id: "11", categoryId: "progress", title: "Boss Segments", subtitle: "Phase chunks", tags: ["mock"], previewId: "g3_boss_segments" },
      { id: "12", categoryId: "progress", title: "Dual Progress", subtitle: "You vs avg marker", tags: ["ui"], previewId: "g3_dual_progress" },
      { id: "13", categoryId: "progress", title: "Segment Rail", subtitle: "10-block rail", tags: ["concept"], previewId: "g3_segment_rail" },
      { id: "14", categoryId: "progress", title: "Donut Completion", subtitle: "Ring percent", tags: ["mock"], previewId: "g3_donut_completion" },
      { id: "15", categoryId: "progress", title: "Battery Meter", subtitle: "Energy cell", tags: ["ui"], previewId: "g3_battery_meter" },
      { id: "16", categoryId: "progress", title: "Thermo Column", subtitle: "Vertical fill", tags: ["mock"], previewId: "g3_thermo_column" },
      { id: "17", categoryId: "progress", title: "XP With Ticks", subtitle: "Micro ticks", tags: ["ui"], previewId: "g3_xp_ticks" },
      { id: "18", categoryId: "progress", title: "Stat Stack", subtitle: "Five attributes", tags: ["mock"], previewId: "g3_stat_stack" },
      { id: "19", categoryId: "progress", title: "Risk Arc", subtitle: "Arc meter", tags: ["concept"], previewId: "g3_risk_arc" },
      { id: "20", categoryId: "progress", title: "Perfect Run", subtitle: "Checklist + bar", tags: ["ui"], previewId: "g3_perfect_run" },
    ],
  },
  {
    id: "rankings",
    title: "Rankings & Competitive",
    description: "Podiums, ladders, deltas, and rivals.",
    items: [
      { id: "21", categoryId: "rankings", title: "Podium Trio", subtitle: "Top 3 heights", tags: ["mock"], previewId: "g3_podium_trio" },
      { id: "22", categoryId: "rankings", title: "Ladder Rungs", subtitle: "Rung climb", tags: ["ui"], previewId: "g3_ladder_rungs" },
      { id: "23", categoryId: "rankings", title: "League Shield", subtitle: "Tier shield", tags: ["concept"], previewId: "g3_league_shield" },
      { id: "24", categoryId: "rankings", title: "Delta Chips", subtitle: "Up/Down pills", tags: ["ui"], previewId: "g3_delta_chips" },
      { id: "25", categoryId: "rankings", title: "Percent Gauge", subtitle: "Needle gauge", tags: ["mock"], previewId: "g3_percent_gauge" },
      { id: "26", categoryId: "rankings", title: "Rival Split", subtitle: "You vs rival", tags: ["concept"], previewId: "g3_rival_split" },
      { id: "27", categoryId: "rankings", title: "Promotion Band", subtitle: "Green band", tags: ["ui"], previewId: "g3_promo_band" },
      { id: "28", categoryId: "rankings", title: "Relegation Band", subtitle: "Red band", tags: ["mock"], previewId: "g3_relegation_band" },
      { id: "29", categoryId: "rankings", title: "Top Five Rows", subtitle: "Ranked rows", tags: ["ui"], previewId: "g3_top_five" },
      { id: "30", categoryId: "rankings", title: "Rank Steps", subtitle: "Step chart", tags: ["mock"], previewId: "g3_rank_steps" },
    ],
  },
  {
    id: "collections",
    title: "Collections & Inventory",
    description: "Binders, stickers, and milestones.",
    items: [
      { id: "31", categoryId: "collections", title: "Binder Slots", subtitle: "Grid slots", tags: ["mock"], previewId: "g3_binder_slots" },
      { id: "32", categoryId: "collections", title: "Set Progress", subtitle: "3 of 5 lit", tags: ["ui"], previewId: "g3_set_progress" },
      { id: "33", categoryId: "collections", title: "Missing Checklist", subtitle: "Remaining shards", tags: ["mock"], previewId: "g3_missing_list" },
      { id: "34", categoryId: "collections", title: "Rarity Rows", subtitle: "Tier lines", tags: ["concept"], previewId: "g3_rarity_rows" },
      { id: "35", categoryId: "collections", title: "Legendary Spread", subtitle: "Book spread", tags: ["ui"], previewId: "g3_legendary_spread" },
      { id: "36", categoryId: "collections", title: "Pet Album", subtitle: "Avatar minis", tags: ["mock"], previewId: "g3_pet_album" },
      { id: "37", categoryId: "collections", title: "Sticker Sheet", subtitle: "Sticker grid", tags: ["concept"], previewId: "g3_sticker_sheet" },
      { id: "38", categoryId: "collections", title: "Duplicate Dial", subtitle: "Count dial", tags: ["ui"], previewId: "g3_duplicate_dial" },
      { id: "39", categoryId: "collections", title: "Trade/Lock Tags", subtitle: "State chips", tags: ["mock"], previewId: "g3_trade_lock" },
      { id: "40", categoryId: "collections", title: "Collection Timeline", subtitle: "Milestone nodes", tags: ["ui"], previewId: "g3_collection_timeline" },
    ],
  },
  {
    id: "micro",
    title: "Micro Interactions",
    description: "Toasts, tabs, ribbons, and overlays.",
    items: [
      { id: "41", categoryId: "micro", title: "Unlock Glow", subtitle: "Glowing card", tags: ["mock"], previewId: "g3_unlock_glow" },
      { id: "42", categoryId: "micro", title: "Inspect Tooltip", subtitle: "Hover tip", tags: ["ui"], previewId: "g3_inspect_tooltip" },
      { id: "43", categoryId: "micro", title: "Confetti Burst", subtitle: "Sprinkled dots", tags: ["concept"], previewId: "g3_confetti_burst" },
      { id: "44", categoryId: "micro", title: "Corner Ribbon", subtitle: "New ribbon", tags: ["mock"], previewId: "g3_corner_ribbon" },
      { id: "45", categoryId: "micro", title: "Locked Blur", subtitle: "Frosted overlay", tags: ["ui"], previewId: "g3_locked_blur" },
      { id: "46", categoryId: "micro", title: "Pulse Progress", subtitle: "Animated pulse", tags: ["concept"], previewId: "g3_pulse_progress" },
      { id: "47", categoryId: "micro", title: "Mini Tabs", subtitle: "Inline tab pills", tags: ["ui"], previewId: "g3_mini_tabs" },
      { id: "48", categoryId: "micro", title: "Expandable Block", subtitle: "Details reveal", tags: ["mock"], previewId: "g3_expand_block" },
      { id: "49", categoryId: "micro", title: "Toast Message", subtitle: "Inline toast", tags: ["ui"], previewId: "g3_toast_message" },
      { id: "50", categoryId: "micro", title: "Quest Failed", subtitle: "Warning slab", tags: ["mock"], previewId: "g3_quest_failed" },
    ],
  },
];

const Pill = ({ label }: { label: string }) => <span className="g3-pill">{label}</span>;

const Bar = ({ width, tone = "accent", height = 8 }: { width: string; tone?: string; height?: number }) => (
  <div className={`g3-bar tone-${tone}`} style={{ width, height }} />
);

const Dot = ({ tone = "accent", size = 8 }: { tone?: string; size?: number }) => (
  <span className={`g3-dot tone-${tone}`} style={{ width: size, height: size }} />
);

const renderPreview = (previewId: string) => {
  const fn = previewRenderers[previewId];
  return fn ? fn() : <div className="g3-preview g3-fallback" />;
};

const previewRenderers: Record<string, () => JSX.Element> = {
  g3_badge_unlock_ring: () => (
    <div className="g3-preview g3-row">
      <div className="g3-icon ring success">
        <span className="g3-checkmark" />
      </div>
      <div className="g3-col">
        <Bar width="80%" tone="success" />
        <div className="g3-pill-row">
          <Pill label="Unlocked" />
          <Pill label="+150 XP" />
        </div>
      </div>
    </div>
  ),
  g3_badge_lock_mask: () => (
    <div className="g3-preview g3-row">
      <div className="g3-icon ring muted">
        <div className="g3-lock-hole" />
      </div>
      <div className="g3-col">
        <div className="g3-mask-figure" />
        <Bar width="60%" tone="muted" />
      </div>
    </div>
  ),
  g3_rarity_fan: () => (
    <div className="g3-preview g3-row g3-gap-sm">
      {["muted", "accent", "success", "warning", "danger"].map((tone) => (
        <div key={tone} className={`g3-diamond tone-${tone}`} />
      ))}
    </div>
  ),
  g3_mastery_tiers: () => (
    <div className="g3-preview g3-row">
      <div className="g3-ring-stack">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`g3-ring-${i}`} />
        ))}
      </div>
      <div className="g3-col">
        <Bar width="65%" />
        <div className="g3-dot-row">
          <Dot />
          <Dot tone="success" />
          <Dot tone="warning" />
        </div>
      </div>
    </div>
  ),
  g3_title_plate: () => (
    <div className="g3-preview g3-plate">
      <div className="g3-plate-left" />
      <div className="g3-plate-text">Title</div>
      <div className="g3-plate-right" />
    </div>
  ),
  g3_medal_banner: () => (
    <div className="g3-preview g3-row g3-space-between">
      <div className="g3-medal bronze" />
      <div className="g3-medal silver" />
      <div className="g3-medal gold" />
    </div>
  ),
  g3_badge_glow: () => (
    <div className="g3-preview g3-row">
      <div className="g3-starburst" />
      <div className="g3-col">
        <Bar width="70%" />
        <Bar width="45%" tone="success" />
      </div>
    </div>
  ),
  g3_stamp_card: () => (
    <div className="g3-preview g3-stamp-card">
      <div className="g3-stamp-ring">APPROVED</div>
      <Bar width="60%" />
    </div>
  ),
  g3_showcase_strip: () => (
    <div className="g3-preview g3-carousel">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`g3-slide ${i === 1 ? "active" : ""}`} />
      ))}
      <div className="g3-dot-row">
        {[0, 1, 2, 3].map((i) => (
          <Dot key={i} tone={i === 1 ? "accent" : "muted"} />
        ))}
      </div>
    </div>
  ),
  g3_first_popover: () => (
    <div className="g3-preview g3-pop">
      <div className="g3-pop-bubble">
        <div className="g3-pop-title">First scan</div>
        <Bar width="70%" />
      </div>
      <div className="g3-pop-arrow" />
    </div>
  ),
  g3_boss_segments: () => (
    <div className="g3-preview g3-bossbar">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`g3-boss-segment ${i < 3 ? "filled" : ""}`} />
      ))}
      <div className="g3-marker" style={{ left: "72%" }} />
    </div>
  ),
  g3_dual_progress: () => (
    <div className="g3-preview g3-col">
      <Bar width="85%" />
      <div className="g3-dual">
        <Bar width="60%" tone="success" height={8} />
        <div className="g3-marker" style={{ left: "60%" }} />
        <div className="g3-marker muted" style={{ left: "85%" }} />
      </div>
    </div>
  ),
  g3_segment_rail: () => (
    <div className="g3-preview g3-rail">
      {Array.from({ length: 10 }).map((_, idx) => (
        <div key={idx} className={`g3-rail-segment ${idx < 6 ? "active" : ""}`} />
      ))}
    </div>
  ),
  g3_donut_completion: () => (
    <div className="g3-preview g3-row g3-center">
      <div className="g3-donut">
        <div className="g3-donut-fill" />
        <div className="g3-donut-hole">72%</div>
      </div>
      <Bar width="50%" />
    </div>
  ),
  g3_battery_meter: () => (
    <div className="g3-preview g3-row g3-center">
      <div className="g3-battery">
        <div className="g3-battery-cap" />
        <div className="g3-battery-fill" />
      </div>
      <Pill label="82%" />
    </div>
  ),
  g3_thermo_column: () => (
    <div className="g3-preview g3-row g3-center">
      <div className="g3-thermo">
        <div className="g3-thermo-fill" />
      </div>
      <div className="g3-col">
        <Bar width="40%" tone="warning" />
        <Bar width="30%" tone="muted" />
      </div>
    </div>
  ),
  g3_xp_ticks: () => (
    <div className="g3-preview g3-col">
      <div className="g3-xpbar">
        <div className="g3-xp-fill" />
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="g3-xp-tick" style={{ left: `${(i + 1) * 10}%` }} />
        ))}
      </div>
      <Pill label="Lvl 42" />
    </div>
  ),
  g3_stat_stack: () => (
    <div className="g3-preview g3-stats">
      {["STR", "DEX", "INT", "CON", "LCK"].map((s, idx) => (
        <div key={s} className="g3-stat-row">
          <span className="g3-stat-label">{s}</span>
          <Bar width={`${40 + idx * 10}%`} tone={idx % 2 === 0 ? "accent" : "success"} />
        </div>
      ))}
    </div>
  ),
  g3_risk_arc: () => (
    <div className="g3-preview g3-risk">
      <div className="g3-risk-arc">
        <div className="g3-risk-pointer" />
      </div>
      <Pill label="68%" />
    </div>
  ),
  g3_perfect_run: () => (
    <div className="g3-preview g3-perfect">
      <Bar width="100%" tone="success" />
      <div className="g3-checklist tiny">
        {["No deaths", "No errors", "All chests"].map((txt) => (
          <div key={txt} className="g3-check-row">
            <span className="g3-checkbox checked" />
            <span className="g3-check-label">{txt}</span>
          </div>
        ))}
      </div>
    </div>
  ),
  g3_podium_trio: () => (
    <div className="g3-preview g3-podium">
      {[{ h: 50, tone: "silver" }, { h: 70, tone: "gold" }, { h: 40, tone: "bronze" }].map((col, idx) => (
        <div key={idx} className={`g3-podium-col ${col.tone}`} style={{ height: col.h }}>
          #{idx + 1}
        </div>
      ))}
    </div>
  ),
  g3_ladder_rungs: () => (
    <div className="g3-preview g3-ladder">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className={`g3-rung ${idx === 2 ? "active" : ""}`} />
      ))}
    </div>
  ),
  g3_league_shield: () => (
    <div className="g3-preview g3-row g3-league">
      <div className="g3-league-shield" />
      <Bar width="70%" />
    </div>
  ),
  g3_delta_chips: () => (
    <div className="g3-preview g3-row g3-gap-sm">
      <Pill label="^ +12" />
      <Pill label="v -3" />
      <Bar width="50%" />
    </div>
  ),
  g3_percent_gauge: () => (
    <div className="g3-preview g3-row g3-center">
      <div className="g3-percent">
        <div className="g3-percent-needle" />
      </div>
      <Pill label="Top 5%" />
    </div>
  ),
  g3_rival_split: () => (
    <div className="g3-preview g3-rival">
      <div className="g3-vs">
        <Bar width="60%" />
        <Pill label="You" />
      </div>
      <div className="g3-vs-mid">VS</div>
      <div className="g3-vs rival">
        <Bar width="55%" tone="warning" />
        <Pill label="Rival" />
      </div>
    </div>
  ),
  g3_promo_band: () => (
    <div className="g3-preview g3-zone promo">
      <div className="g3-zone-band" />
      <div className="g3-zone-label">Promotion</div>
    </div>
  ),
  g3_relegation_band: () => (
    <div className="g3-preview g3-zone danger">
      <div className="g3-zone-band" />
      <div className="g3-zone-label">Relegation</div>
    </div>
  ),
  g3_top_five: () => (
    <div className="g3-preview g3-list">
      {["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((n, idx) => (
        <div key={n} className="g3-list-row">
          <span className="g3-list-num">{idx + 1}</span>
          <Bar width={`${70 - idx * 8}%`} tone={idx < 2 ? "accent" : "muted"} />
        </div>
      ))}
    </div>
  ),
  g3_rank_steps: () => (
    <div className="g3-preview g3-rank-steps">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="g3-step-dot" style={{ bottom: `${idx * 8}%`, left: `${idx * 16}%` }} />
      ))}
      <div className="g3-step-line" />
    </div>
  ),
  g3_binder_slots: () => (
    <div className="g3-preview g3-grid-cards">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className={`g3-slot ${idx < 3 ? "filled" : ""}`} />
      ))}
    </div>
  ),
  g3_set_progress: () => (
    <div className="g3-preview g3-row g3-gap-sm">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className={`g3-piece ${idx < 3 ? "active" : ""}`} />
      ))}
      <Pill label="3 / 5" />
    </div>
  ),
  g3_missing_list: () => (
    <div className="g3-preview g3-checklist">
      {["Shard A", "Shard B", "Shard C"].map((item, idx) => (
        <div key={item} className="g3-check-row">
          <span className={`g3-checkbox ${idx === 2 ? "" : "checked"}`} />
          <span className="g3-check-label">{item}</span>
        </div>
      ))}
    </div>
  ),
  g3_rarity_rows: () => (
    <div className="g3-preview g3-col g3-gap-xs">
      <Bar width="90%" tone="muted" />
      <Bar width="70%" tone="accent" />
      <Bar width="50%" tone="success" />
      <Bar width="40%" tone="warning" />
      <Bar width="30%" tone="danger" />
    </div>
  ),
  g3_legendary_spread: () => (
    <div className="g3-preview g3-book">
      <div className="g3-book-page left" />
      <div className="g3-book-page right" />
    </div>
  ),
  g3_pet_album: () => (
    <div className="g3-preview g3-pet-grid">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="g3-pet-avatar">
          <span className="g3-pet-ear" />
          <span className="g3-pet-ear" />
        </div>
      ))}
    </div>
  ),
  g3_sticker_sheet: () => (
    <div className="g3-preview g3-sticker-sheet">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="g3-sticker" />
      ))}
    </div>
  ),
  g3_duplicate_dial: () => (
    <div className="g3-preview g3-row g3-center">
      <div className="g3-counter">
        <div className="g3-counter-needle" />
      </div>
      <Pill label="x4" />
    </div>
  ),
  g3_trade_lock: () => (
    <div className="g3-preview g3-row g3-gap-sm">
      <Pill label="Tradeable" />
      <Pill label="Locked" />
      <Bar width="40%" />
    </div>
  ),
  g3_collection_timeline: () => (
    <div className="g3-preview g3-timeline">
      {[10, 25, 50, 100].map((milestone, idx) => (
        <div key={milestone} className="g3-timeline-node" style={{ left: `${idx * 25}%` }}>
          <span className="g3-timeline-label">{milestone}</span>
        </div>
      ))}
      <div className="g3-timeline-line" />
    </div>
  ),
  g3_unlock_glow: () => (
    <div className="g3-preview g3-glow-card">
      <Bar width="60%" tone="success" />
    </div>
  ),
  g3_inspect_tooltip: () => (
    <div className="g3-preview g3-tooltip-card">
      <div className="g3-tooltip-box">Inspect</div>
      <div className="g3-tooltip-tail" />
    </div>
  ),
  g3_confetti_burst: () => (
    <div className="g3-preview g3-confetti">
      {Array.from({ length: 12 }).map((_, idx) => (
        <div key={idx} className="g3-confetti-dot" />
      ))}
    </div>
  ),
  g3_corner_ribbon: () => (
    <div className="g3-preview g3-corner">
      <div className="g3-corner-ribbon">New</div>
      <Bar width="60%" />
    </div>
  ),
  g3_locked_blur: () => (
    <div className="g3-preview g3-locked">
      <div className="g3-locked-mask" />
      <div className="g3-lock-hole" />
    </div>
  ),
  g3_pulse_progress: () => (
    <div className="g3-preview g3-pulse-bar">
      <div className="g3-pulse-fill" />
    </div>
  ),
  g3_mini_tabs: () => (
    <div className="g3-preview g3-col g3-gap-xs">
      <div className="g3-tabs">
        <div className="g3-tab active">One</div>
        <div className="g3-tab">Two</div>
        <div className="g3-tab">Three</div>
      </div>
      <Bar width="70%" />
    </div>
  ),
  g3_expand_block: () => (
    <div className="g3-preview g3-details">
      <div className="g3-details-summary">Details</div>
      <div className="g3-details-body">
        <Bar width="60%" tone="muted" />
        <Bar width="40%" tone="muted" />
      </div>
    </div>
  ),
  g3_toast_message: () => (
    <div className="g3-preview g3-toast">
      <div className="g3-toast-dot" />
      <Bar width="70%" />
    </div>
  ),
  g3_quest_failed: () => (
    <div className="g3-preview g3-failed">
      <div className="g3-warning-icon" />
      <div className="g3-col">
        <Bar width="60%" tone="danger" />
        <Bar width="40%" tone="muted" />
      </div>
    </div>
  ),
};

export default function GamifiedTab3() {
  return (
    <div className="g3-root">
      <header className="g3-intro">
        <div>
          <h2>Gamified 3</h2>
          <p className="g3-sub">50 unique mock previews across 5 categories. All static and scoped to this page.</p>
        </div>
        <div className="g3-pill-row">
          <Pill label="mock" />
          <Pill label="concept" />
          <Pill label="ui" />
        </div>
      </header>

      <nav className="g3-toc">
        {categories.map((cat) => (
          <a key={cat.id} href={`#${cat.id}`} className="g3-toc-link">
            {cat.title}
          </a>
        ))}
      </nav>

      <div className="g3-sections">
        {categories.map((cat) => (
          <details key={cat.id} className="g3-section" open id={cat.id}>
            <summary className="g3-section-header">
              <div>
                <div className="g3-section-title">{cat.title}</div>
                <div className="g3-section-sub">{cat.description}</div>
              </div>
              <span className="g3-summary-line">{cat.items.length} items</span>
            </summary>

            <div className="g3-grid">
              {cat.items.map((item) => (
                <div key={item.id} className="g3-card">
                  <div className="g3-card-head">
                    <div>
                      <div className="g3-card-title">{item.title}</div>
                      <div className="g3-card-sub">{item.subtitle}</div>
                    </div>
                    <div className="g3-pill-row">
                      {(item.tags || ["mock"]).map((tag) => (
                        <Pill key={tag} label={tag} />
                      ))}
                    </div>
                  </div>
                  {renderPreview(item.previewId)}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
