import React from "react";
import { Link } from "react-router-dom";
import { Gauge, Activity, TrendingUp, Users, Shield, Server } from "lucide-react";

function Tile({
  to, title, desc, icon, size = "s",
}: {
  to: string; title: string; desc?: string; icon?: React.ReactNode; size?: "s" | "m" | "l";
}) {
  const span = size === "l" ? { col: 2, row: 2 } : size === "m" ? { col: 2, row: 1 } : { col: 1, row: 1 };
  return (
    <Link
      to={to}
      className="block rounded-2xl border p-4 hover:opacity-95"
      style={{
        borderColor: "var(--line, #2C4A73)",
        background: "var(--tile, #152A42)",
        gridColumn: `span ${span.col}`,
        gridRow: `span ${span.row}`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="opacity-80">{icon}</span>}
        <h2 className="font-medium">{title}</h2>
      </div>
      {desc && <p className="text-sm opacity-75">{desc}</p>}
    </Link>
  );
}

export default function Dashboard() {
  return (
    <section className="p-4">
      <h1>Dashboard</h1>
      <div
        className="grid gap-3 mt-3"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gridAutoRows: 120,
        }}
      >
        <Tile to="/insights/dashboards" title="KPIs" desc="Global Overview" icon={<Gauge size={16}/>} size="l" />
        <Tile to="/insights/activity"  title="Activity" desc="Deltas & Heatmap" icon={<Activity size={16}/>} size="m" />
        <Tile to="/insights/progression" title="Progression" desc="Level/Album" icon={<TrendingUp size={16}/>} size="m" />
        <Tile to="/toplists?tab=players" title="Top Players" icon={<Users size={16}/>} size="s" />
        <Tile to="/toplists?tab=guilds"  title="Top Guilds" icon={<Shield size={16}/>} size="s" />
        <Tile to="/toplists?tab=servers" title="Top Servers" icon={<Server size={16}/>} size="s" />
      </div>
    </section>
  );
}
