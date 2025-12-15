import React from "react";
import "./GamifiedTab5.css";

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
    id: "meta",
    title: "Meta Systems",
    description: "Loops, ladders, and macro-structure sketches.",
    items: [
      { id: "1", categoryId: "meta", title: "Prestige Loop Diagram", subtitle: "reset + boost", tags: ["CONCEPT"], previewId: "pv_cpt_prestige_loop" },
      { id: "2", categoryId: "meta", title: "Seasonal Arc Map", subtitle: "start→end path", tags: ["CONCEPT"], previewId: "pv_cpt_season_arc" },
      { id: "3", categoryId: "meta", title: "Progress Economy Flow", subtitle: "earn→spend→upgrade", tags: ["CONCEPT"], previewId: "pv_cpt_economy_flow" },
      { id: "4", categoryId: "meta", title: "Skill Synergy Web", subtitle: "nodes + links", tags: ["CONCEPT"], previewId: "pv_cpt_synergy_web" },
      { id: "5", categoryId: "meta", title: "Difficulty Curve", subtitle: "soft curve concept", tags: ["CONCEPT"], previewId: "pv_cpt_difficulty_curve" },
      { id: "6", categoryId: "meta", title: "Reward Probability Bands", subtitle: "bands/tiers", tags: ["CONCEPT"], previewId: "pv_cpt_prob_bands" },
      { id: "7", categoryId: "meta", title: "Milestone Radar", subtitle: "milestones ring", tags: ["CONCEPT"], previewId: "pv_cpt_milestone_radar" },
      { id: "8", categoryId: "meta", title: "Collection Completion Map", subtitle: "zones filled", tags: ["CONCEPT"], previewId: "pv_cpt_collection_map" },
      { id: "9", categoryId: "meta", title: "Engagement Flywheel", subtitle: "cycle arrows", tags: ["CONCEPT"], previewId: "pv_cpt_flywheel" },
      { id: "10", categoryId: "meta", title: "Reputation Ladder", subtitle: "tiers + gates", tags: ["CONCEPT"], previewId: "pv_cpt_reputation_ladder" },
    ],
  },
  {
    id: "planning",
    title: "Planning & Strategy",
    description: "Allocation, risks, paths, and scenarios.",
    items: [
      { id: "11", categoryId: "planning", title: "Optimization Triangle", subtitle: "choose 2 of 3", tags: ["CONCEPT"], previewId: "pv_cpt_opt_triangle" },
      { id: "12", categoryId: "planning", title: "Resource Allocation Bars", subtitle: "split budget", tags: ["CONCEPT"], previewId: "pv_cpt_allocation_bars" },
      { id: "13", categoryId: "planning", title: "Upgrade Path Tree", subtitle: "branch choices", tags: ["CONCEPT"], previewId: "pv_cpt_upgrade_tree" },
      { id: "14", categoryId: "planning", title: "Risk/Reward Matrix", subtitle: "4 quadrants", tags: ["CONCEPT"], previewId: "pv_cpt_risk_reward_matrix" },
      { id: "15", categoryId: "planning", title: "Time-to-Goal Estimator", subtitle: "ETA blocks", tags: ["CONCEPT"], previewId: "pv_cpt_eta_blocks" },
      { id: "16", categoryId: "planning", title: "Rival Distance Map", subtitle: "gaps + targets", tags: ["CONCEPT"], previewId: "pv_cpt_rival_distance_map" },
      { id: "17", categoryId: "planning", title: "Power Spike Timeline", subtitle: "spike markers", tags: ["CONCEPT"], previewId: "pv_cpt_power_spike_timeline" },
      { id: "18", categoryId: "planning", title: "Weekly Strategy Board", subtitle: "3 focus cards", tags: ["CONCEPT"], previewId: "pv_cpt_weekly_board" },
      { id: "19", categoryId: "planning", title: "Breakpoint Indicators", subtitle: "threshold lines", tags: ["CONCEPT"], previewId: "pv_cpt_breakpoints" },
      { id: "20", categoryId: "planning", title: "Scenario Switcher", subtitle: "A/B/C outcomes", tags: ["CONCEPT"], previewId: "pv_cpt_scenarios_abc" },
    ],
  },
  {
    id: "social",
    title: "Social Concepts",
    description: "Guild health, equity, coverage, and momentum ideas.",
    items: [
      { id: "21", categoryId: "social", title: "Guild Health Dashboard", subtitle: "pillars concept", tags: ["CONCEPT"], previewId: "pv_cpt_guild_health" },
      { id: "22", categoryId: "social", title: "Contribution Equity Meter", subtitle: "fairness bar", tags: ["CONCEPT"], previewId: "pv_cpt_equity_meter" },
      { id: "23", categoryId: "social", title: "Role Coverage Grid", subtitle: "roles coverage", tags: ["CONCEPT"], previewId: "pv_cpt_role_coverage" },
      { id: "24", categoryId: "social", title: "Alliance Network Graph", subtitle: "nodes network", tags: ["CONCEPT"], previewId: "pv_cpt_alliance_graph" },
      { id: "25", categoryId: "social", title: "Recruitment Funnel", subtitle: "stages funnel", tags: ["CONCEPT"], previewId: "pv_cpt_recruit_funnel" },
      { id: "26", categoryId: "social", title: "Activity Rhythm Wheel", subtitle: "cycle wheel", tags: ["CONCEPT"], previewId: "pv_cpt_rhythm_wheel" },
      { id: "27", categoryId: "social", title: "Leadership Heat Zones", subtitle: "zones concept", tags: ["CONCEPT"], previewId: "pv_cpt_leadership_zones" },
      { id: "28", categoryId: "social", title: "Social Momentum Score", subtitle: "momentum line", tags: ["CONCEPT"], previewId: "pv_cpt_social_momentum" },
      { id: "29", categoryId: "social", title: "Collaboration Contract", subtitle: "agreement card", tags: ["CONCEPT"], previewId: "pv_cpt_collab_contract" },
      { id: "30", categoryId: "social", title: "Community Challenge Pool", subtitle: "pool + goals", tags: ["CONCEPT"], previewId: "pv_cpt_challenge_pool" },
    ],
  },
  {
    id: "insights",
    title: "Insights Concepts",
    description: "Signals, outliers, archetypes, and opportunity maps.",
    items: [
      { id: "31", categoryId: "insights", title: "Trend vs Noise Lens", subtitle: "signal filter", tags: ["CONCEPT"], previewId: "pv_cpt_signal_noise" },
      { id: "32", categoryId: "insights", title: "Outlier Detector Panel", subtitle: "flagged dots", tags: ["CONCEPT"], previewId: "pv_cpt_outlier_panel" },
      { id: "33", categoryId: "insights", title: "Consistency Index", subtitle: "stability meter", tags: ["CONCEPT"], previewId: "pv_cpt_consistency_index" },
      { id: "34", categoryId: "insights", title: "Growth Regimes", subtitle: "phases blocks", tags: ["CONCEPT"], previewId: "pv_cpt_growth_regimes" },
      { id: "35", categoryId: "insights", title: "Player Archetypes", subtitle: "3 archetype cards", tags: ["CONCEPT"], previewId: "pv_cpt_archetypes" },
      { id: "36", categoryId: "insights", title: "Benchmark Stack", subtitle: "compare layers", tags: ["CONCEPT"], previewId: "pv_cpt_benchmark_stack" },
      { id: "37", categoryId: "insights", title: "KPI Storyboard", subtitle: "3-step insight", tags: ["CONCEPT"], previewId: "pv_cpt_kpi_storyboard" },
      { id: "38", categoryId: "insights", title: "Efficiency Frontier", subtitle: "frontier curve", tags: ["CONCEPT"], previewId: "pv_cpt_efficiency_frontier" },
      { id: "39", categoryId: "insights", title: "Progress Forecast Bands", subtitle: "band forecast", tags: ["CONCEPT"], previewId: "pv_cpt_forecast_bands" },
      { id: "40", categoryId: "insights", title: "Opportunity Radar", subtitle: "radar points", tags: ["CONCEPT"], previewId: "pv_cpt_opportunity_radar" },
    ],
  },
  {
    id: "loops",
    title: "Gamification Loops",
    description: "Cadence, multipliers, chains, caps, and rewards.",
    items: [
      { id: "41", categoryId: "loops", title: "Daily/Weekly Loop", subtitle: "cadence map", tags: ["CONCEPT"], previewId: "pv_cpt_cadence_loop" },
      { id: "42", categoryId: "loops", title: "Reward Multipliers", subtitle: "stacked multipliers", tags: ["CONCEPT"], previewId: "pv_cpt_multiplier_stack" },
      { id: "43", categoryId: "loops", title: "Quest Chain System", subtitle: "chain gates", tags: ["CONCEPT"], previewId: "pv_cpt_chain_gates" },
      { id: "44", categoryId: "loops", title: "Badge Progression", subtitle: "ranked badges", tags: ["CONCEPT"], previewId: "pv_cpt_badge_progression" },
      { id: "45", categoryId: "loops", title: "Streak Protection", subtitle: "shield mechanic", tags: ["CONCEPT"], previewId: "pv_cpt_streak_shield" },
      { id: "46", categoryId: "loops", title: "Catch-up Mechanic", subtitle: "boost for low", tags: ["CONCEPT"], previewId: "pv_cpt_catchup" },
      { id: "47", categoryId: "loops", title: "Event Spike Model", subtitle: "event peaks", tags: ["CONCEPT"], previewId: "pv_cpt_event_spikes" },
      { id: "48", categoryId: "loops", title: "Soft Cap Concept", subtitle: "diminishing returns", tags: ["CONCEPT"], previewId: "pv_cpt_soft_cap" },
      { id: "49", categoryId: "loops", title: "Reward Choice Wheel", subtitle: "choose 1 of 3", tags: ["CONCEPT"], previewId: "pv_cpt_choice_wheel" },
      { id: "50", categoryId: "loops", title: "Meta Progress Passport", subtitle: "stamps journey", tags: ["CONCEPT"], previewId: "pv_cpt_passport" },
    ],
  },
];

const Pill = ({ label }: { label: string }) => <span className="g5-pill">{label}</span>;

const Bar = ({ width, tone = "accent", height = 8 }: { width: string; tone?: string; height?: number }) => (
  <div className={`g5-bar tone-${tone}`} style={{ width, height }} />
);

const Dot = ({ tone = "accent", size = 8 }: { tone?: string; size?: number }) => (
  <span className={`g5-dot tone-${tone}`} style={{ width: size, height: size }} />
);

const previewRenderers: Record<string, () => JSX.Element> = {
  pv_cpt_prestige_loop: () => (
    <div className="g5-preview g5-loop">
      {["Earn", "Reset", "Boost"].map((label, idx) => (
        <div key={label} className="g5-loop-node">
          <span className="g5-loop-label">{label}</span>
          <div className={`g5-loop-arrow ${idx === 2 ? "end" : ""}`} />
        </div>
      ))}
    </div>
  ),
  pv_cpt_season_arc: () => (
    <div className="g5-preview g5-arc">
      <div className="g5-arc-track">
        <div className="g5-arc-progress" style={{ width: "70%" }} />
      </div>
      <div className="g5-row g5-space-between g5-mini">
        <span>Start</span>
        <span>Season</span>
        <span>Final</span>
      </div>
    </div>
  ),
  pv_cpt_economy_flow: () => (
    <div className="g5-preview g5-row g5-gap-sm g5-center">
      <div className="g5-flow-card">Earn</div>
      <div className="g5-flow-arrow" />
      <div className="g5-flow-card alt">Spend</div>
      <div className="g5-flow-arrow" />
      <div className="g5-flow-card">Upgrade</div>
    </div>
  ),
  pv_cpt_synergy_web: () => (
    <div className="g5-preview g5-web">
      <div className="g5-web-node center" />
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className={`g5-web-node arm-${idx}`} />
      ))}
    </div>
  ),
  pv_cpt_difficulty_curve: () => (
    <div className="g5-preview g5-curve">
      <div className="g5-curve-line" />
      <div className="g5-dot tone-accent" style={{ left: "25%" }} />
      <div className="g5-dot tone-warning" style={{ left: "70%" }} />
    </div>
  ),
  pv_cpt_prob_bands: () => (
    <div className="g5-preview g5-col g5-gap-xxs">
      {["Common", "Rare", "Epic"].map((label, idx) => (
        <div key={label} className="g5-band">
          <span className="g5-band-label">{label}</span>
          <div className={`g5-band-fill tone-${idx === 2 ? "warning" : "accent"}`} style={{ width: `${40 + idx * 20}%` }} />
        </div>
      ))}
    </div>
  ),
  pv_cpt_milestone_radar: () => (
    <div className="g5-preview g5-radar">
      <div className="g5-radar-ring outer" />
      <div className="g5-radar-ring inner" />
      <Dot tone="warning" size={10} />
      <Dot tone="accent" size={8} />
      <Dot tone="success" size={8} />
    </div>
  ),
  pv_cpt_collection_map: () => (
    <div className="g5-preview g5-grid g5-grid-3">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className={`g5-zone ${idx < 3 ? "filled" : ""}`} />
      ))}
    </div>
  ),
  pv_cpt_flywheel: () => (
    <div className="g5-preview g5-flywheel">
      <div className="g5-flywheel-ring" />
      <div className="g5-flywheel-arrow a1" />
      <div className="g5-flywheel-arrow a2" />
      <div className="g5-flywheel-arrow a3" />
    </div>
  ),
  pv_cpt_reputation_ladder: () => (
    <div className="g5-preview g5-ladder">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`g5-tier ${i < 2 ? "active" : ""}`}>Tier {i + 1}</div>
      ))}
    </div>
  ),
  pv_cpt_opt_triangle: () => (
    <div className="g5-preview g5-triangle">
      <div className="g5-tri-corner top">Speed</div>
      <div className="g5-tri-corner left">Quality</div>
      <div className="g5-tri-corner right">Cost</div>
      <div className="g5-tri-fill" />
    </div>
  ),
  pv_cpt_allocation_bars: () => (
    <div className="g5-preview g5-col g5-gap-xxs">
      {["Gold", "Gems", "Energy"].map((label, idx) => (
        <div key={label} className="g5-row g5-gap-sm g5-center">
          <span className="g5-label">{label}</span>
          <Bar width={`${30 + idx * 15}%`} tone={idx === 1 ? "warning" : "accent"} height={6} />
        </div>
      ))}
    </div>
  ),
  pv_cpt_upgrade_tree: () => (
    <div className="g5-preview g5-tree">
      <div className="g5-tree-node root" />
      <div className="g5-tree-branch left">
        <div className="g5-tree-node" />
        <div className="g5-tree-node" />
      </div>
      <div className="g5-tree-branch right">
        <div className="g5-tree-node" />
        <div className="g5-tree-node" />
      </div>
    </div>
  ),
  pv_cpt_risk_reward_matrix: () => (
    <div className="g5-preview g5-matrix">
      <div className="g5-matrix-quad high">High Reward</div>
      <div className="g5-matrix-quad">Low Reward</div>
      <div className="g5-matrix-quad">Low Risk</div>
      <div className="g5-matrix-quad warn">High Risk</div>
    </div>
  ),
  pv_cpt_eta_blocks: () => (
    <div className="g5-preview g5-row g5-gap-xs">
      {["10d", "20d", "30d"].map((eta, idx) => (
        <div key={eta} className={`g5-eta-block ${idx === 2 ? "active" : ""}`}>
          {eta}
        </div>
      ))}
    </div>
  ),
  pv_cpt_rival_distance_map: () => (
    <div className="g5-preview g5-row g5-center g5-gap-sm">
      <div className="g5-distance">
        <div className="g5-distance-line">
          <div className="g5-distance-marker you" style={{ left: "22%" }} />
          <div className="g5-distance-marker rival" style={{ left: "62%" }} />
        </div>
      </div>
      <Pill label="Gap 40%" />
    </div>
  ),
  pv_cpt_power_spike_timeline: () => (
    <div className="g5-preview g5-col g5-gap-xxs">
      <div className="g5-spike-line">
        {[20, 60, 80].map((pos, idx) => (
          <div key={pos} className="g5-spike" style={{ left: `${pos}%` }}>
            <div className={`g5-spike-pin ${idx === 2 ? "strong" : ""}`} />
          </div>
        ))}
      </div>
      <div className="g5-mini">Power spikes</div>
    </div>
  ),
  pv_cpt_weekly_board: () => (
    <div className="g5-preview g5-grid g5-grid-3">
      {["Focus", "Risks", "Wins"].map((title) => (
        <div key={title} className="g5-cardlet">
          <Bar width="60%" />
          <Bar width="40%" tone="muted" />
        </div>
      ))}
    </div>
  ),
  pv_cpt_breakpoints: () => (
    <div className="g5-preview g5-breakpoints">
      {[25, 50, 75].map((bp) => (
        <div key={bp} className="g5-breakpoint" style={{ left: `${bp}%` }}>
          <span>{bp}</span>
        </div>
      ))}
    </div>
  ),
  pv_cpt_scenarios_abc: () => (
    <div className="g5-preview g5-row g5-gap-sm">
      {["A", "B", "C"].map((scenario, idx) => (
        <div key={scenario} className={`g5-scenario ${idx === 1 ? "active" : ""}`}>
          <div className="g5-scenario-title">{scenario}</div>
          <Bar width={`${40 + idx * 10}%`} tone="accent" />
        </div>
      ))}
    </div>
  ),
  pv_cpt_guild_health: () => (
    <div className="g5-preview g5-row g5-gap-sm g5-center">
      {[50, 70, 40].map((h, idx) => (
        <div key={idx} className="g5-pillar">
          <div className="g5-pillar-fill" style={{ height: `${h}%` }} />
        </div>
      ))}
      <Pill label="Guild Health" />
    </div>
  ),
  pv_cpt_equity_meter: () => (
    <div className="g5-preview g5-row g5-gap-sm g5-center">
      <div className="g5-meter">
        <div className="g5-meter-fill" style={{ width: "56%" }} />
      </div>
      <span className="g5-mini">Fair</span>
    </div>
  ),
  pv_cpt_role_coverage: () => (
    <div className="g5-preview g5-grid g5-grid-3">
      {["Tank", "Heal", "DPS"].map((role, idx) => (
        <div key={role} className="g5-role">
          <div className="g5-role-bar" style={{ width: `${40 + idx * 15}%` }} />
          <span className="g5-mini">{role}</span>
        </div>
      ))}
    </div>
  ),
  pv_cpt_alliance_graph: () => (
    <div className="g5-preview g5-network">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`g5-node n${i}`} />
      ))}
      <div className="g5-link l1" />
      <div className="g5-link l2" />
      <div className="g5-link l3" />
    </div>
  ),
  pv_cpt_recruit_funnel: () => (
    <div className="g5-preview g5-funnel">
      <div className="g5-funnel-layer big" />
      <div className="g5-funnel-layer mid" />
      <div className="g5-funnel-layer small" />
    </div>
  ),
  pv_cpt_rhythm_wheel: () => (
    <div className="g5-preview g5-wheel">
      {Array.from({ length: 6 }).map((_, idx) => (
        <span key={idx} className={`g5-wheel-dot ${idx % 2 === 0 ? "active" : ""}`} />
      ))}
    </div>
  ),
  pv_cpt_leadership_zones: () => (
    <div className="g5-preview g5-zones">
      <div className="g5-zone-block warm" />
      <div className="g5-zone-block cool" />
      <div className="g5-zone-block neutral" />
    </div>
  ),
  pv_cpt_social_momentum: () => (
    <div className="g5-preview g5-linechart">
      <div className="g5-line-path" />
      <div className="g5-line-marker" style={{ left: "70%" }} />
    </div>
  ),
  pv_cpt_collab_contract: () => (
    <div className="g5-preview g5-contract">
      <Bar width="70%" />
      <Bar width="40%" tone="muted" />
      <div className="g5-signature" />
    </div>
  ),
  pv_cpt_challenge_pool: () => (
    <div className="g5-preview g5-pool">
      <div className="g5-pool-water" />
      <div className="g5-goal-chip">Goal A</div>
      <div className="g5-goal-chip">Goal B</div>
    </div>
  ),
  pv_cpt_signal_noise: () => (
    <div className="g5-preview g5-signal">
      <div className="g5-signal-band strong" />
      <div className="g5-signal-band weak" />
      <div className="g5-filter" />
    </div>
  ),
  pv_cpt_outlier_panel: () => (
    <div className="g5-preview g5-scatter">
      {Array.from({ length: 8 }).map((_, idx) => (
        <span key={idx} className={`g5-scatter-dot ${idx === 7 ? "alert" : ""}`} />
      ))}
    </div>
  ),
  pv_cpt_consistency_index: () => (
    <div className="g5-preview g5-row g5-gap-sm g5-center">
      <div className="g5-gauge">
        <div className="g5-gauge-fill" style={{ width: "72%" }} />
      </div>
      <Pill label="Stable" />
    </div>
  ),
  pv_cpt_growth_regimes: () => (
    <div className="g5-preview g5-col g5-gap-xxs">
      {["Launch", "Scale", "Mature"].map((phase, idx) => (
        <div key={phase} className="g5-phase">
          <div className={`g5-phase-box ${idx === 1 ? "active" : ""}`} />
          <span className="g5-mini">{phase}</span>
        </div>
      ))}
    </div>
  ),
  pv_cpt_archetypes: () => (
    <div className="g5-preview g5-row g5-gap-sm">
      {["Explorer", "Achiever", "Social"].map((type) => (
        <div key={type} className="g5-arch-card">
          <Bar width="60%" />
          <div className="g5-arch-badge">{type[0]}</div>
        </div>
      ))}
    </div>
  ),
  pv_cpt_benchmark_stack: () => (
    <div className="g5-preview g5-stack">
      <div className="g5-stack-layer" />
      <div className="g5-stack-layer mid" />
      <div className="g5-stack-layer top" />
    </div>
  ),
  pv_cpt_kpi_storyboard: () => (
    <div className="g5-preview g5-row g5-gap-sm">
      {[1, 2, 3].map((i) => (
        <div key={i} className="g5-story-card">
          <span className="g5-story-step">Step {i}</span>
          <Bar width="50%" />
        </div>
      ))}
    </div>
  ),
  pv_cpt_efficiency_frontier: () => (
    <div className="g5-preview g5-frontier">
      <div className="g5-frontier-curve" />
      <div className="g5-frontier-dot" />
    </div>
  ),
  pv_cpt_forecast_bands: () => (
    <div className="g5-preview g5-bands">
      <div className="g5-band-line upper" />
      <div className="g5-band-line lower" />
      <div className="g5-band-fill" />
    </div>
  ),
  pv_cpt_opportunity_radar: () => (
    <div className="g5-preview g5-radar-grid">
      {Array.from({ length: 6 }).map((_, idx) => (
        <span key={idx} className="g5-radar-dot" />
      ))}
    </div>
  ),
  pv_cpt_cadence_loop: () => (
    <div className="g5-preview g5-row g5-gap-sm g5-center">
      <div className="g5-loop-mini daily">Daily</div>
      <div className="g5-loop-mini weekly active">Weekly</div>
      <div className="g5-loop-mini monthly">Monthly</div>
    </div>
  ),
  pv_cpt_multiplier_stack: () => (
    <div className="g5-preview g5-col g5-gap-xxs">
      {[1, 2, 3].map((mult) => (
        <div key={mult} className="g5-multiplier">
          <span>x{mult}</span>
          <div className="g5-multi-bar" style={{ width: `${mult * 20 + 30}%` }} />
        </div>
      ))}
    </div>
  ),
  pv_cpt_chain_gates: () => (
    <div className="g5-preview g5-row g5-gap-xs g5-center">
      {["Q1", "Q2", "Q3", "Boss"].map((gate, idx) => (
        <React.Fragment key={gate}>
          <div className={`g5-gate ${idx === 3 ? "final" : ""}`}>{gate}</div>
          {idx < 3 && <div className="g5-gate-line" />}
        </React.Fragment>
      ))}
    </div>
  ),
  pv_cpt_badge_progression: () => (
    <div className="g5-preview g5-row g5-gap-sm g5-center">
      {["Bronze", "Silver", "Gold"].map((tier, idx) => (
        <div key={tier} className={`g5-badge ${idx === 2 ? "shine" : ""}`}>
          {tier[0]}
        </div>
      ))}
    </div>
  ),
  pv_cpt_streak_shield: () => (
    <div className="g5-preview g5-row g5-gap-sm g5-center">
      <div className="g5-shield">Streak</div>
      <Pill label="Protected" />
    </div>
  ),
  pv_cpt_catchup: () => (
    <div className="g5-preview g5-row g5-gap-sm g5-center">
      <div className="g5-boost-bar">
        <div className="g5-boost-fill" style={{ width: "45%" }} />
      </div>
      <Pill label="+Catch Up" />
    </div>
  ),
  pv_cpt_event_spikes: () => (
    <div className="g5-preview g5-col g5-gap-xxs">
      <div className="g5-spike-line">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="g5-spike event" style={{ left: `${idx * 20}%`, height: `${10 + idx * 8}px` }} />
        ))}
      </div>
      <span className="g5-mini">Events</span>
    </div>
  ),
  pv_cpt_soft_cap: () => (
    <div className="g5-preview g5-softcap">
      <div className="g5-softcap-line" />
      <div className="g5-softcap-cap" style={{ left: "65%" }} />
    </div>
  ),
  pv_cpt_choice_wheel: () => (
    <div className="g5-preview g5-wheel-choice">
      {["A", "B", "C"].map((opt, idx) => (
        <div key={opt} className={`g5-choice ${idx === 0 ? "active" : ""}`}>
          {opt}
        </div>
      ))}
    </div>
  ),
  pv_cpt_passport: () => (
    <div className="g5-preview g5-passport">
      {["Zone 1", "Zone 2", "Zone 3"].map((zone, idx) => (
        <div key={zone} className={`g5-stamp ${idx < 2 ? "filled" : ""}`}>
          {zone}
        </div>
      ))}
    </div>
  ),
};

const renderPreview = (previewId: string) => {
  const fn = previewRenderers[previewId];
  return fn ? fn() : <div className="g5-preview g5-fallback" />;
};

export default function GamifiedTab5() {
  return (
    <div className="g5-root">
      <header className="g5-intro">
        <div>
          <h2>Gamified 5</h2>
          <p className="g5-sub">50 concept sketches across macro systems, planning, social, insights, and loops.</p>
        </div>
        <div className="g5-pill-row">
          <Pill label="CONCEPT" />
        </div>
      </header>

      <nav className="g5-toc">
        {categories.map((cat) => (
          <a key={cat.id} href={`#${cat.id}`} className="g5-toc-link">
            {cat.title}
          </a>
        ))}
      </nav>

      <div className="g5-sections">
        {categories.map((cat) => (
          <details key={cat.id} className="g5-section" open id={cat.id}>
            <summary className="g5-section-header">
              <div>
                <div className="g5-section-title">{cat.title}</div>
                <div className="g5-section-sub">{cat.description}</div>
              </div>
              <span className="g5-summary-line">{cat.items.length} items</span>
            </summary>

            <div className="g5-grid">
              {cat.items.map((item) => (
                <div key={item.id} className="g5-card">
                  <div className="g5-card-head">
                    <div>
                      <div className="g5-card-title">{item.title}</div>
                      <div className="g5-card-sub">{item.subtitle}</div>
                    </div>
                    <div className="g5-pill-row">
                      {(item.tags || ["CONCEPT"]).map((tag) => (
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
