import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import type { MembersSummaryDoc, MonthKey, ProgressDoc } from "./types";

export function monthKeyFromMs(ms: number): MonthKey {
  const d = new Date(ms); const y = d.getUTCFullYear(); const m = String(d.getUTCMonth()+1).padStart(2,"0");
  return `${y}-${m}` as MonthKey;
}

// Baseline sichern/aktualisieren (first-of-month)
// - wenn nicht vorhanden -> setzen
// - wenn vorhandenes first jünger ist als newTsMs -> nichts ändern
// - wenn vorhandenes first älter ist als newTsMs -> nichts ändern
// - wenn vorhandenes first jünger ist als ein rückwirkender Import -> ersetzen
export async function ensureFirstOfMonth(
  guildId: string,
  monthKey: MonthKey,
  latest: MembersSummaryDoc,
  newTsMs: number
): Promise<{ first: MembersSummaryDoc | null; firstTsMs: number | null }> {
  const firstRef = doc(db, `guilds/${guildId}/history_monthly/${monthKey}/snapshots/members_summary_first`);
  const snap = await getDoc(firstRef);

  if (!snap.exists()) {
    await setDoc(firstRef, latest, { merge: false });
    return { first: latest, firstTsMs: latest.updatedAtMs ?? (latest.timestamp ? latest.timestamp*1000 : newTsMs) };
  }

  const existing = snap.data() as MembersSummaryDoc;
  const existingTsMs = existing.updatedAtMs ?? (existing.timestamp ? existing.timestamp*1000 : newTsMs);

  if (newTsMs < existingTsMs) { // rückwirkender älterer Import -> first vorziehen
    await setDoc(firstRef, latest, { merge: false });
    return { first: latest, firstTsMs: latest.updatedAtMs ?? (latest.timestamp ? latest.timestamp*1000 : newTsMs) };
  }
  return { first: existing, firstTsMs: existingTsMs };
}

// Monatsdokument schreiben/aktualisieren
export async function writeMonthlyDoc(guildId: string, monthKey: MonthKey, payload: ProgressDoc) {
  const monthRef = doc(db, `guilds/${guildId}/history_monthly/${monthKey}`);
  await setDoc(monthRef, payload, { merge: true });
}
