import { doc, getDoc } from "firebase/firestore";
import {
  importCsvToDB,
  type ImportCsvOptions,
  type ImportReport,
  type ImportResultItem,
} from "../../lib/import/csv";
import { writeGuildSnapshotsFromRows } from "../../lib/import/importer";
import {
  monthKeyFromMs,
  ensureFirstOfMonth,
  computeProgressDoc,
  writeMonthlyDoc,
} from "../../lib/guilds/monthly";
import { db } from "../../lib/firebase";

type Row = Record<string, any>;

const CANON = (s: string) => s.toLowerCase().replace(/[\s_\u00a0]+/g, "");
const pickByCanon = (row: Row, canonKey: string): any => {
  for (const k of Object.keys(row)) if (CANON(k) === canonKey) return row[k];
  return undefined;
};

export type ImportSelectionPayload = {
  playersRows: Row[];
  guildsRows: Row[];
};

export type ImportRecordStatus = "created" | "duplicate" | "error";

export type ImportSelectionResult = {
  ok: boolean;
  players: ImportResultItem[];
  guilds: ImportResultItem[];
  reports: ImportReport[];
};

export async function importSelectionToDb(
  payload: ImportSelectionPayload,
  opts?: { onProgress?: ImportCsvOptions["onProgress"] },
): Promise<ImportSelectionResult> {
  const { playersRows, guildsRows } = payload;
  const reports: ImportReport[] = [];
  let players: ImportResultItem[] = [];
  let guilds: ImportResultItem[] = [];
  let ok = true;

  const emitProgress = opts?.onProgress
    ? (p: Parameters<NonNullable<ImportCsvOptions["onProgress"]>>[0], kind: "players" | "guilds") =>
        opts.onProgress?.({ ...p, kind })
    : undefined;

  try {
    const repGuilds = await importCsvToDB(null, {
      kind: "guilds",
      rows: guildsRows,
      onProgress: emitProgress ? (p) => emitProgress(p, "guilds") : undefined,
    } as ImportCsvOptions);
    reports.push(repGuilds);
    if (Array.isArray(repGuilds.guildResults)) {
      guilds = repGuilds.guildResults as ImportResultItem[];
    }
  } catch (error) {
    console.error("[ImportSelectionToDb] guild import error", error);
    ok = false;
  }

  try {
    const repPlayers = await importCsvToDB(null, {
      kind: "players",
      rows: playersRows,
      onProgress: emitProgress ? (p) => emitProgress(p, "players") : undefined,
    } as ImportCsvOptions);
    reports.push(repPlayers);
    if (Array.isArray(repPlayers.playerResults)) {
      players = repPlayers.playerResults as ImportResultItem[];
    }
  } catch (error) {
    console.error("[ImportSelectionToDb] player import error", error);
    ok = false;
  }

  try {
    await writeGuildSnapshotsFromRows(playersRows, guildsRows);
  } catch (error) {
    console.warn("[ImportSelectionToDb] writeGuildSnapshotsFromRows skipped", error);
    ok = false;
  }

  const gidSet = new Set<string>();
  for (const r of guildsRows) {
    const v = pickByCanon(r, CANON("Guild Identifier"));
    if (v) gidSet.add(String(v));
  }
  for (const r of playersRows) {
    const v = pickByCanon(r, CANON("Guild Identifier"));
    if (v) gidSet.add(String(v));
  }

  for (const guildId of gidSet) {
    const latestRef = doc(db, `guilds/${guildId}/snapshots/members_summary`);
    const latestSnap = await getDoc(latestRef);
    if (!latestSnap.exists()) continue;

    const latest = latestSnap.data() as any;
    const latestTsMs = Number(latest.updatedAtMs ?? (latest.timestamp ? latest.timestamp * 1000 : Date.now()));
    const monthKey = monthKeyFromMs(latestTsMs);

    let first: any = null;
    let firstTsMs: number | null = null;
    try {
      const res = await ensureFirstOfMonth(guildId, monthKey, latest, latestTsMs);
      first = res.first;
      firstTsMs = res.firstTsMs;
    } catch (error) {
      console.warn("[ImportSelectionToDb] ensureFirstOfMonth skipped", { guildId, monthKey, error });
    }

    const progress = computeProgressDoc({
      guildId,
      monthKey,
      server: latest.server ?? null,
      first,
      firstTsMs,
      latest,
      latestTsMs,
    });

    try {
      await writeMonthlyDoc(guildId, monthKey, progress);
    } catch (error) {
      console.warn("[ImportSelectionToDb] writeMonthlyDoc skipped", { guildId, monthKey, error });
    }
  }

  return { ok, players, guilds, reports };
}
