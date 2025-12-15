import React from "react";
import "./GamifiedTab6.css";

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
    id: "profile",
    title: "Profile Widgets",
    description: "Compact profile cards, KPIs, and progression snippets.",
    items: [
      { id: "1", categoryId: "profile", title: "Hero Panel Mini", subtitle: "avatar + 3 KPIs", tags: ["MOCK"], previewId: "pv_mock_hero_panel_mini" },
      { id: "2", categoryId: "profile", title: "Attribute Bars Card", subtitle: "5 bars + markers", tags: ["MOCK"], previewId: "pv_mock_attr_bars" },
      { id: "3", categoryId: "profile", title: "Scan Freshness Badge", subtitle: "age + color", tags: ["MOCK"], previewId: "pv_mock_scan_freshness" },
      { id: "4", categoryId: "profile", title: "Profile Tabs Strip", subtitle: "overview/scans/etc", tags: ["MOCK"], previewId: "pv_mock_profile_tabs" },
      { id: "5", categoryId: "profile", title: "Linked Characters Row", subtitle: "tabs switch", tags: ["MOCK"], previewId: "pv_mock_linked_chars" },
      { id: "6", categoryId: "profile", title: "Snapshot Compare Card", subtitle: "then vs now", tags: ["MOCK"], previewId: "pv_mock_snapshot_compare" },
      { id: "7", categoryId: "profile", title: "Rank Delta Inline", subtitle: "rank + arrows", tags: ["MOCK"], previewId: "pv_mock_rank_inline" },
      { id: "8", categoryId: "profile", title: "Scrapbook Completion Tile", subtitle: "% + ring", tags: ["MOCK"], previewId: "pv_mock_scrapbook_tile" },
      { id: "9", categoryId: "profile", title: "Legendary Counter Card", subtitle: "count + rarity", tags: ["MOCK"], previewId: "pv_mock_legendary_counter" },
      { id: "10", categoryId: "profile", title: "Progress History Mini", subtitle: "tiny history list", tags: ["MOCK"], previewId: "pv_mock_history_mini" },
    ],
  },
  {
    id: "guild",
    title: "Guild Widgets",
    description: "Guild header, queues, planner tiles, and readiness snapshots.",
    items: [
      { id: "11", categoryId: "guild", title: "Guild Header Mock", subtitle: "emblem + KPIs", tags: ["MOCK"], previewId: "pv_mock_guild_header" },
      { id: "12", categoryId: "guild", title: "Member List Row", subtitle: "role + last scan", tags: ["MOCK"], previewId: "pv_mock_member_row" },
      { id: "13", categoryId: "guild", title: "Recruitment Card", subtitle: "open slots", tags: ["MOCK"], previewId: "pv_mock_recruitment" },
      { id: "14", categoryId: "guild", title: "Fusion Planner Tile", subtitle: "two guild compare", tags: ["MOCK"], previewId: "pv_mock_fusion_tile" },
      { id: "15", categoryId: "guild", title: "Waitlist Panel", subtitle: "queue preview", tags: ["MOCK"], previewId: "pv_mock_waitlist_panel" },
      { id: "16", categoryId: "guild", title: "Guild Activity Panel", subtitle: "last 7d", tags: ["MOCK"], previewId: "pv_mock_guild_activity" },
      { id: "17", categoryId: "guild", title: "Guild Benchmarks", subtitle: "avg markers", tags: ["MOCK"], previewId: "pv_mock_guild_benchmarks" },
      { id: "18", categoryId: "guild", title: "War Readiness Mock", subtitle: "ready/not", tags: ["MOCK"], previewId: "pv_mock_war_readiness2" },
      { id: "19", categoryId: "guild", title: "Treasury Summary", subtitle: "treasury KPIs", tags: ["MOCK"], previewId: "pv_mock_treasury_summary" },
      { id: "20", categoryId: "guild", title: "Guild Notes Card", subtitle: "pinned notes", tags: ["MOCK"], previewId: "pv_mock_guild_notes" },
    ],
  },
  {
    id: "tables",
    title: "Top Lists / Tables",
    description: "Tables, filters, timers, pagination, and compare bars.",
    items: [
      { id: "21", categoryId: "tables", title: "Toplist Table Card", subtitle: "header + rows", tags: ["MOCK"], previewId: "pv_mock_toplist_table" },
      { id: "22", categoryId: "tables", title: "Rank Change Column", subtitle: "▲▼ deltas", tags: ["MOCK"], previewId: "pv_mock_rank_change_col" },
      { id: "23", categoryId: "tables", title: "Server Filter Sidebar", subtitle: "filters stack", tags: ["MOCK"], previewId: "pv_mock_server_filters" },
      { id: "24", categoryId: "tables", title: "Class Filter Chips", subtitle: "class chips", tags: ["MOCK"], previewId: "pv_mock_class_chips" },
      { id: "25", categoryId: "tables", title: "Snapshot Timer Pill", subtitle: "next refresh", tags: ["MOCK"], previewId: "pv_mock_snapshot_timer" },
      { id: "26", categoryId: "tables", title: "Pagination Footer Mock", subtitle: "page controls", tags: ["MOCK"], previewId: "pv_mock_pagination_footer" },
      { id: "27", categoryId: "tables", title: "Sticky Header Mock", subtitle: "sticky header row", tags: ["MOCK"], previewId: "pv_mock_sticky_header" },
      { id: "28", categoryId: "tables", title: "Row Expand Detail", subtitle: "expand drawer", tags: ["MOCK"], previewId: "pv_mock_row_expand" },
      { id: "29", categoryId: "tables", title: "Export Button Strip", subtitle: "CSV/Excel", tags: ["MOCK"], previewId: "pv_mock_export_strip" },
      { id: "30", categoryId: "tables", title: "Compare Selected Rows", subtitle: "compare bar", tags: ["MOCK"], previewId: "pv_mock_compare_bar" },
    ],
  },
  {
    id: "upload",
    title: "Upload / Import UX",
    description: "Queues, validation, progress, notices, and summaries.",
    items: [
      { id: "31", categoryId: "upload", title: "Upload Queue Card", subtitle: "pending items", tags: ["MOCK"], previewId: "pv_mock_upload_queue" },
      { id: "32", categoryId: "upload", title: "Dedup Result Toast", subtitle: "created/duplicate", tags: ["MOCK"], previewId: "pv_mock_dedup_toast" },
      { id: "33", categoryId: "upload", title: "Dry-Run Validation Panel", subtitle: "errors list", tags: ["MOCK"], previewId: "pv_mock_validation_panel" },
      { id: "34", categoryId: "upload", title: "Progress Upload Meter", subtitle: "step progress", tags: ["MOCK"], previewId: "pv_mock_upload_progress" },
      { id: "35", categoryId: "upload", title: "Selected Entities Counter", subtitle: "players/guilds", tags: ["MOCK"], previewId: "pv_mock_selected_counter" },
      { id: "36", categoryId: "upload", title: "Token TTL Notice", subtitle: "10–15min", tags: ["MOCK"], previewId: "pv_mock_ttl_notice" },
      { id: "37", categoryId: "upload", title: "Privacy Preview Box", subtitle: "what gets sent", tags: ["MOCK"], previewId: "pv_mock_privacy_preview" },
      { id: "38", categoryId: "upload", title: "Error Log Card", subtitle: "recent errors", tags: ["MOCK"], previewId: "pv_mock_error_log" },
      { id: "39", categoryId: "upload", title: "Retry/Backoff Banner", subtitle: "rate limit", tags: ["MOCK"], previewId: "pv_mock_retry_banner" },
      { id: "40", categoryId: "upload", title: "Success Summary Panel", subtitle: "import summary", tags: ["MOCK"], previewId: "pv_mock_success_summary" },
    ],
  },
  {
    id: "admin",
    title: "Admin/Control Panel Mocks",
    description: "Roles, feature toggles, access groups, and moderation queues.",
    items: [
      { id: "41", categoryId: "admin", title: "Roles Context Menu", subtitle: "role switch UI", tags: ["MOCK"], previewId: "pv_mock_roles_menu" },
      { id: "42", categoryId: "admin", title: "Feature Gate Table", subtitle: "toggles rows", tags: ["MOCK"], previewId: "pv_mock_feature_table" },
      { id: "43", categoryId: "admin", title: "Access Group Card", subtitle: "group members", tags: ["MOCK"], previewId: "pv_mock_access_group" },
      { id: "44", categoryId: "admin", title: "Audit Log Row", subtitle: "who changed what", tags: ["MOCK"], previewId: "pv_mock_audit_row" },
      { id: "45", categoryId: "admin", title: "Error Monitor Tile", subtitle: "status lights", tags: ["MOCK"], previewId: "pv_mock_error_monitor" },
      { id: "46", categoryId: "admin", title: "API Status Card", subtitle: "endpoint health", tags: ["MOCK"], previewId: "pv_mock_api_status" },
      { id: "47", categoryId: "admin", title: "Seed Token Warning", subtitle: "internal endpoint", tags: ["MOCK"], previewId: "pv_mock_seed_warning" },
      { id: "48", categoryId: "admin", title: "Moderation Queue", subtitle: "approve/deny", tags: ["MOCK"], previewId: "pv_mock_mod_queue" },
      { id: "49", categoryId: "admin", title: "Feedback Inbox Card", subtitle: "decision buttons", tags: ["MOCK"], previewId: "pv_mock_feedback_inbox" },
      { id: "50", categoryId: "admin", title: "Release Toggle Panel", subtitle: "staging/prod", tags: ["MOCK"], previewId: "pv_mock_release_toggle" },
    ],
  },
];

const Pill = ({ label }: { label: string }) => <span className="g6-pill">{label}</span>;

const Bar = ({ width, tone = "accent", height = 8 }: { width: string; tone?: string; height?: number }) => (
  <div className={`g6-bar tone-${tone}`} style={{ width, height }} />
);

const Dot = ({ tone = "accent", size = 8 }: { tone?: string; size?: number }) => (
  <span className={`g6-dot tone-${tone}`} style={{ width: size, height: size }} />
);

const previewRenderers: Record<string, () => JSX.Element> = {
  pv_mock_hero_panel_mini: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-avatar big">A</div>
      <div className="g6-col g6-gap-xxs">
        <Bar width="70%" />
        <div className="g6-row g6-gap-xs">
          <Pill label="XP 42k" />
          <Pill label="Lvl 58" />
          <Pill label="WR 62%" />
        </div>
      </div>
    </div>
  ),
  pv_mock_attr_bars: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["STR", "DEX", "INT", "VIT", "LCK"].map((stat, idx) => (
        <div key={stat} className="g6-row g6-gap-xs g6-center">
          <span className="g6-label">{stat}</span>
          <Bar width={`${35 + idx * 12}%`} tone={idx % 2 === 0 ? "accent" : "warning"} height={6} />
          <Dot tone="muted" />
        </div>
      ))}
    </div>
  ),
  pv_mock_scan_freshness: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-badge fresh">3h ago</div>
      <Bar width="50%" />
    </div>
  ),
  pv_mock_profile_tabs: () => (
    <div className="g6-preview g6-row g6-gap-xs">
      {["Overview", "Scans", "Gear", "Notes"].map((tab, idx) => (
        <div key={tab} className={`g6-tab ${idx === 1 ? "active" : ""}`}>
          {tab}
        </div>
      ))}
    </div>
  ),
  pv_mock_linked_chars: () => (
    <div className="g6-preview g6-row g6-gap-xs g6-center">
      {["Main", "Alt 1", "Alt 2"].map((label, idx) => (
        <div key={label} className={`g6-chip ${idx === 0 ? "active" : ""}`}>
          {label}
        </div>
      ))}
      <div className="g6-arrow-right" />
    </div>
  ),
  pv_mock_snapshot_compare: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-col g6-gap-xxs">
        <span className="g6-mini">Then</span>
        <Bar width="40%" tone="muted" />
      </div>
      <div className="g6-compare-arrow" />
      <div className="g6-col g6-gap-xxs">
        <span className="g6-mini">Now</span>
        <Bar width="70%" tone="accent" />
      </div>
    </div>
  ),
  pv_mock_rank_inline: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <Pill label="#24" />
      <Pill label="▲ 3" />
      <Pill label="▼ 1" />
    </div>
  ),
  pv_mock_scrapbook_tile: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-ring">
        <div className="g6-ring-fill" />
        <div className="g6-ring-hole">68%</div>
      </div>
      <div className="g6-col g6-gap-xxs">
        <Bar width="60%" />
        <Bar width="35%" tone="muted" />
      </div>
    </div>
  ),
  pv_mock_legendary_counter: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-legendary">12</div>
      <div className="g6-col g6-gap-xxs">
        <span className="g6-mini">Legendary</span>
        <Bar width="70%" tone="warning" />
      </div>
    </div>
  ),
  pv_mock_history_mini: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["+12 Lvl", "+2 shards", "Joined guild"].map((entry, idx) => (
        <div key={entry} className="g6-history-row">
          <Dot tone="accent" size={8} />
          <span>{entry}</span>
          <span className="g6-time">{idx + 1}d</span>
        </div>
      ))}
    </div>
  ),
  pv_mock_guild_header: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-emblem" />
      <div className="g6-col g6-gap-xxs">
        <Bar width="60%" />
        <div className="g6-row g6-gap-xs">
          <Pill label="Lvl 12" />
          <Pill label="42 members" />
        </div>
      </div>
    </div>
  ),
  pv_mock_member_row: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-avatar">M</div>
      <Bar width="50%" />
      <Pill label="Officer" />
      <Pill label="Scan 1d" />
    </div>
  ),
  pv_mock_recruitment: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <Bar width="60%" />
      <div className="g6-row g6-gap-xs">
        <Pill label="Open 3" />
        <Pill label="Role: DPS" />
      </div>
    </div>
  ),
  pv_mock_fusion_tile: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-col g6-gap-xxs">
        <Bar width="40%" />
        <Pill label="Guild A" />
      </div>
      <div className="g6-merge" />
      <div className="g6-col g6-gap-xxs">
        <Bar width="40%" />
        <Pill label="Guild B" />
      </div>
    </div>
  ),
  pv_mock_waitlist_panel: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["Rae", "Noah", "Ivy"].map((name, idx) => (
        <div key={name} className="g6-wait-row">
          <span className="g6-badge muted">{idx + 1}</span>
          <Bar width={`${40 + idx * 15}%`} />
        </div>
      ))}
    </div>
  ),
  pv_mock_guild_activity: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-heat">
        {Array.from({ length: 7 }).map((_, idx) => (
          <span key={idx} style={{ height: `${10 + idx * 4}px` }} />
        ))}
      </div>
      <Pill label="7d" />
    </div>
  ),
  pv_mock_guild_benchmarks: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["Avg", "Target", "You"].map((label, idx) => (
        <div key={label} className="g6-row g6-gap-xs g6-center">
          <span className="g6-mini">{label}</span>
          <div className="g6-marker-line">
            <div className="g6-marker" style={{ left: `${30 + idx * 20}%` }} />
          </div>
        </div>
      ))}
    </div>
  ),
  pv_mock_war_readiness2: () => (
    <div className="g6-preview g6-row g6-gap-xs g6-center">
      <Pill label="Ready" />
      <Pill label="Needs Gear" />
      <Pill label="Needs Scans" />
    </div>
  ),
  pv_mock_treasury_summary: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-col g6-gap-xxs">
        <span className="g6-mini">Gold</span>
        <Bar width="70%" tone="warning" />
      </div>
      <div className="g6-col g6-gap-xxs">
        <span className="g6-mini">Gems</span>
        <Bar width="50%" tone="accent" />
      </div>
    </div>
  ),
  pv_mock_guild_notes: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <div className="g6-note-pin" />
      <Bar width="65%" />
      <Bar width="40%" tone="muted" />
    </div>
  ),
  pv_mock_toplist_table: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <div className="g6-table-head">
        <Bar width="30%" />
        <Bar width="20%" />
        <Bar width="25%" />
      </div>
      {Array.from({ length: 3 }).map((_, idx) => (
        <div key={idx} className="g6-table-row">
          <Bar width={`${60 - idx * 10}%`} tone="muted" height={6} />
        </div>
      ))}
    </div>
  ),
  pv_mock_rank_change_col: () => (
    <div className="g6-preview g6-row g6-gap-xs g6-center">
      <Pill label="▲ 8" />
      <Pill label="▼ 2" />
      <Bar width="40%" />
    </div>
  ),
  pv_mock_server_filters: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["EU", "US", "INT"].map((region, idx) => (
        <div key={region} className="g6-filter-row">
          <input type="checkbox" checked={idx === 0} readOnly />
          <span>{region}</span>
        </div>
      ))}
    </div>
  ),
  pv_mock_class_chips: () => (
    <div className="g6-preview g6-row g6-gap-xs g6-wrap">
      {["Warrior", "Mage", "Hunter", "Cleric"].map((cls, idx) => (
        <span key={cls} className={`g6-chip ${idx === 2 ? "active" : ""}`}>
          {cls}
        </span>
      ))}
    </div>
  ),
  pv_mock_snapshot_timer: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <Pill label="Refresh in 03:12" />
      <div className="g6-ring tiny">
        <div className="g6-ring-fill" />
      </div>
    </div>
  ),
  pv_mock_pagination_footer: () => (
    <div className="g6-preview g6-row g6-gap-xs g6-center">
      <span className="g6-page">Prev</span>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`g6-page ${n === 2 ? "active" : ""}`}>
          {n}
        </span>
      ))}
      <span className="g6-page">Next</span>
    </div>
  ),
  pv_mock_sticky_header: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <div className="g6-sticky-head">
        <Bar width="40%" />
        <Bar width="20%" tone="muted" />
      </div>
      <div className="g6-table-row">
        <Bar width="70%" tone="muted" height={6} />
      </div>
    </div>
  ),
  pv_mock_row_expand: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <div className="g6-expand-row">
        <span className="g6-chevron" />
        <Bar width="50%" />
      </div>
      <div className="g6-expand-body">
        <Bar width="60%" tone="muted" />
        <Bar width="40%" tone="muted" />
      </div>
    </div>
  ),
  pv_mock_export_strip: () => (
    <div className="g6-preview g6-row g6-gap-xs">
      <button className="g6-btn ghost">CSV</button>
      <button className="g6-btn ghost">Excel</button>
      <button className="g6-btn solid">Export</button>
    </div>
  ),
  pv_mock_compare_bar: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <Bar width="60%" tone="accent" />
      <Pill label="2 selected" />
    </div>
  ),
  pv_mock_upload_queue: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["players.csv", "guilds.csv"].map((file) => (
        <div key={file} className="g6-queue-row">
          <Bar width="50%" />
          <span className="g6-mini">{file}</span>
        </div>
      ))}
    </div>
  ),
  pv_mock_dedup_toast: () => (
    <div className="g6-preview g6-toast">
      <span className="g6-dot tone-success" />
      <span>3 created / 1 duplicate</span>
    </div>
  ),
  pv_mock_validation_panel: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["Missing name", "Invalid server", "Bad class"].map((err) => (
        <div key={err} className="g6-error-row">
          <span className="g6-badge warn">!</span>
          <span>{err}</span>
        </div>
      ))}
    </div>
  ),
  pv_mock_upload_progress: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <div className="g6-steps">
        {[1, 2, 3, 4].map((step, idx) => (
          <div key={step} className={`g6-step ${idx < 2 ? "done" : idx === 2 ? "active" : ""}`} />
        ))}
      </div>
      <Bar width="65%" />
    </div>
  ),
  pv_mock_selected_counter: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <Pill label="Players 32" />
      <Pill label="Guilds 4" />
      <Pill label="Servers 2" />
    </div>
  ),
  pv_mock_ttl_notice: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-badge warn">TTL 12m</div>
      <Bar width="50%" tone="warning" />
    </div>
  ),
  pv_mock_privacy_preview: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <span className="g6-mini">Sending</span>
      <Bar width="60%" />
      <Bar width="40%" tone="muted" />
    </div>
  ),
  pv_mock_error_log: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["Timeout", "Bad payload"].map((msg) => (
        <div key={msg} className="g6-error-row">
          <span className="g6-badge danger">!</span>
          <span>{msg}</span>
        </div>
      ))}
    </div>
  ),
  pv_mock_retry_banner: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-badge warn">Rate limit</div>
      <button className="g6-btn ghost">Retry</button>
      <button className="g6-btn ghost">Backoff</button>
    </div>
  ),
  pv_mock_success_summary: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <Bar width="70%" />
      <div className="g6-row g6-gap-xs">
        <Pill label="Created 42" />
        <Pill label="Duplicates 3" />
      </div>
    </div>
  ),
  pv_mock_roles_menu: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["Viewer", "Editor", "Admin"].map((role, idx) => (
        <div key={role} className={`g6-menu-row ${idx === 2 ? "active" : ""}`}>
          <span>{role}</span>
          {idx === 2 && <span className="g6-check">✓</span>}
        </div>
      ))}
    </div>
  ),
  pv_mock_feature_table: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["Feature A", "Feature B", "Feature C"].map((feat, idx) => (
        <div key={feat} className="g6-feature-row">
          <Bar width="40%" />
          <div className={`g6-toggle ${idx === 1 ? "on" : ""}`}>
            <div className="g6-toggle-thumb" />
          </div>
        </div>
      ))}
    </div>
  ),
  pv_mock_access_group: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <Bar width="60%" />
      <div className="g6-row g6-gap-xs">
        <div className="g6-avatar small">A</div>
        <div className="g6-avatar small">B</div>
        <div className="g6-avatar small">C</div>
      </div>
    </div>
  ),
  pv_mock_audit_row: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <Bar width="40%" />
      <Pill label="by Admin" />
      <Pill label="2h ago" />
    </div>
  ),
  pv_mock_error_monitor: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      {["OK", "WARN", "FAIL"].map((state, idx) => (
        <div key={state} className={`g6-status ${idx === 2 ? "danger" : idx === 1 ? "warn" : "ok"}`} />
      ))}
      <Bar width="40%" />
    </div>
  ),
  pv_mock_api_status: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <Pill label="/api/status" />
      <div className="g6-dot tone-success" />
      <div className="g6-mini">200 OK</div>
    </div>
  ),
  pv_mock_seed_warning: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <div className="g6-badge danger">Internal</div>
      <Bar width="50%" tone="danger" />
    </div>
  ),
  pv_mock_mod_queue: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      {["Report #45", "Report #46"].map((entry) => (
        <div key={entry} className="g6-mod-row">
          <Bar width="50%" />
          <div className="g6-row g6-gap-xxs">
            <button className="g6-btn ghost">Approve</button>
            <button className="g6-btn ghost">Deny</button>
          </div>
        </div>
      ))}
    </div>
  ),
  pv_mock_feedback_inbox: () => (
    <div className="g6-preview g6-col g6-gap-xxs">
      <Bar width="60%" />
      <div className="g6-row g6-gap-xs">
        <button className="g6-btn ghost">Keep</button>
        <button className="g6-btn ghost">Discard</button>
      </div>
    </div>
  ),
  pv_mock_release_toggle: () => (
    <div className="g6-preview g6-row g6-gap-sm g6-center">
      <Pill label="Staging" />
      <div className="g6-toggle on">
        <div className="g6-toggle-thumb" />
      </div>
      <Pill label="Prod" />
    </div>
  ),
};

const renderPreview = (previewId: string) => {
  const fn = previewRenderers[previewId];
  return fn ? fn() : <div className="g6-preview g6-fallback" />;
};

export default function GamifiedTab6() {
  return (
    <div className="g6-root">
      <header className="g6-intro">
        <div>
          <h2>Gamified 6</h2>
          <p className="g6-sub">50 mock UI widgets spanning profile, guild, tables, upload, and admin snippets.</p>
        </div>
        <div className="g6-pill-row">
          <Pill label="MOCK" />
        </div>
      </header>

      <nav className="g6-toc">
        {categories.map((cat) => (
          <a key={cat.id} href={`#${cat.id}`} className="g6-toc-link">
            {cat.title}
          </a>
        ))}
      </nav>

      <div className="g6-sections">
        {categories.map((cat) => (
          <details key={cat.id} className="g6-section" open id={cat.id}>
            <summary className="g6-section-header">
              <div>
                <div className="g6-section-title">{cat.title}</div>
                <div className="g6-section-sub">{cat.description}</div>
              </div>
              <span className="g6-summary-line">{cat.items.length} items</span>
            </summary>

            <div className="g6-grid">
              {cat.items.map((item) => (
                <div key={item.id} className="g6-card">
                  <div className="g6-card-head">
                    <div>
                      <div className="g6-card-title">{item.title}</div>
                      <div className="g6-card-sub">{item.subtitle}</div>
                    </div>
                    <div className="g6-pill-row">
                      {(item.tags || ["MOCK"]).map((tag) => (
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
