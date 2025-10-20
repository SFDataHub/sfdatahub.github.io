import React, { useMemo, useState } from "react";
import { Member, ViewMode, SortKey, SortDir } from "./types";
import { THEME, mergeTheme, timeAgo, sumBaseStats, strictSumBase } from "./utils";
import MemberDetailTop from "./MemberDetailTop";
import MemberListView from "./MemberListView";
import MemberCardGrid from "./MemberCardGrid";

export default function GuildMemberBrowser({
  members,
  defaultView = "list",
  defaultQuery = "",
  defaultSort = { key: "level", dir: "desc" },
  showControls = true,
  selectedId,
  onSelect,
  renderActions,
  renderKPIs,
  theme: themePatch,
}:{
  members: Member[];
  defaultView?: ViewMode;
  defaultQuery?: string;
  defaultSort?: { key: SortKey; dir: SortDir };
  showControls?: boolean;
  selectedId?: string;
  onSelect?: (m: Member) => void;
  renderActions?: (m: Member) => React.ReactNode;
  renderKPIs?: (m: Member) => React.ReactNode;
  theme?: Partial<typeof THEME>;
}) {
  const theme = useMemo(() => mergeTheme(THEME, themePatch), [themePatch]);
  const [view, setView] = useState<ViewMode>(defaultView);
  const [query, setQuery] = useState(defaultQuery);
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort.key);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSort.dir);
  const [internalSel, setInternalSel] = useState<string | undefined>(members[0]?.id);

  const selId = selectedId ?? internalSel;
  const setSel = (id: string) => {
    if (!selectedId) setInternalSel(id);
    const m = members.find(x => x.id === id);
    if (m && onSelect) onSelect(m);
  };

  // Suche NUR über name, class, role
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return members;
    return members.filter(m =>
      m.name.toLowerCase().includes(t) ||
      m.class.toLowerCase().includes(t) ||
      String(m.role).toLowerCase().includes(t)
    );
  }, [members, query]);

  // Sort: "sumBaseStats" nutzt jetzt strictSumBase(m) (gleich wie Top-Details)
  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    const val = (m: Member): any => {
      switch (sortKey) {
        case "sumBaseStats": {
          const sb = strictSumBase(m);
          return sb == null ? -Infinity : sb; // fehlende Werte ganz nach unten
        }
        case "totalStats": {
          // Fallback auf baseStats, falls totalStats fehlt
          return (m.totalStats ?? sumBaseStats(m.baseStats)) ?? -Infinity;
        }
        default:
          return (m as any)[sortKey];
      }
    };
    return [...filtered].sort((a, b) => {
      const A = val(a), B = val(b);
      if (A === B) return 0;
      return A > B ? mul : -mul;
    });
  }, [filtered, sortKey, sortDir]);

  const current = useMemo(() => sorted.find(m => m.id === selId) || sorted[0], [sorted, selId]);

  return (
    <div>
      {showControls && (
        <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4 rounded-2xl border p-4"
             style={{ background: theme.tile, borderColor: theme.border }}>
          <div className="flex items-center gap-2">
            <label className="text-sm w-24" style={{ color: theme.sub }}>View</label>
            <select value={view} onChange={e => setView(e.target.value as ViewMode)}
                    className="w-full rounded-xl border px-3 py-2 bg-transparent"
                    style={{ borderColor: theme.border }}>
              <option className="bg-slate-800" value="list">List</option>
              <option className="bg-slate-800" value="cards">Cards</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm w-24" style={{ color: theme.sub }}>Search</label>
            <input value={query} onChange={e => setQuery(e.target.value)}
                   placeholder="name / class / role"
                   className="w-full rounded-xl border px-3 py-2 bg-transparent placeholder-slate-400"
                   style={{ borderColor: theme.border }} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm w-24" style={{ color: theme.sub }}>Sort by</label>
            <select value={String(sortKey)} onChange={e => setSortKey(e.target.value as SortKey)}
                    className="w-full rounded-xl border px-3 py-2 bg-transparent"
                    style={{ borderColor: theme.border }}>
              <option className="bg-slate-800" value="level">Level</option>
              <option className="bg-slate-800" value="scrapbook">Scrapbook</option>
              <option className="bg-slate-800" value="name">Name</option>
              <option className="bg-slate-800" value="role">Role</option>
              <option className="bg-slate-800" value="sumBaseStats">Sum Base Stats</option>
              <option className="bg-slate-800" value="totalStats">Total Stats</option>
            </select>
            <button onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                    className="rounded-xl border px-3 py-2"
                    style={{ borderColor: theme.border }}>
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>
      )}

      {/* TOP DETAIL */}
      <MemberDetailTop
        member={current}
        actions={current && (renderActions ? renderActions(current) : (
          <div className="flex flex-wrap gap-2">
            <button className="text-xs rounded-lg border px-2.5 py-1.5" style={{ borderColor: theme.border }}>Profile</button>
            <button className="text-xs rounded-lg border px-2.5 py-1.5" style={{ borderColor: theme.border }}>Compare</button>
            <button className="text-xs rounded-lg border px-2.5 py-1.5" style={{ borderColor: theme.border }}>Message</button>
          </div>
        ))}
        extraKPIs={current && renderKPIs ? renderKPIs(current) : null}
        theme={theme}
      />

      {view === "list" ? (
        <MemberListView
          rows={sorted}
          selId={selId}
          onSelect={setSel}
          theme={theme}
          rightCols={(m) => (
            <>
              <div className="text-right text-sm">{m.level ?? "—"}</div>
              <div className="text-right text-xs" style={{ color: theme.sub }}>{timeAgo(m.lastOnline)}</div>
            </>
          )}
        />
      ) : (
        <MemberCardGrid
          rows={sorted}
          selId={selId}
          onSelect={setSel}
          theme={theme}
          footer={(m) => (
            <div className="flex items-center justify-between text-xs" style={{ color: theme.sub }}>
              <span>Last {timeAgo(m.lastOnline)}</span>
            </div>
          )}
        />
      )}
    </div>
  );
}
