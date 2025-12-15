import React from "react";
import "./GamifiedTab7.css";

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
    id: "progress",
    title: "Animated Progress",
    description: "Animated stripes, sweeps, counters, and wave fills.",
    items: [
      { id: "1", categoryId: "progress", title: "Stripe Motion Bar", subtitle: "moving stripes", tags: ["UI"], previewId: "pv_ui7_stripe_motion2" },
      { id: "2", categoryId: "progress", title: "Gradient Sweep Fill", subtitle: "slow sweep", tags: ["UI"], previewId: "pv_ui7_gradient_sweep" },
      { id: "3", categoryId: "progress", title: "Tick-Up Counter", subtitle: "odometer style", tags: ["UI"], previewId: "pv_ui7_tickup_counter" },
      { id: "4", categoryId: "progress", title: "Milestone Pop", subtitle: "pop at thresholds", tags: ["UI"], previewId: "pv_ui7_milestone_pop" },
      { id: "5", categoryId: "progress", title: "Ring Spinner Progress", subtitle: "rotating arc", tags: ["UI"], previewId: "pv_ui7_ring_spinner" },
      { id: "6", categoryId: "progress", title: "Pulse Marker Line", subtitle: "avg marker pulse", tags: ["UI"], previewId: "pv_ui7_marker_pulse" },
      { id: "7", categoryId: "progress", title: "Step Fill Animation", subtitle: "segment fill", tags: ["UI"], previewId: "pv_ui7_step_fill" },
      { id: "8", categoryId: "progress", title: "Wave Fill Gauge", subtitle: "wave in bar", tags: ["UI"], previewId: "pv_ui7_wave_fill" },
      { id: "9", categoryId: "progress", title: "Micro Spark Animate", subtitle: "spark drawing", tags: ["UI"], previewId: "pv_ui7_spark_draw" },
      { id: "10", categoryId: "progress", title: "Heat Glow Cells", subtitle: "glow on cells", tags: ["UI"], previewId: "pv_ui7_heat_glow_cells" },
    ],
  },
  {
    id: "hover",
    title: "Hover/Focus States",
    description: "Focus rings, tilts, bounces, outlines, and menus.",
    items: [
      { id: "11", categoryId: "hover", title: "Focus Ring Showcase", subtitle: "focus styles", tags: ["UI"], previewId: "pv_ui7_focus_rings" },
      { id: "12", categoryId: "hover", title: "Hover Tilt Card", subtitle: "subtle tilt", tags: ["UI"], previewId: "pv_ui7_hover_tilt" },
      { id: "13", categoryId: "hover", title: "Glow Border on Hover", subtitle: "outer glow", tags: ["UI"], previewId: "pv_ui7_hover_glow_border" },
      { id: "14", categoryId: "hover", title: "Icon Bounce Hover", subtitle: "bounce icon", tags: ["UI"], previewId: "pv_ui7_icon_bounce" },
      { id: "15", categoryId: "hover", title: "Tooltip Follow Mock", subtitle: "offset tooltip", tags: ["UI"], previewId: "pv_ui7_tooltip_follow" },
      { id: "16", categoryId: "hover", title: "Pressed Button Depth", subtitle: "down state", tags: ["UI"], previewId: "pv_ui7_button_depth" },
      { id: "17", categoryId: "hover", title: "Selection Outline", subtitle: "selected frame", tags: ["UI"], previewId: "pv_ui7_select_outline" },
      { id: "18", categoryId: "hover", title: "Drag Handle Mock", subtitle: "grab dots", tags: ["UI"], previewId: "pv_ui7_drag_handle" },
      { id: "19", categoryId: "hover", title: "Context Menu Hover", subtitle: "menu highlight", tags: ["UI"], previewId: "pv_ui7_context_hover" },
      { id: "20", categoryId: "hover", title: "Keyboard Nav Dots", subtitle: "tab order hint", tags: ["UI"], previewId: "pv_ui7_keynav_dots" },
    ],
  },
  {
    id: "decor",
    title: "Decorative UI",
    description: "Glass headers, neon lines, patterns, and status clusters.",
    items: [
      { id: "21", categoryId: "decor", title: "Glass Panel Header", subtitle: "frosted header", tags: ["UI"], previewId: "pv_ui7_glass_header" },
      { id: "22", categoryId: "decor", title: "Neon Accent Line", subtitle: "accent stroke", tags: ["UI"], previewId: "pv_ui7_neon_accent" },
      { id: "23", categoryId: "decor", title: "Pattern Background Card", subtitle: "subtle pattern", tags: ["UI"], previewId: "pv_ui7_pattern_bg" },
      { id: "24", categoryId: "decor", title: "Corner Cut Card", subtitle: "cut corners", tags: ["UI"], previewId: "pv_ui7_corner_cut" },
      { id: "25", categoryId: "decor", title: "Divider Variants", subtitle: "3 divider styles", tags: ["UI"], previewId: "pv_ui7_dividers" },
      { id: "26", categoryId: "decor", title: "Tag Pill Variants", subtitle: "solid/outline", tags: ["UI"], previewId: "pv_ui7_tag_variants" },
      { id: "27", categoryId: "decor", title: "Icon Badge Stack", subtitle: "icon + badge", tags: ["UI"], previewId: "pv_ui7_icon_badges" },
      { id: "28", categoryId: "decor", title: "Mini Banner Strip", subtitle: "announcement strip", tags: ["UI"], previewId: "pv_ui7_banner_strip" },
      { id: "29", categoryId: "decor", title: "Progress Notches", subtitle: "notched bar", tags: ["UI"], previewId: "pv_ui7_notches_bar" },
      { id: "30", categoryId: "decor", title: "Status Dot Cluster", subtitle: "3 statuses", tags: ["UI"], previewId: "pv_ui7_status_cluster" },
    ],
  },
  {
    id: "micro",
    title: "Micro-layouts",
    description: "Mini cards, headers, grids, and stacked chips.",
    items: [
      { id: "31", categoryId: "micro", title: "KPI + Mini Chart", subtitle: "two-column", tags: ["UI"], previewId: "pv_ui7_kpi_minichart" },
      { id: "32", categoryId: "micro", title: "Split Header Actions", subtitle: "actions right", tags: ["UI"], previewId: "pv_ui7_header_actions" },
      { id: "33", categoryId: "micro", title: "Compact Card Grid", subtitle: "2×2 grid", tags: ["UI"], previewId: "pv_ui7_compact_grid" },
      { id: "34", categoryId: "micro", title: "Sticky Mini Footer", subtitle: "footer tools", tags: ["UI"], previewId: "pv_ui7_sticky_footer" },
      { id: "35", categoryId: "micro", title: "Inline Editable Field", subtitle: "edit pencil", tags: ["UI"], previewId: "pv_ui7_inline_edit" },
      { id: "36", categoryId: "micro", title: "Multi-line Subtitle Clamp", subtitle: "clamp demo", tags: ["UI"], previewId: "pv_ui7_clamp_demo" },
      { id: "37", categoryId: "micro", title: "Icon List with Counts", subtitle: "icon + num", tags: ["UI"], previewId: "pv_ui7_icon_counts" },
      { id: "38", categoryId: "micro", title: "Dual Badge Header", subtitle: "two tags", tags: ["UI"], previewId: "pv_ui7_dual_badge" },
      { id: "39", categoryId: "micro", title: "Avatar Stack", subtitle: "overlapping", tags: ["UI"], previewId: "pv_ui7_avatar_stack" },
      { id: "40", categoryId: "micro", title: "Chips + Progress Row", subtitle: "mixed row", tags: ["UI"], previewId: "pv_ui7_chips_progress_row" },
    ],
  },
  {
    id: "states",
    title: "Feedback & States",
    description: "Success, warning, error, empty, loading, sync, offline, locked.",
    items: [
      { id: "41", categoryId: "states", title: "Success Glow Toast", subtitle: "success state", tags: ["UI"], previewId: "pv_ui7_success_toast" },
      { id: "42", categoryId: "states", title: "Warning Banner", subtitle: "attention state", tags: ["UI"], previewId: "pv_ui7_warning_banner" },
      { id: "43", categoryId: "states", title: "Error Inline Panel", subtitle: "error state", tags: ["UI"], previewId: "pv_ui7_error_panel" },
      { id: "44", categoryId: "states", title: "Empty State Illustration", subtitle: "empty", tags: ["UI"], previewId: "pv_ui7_empty_state" },
      { id: "45", categoryId: "states", title: "Loading Dots", subtitle: "3 dots", tags: ["UI"], previewId: "pv_ui7_loading_dots" },
      { id: "46", categoryId: "states", title: "Sync Indicator", subtitle: "sync badge", tags: ["UI"], previewId: "pv_ui7_sync_indicator" },
      { id: "47", categoryId: "states", title: "Offline Mode Chip", subtitle: "offline badge", tags: ["UI"], previewId: "pv_ui7_offline_chip" },
      { id: "48", categoryId: "states", title: "Disabled Overlay", subtitle: "disabled state", tags: ["UI"], previewId: "pv_ui7_disabled_overlay" },
      { id: "49", categoryId: "states", title: "“New” Ribbon + Glow", subtitle: "new state", tags: ["UI"], previewId: "pv_ui7_new_ribbon_glow" },
      { id: "50", categoryId: "states", title: "Locked State Stamp", subtitle: "locked stamp", tags: ["UI"], previewId: "pv_ui7_locked_stamp" },
    ],
  },
];

const Pill = ({ label }: { label: string }) => <span className="g7-pill">{label}</span>;

const Bar = ({ width, tone = "accent", height = 8 }: { width: string; tone?: string; height?: number }) => (
  <div className={`g7-bar tone-${tone}`} style={{ width, height }} />
);

const Dot = ({ tone = "accent", size = 8 }: { tone?: string; size?: number }) => (
  <span className={`g7-dot tone-${tone}`} style={{ width: size, height: size }} />
);

const previewRenderers: Record<string, () => JSX.Element> = {
  pv_ui7_stripe_motion2: () => (
    <div className="g7-preview g7-stripes">
      <div className="g7-stripe-fill" style={{ width: "78%" }} />
    </div>
  ),
  pv_ui7_gradient_sweep: () => (
    <div className="g7-preview g7-gradient">
      <div className="g7-gradient-fill" />
    </div>
  ),
  pv_ui7_tickup_counter: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <div className="g7-odometer">
        {["0", "1", "2"].map((n, idx) => (
          <span key={idx} className={`g7-odo-digit ${idx === 2 ? "active" : ""}`}>
            {n}
          </span>
        ))}
      </div>
      <Pill label="Counter" />
    </div>
  ),
  pv_ui7_milestone_pop: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      {[20, 50, 80].map((milestone, idx) => (
        <div key={milestone} className="g7-milestone">
          <div className={`g7-milestone-dot ${idx === 1 ? "pop" : ""}`} />
          <span className="g7-mini">{milestone}</span>
        </div>
      ))}
    </div>
  ),
  pv_ui7_ring_spinner: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <div className="g7-spinner">
        <div className="g7-spinner-arc" />
      </div>
      <Bar width="50%" />
    </div>
  ),
  pv_ui7_marker_pulse: () => (
    <div className="g7-preview g7-col g7-gap-xxs">
      <div className="g7-marker-line">
        <div className="g7-marker" style={{ left: "62%" }} />
      </div>
      <span className="g7-mini">Average</span>
    </div>
  ),
  pv_ui7_step_fill: () => (
    <div className="g7-preview g7-row g7-gap-xxs g7-stepper">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className={`g7-step ${idx < 3 ? "filled" : ""}`} />
      ))}
    </div>
  ),
  pv_ui7_wave_fill: () => (
    <div className="g7-preview g7-wave">
      <div className="g7-wave-fill" />
    </div>
  ),
  pv_ui7_spark_draw: () => (
    <div className="g7-preview g7-spark">
      {Array.from({ length: 10 }).map((_, idx) => (
        <span key={idx} className="g7-spark-bar" style={{ height: `${8 + (idx % 4) * 6}px` }} />
      ))}
    </div>
  ),
  pv_ui7_heat_glow_cells: () => (
    <div className="g7-preview g7-row g7-gap-xxs">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className={`g7-heat-cell ${idx >= 3 ? "glow" : ""}`} />
      ))}
    </div>
  ),
  pv_ui7_focus_rings: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <div className="g7-focus" />
      <div className="g7-focus strong" />
      <div className="g7-focus dashed" />
    </div>
  ),
  pv_ui7_hover_tilt: () => (
    <div className="g7-preview g7-tilt-card">
      <Bar width="70%" />
      <Bar width="40%" tone="muted" />
    </div>
  ),
  pv_ui7_hover_glow_border: () => (
    <div className="g7-preview g7-glow-border">
      <Bar width="60%" />
    </div>
  ),
  pv_ui7_icon_bounce: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <div className="g7-bounce">↑</div>
      <Bar width="40%" />
    </div>
  ),
  pv_ui7_tooltip_follow: () => (
    <div className="g7-preview g7-tooltip-follow">
      <div className="g7-target" />
      <div className="g7-follow-tip">
        <Bar width="50%" />
      </div>
    </div>
  ),
  pv_ui7_button_depth: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <button className="g7-press-btn">Press</button>
      <button className="g7-press-btn pressed">Pressed</button>
    </div>
  ),
  pv_ui7_select_outline: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <div className="g7-outline-card active">
        <Bar width="60%" />
      </div>
      <div className="g7-outline-card">
        <Bar width="40%" />
      </div>
    </div>
  ),
  pv_ui7_drag_handle: () => (
    <div className="g7-preview g7-row g7-center g7-gap-sm">
      <div className="g7-drag-handle">
        {Array.from({ length: 6 }).map((_, idx) => (
          <span key={idx} />
        ))}
      </div>
      <Bar width="50%" />
    </div>
  ),
  pv_ui7_context_hover: () => (
    <div className="g7-preview g7-col g7-gap-xxs">
      {["Edit", "Duplicate", "Archive"].map((item, idx) => (
        <div key={item} className={`g7-menu-row ${idx === 1 ? "hover" : ""}`}>
          {item}
        </div>
      ))}
    </div>
  ),
  pv_ui7_keynav_dots: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      {Array.from({ length: 4 }).map((_, idx) => (
        <span key={idx} className={`g7-keydot ${idx === 0 ? "active" : ""}`} />
      ))}
      <span className="g7-mini">Tab order</span>
    </div>
  ),
  pv_ui7_glass_header: () => (
    <div className="g7-preview g7-glass">
      <div className="g7-glass-bar" />
      <Bar width="50%" />
    </div>
  ),
  pv_ui7_neon_accent: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <div className="g7-neon-line" />
      <Bar width="40%" />
    </div>
  ),
  pv_ui7_pattern_bg: () => (
    <div className="g7-preview g7-pattern">
      <Bar width="60%" />
      <Bar width="30%" tone="muted" />
    </div>
  ),
  pv_ui7_corner_cut: () => (
    <div className="g7-preview g7-corner-card">
      <Bar width="70%" />
      <Bar width="40%" tone="muted" />
    </div>
  ),
  pv_ui7_dividers: () => (
    <div className="g7-preview g7-col g7-gap-xs">
      <div className="g7-divider solid" />
      <div className="g7-divider dashed" />
      <div className="g7-divider dotted" />
    </div>
  ),
  pv_ui7_tag_variants: () => (
    <div className="g7-preview g7-row g7-gap-xs">
      <Pill label="Solid" />
      <span className="g7-pill ghost">Outline</span>
      <span className="g7-pill muted">Muted</span>
    </div>
  ),
  pv_ui7_icon_badges: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <div className="g7-icon-badge">
        <span>★</span>
        <span className="g7-badge-num">3</span>
      </div>
      <Bar width="50%" />
    </div>
  ),
  pv_ui7_banner_strip: () => (
    <div className="g7-preview g7-banner">
      <span>Announcement</span>
      <Pill label="Live" />
    </div>
  ),
  pv_ui7_notches_bar: () => (
    <div className="g7-preview g7-row g7-gap-xxs g7-notches">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div key={idx} className={`g7-notch ${idx < 5 ? "active" : ""}`} />
      ))}
    </div>
  ),
  pv_ui7_status_cluster: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <Dot tone="success" />
      <Dot tone="warning" />
      <Dot tone="danger" />
      <span className="g7-mini">Status</span>
    </div>
  ),
  pv_ui7_kpi_minichart: () => (
    <div className="g7-preview g7-row g7-gap-sm">
      <div className="g7-col g7-gap-xxs">
        <span className="g7-mini">KPI</span>
        <Bar width="60%" />
      </div>
      <div className="g7-mini-chart">
        {Array.from({ length: 6 }).map((_, idx) => (
          <span key={idx} style={{ height: `${10 + idx * 4}px` }} />
        ))}
      </div>
    </div>
  ),
  pv_ui7_header_actions: () => (
    <div className="g7-preview g7-row g7-space-between g7-center">
      <Bar width="40%" />
      <div className="g7-row g7-gap-xs">
        <button className="g7-btn ghost">Action</button>
        <button className="g7-btn solid">Primary</button>
      </div>
    </div>
  ),
  pv_ui7_compact_grid: () => (
    <div className="g7-preview g7-grid g7-grid-2">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="g7-mini-card">
          <Bar width="50%" />
          <Bar width="30%" tone="muted" />
        </div>
      ))}
    </div>
  ),
  pv_ui7_sticky_footer: () => (
    <div className="g7-preview g7-col g7-gap-xxs">
      <Bar width="70%" />
      <div className="g7-sticky-footer">
        <button className="g7-btn ghost">Cancel</button>
        <button className="g7-btn solid">Save</button>
      </div>
    </div>
  ),
  pv_ui7_inline_edit: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <input className="g7-inline" value="Editable text" readOnly />
      <span className="g7-pencil" />
    </div>
  ),
  pv_ui7_clamp_demo: () => (
    <div className="g7-preview g7-col g7-gap-xxs">
      <div className="g7-clamp">Very long subtitle that is clamped after two lines for readability.</div>
      <Bar width="40%" />
    </div>
  ),
  pv_ui7_icon_counts: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      {["🛡", "🗡", "💊"].map((icon, idx) => (
        <div key={icon} className="g7-icon-count">
          <span>{icon}</span>
          <span className="g7-badge-num">{idx + 2}</span>
        </div>
      ))}
    </div>
  ),
  pv_ui7_dual_badge: () => (
    <div className="g7-preview g7-row g7-gap-xs g7-center">
      <Pill label="Pro" />
      <Pill label="UI" />
      <Bar width="40%" />
    </div>
  ),
  pv_ui7_avatar_stack: () => (
    <div className="g7-preview g7-row g7-gap-xs g7-center">
      <div className="g7-stack">
        {["A", "B", "C"].map((c, idx) => (
          <span key={c} className="g7-stack-avatar" style={{ left: `${idx * 12}px` }}>
            {c}
          </span>
        ))}
      </div>
      <span className="g7-mini">+5</span>
    </div>
  ),
  pv_ui7_chips_progress_row: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <Pill label="UI" />
      <Pill label="Motion" />
      <div className="g7-pulse-bar">
        <div className="g7-pulse-fill" style={{ width: "64%" }} />
      </div>
    </div>
  ),
  pv_ui7_success_toast: () => (
    <div className="g7-preview g7-toast success">
      <span className="g7-dot tone-success" />
      <span>Saved successfully</span>
    </div>
  ),
  pv_ui7_warning_banner: () => (
    <div className="g7-preview g7-banner warn">
      <span>Warning: changes pending</span>
    </div>
  ),
  pv_ui7_error_panel: () => (
    <div className="g7-preview g7-error">
      <div className="g7-error-icon">!</div>
      <div className="g7-col g7-gap-xxs">
        <Bar width="60%" tone="danger" />
        <Bar width="40%" tone="muted" />
      </div>
    </div>
  ),
  pv_ui7_empty_state: () => (
    <div className="g7-preview g7-empty">
      <div className="g7-ghost" />
      <Bar width="50%" tone="muted" />
    </div>
  ),
  pv_ui7_loading_dots: () => (
    <div className="g7-preview g7-row g7-gap-xxs g7-center">
      {Array.from({ length: 3 }).map((_, idx) => (
        <span key={idx} className="g7-loading-dot" />
      ))}
    </div>
  ),
  pv_ui7_sync_indicator: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <div className="g7-sync">
        <div className="g7-sync-arc" />
      </div>
      <Pill label="Syncing" />
    </div>
  ),
  pv_ui7_offline_chip: () => (
    <div className="g7-preview g7-row g7-gap-sm g7-center">
      <div className="g7-chip offline">Offline</div>
      <Bar width="40%" tone="muted" />
    </div>
  ),
  pv_ui7_disabled_overlay: () => (
    <div className="g7-preview g7-disabled">
      <Bar width="60%" />
      <div className="g7-disabled-mask" />
    </div>
  ),
  pv_ui7_new_ribbon_glow: () => (
    <div className="g7-preview g7-ribbon-card">
      <div className="g7-ribbon">New</div>
      <div className="g7-ribbon-glow" />
      <Bar width="60%" />
    </div>
  ),
  pv_ui7_locked_stamp: () => (
    <div className="g7-preview g7-stamp">
      <div className="g7-stamp-ring">LOCKED</div>
      <Bar width="40%" />
    </div>
  ),
};

const renderPreview = (previewId: string) => {
  const fn = previewRenderers[previewId];
  return fn ? fn() : <div className="g7-preview g7-fallback" />;
};

export default function GamifiedTab7() {
  return (
    <div className="g7-root">
      <header className="g7-intro">
        <div>
          <h2>Gamified 7</h2>
          <p className="g7-sub">50 animated UI micro-previews covering motion, hover states, decorative bits, and feedback.</p>
        </div>
        <div className="g7-pill-row">
          <Pill label="UI" />
        </div>
      </header>

      <nav className="g7-toc">
        {categories.map((cat) => (
          <a key={cat.id} href={`#${cat.id}`} className="g7-toc-link">
            {cat.title}
          </a>
        ))}
      </nav>

      <div className="g7-sections">
        {categories.map((cat) => (
          <details key={cat.id} className="g7-section" open id={cat.id}>
            <summary className="g7-section-header">
              <div>
                <div className="g7-section-title">{cat.title}</div>
                <div className="g7-section-sub">{cat.description}</div>
              </div>
              <span className="g7-summary-line">{cat.items.length} items</span>
            </summary>

            <div className="g7-grid">
              {cat.items.map((item) => (
                <div key={item.id} className="g7-card">
                  <div className="g7-card-head">
                    <div>
                      <div className="g7-card-title">{item.title}</div>
                      <div className="g7-card-sub">{item.subtitle}</div>
                    </div>
                    <div className="g7-pill-row">
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
