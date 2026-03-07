# JSON-Parser Mapping-Übersicht (Ist-Stand)

Quelle dieser Übersicht: ausschließlich realer Code in
- `src/lib/parsing/parseSfJson.ts`
- `src/lib/parsing/extractPortrait.ts`
- `src/lib/portraitFromSave.ts`
- `src/lib/import/parsers.ts`
- `src/lib/import/schemas.ts`
- `src/lib/parsing/latestValues.ts`

Hinweis: Der Schlüssel `ownplayersave` kommt im aktuellen Source-Code nicht vor. Tatsächlich verwendet wird `save`/`playerSave` (siehe Tabelle).

| Label | Wert | Stelle in Json für Mapping |
| --- | --- | --- |
| Direkt.parseSfJson.players_array | `Array.isArray(parsed?.players) ? parsed.players : []` | `$.players` (`src/lib/parsing/parseSfJson.ts:65-67`) |
| Direkt.toOwnPlayer.filter_own_eq_1 | `raw.own === 1` (sonst verworfen) | `$.players[*].own` (`src/lib/parsing/parseSfJson.ts:20`) |
| Direkt.toOwnPlayer.identifier | `toTrimmedString(raw.identifier)` | `$.players[*].identifier` (`src/lib/parsing/parseSfJson.ts:22`) |
| Direkt.toOwnPlayer.server | `toTrimmedString(raw.prefix)` | `$.players[*].prefix` (`src/lib/parsing/parseSfJson.ts:23`) |
| Direkt.toOwnPlayer.playerId_from_identifier | `Number.parseInt(identifier.match(/_p(\d+)$/i)[1], 10)` | `$.players[*].identifier` (`src/lib/parsing/parseSfJson.ts:4-8,26`) |
| Direkt.toOwnPlayer.saveField_primary | `raw.save` | `$.players[*].save` (`src/lib/parsing/parseSfJson.ts:29`) |
| Direkt.toOwnPlayer.saveField_fallback | `raw.playerSave` (nur wenn `raw.save` null/undefined) | `$.players[*].playerSave` (`src/lib/parsing/parseSfJson.ts:29`) |
| Direkt.toOwnPlayer.saveArray | `saveField` wenn `Array.isArray(saveField)` | `$.players[*].save` oder `$.players[*].playerSave` (`src/lib/parsing/parseSfJson.ts:29-30`) |
| Direkt.toOwnPlayer.saveString_from_saveField | `saveField` wenn `typeof saveField === "string"` | `$.players[*].save` oder `$.players[*].playerSave` (`src/lib/parsing/parseSfJson.ts:31-33`) |
| Direkt.toOwnPlayer.saveString_fallback | `raw.saveString` wenn `saveField` kein String ist | `$.players[*].saveString` (`src/lib/parsing/parseSfJson.ts:34-35`) |
| Direkt.toOwnPlayer.name | `toTrimmedString(raw.name)` | `$.players[*].name` (`src/lib/parsing/parseSfJson.ts:37`) |
| Direkt.toOwnPlayer.guildName_primary | `toTrimmedString(raw.guildName)` | `$.players[*].guildName` (`src/lib/parsing/parseSfJson.ts:38-39`) |
| Direkt.toOwnPlayer.guildName_fallback | `raw.group` wenn String und `guildName` leer | `$.players[*].group` (`src/lib/parsing/parseSfJson.ts:39`) |
| Direkt.toOwnPlayer.portrait_from_saveArray | `extractPortraitFromSaveArray(saveArray)` | `$.players[*].save`/`$.players[*].playerSave` als Array (`src/lib/parsing/parseSfJson.ts:42-43`) |
| Direkt.toOwnPlayer.portrait_from_saveString | `parseSaveStringToArray(saveString)` -> `extractPortraitFromSaveArray(parsedSave)` | `$.players[*].save`/`$.players[*].playerSave`/`$.players[*].saveString` als String (`src/lib/parsing/parseSfJson.ts:44-48`) |
| Direkt.parseSfJson.ownPlayer | `ownPlayers[0] ?? null` | abgeleitet aus `$.players[*]` (`src/lib/parsing/parseSfJson.ts:72`) |
| Direkt.parseSfJson.playersCount | `players.length` | abgeleitet aus `$.players` (`src/lib/parsing/parseSfJson.ts:73`) |
| Direkt.extractPortrait.parseSaveStringToArray.token | `Number.parseInt(part.trim(), 10)` sonst `0` | `saveString.split("/")[*]` (`src/lib/parsing/extractPortrait.ts:10-15`) |
| Index.extractPortrait.safeValue_fallback | fehlend/ungültig -> `fallback` (Standard `0`) | betrifft alle `save[index]`-Zugriffe in `extractPortraitFromSaveArray` (`src/lib/parsing/extractPortrait.ts:3-8`) |
| Index.extractPortrait.genderByte | `safeValue(save, 28) & 0xff` | `save[28]` (`src/lib/parsing/extractPortrait.ts:22`) |
| Index.extractPortrait.genderName | `genderByte === 2 ? "female" : "male"` | `save[28]` (`src/lib/parsing/extractPortrait.ts:22,28`) |
| Index.extractPortrait.classId | `safeValue(save, 29) & 0xffff` | `save[29]` (`src/lib/parsing/extractPortrait.ts:32`) |
| Index.extractPortrait.raceId | `safeValue(save, 27) & 0xffff` | `save[27]` (`src/lib/parsing/extractPortrait.ts:33`) |
| Index.extractPortrait.mouth | `safeValue(save, 17)` | `save[17]` (`src/lib/parsing/extractPortrait.ts:34`) |
| Index.extractPortrait.hairRaw | `safeValue(save, 18)` | `save[18]` (`src/lib/parsing/extractPortrait.ts:19`) |
| Index.extractPortrait.hair | `Math.max(hairRaw % 100, 0)` | `save[18]` (`src/lib/parsing/extractPortrait.ts:19,35`) |
| Index.extractPortrait.brows | `Math.max(safeValue(save, 19) % 100, 0)` | `save[19]` (`src/lib/parsing/extractPortrait.ts:36`) |
| Index.extractPortrait.eyes | `safeValue(save, 20)` | `save[20]` (`src/lib/parsing/extractPortrait.ts:37`) |
| Index.extractPortrait.beard | `Math.max(safeValue(save, 21) % 100, 0)` | `save[21]` (`src/lib/parsing/extractPortrait.ts:38`) |
| Index.extractPortrait.nose | `safeValue(save, 22)` | `save[22]` (`src/lib/parsing/extractPortrait.ts:39`) |
| Index.extractPortrait.ears | `safeValue(save, 23)` | `save[23]` (`src/lib/parsing/extractPortrait.ts:40`) |
| Index.extractPortrait.extra | `safeValue(save, 24)` | `save[24]` (`src/lib/parsing/extractPortrait.ts:41`) |
| Index.extractPortrait.hornRaw | `safeValue(save, 25)` | `save[25]` (`src/lib/parsing/extractPortrait.ts:20`) |
| Index.extractPortrait.horn | `Math.max(hornRaw % 100, 0)` | `save[25]` (`src/lib/parsing/extractPortrait.ts:20,42`) |
| Index.extractPortrait.specialRaw | `safeValue(save, 26)` | `save[26]` (`src/lib/parsing/extractPortrait.ts:21`) |
| Index.extractPortrait.special | `Math.min(specialRaw, 0)` | `save[26]` (`src/lib/parsing/extractPortrait.ts:21,43`) |
| Index.extractPortrait.hairColor | `Math.max(Math.floor(hairRaw / 100), 1)` | `save[18]` (`src/lib/parsing/extractPortrait.ts:24-25,44`) |
| Index.extractPortrait.hornColor | `genderName === "female" ? 1 : hornColorBase === 0 ? hairColor : hornColorBase` | `save[28]` + `save[18]` (`src/lib/parsing/extractPortrait.ts:22,26,45`) |
| Index.extractPortrait.frameId | `safeValue(save, 705)` | `save[705]` (`src/lib/parsing/extractPortrait.ts:46`) |
| Direkt.portraitFromSave.parseSaveStringToArray.token | `Number(part.trim())` sonst `0` | `saveString.split("/")[*]` (`src/lib/portraitFromSave.ts:87-93`) |
| Index.portraitFromSave.safeValue_fallback | fehlend/ungültig -> `fallback` (Standard `0`) | betrifft alle `save[index]`-Zugriffe in `createPortraitOptionsFromSaveArray` (`src/lib/portraitFromSave.ts:25-30`) |
| Index.portraitFromSave.genderByte | `safeValue(save, 28) & 0xff` | `save[28]` (`src/lib/portraitFromSave.ts:58`) |
| Index.portraitFromSave.genderName | `genderByte === 1 ? "female" : "male"` | `save[28]` (`src/lib/portraitFromSave.ts:58,66`) |
| Index.portraitFromSave.class | `safeValue(save, 29) & 0xffff` | `save[29]` (`src/lib/portraitFromSave.ts:67`) |
| Index.portraitFromSave.race | `safeValue(save, 27) & 0xffff` | `save[27]` (`src/lib/portraitFromSave.ts:68`) |
| Index.portraitFromSave.mouth | `safeValue(save, 17)` | `save[17]` (`src/lib/portraitFromSave.ts:69`) |
| Index.portraitFromSave.hairRaw | `safeValue(save, 18)` | `save[18]` (`src/lib/portraitFromSave.ts:54`) |
| Index.portraitFromSave.hair | `Math.max(hairRaw % 100, 0)` | `save[18]` (`src/lib/portraitFromSave.ts:54,70`) |
| Index.portraitFromSave.brows | `Math.max(safeValue(save, 19) % 100, 0)` | `save[19]` (`src/lib/portraitFromSave.ts:71`) |
| Index.portraitFromSave.eyes | `safeValue(save, 20)` | `save[20]` (`src/lib/portraitFromSave.ts:72`) |
| Index.portraitFromSave.beardRaw | `safeValue(save, 21)` | `save[21]` (`src/lib/portraitFromSave.ts:55`) |
| Index.portraitFromSave.beard | `Math.max(beardRaw % 100, 0)` | `save[21]` (`src/lib/portraitFromSave.ts:55,73`) |
| Index.portraitFromSave.nose | `safeValue(save, 22)` | `save[22]` (`src/lib/portraitFromSave.ts:74`) |
| Index.portraitFromSave.ears | `safeValue(save, 23)` | `save[23]` (`src/lib/portraitFromSave.ts:75`) |
| Index.portraitFromSave.extra | `safeValue(save, 24)` | `save[24]` (`src/lib/portraitFromSave.ts:76`) |
| Index.portraitFromSave.hornRaw | `safeValue(save, 25)` | `save[25]` (`src/lib/portraitFromSave.ts:56`) |
| Index.portraitFromSave.horn | `Math.max(hornRaw % 100, 0)` | `save[25]` (`src/lib/portraitFromSave.ts:56,77`) |
| Index.portraitFromSave.special | `Math.min(safeValue(save, 26), 0)` | `save[26]` (`src/lib/portraitFromSave.ts:78`) |
| Index.portraitFromSave.hairColor | `Math.max(Math.floor(hairRaw / 100), 1)` | `save[18]` (`src/lib/portraitFromSave.ts:60-61,79`) |
| Index.portraitFromSave.hornColor | `genderByte === 1 ? 1 : hornColorBase === 0 ? hairColor : hornColorBase` | `save[28]` + `save[18]` (`src/lib/portraitFromSave.ts:58,62,80`) |
| Index.portraitFromSave.frameId | `safeValue(save, 705)` | `save[705]` (`src/lib/portraitFromSave.ts:57`) |
| Direkt.portraitFromSave.frame_case_1 | `"goldenFrame"` | `save[705] == 1` (`src/lib/portraitFromSave.ts:32-36`) |
| Direkt.portraitFromSave.frame_case_2 | `"twitchFrame"` | `save[705] == 2` (`src/lib/portraitFromSave.ts:32-38`) |
| Direkt.portraitFromSave.frame_case_3 | `"zenFrame"` | `save[705] == 3` (`src/lib/portraitFromSave.ts:32-40`) |
| Direkt.portraitFromSave.frame_case_4 | `"silverFrame"` | `save[705] == 4` (`src/lib/portraitFromSave.ts:32-42`) |
| Direkt.portraitFromSave.frame_case_50 | `"worldBossFrameGold"` | `save[705] == 50` (`src/lib/portraitFromSave.ts:32-44`) |
| Direkt.portraitFromSave.frame_case_51 | `"worldBossFrameSilver"` | `save[705] == 51` (`src/lib/portraitFromSave.ts:32-46`) |
| Direkt.portraitFromSave.frame_case_52 | `"worldBossFrameBronze"` | `save[705] == 52` (`src/lib/portraitFromSave.ts:32-48`) |
| Direkt.portraitFromSave.frame_default | `""` (leer) | `save[705]` anderer Wert (`src/lib/portraitFromSave.ts:48-50`) |
| Direkt.import.detectPayloadAsync.parser_order | Parser-Reihenfolge: `sftools-players-bare -> players-list -> guilds-list -> scan -> deep-fallback` | JSON root wird gegen alle Parser in dieser Reihenfolge geprüft (`src/lib/import/parsers.ts:122-193,196-207`) |
| Direkt.import.sftools_players_bare.detect | `isObj(json) && Array.isArray(json.players)` | `$.players` (`src/lib/import/parsers.ts:126`) |
| Direkt.import.sftools_players_bare.arr_source | `arr = json.players` | `$.players[*]` (`src/lib/import/parsers.ts:128`) |
| Index.import.sftools_players_bare.server_guess_arr0 | `guessServer(arr[0])` | `$.players[0].{server|prefix|world|realm|srv|group|groupname|shard}` (`src/lib/import/parsers.ts:130,24-40`) |
| Direkt.import.sftools_players_bare.server_guess_root | `guessServer(json)` (Fallback) | `$.{server|prefix|world|realm|srv|group|groupname|shard}` (`src/lib/import/parsers.ts:130,24-40`) |
| Direkt.import.sftools_players_bare.server_default | `"UNKNOWN"` wenn kein Server gefunden | kein JSON-Feld (Code-Fallback) (`src/lib/import/parsers.ts:130`) |
| Direkt.import.guessServer.group_transform | `o.group.split("_").slice(0,2).join("_")` | Objektfeld `group` (`src/lib/import/parsers.ts:25-27`) |
| Direkt.import.guessServer.groupname_transform | `o.groupname.split(" ")[0]` | Objektfeld `groupname` (`src/lib/import/parsers.ts:27-29`) |
| Direkt.import.guessServer.priority | Priorität: `server -> prefix -> world -> realm -> srv -> fromGroup -> fromGroupName -> shard` | jeweilige Objektfelder (`src/lib/import/parsers.ts:30-38`) |
| Direkt.import.guessServer.normalize | `up(s)` = `String(s).trim().toUpperCase()` | gefundener Serverwert (`src/lib/import/parsers.ts:16-18,40`) |
| Direkt.import.pickFirst.key_transform_lower | pro Key zusätzlich `o[k.toLowerCase()]` | jeweiliges Objektfeld (Fallback) (`src/lib/import/parsers.ts:45-48`) |
| Direkt.import.pickFirst.key_transform_upper | pro Key zusätzlich `o[k.toUpperCase()]` | jeweiliges Objektfeld (Fallback) (`src/lib/import/parsers.ts:46-48`) |
| Direkt.import.pickFirst.key_transform_spaced | pro Key zusätzlich `o[k.replace(/_/g," ")]` | jeweiliges Objektfeld (Fallback) (`src/lib/import/parsers.ts:49-50`) |
| Direkt.import.slimPlayer.id.pickFirst.id | pickFirst(o, …) Treffer auf Schlüssel "id" | $.players[*].id bzw. Deep-Fallback-Objekt.id (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.id.pickFirst.identifier | pickFirst(o, …) Treffer auf Schlüssel "identifier" | $.players[*].identifier bzw. Deep-Fallback-Objekt.identifier (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.id.pickFirst.link_identifier | pickFirst(o, …) Treffer auf Schlüssel "link identifier" | $.players[*].link identifier bzw. Deep-Fallback-Objekt.link identifier (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.id.pickFirst.player_id | pickFirst(o, …) Treffer auf Schlüssel "player_id" | $.players[*].player_id bzw. Deep-Fallback-Objekt.player_id (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.id.pickFirst.pid | pickFirst(o, …) Treffer auf Schlüssel "pid" | $.players[*].pid bzw. Deep-Fallback-Objekt.pid (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.id.pickFirst.playerid | pickFirst(o, …) Treffer auf Schlüssel "playerid" | $.players[*].playerid bzw. Deep-Fallback-Objekt.playerid (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.id.pickFirst.ID | pickFirst(o, …) Treffer auf Schlüssel "ID" | $.players[*].ID bzw. Deep-Fallback-Objekt.ID (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.id.pickFirst.Identifier | pickFirst(o, …) Treffer auf Schlüssel "Identifier" | $.players[*].Identifier bzw. Deep-Fallback-Objekt.Identifier (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.name.pickFirst.name | pickFirst(o, …) Treffer auf Schlüssel "name" | $.players[*].name bzw. Deep-Fallback-Objekt.name (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.name.pickFirst.player | pickFirst(o, …) Treffer auf Schlüssel "player" | $.players[*].player bzw. Deep-Fallback-Objekt.player (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.name.pickFirst.player_name | pickFirst(o, …) Treffer auf Schlüssel "player_name" | $.players[*].player_name bzw. Deep-Fallback-Objekt.player_name (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.name.pickFirst.nickname | pickFirst(o, …) Treffer auf Schlüssel "nickname" | $.players[*].nickname bzw. Deep-Fallback-Objekt.nickname (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.name.pickFirst.nick | pickFirst(o, …) Treffer auf Schlüssel "nick" | $.players[*].nick bzw. Deep-Fallback-Objekt.nick (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.name.pickFirst.Character_Name | pickFirst(o, …) Treffer auf Schlüssel "Character Name" | $.players[*].Character Name bzw. Deep-Fallback-Objekt.Character Name (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.class.pickFirst.class | pickFirst(o, …) Treffer auf Schlüssel "class" | $.players[*].class bzw. Deep-Fallback-Objekt.class (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.class.pickFirst.classname | pickFirst(o, …) Treffer auf Schlüssel "classname" | $.players[*].classname bzw. Deep-Fallback-Objekt.classname (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.class.pickFirst.class_name | pickFirst(o, …) Treffer auf Schlüssel "class_name" | $.players[*].class_name bzw. Deep-Fallback-Objekt.class_name (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.class.pickFirst.cls | pickFirst(o, …) Treffer auf Schlüssel "cls" | $.players[*].cls bzw. Deep-Fallback-Objekt.cls (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.class.pickFirst.Role | pickFirst(o, …) Treffer auf Schlüssel "Role" | $.players[*].Role bzw. Deep-Fallback-Objekt.Role (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.class.pickFirst.Class | pickFirst(o, …) Treffer auf Schlüssel "Class" | $.players[*].Class bzw. Deep-Fallback-Objekt.Class (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.level.pickFirst.level | pickFirst(o, …) Treffer auf Schlüssel "level" | $.players[*].level bzw. Deep-Fallback-Objekt.level (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.level.pickFirst.lvl | pickFirst(o, …) Treffer auf Schlüssel "lvl" | $.players[*].lvl bzw. Deep-Fallback-Objekt.lvl (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.level.pickFirst.lv | pickFirst(o, …) Treffer auf Schlüssel "lv" | $.players[*].lv bzw. Deep-Fallback-Objekt.lv (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.level.pickFirst.Level | pickFirst(o, …) Treffer auf Schlüssel "Level" | $.players[*].Level bzw. Deep-Fallback-Objekt.Level (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.guildId.pickFirst.guildid | pickFirst(o, …) Treffer auf Schlüssel "guildid" | $.players[*].guildid bzw. Deep-Fallback-Objekt.guildid (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.guildId.pickFirst.guild_id | pickFirst(o, …) Treffer auf Schlüssel "guild_id" | $.players[*].guild_id bzw. Deep-Fallback-Objekt.guild_id (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.guildId.pickFirst.guild | pickFirst(o, …) Treffer auf Schlüssel "guild" | $.players[*].guild bzw. Deep-Fallback-Objekt.guild (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.guildId.pickFirst.Guild | pickFirst(o, …) Treffer auf Schlüssel "Guild" | $.players[*].Guild bzw. Deep-Fallback-Objekt.Guild (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.guildId.pickFirst.Guild_ID | pickFirst(o, …) Treffer auf Schlüssel "Guild ID" | $.players[*].Guild ID bzw. Deep-Fallback-Objekt.Guild ID (`src/lib/import/parsers.ts:74-78,42-53`) |
| Direkt.import.slimPlayer.id_assign | `base.id = String(id)` wenn `id != null` | aus pickFirst-ID-Quellen (`src/lib/import/parsers.ts:81`) |
| Direkt.import.slimPlayer.name_assign | `base.name = String(name)` wenn `name != null` | aus pickFirst-Name-Quellen (`src/lib/import/parsers.ts:82`) |
| Direkt.import.slimPlayer.class_assign | `base.class = (typeof cls === "number" ? cls : String(cls))` | aus pickFirst-Class-Quellen (`src/lib/import/parsers.ts:84`) |
| Direkt.import.slimPlayer.level_assign | `base.level = toNumMaybe(lvl)` | aus pickFirst-Level-Quellen (`src/lib/import/parsers.ts:85`) |
| Direkt.import.slimPlayer.level_toNumMaybe | `Number(String(v).replace(",", "."))` wenn finite, sonst `undefined` | Quellfeld aus Level-Key (`src/lib/import/parsers.ts:55-59`) |
| Direkt.import.slimPlayer.guildId_assign | `base.guildId = String(guildId)` | aus pickFirst-GuildId-Quellen (`src/lib/import/parsers.ts:86`) |
| Direkt.import.slimPlayer.server_assign | `base.server = guessServer(o)` | Objektfelder `server|prefix|world|realm|srv|group|groupname|shard` (`src/lib/import/parsers.ts:79,24-40,87`) |
| Direkt.import.players_list.detect | `isObj(json) && json.type === "players" && Array.isArray(json.players)` | `$.type`, `$.players` (`src/lib/import/parsers.ts:142`) |
| Direkt.import.players_list.safeParse.type | `type: "players"` (literal) | `$.type` (`src/lib/import/schemas.ts:3-7`, genutzt in `src/lib/import/parsers.ts:144`) |
| Direkt.import.players_list.safeParse.server | `server: z.string()` | `$.server` (`src/lib/import/schemas.ts:5`) |
| Direkt.import.players_list.safeParse.players | `players: z.array(z.record(z.string(), z.any()))` | `$.players[*]` (`src/lib/import/schemas.ts:6`) |
| Direkt.import.guilds_list.detect | `isObj(json) && json.type === "guilds" && Array.isArray(json.guilds)` | `$.type`, `$.guilds` (`src/lib/import/parsers.ts:151`) |
| Direkt.import.guilds_list.safeParse.type | `type: "guilds"` (literal) | `$.type` (`src/lib/import/schemas.ts:10-14`) |
| Direkt.import.guilds_list.safeParse.server | `server: z.string()` | `$.server` (`src/lib/import/schemas.ts:12`) |
| Direkt.import.guilds_list.safeParse.guilds | `guilds: z.array(z.record(z.string(), z.any()))` | `$.guilds[*]` (`src/lib/import/schemas.ts:13`) |
| Direkt.import.scan.detect | `isObj(json) && json.type === "scan" && typeof json.server === "string"` | `$.type`, `$.server` (`src/lib/import/parsers.ts:160`) |
| Direkt.import.scan.safeParse.type | `type: "scan"` (literal) | `$.type` (`src/lib/import/schemas.ts:17-21`) |
| Direkt.import.scan.safeParse.server | `server: z.string()` | `$.server` (`src/lib/import/schemas.ts:19`) |
| Direkt.import.scan.safeParse.data_optional | `data: z.record(...).optional()` | `$.data` (`src/lib/import/schemas.ts:20`) |
| Direkt.import.deepFindArrays.stack_seed | `stack = [root]` | JSON root (`src/lib/import/parsers.ts:94-97`) |
| Index.import.deepFindArrays.array_object_check | `Array.isArray(cur) && cur.length && isObj(cur[0])` | erstes Element `cur[0]` eines gefundenen Arrays (`src/lib/import/parsers.ts:100`) |
| Direkt.import.deepFindArrays.looksLikePlayer_name | `arr.some(o => o.name != null)` | gefundenes Array-Objektfeld `name` (`src/lib/import/parsers.ts:103-105`) |
| Direkt.import.deepFindArrays.looksLikePlayer_identifier | `arr.some(o => o.identifier != null)` | gefundenes Array-Objektfeld `identifier` (`src/lib/import/parsers.ts:103-105`) |
| Direkt.import.deepFindArrays.looksLikePlayer_id | `arr.some(o => o.id != null)` | gefundenes Array-Objektfeld `id` (`src/lib/import/parsers.ts:103-105`) |
| Direkt.import.deepFindArrays.looksLikePlayer_class | `arr.some(o => o.class != null)` | gefundenes Array-Objektfeld `class` (`src/lib/import/parsers.ts:103-105`) |
| Direkt.import.deepFindArrays.object_traversal | rekursiv über `Object.values(cur)` | alle Objektwerte im JSON (`src/lib/import/parsers.ts:108-110`) |
| Direkt.import.deep_fallback.players.server_guess | `up(guessServer(found.arr[0]) ?? "UNKNOWN")` | `found.arr[0].{server|prefix|world|realm|srv|group|groupname|shard}` (`src/lib/import/parsers.ts:176-178`) |
| Direkt.import.deep_fallback.players.playersSlim | `found.arr.map(slimPlayer)` | `found.arr[*]` (erstes gefundenes Objekt-Array) (`src/lib/import/parsers.ts:178`) |
| Direkt.import.deep_fallback.guilds.server_guess | `up(guessServer(found.arr[0]) ?? "UNKNOWN")` | `found.arr[0].{server|prefix|world|realm|srv|group|groupname|shard}` (`src/lib/import/parsers.ts:185`) |
| Direkt.import.deep_fallback.guilds_raw | `guilds: found.arr` | `found.arr[*]` (erstes gefundenes Objekt-Array) (`src/lib/import/parsers.ts:186`) |
| Direkt.latestValues.lookup.exact_map | `exact.set(key, value)` für alle `Object.entries(values)` | `$.values[*]` (`src/lib/parsing/latestValues.ts:234-236`) |
| Direkt.latestValues.lookup.canonical_map | `canonical.set(canonicalizeKey(key), value)` | canonicalisierte `$.values`-Keys (`src/lib/parsing/latestValues.ts:131,234-237`) |
| Direkt.latestValues.lookup.get_exact_first | `if (exact.has(key)) return exact.get(key)` | `$.values[<key>]` (`src/lib/parsing/latestValues.ts:239-244`) |
| Direkt.latestValues.lookup.get_canonical_fallback | `canonicalizeKey(requestedKey)` -> `canonical.get(canonicalKey)` | canonicalisierte Variante von `$.values`-Keys (`src/lib/parsing/latestValues.ts:241-244`) |
| Direkt.latestValues.className.Class | `lookup.text(["Class", ...])` | `$.values["Class"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:281`) |
| Direkt.latestValues.className.Class_Name | `lookup.text(["Class Name", ...])` | `$.values["Class Name"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:281`) |
| Direkt.latestValues.className.class | `lookup.text(["...", "class", ...])` | `$.values["class"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:281`) |
| Direkt.latestValues.className.className | `lookup.text(["...", "className"])` | `$.values["className"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:281`) |
| Direkt.latestValues.genericBase | `lookup.number(["Base"])` | `$.values["Base"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:283`) |
| Direkt.latestValues.combat.armor | `lookup.number(["Armor"])` | `$.values["Armor"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:286`) |
| Direkt.latestValues.combat.dmgMin | `lookup.number(["Damage Min"])` | `$.values["Damage Min"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:287`) |
| Direkt.latestValues.combat.dmgMax | `lookup.number(["Damage Max"])` | `$.values["Damage Max"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:288`) |
| Direkt.latestValues.combat.dmgAvg | `lookup.number(["Damage Avg"])` | `$.values["Damage Avg"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:289`) |
| Direkt.latestValues.combat.health | `lookup.number(["Health"])` | `$.values["Health"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:290`) |
| Direkt.latestValues.combat.weaponDamageMultiplier | `lookup.number(["Weapon Damage Multiplier"])` | `$.values["Weapon Damage Multiplier"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:291`) |
| Direkt.latestValues.combat.maximumDamageReduction | `lookup.number(["Maximum Damage Reduction"])` | `$.values["Maximum Damage Reduction"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:292`) |
| Direkt.latestValues.combat.dmgAvg_derived | wenn `dmgAvg == null` und `dmgMin/dmgMax != null`: `(dmgMin + dmgMax)/2` | abgeleitet aus `$.values["Damage Min"]` + `$.values["Damage Max"]` (`src/lib/parsing/latestValues.ts:294-296`) |
| Direkt.latestValues.attribute.total.strength | lookup.number(["Strength"]) | $.values["Strength"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) |
| Direkt.latestValues.attribute.base_specific.strength | lookup.number(["Base Strength"]) | $.values["Base Strength"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) |
| Direkt.latestValues.attribute.breakdown.strength.base_items | lookup.number(["Strength Base Items"]) | $.values["Strength Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.strength.upgrades | lookup.number(["Strength Upgrades"]) | $.values["Strength Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.strength.equipment | lookup.number(["Strength Equipment"]) | $.values["Strength Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.strength.gems | lookup.number(["Strength Gems"]) | $.values["Strength Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.strength.pet | lookup.number(["Strength Pet"]) | $.values["Strength Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.strength.potion | lookup.number(["Strength Potion"]) | $.values["Strength Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.strength.items | lookup.number(["Strength Items"]) | $.values["Strength Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.strength.pet_bonus | lookup.number(["Strength Pet Bonus"]) | $.values["Strength Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.total.dexterity | lookup.number(["Dexterity"]) | $.values["Dexterity"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) |
| Direkt.latestValues.attribute.base_specific.dexterity | lookup.number(["Base Dexterity"]) | $.values["Base Dexterity"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) |
| Direkt.latestValues.attribute.breakdown.dexterity.base_items | lookup.number(["Dexterity Base Items"]) | $.values["Dexterity Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.dexterity.upgrades | lookup.number(["Dexterity Upgrades"]) | $.values["Dexterity Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.dexterity.equipment | lookup.number(["Dexterity Equipment"]) | $.values["Dexterity Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.dexterity.gems | lookup.number(["Dexterity Gems"]) | $.values["Dexterity Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.dexterity.pet | lookup.number(["Dexterity Pet"]) | $.values["Dexterity Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.dexterity.potion | lookup.number(["Dexterity Potion"]) | $.values["Dexterity Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.dexterity.items | lookup.number(["Dexterity Items"]) | $.values["Dexterity Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.dexterity.pet_bonus | lookup.number(["Dexterity Pet Bonus"]) | $.values["Dexterity Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.total.intelligence | lookup.number(["Intelligence"]) | $.values["Intelligence"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) |
| Direkt.latestValues.attribute.base_specific.intelligence | lookup.number(["Base Intelligence"]) | $.values["Base Intelligence"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) |
| Direkt.latestValues.attribute.breakdown.intelligence.base_items | lookup.number(["Intelligence Base Items"]) | $.values["Intelligence Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.intelligence.upgrades | lookup.number(["Intelligence Upgrades"]) | $.values["Intelligence Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.intelligence.equipment | lookup.number(["Intelligence Equipment"]) | $.values["Intelligence Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.intelligence.gems | lookup.number(["Intelligence Gems"]) | $.values["Intelligence Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.intelligence.pet | lookup.number(["Intelligence Pet"]) | $.values["Intelligence Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.intelligence.potion | lookup.number(["Intelligence Potion"]) | $.values["Intelligence Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.intelligence.items | lookup.number(["Intelligence Items"]) | $.values["Intelligence Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.intelligence.pet_bonus | lookup.number(["Intelligence Pet Bonus"]) | $.values["Intelligence Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.total.constitution | lookup.number(["Constitution"]) | $.values["Constitution"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) |
| Direkt.latestValues.attribute.base_specific.constitution | lookup.number(["Base Constitution"]) | $.values["Base Constitution"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) |
| Direkt.latestValues.attribute.breakdown.constitution.base_items | lookup.number(["Constitution Base Items"]) | $.values["Constitution Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.constitution.upgrades | lookup.number(["Constitution Upgrades"]) | $.values["Constitution Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.constitution.equipment | lookup.number(["Constitution Equipment"]) | $.values["Constitution Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.constitution.gems | lookup.number(["Constitution Gems"]) | $.values["Constitution Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.constitution.pet | lookup.number(["Constitution Pet"]) | $.values["Constitution Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.constitution.potion | lookup.number(["Constitution Potion"]) | $.values["Constitution Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.constitution.items | lookup.number(["Constitution Items"]) | $.values["Constitution Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.constitution.pet_bonus | lookup.number(["Constitution Pet Bonus"]) | $.values["Constitution Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.total.luck | lookup.number(["Luck"]) | $.values["Luck"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) |
| Direkt.latestValues.attribute.base_specific.luck | lookup.number(["Base Luck"]) | $.values["Base Luck"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) |
| Direkt.latestValues.attribute.breakdown.luck.base_items | lookup.number(["Luck Base Items"]) | $.values["Luck Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.luck.upgrades | lookup.number(["Luck Upgrades"]) | $.values["Luck Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.luck.equipment | lookup.number(["Luck Equipment"]) | $.values["Luck Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.luck.gems | lookup.number(["Luck Gems"]) | $.values["Luck Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.luck.pet | lookup.number(["Luck Pet"]) | $.values["Luck Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.luck.potion | lookup.number(["Luck Potion"]) | $.values["Luck Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.luck.items | lookup.number(["Luck Items"]) | $.values["Luck Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.breakdown.luck.pet_bonus | lookup.number(["Luck Pet Bonus"]) | $.values["Luck Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) |
| Direkt.latestValues.attribute.base_fallback_mainAttr | falls `specificBase == null` und `entry.code == mainAttributeCode`: nutze `genericBase` | `$.values["Base"]` + Klasse aus `$.values["Class"|"Class Name"|"class"|"className"]` (`src/lib/parsing/latestValues.ts:281-283,301-303`) |
| Direkt.latestValues.attribute.bonus_derived | `bonus = total - base` falls beide vorhanden | abgeleitet aus Attribut-`total`/`base` (`src/lib/parsing/latestValues.ts:313`) |
| Direkt.latestValues.runes.gold | `lookup.number(["Rune Gold"])` | `$.values["Rune Gold"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:318`) |
| Direkt.latestValues.runes.xp | `lookup.number(["Rune XP"])` | `$.values["Rune XP"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:319`) |
| Direkt.latestValues.runes.chance | `lookup.number(["Rune Chance"])` | `$.values["Rune Chance"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:320`) |
| Direkt.latestValues.runes.quality | `lookup.number(["Rune Quality"])` | `$.values["Rune Quality"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:321`) |
| Direkt.latestValues.runes.health | `lookup.number(["Rune Health"])` | `$.values["Rune Health"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:322`) |
| Direkt.latestValues.runes.damage | `lookup.number(["Rune Damage"])` | `$.values["Rune Damage"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:323`) |
| Direkt.latestValues.runes.resist | `lookup.number(["Rune Resist"])` | `$.values["Rune Resist"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:324`) |
| Direkt.latestValues.resistances.fireResist | `lookup.number(["Fire Resist"])` | `$.values["Fire Resist"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:328`) |
| Direkt.latestValues.resistances.coldResist | `lookup.number(["Cold Resist"])` | `$.values["Cold Resist"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:329`) |
| Direkt.latestValues.resistances.lightningResist | `lookup.number(["Lightning Resist"])` | `$.values["Lightning Resist"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:330`) |
| Direkt.latestValues.resistances.fireDamage | `lookup.number(["Fire Damage"])` | `$.values["Fire Damage"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:331`) |
| Direkt.latestValues.resistances.coldDamage | `lookup.number(["Cold Damage"])` | `$.values["Cold Damage"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:332`) |
| Direkt.latestValues.resistances.lightningDamage | `lookup.number(["Lightning Damage"])` | `$.values["Lightning Damage"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:333`) |
| Direkt.latestValues.resistances.fireDamage_filter | wenn `fireDamage <= 0` dann `null` | abgeleitet aus `$.values["Fire Damage"]` (`src/lib/parsing/latestValues.ts:335`) |
| Direkt.latestValues.resistances.coldDamage_filter | wenn `coldDamage <= 0` dann `null` | abgeleitet aus `$.values["Cold Damage"]` (`src/lib/parsing/latestValues.ts:336`) |
| Direkt.latestValues.resistances.lightningDamage_filter | wenn `lightningDamage <= 0` dann `null` | abgeleitet aus `$.values["Lightning Damage"]` (`src/lib/parsing/latestValues.ts:337`) |
| Index.latestValues.potions.slot1_type | `lookup.text(["Potion 1 Type"])` | `$.values["Potion 1 Type"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) |
| Index.latestValues.potions.slot1_size | `lookup.number(["Potion 1 Size"])` | `$.values["Potion 1 Size"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) |
| Index.latestValues.potions.slot2_type | `lookup.text(["Potion 2 Type"])` | `$.values["Potion 2 Type"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) |
| Index.latestValues.potions.slot2_size | `lookup.number(["Potion 2 Size"])` | `$.values["Potion 2 Size"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) |
| Index.latestValues.potions.slot3_type | `lookup.text(["Potion 3 Type"])` | `$.values["Potion 3 Type"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) |
| Index.latestValues.potions.slot3_size | `lookup.number(["Potion 3 Size"])` | `$.values["Potion 3 Size"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) |
| Direkt.latestValues.potions.lifePotion | `lookup.boolYesNo(["Life Potion"])` | `$.values["Life Potion"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:345`) |
| Direkt.latestValues.fortress.meta.fortress | `lookup.number(["Fortress"])` | `$.values["Fortress"]` (`src/lib/parsing/latestValues.ts:350`) |
| Direkt.latestValues.fortress.meta.upgrades | `lookup.number(["Upgrades"])` | `$.values["Upgrades"]` (`src/lib/parsing/latestValues.ts:351`) |
| Direkt.latestValues.fortress.meta.fortifications | `lookup.number(["Fortifications"])` | `$.values["Fortifications"]` (`src/lib/parsing/latestValues.ts:352`) |
| Direkt.latestValues.fortress.meta.wall | `lookup.number(["Wall"])` | `$.values["Wall"]` (`src/lib/parsing/latestValues.ts:353`) |
| Direkt.latestValues.fortress.meta.space | `lookup.number(["Space"])` | `$.values["Space"]` (`src/lib/parsing/latestValues.ts:354`) |
| Direkt.latestValues.fortress.meta.quarters | `lookup.number(["Quarters"])` | `$.values["Quarters"]` (`src/lib/parsing/latestValues.ts:355`) |
| Direkt.latestValues.fortress.meta.portal | `lookup.number(["Portal"])` | `$.values["Portal"]` (`src/lib/parsing/latestValues.ts:356`) |
| Direkt.latestValues.fortress.buildings.woodcutter | `lookup.number(["Woodcutter"])` | `$.values["Woodcutter"]` (`src/lib/parsing/latestValues.ts:359`) |
| Direkt.latestValues.fortress.buildings.quarry | `lookup.number(["Quarry"])` | `$.values["Quarry"]` (`src/lib/parsing/latestValues.ts:360`) |
| Direkt.latestValues.fortress.buildings.gemMine | `lookup.number(["Gem Mine"])` | `$.values["Gem Mine"]` (`src/lib/parsing/latestValues.ts:361`) |
| Direkt.latestValues.fortress.buildings.academy | `lookup.number(["Academy"])` | `$.values["Academy"]` (`src/lib/parsing/latestValues.ts:362`) |
| Direkt.latestValues.fortress.buildings.smithy | `lookup.number(["Smithy"])` | `$.values["Smithy"]` (`src/lib/parsing/latestValues.ts:363`) |
| Direkt.latestValues.fortress.buildings.treasury | `lookup.number(["Treasury"])` | `$.values["Treasury"]` (`src/lib/parsing/latestValues.ts:364`) |
| Direkt.latestValues.fortress.buildings.barracks | `lookup.number(["Barracks"])` | `$.values["Barracks"]` (`src/lib/parsing/latestValues.ts:365`) |
| Direkt.latestValues.fortress.buildings.mageTower | `lookup.number(["Mage Tower"])` | `$.values["Mage Tower"]` (`src/lib/parsing/latestValues.ts:366`) |
| Direkt.latestValues.fortress.buildings.archeryGuild | `lookup.number(["Archery Guild"])` | `$.values["Archery Guild"]` (`src/lib/parsing/latestValues.ts:367`) |
| Direkt.latestValues.fortress.rank | `lookup.number(["Fortress Rank"])` | `$.values["Fortress Rank"]` (`src/lib/parsing/latestValues.ts:369`) |
| Direkt.latestValues.fortress.honor | `lookup.number(["Fortress Honor"])` | `$.values["Fortress Honor"]` (`src/lib/parsing/latestValues.ts:370`) |
| Direkt.latestValues.guildMeta.guild | `lookup.text(["Guild"])` | `$.values["Guild"]` (`src/lib/parsing/latestValues.ts:374`) |
| Direkt.latestValues.guildMeta.guildIdentifier | `lookup.text(["Guild Identifier"])` | `$.values["Guild Identifier"]` (`src/lib/parsing/latestValues.ts:375`) |
| Direkt.latestValues.guildMeta.role.Role | `lookup.text(["Role", "Guild Role"])` (Variante 1) | `$.values["Role"]` (`src/lib/parsing/latestValues.ts:376`) |
| Direkt.latestValues.guildMeta.role.Guild_Role | `lookup.text(["Role", "Guild Role"])` (Variante 2) | `$.values["Guild Role"]` (`src/lib/parsing/latestValues.ts:376`) |
| Direkt.latestValues.guildMeta.guildJoined | `parseDateTimeLoose(lookup.get(["Guild Joined"]))` | `$.values["Guild Joined"]` (`src/lib/parsing/latestValues.ts:377`) |
| Direkt.latestValues.guildMeta.guildPortal | `lookup.number(["Guild Portal"])` | `$.values["Guild Portal"]` (`src/lib/parsing/latestValues.ts:378`) |
| Direkt.latestValues.optionalProgress.raids | `lookup.number(["Raids"])` | `$.values["Raids"]` (`src/lib/parsing/latestValues.ts:383`) |
| Direkt.latestValues.optionalProgress.raidHonor | `lookup.number(["Raid Honor"])` | `$.values["Raid Honor"]` (`src/lib/parsing/latestValues.ts:384`) |
| Direkt.latestValues.optionalProgress.raidWood | `lookup.number(["Raid Wood"])` | `$.values["Raid Wood"]` (`src/lib/parsing/latestValues.ts:385`) |
| Direkt.latestValues.optionalProgress.raidStone | `lookup.number(["Raid Stone"])` | `$.values["Raid Stone"]` (`src/lib/parsing/latestValues.ts:386`) |
| Direkt.latestValues.optionalProgress.xp | `lookup.number(["XP"])` | `$.values["XP"]` (`src/lib/parsing/latestValues.ts:389`) |
| Direkt.latestValues.optionalProgress.xpRequired | `lookup.number(["XP Required"])` | `$.values["XP Required"]` (`src/lib/parsing/latestValues.ts:390`) |
| Direkt.latestValues.optionalProgress.xpTotal | `lookup.number(["XP Total"])` | `$.values["XP Total"]` (`src/lib/parsing/latestValues.ts:391`) |
| Direkt.latestValues.advanced.direct.ID | `lookup.get(["ID"])` -> `parseAdvancedValue` | `$.values["ID"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Identifier | `lookup.get(["Identifier"])` -> `parseAdvancedValue` | `$.values["Identifier"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Prefix | `lookup.get(["Prefix"])` -> `parseAdvancedValue` | `$.values["Prefix"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Server | `lookup.get(["Server"])` -> `parseAdvancedValue` | `$.values["Server"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Server_ID | `lookup.get(["Server ID"])` -> `parseAdvancedValue` | `$.values["Server ID"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Timestamp | `lookup.get(["Timestamp"])` -> `parseAdvancedValue` | `$.values["Timestamp"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.timestampRaw | `lookup.get(["timestampRaw"])` -> `parseAdvancedValue` | `$.values["timestampRaw"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Last_Active | `lookup.get(["Last Active"])` -> `parseAdvancedValue` | `$.values["Last Active"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Power | `lookup.get(["Power"])` -> `parseAdvancedValue` | `$.values["Power"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Registered | `lookup.get(["Registered"])` -> `parseAdvancedValue` | `$.values["Registered"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Webshop | `lookup.get(["Webshop"])` -> `parseAdvancedValue` | `$.values["Webshop"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Attribute_Type | `lookup.get(["Attribute Type"])` -> `parseAdvancedValue` | `$.values["Attribute Type"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Attribute_Size | `lookup.get(["Attribute Size"])` -> `parseAdvancedValue` | `$.values["Attribute Size"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Runes | `lookup.get(["Runes"])` -> `parseAdvancedValue` | `$.values["Runes"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.direct.Runes_e33 | `lookup.get(["Runes: e33"])` -> `parseAdvancedValue` | `$.values["Runes: e33"]` (`src/lib/parsing/latestValues.ts:395-426`) |
| Direkt.latestValues.advanced.pattern.index | zusätzliche Aufnahme, wenn Key `/index/i` matcht | `$.values[*]` (beliebiger Key mit `index`) (`src/lib/parsing/latestValues.ts:412-417,430-437`) |
| Direkt.latestValues.advanced.pattern.attribute_type_size | zusätzliche Aufnahme, wenn Key `/^attribute\s+(type|size)/i` matcht | `$.values[*]` (`src/lib/parsing/latestValues.ts:412-417,430-437`) |
| Direkt.latestValues.advanced.pattern.runes_prefix | zusätzliche Aufnahme, wenn Key `/^runes?:/i` matcht | `$.values[*]` (`src/lib/parsing/latestValues.ts:412-417,430-437`) |
| Direkt.latestValues.advanced.pattern_identity_time_power | zusätzliche Aufnahme, wenn Key `/(identifier|prefix|server id|timestamp|last active|power|registered|webshop)/i` matcht | `$.values[*]` (`src/lib/parsing/latestValues.ts:412-417,430-437`) |
