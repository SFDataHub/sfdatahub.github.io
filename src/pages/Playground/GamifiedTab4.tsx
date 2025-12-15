import React from "react";
import "./GamifiedTab4.css";

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
    id: "controls",
    title: "Controls & Navigation",
    description: "Chips, toggles, sliders, and small navigation rails.",
    items: [
      { id: "1", categoryId: "controls", title: "Segmented Toggle Bar", subtitle: "3 states, active glow", tags: ["UI"], previewId: "pv_ui_seg_toggle_3" },
      { id: "2", categoryId: "controls", title: "Icon Tab Rail", subtitle: "mini tabs with badges", tags: ["UI"], previewId: "pv_ui_icon_tabs_badges" },
      { id: "3", categoryId: "controls", title: "Filter Chips Row", subtitle: "wrap + selected state", tags: ["UI"], previewId: "pv_ui_filter_chips_wrap" },
      { id: "4", categoryId: "controls", title: "Sort Pill Switch", subtitle: "ASC/DESC pill", tags: ["UI"], previewId: "pv_ui_sort_pill" },
      { id: "5", categoryId: "controls", title: "Search Field + Hint", subtitle: "inline hint + icon", tags: ["UI"], previewId: "pv_ui_search_hint" },
      { id: "6", categoryId: "controls", title: "Dropdown Menu Stack", subtitle: "3 options + separators", tags: ["UI"], previewId: "pv_ui_dropdown_stack" },
      { id: "7", categoryId: "controls", title: "Range Slider Track", subtitle: "ticks + thumb", tags: ["UI"], previewId: "pv_ui_slider_ticks" },
      { id: "8", categoryId: "controls", title: "Stepper Control", subtitle: "prev/next + step dots", tags: ["UI"], previewId: "pv_ui_stepper_dots" },
      { id: "9", categoryId: "controls", title: "Compact Pagination", subtitle: "1..5 + next", tags: ["UI"], previewId: "pv_ui_pagination_compact" },
      { id: "10", categoryId: "controls", title: "Sticky Subnav", subtitle: "active underline", tags: ["UI"], previewId: "pv_ui_sticky_subnav" },
    ],
  },
  {
    id: "cards",
    title: "Cards, Frames, Overlays",
    description: "Mini cards, ribbons, overlays, and tooltip shells.",
    items: [
      { id: "11", categoryId: "cards", title: "Card Header Ribbon", subtitle: "angled label", tags: ["UI"], previewId: "pv_ui_ribbon_header" },
      { id: "12", categoryId: "cards", title: "Corner Tag Overlay", subtitle: "top-right chip", tags: ["UI"], previewId: "pv_ui_corner_tag" },
      { id: "13", categoryId: "cards", title: "Locked Overlay Blur", subtitle: "frosted lock", tags: ["UI"], previewId: "pv_ui_locked_blur2" },
      { id: "14", categoryId: "cards", title: "Tooltip Bubble", subtitle: "arrow + shadow", tags: ["UI"], previewId: "pv_ui_tooltip_bubble" },
      { id: "15", categoryId: "cards", title: "Popover Panel", subtitle: "title + actions", tags: ["UI"], previewId: "pv_ui_popover_panel" },
      { id: "16", categoryId: "cards", title: "Modal Mini Mock", subtitle: "header/body/footer", tags: ["UI"], previewId: "pv_ui_modal_mini" },
      { id: "17", categoryId: "cards", title: "Drawer Slide Mock", subtitle: "right drawer", tags: ["UI"], previewId: "pv_ui_drawer_right" },
      { id: "18", categoryId: "cards", title: "Toast Stack", subtitle: "3 toasts", tags: ["UI"], previewId: "pv_ui_toast_stack3" },
      { id: "19", categoryId: "cards", title: "Inline Callout", subtitle: "info box", tags: ["UI"], previewId: "pv_ui_callout_inline" },
      { id: "20", categoryId: "cards", title: "Badge Cluster", subtitle: "3 badge styles", tags: ["UI"], previewId: "pv_ui_badge_cluster" },
    ],
  },
  {
    id: "progress",
    title: "Progress & Meters",
    description: "Bars, dials, ladders, and dual markers.",
    items: [
      { id: "21", categoryId: "progress", title: "XP Bar with Ticks", subtitle: "level ticks", tags: ["UI"], previewId: "pv_ui_xp_ticks2" },
      { id: "22", categoryId: "progress", title: "Dual Marker Bar", subtitle: "avg marker line", tags: ["UI"], previewId: "pv_ui_dual_marker_bar" },
      { id: "23", categoryId: "progress", title: "Donut + Label", subtitle: "% inside ring", tags: ["UI"], previewId: "pv_ui_donut_label" },
      { id: "24", categoryId: "progress", title: "Segmented Track 12", subtitle: "filled segments", tags: ["UI"], previewId: "pv_ui_segment_track_12" },
      { id: "25", categoryId: "progress", title: "Vertical Thermometer", subtitle: "fill + cap", tags: ["UI"], previewId: "pv_ui_thermo_cap" },
      { id: "26", categoryId: "progress", title: "Battery Gauge", subtitle: "4 cells", tags: ["UI"], previewId: "pv_ui_battery_cells" },
      { id: "27", categoryId: "progress", title: "Multi Stat Microbars", subtitle: "5 bars", tags: ["UI"], previewId: "pv_ui_microbars_5" },
      { id: "28", categoryId: "progress", title: "Streak Chain Meter", subtitle: "linked dots", tags: ["UI"], previewId: "pv_ui_streak_chain" },
      { id: "29", categoryId: "progress", title: "Risk Dial", subtitle: "semi arc gauge", tags: ["UI"], previewId: "pv_ui_risk_semi_dial" },
      { id: "30", categoryId: "progress", title: "Goal Ladder", subtitle: "milestones steps", tags: ["UI"], previewId: "pv_ui_goal_ladder" },
    ],
  },
  {
    id: "lists",
    title: "Lists & Tables",
    description: "Leaderboard rows, KPIs, timelines, and accordions.",
    items: [
      { id: "31", categoryId: "lists", title: "Mini Leaderboard", subtitle: "top 5 rows", tags: ["UI"], previewId: "pv_ui_leaderboard_5" },
      { id: "32", categoryId: "lists", title: "Two-Column KPI List", subtitle: "label/value", tags: ["UI"], previewId: "pv_ui_kpi_list_2col" },
      { id: "33", categoryId: "lists", title: "Table Row Hover", subtitle: "highlight row mock", tags: ["UI"], previewId: "pv_ui_table_hover" },
      { id: "34", categoryId: "lists", title: "Rank Delta Row", subtitle: "▲▼ chips in row", tags: ["UI"], previewId: "pv_ui_rank_delta_row" },
      { id: "35", categoryId: "lists", title: "Avatar List Compact", subtitle: "3 entries", tags: ["UI"], previewId: "pv_ui_avatar_list3" },
      { id: "36", categoryId: "lists", title: "Timeline Row", subtitle: "dots + text", tags: ["UI"], previewId: "pv_ui_timeline_row" },
      { id: "37", categoryId: "lists", title: "Split Panel List", subtitle: "left labels, right values", tags: ["UI"], previewId: "pv_ui_split_panel_list" },
      { id: "38", categoryId: "lists", title: "Chip List with Counts", subtitle: "chips + numbers", tags: ["UI"], previewId: "pv_ui_chip_counts" },
      { id: "39", categoryId: "lists", title: "Accordion List", subtitle: "3 items expanded", tags: ["UI"], previewId: "pv_ui_accordion3" },
      { id: "40", categoryId: "lists", title: "Activity Spark Row", subtitle: "sparkline + value", tags: ["UI"], previewId: "pv_ui_spark_row" },
    ],
  },
  {
    id: "animated",
    title: "Animated/Interactive UI",
    description: "Pulses, flips, shimmer, and motion stripes.",
    items: [
      { id: "41", categoryId: "animated", title: "Pulse Progress", subtitle: "subtle animated fill", tags: ["UI"], previewId: "pv_ui_pulse_progress2" },
      { id: "42", categoryId: "animated", title: "Unlock Glow", subtitle: "animated border glow", tags: ["UI"], previewId: "pv_ui_unlock_glow2" },
      { id: "43", categoryId: "animated", title: "Shimmer Skeleton", subtitle: "loading skeleton", tags: ["UI"], previewId: "pv_ui_skeleton_shimmer" },
      { id: "44", categoryId: "animated", title: "Confetti Dots", subtitle: "sprinkle burst", tags: ["UI"], previewId: "pv_ui_confetti_dots2" },
      { id: "45", categoryId: "animated", title: "Hover Lift Card", subtitle: "lift + shadow", tags: ["UI"], previewId: "pv_ui_hover_lift" },
      { id: "46", categoryId: "animated", title: "Scan Ping Indicator", subtitle: "radial ping", tags: ["UI"], previewId: "pv_ui_ping_indicator" },
      { id: "47", categoryId: "animated", title: "Badge Pop Animation", subtitle: "scale pop", tags: ["UI"], previewId: "pv_ui_badge_pop" },
      { id: "48", categoryId: "animated", title: "Toggle Flip", subtitle: "switch animation", tags: ["UI"], previewId: "pv_ui_toggle_flip" },
      { id: "49", categoryId: "animated", title: "Progress Stripe Motion", subtitle: "moving stripes", tags: ["UI"], previewId: "pv_ui_stripe_motion" },
      { id: "50", categoryId: "animated", title: "Notification Bell Pulse", subtitle: "tiny pulse ring", tags: ["UI"], previewId: "pv_ui_bell_pulse" },
    ],
  },
];

const Pill = ({ label }: { label: string }) => <span className="g4-pill">{label}</span>;

const Bar = ({ width, tone = "accent", height = 8 }: { width: string; tone?: string; height?: number }) => (
  <div className={`g4-bar tone-${tone}`} style={{ width, height }} />
);

const Dot = ({ tone = "accent", size = 8 }: { tone?: string; size?: number }) => (
  <span className={`g4-dot tone-${tone}`} style={{ width: size, height: size }} />
);

const previewRenderers: Record<string, () => JSX.Element> = {
  pv_ui_seg_toggle_3: () => (
    <div className="g4-preview g4-row g4-gap-sm">
      {["Stats", "Roster", "Logs"].map((label, idx) => (
        <div key={label} className={`g4-seg ${idx === 1 ? "active" : ""}`}>
          {label}
        </div>
      ))}
    </div>
  ),
  pv_ui_icon_tabs_badges: () => (
    <div className="g4-preview g4-row g4-gap-sm">
      {[
        { icon: "★", badge: 2 },
        { icon: "⚙", badge: 4, active: true },
        { icon: "☰", badge: 1 },
      ].map((tab) => (
        <div key={tab.icon} className={`g4-icon-tab ${tab.active ? "active" : ""}`}>
          <span className="g4-icon">{tab.icon}</span>
          <span className="g4-badge">{tab.badge}</span>
        </div>
      ))}
    </div>
  ),
  pv_ui_filter_chips_wrap: () => (
    <div className="g4-preview g4-row g4-gap-xs g4-wrap">
      {["All", "PVE", "PVP", "Guild", "Trades", "Events"].map((chip, idx) => (
        <span key={chip} className={`g4-chip ${idx === 2 ? "active" : ""}`}>
          {chip}
        </span>
      ))}
    </div>
  ),
  pv_ui_sort_pill: () => (
    <div className="g4-preview g4-row g4-gap-sm g4-space-between">
      <div className="g4-pill-toggle">
        <span className="on">ASC</span>
        <span className="off">DESC</span>
      </div>
      <div className="g4-sort-arrows">
        <div className="g4-arrow up" />
        <div className="g4-arrow down" />
      </div>
    </div>
  ),
  pv_ui_search_hint: () => (
    <div className="g4-preview g4-row g4-gap-sm g4-center">
      <div className="g4-search">
        <span className="g4-search-icon">🔍</span>
        <input className="g4-search-input" value="search players" readOnly />
      </div>
      <span className="g4-hint">Press / to focus</span>
    </div>
  ),
  pv_ui_dropdown_stack: () => (
    <div className="g4-preview g4-col g4-gap-xs">
      {["Newest", "Top Rated", "Favorites"].map((opt, idx) => (
        <div key={opt} className="g4-menu-row">
          <span>{opt}</span>
          {idx === 0 && <span className="g4-check">✓</span>}
        </div>
      ))}
    </div>
  ),
  pv_ui_slider_ticks: () => (
    <div className="g4-preview g4-col g4-gap-xs">
      <div className="g4-slider">
        <div className="g4-slider-track">
          <div className="g4-slider-fill" style={{ width: "64%" }} />
          <div className="g4-slider-thumb" style={{ left: "64%" }} />
        </div>
        <div className="g4-slider-ticks">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
      <div className="g4-slider-labels">
        <span>0</span>
        <span>64</span>
        <span>100</span>
      </div>
    </div>
  ),
  pv_ui_stepper_dots: () => (
    <div className="g4-preview g4-row g4-space-between g4-center">
      <button className="g4-btn ghost">Prev</button>
      <div className="g4-row g4-gap-xs g4-center">
        {Array.from({ length: 5 }).map((_, idx) => (
          <span key={idx} className={`g4-step-dot ${idx < 2 ? "done" : idx === 2 ? "active" : ""}`} />
        ))}
      </div>
      <button className="g4-btn solid">Next</button>
    </div>
  ),
  pv_ui_pagination_compact: () => (
    <div className="g4-preview g4-row g4-gap-xs g4-center">
      {[1, 2, 3, 4, 5].map((num) => (
        <span key={num} className={`g4-page ${num === 3 ? "active" : ""}`}>
          {num}
        </span>
      ))}
      <span className="g4-page ghost">Next</span>
    </div>
  ),
  pv_ui_sticky_subnav: () => (
    <div className="g4-preview g4-row g4-gap-sm g4-sticky">
      {["Overview", "Teams", "History", "Files"].map((tab, idx) => (
        <div key={tab} className={`g4-subtab ${idx === 1 ? "active" : ""}`}>
          {tab}
          {idx === 1 && <div className="g4-underline" />}
        </div>
      ))}
    </div>
  ),
  pv_ui_ribbon_header: () => (
    <div className="g4-preview g4-card-slab">
      <div className="g4-ribbon">NEW</div>
      <div className="g4-col g4-gap-xs">
        <Bar width="70%" />
        <Bar width="50%" tone="muted" />
      </div>
    </div>
  ),
  pv_ui_corner_tag: () => (
    <div className="g4-preview g4-card-slab">
      <div className="g4-corner-tag">UI</div>
      <Bar width="60%" />
      <Bar width="40%" tone="muted" />
    </div>
  ),
  pv_ui_locked_blur2: () => (
    <div className="g4-preview g4-locked">
      <div className="g4-locked-blur" />
      <div className="g4-lock-icon">🔒</div>
      <Bar width="50%" tone="muted" />
    </div>
  ),
  pv_ui_tooltip_bubble: () => (
    <div className="g4-preview g4-tooltip">
      <div className="g4-tooltip-body">
        <Bar width="70%" />
        <Bar width="40%" tone="muted" />
      </div>
      <div className="g4-tooltip-arrow" />
    </div>
  ),
  pv_ui_popover_panel: () => (
    <div className="g4-preview g4-popover">
      <div className="g4-popover-head">
        <Bar width="50%" />
        <div className="g4-row g4-gap-xs">
          <span className="g4-dot tone-muted" />
          <span className="g4-dot tone-muted" />
        </div>
      </div>
      <Bar width="80%" tone="muted" />
      <Bar width="60%" tone="muted" />
    </div>
  ),
  pv_ui_modal_mini: () => (
    <div className="g4-preview g4-modal">
      <div className="g4-modal-head">
        <Bar width="50%" />
        <span className="g4-close">×</span>
      </div>
      <div className="g4-modal-body">
        <Bar width="90%" tone="muted" />
        <Bar width="70%" tone="muted" />
      </div>
      <div className="g4-modal-foot">
        <button className="g4-btn ghost">Cancel</button>
        <button className="g4-btn solid">Save</button>
      </div>
    </div>
  ),
  pv_ui_drawer_right: () => (
    <div className="g4-preview g4-drawer">
      <div className="g4-drawer-body">
        <Bar width="65%" />
        <Bar width="40%" tone="muted" />
      </div>
      <div className="g4-drawer-panel">
        <div className="g4-panel-handle" />
        <Bar width="70%" />
        <Bar width="50%" tone="muted" />
      </div>
    </div>
  ),
  pv_ui_toast_stack3: () => (
    <div className="g4-preview g4-col g4-gap-xs">
      {["Synced", "New invite", "Warning"].map((msg, idx) => (
        <div key={msg} className={`g4-toast ${idx === 2 ? "warn" : ""}`}>
          <span className="g4-dot tone-success" />
          <span>{msg}</span>
        </div>
      ))}
    </div>
  ),
  pv_ui_callout_inline: () => (
    <div className="g4-preview g4-callout">
      <div className="g4-callout-icon">i</div>
      <div className="g4-col g4-gap-xxs">
        <Bar width="60%" />
        <Bar width="40%" tone="muted" />
      </div>
    </div>
  ),
  pv_ui_badge_cluster: () => (
    <div className="g4-preview g4-row g4-gap-xs">
      <Pill label="Beta" />
      <Pill label="Live" />
      <Pill label="Pro" />
    </div>
  ),
  pv_ui_xp_ticks2: () => (
    <div className="g4-preview g4-col g4-gap-xs">
      <div className="g4-xpbar">
        <div className="g4-xp-fill" style={{ width: "78%" }} />
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="g4-xp-tick" style={{ left: `${(i + 1) * 10}%` }} />
        ))}
      </div>
      <div className="g4-row g4-gap-xs">
        <Pill label="Lvl 56" />
        <Pill label="78%" />
      </div>
    </div>
  ),
  pv_ui_dual_marker_bar: () => (
    <div className="g4-preview g4-col g4-gap-xxs">
      <div className="g4-bar-line">
        <Bar width="92%" />
        <div className="g4-marker" style={{ left: "64%" }} />
        <div className="g4-marker muted" style={{ left: "82%" }} />
      </div>
      <div className="g4-row g4-gap-sm g4-center">
        <Pill label="You" />
        <Pill label="Avg" />
      </div>
    </div>
  ),
  pv_ui_donut_label: () => (
    <div className="g4-preview g4-row g4-center g4-gap-sm">
      <div className="g4-donut">
        <div className="g4-donut-fill" />
        <div className="g4-donut-hole">64%</div>
      </div>
      <div className="g4-col g4-gap-xxs">
        <Bar width="60%" />
        <Bar width="40%" tone="muted" />
      </div>
    </div>
  ),
  pv_ui_segment_track_12: () => (
    <div className="g4-preview g4-row g4-gap-xxs g4-seg-track">
      {Array.from({ length: 12 }).map((_, idx) => (
        <div key={idx} className={`g4-track-seg ${idx < 8 ? "active" : ""}`} />
      ))}
    </div>
  ),
  pv_ui_thermo_cap: () => (
    <div className="g4-preview g4-row g4-center g4-gap-sm">
      <div className="g4-thermo">
        <div className="g4-thermo-fill" style={{ height: "70%" }} />
        <div className="g4-thermo-cap" />
      </div>
      <div className="g4-col g4-gap-xxs">
        <Bar width="50%" tone="warning" />
        <Bar width="30%" tone="muted" />
      </div>
    </div>
  ),
  pv_ui_battery_cells: () => (
    <div className="g4-preview g4-row g4-center g4-gap-sm">
      <div className="g4-battery">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`g4-battery-cell ${i < 3 ? "filled" : ""}`} />
        ))}
        <div className="g4-battery-cap" />
      </div>
      <Pill label="75%" />
    </div>
  ),
  pv_ui_microbars_5: () => (
    <div className="g4-preview g4-col g4-gap-xxs">
      {["ATK", "SPD", "HP", "DEF", "LCK"].map((stat, idx) => (
        <div key={stat} className="g4-row g4-gap-xs g4-center">
          <span className="g4-stat-label">{stat}</span>
          <Bar width={`${40 + idx * 12}%`} tone={idx % 2 === 0 ? "accent" : "success"} height={6} />
        </div>
      ))}
    </div>
  ),
  pv_ui_streak_chain: () => (
    <div className="g4-preview g4-row g4-gap-xxs g4-center">
      {Array.from({ length: 8 }).map((_, idx) => (
        <React.Fragment key={idx}>
          <span className={`g4-chain-dot ${idx < 5 ? "active" : ""}`} />
          {idx < 7 && <div className="g4-chain-link" />}
        </React.Fragment>
      ))}
    </div>
  ),
  pv_ui_risk_semi_dial: () => (
    <div className="g4-preview g4-row g4-center g4-gap-sm">
      <div className="g4-semi-dial">
        <div className="g4-dial-needle" style={{ transform: "rotate(30deg)" }} />
      </div>
      <Pill label="Risk 34%" />
    </div>
  ),
  pv_ui_goal_ladder: () => (
    <div className="g4-preview g4-col g4-gap-xxs g4-ladder">
      {[1, 2, 3, 4].map((step, idx) => (
        <div key={step} className={`g4-ladder-step ${idx < 2 ? "done" : ""}`}>
          <span className="g4-ladder-rung" />
          <Bar width={`${40 + idx * 10}%`} tone="accent" height={6} />
        </div>
      ))}
    </div>
  ),
  pv_ui_leaderboard_5: () => (
    <div className="g4-preview g4-col g4-gap-xxs">
      {["Aster", "Bloom", "Cinder", "Dawn", "Echo"].map((name, idx) => (
        <div key={name} className={`g4-row g4-gap-sm g4-leader-row ${idx === 0 ? "active" : ""}`}>
          <span className="g4-rank-num">{idx + 1}</span>
          <Bar width={`${70 - idx * 8}%`} tone={idx < 2 ? "accent" : "muted"} height={6} />
          <Pill label="+12" />
        </div>
      ))}
    </div>
  ),
  pv_ui_kpi_list_2col: () => (
    <div className="g4-preview g4-col g4-gap-xxs">
      {[
        ["Win rate", "62%"],
        ["Uptime", "99.1%"],
        ["Scan time", "4.3s"],
      ].map(([label, value]) => (
        <div key={label} className="g4-row g4-space-between g4-center">
          <span className="g4-label">{label}</span>
          <span className="g4-value">{value}</span>
        </div>
      ))}
    </div>
  ),
  pv_ui_table_hover: () => (
    <div className="g4-preview g4-col g4-gap-xxs">
      {["Row A", "Row B", "Row C"].map((row, idx) => (
        <div key={row} className={`g4-table-row ${idx === 1 ? "hover" : ""}`}>
          <Bar width="60%" tone="muted" height={6} />
        </div>
      ))}
    </div>
  ),
  pv_ui_rank_delta_row: () => (
    <div className="g4-preview g4-row g4-gap-sm g4-center">
      <Pill label="▲ +6" />
      <Pill label="▼ -2" />
      <Bar width="50%" tone="accent" />
    </div>
  ),
  pv_ui_avatar_list3: () => (
    <div className="g4-preview g4-col g4-gap-xxs">
      {["Aria", "Bex", "Cole"].map((name, idx) => (
        <div key={name} className="g4-row g4-gap-sm g4-center">
          <div className="g4-avatar">{name[0]}</div>
          <Bar width={`${50 + idx * 10}%`} tone="accent" height={6} />
        </div>
      ))}
    </div>
  ),
  pv_ui_timeline_row: () => (
    <div className="g4-preview g4-row g4-gap-sm g4-center">
      {["Step 1", "Step 2", "Step 3"].map((label, idx) => (
        <div key={label} className="g4-col g4-center g4-gap-xxs">
          <span className={`g4-timeline-dot ${idx <= 1 ? "active" : ""}`} />
          <span className="g4-mini-label">{label}</span>
        </div>
      ))}
    </div>
  ),
  pv_ui_split_panel_list: () => (
    <div className="g4-preview g4-row g4-space-between g4-center">
      <div className="g4-col g4-gap-xxs">
        <span className="g4-label">Power</span>
        <span className="g4-label">Speed</span>
        <span className="g4-label">Luck</span>
      </div>
      <div className="g4-col g4-gap-xxs">
        <Bar width="60%" />
        <Bar width="40%" tone="warning" />
        <Bar width="30%" tone="success" />
      </div>
    </div>
  ),
  pv_ui_chip_counts: () => (
    <div className="g4-preview g4-row g4-gap-xs g4-wrap">
      {[
        ["Tanks", "12"],
        ["Healers", "5"],
        ["DPS", "18"],
        ["Support", "7"],
      ].map(([label, num], idx) => (
        <span key={label} className={`g4-chip ${idx === 2 ? "active" : ""}`}>
          {label} <span className="g4-count">{num}</span>
        </span>
      ))}
    </div>
  ),
  pv_ui_accordion3: () => (
    <div className="g4-preview g4-col g4-gap-xs">
      {["Summary", "Details", "Meta"].map((section, idx) => (
        <div key={section} className={`g4-accordion ${idx === 0 ? "open" : ""}`}>
          <div className="g4-accordion-head">
            <span>{section}</span>
            <span className="g4-chevron" />
          </div>
          {idx === 0 && (
            <div className="g4-accordion-body">
              <Bar width="70%" tone="muted" />
              <Bar width="40%" tone="muted" />
            </div>
          )}
        </div>
      ))}
    </div>
  ),
  pv_ui_spark_row: () => (
    <div className="g4-preview g4-row g4-space-between g4-center">
      <div className="g4-sparkline">
        {Array.from({ length: 12 }).map((_, idx) => (
          <span key={idx} style={{ height: `${8 + (idx % 5) * 6}px` }} />
        ))}
      </div>
      <Pill label="72%" />
    </div>
  ),
  pv_ui_pulse_progress2: () => (
    <div className="g4-preview g4-col g4-gap-xxs">
      <div className="g4-pulse-bar">
        <div className="g4-pulse-fill" style={{ width: "68%" }} />
      </div>
      <span className="g4-mini-label">Syncing…</span>
    </div>
  ),
  pv_ui_unlock_glow2: () => (
    <div className="g4-preview g4-glow-card">
      <div className="g4-lock-icon">🔓</div>
      <Bar width="60%" />
    </div>
  ),
  pv_ui_skeleton_shimmer: () => (
    <div className="g4-preview g4-col g4-gap-xxs">
      <div className="g4-skeleton shimmer" />
      <div className="g4-skeleton shimmer short" />
    </div>
  ),
  pv_ui_confetti_dots2: () => (
    <div className="g4-preview g4-confetti">
      {Array.from({ length: 14 }).map((_, idx) => (
        <span key={idx} className="g4-confetti-dot" />
      ))}
    </div>
  ),
  pv_ui_hover_lift: () => (
    <div className="g4-preview g4-hover-card">
      <Bar width="70%" />
      <Bar width="50%" tone="muted" />
    </div>
  ),
  pv_ui_ping_indicator: () => (
    <div className="g4-preview g4-row g4-center g4-gap-sm">
      <div className="g4-ping">
        <span className="g4-ping-dot" />
      </div>
      <div className="g4-col g4-gap-xxs">
        <Bar width="50%" />
        <Bar width="30%" tone="muted" />
      </div>
    </div>
  ),
  pv_ui_badge_pop: () => (
    <div className="g4-preview g4-row g4-gap-sm g4-center">
      <div className="g4-pop-badge">UI</div>
      <Bar width="60%" />
    </div>
  ),
  pv_ui_toggle_flip: () => (
    <div className="g4-preview g4-row g4-gap-sm g4-center">
      <div className="g4-toggle">
        <div className="g4-toggle-thumb" />
      </div>
      <span className="g4-mini-label">Flip</span>
    </div>
  ),
  pv_ui_stripe_motion: () => (
    <div className="g4-preview g4-stripes">
      <div className="g4-stripe-fill" style={{ width: "72%" }} />
    </div>
  ),
  pv_ui_bell_pulse: () => (
    <div className="g4-preview g4-row g4-gap-sm g4-center">
      <div className="g4-bell">
        <span className="g4-bell-ping" />
      </div>
      <div className="g4-col g4-gap-xxs">
        <Bar width="55%" />
        <Bar width="35%" tone="muted" />
      </div>
    </div>
  ),
};

const renderPreview = (previewId: string) => {
  const fn = previewRenderers[previewId];
  return fn ? fn() : <div className="g4-preview g4-fallback" />;
};

export default function GamifiedTab4() {
  return (
    <div className="g4-root">
      <header className="g4-intro">
        <div>
          <h2>Gamified 4</h2>
          <p className="g4-sub">50 UI mini-previews focused on controls, overlays, meters, tables, and animated bits.</p>
        </div>
        <div className="g4-pill-row">
          <Pill label="UI" />
        </div>
      </header>

      <nav className="g4-toc">
        {categories.map((cat) => (
          <a key={cat.id} href={`#${cat.id}`} className="g4-toc-link">
            {cat.title}
          </a>
        ))}
      </nav>

      <div className="g4-sections">
        {categories.map((cat) => (
          <details key={cat.id} className="g4-section" open id={cat.id}>
            <summary className="g4-section-header">
              <div>
                <div className="g4-section-title">{cat.title}</div>
                <div className="g4-section-sub">{cat.description}</div>
              </div>
              <span className="g4-summary-line">{cat.items.length} items</span>
            </summary>

            <div className="g4-grid">
              {cat.items.map((item) => (
                <div key={item.id} className="g4-card">
                  <div className="g4-card-head">
                    <div>
                      <div className="g4-card-title">{item.title}</div>
                      <div className="g4-card-sub">{item.subtitle}</div>
                    </div>
                    <div className="g4-pill-row">
                      {(item.tags || ["UI"]).map((tag) => (
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
