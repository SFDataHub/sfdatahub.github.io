import React from "react";
import { Link } from "react-router-dom";
import { BarChart3, ListOrdered, Compass, BookOpen, HeartHandshake, FolderSearch } from "lucide-react";

/**
 * Button-Kachel (lokal für diese Seite)
 * - size "s" | "m" | "l" steuert grid spans (FIFA-Style)
 * - klare Abstände über Grid-Gap + Schatten, damit nichts "überlappt"
 */
function TileButton({
  to, title, desc, icon, size = "s",
}: {
  to: string;
  title: string;
  desc?: string;
  icon?: React.ReactNode;
  size?: "s" | "m" | "l";
}) {
  const span = size === "l" ? { col: 2, row: 2 } : size === "m" ? { col: 2, row: 1 } : { col: 1, row: 1 };

  return (
    <Link
      to={to}
      role="button"
      aria-label={title}
      className="block rounded-2xl border p-4 transition"
      style={{
        // Button-Optik
        borderColor: "var(--line, #2C4A73)",
        background: "var(--tile, #152A42)",
        boxShadow: "0 8px 18px rgba(0,0,0,.28)",
        // Abstand / Größe im Grid
        gridColumn: `span ${span.col}`,
        gridRow: `span ${span.row}`,
      }}
      onMouseDown={(e) => {
        // kleines Button-Feedback
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(1px)";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow =
          "0 8px 18px rgba(0,0,0,.28), 0 0 0 2px rgba(92,139,198,.45)";
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 8px 18px rgba(0,0,0,.28)";
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon && <span style={{ opacity: 0.9 }}>{icon}</span>}
        <h2 className="font-medium">{title}</h2>
      </div>
      {desc && <p className="text-sm" style={{ opacity: 0.75 }}>{desc}</p>}
    </Link>
  );
}

export default function Home() {
  return (
    <section className="p-4">
      <h1>Home</h1>

      {/* Grid mit klaren Abständen – keine Überlagerung */}
      <div
        className="mt-3"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gridAutoRows: 120,
          gap: 12, // Abstand zwischen den Kacheln (Buttons)
        }}
      >
        {/* Große Dashboard-Kachel */}
        <TileButton
          to="/dashboard"
          title="Dashboard"
          desc="Meine KPIs & Widgets"
          icon={<BarChart3 size={16} />}
          size="l"
        />

        {/* Zwei mittelgroße */}
        <TileButton
          to="/toplists"
          title="Toplisten"
          desc="Players, Guilds, Servers, Classes"
          icon={<ListOrdered size={16} />}
          size="m"
        />
        <TileButton
          to="/explore"
          title="Explore"
          desc="Suche, Profile, Scans"
          icon={<Compass size={16} />}
          size="m"
        />

        {/* Normale Buttons */}
        <TileButton
          to="/guides"
          title="Guides"
          desc="Fortress, AM, Dungeons, Events…"
          icon={<BookOpen size={16} />}
        />
        <TileButton
          to="/community"
          title="Community"
          desc="Scans, Predictions, Creator Hub"
          icon={<HeartHandshake size={16} />}
        />
        <TileButton
          to="/scans"
          title="Scans"
          desc="Latest, Archive, Import"
          icon={<FolderSearch size={16} />}
        />
      </div>
    </section>
  );
}
