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

  // ===== UNDERWORLD =====

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
  amruneoverview: "1YlAG-4hNVBfXHTBvcMIWXs-h-_8Yz7MS",

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
  
  //Rune Archievements
  stinkingrich: "1wtKrBGPIhb-c381aRwdFdItZ4bjcQuFs",
  runemaster: "13jn9YGSj6jwAHAyFgZci7xItANOMLEvb",
  runeemporer: "1NoV1yiiq3aa-jtUL0F8j0MUG--5sVkDW",
  capitalist: "1i7276mR37xH9ywdGAf5QqAZmy9ecbeom",

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
 
  // XP & Gold Curve
  goldxpcurve: "1UbZoa4h3bouL8sDdxLpKzz3kFEgFim_-",
  
  // Calendar
  calendarrewards: "1K9bm0OUtW0_QUg5i9q40N0slV6kg_iTd",
  calendarskip: "1jOgaf09diVUyCdXWdFoc-kXj4mUHejo7",
  // Pets
  elementaladvantages: "1wuV_5LJCMKVWA9FkCVILcQ_xF6GS9NM3",
  petsp2w: "1Smy-lLOCHFd_n4qqhy_mQh1cQEfIfYfW",
  petsf2p: "1_LfcLaZ9Yte_55iO0jl40KO8ZIvOyzjd",
  // Mushroom Packs
  normalpack: "",
  leveluppack: "1U5IfT1x471-eiA20GIkeVddLRp5z1-C3",
  birthdaysale: "1tnGr2TqWZ8-mbfB_FLA81cmawN6MHM2U",
  blackfridaysale: "151Vt48Snv14yaemu2br4a0p5ZJOwoBAJ",
  christmassale: "1YtjNmFDSdoZOMP7pr4u8Hpq-ngUoZSnL",
  communitysale: "1IcqlVQSmUmTjK5d-3uDSgWzfMdSoYXOz",
  eastersale: "1VjRJ5FYsPMH8shHO3ygFy8o7OW7Ok2s9",
  fallsale: "1WEBrcC16kKEuDqVrNN1_30YE-mvbLKRL",
  luckysale: "1ghdb7rzBd9IwfIThrZkWoBu_cJUu52Y8",
  newyearsale: "1oqiVjh189TymQOJ6rFgplKX5d19F8dRQ",
  oktoberfestsale: "15_EJDighENIzrGyWc_G-zoS90hf21I2O",
  prechristmassale: "1oF2EBqkCQoIpbea4DbWtBwVjiU0CQ3qH",
  soulfulsale: "1QXKH1xPEzpA1vPBL4KVYXs3Wz61Xwaoh",
  summersale: "1QXKH1xPEzpA1vPBL4KVYXs3Wz61Xwaoh",
  wintersale: "1dQgJjNPUwhYXFXe_D3ECSCZVxQ-tI4Wi",
  worldbosssale: "1PAtXeA1xucL-NQdEpl4c7koesaN6o4n9",
  // Hydra
  hydrastages: "1NosDzLmsNFLkTOuzpEKV0wjPo9TbMpMG",
  //Guild
  guildskillcost: "18Bx5BeItjYGP3cyNhvJ-Rwr3mfqNQkpc",
  //Progress
  levelzweibiszweihundert: "1xisisp1_yooyzPpjAdUEEi_0p284CtCz",
  levelzweihunzehnbissiebenhun: "1xisisp1_yooyzPpjAdUEEi_0p284CtCz",
  //Gems
  luckbig: "1iYlE4rDU6rg3MHKG0vvwwb9wskdmu8-1",
  blackbig: "14bA3CU46YkT4um1tHmFoOGLp8RZE_v0s",
  legendarybig: "1soGwIo5IBQBhyX75KhD3-3jodoMoe450",
  // credits
  sftaverndiscord: "1LpjOIafDHg1m6Il1H37gnujPph8tR6CY",
  sfmagazine: "1DkwbJdIRSI0DxVJCo9aCDD9FyjZGf-TQ",
  sftools : "1fcnNhvUliXJU6Fuw95mLrcNowjzZlYSh",
  //attack duplication 
  step1adg: "1s18qj9thQdvKQySqdgv3jhAZ6WXu4Z_T",
  step2adg: "1XD6h0xe56G4nfatc4Cs9wFnPveWwyxr8",
  step3adg: "1FBYaP5H-UhlrMiAhlfxcEyP8PGBWbPO5",

  // ===== Sonstige assets =====
  // mounts
  mount_good_10: "1hCQa6j9nFrQtuNIdOJAtFQEY5P7HoKzw",
  mount_good_20: "1srjM8MMp-QFrSzpAHkqhqsryUqv-QxdO",
  mount_good_30: "1eaEpGETs6utY41F8MDn8qgZbPUesMqXK",
  mount_good_50: "1xvCVMr71p8Fv-HKCbFZDl8jbrqRdTk0A",
  mount_evil_10: "1tL-EHf9mZDiC_VfHzLKlV6dRLX1p49h5",
  mount_evil_20: "1q8ElcKgxRv5SiCD0FD4w57FuudnZfcMw",
  mount_evil_30: "1IEJlzimZUDZLYLUAkc7j_qQypVVMv31R",
  mount_evil_50: "1IVZWyZtsVU6x3-vSvwVFssHSVbfC6Jsz",
  // normalized lookup aliases used by guideDriveIdByKey(normalizeGuideKey)
  mountgood10: "1hCQa6j9nFrQtuNIdOJAtFQEY5P7HoKzw",
  mountgood20: "1srjM8MMp-QFrSzpAHkqhqsryUqv-QxdO",
  mountgood30: "1eaEpGETs6utY41F8MDn8qgZbPUesMqXK",
  mountgood50: "1xvCVMr71p8Fv-HKCbFZDl8jbrqRdTk0A",
  mountevil10: "1tL-EHf9mZDiC_VfHzLKlV6dRLX1p49h5",
  mountevil20: "1q8ElcKgxRv5SiCD0FD4w57FuudnZfcMw",
  mountevil30: "1IEJlzimZUDZLYLUAkc7j_qQypVVMv31R",
  mountevil50: "1IVZWyZtsVU6x3-vSvwVFssHSVbfC6Jsz",

  // potions
  strengthsmall:"1C-yAAFTj3NIKAytM7chilnZsLB7L9qoy",
  strengthmedium: "1hyC2AAMJ2LZrG9eVIOsM1r32rKu0EtMY",
  strengthbig: "1_q5zMtSSz8tbwjffdatm_0zNWgk8rwAT",
  dexteritysmall: "16Bj7Zj9Bhdba5aPwtoyBzuF4wJjRYW0Q",
  dexteritymedium: "168E4GRa5w0NHvacEmw12AfWWE29ADHid",
  dexteritybig: "1Q2UfpJlxHd_04pOtSrWWBtekSF4LekWS",
  intsmall: "1mcBmub_FSPeNZd-ZcjkMEl4epTip0x6Q",
  intmedium: "19fBWEGGOpx28kpsyLBjCZU8huZLuYo8b",
  intbig: "1vsdMHdvk7pACJ19oZbdvP17Zf5wNXEYp",
  consmall: "1KG4A4aYjmN8IV0n1LfXbH_9KtQBMf0Wn",
  conmedium: "1DIF2Z2joC1eMeIUI2JL3ohJSvSGTlhAI",
  conbig: "14QQYPxpmtD4Ez2G5hPoq7GAduP1ibV4Y",
  lucksmall: "1ryoRSlQhSwx95YPOApQ5YGoSgefLi0fm",
  luckmedium: "1O71LVCe7jRhAcuBoWlX6XSJFj_P4mgXF",
  luckpotbig: "11PxBqb3fn57hUdCj1hNt__mkQbutquoA",
  eternalpotion: "1V2-b6UIvbkE0MMY1brZk29vnTFADybCx",
  
  //Academy
academylevel0: "1YucTTaQwjfsrEYp-okoFl0KWGnpXQdqu",
academylevel1: "1sykcAg-NuJdD7nIueRZQzfKQl0xICN2M",
academylevel2: "1mxrD-FsBz5BnGU4S3LqPGBTsizgVpD7b",
academylevel3: "1uXHMKmToVd6ZYu5UZArKE8BI2wigct5f",
academylevel4: "1tiN61u6PKVpGfb0gtPY5wDRQecwQ3x1B",
academylevel5: "1b_xSHNWCCTnEMhe4seNXD93zus-woq1A",
academylevel6: "1UEJnrwpzSJ5YpxM38UJI3KL4MXD1A33G",
academylevel7: "1Q6MWLruKEeCFGswau_OWi0ccgGi5Q--T",
academylevel8: "1eLHB52nkKGwfHeMAhN33tbstT4PF5Z7L",
academylevel9: "1a6jkXhEHlS7nkCmiRc3L0rHW6ppPldrl",
academylevel10: "17dU9ZlAI0CP7k-oCkh8usU7DiY-B51sA",
academylevel11: "12jt7iuCPhtRWlM_ea9wlJBByhF-oU_58",
academylevel12: "123zuQY4e0JTmYRW9IDQLyMe20Of_S5mU",
academylevel13: "1umVVfvG2Kakzaa4Cw5poNkwy8R-aHW-A",
academylevel14: "1xPlGBa9DRzB2EqwZm1AFjFeqnjdxI46x",
academylevel15: "1GGd68MzyN6fQpa0Ory0UX022y7x-leR_",
academylevel16: "1rDA1kpELLpeZPdFSFlStyQ4qiVn5Fn8V",
academylevel17: "1VakeR3TTSHy_FPnYlKG_NANWPGCOkT52",
academylevel18: "1TH0qlZxnCzah1nGus8lMqyHBe2fCUjYr",
academylevel19: "1X0nNpISEAyB_SEvEeerFJ6yYSu5t_FTx",
academylevel20: "1IIbJA0e1psJxuGqmOSusSZcuEPTdP-0p",


//Archery Guild
archeryguildlevel0: "1F1gEBd31aZHVScIR3xUKIxT6WcM1_RpX",
archeryguildlevel1: "1MnR0LdKRzItrmaIRm3Hb8liKu8Fcppv-",
archeryguildlevel2: "1kt7wyPIQ_Huib-zCaTVWIeEDSzJOjc4p",
archeryguildlevel3: "1qvw5e8SuE_c1vzA-rEft3XsheErao8Fb",
archeryguildlevel4: "1F4njeoGzfC6EozPLTrhOd1tj6uGwbln5",
archeryguildlevel5: "1sLsH_1NWHQtq1xOJIeBjI8AY-Vle2cgi",
archeryguildlevel6: "1pDVeQtn9ItxS7_9Qq0aaLO7X5sG5imz5",
archeryguildlevel7: "1gi6ew_tftTV5lHy6mL_zMxVJUeyT2k0B",
archeryguildlevel8: "1cPJI_HuyvojWjbQNAmKEK-JddOxPyW1k",
archeryguildlevel9: "1URlg11Al5xVap_UolAoodTIm-58dL4LG",
archeryguildlevel10: "1oJllwnW8RCTyLeF9WdYbbjFMX_V6uMHh",
archeryguildlevel11: "1-I5EGl_whFRoOsEuTw3ZCGGOWxmEIMtJ",
archeryguildlevel12: "1PBWYDxKXDJo9mcUAu_GpZsv8hmgNreo-",
archeryguildlevel13: "1ji0tNy6THqF-Mit5oRy_aI02vHM9qLwv",
archeryguildlevel14: "1_Y8eOATgEN8VRb62EhHyH5bIVyzMGJ_J",
archeryguildlevel15: "1WMtmzWic09WSPCZdRlsCTHVGHQe1Leso",


//Barracks
barrackslevel0: "1PRWxY42p2fsbMsuATDVi3NPRFVLzLG5j",
barrackslevel1: "1hAu9N56uEeW8D_Dnw_tGPyLxNEVl0hwZ",
barrackslevel2: "1N1phd8H8bbSGIj8qkj_m-fq_ylG53gCk",
barrackslevel3: "1GRXdGE43zwBb34IYds56XvZhQJIWMBEr",
barrackslevel4: "1rSJCCuWiayOj4-LqQK5XArc1MNl_keCZ",
barrackslevel5: "1iXQH515L4fOrESjWlwITiWLtnWKcE-gK",
barrackslevel6: "1I5vQ9zlbQVaBMv7VcMSInhDeIJQzMaL_",
barrackslevel7: "19kcv8HzwmR_XvnQzaaPaWCnK7D0d2fYl",
barrackslevel8: "1CbeImia-NF7zx0uOptgtb7oDcqXIBPl9",
barrackslevel9: "1vf__Os6jv3se_6Jry44753tBwmdxdNN0",
barrackslevel10: "1QFv3CV5Mn0OINjSid1CEdSZnL6Z0q9iX",
barrackslevel11: "1ICyzqtsUxMZO_I0gRxrpFv6oxrm_ftg4",
barrackslevel12: "121GQT6tWZeKp5qzF4oJu3Qr7I_HiCJsP",
barrackslevel13: "1TkjQZTiA5e-csUWJiHcXQccWr8sx6HPa",
barrackslevel14: "1dZMKMYxEzd-hU2yn2wPok3Fp8t7jR6Oz",
barrackslevel15: "1lq3AVLbPBhesvSXRYplLoRJwk3Qq-DFN",


//Blacksmith
blacksmithlevel0: "1L5ClE8jEXmdUlQKAN6aDhRRsSNu54F0B",
blacksmithlevel1: "1ExgQAOBnqrQk_NREelX79TCrrStCFOVk",
blacksmithlevel2: "144VdNgtMCEeneYfwWiyh3B7LTRnqRXDt",
blacksmithlevel3: "1Fwh7MMZxeH8j9znRrbDKJxY-DMwx-2hv",
blacksmithlevel4: "1lIsSZqgLF0JkfBWq9BjTuEpsPJOzp2Cf",
blacksmithlevel5: "1Ng-NCzlshkU0yUVQWiZWMc81VHpRlAUr",
blacksmithlevel6: "1ZrOcTI7ub_iqJ4De36b7u2pHOQRtWwuy",
blacksmithlevel7: "19J-luTzC1vGehmJSm9IKayk-e9B83dUx",
blacksmithlevel8: "13V2q4rUyqM3Usp2rHLIqPX_1lef-Ov2Z",
blacksmithlevel9: "1ezh7aampsGqTuKyjuPvzx5x7iZM6J_TJ",
blacksmithlevel10: "1c2KOkxGj-bMJH0II4yndCZV9Hr2N13_Y",
blacksmithlevel11: "1JK0dV0HcOtRrZyz0jexm11ZMVRqmo6tc",
blacksmithlevel12: "1Z_bk5abq-QxeikUBrMykIFCvK3EyVB1d",
blacksmithlevel13: "1TTTM_bP3ebzeHp_wTHAWCHnrtI7UOBNV",
blacksmithlevel14: "19lu2x54KmtVcy-2OukT_Dztebf99TLnu",
blacksmithlevel15: "1i1fQSEu0d-8CfqFsCP9JCHnWFUXOkj3y",
blacksmithlevel16: "1AwPJ2EcZOzkYrlH8CelYKEwjF9vVZe3m",
blacksmithlevel17: "1pNn8px666hUhSRPm5fGQYNBQ2fO-sbtu",
blacksmithlevel18: "1s6HU1BBTBb4CFZoM5jPkFnOV1kt_f9KH",
blacksmithlevel19: "1wxIhiqtVF8g9AanvDK2yxtaLI11087sN",
blacksmithlevel20: "1RDsT7H1EFg14Ov4VAnSz2EbGp1A3npLF",


//Fortification
fortificationlevel0: "17VRkUFMi-v4-Zql6hRPCYCMZUeH56GWh",
fortificationlevel1: "1Ti6WHtI9UIOkbmKdLMe12OJSvM6hqLGx",
fortificationlevel2: "1lcTOJlk7rYwgmv5eZpa3oa65Ay-mygP1",
fortificationlevel3: "1bovOYvQIO93QDWzuBeCqE2d0DT0Z-Ddn",
fortificationlevel4: "1KQ_gM-rwn1mx2IagW8QVUXgBoJa4Q45B",
fortificationlevel5: "1yW0PmHWSGGPxDG4OTUStADBeA76ARW4g",
fortificationlevel6: "1lcYgeFMsKJPL1UwNT4HgGzOsoVRKMxvh",
fortificationlevel7: "1uPwzS4WKQwH5hksa69Xq5DOF0lA5IYHw",
fortificationlevel8: "12r71QgUMTpPU6UCfgicq99m7TCdN0A58",
fortificationlevel9: "1SRdr9Elvn9FGs3_K01DdcCzV3iu-JDIV",
fortificationlevel10: "1P7fMUJ4AKtYBQ41T2_d-euwZjh1TRq6O",
fortificationlevel11: "1hyJAcC8-bs8A62uVJZbGGHHcr_UrOBOR",
fortificationlevel12: "1GymCquajL1mIphNQbFsFNhpmhDBOvev6",
fortificationlevel13: "1By26E9sJ9TEQmUTOzFDe3PeqKXvlIIGz",
fortificationlevel14: "1yM2MuACkKpEak0Njuqs6D9ux4E-iBbi7",
fortificationlevel15: "1EiJy0YNtHJdzkxowyJyxH65-phX5MAaW",
fortificationlevel16: "1Nbuae660E8pqL-N0MWZ1h8b3guAmdtCI",
fortificationlevel17: "1j7bSAIePqrYEq6h-_Z3Y_slDZKq_-7Cl",
fortificationlevel18: "1fK9ThwRsyANB9ynfpSRsBzpmzFr1PS47",
fortificationlevel19: "18d8NtgrIhdamNEbDoETARoZbi_JfJRBW",
fortificationlevel20: "1-Mgzsq9p8UZZVVtBQDa2radKgtD5vHns",


//Fortress
fortresslevel0: "1SSDvFopZwkQWQU4Fao3rTJkUNok_XNrg",
fortresslevel1: "1qmOIQ32ropKX7RXRQ5ZkVxb1esAvWyi5",
fortresslevel2: "1GrFHlSqEkE_PpeCXCKbg_l6SbdA5GipX",
fortresslevel3: "1Msd78-oDnjgo7f0H5To6Xqds2J6Vancj",
fortresslevel4: "1XGLHowZ96uaoMB7b3SbXKDkt53d8zrWq",
fortresslevel5: "19pR88ZdMSnodsAnuLvwkPGsjvEaN7GRv",
fortresslevel6: "1qh0N2YH7nEWh9ozDvbDWHZzpGhe15hCT",
fortresslevel7: "19VG5yKCZc-xmK3uxOqKKdMBSJ54XATzd",
fortresslevel8: "1B0TZTjC16NZM_EehHG0xFyStYN1Zm2HG",
fortresslevel9: "1HcI8Xa3YlJAnMmIYCoILcPJQh4Pb4lAV",
fortresslevel10: "141Meyec9rxQ7xNG_Bzm-T5_mt8-LIA-E",
fortresslevel11: "1_IaMarrszQtq37srZ13fiXQC155zrPrr",
fortresslevel12: "1m7QwRsw7xr3mff6KQ4hKBvBt9dCuiJXv",
fortresslevel13: "1YvzvcL__97YLiu3tPKMHlTZcuTpCKE6E",
fortresslevel14: "19rg12ksNeOpL4fAwO5e_j1ufEbY-W463",
fortresslevel15: "1_l4DEKSLfJCEnWUK3hisrxlZ4jRuTYyX",
fortresslevel16: "1ZNRr2o_YPnb_dTYOCy_4nu_3Ehax3gzE",
fortresslevel17: "1RLtGq2S256mS-VVYrweRGmmjbkW2mVBU",
fortresslevel18: "1PMAIog5NtsRftskKIElw6l-u82RjYb2K",
fortresslevel19: "1FQ1Py4KAcDVKkYqmFc3AX0E5UJ7GoMQf",
fortresslevel20: "1fnmjBSpDScZQwv5vCvwPzmZyU9cvefNS",


//Gem Mine
gemminelevel0: "13LG0EjHZ2DsYh9gu4oybmng4QhSem03G",
gemminelevel1: "18RLEj4nWZPS03OmHKi1SyNHzD1PMAbo1",
gemminelevel2: "1kXAi21aY9TkoxSZPUZysEzrtNXzzWIuI",
gemminelevel3: "1rRl9xZ0IUL1YvanrDWqc5LsUxrdnfzto",
gemminelevel4: "1egvSFS4vHuhVvnXJqbwPFdhM5IF6n7PJ",
gemminelevel5: "1G0kAHrhPakbFfCwMy3UNkAP_Pv_brpzK",
gemminelevel6: "17geyxgSM9VRpfe8kquPyB2KUIQRAU8R4",
gemminelevel7: "18Kikv0l5emDZ26eRO2NdMkJ-_1Gd76xF",
gemminelevel8: "1OHuPqW2vZI37Mg9VYYK_l-hDoyy0OM5s",
gemminelevel9: "1U9mwxjqDRlAAV3sBTku9kJpWKJYY6nSK",
gemminelevel10: "11_D_rEfK1aeYe1Lo3LAMveDfxfGp0Y3N",
gemminelevel11: "1fykII4jBSNM1rcWpPBLKhhJOD8EZXf_r",
gemminelevel12: "1ulnoxXYrfxy9EH4gvGEabVp05X0Pwj1c",
gemminelevel13: "1_kAu5f2JjQcLvhFUPkrjjRTJYVAvWZrT",
gemminelevel14: "1ss3Rja9Wjf98CcXwAfDxaSU1Jb48LPOd",
gemminelevel15: "1hFxnXDV5Y8_eDDE0lqXj4xYaRmr7iAx_",
gemminelevel16: "1He9CFXosrUWuI1kwEgxTblvaFGwSIET3",
gemminelevel17: "1kiGxH9Q4t9QhzoXfiL-7OQ2JweWX1RDa",
gemminelevel18: "1UubGGDdXL_ADavHMPhDlgiM0or3puMLu",
gemminelevel19: "1QwKcpTPQVfu1GAehdj_GeZy2Fop2HBoq",
gemminelevel20plus: "12iby2PpB3uc3j1AUcFwUBjZwMlcydy27",


//Laborers Quarter
laborersquarterlevel0: "1xoHrPLGJQKQu2G0m-B_PD2c4NxxGSSfG",
laborersquarterlevel1: "169cF8GC6s4STQCLenpAwf95agOH8mgUh",
laborersquarterlevel2: "1Tpoa4KUwkAbMWdDFqF0QUGdo-IIPJpSr",
laborersquarterlevel3: "1-3G_DRdyjpM_TwMMn9KoNxwUA9vNbaJG",
laborersquarterlevel4: "1choCBVy9qtEketchaEVD8R1xY5hCiHS_",
laborersquarterlevel5: "11iMB6d__VOu3xMyd9zp9dQ-xAyLMLxQC",
laborersquarterlevel6: "1Qx8OuwzVapla_8YTksM0K-QTxBX954U6",
laborersquarterlevel7: "1BBB47hihNKpE5mL6wxi2SnNIITIr_7Fk",
laborersquarterlevel8: "1N7_d78Xhbb_BlwbxEhYIT2h_6ZpnMuRg",
laborersquarterlevel9: "1cd7eCFXeFrF1J6XqEyg2r8PRMc_zM58k",
laborersquarterlevel10: "1oBq30l-PidFMm0JByENgWGUTE2kADyEd",
laborersquarterlevel11: "1R3_qZHQm0Shmj7qVkJw1Av1NQ6FKyny7",
laborersquarterlevel12: "1qbnZXGBn6_goCk_RjbAI9zS8guLCItOD",
laborersquarterlevel13: "1N7GR27jWSPDOqoHigauX5jaAt09GGxvQ",
laborersquarterlevel14: "1EG46F5VngIKQ1m2Gt6BDmc6UflXIJElA&usp",
laborersquarterlevel15: "1HZzwZ6baV_eOMfgZsYMXVcCd_dmn8Gnv",


//Mages Tower
magestowerlevel0: "1zMjeuySHUYBtkgC6VPGjD8hWWK3dN_Ob",
magestowerlevel1: "1_-K5hImoT2uDdzlwW9W4Ygum6XZURmEP",
magestowerlevel2: "1p1epD9FlUUr3myiMZdXfoBovs3918UgB",
magestowerlevel3: "1pw0fphhx3kZgFPM-L48mAQyp0D4sfyOa",
magestowerlevel4: "1X5qYQZIoWnTmq3IbBq2WkIN89PGR550Q",
magestowerlevel5: "19bHyKMuno-WUNbVL2DHJbpJday2B7Eju",
magestowerlevel6: "1zcJ8Ie0w9cum22BRs4enBk4_0xlMg5mZ",
magestowerlevel7: "10CfJQz4rnF8PiCpE-kP_yo2-zX3eQJJu",
magestowerlevel8: "1d2h1sS-qfXUj82Vag8aN3ZEkXHo1FImb",
magestowerlevel9: "15JW-ARHzTFxlZPYtlUJc7fUyjJxNS3ok",
magestowerlevel10: "1455yJ2EBw_yOvGA_fbRG8YBP_JtdIpW1",
magestowerlevel11: "1U8RM4SMtu6ti5iMIvFgSHGhzgnaBdiQu",
magestowerlevel12: "1tj331q6biSSjuVKYopA0P76aJQhJjfg5",
magestowerlevel13: "1SgjSsBhYXhpwifbTzbKZYy3hRYzxDEal",
magestowerlevel14: "1XWbesCih_pZ0KrQUo--aCyNjKlmgQ0_X",
magestowerlevel15: "1zuahHO38zL9Jzg_JrGFFI4NeO-4nXdaC",


//Quarry
quarrylevel0: "1r9RzzuTkZW_Ndat-pgD4fXFYLLXXjNvG",
quarrylevel1: "1IUGCYl4VrdjI20drJKWHdNPMeJUdnSmy",
quarrylevel2: "1aSOBBKY9XKVPc3xQAqp6p9-7xCsxESDc",
quarrylevel3: "136Ab2ClApE3_wH1P9eKxsCtayzaWiDvj",
quarrylevel4: "1K8XJMx_uATwJTT1sdGG57jHaHA_GL7sx",
quarrylevel5: "10s4wP_vnKjJFEe2gWLxMNq3xVHU7mHSO",
quarrylevel6: "1ismmleThVi7KLcJSI-kwZ34lTL2gP-iZ",
quarrylevel7: "1AVUG2eczCFP07ydDSQ0axAZUsEEUlDUU",
quarrylevel8: "1Ve5Wi207gxCewJKvrQs1Y7iAUv-8243E",
quarrylevel9: "1o6tH2ijR9A6NeXdGIx1aGCnX0q8iEoy6",
quarrylevel10: "1_cFsFA6pelRb1wiBIKXR2BubEUbq8ZyV",
quarrylevel11: "1F6aNkGBgbAQv8CZncQEQYdTX_tQzyitt",
quarrylevel12: "1iywPWYLnEs8cLtBroWRtc9XxvwykDP4p",
quarrylevel13: "1e_moY9WrnybwYPYwJ21m2IGRqxaJgFrt",
quarrylevel14: "13gCRhhYNoq_X5ASd1MsXw0Ly44IU7eU-",
quarrylevel15: "1xShG69NTXYezl2BRU4Lk60HyhnDgkWRz",
quarrylevel16: "1XOhqWHble9zIOHCq7_w9-rS7gy7VW5Vr",
quarrylevel17: "1YqHWqT3RnAoyG0EzKa13CvHaE-hF29Xr",
quarrylevel18: "1-HnGntJldOZspTBdUGn6kJLK5OUHz6dO",
quarrylevel19: "1_l0jOXSW0orinS6-SDaEr8e0ru1EiM7S",
quarrylevel20: "1n7UqWozh3ZrBtIGVnZcRPUpQT7HzADWk",


//Treasury
treasurylevel0: "1So3I_Ybd0DyfSxbN2EWcKerxMvsVwK2P",
treasurylevel1: "1-D0Ez9v_ip4Fh8FeFUwOqVE9pGpG4nfL",
treasurylevel2: "1Qgr6USJ7U0O4od64_IWZ7hCH8eKgLn0R",
treasurylevel3: "16V6gq27wz1QfeathGK3x-vQcIxVVOGqB",
treasurylevel4: "1c_IeEsWaVKYKxlC429yDvS97T8VyYGCN",
treasurylevel5: "1PNQFDq5Idv14DIrudSDU-MmW-O47YJ64",
treasurylevel6: "1zDciVy9N49HglQfcELy7qQCeiMz3JlMN",
treasurylevel7: "1u6RBx3h5UOvIfC7lLGSwveCSwtAC5KL2",
treasurylevel8: "18w6qq5TejRSD90QE630yLiYD3HMdUcuD",
treasurylevel9: "1dsVGxR1FwW3F71RF6Rd93oJkzcSuATL4",
treasurylevel10: "1xjM29HQl8OUDRCj9vSSW3GsQYcDw7e4Q",
treasurylevel11: "1GXVtupkL-nTCsWD7vGK7CnBlA02nUVTD",
treasurylevel12: "1KDV1XB1oCBk5rahlTtuDup7BYGOKLtgy",
treasurylevel13: "1AwpX0YvlrTmNdORR5KJ-2Bhc-qtUVMJ9",
treasurylevel14: "1-CatSGOLH9wjSmuBI1G_xpQaSTsu-BNL",
treasurylevel15plus: "1crVVIy5UEmNULUpkATI5Jtc44Eq0Pscv",


//Woodcutters Hut
woodcuttershutlevel0: "1ebPWITeckN4vCJDvMvPB4eF_I1ChKLQ5",
woodcuttershutlevel1: "1D3b6YII-_S2Mw1rbNPrrWQahyLaqEByS",
woodcuttershutlevel2: "1azoPSoY8ID4EDNfT1dMqHvvqaNfwx1RV",
woodcuttershutlevel3: "1uvLXRpxhmR8f6K715yHZEAU7QE1OPVK7",
woodcuttershutlevel4: "1DKy7paXdtT9L54j5pwL4RUc1B5fOMu1R",
woodcuttershutlevel5: "1RfUmj3FPX1b23gWOt3jmuHCZ4rlx1J_h",
woodcuttershutlevel6: "1t2d3Lj0g1qvjHXsukOZk8_brBzxNlh6M",
woodcuttershutlevel7: "1N0PlxM9TaEqQ8BVgz4xNy1QjkCkgts7J",
woodcuttershutlevel8: "1Havb5Sh5Hr70Vz6y9SEpvc_BwYxAB4h2",
woodcuttershutlevel9: "1lKF_H3rlyd40QWWmKSbG_A4lFZeHuCqP",
woodcuttershutlevel10: "1xV_cGKBTiYlY9xeRTnVURjaz4i_2AIFB",
woodcuttershutlevel11: "1-mmPowoHErOqiouYi_eiXF7CWs6N5Nvz",
woodcuttershutlevel12: "1Anufh4Vl8UeDjzjZb2JIZIZNezhcCSqx",
woodcuttershutlevel13: "1uhRw04g48DTrknBHy7aB1GLwXwKkFHFu",
woodcuttershutlevel14: "1sGYSg9Qlqx2uK5GA9BejPg0Yha2AjHY4",
woodcuttershutlevel15: "1mMpuaYRJ2L59rdA5u-iirNBLSCPeEgw0",
woodcuttershutlevel16: "1La_DigMN70U7gsl6LxoxeGebr43OrR4R",
woodcuttershutlevel17: "19ZnpYZ673GSMRyGyNY7CEXvW84n55t6X",
woodcuttershutlevel18: "1rAwtdfBMx9522sUz-7LTc9kPVvLUUKfF",
woodcuttershutlevel19: "1wiVFD3E6rvG1OglKQ3gk9XXhxZ6KcmH_",
woodcuttershutlevel20: "1MhcAuNYwSjcFjWaRaoTyJTSpIfEUYjW9",

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
  const direct = gdrive(id) ?? null;
  const thumb = direct ? toDriveThumbProxy(direct, size) ?? null : null;
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
