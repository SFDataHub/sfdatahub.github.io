import React from "react";

const layout: Record<string, React.CSSProperties> = {
  wrap: { color: "#F5F9FF" },
  intro: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 },
  card: {
    background: "#152A42",
    border: "1px solid #2C4A73",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 20px rgba(0,0,0,.25)",
    minHeight: 160,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sub: { color: "#B0C4D9", fontSize: 13, lineHeight: 1.4 },
  badgeRow: { display: "flex", gap: 6, flexWrap: "wrap" },
};

const chip = (label: string, tone = "#1E3A5C") => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      fontSize: 11,
      borderRadius: 999,
      background: tone,
      border: "1px solid rgba(255,255,255,.12)",
      color: "#D9E7FF",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    }}
  >
    {label}
  </span>
);

const sectionTagRow = () => (
  <div style={layout.badgeRow}>
    {chip("mock")}
    {chip("concept", "#234569")}
    {chip("ui", "#1F4D67")}
  </div>
);

const rarityColor: Record<string, string> = {
  common: "#1f3b5d",
  rare: "#234f7a",
  epic: "#3c2f6d",
  legendary: "#6b3b0f",
};

export default function GamifiedTab() {
  const achievements = [
    { title: "Data Whisperer", rarity: "epic", status: "Unlocked" },
    { title: "Perfect Sync", rarity: "rare", status: "Unlocked" },
    { title: "Zero Downtime", rarity: "legendary", status: "Locked" },
    { title: "Scout Elite", rarity: "common", status: "Unlocked" },
    { title: "API Ranger", rarity: "rare", status: "Locked" },
    { title: "Schema Sleuth", rarity: "epic", status: "Unlocked" },
  ];

  const quests = [
    { title: "Scan 10 servers", status: "Done", reward: "+250 XP" },
    { title: "Fix 3 warnings", status: "In progress", reward: "+1 reroll" },
    { title: "Share a dashboard", status: "Ready", reward: "Title shard" },
    { title: "Hit uptime streak", status: "Locked", reward: "Glow badge" },
  ];

  const ladder = [
    { tier: "Mythic", delta: "+2", trend: "up" },
    { tier: "Diamond", delta: "-1", trend: "down" },
    { tier: "Platinum", delta: "+4", trend: "up" },
    { tier: "Gold", delta: "0", trend: "flat" },
  ];

  const milestones = [
    { label: "Level 12", done: true },
    { label: "Sync Master", done: true },
    { label: "API Adept", done: false },
    { label: "Data Virtuoso", done: false },
  ];

  const passLevels = [
    { level: 1, reward: "Theme Skin", unlocked: true },
    { level: 4, reward: "Badge Token", unlocked: true },
    { level: 7, reward: "Loot Cache", unlocked: false },
    { level: 10, reward: "Mythic Frame", unlocked: false },
  ];

  const loot = [
    { label: "Common", value: 32, color: "#1e3b5d" },
    { label: "Rare", value: 28, color: "#1f5d77" },
    { label: "Epic", value: 22, color: "#3c2f6d" },
    { label: "Legendary", value: 18, color: "#6b3b0f" },
  ];

  const skillNodes = [
    { name: "Link Speed", state: "active" },
    { name: "Alert Vision", state: "active" },
    { name: "Schema Insight", state: "locked" },
    { name: "API Armor", state: "active" },
    { name: "Sync Surge", state: "active" },
    { name: "Data Forge", state: "locked" },
    { name: "Audit Ghost", state: "locked" },
    { name: "Chronicle", state: "locked" },
  ];

  return (
    <div style={layout.wrap}>
      <div style={layout.intro}>
        <div>
          <h2 style={{ margin: 0, color: "#F5F9FF" }}>Gamified Visuals</h2>
          <p style={layout.sub}>Static showcase of badges, streaks, ladders, and tracks in SFDataHub styling.</p>
        </div>
        {sectionTagRow()}
      </div>

      <div style={layout.grid}>
        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Achievement Badges</div>
              <div style={layout.sub}>Unlocked vs. locked set with rarity color tags.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {achievements.map((a) => (
              <div
                key={a.title}
                style={{
                  border: "1px dashed rgba(255,255,255,.15)",
                  borderRadius: 12,
                  padding: 10,
                  background: "rgba(255,255,255,.02)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{a.title}</div>
                <div style={layout.badgeRow}>
                  {chip(a.status, a.status === "Unlocked" ? "#1f4f62" : "#422b2b")}
                  {chip(a.rarity, rarityColor[a.rarity])}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...layout.card, background: "linear-gradient(145deg, #143257, #0f243d)" }}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Scan Streak</div>
              <div style={layout.sub}>Keep the flame alive with consistent daily scans.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div
            style={{
              background: "rgba(0,0,0,.25)",
              borderRadius: 12,
              padding: 12,
              border: "1px solid rgba(255,255,255,.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#B0C4D9" }}>Current streak</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>12 days 🔥</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#B0C4D9" }}>Best streak</div>
              <div style={{ fontWeight: 700 }}>21 days</div>
              <div style={{ marginTop: 6, background: "#0e1e33", borderRadius: 999, padding: "4px 10px" }}>
                +3d buffer
              </div>
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#B0C4D9" }}>Next reward: Ember Frame at 14 days.</div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Quest Log</div>
              <div style={layout.sub}>Short mission stack with rewards.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {quests.map((q) => (
              <div
                key={q.title}
                style={{
                  borderRadius: 10,
                  padding: 10,
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid rgba(255,255,255,.08)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{q.title}</div>
                  <div style={{ fontSize: 12, color: "#B0C4D9" }}>{q.reward}</div>
                </div>
                {chip(q.status, q.status === "Done" ? "#1f4f62" : q.status === "In progress" ? "#4f3b1f" : "#3a2f4f")}
              </div>
            ))}
          </div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Trophy Podium</div>
              <div style={layout.sub}>Top 3 snapshot with podium heights.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, justifyContent: "space-around", paddingTop: 8 }}>
            {[{ rank: 2, height: 60 }, { rank: 1, height: 90 }, { rank: 3, height: 45 }].map((p) => (
              <div key={p.rank} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#B0C4D9" }}>#{p.rank}</div>
                <div
                  style={{
                    width: 70,
                    height: p.height,
                    background: p.rank === 1 ? "linear-gradient(180deg,#f5d26b,#b87b1a)" : "linear-gradient(180deg,#345a8a,#203752)",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,.2)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    color: p.rank === 1 ? "#1a1a1a" : "#F5F9FF",
                  }}
                >
                  S{p.rank}
                </div>
                <div style={{ marginTop: 4, fontSize: 12 }}>Squad {p.rank}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Rank Ladder</div>
              <div style={layout.sub}>League rungs with movement delta.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {ladder.map((item) => (
              <div
                key={item.tier}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,.02)",
                }}
              >
                <div style={{ fontWeight: 700 }}>{item.tier}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#B0C4D9" }}>{item.delta}</span>
                  <span style={{ color: item.trend === "up" ? "#5AD8A6" : item.trend === "down" ? "#E06C75" : "#B0C4D9" }}>
                    {item.trend === "up" ? "▲" : item.trend === "down" ? "▼" : "•"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Milestone Timeline</div>
              <div style={layout.sub}>Linear track with unlocked markers.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ position: "relative", padding: "10px 4px 0" }}>
            <div style={{ position: "absolute", top: 22, left: 0, right: 0, height: 2, background: "rgba(255,255,255,.12)" }} />
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${milestones.length}, 1fr)`, gap: 6, position: "relative" }}>
              {milestones.map((m) => (
                <div key={m.label} style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      margin: "0 auto",
                      borderRadius: "50%",
                      background: m.done ? "#2d7f5f" : "#2f415e",
                      border: "2px solid rgba(255,255,255,.1)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {m.done ? "✓" : "•"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Collection Ring</div>
              <div style={layout.sub}>Donut visualization for scrapbook completion.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "conic-gradient(#3c7bd9 0% 68%, #1d3051 68% 100%)",
                display: "grid",
                placeItems: "center",
                border: "1px solid rgba(255,255,255,.08)",
              }}
            >
              <div
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: "50%",
                  background: "#0f1e33",
                  display: "grid",
                  placeItems: "center",
                  color: "#F5F9FF",
                  fontWeight: 800,
                }}
              >
                68%
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={layout.badgeRow}>
                {chip("Unlocked 45/66", "#1f4f62")}
                {chip("Sets: 6", "#2a3f68")}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#B0C4D9" }}>
                Next reward at 75%: Chronicle stencil frame.
              </div>
            </div>
          </div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Boss HP · Goal Bar</div>
              <div style={layout.sub}>Progress toward the next major unlock.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ background: "#0f1f33", borderRadius: 12, padding: 10, border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#B0C4D9" }}>
              <span>Phase 2/3</span>
              <span>82% to go</span>
            </div>
            <div style={{ height: 22, borderRadius: 10, overflow: "hidden", marginTop: 6, border: "1px solid rgba(255,255,255,.1)" }}>
              <div
                style={{
                  width: "18%",
                  height: "100%",
                  background: "linear-gradient(90deg, #d95f5f, #f2a45d)",
                  boxShadow: "0 0 12px rgba(242,164,93,.4)",
                }}
              />
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#B0C4D9" }}>Next shield break at 25% HP.</div>
          </div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Skill Tree Mini</div>
              <div style={layout.sub}>Node states with locked paths.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
            {skillNodes.map((node) => (
              <div
                key={node.name}
                style={{
                  background: "rgba(255,255,255,.03)",
                  borderRadius: 10,
                  border: `1px solid ${node.state === "active" ? "rgba(90,216,166,.4)" : "rgba(255,255,255,.08)"}`,
                  padding: 10,
                  boxShadow: node.state === "active" ? "0 0 12px rgba(90,216,166,.25)" : "none",
                }}
              >
                <div style={{ fontSize: 12, color: "#B0C4D9" }}>{node.state === "active" ? "Unlocked" : "Locked"}</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{node.name}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#B0C4D9" }}>Path glow = active; darker cells stay locked.</div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Season Pass Track</div>
              <div style={layout.sub}>Horizontal progression with staged rewards.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <div style={{ flex: 1, height: 10, borderRadius: 999, background: "#0f1f33", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "45%", background: "linear-gradient(90deg,#2a7bbd,#54c9e7)" }} />
            </div>
            {chip("45%", "#1f4f62")}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto" }}>
            {passLevels.map((lvl) => (
              <div
                key={lvl.level}
                style={{
                  minWidth: 120,
                  background: "rgba(255,255,255,.03)",
                  borderRadius: 12,
                  padding: 10,
                  border: `1px solid ${lvl.unlocked ? "rgba(84,201,231,.4)" : "rgba(255,255,255,.08)"}`,
                }}
              >
                <div style={{ fontSize: 12, color: "#B0C4D9" }}>Level {lvl.level}</div>
                <div style={{ fontWeight: 700 }}>{lvl.reward}</div>
                <div style={{ marginTop: 6 }}>{chip(lvl.unlocked ? "Claimed" : "Locked", lvl.unlocked ? "#1f4f62" : "#2f2f4f")}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Title Plates</div>
              <div style={layout.sub}>Unlockable nameplates with rarity glow.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              { name: "Data Pioneer", tone: "linear-gradient(90deg,#2f5b90,#1f3d68)", rarity: "rare" },
              { name: "Mythic Cartographer", tone: "linear-gradient(90deg,#6b3b0f,#b87b1a)", rarity: "legendary" },
              { name: "Night Runner", tone: "linear-gradient(90deg,#28354f,#1a2335)", rarity: "common" },
            ].map((title) => (
              <div
                key={title.name}
                style={{
                  borderRadius: 12,
                  padding: 12,
                  background: title.tone,
                  border: "1px solid rgba(255,255,255,.12)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 800 }}>{title.name}</div>
                {chip(title.rarity, rarityColor[title.rarity] || "#234569")}
              </div>
            ))}
          </div>
        </div>

        <div style={layout.card}>
          <div style={layout.header}>
            <div>
              <div style={{ fontWeight: 700 }}>Loot / Rarity Mix</div>
              <div style={layout.sub}>Stacked distribution snapshot.</div>
            </div>
            {sectionTagRow()}
          </div>
          <div style={{ height: 24, borderRadius: 12, overflow: "hidden", display: "flex", border: "1px solid rgba(255,255,255,.08)" }}>
            {loot.map((slice) => (
              <div
                key={slice.label}
                style={{
                  width: `${slice.value}%`,
                  background: slice.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  color: "#DAE8FF",
                  borderRight: "1px solid rgba(255,255,255,.05)",
                }}
              >
                {slice.value}%
              </div>
            ))}
          </div>
          <div style={layout.badgeRow}>
            {loot.map((slice) => (
              <span
                key={slice.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.08)",
                  fontSize: 12,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: slice.color, display: "inline-block" }} />
                {slice.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
