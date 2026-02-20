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
  name?: string; // Label/Meta: wird nicht fuer Logik genutzt
};

/**
 * 1) HINTERLEGE HIER DEINE GILDEN ALS IDENTIFIER->FILE-ID
 *    - Key ist der **Guild Identifier** aus den Snapshots (z. B. f10_net_g184102)
 *    - Wert enthaelt die Google-Drive **FILE-ID** (nicht die komplette URL!) + Label-Name
 *
 *    TIPP: Du kannst unterhalb Server-Abschnitte anlegen (nur Kommentare).
 */
export const DRIVE_BY_GUILD_IDENTIFIER: Record<string, GuildDriveEntry> = {

 // ===== EU5 =====
 s5_eu_g136: { fileId: "1Bdhbqru4j6tDoQHNHz7MvCi8hzBL37oj", name: "Tavernenflotte" },
 s5_eu_g27: { fileId: "1GsXGBDUAp1-pKNvkOs4IDAV_zGPJ6x3g", name: "Heimathafen" },
 s5_eu_g14: { fileId: "1ePJdIGCxB8yBZrQYVFKEWRX0ExOPvgYc", name: "Order 66" },
 s5_eu_g28: { fileId: "1v-KYkLEyy8m_CJg2iN0I5P40pUV_JJ8O", name: "EcoLand" },
 s5_eu_g88: { fileId: "1_jh3vAnndoCneRKrOnnSQbqXvkORBxZQ", name: "Thanedd" },
 s5_eu_g35: { fileId: "1PBZn-j-t6EK1CNbP3dfGnLTNULPBZke3", name: "Heldenschmiede" },
 s5_eu_g141: { fileId: "1Q22CR7nqZ4lK3HLfOwIfujHkSMogItVR", name: "Black Wings" },
 s5_eu_g110: { fileId: "1zlrHtAlwQiLm31R5XgMjKfCeLyg3rxmy", name: "Schattendrachen" },
 s5_eu_g1390: { fileId: "1t6c44jOw9-CISbIPr9KakY0tCPYe6BDu", name: "Hospudka" },
 s5_eu_g1037: { fileId: "1EQ1-F5sF3uVUciOyiSlaDUC8KYQlV-wn", name: "Hustlerzy" },
 

  // ===== EU6 =====
 s6_eu_g5: { fileId: "1fxmcK3CRW5hTg5jhSUAl8beQeRnMJRAf", name: "Heroes Voice" },
 s6_eu_g108: { fileId: "1j_kZ_q2Bh8dSt0bj6v2q7a2okQ1Kn6SU", name: "Mandalorians" },
 s6_eu_g1399: { fileId: "1fnXO0IAJEgmtSCikPOVdiIyqjfLLnN6q", name: "Death Watch" },
 s6_eu_g57: { fileId: "1nPtVIBC4rSkIKfYIXaXWXukZh5EI5g-u", name: "Anarchy" },
 s6_eu_g238: { fileId: "1Reax1z_ZkMIjfn-hLJr-1nQTJrMdA_jv", name: "OGRODY" },
 s6_eu_g140	: { fileId: "1MDTCV0mADrzWD8iVAG6yzUNu4-Ld3hPq", name: "Schattendrachen" },
 s6_eu_g2509: { fileId: "1dPtv2Y8Q893S658sxBiPxIkhW3Jtskye", name: "Libovi Odpadlici" },
 s6_eu_g1421: { fileId: "1t63a4OhV2ztN22IkUNWMfW3MiRmZ8egh", name: "FINAL FANTASY" },
 s6_eu_g3559: { fileId: "191QoL27P-E1m67qt4BTljnCX4iohPaYs", name: "YOLO" },


  // ===== EU7 =====
 s7_eu_g9: { fileId: "1v4Dy9KImbHK8HfmHKJ46Opa9g-wx_jYI", name: "Polarni Vlci" },
 s7_eu_g11: { fileId: "1_S57KiFRFnljmJsI1d-wx5CbDku0ABa3", name: "Trinity Force" },
 s7_eu_g91: { fileId: "1TeUlGwjJ_qoNZy5c-mysNM2ZRGIhRqtb", name: "Zmijozel" },
 s7_eu_g31: { fileId: "1KLxYOm1pFn0V8Pbz-yU2KuJvjYPvHjHs", name: "Trinity Rising" },
 s7_eu_g168: { fileId: "19IY-MS_Ja5u452QgMNNQ0dVuIz4RWFYt", name: "Baumhaus" },
 s7_eu_g93: { fileId: "1eu_xS3V91Af_jWh7qGT19LJ07eNJE1Nb", name: "Das Königreich" },
 s7_eu_g851: { fileId: "1OvuhXZzc5nnZl-tvgpHhZRDZODT_KqPt", name: "POLANDOS" },
 s7_eu_g832: { fileId: "1jMiDt1bqG2orYOqL_8ORAgk77RKTvmGP", name: "Winterfell" },
 s7_eu_g1130: { fileId: "1wt9WD3vwQoVW2alU1JjAOnZ5iHOJzOEO", name: "Black Order" },
 s7_eu_g416: { fileId: "1gDURC2EpSi_cV4l4402EUEsq9uA_QUvf", name: "WhiteRaven" },
 

  // ===== EU8 =====
 s8_eu_g1: { fileId: "1WkSkhHxlKWVBewMxhEZ_m7OQx3KHjAMT", name: "All That Matters" },
 s8_eu_g46: { fileId: "1Q_vrmmrWqQsnxyxYNOOzHACF3Nf4VE59", name: "Freedom" },
 s8_eu_g277: { fileId: "1-oQPkk2VsymVN0zUJd6JQmiVvWlV02HW", name: "Loyal Union" },
 s8_eu_g41: { fileId: "1Y_1-GSBOfG5rMtywRQGgcRv0s8-osVGv", name: "Necropolis" },
 s8_eu_g121: { fileId: "13UGTBLdzcVIWpmnUGMuCBFqOWvVDPoAC", name: "Houteiku" },
 s8_eu_g293: { fileId: "1Nz5ta5NRm0cramjEsEQOyh8zMzaA4kTG", name: "Czarne Wasy" },
 s8_eu_g878: { fileId: "1cLGnzdrb4NfK84gL4k6VSGSyGuqJ23b5", name: "Shakrs" },
 s8_eu_g295: { fileId: "1GYpLw8tegTkU-YG7QLLlx_SdAzPDmN5R", name: "PILZHASSER" },
 s8_eu_g930: { fileId: "1sqKW5yPzxuaJ8uRAvgc_yzEntYp0c-Lh", name: "Lusitanos" },
 


  // ===== EU9 =====
 s9_eu_g175: { fileId: "15_H_8es5JnWQ6cBGccMxD6yCNKWHvfyV", name: "Survivors" },
 s9_eu_g31: { fileId: "1E5GzYKQXR_4-EABt8mkc5JqqiMOgDBot", name: "Die Legenden" },
 s9_eu_g11: { fileId: "1gYionSgP9CwqY_Si_j7g0u0Q8x3dckP9", name: "Frozen Throne" },
 s9_eu_g13: { fileId: "1MCC05YmIh71wVUBQzF7Ls8usgQPiM8kz", name: "Ceska Elita" },
 s9_eu_g2116: { fileId: "1nRphvVIi-XlLJFXWnqCJGKJTK2gcJxUT", name: "DARE-DEVIL" },
 s9_eu_g3087: { fileId: "145BtVxB58r51_FSdmfLybVQAG-hz8fyA", name: "Albanska mafie" },
 s9_eu_g55: { fileId: "17OmIApWzC5PXM3rAZMTQK3uo5UkND9-a", name: "Pysiakowo" },
 s9_eu_g51: { fileId: "1CjmnJYFJJYyAUbh5IXBmmvo_fau6QiPc", name: "RAW POWER" },
 s9_eu_g3260: { fileId: "1axvgrwlVIuGZYNMDS4ajpxdRnBidCCiY", name: "Schwarzer Stier" },
 s9_eu_g101: { fileId: "1tXsv83bKbiIJD_XRZ3OPnXnx1hK9HGNt", name: "Alkoholici" },
 

  // ===== EU10 =====
 s10_eu_g1: { fileId: "1N_Y0hWRDs-8AjN0XUqtrwLwKmgOFKX8_", name: "Royal Guard" },
 s10_eu_g194: { fileId: "1WLbb5nAOOlX4_Gae8zgOa_U-QfPe3lML", name: "Immortal Circle" },
 s10_eu_g65: { fileId: "1RKRP7ArDafsjLscXDXqIcNaWNnd_KomC", name: "BODENSATZ" },
 s10_eu_g102: { fileId: "1YrMLQP7rKjcDhK2zDXxCG3ePuBqyQOzO", name: "Shadow Syndiacte" },
 s10_eu_g74: { fileId: "1MLF0PeGIPCmp0zV_dmfbkku18OEqfyYs", name: "Gem Miners" },
 s10_eu_g12: { fileId: "1T0yZGMTPqCWYVavP6ARQPcoKFtFM9Koq", name: "Soul Hunters" },
 s10_eu_g5: { fileId: "13hBf7Jh4OB07nY9CwoMJgnpL2_j4760J", name: "Morior Invictus" },
 s10_eu_g173: { fileId: "1QJMnj8_4RyB8ALPWbkivWlZa6488Qsm5", name: "Das Königreich" },
 s10_eu_g46: { fileId: "1ww9-YlkJBYntB_I-LKAkEXDdkvSP9jCs", name: "Die Legion" },
 s10_eu_g71: { fileId: "1cyUF7h83gwXgvXB_PRTibvMK7PibXEqU", name: "Misfits" },


  // ===== EU11 =====
 s11_eu_g1: { fileId: "1r2GmSyptQhi1Ldhsv9mmpcALu8xo3hI2", name: "Hell Imperium" },
 s11_eu_g135: { fileId: "1xyRWEhLFCzHh9vW_VgecGiKa1rVjZe2y", name: "Northern Sky" },
 s11_eu_g501: { fileId: "12RAUg5DRkh_BSwGMsutPiLYzbmtFAHTM", name: "Pureform" },
 s11_eu_g3: { fileId: "1o0YF3WzKIg4zzcrByHuheC4mOtvi85JI", name: "Heaven Imperium" },
 s11_eu_g33: { fileId: "1tyn3p6FExfPJa0b36APjYAYjHsEKGddI", name: "Fekete Gyöngy" },
 s11_eu_g161: { fileId: "1wIU-jn2ggypWdbPdMF6Wn1susyHn02kv", name: "UnityLegion" },
 s11_eu_g972: { fileId: "1CTaJ-HLRwoJuFjamadwSRudhtTAo5t_0", name: "Mushroom Addicts" },
 s11_eu_g330: { fileId: "1DmtinML2T3Jj0218lj0lJ64yLwcYskiJ", name: "Die Köter" },
 s11_eu_g260: { fileId: "1wa3PU6RA5jgHJ2gkfFHvLZOpxeMF8Iu7", name: "Zur Frostfrucht" },
 


  // ===== EU12 =====
 s12_eu_g53: { fileId: "17EJpfIWuSSFP3zUVElKOCAud1KCGCi1x", name: "Synergy" },
 s12_eu_g7: { fileId: "1Uq8Sbmc7O0ayJmFoEo7NFaYnr49vtA6W", name: "Bandycka Jazda" },
 s12_eu_g31: { fileId: "1C3KVkKtZz34XqF3DLtorqnVuP9sbF5nh", name: "Dothraki Beasts" },
 s12_eu_g35: { fileId: "1VKcHEonOw1ee7C9Vy7NClmXUheXoK3IE", name: "Order of Phoenix" },
 s12_eu_g111: { fileId: "1b6eKdsqsyQfyhYiAD-9KOt3Ly50fhjGk", name: "Bincarna" },
 s12_eu_g346: { fileId: "16E6o-5lGDa88rBxCWS6MAY-8vT4zed9c", name: "Reborn Warriors" },
 s12_eu_g76: { fileId: "1yVRTRmdPTKHY750tyGnLxslwM4nvHI4B", name: "Cataclysm" },
 s12_eu_g1831: { fileId: "1wgYp_yVin2sOhDpjZdpxOMktGulzfMeg", name: "Odysseia" },
 s12_eu_g2638: { fileId: "12eIL72tjjqp8fmN9f5_YSmbyba7lLjRB", name: "Die Gottlosen" },
 s12_eu_g419: { fileId: "1OU-y1hqS9a7v1baBqaJL7oBESmRgF-a-", name: "EMERITOS" },


  // ===== EU13 =====
 s13_eu_g11: { fileId: "1HayTGbuIbzlnNzvzx_1y26zcDn2PcL0-", name: "Black Rose" },
 s13_eu_g6: { fileId: "1Djreygs5bpWjlRFaxPckNOA78QVBbJxh", name: "The Magazine" },
 s13_eu_g13: { fileId: "1Jnb4Dx-pGNjEbmzmyFdjDHykgLNQYomX", name: "Universum" },
 s13_eu_g43: { fileId: "1VUz1eh9PWXF5JN8GHEBEDoJ-gjQBV1Op", name: "PILZHASSER" },
 s13_eu_g875: { fileId: "1TmeRVp8zNomBYuBW8PCt5n96ermoUmbU", name: "LowcySnow" },
 s13_eu_g99: { fileId: "15OVZoNlXhlsRvLnqPSAIwhaRAHgXfCAu", name: "Maci Csoport" },
 s13_eu_g40: { fileId: "1xNNC5qM0SduKgkNUCMIoRH8-lcXFEYE9", name: "Hades" },
 s13_eu_g1613: { fileId: "1C3hnAUhpBXxPuuYGLAELLdbuezrr-g8Y", name: "Wikinger" },
 s13_eu_g127: { fileId: "11z7iRVXVTEWHdJvKpDDIf6F7JnKzynuN", name: "Die Gottlosen" },
 s13_eu_g3777: { fileId: "1rAkL-Oo0JS0LWgMVkLkAKw0yteiGI33W", name: "Rakosollo" },
 

  // ===== EU14 =====
 s14_eu_g6: { fileId: "1P3S7jBSrQtztuYNI97WE4pbi7sCeorHB", name: "Kratom" },
 s14_eu_g68: { fileId: "1stITzz7phmu1C6maTrF4PH5HiSGH1Dwk", name: "Shroomoholics" },
 s14_eu_g63: { fileId: "1nhVKy0ojB1GZAhIQ53Ckd7NvFyhVqHjM", name: "Götterschmiede" },
 s14_eu_g584: { fileId: "1LcQHUKwGm0o1ae13trHbhxqSQCyBrlEz", name: "Die Gottlosen" },
 s14_eu_g11: { fileId: "1fOaIxs-YR1wgevePz-Xjiply-yGS5Wol", name: "DARE-DEVIL" },
 s14_eu_g264: { fileId: "1_zq5Ac06dxAoqxtRTQWl2gfOKYwJchzi", name: "PolskaGora" },
 s14_eu_g1933: { fileId: "1MOvB36iRh-PloY6NEECI1JGOkc49Jsrq", name: "A Mergzett Alma" },
 s14_eu_g20: { fileId: "194o4WWwDFB61IZsZ1ZBq4IQpc_fb85d6", name: "KURDE BOBER" },
 s14_eu_g195: { fileId: "1K-uVOIOEb6lxQoTQJMAA692EYq847zXp", name: "Fairy Tail" },
 s14_eu_g121: { fileId: "18cmfmH0ynv9llWesZ7kBNB3JrGe1Jb4e", name: "Sins Of Hell" },
 

  // ===== AM1 =====
 am1_net_g6: { fileId: "1NbfGIkiEwWLHTIHcKCYLn-CZE_-11bgi", name: "Primordial" },
 am1_net_g4: { fileId: "1tSMOUvOqNZMNn-LaFh3phK5qLf8TxDiq", name: "Exterminators" },
 am1_net_g8: { fileId: "1KZofKQ4c2XSVHysRTLjjwov8W5LczWCO", name: "Lord of the Pigs" },
 am1_net_g30: { fileId: "1N_Fjv1zUx22_mo7sk-r7QlamoVepzpE5", name: "Black Souls" },
 am1_net_g69: { fileId: "1IBYAhW7bgeWpC0K1xUl2crFuOwKBIkoJ", name: "The Round Table" },
 am1_net_g110: { fileId: "1noUACukYyQXYBZnSdp0lzCeI-KJrQRLv", name: "NotForLong" },


  // ===== EU15 =====
 s15_eu_g1: { fileId: "1mvHQktrC7ZyHhgZJS_3qNfPF78TkLPAZ", name: "HighwayToHell" },
 s15_eu_g16: { fileId: "1HhMJkb61PYmyAPq9j6HiLaF8YiM8l3vD", name: "Independence" },
 s15_eu_g9: { fileId: "1wU33YXpccgyXNXpb_CgCukMySyJmjKbN", name: "Soul Hunters" },
 s15_eu_g89: { fileId: "16MVjcAZ27VJdRym9lE2s_q-KpIZfqbC4", name: "Immortal" },
 s15_eu_g48: { fileId: "1SJV-6uO_cuYo5BXKda_LCWyFAKqOX3KN", name: "Zmijozel" },
 s15_eu_g15: { fileId: "19eQJKpHRSQAihL9fjfuL-2hh3UDJx3AE", name: "Zakon Tajemnic" },
 s15_eu_g40: { fileId: "1R_dstRYTlqVwTkNHOaCFmA9lNSlOGY_e", name: "Duck Valley" },
 s15_eu_g56: { fileId: "11DxGTWCPGKUtLvwIdc5tHSCzGxaGkvE7", name: "GORZELNIA" },
 s15_eu_g33: { fileId: "1mJOGl1DKRfLGT_jCr1z9-58vN3-LQsLH", name: "Soul Mates" },


  // ===== EU16 =====
 s16_eu_g10: { fileId: "1PIa5kfuneQ7-K0EcHxuSQQBiJ7y0HrNU", name: "Gem Miners" },
 s16_eu_g232: { fileId: "10ZrBfcLZu-W638MlxACaBaBQVBHu2TtZ", name: "Izakaya" },
 s16_eu_g27: { fileId: "1yo4Cz_lCiSqnVfZrTscnJg7qQXn_ll_K", name: "The Worldguard" },
 s16_eu_g45: { fileId: "164Hap8psOxqhaqhG0sBNAWskB_anFStr", name: "Lutscher-Legion" },
 s16_eu_g5: { fileId: "13cdynF8zBwuXwPMvgp4YnSls97hHc1t4", name: "Hrosici" },
 s16_eu_g56: { fileId: "11CVrtCufzl1th_w5Oxhp0d37wYXiD8rc", name: "Pureform" },
 s16_eu_g6: { fileId: "1zYFsEqy_XCtVl8ADVJjfuzCaskW7OchF", name: "Game Over" },
 s16_eu_g73: { fileId: "1QXsZeUez__bc--oVfCNCYkreB9U24-Eu", name: "Die Gottlosen" },
 s16_eu_g79: { fileId: "1kZWdFVR6OGGCjgSNUflQPgLl3AyfHNRf", name: "Les Chapos dFoin" },
 s16_eu_g97: { fileId: "1_mP9VDDQASBgx2NYaXDgOfWzQkWonjn7", name: "Freibad" },


  // ===== EU17 =====
 s17_eu_g186: { fileId: "1pbTCsZ3bU3MEljLOxo3WjIdWsfJ4qAKd", name: "The Magazine" },
 s17_eu_g107: { fileId: "1nm_E-nXt0e7ty1YdJ6WHbCx9nEQjNGu9", name: "Czarne Wasy" },
 s17_eu_g154: { fileId: "1BvPABQR-Bm6rY_AHqke1dlEY7ZtHNW_P", name: "DragonHunters" },
 s17_eu_g9: { fileId: "1D1YtTiTfMbvM2_HUWHi-R-n4lBexQY4_", name: "The Holy Order" },
 s17_eu_g955: { fileId: "1UagrrLW5LPMgdSpkRynH2GmlpwXNX1-6", name: "Immortal" },
 s17_eu_g34: { fileId: "1qK9P8hB9JUmHEb2yWUisS7sBG56xWNNS", name: "Rytiri Svetla" },
 s17_eu_g24: { fileId: "1SIorWKcL8jBWWDO8i7Qt1wjkuDJfIyV7", name: "Wiki Alfa" },
 s17_eu_g173: { fileId: "1H511rNi9L6dUdeCRynmdoQp85HG", name: "French Beer" },
 s17_eu_g226: { fileId: "1kxqiPOOra1LdjG5LmcjpAxgeKkRHdBMk", name: "Harcos Legendak" },
 s17_eu_g238: { fileId: "14qo7bjJ5uEaGQx0RA_ugi5Vzm7HnHA29", name: "Hunnia" },


  // ===== EU18 =====
 s18_eu_g38: { fileId: "1lvJItlZs_IrFZuz6y32n27-W5WlVKMHO", name: "Primodial" },
 s18_eu_g13: { fileId: "1tOxPbkqovOb8pjcvYIA9xIhXKIhukdiE", name: "The Worldguard" },
 s18_eu_g32: { fileId: "1onAICT5iEK14NZ8GWduKASQjS2KBZNhs", name: "Dothraki Beast" },
 s18_eu_g23: { fileId: "1VXSPSEvEZuXjyLWDZtiVa_RdTbth2oKd", name: "MLEM" },
 s18_eu_g105: { fileId: "1RjilCSZru6BDjMsQvMEskOLtH7F-t6g_", name: "Psychiatryk" },
 s18_eu_g266: { fileId: "1yn-A9FiHezmk98wo_MHWt3hhKjz_cTJv", name: "Akatsuki" },
 s18_eu_g8: { fileId: "1z9MJIAFTSg1Ig5oG8N2IzWuE6hXZBzaU", name: "Mushroom Addicts" },
 s18_eu_g35: { fileId: "1MxvbFCEGAFuWIQQatmtOyI36lXYMm8Hk", name: "Teehaus" },
 s18_eu_g676: { fileId: "1Hpx3Ga8N2SVdGVXUV8QsnLakky1JPwQ1", name: "DieUnglaublichen" },
 s18_eu_g112: { fileId: "1UqMhCJyeP3J_tbl53w0mOLGE6FOb7Lhv", name: "Kingdom XowiQx" },
 

  // ===== EU19 =====
 s19_eu_g15: { fileId: "12LEY5kmgNzSAb--UuzFKQImeatORUq1e", name: "Immortal" },
 s19_eu_g3: { fileId: "1ISbWX_MJCE2DHPPxG8y06hG3wMtlQRNZ", name: "PUREGAME" },
 s19_eu_g5: { fileId: "1TtRP84O4OM2jzzL7xPcy_EPX_TnhLted", name: "Deserters" },
 s19_eu_g135: { fileId: "1gfu4q_cRfV4sXH_f6EqDvjDjmTiK-aBY", name: "PROGRES" },
 s19_eu_g79: { fileId: "14HBiuQfM22vo_Leqpfwuyt9drQfh6_Kn", name: "Die Gottlosen" },
 s19_eu_g1649: { fileId: "1j8As15DEpaktnEIIQxNSoecFRYFQ4gKI", name: "Wild Forest" },
 s19_eu_g284: { fileId: "1m_CYnbAxHGseSlXE0kpk4J5l0q1SV3Bp", name: "Ulance" },
 s19_eu_g231: { fileId: "1T7I4r-R6XLRyH1O6J0e6nlKhVi3mRX7c", name: "Frostveil" },
 s19_eu_g16: { fileId: "13eq6ZiMHG7QQX41pXzJ-cYJGEkP0qWMI", name: "Szofery z Piekla" },
 s19_eu_g92: { fileId: "16naI4OVXTBBs37DD2BJbQ8RDViii0hao", name: "Korenovi vezni" },


  // ===== EU20 =====
 s20_eu_g132: { fileId: "1V8JJ9NxKG9gyndF1J_We48NbyA0sWaMR", name: "Freedomx" },
 s20_eu_g4: { fileId: "1PTmfWKc9E8WrYYWu8kkjxWKII10G33oI", name: "Imbiss 69" },
 s20_eu_g65: { fileId: "1yKtFJk7f4hPDWpTXZcvy6cor16xe6i8c", name: "Die Legionäre" },
 s20_eu_g11: { fileId: "1G18cYrqTf1h9chBh0nKmQR7_ujvuaEj1", name: "The Worldguard" },
 s20_eu_g80: { fileId: "1Zuw_OExiTCvUYYYCHwEDFivgqbpVNDLs", name: "SHADOW DEVILS" },
 s20_eu_g76: { fileId: "1zCa_WDIGoUnbFfLaE5mGWT7V09liKc-Z", name: "Gem Miners" },
 s20_eu_g89: { fileId: "1NWgtctWt9hCfIXiWckwNHa4FnIv1F8S5", name: "Food Rush 96" },
 s20_eu_g28: { fileId: "18UGVC1JAkj5ch37NPkeqfhqhUxkBOzQi", name: "Evil Returns" },
 s20_eu_g61: { fileId: "14HTUIDFrTTQUoPGZbKlUlLFUFx_wnOzt", name: "Mushroom Addicts" },


  // ===== EU21 =====
 s21_eu_g1: { fileId: "1m-r1mdWlZOpJ-__-zSwTZ-MlJ7rEP7Ck", name: "La Bella Vita" },
 s21_eu_g18: { fileId: "1v9VX67VWsrh0Dc-N85NQ4fC37koGvJJV", name: "La Bella Rosa" },
 s21_eu_g88: { fileId: "1zDlYag0ISghS-YZIEpr-kmhY_fD3wmsY", name: "La Bella Bandito" },
 s21_eu_g4: { fileId: "1TW90e9LnDrlMIlqyF-vpQY_hRE5SF3D_", name: "Polarni Expres" },
 s21_eu_g7: { fileId: "1f0ZGIRqUdTtb3N220_FUSYBS37lN7r2D", name: "Dothraki" },
 s21_eu_g199: { fileId: "1N96TzS9WqrW8ijHFx54Sspd7GOVSbRKV", name: "Abstinentia" },
 s21_eu_g60: { fileId: "1cVYacN9-gVzUf6T69qdiw8EGUNpYbI7D", name: "Frozzen Valley" },
 s21_eu_g6: { fileId: "14KMStPuH7QPZJyFhJ-cyDECl0JdK6Wvv", name: "Lightbringer" },
 s21_eu_g56: { fileId: "1YSktP6PjpxyhgCE9GdOU9UF2EiR-AW5z", name: "Sadistic" },


  // ===== EU22 =====
 s22_eu_g6: { fileId: "1katzMO7Cl8XqDPJqA9x0y8CPmhtYfaFH", name: "REAPERS" },
 s22_eu_g7: { fileId: "1LiAKuc4okAzOCFH_bRsESEWB75ueSStJ", name: "Exil" },
 s22_eu_g8: { fileId: "1gWoQkfSZ4s2M9NcSNyq07fDQmX309zDE", name: "Forever 22" },
 s22_eu_g9: { fileId: "1g04qMLKc35jgDRPggnZPcdKxybQzfHay", name: "Mages Only" },
 s22_eu_g15: { fileId: "1MD5cTmPNjNsMWscjAorxAXjis7kcMqGN", name: "Polarni Expres" },
 s22_eu_g2477: { fileId: "1kpAARvXTQ6e3jJJrMuEA0IphQHOqmMb9", name: "Laughing Coffin" },
 s22_eu_g3: { fileId: "12AR3FoADVlQFbg7wPh9UFNM981JmFPCf", name: "Sadistic" },
 s22_eu_g69: { fileId: "1juNcxe__2VtPxL12mX_FjLjAbjAou8MT", name: "UnityLegion" },
 s22_eu_g195: { fileId: "1JsF-dpD7HGwkkcwPVuRy2ZG4x7vZeRc_", name: "Moravaci" },
 s22_eu_g4: { fileId: "11SmboairvakRJ_U6Qu5nOOwEICKlEK71", name: "Wildschweinhut" },
 

  // ===== EU23 =====
 s23_eu_g18: { fileId: "1lJGmu3xWs_hH_lAVDIG48MpskTmBqLji", name: "OnlyFriends" },
 s23_eu_g3: { fileId: "1l_Sa6U0apW4QiUafLy2XhCk_8VDeu3M3", name: "Final Judgment" },
 s23_eu_g5: { fileId: "1GVlUpO6AyDVwMekijbChGo0iTABK-rNz", name: "Gruovo Imperium" },
 s23_eu_g2: { fileId: "1rFJ24pWozdjJwoAfyRp82tTG4uwqIkai", name: "C R Y" },
 s23_eu_g22: { fileId: "1Hy8P3u5p1UKckOmEYbGbTbKTIJyBOB_m", name: "Sadistic" },
 s23_eu_g17: { fileId: "1pRBhzcavndkGGQV46rfaPOwc1xTafeAg", name: "shadowborn" },
 s23_eu_g6: { fileId: "1likq8oUx4aI38aGJah42ceT8LPHsQLRg", name: "Ruzenky" },
 s23_eu_g45: { fileId: "17H4SOpU8zL5JVMYQdqKN4g76zQnyYAJ0", name: "Anakonda" },
 s23_eu_g361: { fileId: "1qzAsr3UBQuegAx1gtSAJNvTzI3Jr9Z_2", name: "Wschodnie Dziki" },


  // ===== EU24 =====
 s24_eu_g5: { fileId: "1fsm0guL8S6ZLbIQOr6Sizepy0KZ1SR8A", name: "The Worldguard" },
 s24_eu_g83: { fileId: "1ImLh0hhYGHoXfcVwE5bS6crGSvIJwZ-v", name: "Pestilence" },
 s24_eu_g2: { fileId: "1wW5n2fjEc13unRS3Ui0jNRtSF4ThciCJ", name: "Quarantäne" },
 s24_eu_g19: { fileId: "1qFniy8hQcR7kVqEcp71zfBks-kEiY9Ki", name: "La Cossa Znossa" },
 s24_eu_g7: { fileId: "1OiSjaEn-pvmyxf5U10zfmSPtgD-AqQqq", name: "Morova Ilzanice" },
 s24_eu_g85: { fileId: "1vyqDPbneSkEzZBAN3qj_Bo-WqfkQUCZX", name: "SupremeEvolution" },
 s24_eu_g8: { fileId: "1OxQtcP7ZXGMkkc1igcXNPnwRo8r844M3", name: "RODINA" },
 s24_eu_g16: { fileId: "1oCw_HcUlt1aQlypwR52tm-1CLzDrd2qT", name: "Bohemove" },
 s24_eu_g9: { fileId: "1Hvkz8pLxIXkjE9XP7ZbyjSPwnTigGP8o", name: "PILZHASSER" },
 s24_eu_g36: { fileId: "1ABWiYzdbZ947cZfvBrXZX7VS1dfTpOT4", name: "Bratri v Kyblu" },
 
 
 
 
 
 
 
  // ===== F1 =====
 
  // ===== F2 =====
 
  // ===== F3 =====
 
  // ===== F4 =====
 
  // ===== F5 =====
 
  // ===== F6 =====
 
  // ===== F7 =====
 
  // ===== F8 =====
 f8_net_g27217: { fileId: "1u2iNksbzArhaK0fbdHeMu4ieZO8B6EgJ", name: "ENDGEGNER" },
 f8_net_g16109: { fileId: "1f7jT_OmHmmhg1Am4p60nVetujbC8Xpdv", name: "Hornys Endgegner" },
 f8_net_g71777: { fileId: "1IX43Rfunw-8BLY-ACy-c4csuTXJ4GNXs", name: "Risens Endgegner" },
 
  // ===== F9 =====
 
  // ===== F10 =====
 
  // ===== F11 =====
 f11_net_g5501: { fileId: "1sudYxrebgpMT6nPgsK-zVq8Padbl5MhC", name: "ENDGEGNER Alpha" },
 f11_net_g11424: { fileId: "1ewzuzDvlGN7b9BeHRh7Sc7YcPel2EJow", name: "ENDGEGNER Omega" },
 
  // ===== F12 =====
 f12_net_g465: { fileId: "1BrnC-DsBTXiaw7Ds7unDP8u4vU4bj8-j", name: "ENDGEGNER I" },
 f12_net_g81150: { fileId: "1tvWCCAEnAnP4TVKA6VwH54i0XMeFR3uH", name: "ENDGEGNERs Wölfe" },
 f12_net_g68166: { fileId: "1LnYKjeiJdSL9w4SliieNyEAHb1C-HJgh", name: "ENDGEGNER Semper" },
 
  // ===== F13 =====
 
  // ===== F14 =====
 
  // ===== F15 =====
 
  // ===== F16 =====
 
  // ===== F17 =====
 
  // ===== F18 =====
 
  // ===== F19 =====
 
  // ===== F20 =====
 
  // ===== F21 =====
 f21_net_g13645: { fileId: "1JF_-vvAUXcKHgZyFYZaouHVee12dGFsf", name: "Rising Phoenix" },
 
  // ===== F22 =====
 f22_net_g21386: { fileId: "19OYwHcO3ZNfTwKxGfYQaEgRTzov7YNYH", name: "Crit Happens" },
 
  // ===== F23 =====
 f23_net_g10202: { fileId: "1vsgQ8qHx9Wjq1QKKt7vgWUfAApYDkd_W", name: "Crit Happens" },
 f23_net_g11625: { fileId: "1f3RF97OO-GSW6tlrez6ll73ffO6r43oU", name: "Sanctum" },
 f23_net_g10851: { fileId: "1HI1VEN9G3H7u5Qwg0IdMIMgAKU2Qnn7w", name: "Oblivion" },
 
  // ===== F24 =====
 f24_net_g9309: { fileId: "1dWWYpTMBYqMWL_X25iBmCJqiZguU3DmR", name: "Crit Happens" },
 f24_net_g9333: { fileId: "136Ki37XLzIxGv6CN2qWzoNdpIaewjue4", name: "Rising Star" },
 
  // ===== F25 =====

  // ===== F26 =====

  // ===== F27 =====

  // ===== F28 =====
 f28_net_g9108: { fileId: "1boe40Rdxxziwp-pppJi4x2kU5HuLPDap", name: "Welten im Wandel" },
 f28_net_g22: { fileId: "1L9RiqzxQumXOZ3e-GlG6RCGVAN1kFFBG", name: "Poena Capitis" },
 f28_net_g5452: { fileId: "13Ud0Wap5YiSAe4tHALOS7JvpLl1g471t", name: "The Void" },
 f28_net_g15060: { fileId: "1dCKCwHHrCtG1fciKCAeiHXOrTlzAjv0z", name: "Legion Z" },
 f28_net_g11896: { fileId: "1NiEnFnOglOvvhV1c-kRwIs083zETmDWIp", name: "Die Legion" },
 f28_net_g179: { fileId: "1YWhfhmS6U4IPc0ydJ3ctSsXJrpKD7fge", name: "Asylum" },
 f28_net_g110: { fileId: "1Ma_Pm-ed6qgRf-4prgzC71DWn5u2nJ79", name: "IMPERIUM" },
 f28_net_g62: { fileId: "16UdoSWWP3s9xrB8qFTKDEabDsOrCHFL7", name: "Exil" },
  
  // ===== Maerwynn =====
 maerwynn_net_g36538: { fileId: "1lVyTSwITmpat0IZayiW2BMsQtwCAVA53-GlG6RCGVAN1kFFBG", name: "ENDGEGNER MW" },
 

  // ===== weitere Server / Gilden hier ergaenzen =====
  // f10_net_g184102: { fileId: "DRIVE_FILE_ID_HIER", name: "My Cool Guild" },
};

const normalizeGuildIdentifier = (identifier: string | null | undefined): string | null => {
  if (typeof identifier !== "string") return null;
  const normalized = identifier.trim().toLowerCase();
  return normalized || null;
};

/** Liefert die Drive-File-ID zur Gilde (oder null) */
export function guildDriveIdByIdentifier(identifier: string | null | undefined): string | null {
  const normalizedIdentifier = normalizeGuildIdentifier(identifier);
  if (!normalizedIdentifier) return null;
  const entry = DRIVE_BY_GUILD_IDENTIFIER[normalizedIdentifier];
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
