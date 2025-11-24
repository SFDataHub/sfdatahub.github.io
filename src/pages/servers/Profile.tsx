// src/pages/servers/Profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import ContentShell from "../../components/ContentShell";

const PALETTE = {
  tileAlt: "var(--tile, #14273E)",
  line: "var(--line, #2C4A73)",
  title: "var(--title, #F5F9FF)",
  textSoft: "var(--text-soft, #B0C4D9)",
  active: "var(--active, #2D4E78)",
};

type ServerDoc = {
  active?: boolean;
  code?: string;
  displayName?: string;
  host?: string;
  numericId?: number;
  region?: string;
  type?: string;
};

function Container({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px", ...style }}>{children}</div>;
}

function ServerIcon({ size = 36 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, display: "grid", placeItems: "center" }} aria-hidden>
      <div
        style={{
          width: "100%",
          height: "100%",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.28))",
          display: "grid",
          placeItems: "center",
          fontSize: Math.round(size * 0.72),
        }}
      >
        🌐
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        background: PALETTE.tileAlt,
        border: `1px solid ${PALETTE.line}`,
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ fontSize: 12, color: PALETTE.textSoft, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, color: PALETTE.title, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

/** Varianten aus URL ableiten: "eu1" -> ["EU1", "EU 1", "eu1", "eu 1", "s1.sfgame.eu"] */
function serverIdVariants(raw: string): string[] {
  const t = raw.trim();
  const up = t.toUpperCase();
  const low = t.toLowerCase();
  const spacedUp = up.replace(/^([A-Z]{2,})(\d{1,3})$/, "$1 $2");
  const spacedLow = low.replace(/^([a-z]{2,})(\d{1,3})$/, "$1 $2");
  let hostGuess = "";
  const m = up.match(/^([A-Z]{2})(\d{1,3})$/);
  if (m) {
    const reg = m[1];
    const num = String(parseInt(m[2], 10));
    const tld = reg === "EU" ? "eu" : reg === "US" ? "us" : reg === "AM" ? "net" : reg.toLowerCase();
    hostGuess = `s${num}.sfgame.${tld}`;
  }
  return Array.from(new Set([t, up, low, spacedUp, spacedLow, hostGuess].filter(Boolean)));
}

export default function ServerProfilePage() {
  const params = useParams<Record<string, string>>();
  const navigate = useNavigate();
  const location = useLocation();

  const serverId = params.id || params.sid || params.serverId || params.server || "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [docData, setDocData] = useState<ServerDoc | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveAndLoad() {
      setLoading(true);
      setErr(null);
      setDocId(null);
      setDocData(null);

      try {
        const id = serverId.trim();
        if (!id) throw new Error("Kein Server gewählt.");

        // 1) Direkter Doc-Fetch (/servers/{id})
        const directRef = doc(db, `servers/${id}`);
        const directSnap = await getDoc(directRef);
        if (directSnap.exists()) {
          if (!cancelled) {
            setDocId(directSnap.id);
            setDocData(directSnap.data() as ServerDoc);
          }
          return;
        }

        // 2) Fallback-Strategie: code / displayName / host exakte Suche
        const col = collection(db, "servers");
        const variants = serverIdVariants(id);

        // Baue Queries
        const tries: Promise<any>[] = [];
        for (const v of variants) {
          tries.push(getDocs(query(col, where("code", "==", v), limit(1))));
          tries.push(getDocs(query(col, where("displayName", "==", v), limit(1))));
          tries.push(getDocs(query(col, where("host", "==", v), limit(1))));
        }

        const results = await Promise.allSettled(tries);
        let foundId: string | null = null;
        let foundData: ServerDoc | null = null;

        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const snap = r.value;
          if (!snap.empty) {
            const ds = snap.docs[0];
            foundId = ds.id;
            foundData = ds.data() as ServerDoc;
            break;
          }
        }

        if (!foundId || !foundData) throw new Error("Server nicht gefunden.");

        if (!cancelled) {
          setDocId(foundId);
          setDocData(foundData);
          // Auf kanonische ID umschreiben, wenn URL von der echten DocId abweicht
          if (foundId !== id) {
            navigate(`/server/${encodeURIComponent(foundId)}`, { replace: true, state: { from: location.pathname } });
          }
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Fehler beim Laden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolveAndLoad();
    return () => {
      cancelled = true;
    };
  }, [serverId, navigate, location.pathname]);

  const NotFound = useMemo(
    () => (
      <div style={{ padding: 24, color: PALETTE.textSoft }}>
        {err ?? "Unbekannter Fehler."}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => navigate("/")}
            style={{
              padding: "8px 12px",
              background: PALETTE.active,
              border: "none",
              color: "#fff",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Zur Startseite
          </button>
        </div>
      </div>
    ),
    [err, navigate]
  );

  if (loading) {
    return (
      <ContentShell title="Serverprofil" subtitle="Server, KPIs & Verlauf" centerFramed={false} padded>
        <div style={{ padding: 16, color: PALETTE.textSoft }}>Lade Serverprofil…</div>
      </ContentShell>
    );
  }

  if (!docData) {
    return (
      <ContentShell title="Serverprofil" subtitle="Server, KPIs & Verlauf" centerFramed={false} padded>
        {NotFound}
      </ContentShell>
    );
  }

  const name = docData.displayName || docData.code || docId || serverId;
  const status = docData.active === true ? "Aktiv" : docData.active === false ? "Inaktiv" : "—";

  return (
    <ContentShell title="Serverprofil" subtitle="Server, KPIs & Verlauf" centerFramed={false} padded>
      {/* Sticky Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "transparent",
          borderBottom: `1px solid ${PALETTE.line}`,
        }}
      >
        <Container style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <ServerIcon size={36} />
          <div>
            <div style={{ fontSize: 18, color: PALETTE.title, fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: 12, color: PALETTE.textSoft }}>
              {docData.host || "—"} • {docData.region || "—"} • {docData.type?.toUpperCase() || "—"}
            </div>
          </div>
        </Container>
      </div>

      <Container style={{ paddingTop: 12, paddingBottom: 24 }}>
        <div
          style={{
            background: PALETTE.tileAlt,
            padding: 15,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: `1px solid ${PALETTE.line}`,
            boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: PALETTE.title, fontSize: 24, fontWeight: 800 }}>{name}</h2>
            <div style={{ marginTop: 6, color: PALETTE.textSoft, fontSize: 13 }}>
              {docData.host || "—"} • {docData.region || "—"} • {docData.type?.toUpperCase() || "—"}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13 }}>
            <span style={{ color: PALETTE.textSoft }}>Status: {status}</span>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: docData.active ? "#4CAF50" : "#9E9E9E",
                marginLeft: 8,
              }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16, marginTop: 16 }}>
          <StatTile label="Code" value={docData.code || "—"} />
          <StatTile label="Host" value={docData.host || "—"} />
          <StatTile label="Region" value={docData.region || "—"} />
          <StatTile label="Typ" value={docData.type?.toUpperCase() || "—"} />
          <StatTile label="Numeric ID" value={docData.numericId ?? "—"} />
          <StatTile label="Status" value={status} />
        </div>

        <div
          style={{
            marginTop: 16,
            background: PALETTE.tileAlt,
            padding: 15,
            borderRadius: 12,
            border: `1px solid ${PALETTE.line}`,
            boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
            color: PALETTE.textSoft,
          }}
        >
          Platzhalter <b>Historie / Kennzahlen</b> – wenn du künftig Server-Statistiken speicherst,
          binden wir sie hier ein.
        </div>
      </Container>
    </ContentShell>
  );
}
