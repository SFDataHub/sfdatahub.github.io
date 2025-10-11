// src/lib/import/importer.ts
import {
  collection,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";
import type { CSVRow } from "./csv";

export type ImportKind = "players" | "guilds";

type AppConfig = {
  activePlayersCollection: string;
  playersLatestCollection: string;
  playersScansCollection: string;

  activeGuildsCollection: string;
  guildsLatestCollection: string;
  guildsScansCollection: string;

  csvMapping?: {
    players?: {
      serverHeader?: string;           // "Server"
      identifierHeader?: string;       // "Identifier"
      timestampHeader?: string;        // "Timestamp"
      guildIdentifierHeader?: string;  // "Guild Identifier"
      nameHeader?: string;             // "Name"
    };
    guilds?: {
      serverHeader?: string;           // "Server"
      guildIdentifierHeader?: string;  // "Guild Identifier"
      timestampHeader?: string;        // "Timestamp"
      nameHeader?: string;             // "Name"
    };
  };
};

async function readAppConfig(): Promise<AppConfig> {
  const ref = doc(collection(db, "metadata"), "app");
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("metadata/app not found");
  const d = snap.data() as any;

  // Fallbacks wie mit dir besprochen
  return {
    activePlayersCollection: d.activePlayersCollection ?? "players",
    playersLatestCollection: d.playersLatestCollection ?? "players_latest",
    playersScansCollection:  d.playersScansCollection  ?? "player_scans",

    activeGuildsCollection:  d.activeGuildsCollection  ?? "guilds",
    guildsLatestCollection:  d.guildsLatestCollection  ?? "guilds_latest",
    guildsScansCollection:   d.guildsScansCollection   ?? "guild_scans",

    csvMapping: {
      players: {
        serverHeader:           d.csvMapping?.players?.serverHeader           ?? "Server",
        identifierHeader:       d.csvMapping?.players?.identifierHeader       ?? "Identifier",
        timestampHeader:        d.csvMapping?.players?.timestampHeader        ?? "Timestamp",
        guildIdentifierHeader:  d.csvMapping?.players?.guildIdentifierHeader  ?? "Guild Identifier",
        nameHeader:             d.csvMapping?.players?.nameHeader             ?? "Name",
      },
      guilds: {
        serverHeader:           d.csvMapping?.guilds?.serverHeader            ?? "Server",
        guildIdentifierHeader:  d.csvMapping?.guilds?.guildIdentifierHeader   ?? "Guild Identifier",
        timestampHeader:        d.csvMapping?.guilds?.timestampHeader         ?? "Timestamp",
        nameHeader:             d.csvMapping?.guilds?.nameHeader              ?? "Name",
      },
    },
  };
}

const num = (v: any): number => {
  if (v === undefined || v === null) return 0;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
};

function playerKey(row: CSVRow, cfg: AppConfig): string {
  const sH = cfg.csvMapping?.players?.serverHeader!;
  const iH = cfg.csvMapping?.players?.identifierHeader!;
  const sv = (row[sH] ?? "").trim();
  const id = (row[iH] ?? "").trim();
  return `${sv}|${id}`.toLowerCase();
}
function guildKey(row: CSVRow, cfg: AppConfig): string {
  const sH = cfg.csvMapping?.guilds?.serverHeader!;
  const gH = cfg.csvMapping?.guilds?.guildIdentifierHeader!;
  const sv = (row[sH] ?? "").trim();
  const gid = (row[gH] ?? "").trim();
  return `${sv}|${gid}`.toLowerCase();
}

async function writeLatest(kind: ImportKind, row: CSVRow, cfg: AppConfig) {
  const isPlayer = kind === "players";
  const tsH = isPlayer
    ? cfg.csvMapping?.players?.timestampHeader!
    : cfg.csvMapping?.guilds?.timestampHeader!;
  const latestCol = collection(
    db,
    isPlayer ? cfg.playersLatestCollection : cfg.guildsLatestCollection
  );

  const key = isPlayer ? playerKey(row, cfg) : guildKey(row, cfg);
  const ref = doc(latestCol, key);
  const snap = await getDoc(ref);

  const newTs = num(row[tsH]);

  if (!snap.exists()) {
    await setDoc(ref, {
      ...row,
      _key: key,
      updatedAt: serverTimestamp(),
      uploadedAt: serverTimestamp(),
      _ts: newTs,
    });
    return;
  }

  const cur = snap.data() as any;
  const curTs = num(cur?._ts ?? cur?.[tsH]);

  // Nur überschreiben, wenn neuer oder gleich => „Last write wins“
  if (newTs >= curTs) {
    await setDoc(ref, {
      ...row,
      _key: key,
      updatedAt: serverTimestamp(),
      uploadedAt: serverTimestamp(),
      _ts: newTs,
    });
  }
}

async function writeScan(kind: ImportKind, row: CSVRow, cfg: AppConfig) {
  const isPlayer = kind === "players";
  const scansCol = collection(
    db,
    isPlayer ? cfg.playersScansCollection : cfg.guildsScansCollection
  );
  // Für Scans nehmen wir denselben key + Timestamp als DocID, damit Historie eindeutig bleibt
  const tsH = isPlayer
    ? cfg.csvMapping?.players?.timestampHeader!
    : cfg.csvMapping?.guilds?.timestampHeader!;
  const ts = String(row[tsH] ?? "").trim() || String(Date.now());
  const key = (isPlayer ? playerKey(row, cfg) : guildKey(row, cfg)).replaceAll("/", "_");

  const ref = doc(scansCol, `${key}|${ts}`);
  await setDoc(ref, {
    ...row,
    _key: key,
    _ts: num(row[tsH]),
    uploadedAt: serverTimestamp(),
  });
}

/**
 * Importiert Reihen in latest + scans.
 * @param kind "players" | "guilds"
 * @param rows CSV rows (bereits geparst)
 * @returns { imported: number, skipped: number }
 */
export async function importCsvToDB(kind: ImportKind, rows: CSVRow[]) {
  const cfg = await readAppConfig();

  const isPlayer = kind === "players";
  const serverH = isPlayer ? cfg.csvMapping?.players?.serverHeader! : cfg.csvMapping?.guilds?.serverHeader!;
  const idH     = isPlayer ? cfg.csvMapping?.players?.identifierHeader! : cfg.csvMapping?.guilds?.guildIdentifierHeader!;
  const tsH     = isPlayer ? cfg.csvMapping?.players?.timestampHeader! : cfg.csvMapping?.guilds?.timestampHeader!;

  let imported = 0;
  let skipped  = 0;

  for (const row of rows) {
    const hasServer = (row[serverH] ?? "").trim() !== "";
    const hasId     = (row[idH] ?? "").trim() !== "";

    // Pflichtfelder prüfen
    if (!hasServer || !hasId) { skipped++; continue; }

    // latest schreiben (mit „neuer-ist-besser“-Logik)
    await writeLatest(kind, row, cfg);

    // scans historisieren
    await writeScan(kind, row, cfg);

    imported++;
  }

  return { imported, skipped };
}
