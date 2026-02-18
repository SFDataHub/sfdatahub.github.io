// src/data/guilds.ts
//
// Mapping: Guild Identifier -> Google Drive FILE-ID (+ Name als Label)
// + Helper, um aus einem Identifier die Icon-URL (transparent) zu erhalten.

import { gdrive, toDriveThumbProxy } from "../lib/urls";

export type GuildIconInfo = {
  id: string | null;
  url: string | null;         // Direktes Drive-File (Viewer)
  thumb: string | null;       // Proxied/Thumbnail (transparent), ideal fuer <img>
  fallback: string;           // Fallback-Emoji
};

export type GuildDriveEntry = {
  fileId: string;
  name: string; // Label/Meta: wird nicht fuer Logik genutzt
};

/**
 * 1) HINTERLEGE HIER DEINE GILDEN ALS IDENTIFIER->FILE-ID
 *    - Key ist der **Guild Identifier** aus den Snapshots (z. B. f10_net_g184102)
 *    - Wert enthaelt die Google-Drive **FILE-ID** (nicht die komplette URL!) + Label-Name
 *
 *    TIPP: Du kannst unterhalb Server-Abschnitte anlegen (nur Kommentare).
 */
const DRIVE_BY_IDENTIFIER: Record<string, GuildDriveEntry> = {
  // ===== EU8 =====
  freedom: { fileId: "1Q_vrmmrWqQsnxyxYNOOzHACF3Nf4VE59", name: "Freedom" },

  // ===== F28 =====
  weltenimwandel: { fileId: "1boe40Rdxxziwp-pppJi4x2kU5HuLPDap", name: "Welten im Wandel" },
  poenacapitis: { fileId: "1L9RiqzxQumXOZ3e-GlG6RCGVAN1kFFBG", name: "Poena Capitis" },
  thevoid: { fileId: "13Ud0Wap5YiSAe4tHALOS7JvpLl1g471t", name: "The Void" },
  legionz: { fileId: "", name: "LegionZ" },

  // ===== F28 =====
  // Die Legion
  // URL: https://drive.google.com/file/d/1NiEnFnOglOvvhV1c-kRwIs083zETmDWI/view?usp=sharing
  dielegion: { fileId: "1NiEnFnOglOvvhV1c-kRwIs083zETmDWIp", name: "Die Legion" },

  // ===== F28 =====
  // Asylum
  // URL: https://drive.google.com/file/d/1YWhfhmS6U4IPc0ydJ3ctSsXJrpKD7fge/view?usp=sharing
  asylum: { fileId: "1YWhfhmS6U4IPc0ydJ3ctSsXJrpKD7fg", name: "Asylum" },

  // ===== F28 =====
  // IMPERIUM
  // URL: https://drive.google.com/file/d/1Ma_Pm-ed6qgRf-4prgzC71DWn5u2nJ79/view?usp=sharing
  imperium: { fileId: "1Ma_Pm-ed6qgRf-4prgzC71DWn5u2nJ79", name: "Imperium" },

  // ===== F28 =====
  // Sladky domov
  // URL: https://drive.google.com/file/d/1kQkgEgpzSzi4QPwD1atWs8DNS3mcHRbE/view?usp=sharing
  sladkydomov: { fileId: "1kQkgEgpzSzi4QPwD1atWs8DNS3mcHRbE", name: "Sladky domov" },

  // ===== F28 =====
  // Exil (s1eu)
  // URL: https://drive.google.com/file/d/16UdoSWWP3s9xrB8qFTKDEabDsOrCHFL7/view?usp=sharing
  exils1eu: { fileId: "16UdoSWWP3s9xrB8qFTKDEabDsOrCHFL7", name: "Exil" },

  // ===== weitere Server / Gilden hier ergaenzen =====
  // f10_net_g184102: { fileId: "DRIVE_FILE_ID_HIER", name: "My Cool Guild" },
};

/** Liefert die Drive-File-ID zur Gilde (oder null) */
export function guildDriveIdByIdentifier(identifier: string | null | undefined): string | null {
  if (!identifier) return null;
  const entry = DRIVE_BY_IDENTIFIER[identifier];
  if (!entry?.fileId) return null;
  return entry.fileId;
}

/**
 * Liefert die Icon-Infos zur Gilde. `size` bestimmt die Kantenlaenge des Thumbnails.
 * - `thumb` ist die empfohlene URL fuer <img> (transparent + Cache-freundlich)
 * - Falls keine ID konfiguriert ist, sind `id/url/thumb` = null; nutze dann `fallback`.
 */
export function guildIconByIdentifier(
  identifier: string | null | undefined,
  size = 128
): GuildIconInfo {
  const id = guildDriveIdByIdentifier(identifier);
  if (!id) {
    return {
      id: null,
      url: null,
      thumb: null,
      fallback: "\ud83c\udff0",
    };
  }
  const direct = gdrive(id) ?? null;
  const thumb = direct ? toDriveThumbProxy(direct, size) ?? null : null; // gleiches Verhalten wie bei Klassen-Icons
  return {
    id,
    url: direct,
    thumb,
    fallback: "\ud83c\udff0",
  };
}

/** Bequemer Helper nur fuer die Thumbnail-URL (oder null, wenn nicht vorhanden) */
export function guildIconUrlByIdentifier(
  identifier: string | null | undefined,
  size = 128
): string | null {
  return guildIconByIdentifier(identifier, size).thumb;
}
