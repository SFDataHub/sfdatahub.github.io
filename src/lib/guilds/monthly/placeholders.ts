import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase"; // <- bestehende DB nutzen
import type { MonthKey } from "./types";

// kleine Utils
const CANON = (s: string) => s.toLowerCase().replace(/[\s_\u00a0]+/g, "");
const pickByCanon = (row: Record<string, any>, keyCanon: string): any => {
  for (const k of Object.keys(row)) if (CANON(k) === keyCanon) return row[k];
  return undefined;
};
const toSec = (v: any): number | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  if (/^\d{10}$/.test(s)) return Number(s);
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};
export const monthKeyFromSec = (sec: number): MonthKey => {
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}` as MonthKey;
};

/**
 * Legt Platzhalter für Monatsdokument + Baseline an, falls noch nicht vorhanden.
 * Überschreibt nichts – dient nur dazu, dass das UI ohne Fehler lesen kann.
 */
export async function writeMonthlyPlaceholdersFromRows(
  playersRows: Array<Record<string, any>>,
  guildsRows: Array<Record<string, any>>
) {
  // Spaltenkanon
  const COL = {
    GUILD_IDENTIFIER: CANON("Guild Identifier"),
    TIMESTAMP: CANON("Timestamp"),
  };

  type Info = { guildId: string; tsSec: number };
  const byGuild = new Map<string, Info>();

  // Guilds-CSV priorisieren
  for (const r of guildsRows) {
    const gid = pickByCanon(r, COL.GUILD_IDENTIFIER);
    if (!gid) continue;
    const ts = toSec(pickByCanon(r, COL.TIMESTAMP)) ?? Math.floor(Date.now() / 1000);
    const cur = byGuild.get(String(gid));
    if (!cur || ts > cur.tsSec) byGuild.set(String(gid), { guildId: String(gid), tsSec: ts });
  }
  // Players-CSV fallback
  for (const r of playersRows) {
    const gid = pickByCanon(r, COL.GUILD_IDENTIFIER);
    if (!gid) continue;
    const ts = toSec(pickByCanon(r, COL.TIMESTAMP)) ?? Math.floor(Date.now() / 1000);
    const cur = byGuild.get(String(gid));
    if (!cur || ts > cur.tsSec) byGuild.set(String(gid), { guildId: String(gid), tsSec: ts });
  }

  const ops: Promise<any>[] = [];
  for (const { guildId, tsSec } of byGuild.values()) {
    const key = monthKeyFromSec(tsSec);
    const tsMs = tsSec * 1000;

    // Monatsdokument direkt unter history_monthly/{YYYY-MM}
    const monthRef = doc(db, `guilds/${guildId}/history_monthly/${key}`);
    ops.push(
      (async () => {
        const snap = await getDoc(monthRef);
        if (!snap.exists()) {
          await setDoc(
            monthRef,
            {
              meta: {
                monthKey: key,
                label: new Date(`${key}-01T00:00:00Z`).toLocaleString("de-DE", {
                  month: "short",
                  year: "numeric",
                }),
                fromISO: new Date(tsMs).toISOString(),
                toISO: new Date(tsMs).toISOString(),
                fromTs: tsSec,
                toTs: tsSec,
                daysSpan: 0,
                guildId,
              },
              status: { available: false, reason: "INSUFFICIENT_DATA" },
            },
            { merge: false }
          );
        }
      })()
    );

    // Baseline-Doc (snapshots/members_summary_first)
    const firstRef = doc(
      db,
      `guilds/${guildId}/history_monthly/${key}/snapshots/members_summary_first`
    );
    ops.push(
      (async () => {
        const fsnap = await getDoc(firstRef);
        if (!fsnap.exists()) {
          await setDoc(
            firstRef,
            {
              guildId,
              updatedAtMs: tsMs,
              placeholder: true,
            },
            { merge: false }
          );
        }
      })()
    );
  }

  await Promise.all(ops);
}
