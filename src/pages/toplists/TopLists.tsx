import React from "react";
import { Link } from "react-router-dom";
import { Users, Shield, Server, ListOrdered } from "lucide-react";

function Tile({ to, title, desc, icon }: { to: string; title: string; desc?: string; icon?: React.ReactNode }) {
  return (
    <Link to={to} className="block rounded-2xl border p-4 hover:opacity-95" style={{ borderColor: "var(--line, #2C4A73)" }}>
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="opacity-80">{icon}</span>}
        <h2 className="font-medium">{title}</h2>
      </div>
      {desc && <p className="text-sm opacity-75">{desc}</p>}
    </Link>
  );
}

export default function Toplists() {
  return (
    <section className="p-4">
      <h1>Toplisten</h1>
      <div
        className="grid gap-3 mt-3"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        <Tile to="/toplists?tab=players" title="Players" desc="Ranglisten für Spieler" icon={<Users size={16} />} />
        <Tile to="/toplists?tab=guilds" title="Guilds" desc="Ranglisten für Gilden" icon={<Shield size={16} />} />
        <Tile to="/toplists?tab=servers" title="Servers" desc="Server-Rankings" icon={<Server size={16} />} />
        <Tile to="/toplists?tab=classes" title="Classes" desc="Klassen-Fokus" icon={<ListOrdered size={16} />} />
      </div>
    </section>
  );
}
