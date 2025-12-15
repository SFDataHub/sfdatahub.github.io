import React from "react";
import "./GamifiedTab8.css";

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
    description: "Pulses, stripes, sweeps, and counters that move on their own.",
    items: [
      { id: "1", categoryId: "progress", title: "Pulse Progress Bar", subtitle: "soft pulse fill", tags: ["UI"], previewId: "pv_anim_pulse_bar" },
      { id: "2", categoryId: "progress", title: "Stripe Motion Fill", subtitle: "striped motion", tags: ["UI"], previewId: "pv_anim_stripes_fill" },
      { id: "3", categoryId: "progress", title: "Gradient Sweep Meter", subtitle: "sweeping sheen", tags: ["UI"], previewId: "pv_anim_gradient_sweep" },
      { id: "4", categoryId: "progress", title: "Segments Filling Track", subtitle: "sequential fill", tags: ["UI"], previewId: "pv_anim_segments_fill" },
      { id: "5", categoryId: "progress", title: "Ring Spinner Progress", subtitle: "rotating arc", tags: ["UI"], previewId: "pv_anim_ring_spinner" },
      { id: "6", categoryId: "progress", title: "Wave Fill Gauge", subtitle: "wave motion", tags: ["UI"], previewId: "pv_anim_wave_fill" },
      { id: "7", categoryId: "progress", title: "Tick-Up Counter", subtitle: "rolling digits", tags: ["UI"], previewId: "pv_anim_tickup_counter" },
      { id: "8", categoryId: "progress", title: "Marker Line Pulse", subtitle: "pulsing marker", tags: ["UI"], previewId: "pv_anim_marker_pulse" },
      { id: "9", categoryId: "progress", title: "Notched Bar Scroll", subtitle: "notches glide", tags: ["UI"], previewId: "pv_anim_notches_scroll" },
      { id: "10", categoryId: "progress", title: "Microbars Breathing", subtitle: "bars breathe", tags: ["UI"], previewId: "pv_anim_microbars_breathe" },
    ],
  },
  {
    id: "glow",
    title: "Glows, Unlocks, Highlights",
    description: "Shimmers, spotlights, confetti, and soft neon pulses.",
    items: [
      { id: "11", categoryId: "glow", title: "Unlock Glow Border", subtitle: "glowing frame", tags: ["UI"], previewId: "pv_anim_unlock_glow_border" },
      { id: "12", categoryId: "glow", title: "Shimmer Skeleton", subtitle: "loading shimmer", tags: ["UI"], previewId: "pv_anim_skeleton_shimmer" },
      { id: "13", categoryId: "glow", title: "New Ribbon Shine", subtitle: "ribbon sweep", tags: ["UI"], previewId: "pv_anim_ribbon_shine" },
      { id: "14", categoryId: "glow", title: "Badge Pop Loop", subtitle: "pop animation", tags: ["UI"], previewId: "pv_anim_badge_pop" },
      { id: "15", categoryId: "glow", title: "Spotlight Sweep", subtitle: "light sweep", tags: ["UI"], previewId: "pv_anim_spotlight_sweep" },
      { id: "16", categoryId: "glow", title: "Confetti Drift", subtitle: "floating dots", tags: ["UI"], previewId: "pv_anim_confetti_drift" },
      { id: "17", categoryId: "glow", title: "Spark Particles", subtitle: "spark drizzle", tags: ["UI"], previewId: "pv_anim_spark_particles" },
      { id: "18", categoryId: "glow", title: "Aura Halo Ring", subtitle: "halo pulse", tags: ["UI"], previewId: "pv_anim_halo_ring" },
      { id: "19", categoryId: "glow", title: "Hover Lift (auto demo)", subtitle: "auto float", tags: ["UI"], previewId: "pv_anim_hover_lift_demo" },
      { id: "20", categoryId: "glow", title: "Soft Neon Pulse Line", subtitle: "neon flicker", tags: ["UI"], previewId: "pv_anim_neon_line_pulse" },
    ],
  },
  {
    id: "controls",
    title: "Animated Controls & Navigation",
    description: "Auto-animating toggles, tabs, tooltips, and badges.",
    items: [
      { id: "21", categoryId: "controls", title: "Toggle Flip Motion", subtitle: "thumb flip", tags: ["UI"], previewId: "pv_anim_toggle_flip" },
      { id: "22", categoryId: "controls", title: "Segmented Toggle Slide", subtitle: "sliding highlight", tags: ["UI"], previewId: "pv_anim_seg_toggle_slide" },
      { id: "23", categoryId: "controls", title: "Tabs Underline Slide", subtitle: "underline glide", tags: ["UI"], previewId: "pv_anim_tabs_underline" },
      { id: "24", categoryId: "controls", title: "Dropdown Open Bounce", subtitle: "bouncy menu", tags: ["UI"], previewId: "pv_anim_dropdown_bounce" },
      { id: "25", categoryId: "controls", title: "Tooltip Appear/Float", subtitle: "float reveal", tags: ["UI"], previewId: "pv_anim_tooltip_float" },
      { id: "26", categoryId: "controls", title: "Button Press Depth Loop", subtitle: "press cycle", tags: ["UI"], previewId: "pv_anim_button_depth" },
      { id: "27", categoryId: "controls", title: "Loading Dots", subtitle: "dot bounce", tags: ["UI"], previewId: "pv_anim_loading_dots" },
      { id: "28", categoryId: "controls", title: "Sync Spinner Badge", subtitle: "badge spinner", tags: ["UI"], previewId: "pv_anim_sync_spinner" },
      { id: "29", categoryId: "controls", title: "Notification Bell Pulse", subtitle: "bell ring", tags: ["UI"], previewId: "pv_anim_bell_pulse" },
      { id: "30", categoryId: "controls", title: "Chip Select Ripple", subtitle: "ripple effect", tags: ["UI"], previewId: "pv_anim_chip_ripple" },
    ],
  },
  {
    id: "charts",
    title: "Animated Micro-Charts",
    description: "Drawing sparks, morphing radar, wobbling histograms, glowing grids.",
    items: [
      { id: "31", categoryId: "charts", title: "Sparkline Draw", subtitle: "line drawing", tags: ["UI"], previewId: "pv_anim_spark_draw" },
      { id: "32", categoryId: "charts", title: "Step Line March", subtitle: "step march", tags: ["UI"], previewId: "pv_anim_step_march" },
      { id: "33", categoryId: "charts", title: "Bar Grow Cycle", subtitle: "bars grow", tags: ["UI"], previewId: "pv_anim_bar_grow_cycle" },
      { id: "34", categoryId: "charts", title: "Radar Polygon Morph", subtitle: "morphing radar", tags: ["UI"], previewId: "pv_anim_radar_morph" },
      { id: "35", categoryId: "charts", title: "Donut Arc Sweep", subtitle: "arc sweep", tags: ["UI"], previewId: "pv_anim_donut_sweep" },
      { id: "36", categoryId: "charts", title: "Histogram Wobble", subtitle: "wobble bars", tags: ["UI"], previewId: "pv_anim_hist_wobble" },
      { id: "37", categoryId: "charts", title: "Delta Arrow Float", subtitle: "floating delta", tags: ["UI"], previewId: "pv_anim_delta_arrow_float" },
      { id: "38", categoryId: "charts", title: "Timeline Dot Travel", subtitle: "dot travels", tags: ["UI"], previewId: "pv_anim_timeline_dot" },
      { id: "39", categoryId: "charts", title: "Heat Cells Glow Cycle", subtitle: "cells glow", tags: ["UI"], previewId: "pv_anim_heat_glow_cycle" },
      { id: "40", categoryId: "charts", title: "Grid Scanline", subtitle: "scanline sweep", tags: ["UI"], previewId: "pv_anim_grid_scanline" },
    ],
  },
  {
    id: "states",
    title: "Feedback & States",
    description: "Toasts, banners, pings, overlays, and queue motion.",
    items: [
      { id: "41", categoryId: "states", title: "Success Toast Slide-In", subtitle: "toast slides", tags: ["UI"], previewId: "pv_anim_toast_slidein" },
      { id: "42", categoryId: "states", title: "Warning Banner Shake", subtitle: "gentle shake", tags: ["UI"], previewId: "pv_anim_banner_shake" },
      { id: "43", categoryId: "states", title: "Error Pulse Border", subtitle: "border pulse", tags: ["UI"], previewId: "pv_anim_error_pulse" },
      { id: "44", categoryId: "states", title: "Offline Chip Blink", subtitle: "chip blink", tags: ["UI"], previewId: "pv_anim_offline_blink" },
      { id: "45", categoryId: "states", title: "Locked Overlay Fade", subtitle: "overlay fade", tags: ["UI"], previewId: "pv_anim_locked_fade" },
      { id: "46", categoryId: "states", title: "Progress “Complete” Burst", subtitle: "burst ring", tags: ["UI"], previewId: "pv_anim_complete_burst" },
      { id: "47", categoryId: "states", title: "Attention Ping Indicator", subtitle: "ping pulses", tags: ["UI"], previewId: "pv_anim_ping_indicator" },
      { id: "48", categoryId: "states", title: "Tooltip Hint Nudge", subtitle: "hint nudge", tags: ["UI"], previewId: "pv_anim_hint_nudge" },
      { id: "49", categoryId: "states", title: "Queue Item Slide", subtitle: "slide loop", tags: ["UI"], previewId: "pv_anim_queue_slide" },
      { id: "50", categoryId: "states", title: "\"New Data\" Glow Dot", subtitle: "dot glow", tags: ["UI"], previewId: "pv_anim_newdata_dot" },
    ],
  },
];

const Pill = ({ label }: { label: string }) => <span className="g8-pill">{label}</span>;

const Bar = ({ width, tone = "accent", height = 8 }: { width: string; tone?: string; height?: number }) => (
  <div className={`g8-bar tone-${tone}`} style={{ width, height }} />
);

const Dot = ({ tone = "accent", size = 8 }: { tone?: string; size?: number }) => (
  <span className={`g8-dot tone-${tone}`} style={{ width: size, height: size }} />
);

const previewRenderers: Record<string, () => JSX.Element> = {
  pv_anim_pulse_bar: () => (
    <div className="g8-preview g8-col g8-gap-xxs">
      <div className="g8-track g8-animated">
        <div className="g8-track-fill pulse" style={{ width: "76%" }} />
      </div>
      <div className="g8-mini-row">
        <Pill label="UI" />
        <span className="g8-mini">Live</span>
      </div>
    </div>
  ),
  pv_anim_stripes_fill: () => (
    <div className="g8-preview g8-col g8-gap-xxs">
      <div className="g8-track g8-stripes g8-animated" />
      <Bar width="60%" tone="muted" height={6} />
    </div>
  ),
  pv_anim_gradient_sweep: () => (
    <div className="g8-preview g8-col g8-gap-xxs">
      <div className="g8-track g8-sweep g8-animated" />
      <span className="g8-mini">Gradient sweep</span>
    </div>
  ),
  pv_anim_segments_fill: () => (
    <div className="g8-preview g8-row g8-gap-xxs g8-seg-track">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div key={idx} className={`g8-seg ${idx < 6 ? "g8-animated fill" : ""}`} style={{ animationDelay: `${idx * 0.15}s` }} />
      ))}
    </div>
  ),
  pv_anim_ring_spinner: () => (
    <div className="g8-preview g8-row g8-center g8-gap-sm">
      <div className="g8-ring g8-animated">
        <div className="g8-ring-arc" />
      </div>
      <Bar width="50%" />
    </div>
  ),
  pv_anim_wave_fill: () => (
    <div className="g8-preview g8-col g8-gap-xxs">
      <div className="g8-wave g8-animated" />
      <span className="g8-mini">Wave fill</span>
    </div>
  ),
  pv_anim_tickup_counter: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-odometer g8-animated">
        {["0", "1", "2"].map((n, idx) => (
          <span key={idx} className={`g8-odo-digit ${idx === 2 ? "active" : ""}`}>
            {n}
          </span>
        ))}
      </div>
      <Pill label="Counter" />
    </div>
  ),
  pv_anim_marker_pulse: () => (
    <div className="g8-preview g8-col g8-gap-xxs">
      <div className="g8-marker-line">
        <div className="g8-marker g8-animated" style={{ left: "64%" }} />
      </div>
      <span className="g8-mini">Avg marker</span>
    </div>
  ),
  pv_anim_notches_scroll: () => (
    <div className="g8-preview g8-row g8-gap-xxs g8-notches g8-animated">
      {Array.from({ length: 12 }).map((_, idx) => (
        <div key={idx} className="g8-notch" />
      ))}
    </div>
  ),
  pv_anim_microbars_breathe: () => (
    <div className="g8-preview g8-row g8-gap-xs g8-center">
      {["ATK", "SPD", "HP", "LCK"].map((label, idx) => (
        <div key={label} className="g8-col g8-gap-xxs g8-center">
          <span className="g8-mini">{label}</span>
          <div className={`g8-microbar g8-animated ${idx % 2 === 0 ? "alt" : ""}`} />
        </div>
      ))}
    </div>
  ),
  pv_anim_unlock_glow_border: () => (
    <div className="g8-preview g8-col g8-gap-xxs">
      <div className="g8-glow-card g8-animated">
        <Bar width="60%" />
        <Bar width="40%" tone="muted" />
      </div>
      <Pill label="Unlocked" />
    </div>
  ),
  pv_anim_skeleton_shimmer: () => (
    <div className="g8-preview g8-col g8-gap-xxs">
      <div className="g8-skeleton g8-animated" />
      <div className="g8-skeleton short g8-animated" />
    </div>
  ),
  pv_anim_ribbon_shine: () => (
    <div className="g8-preview g8-ribbon-card">
      <div className="g8-ribbon g8-animated">NEW</div>
      <Bar width="65%" />
      <Bar width="40%" tone="muted" />
    </div>
  ),
  pv_anim_badge_pop: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-badge-pop g8-animated">UI</div>
      <Bar width="50%" />
    </div>
  ),
  pv_anim_spotlight_sweep: () => (
    <div className="g8-preview g8-spotlight g8-animated">
      <div className="g8-spot-sheen" />
      <Bar width="60%" />
    </div>
  ),
  pv_anim_confetti_drift: () => (
    <div className="g8-preview g8-confetti">
      {Array.from({ length: 14 }).map((_, idx) => (
        <span key={idx} className="g8-confetti-dot g8-animated" style={{ animationDelay: `${idx * 0.08}s` }} />
      ))}
    </div>
  ),
  pv_anim_spark_particles: () => (
    <div className="g8-preview g8-sparks">
      {Array.from({ length: 10 }).map((_, idx) => (
        <span key={idx} className="g8-spark g8-animated" style={{ animationDelay: `${idx * 0.12}s` }} />
      ))}
    </div>
  ),
  pv_anim_halo_ring: () => (
    <div className="g8-preview g8-row g8-center g8-gap-sm">
      <div className="g8-halo g8-animated">
        <div className="g8-halo-ring" />
      </div>
      <Bar width="40%" />
    </div>
  ),
  pv_anim_hover_lift_demo: () => (
    <div className="g8-preview g8-hover-card g8-animated">
      <Bar width="70%" />
      <Bar width="45%" tone="muted" />
    </div>
  ),
  pv_anim_neon_line_pulse: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-neon-line g8-animated" />
      <Bar width="40%" />
    </div>
  ),
  pv_anim_toggle_flip: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-toggle g8-animated">
        <div className="g8-toggle-thumb" />
      </div>
      <span className="g8-mini">Auto flip</span>
    </div>
  ),
  pv_anim_seg_toggle_slide: () => (
    <div className="g8-preview g8-seg-toggle">
      <div className="g8-seg-rail">
        <div className="g8-seg-slider g8-animated" />
        <div className="g8-seg-labels">
          <span>One</span>
          <span>Two</span>
          <span>Three</span>
        </div>
      </div>
    </div>
  ),
  pv_anim_tabs_underline: () => (
    <div className="g8-preview g8-tabs">
      <div className="g8-tab-row">
        {["Overview", "Stats", "Logs"].map((tab, idx) => (
          <span key={tab} className={`g8-tab ${idx === 1 ? "active" : ""}`}>
            {tab}
          </span>
        ))}
      </div>
      <div className="g8-underline g8-animated" />
    </div>
  ),
  pv_anim_dropdown_bounce: () => (
    <div className="g8-preview g8-dropdown">
      <div className="g8-drop-head">Select</div>
      <div className="g8-drop-menu g8-animated">
        <div className="g8-drop-item">Option A</div>
        <div className="g8-drop-item">Option B</div>
        <div className="g8-drop-item">Option C</div>
      </div>
    </div>
  ),
  pv_anim_tooltip_float: () => (
    <div className="g8-preview g8-tooltip">
      <div className="g8-tooltip-target" />
      <div className="g8-tooltip-box g8-animated">
        <Bar width="60%" />
      </div>
    </div>
  ),
  pv_anim_button_depth: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <button className="g8-press-btn g8-animated">Press</button>
      <button className="g8-press-btn alt g8-animated">Hold</button>
    </div>
  ),
  pv_anim_loading_dots: () => (
    <div className="g8-preview g8-row g8-gap-xxs g8-center">
      {Array.from({ length: 3 }).map((_, idx) => (
        <span key={idx} className="g8-loading-dot g8-animated" style={{ animationDelay: `${idx * 0.15}s` }} />
      ))}
    </div>
  ),
  pv_anim_sync_spinner: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-sync g8-animated">
        <div className="g8-sync-arc" />
      </div>
      <Pill label="Syncing" />
    </div>
  ),
  pv_anim_bell_pulse: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-bell g8-animated">
        <span className="g8-bell-ring" />
      </div>
      <Bar width="50%" />
    </div>
  ),
  pv_anim_chip_ripple: () => (
    <div className="g8-preview g8-row g8-gap-xs g8-center">
      <span className="g8-chip g8-animated">UI</span>
      <span className="g8-chip">Mock</span>
    </div>
  ),
  pv_anim_spark_draw: () => (
    <div className="g8-preview g8-sparkline">
      {Array.from({ length: 10 }).map((_, idx) => (
        <span key={idx} className="g8-spark-bar g8-animated" style={{ animationDelay: `${idx * 0.08}s` }} />
      ))}
    </div>
  ),
  pv_anim_step_march: () => (
    <div className="g8-preview g8-row g8-gap-xxs g8-stepper">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="g8-step g8-animated" style={{ animationDelay: `${idx * 0.1}s` }} />
      ))}
    </div>
  ),
  pv_anim_bar_grow_cycle: () => (
    <div className="g8-preview g8-col g8-gap-xxs">
      {["A", "B", "C"].map((label, idx) => (
        <div key={label} className="g8-grow-row">
          <span className="g8-mini">{label}</span>
          <div className="g8-grow-bar g8-animated" style={{ animationDelay: `${idx * 0.15}s` }} />
        </div>
      ))}
    </div>
  ),
  pv_anim_radar_morph: () => (
    <div className="g8-preview g8-radar">
      <div className="g8-radar-shape g8-animated" />
      <div className="g8-radar-ring outer" />
      <div className="g8-radar-ring inner" />
    </div>
  ),
  pv_anim_donut_sweep: () => (
    <div className="g8-preview g8-row g8-center g8-gap-sm">
      <div className="g8-donut g8-animated">
        <div className="g8-donut-hole">68%</div>
      </div>
      <Bar width="40%" />
    </div>
  ),
  pv_anim_hist_wobble: () => (
    <div className="g8-preview g8-row g8-gap-xxs g8-center g8-hist">
      {Array.from({ length: 6 }).map((_, idx) => (
        <span key={idx} className="g8-hist-bar g8-animated" style={{ animationDelay: `${idx * 0.1}s` }} />
      ))}
    </div>
  ),
  pv_anim_delta_arrow_float: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-delta g8-animated">▲</div>
      <Bar width="50%" />
    </div>
  ),
  pv_anim_timeline_dot: () => (
    <div className="g8-preview g8-timeline">
      <div className="g8-timeline-line" />
      <div className="g8-timeline-dot g8-animated" />
    </div>
  ),
  pv_anim_heat_glow_cycle: () => (
    <div className="g8-preview g8-row g8-gap-xxs g8-heatline">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div key={idx} className="g8-heat-cell g8-animated" style={{ animationDelay: `${idx * 0.1}s` }} />
      ))}
    </div>
  ),
  pv_anim_grid_scanline: () => (
    <div className="g8-preview g8-grid-scan">
      <div className="g8-scanline g8-animated" />
      <div className="g8-grid-bg" />
    </div>
  ),
  pv_anim_toast_slidein: () => (
    <div className="g8-preview g8-toast g8-animated">
      <span className="g8-dot tone-success" />
      <span>Saved</span>
    </div>
  ),
  pv_anim_banner_shake: () => (
    <div className="g8-preview g8-banner g8-animated">
      <span>Warning: check inputs</span>
    </div>
  ),
  pv_anim_error_pulse: () => (
    <div className="g8-preview g8-error g8-animated">
      <div className="g8-error-icon">!</div>
      <div className="g8-col g8-gap-xxs">
        <Bar width="60%" tone="danger" />
        <Bar width="40%" tone="muted" />
      </div>
    </div>
  ),
  pv_anim_offline_blink: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-chip offline g8-animated">Offline</div>
      <Bar width="40%" tone="muted" />
    </div>
  ),
  pv_anim_locked_fade: () => (
    <div className="g8-preview g8-locked">
      <Bar width="60%" />
      <div className="g8-locked-mask g8-animated" />
    </div>
  ),
  pv_anim_complete_burst: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-burst g8-animated" />
      <Bar width="40%" />
    </div>
  ),
  pv_anim_ping_indicator: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-ping g8-animated">
        <span className="g8-ping-dot" />
      </div>
      <Bar width="50%" />
    </div>
  ),
  pv_anim_hint_nudge: () => (
    <div className="g8-preview g8-tooltip-hint">
      <div className="g8-hint-box g8-animated">
        <Bar width="50%" />
      </div>
      <div className="g8-hint-arrow" />
    </div>
  ),
  pv_anim_queue_slide: () => (
    <div className="g8-preview g8-queue">
      {["Item 1", "Item 2", "Item 3"].map((item, idx) => (
        <div key={item} className={`g8-queue-row g8-animated ${idx === 1 ? "active" : ""}`} style={{ animationDelay: `${idx * 0.18}s` }}>
          <Bar width={`${50 + idx * 10}%`} />
        </div>
      ))}
    </div>
  ),
  pv_anim_newdata_dot: () => (
    <div className="g8-preview g8-row g8-gap-sm g8-center">
      <div className="g8-newdot g8-animated" />
      <Bar width="50%" />
    </div>
  ),
};

const renderPreview = (previewId: string) => {
  const fn = previewRenderers[previewId];
  return fn ? fn() : <div className="g8-preview g8-fallback" />;
};

export default function GamifiedTab8() {
  return (
    <div className="g8-root">
      <header className="g8-intro">
        <div>
          <h2>Gamified 8</h2>
          <p className="g8-sub">50 animated UI micro-demos with CSS motion. All scoped to this tab and honor reduced motion.</p>
        </div>
        <div className="g8-pill-row">
          <Pill label="UI" />
        </div>
      </header>

      <nav className="g8-toc">
        {categories.map((cat) => (
          <a key={cat.id} href={`#${cat.id}`} className="g8-toc-link">
            {cat.title}
          </a>
        ))}
      </nav>

      <div className="g8-sections">
        {categories.map((cat) => (
          <details key={cat.id} className="g8-section" open id={cat.id}>
            <summary className="g8-section-header">
              <div>
                <div className="g8-section-title">{cat.title}</div>
                <div className="g8-section-sub">{cat.description}</div>
              </div>
              <span className="g8-summary-line">{cat.items.length} items</span>
            </summary>

            <div className="g8-grid">
              {cat.items.map((item) => (
                <div key={item.id} className="g8-card">
                  <div className="g8-card-head">
                    <div>
                      <div className="g8-card-title">{item.title}</div>
                      <div className="g8-card-sub">{item.subtitle}</div>
                    </div>
                    <div className="g8-pill-row">
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
