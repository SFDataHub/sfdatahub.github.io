import React, { useMemo } from "react";
import { useFilters } from "./FilterContext";

// Wenn du eine globale Serverliste hast, kannst du sie importieren
// import { SERVERS } from "../../data/servers";

type Server = {
  id: string | number;
  name: string;
  region: string;   // "EU" | "US" | "INT" | ...
};

// Fallback-Regionen-Reihenfolge (falls nichts geliefert wird)
const DEFAULT_REGIONS: string[] = ["EU", "US", "INT", "FUS", "EUS", "S1", "S2"];

export default function ServerSheet() {
  // Safe destructuring – niemals crasht wenn Kontext noch nicht fertig ist
  const filters = useFilters();
  if (!filters) return null;

  // Versuche, die Werte aus deinem Filter-Context zu lesen.
  // ALLES mit Default-Werten schützen.
  const {
    bottomFilterOpen = false,
    setBottomFilterOpen = () => {},
    selectedServers = [],
    setSelectedServers = () => {},
    // Falls du irgendwo eine Serverliste aus dem Kontext hast, zieh sie heran:
    servers = [], // <--- passe das ggf. an deinen Context an
    // oder nimm zur Not eine importierte Konstante:
    // servers = SERVERS ?? [],
  } = (filters as any) ?? {};

  // Gruppierung nach Region – immer ein Objekt zurückgeben
  const byRegion: Record<string, Server[]> = useMemo(() => {
    const list: Server[] = Array.isArray(servers) ? servers : [];
    return list.reduce<Record<string, Server[]>>((acc, s) => {
      const r = (s?.region ?? "").toString().toUpperCase();
      if (!acc[r]) acc[r] = [];
      acc[r].push(s);
      return acc;
    }, {});
  }, [servers]);

  // Regionsreihenfolge – falls keine Daten: DEFAULT_REGIONS
  const regions: string[] = useMemo(() => {
    const keys = Object.keys(byRegion);
    return keys.length ? keys.sort() : DEFAULT_REGIONS;
  }, [byRegion]);

  const isSelected = (id: Server["id"]) =>
    Array.isArray(selectedServers) && selectedServers.includes(id);

  const toggleServer = (srv: Server) => {
    const current = Array.isArray(selectedServers) ? selectedServers : [];
    if (current.includes(srv.id)) {
      setSelectedServers(current.filter((x: any) => x !== srv.id));
    } else {
      setSelectedServers([...current, srv.id]);
    }
  };

  const close = () => setBottomFilterOpen(false);

  // Wenn das Sheet nicht offen ist, gar nichts rendern
  if (!bottomFilterOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end md:items-center md:justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={close}
        aria-hidden="true"
      />

      {/* Sheet/Card */}
      <div
        className="relative w-full md:w-[800px] max-w-[95vw] max-h-[85vh] overflow-hidden rounded-2xl border"
        style={{ borderColor: "#2B4C73", background: "#152A42" }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "#2B4C73", background: "#1A2F4A" }}
        >
          <div className="font-semibold text-white">Server auswählen</div>
          <button
            onClick={close}
            className="rounded-lg border px-3 py-1.5 text-sm text-white"
            style={{ borderColor: "#2B4C73", background: "#14273E" }}
          >
            Schließen
          </button>
        </div>

        {/* Inhalt – eigener Scrollbereich */}
        <div className="p-4 overflow-y-auto no-scrollbar max-h-[calc(85vh-56px)]">
          {/* Regionen-Listen – defensiv */}
          {regions.map((region) => {
            const list: Server[] = byRegion?.[region] ?? [];
            if (!list.length) {
              // Keine Server in dieser Region – überspringen
              return null;
            }

            return (
              <div key={region} className="mb-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#B0C4D9]">
                  {region}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {list.map((srv) => {
                    const active = isSelected(srv.id);
                    return (
                      <button
                        key={srv.id}
                        onClick={() => toggleServer(srv)}
                        className="flex items-center justify-between rounded-lg border px-3 py-2 text-left"
                        style={{
                          borderColor: active ? "#5C8BC6" : "#2B4C73",
                          background: active ? "#25456B" : "#14273E",
                          color: "#F5F9FF",
                        }}
                      >
                        <span className="truncate">{srv.name}</span>
                        {active && (
                          <span
                            className="ml-3 rounded px-1.5 text-[10px]"
                            style={{ background: "#5C8BC6", color: "#0B1A2B" }}
                          >
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Falls gar keine Regionen/Server vorhanden sind */}
          {Object.keys(byRegion).length === 0 && (
            <div className="text-sm text-[#B0C4D9]">
              Keine Serverdaten vorhanden.
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t px-4 py-3"
          style={{ borderColor: "#2B4C73", background: "#1A2F4A" }}
        >
          <button
            onClick={close}
            className="rounded-lg border px-3 py-1.5 text-sm text-white"
            style={{ borderColor: "#2B4C73", background: "#14273E" }}
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
