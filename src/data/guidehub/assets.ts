// src/data/guidehub/assets.ts
//
// Mapping: Guide-Asset-Key (normalisiert) -> Google Drive FILE-ID
// + Helper, um aus einem Asset-Namen die Icon-/Bild-URL (transparent) zu erhalten.
//   → Struktur und Arbeitsweise analog zu src/data/guilds.ts (flat Map + Normalizer).
//
// Mehrere Bilder pro Kategorie? → einfach mehrere Keys anlegen (z. B. fortressdiagram1, fortressdiagram2, …)
// Die Keys kannst du frei benennen. Sie werden vor dem Lookup normalisiert.
//
// Beispiele für Key-Benennung (frei, nur eindeutig):
//   - fortressbanner
//   - fortressgemcalculatoricon
//   - underworldcalculatorbanner
//   - progressionearlygemcalculatordiagram1
//   - legendarydungeonepicslegendariesicon
//
// Hinweis: Bitte NUR die FILE-ID eintragen, nicht die komplette Drive-URL.

import { gdrive, toDriveThumbProxy } from "../../lib/urls";

export type GuideAssetInfo = {
  id: string | null;
  url: string | null;    // Direktes Drive-File (Viewer)
  thumb: string | null;  // Proxied/Thumbnail (transparent), ideal für <img>
  fallback: string;      // Fallback-Emoji
};

/** Name-Normalisierung: diakritikfrei, lower, nur [a-z0-9] beibehalten */
export function normalizeGuideKey(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Bequemer Helper: mehrere Teile zu EINEM Key zusammenfügen (vor Normalisierung).
 * So kannst du tab/sub/sub2/name getrennt übergeben, intern bleiben wir flach.
 *
 * Beispiel:
 *   guideAssetUrlByKey(["progression", "early", "gem-calculator", "diagram 1"])
 *   -> normalisiert: "progressionearlygemcalculatordiagram1"
 */
export function joinParts(parts: Array<string | null | undefined>): string {
  const basis = parts.filter(Boolean).join(" ");
  return normalizeGuideKey(basis);
}

/**
 * 1) HINTERLEGE HIER DEINE ASSETS ALS NAME->FILE-ID
 *    - Key ist der normalisierte Asset-Name (siehe normalizeGuideKey/joinParts)
 *    - Wert ist die Google-Drive FILE-ID (nicht die komplette URL!)
 *
 *    TIPP: Du kannst wie in guilds.ts die Einträge in Blöcken kommentieren.
 */
const DRIVE_BY_KEY: Record<string, string> = {
  // ===== FORTRESS =====
  // fortress banner
  // URL: https://drive.google.com/file/d/DRIVE_FILE_ID_HIER/view?usp=sharing
  fortressbanner: "DRIVE_FILE_ID_HIER",

  // fortress calculator
  woodcuttergif: "1wss7GO8uQd4EDNOqlxi6XnPTJN9a3_XX",
  treasurygif: "1vcW_dKiJrmM2QswU9eRdPuqBXMAWD3rw",
  smithygif: "1vFNzcf6ozg1zfAjM4hCZ5uXDLrrxlb5i",
  quarrygif: "1lULek5WgJIWP71jleIEmzcdOOMOXG1tP",
  magetowergif: "19kufIsNJbdqQ6W4Le2pcBo5LIUTyPf1r",
  laborerquagif: "1CBT0dRrA3ls2AWcs6xcQf3j_saW_w06d",
  gemminegif: "1CBT0dRrA3ls2AWcs6xcQf3j_saW_w06d",
  fortressgif: "1d1EuQpuyUACK3QSmqt3LS1E_VXAnMnv2",
  fortificationgif: "1r9eE-dtW_tnwG0O_TcqbV0IfExrKWpHQ",
  barracksgif: "19gHfiOcOSg3hFkkqalPWUbRAhSUrqjcE",
  archerygif: "19gHfiOcOSg3hFkkqalPWUbRAhSUrqjcE",
  academygif: "1ecNA5rlJhtZBwgDZeiw3SJFNl2jM51z9",

  fortressgemcalculatoricon: "DRIVE_FILE_ID_HIER",
  // fortress diagramme (mehrere Bilder → durchnummerieren)
  fortressdiagram1: "DRIVE_FILE_ID_HIER",
  fortressdiagram2: "DRIVE_FILE_ID_HIER",

  // ===== UNDERWORLD =====
  underworldbanner: "DRIVE_FILE_ID_HIER",
  underworldcalculatoricon: "DRIVE_FILE_ID_HIER",

  // Underworld calculator
  uwgategif: "1FzKBmJcqXCOAUfdG7esFW6nOPkB8iJA3",
  trollblockgif: "1xAP6-k2BfSe26Wfd9pumtikAc2GYMzXa",
  torturechambergif: "1HVdmYILGq8B2GeJMhGAvxtgO_FPjWqK1",
  soulextractorgif: "1rLtoEG-c_Q3bTzmEBrd4GydtEby2wVaI",
  keepergif: "1qlcjFM6zaxNIbHjOCYndomdXS5MXiO1o",
  hearthofdarkngif: "1mQR7OPGssgCLgiH8nEh8H2B_Dnp44Zei",
  goldpitgif: "1PiL2fXnWyC8L7B6cep2ia282aB83KOqL",
  goblinpitgif: "1sxzs5jx7oRxEqkxLwtfvM8CfkHzJJyKh",
  gladiatorgif: "1KBe0WW5vytsOHob7i525db47XZTj-lfi",
  adventuromaticgif: "1HzPBVJm_Oj5uxIjooHQ1jAG21_eS2Knh",


  // ===== ARENA / AM =====
  amicon: "1a_gPOH3j87wcsuI4sitTgwVA9lvlLJku",
  ambuildorder: "17euou3ng62FCr7HVeesQm-kZGcV7Ij7l",

  // ===== HELLEVATOR =====
  hellevatorbanner: "DRIVE_FILE_ID_HIER",
  hellevatoricon: "DRIVE_FILE_ID_HIER",

  // ===== LEGENDARY DUNGEON =====
  legendarydungeonbanner: "DRIVE_FILE_ID_HIER",
  legendarydungeonepicslegendariesicon: "DRIVE_FILE_ID_HIER",

  // ===== EVENTS =====
  eventsbanner: "DRIVE_FILE_ID_HIER",
  eventlisticon: "DRIVE_FILE_ID_HIER",
  eventcycleicon: "DRIVE_FILE_ID_HIER",

  // ===== CALCULATORS (Sammelpunkt) =====
  calculatorsbanner: "DRIVE_FILE_ID_HIER",
  calculatorsmaxitemstatsicon: "DRIVE_FILE_ID_HIER",
  calculatorsdungeonpauseopenxpicon: "DRIVE_FILE_ID_HIER",
  
  // ===== PROGRESSION =====
  progressionbanner: "DRIVE_FILE_ID_HIER",
  progressionearlygemcalculatordiagram1: "DRIVE_FILE_ID_HIER",
  progressionmiddungeonpauseoverview: "DRIVE_FILE_ID_HIER", // Leerzeichen ok; wird normalisiert

  // ===== INFOGRAPHICS / CLASS BOOK / DUNGEONS =====
  infographicsbanner: "DRIVE_FILE_ID_HIER",
  classbookcover: "DRIVE_FILE_ID_HIER",
  classbookback: "DRIVE_FILE_ID_HIER",
  dungeonsbanner: "DRIVE_FILE_ID_HIER",

  // XP & Gold Curve
  goldxpcurve: "1UbZoa4h3bouL8sDdxLpKzz3kFEgFim_-",
  // Runes
  totalresrune: "1mdvEK5WDkBnR7pFs5-yVE_wTsAE6PqqH",
  lightresrune: "1692qgkv23P76tnkV22tpGQwmFQv3lrjc",
  lightdmgrune: "1932ov-vly-qu_ghlMmJrqH9zEH2UzZZ_",
  iceresrune: "1-8ocIDqs8wrDM8CgoaA3RCQN-A-pquWj",
  icedmgrune: "1idRxpKUIx5EBlO1D9c_CF0DxVmPtxR6O",
  fireresrune: "1N2eh0YOSGGkNzgDlnsnEdlbyU2BpfQqQ",
  firedmgrune: "1jCHfsLEZIg0konSNvDfmv42SUNWj3FEo",
  healthrune: "1rQCSliXuZi-Z3REBaHkNO9Dtte6MR4Bt",
  xprune: "1Okqq4A7pUaVhmNzYEBpyrHlSzISbnpXs",
  goldrune: "1qMhCTNrBV2NOvLxWsybCeXOrR96PBHt5",
  itemqualrune: "1J-kvaKzyxj_HU31rPUVk8g1wF32DjG-S",
  epicrune: "1J-kvaKzyxj_HU31rPUVk8g1wF32DjG-S",
  singlerune: "1FowkAzWip7QNI2k6CUAjDWBdAMJU1pFV",
  doublerune: "16ZL63Rh9SW76iSZLSYxFkFNyBMY57Lr8",
  //Gems
  luckbig: "1iYlE4rDU6rg3MHKG0vvwwb9wskdmu8-1",
  blackbig: "14bA3CU46YkT4um1tHmFoOGLp8RZE_v0s",
  legendarybig: "1soGwIo5IBQBhyX75KhD3-3jodoMoe450",
  // ===== hier beliebig erweitern =====
  // progressionlatebanner: "DRIVE_FILE_ID_HIER",
  // underworldppsodiagram1: "DRIVE_FILE_ID_HIER",
};

/** Liefert die Drive-File-ID zum Asset-Key (oder null) */
export function guideDriveIdByKey(keyOrParts: string | string[] | null | undefined): string | null {
  const key =
    Array.isArray(keyOrParts)
      ? joinParts(keyOrParts)
      : normalizeGuideKey(keyOrParts ?? "");
  return DRIVE_BY_KEY[key] ?? null;
}

/**
 * Liefert die Asset-Infos. `size` bestimmt die Kantenlänge des Thumbnails.
 * - `thumb` ist die empfohlene URL für <img> (transparent + Cache-freundlich)
 * - Falls keine ID konfiguriert ist, sind `id/url/thumb` = null; nutze dann `fallback`.
 */
export function guideAssetByKey(
  keyOrParts: string | string[] | null | undefined,
  size = 512
): GuideAssetInfo {
  const id = guideDriveIdByKey(keyOrParts);
  if (!id) {
    return {
      id: null,
      url: null,
      thumb: null,
      fallback: "📘",
    };
  }
  const direct = gdrive(id);
  const thumb = toDriveThumbProxy(direct, size);
  return {
    id,
    url: direct,
    thumb,
    fallback: "📘",
  };
}

/** Bequemer Helper nur für die Thumbnail-URL (oder null, wenn nicht vorhanden) */
export function guideAssetUrlByKey(
  keyOrParts: string | string[] | null | undefined,
  size = 512
): string | null {
  return guideAssetByKey(keyOrParts, size).thumb;
}
