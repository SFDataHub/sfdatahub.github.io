import React from "react";
import "./GamifiedTab2.css";

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
    id: "quests",
    title: "Quests & Objectives",
    description: "Logs, chains, rewards, and difficulty chips.",
    items: [
      { id: "11", categoryId: "quests", title: "Quest Log (3 steps)", subtitle: "Ordered checklist", tags: ["mock"], previewId: "pv_quest_steps" },
      { id: "12", categoryId: "quests", title: "Daily Objectives Board", subtitle: "Checkbox grid", tags: ["ui"], previewId: "pv_daily_checklist" },
      { id: "13", categoryId: "quests", title: "Weekly Contract Card", subtitle: "Timer + tear edge", tags: ["concept"], previewId: "pv_contract_timer" },
      { id: "14", categoryId: "quests", title: "Bounty Card", subtitle: "Target + reward tag", tags: ["mock"], previewId: "pv_bounty_target" },
      { id: "15", categoryId: "quests", title: "Multi-Objective Chips", subtitle: "3 tagged goals", tags: ["ui"], previewId: "pv_objective_chips" },
      { id: "16", categoryId: "quests", title: "Quest Chain Path", subtitle: "Linked nodes", tags: ["mock"], previewId: "pv_quest_chain_nodes" },
      { id: "17", categoryId: "quests", title: "Reward Preview Panel", subtitle: "XP + coins bundle", tags: ["ui"], previewId: "pv_reward_bundle" },
      { id: "18", categoryId: "quests", title: "Side Quest Mini", subtitle: "Compact lane", tags: ["mock"], previewId: "pv_sidequest_compact" },
      { id: "19", categoryId: "quests", title: "Claim Reward States", subtitle: "Enabled vs locked", tags: ["ui"], previewId: "pv_claim_states" },
      { id: "20", categoryId: "quests", title: "Difficulty Tags", subtitle: "Easy / Hard / Insane", tags: ["mock"], previewId: "pv_difficulty_tags" },
    ],
  },
  {
    id: "progress",
    title: "Progress Bars & Gauges",
    description: "Boss phases, dual progress, rings, and risk arcs.",
    items: [
      { id: "21", categoryId: "progress", title: "Boss HP Goal Bar", subtitle: "Segmented phases", tags: ["mock"], previewId: "pv_boss_hp_segmented" },
      { id: "22", categoryId: "progress", title: "Dual Progress vs Avg", subtitle: "Overlay marker", tags: ["ui"], previewId: "pv_dual_progress_marker" },
      { id: "23", categoryId: "progress", title: "Segmented Track (10)", subtitle: "10 stops rail", tags: ["concept"], previewId: "pv_segment_track_10" },
      { id: "24", categoryId: "progress", title: "Donut Completion", subtitle: "Ring percent", tags: ["mock"], previewId: "pv_donut_completion" },
      { id: "25", categoryId: "progress", title: "Battery Gauge", subtitle: "Energy level", tags: ["ui"], previewId: "pv_battery_gauge" },
      { id: "26", categoryId: "progress", title: "Thermometer Vertical", subtitle: "Heat column", tags: ["mock"], previewId: "pv_thermo_vertical" },
      { id: "27", categoryId: "progress", title: "Level XP Bar + ticks", subtitle: "Micro ticks", tags: ["ui"], previewId: "pv_xp_ticks" },
      { id: "28", categoryId: "progress", title: "Multi-Stat Mini Bars", subtitle: "STR/DEX/INT/CON/LCK", tags: ["mock"], previewId: "pv_multibar_stats5" },
      { id: "29", categoryId: "progress", title: "Risk Meter", subtitle: "Arc pointer", tags: ["concept"], previewId: "pv_risk_meter" },
      { id: "30", categoryId: "progress", title: "Perfect Run Bar", subtitle: "Checklist + bar", tags: ["ui"], previewId: "pv_perfect_run" },
    ],
  },
  {
    id: "rankings",
    title: "Rankings & Leagues",
    description: "Podiums, ladders, deltas, and history.",
    items: [
      { id: "31", categoryId: "rankings", title: "Trophy Podium Top 3", subtitle: "Height podium", tags: ["mock"], previewId: "pv_podium_top3" },
      { id: "32", categoryId: "rankings", title: "Rank Ladder Rungs", subtitle: "Rung climb", tags: ["ui"], previewId: "pv_ladder_rungs" },
      { id: "33", categoryId: "rankings", title: "League Tier Card", subtitle: "Bronze -> Diamond", tags: ["concept"], previewId: "pv_league_tiers" },
      { id: "34", categoryId: "rankings", title: "Rank Delta Chip", subtitle: "Up/down pill", tags: ["ui"], previewId: "pv_delta_chip" },
      { id: "35", categoryId: "rankings", title: "Percentile Gauge", subtitle: "Needle gauge", tags: ["mock"], previewId: "pv_percentile_gauge" },
      { id: "36", categoryId: "rankings", title: "Rival Slot (nearest)", subtitle: "You vs nearest", tags: ["concept"], previewId: "pv_rival_slot" },
      { id: "37", categoryId: "rankings", title: "Promotion Zone Highlight", subtitle: "Green band", tags: ["ui"], previewId: "pv_promo_zone" },
      { id: "38", categoryId: "rankings", title: "Relegation Warning", subtitle: "Red band", tags: ["mock"], previewId: "pv_relegation_zone" },
      { id: "39", categoryId: "rankings", title: "Top 5 Mini List", subtitle: "Ranked list", tags: ["ui"], previewId: "pv_top5_list" },
      { id: "40", categoryId: "rankings", title: "Rank History Step", subtitle: "Step chart", tags: ["mock"], previewId: "pv_rank_step_history" },
    ],
  },
  {
    id: "duels",
    title: "Comparisons & Duels",
    description: "Splits, overlays, and matchup meters.",
    items: [
      { id: "41", categoryId: "duels", title: "Stat Split Compare", subtitle: "Two columns", tags: ["mock"], previewId: "pv_split_compare" },
      { id: "42", categoryId: "duels", title: "You vs Avg Bars", subtitle: "Overlay bars", tags: ["ui"], previewId: "pv_you_vs_avg_bars" },
      { id: "43", categoryId: "duels", title: "Best of 3 Dots", subtitle: "Round tracker", tags: ["mock"], previewId: "pv_bestof3_dots" },
      { id: "44", categoryId: "duels", title: "Duel Outcome Card", subtitle: "Win/Loss plate", tags: ["ui"], previewId: "pv_duel_outcome" },
      { id: "45", categoryId: "duels", title: "Advantage Meter", subtitle: "Arrow to winner", tags: ["concept"], previewId: "pv_advantage_meter" },
      { id: "46", categoryId: "duels", title: "KPI Side-by-side", subtitle: "Four KPI tiles", tags: ["mock"], previewId: "pv_kpi_tiles_4" },
      { id: "47", categoryId: "duels", title: "Delta Breakdown Chips", subtitle: "Pos/neg split", tags: ["ui"], previewId: "pv_delta_chips_breakdown" },
      { id: "48", categoryId: "duels", title: "Mirror Match", subtitle: "Symmetric view", tags: ["mock"], previewId: "pv_mirror_neutral" },
      { id: "49", categoryId: "duels", title: "Radar Mock", subtitle: "Polygon radar", tags: ["concept"], previewId: "pv_radar_polygon" },
      { id: "50", categoryId: "duels", title: "Gap to Next", subtitle: "Distance marker", tags: ["ui"], previewId: "pv_gap_to_next" },
    ],
  },
  {
    id: "guild",
    title: "Guild & Social",
    description: "Roles, readiness, and alliance visuals.",
    items: [
      { id: "61", categoryId: "guild", title: "Guild Role Badges", subtitle: "Role chips", tags: ["mock"], previewId: "pv_guild_roles" },
      { id: "62", categoryId: "guild", title: "Contribution Per Member", subtitle: "Member bars", tags: ["ui"], previewId: "pv_contrib_bars" },
      { id: "63", categoryId: "guild", title: "Member Spotlight", subtitle: "Highlight lane", tags: ["concept"], previewId: "pv_spotlight_card" },
      { id: "64", categoryId: "guild", title: "Guild Power Composite", subtitle: "Gauge blend", tags: ["mock"], previewId: "pv_guild_power_meter" },
      { id: "65", categoryId: "guild", title: "Recruitment Slots", subtitle: "Open vs filled", tags: ["ui"], previewId: "pv_slots_open_filled" },
      { id: "66", categoryId: "guild", title: "War Readiness Panel", subtitle: "Status chips", tags: ["mock"], previewId: "pv_war_readiness" },
      { id: "67", categoryId: "guild", title: "Activity Pulse Spark", subtitle: "Pulse waveform", tags: ["concept"], previewId: "pv_activity_pulse" },
      { id: "68", categoryId: "guild", title: "Alliance Link Card", subtitle: "Linked hubs", tags: ["mock"], previewId: "pv_alliance_link" },
      { id: "69", categoryId: "guild", title: "Pinned Announcement", subtitle: "Pinned note", tags: ["ui"], previewId: "pv_pinned_announcement" },
      { id: "70", categoryId: "guild", title: "Trophy Shelf", subtitle: "Shelf icons", tags: ["mock"], previewId: "pv_trophy_shelf" },
    ],
  },
];

const Pill = ({ label }: { label: string }) => <span className="g2-pill">{label}</span>;

const Bar = ({ width, tone = "accent", height = 8 }: { width: string; tone?: string; height?: number }) => (
  <div className={`g2-bar tone-${tone}`} style={{ width, height }} />
);

const Dot = ({ tone = "accent", size = 8 }: { tone?: string; size?: number }) => (
  <span className={`g2-dot tone-${tone}`} style={{ width: size, height: size }} />
);

const previewRenderers: Record<string, () => JSX.Element> = {
  pv_quest_steps: () => (
    <div className="g2-preview g2-steps">
      {[1, 2, 3].map((i) => (
        <div key={i} className="g2-step-row">
          <span className="g2-step-dot" />
          <Bar width={`${70 - i * 10}%`} tone={i === 3 ? "muted" : "accent"} />
        </div>
      ))}
    </div>
  ),
  pv_daily_checklist: () => (
    <div className="g2-preview g2-checklist">
      {["Login", "Scan", "Share", "Claim"].map((label, idx) => (
        <div key={label} className="g2-check-row">
          <span className={`g2-checkbox ${idx < 2 ? "checked" : ""}`} />
          <span className="g2-check-label">{label}</span>
          <Bar width={`${40 + idx * 10}%`} tone="accent" height={5} />
        </div>
      ))}
    </div>
  ),
  pv_contract_timer: () => (
    <div className="g2-preview g2-contract">
      <div className="g2-contract-top">
        <Bar width="80%" tone="accent" />
        <Pill label="7d" />
      </div>
      <div className="g2-contract-body">
        <Bar width="100%" tone="muted" height={6} />
        <Bar width="65%" tone="warning" height={6} />
      </div>
      <div className="g2-contract-tear" />
    </div>
  ),
  pv_bounty_target: () => (
    <div className="g2-preview g2-row">
      <div className="g2-target">
        <div className="g2-target-ring" />
        <div className="g2-target-dot" />
      </div>
      <div className="g2-col">
        <Bar width="60%" tone="accent" />
        <Bar width="45%" tone="success" />
        <Pill label="Reward" />
      </div>
    </div>
  ),
  pv_objective_chips: () => (
    <div className="g2-preview g2-chip-stack">
      <Pill label="Win 2 matches" />
      <Pill label="Scan 3" />
      <Pill label="Share once" />
    </div>
  ),
  pv_quest_chain_nodes: () => (
    <div className="g2-preview g2-node-chain">
      {[0, 1, 2, 3, 4].map((i) => (
        <React.Fragment key={i}>
          <div className={`g2-node ${i < 3 ? "active" : ""}`} />
          {i < 4 ? <div className="g2-node-connector" /> : null}
        </React.Fragment>
      ))}
    </div>
  ),
  pv_reward_bundle: () => (
    <div className="g2-preview g2-row g2-space-between">
      <div className="g2-loot g2-loot-gem" />
      <div className="g2-loot g2-loot-coin" />
      <div className="g2-col">
        <Bar width="70%" tone="accent" />
        <div className="g2-pill-row">
          <Pill label="+250 XP" />
          <Pill label="+2 keys" />
        </div>
      </div>
    </div>
  ),
  pv_sidequest_compact: () => (
    <div className="g2-preview g2-row g2-sidequest">
      <div className="g2-sidequest-tag">Side</div>
      <div className="g2-col">
        <Bar width="60%" tone="accent" />
        <Bar width="35%" tone="muted" />
      </div>
      <div className="g2-arrow-right" />
    </div>
  ),
  pv_claim_states: () => (
    <div className="g2-preview g2-claims">
      <div className="g2-claim-btn enabled">Claim</div>
      <div className="g2-claim-btn disabled">Locked</div>
    </div>
  ),
  pv_difficulty_tags: () => (
    <div className="g2-preview g2-row g2-gap-sm">
      <Pill label="Easy" />
      <Pill label="Hard" />
      <Pill label="Insane" />
      <div className="g2-col">
        <Bar width="40%" tone="success" />
        <Bar width="60%" tone="warning" />
        <Bar width="80%" tone="danger" />
      </div>
    </div>
  ),
  pv_boss_hp_segmented: () => (
    <div className="g2-preview g2-bossbar">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`g2-boss-segment ${i < 3 ? "filled" : ""}`} />
      ))}
      <div className="g2-marker" style={{ left: "72%" }} />
    </div>
  ),
  pv_dual_progress_marker: () => (
    <div className="g2-preview g2-col g2-gap-xs">
      <Bar width="85%" tone="accent" height={10} />
      <div className="g2-dual-overlay">
        <Bar width="60%" tone="success" height={8} />
        <div className="g2-marker" style={{ left: "60%" }} />
        <div className="g2-marker muted" style={{ left: "85%" }} />
      </div>
    </div>
  ),
  pv_segment_track_10: () => (
    <div className="g2-preview g2-segment-track">
      {Array.from({ length: 10 }).map((_, idx) => (
        <div key={idx} className={`g2-segment ${idx < 6 ? "active" : ""}`} />
      ))}
    </div>
  ),
  pv_donut_completion: () => (
    <div className="g2-preview g2-row g2-center">
      <div className="g2-donut">
        <div className="g2-donut-fill" />
        <div className="g2-donut-hole">72%</div>
      </div>
      <div className="g2-col">
        <Bar width="50%" tone="accent" />
        <Bar width="40%" tone="muted" />
      </div>
    </div>
  ),
  pv_battery_gauge: () => (
    <div className="g2-preview g2-row g2-center">
      <div className="g2-battery">
        <div className="g2-battery-cap" />
        <div className="g2-battery-fill" />
      </div>
      <div className="g2-col">
        <Pill label="82%" />
        <Bar width="70%" tone="accent" />
      </div>
    </div>
  ),
  pv_thermo_vertical: () => (
    <div className="g2-preview g2-row g2-center">
      <div className="g2-thermo">
        <div className="g2-thermo-fill" />
      </div>
      <div className="g2-col">
        <Bar width="40%" tone="warning" />
        <Bar width="30%" tone="muted" />
      </div>
    </div>
  ),
  pv_xp_ticks: () => (
    <div className="g2-preview g2-col">
      <div className="g2-xpbar">
        <div className="g2-xp-fill" />
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="g2-xp-tick" style={{ left: `${(i + 1) * 10}%` }} />
        ))}
      </div>
      <Pill label="Level 42" />
    </div>
  ),
  pv_multibar_stats5: () => (
    <div className="g2-preview g2-stats5">
      {["STR", "DEX", "INT", "CON", "LCK"].map((stat, idx) => (
        <div key={stat} className="g2-stat-row">
          <span className="g2-stat-label">{stat}</span>
          <Bar width={`${40 + idx * 10}%`} tone={idx % 2 === 0 ? "accent" : "success"} height={6} />
        </div>
      ))}
    </div>
  ),
  pv_risk_meter: () => (
    <div className="g2-preview g2-risk">
      <div className="g2-risk-arc">
        <div className="g2-risk-pointer" />
      </div>
      <div className="g2-pill-row">
        <Pill label="Risk" />
        <Pill label="68%" />
      </div>
    </div>
  ),
  pv_perfect_run: () => (
    <div className="g2-preview g2-perfect">
      <Bar width="100%" tone="success" height={12} />
      <div className="g2-checklist tiny">
        {["No deaths", "No errors", "All chests"].map((txt) => (
          <div key={txt} className="g2-check-row">
            <span className="g2-checkbox checked" />
            <span className="g2-check-label">{txt}</span>
          </div>
        ))}
      </div>
    </div>
  ),
  pv_podium_top3: () => (
    <div className="g2-preview g2-podium">
      {[{ h: 50, tone: "silver" }, { h: 70, tone: "gold" }, { h: 40, tone: "bronze" }].map((col, idx) => (
        <div key={idx} className={`g2-podium-col ${col.tone}`} style={{ height: col.h }}>
          #{idx + 1}
        </div>
      ))}
    </div>
  ),
  pv_ladder_rungs: () => (
    <div className="g2-preview g2-ladder">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className={`g2-rung ${idx === 2 ? "active" : ""}`} />
      ))}
    </div>
  ),
  pv_league_tiers: () => (
    <div className="g2-preview g2-row g2-league">
      <div className="g2-league-shield" />
      <div className="g2-col">
        <Bar width="70%" tone="accent" />
        <div className="g2-pill-row">
          <Pill label="Bronze" />
          <Pill label="Diamond" />
        </div>
      </div>
    </div>
  ),
  pv_delta_chip: () => (
    <div className="g2-preview g2-row g2-gap-sm">
      <Pill label="^ +12" />
      <Pill label="v -3" />
      <Bar width="50%" tone="accent" />
    </div>
  ),
  pv_percentile_gauge: () => (
    <div className="g2-preview g2-row g2-center">
      <div className="g2-percent-gauge">
        <div className="g2-percent-needle" />
      </div>
      <div className="g2-col">
        <Pill label="Top 5%" />
        <Bar width="40%" tone="accent" />
      </div>
    </div>
  ),
  pv_rival_slot: () => (
    <div className="g2-preview g2-rival">
      <div className="g2-vs-block">
        <Bar width="60%" tone="accent" />
        <Pill label="You" />
      </div>
      <div className="g2-vs-mid">VS</div>
      <div className="g2-vs-block rival">
        <Bar width="55%" tone="warning" />
        <Pill label="Rival" />
      </div>
    </div>
  ),
  pv_promo_zone: () => (
    <div className="g2-preview g2-zone promo">
      <div className="g2-zone-band" />
      <div className="g2-zone-label">Promotion Zone</div>
    </div>
  ),
  pv_relegation_zone: () => (
    <div className="g2-preview g2-zone danger">
      <div className="g2-zone-band" />
      <div className="g2-zone-label">Relegation</div>
    </div>
  ),
  pv_top5_list: () => (
    <div className="g2-preview g2-list">
      {["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((n, idx) => (
        <div key={n} className="g2-list-row">
          <span className="g2-list-num">{idx + 1}</span>
          <Bar width={`${70 - idx * 8}%`} tone={idx < 2 ? "accent" : "muted"} height={6} />
        </div>
      ))}
    </div>
  ),
  pv_rank_step_history: () => (
    <div className="g2-preview g2-rank-history">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="g2-rank-node" style={{ bottom: `${idx * 8}%`, left: `${idx * 16}%` }} />
      ))}
      <div className="g2-rank-line" />
    </div>
  ),
  pv_split_compare: () => (
    <div className="g2-preview g2-split">
      <div className="g2-col">
        <Bar width="70%" tone="accent" />
        <Bar width="40%" tone="accent" />
      </div>
      <div className="g2-col">
        <Bar width="60%" tone="warning" />
        <Bar width="50%" tone="warning" />
      </div>
    </div>
  ),
  pv_you_vs_avg_bars: () => (
    <div className="g2-preview g2-col">
      <div className="g2-overlay-bars">
        <Bar width="80%" tone="accent" height={10} />
        <Bar width="55%" tone="muted" height={10} />
      </div>
      <div className="g2-pill-row">
        <Pill label="You" />
        <Pill label="Server Avg" />
      </div>
    </div>
  ),
  pv_bestof3_dots: () => (
    <div className="g2-preview g2-row g2-gap-sm">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`g2-round-dot ${i < 2 ? "won" : ""}`} />
      ))}
    </div>
  ),
  pv_duel_outcome: () => (
    <div className="g2-preview g2-duel">
      <div className="g2-shield win">Win</div>
      <div className="g2-shield loss">Loss</div>
    </div>
  ),
  pv_advantage_meter: () => (
    <div className="g2-preview g2-meter">
      <div className="g2-meter-track">
        <div className="g2-meter-fill" />
        <div className="g2-meter-pointer" style={{ left: "62%" }} />
      </div>
      <div className="g2-pill-row">
        <Pill label="Advantage" />
        <Pill label="+12%" />
      </div>
    </div>
  ),
  pv_kpi_tiles_4: () => (
    <div className="g2-preview g2-kpi-grid">
      {["KPI", "CTR", "UPT", "LTV"].map((kpi, idx) => (
        <div key={kpi} className="g2-kpi-tile">
          <div className="g2-kpi-label">{kpi}</div>
          <Bar width={`${40 + idx * 10}%`} tone="accent" />
        </div>
      ))}
    </div>
  ),
  pv_delta_chips_breakdown: () => (
    <div className="g2-preview g2-row g2-gap-sm">
      <Pill label="+18" />
      <Pill label="-5" />
      <Pill label="+2" />
      <Pill label="-1" />
    </div>
  ),
  pv_mirror_neutral: () => (
    <div className="g2-preview g2-mirror">
      <div className="g2-mirror-half">
        <Bar width="60%" tone="accent" />
      </div>
      <div className="g2-divider" />
      <div className="g2-mirror-half">
        <Bar width="60%" tone="warning" />
      </div>
    </div>
  ),
  pv_radar_polygon: () => (
    <div className="g2-preview g2-radar">
      <svg viewBox="0 0 120 120">
        <polygon points="60,15 100,50 90,105 30,105 20,50" className="g2-radar-bg" />
        <polygon points="60,30 90,55 80,90 40,90 30,55" className="g2-radar-fill" />
      </svg>
    </div>
  ),
  pv_gap_to_next: () => (
    <div className="g2-preview g2-gap-bar">
      <Bar width="80%" tone="accent" height={8} />
      <div className="g2-marker" style={{ left: "65%" }} />
      <div className="g2-gap-label">Gap: 12 pts</div>
    </div>
  ),
  pv_guild_roles: () => (
    <div className="g2-preview g2-row g2-gap-sm">
      <Pill label="Leader" />
      <Pill label="Officer" />
      <Pill label="Member" />
    </div>
  ),
  pv_contrib_bars: () => (
    <div className="g2-preview g2-col g2-gap-xs">
      {["Ava", "Ben", "Caro"].map((name, idx) => (
        <div key={name} className="g2-contrib-row">
          <span className="g2-contrib-name">{name}</span>
          <Bar width={`${50 + idx * 15}%`} tone="accent" height={6} />
        </div>
      ))}
    </div>
  ),
  pv_spotlight_card: () => (
    <div className="g2-preview g2-spotlight">
      <div className="g2-spotlight-glow" />
      <Bar width="70%" tone="accent" />
      <Pill label="Spotlight" />
    </div>
  ),
  pv_guild_power_meter: () => (
    <div className="g2-preview g2-row g2-center">
      <div className="g2-power-donut">
        <div className="g2-power-fill" />
      </div>
      <div className="g2-col">
        <Bar width="60%" tone="success" />
        <Bar width="40%" tone="warning" />
      </div>
    </div>
  ),
  pv_slots_open_filled: () => (
    <div className="g2-preview g2-slots">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`g2-slot-card ${i < 2 ? "open" : "filled"}`} />
      ))}
    </div>
  ),
  pv_war_readiness: () => (
    <div className="g2-preview g2-row g2-gap-sm">
      <Pill label="Ready" />
      <Pill label="Armor" />
      <Pill label="Supplies" />
      <Bar width="50%" tone="accent" />
    </div>
  ),
  pv_activity_pulse: () => (
    <div className="g2-preview g2-pulse">
      {Array.from({ length: 14 }).map((_, idx) => (
        <div key={idx} className="g2-pulse-bar" style={{ height: `${10 + (idx % 5) * 8}px` }} />
      ))}
    </div>
  ),
  pv_alliance_link: () => (
    <div className="g2-preview g2-row g2-center">
      <div className="g2-link-node" />
      <div className="g2-link-chain" />
      <div className="g2-link-node" />
    </div>
  ),
  pv_pinned_announcement: () => (
    <div className="g2-preview g2-pinned">
      <div className="g2-pin" />
      <Bar width="70%" tone="accent" />
      <Bar width="40%" tone="muted" />
    </div>
  ),
  pv_trophy_shelf: () => (
    <div className="g2-preview g2-shelf">
      <div className="g2-trophies">
        {[0, 1, 2].map((i) => (
          <div key={i} className="g2-trophy" />
        ))}
      </div>
      <div className="g2-shelf-wood" />
    </div>
  ),
};

const renderPreview = (previewId: string) =>
  previewRenderers[previewId] ? (
    previewRenderers[previewId]()
  ) : (
    <div className="g2-preview">
      <Bar width="60%" tone="accent" />
    </div>
  );

export default function GamifiedTab2() {
  return (
    <div className="g2-root">
      <header className="g2-intro">
        <div>
          <h2>Gamified 2</h2>
          <p className="g2-sub">50 unique mock widgets mapped to the original playground list. All static and scoped.</p>
        </div>
        <div className="g2-pill-row">
          <Pill label="mock" />
          <Pill label="concept" />
          <Pill label="ui" />
        </div>
      </header>

      <nav className="g2-toc">
        {categories.map((cat) => (
          <a key={cat.id} href={`#${cat.id}`} className="g2-toc-link">
            {cat.title}
          </a>
        ))}
      </nav>

      <div className="g2-sections">
        {categories.map((cat) => (
          <details key={cat.id} className="g2-section" open id={cat.id}>
            <summary className="g2-section-header">
              <div>
                <div className="g2-section-title">{cat.title}</div>
                <div className="g2-section-sub">{cat.description}</div>
              </div>
              <span className="g2-summary-line">{cat.items.length} items</span>
            </summary>

            <div className="g2-grid">
              {cat.items.map((item) => (
                <div key={item.id} className="g2-card">
                  <div className="g2-card-head">
                    <div>
                      <div className="g2-card-title">{item.title}</div>
                      <div className="g2-card-sub">{item.subtitle}</div>
                    </div>
                    <div className="g2-pill-row">
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
