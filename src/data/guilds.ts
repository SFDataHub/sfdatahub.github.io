// src/data/guilds.ts
//
// Mapping: Gildenname (normalisiert) -> Google Drive FILE-ID
// + Helper, um aus einem beliebigen Namen die Icon-URL (transparent) zu erhalten.

import { gdrive, toDriveThumbProxy } from "../lib/urls";

export type GuildIconInfo = {
  id: string | null;
  url: string | null;         // Direktes Drive-File (Viewer)
  thumb: string | null;       // Proxied/Thumbnail (transparent), ideal für <img>
  fallback: string;           // Fallback-Emoji
};

/** Name-Normalisierung: diakritikfrei, lower, nur [a-z0-9] beibehalten */
export function normalizeGuildName(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * 1) HINTERLEGE HIER DEINE GILDEN ALS NAME->FILE-ID
 *    - Key ist der **normalisierte** Name
 *    - Wert ist die Google-Drive **FILE-ID** (nicht die komplette URL!)
 *
 *    TIPP: Du kannst unterhalb Server-Abschnitte anlegen (nur Kommentare).
 */
const DRIVE_BY_NAME: Record<string, string> = {

  // ===== EU8 =====
  
  freedom: "1Q_vrmmrWqQsnxyxYNOOzHACF3Nf4VE59",

  // ===== F28 =====

  weltenimwandel: "1boe40Rdxxziwp-pppJi4x2kU5HuLPDap",
  poenacapitis: "1L9RiqzxQumXOZ3e-GlG6RCGVAN1kFFBG",
  thevoid: "13Ud0Wap5YiSAe4tHALOS7JvpLl1g471t",
  legionz: "",
  

  
    // ===== F28 =====
  // Die Legion
  // URL: https://drive.google.com/file/d/1NiEnFnOglOvvhV1c-kRwIs083zETmDWI/view?usp=sharing
  dielegion: "1NiEnFnOglOvvhV1c-kRwIs083zETmDWIp",
  
  // ===== F28 =====
  // Asylum
  // URL: https://drive.google.com/file/d/1YWhfhmS6U4IPc0ydJ3ctSsXJrpKD7fge/view?usp=sharing
  asylum: "1YWhfhmS6U4IPc0ydJ3ctSsXJrpKD7fg",
  
   // ===== F28 =====
  // IMPERIUM
  // URL: https://drive.google.com/file/d/1Ma_Pm-ed6qgRf-4prgzC71DWn5u2nJ79/view?usp=sharing
  imperium: "1Ma_Pm-ed6qgRf-4prgzC71DWn5u2nJ79",
  
   // ===== F28 =====
  // Sladky domov
  // URL: https://drive.google.com/file/d/1kQkgEgpzSzi4QPwD1atWs8DNS3mcHRbE/view?usp=sharing
  sladkydomov: "1kQkgEgpzSzi4QPwD1atWs8DNS3mcHRbE",
  
   // ===== F28 =====
  // Exil (s1eu)
  // URL: https://drive.google.com/file/d/16UdoSWWP3s9xrB8qFTKDEabDsOrCHFL7/view?usp=sharing
  exils1eu: "16UdoSWWP3s9xrB8qFTKDEabDsOrCHFL7",

  // ===== weitere Server / Gilden hier ergänzen =====
  // eu10 / mycoolguild: "DRIVE_FILE_ID_HIER",
};

/** Liefert die Drive-File-ID zur Gilde (oder null) */
export function guildDriveIdByName(name: string | null | undefined): string | null {
  const key = normalizeGuildName(name);
  return DRIVE_BY_NAME[key] ?? null;
}

/**
 * Liefert die Icon-Infos zur Gilde. `size` bestimmt die Kantenlänge des Thumbnails.
 * - `thumb` ist die empfohlene URL für <img> (transparent + Cache-freundlich)
 * - Falls keine ID konfiguriert ist, sind `id/url/thumb` = null; nutze dann `fallback`.
 */
export function guildIconByName(
  name: string | null | undefined,
  size = 128
): GuildIconInfo {
  const id = guildDriveIdByName(name);
  if (!id) {
    return {
      id: null,
      url: null,
      thumb: null,
      fallback: "🏰",
    };
  }
  const direct = gdrive(id) ?? null;
  const thumb = direct ? toDriveThumbProxy(direct, size) ?? null : null; // gleiches Verhalten wie bei Klassen-Icons
  return {
    id,
    url: direct,
    thumb,
    fallback: "🏰",
  };
}

/** Bequemer Helper nur für die Thumbnail-URL (oder null, wenn nicht vorhanden) */
export function guildIconUrlByName(name: string | null | undefined, size = 128): string | null {
  return guildIconByName(name, size).thumb;
}
