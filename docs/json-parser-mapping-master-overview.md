# JSON-Parser Master-Mapping-Übersicht (bereinigt)

Diese Datei ist eine strukturierte Master-Ansicht der bestehenden Rohaufnahme in `docs/json-parser-mapping-overview.md`.
Alle Einträge bleiben technisch am Code; es wurden keine Parser- oder Runtime-Logiken verändert.
`ownplayersave` wird weiterhin nicht eingeführt, da der aktuelle Code stattdessen `save`/`playerSave` verwendet.
Rohwerte in Spalte 4 basieren auf der Stichprobe `D:\\SFDataHub\\sfdatahub-discord-bot\\files_2025_12_07_12_31_02_593.json`.

## Legende

`Label` ist ein technisches Arbeitslabel aus der bestehenden Zuordnung.
`Wert` beschreibt den konkret gelesenen, transformierten oder abgeleiteten Roh-/Zwischenwert im Parser.
`Stelle in Json für Mapping` dokumentiert die echte JSON-Herkunft inkl. Fallback-/Pattern-Pfaden aus dem Code.

## Root / Source Mapping

Dieser Block enthält alles zur Quellen-Erkennung und Root-Struktur: Parser-Reihenfolge, `players`/`guilds`/`scan`, Own-Filter und Import-Deep-Fallback.
Enthalten sind außerdem Feldaufnahmen, die nicht auf `save[...]`-Indizes beruhen und nicht aus `latest.values` kommen.
Nicht enthalten sind Portrait-/Frame-Indexableitungen aus Save-Arrays und `latest.values`-Lookup-Mappings.
Fallbacks und Erkennungsvarianten bleiben separat sichtbar.

| Label | Wert | Stelle in Json für Mapping | Rohwert aus Feld (Beispieldatei) |
| --- | --- | --- | --- |
| Direkt.parseSfJson.players_array | `Array.isArray(parsed?.players) ? parsed.players : []` | `$.players` (`src/lib/parsing/parseSfJson.ts:342-344`) | players=346; own==1: 1 |
| Direkt.toOwnPlayer.filter_own_eq_1 | `raw.own === 1` (sonst verworfen) | `$.players[*].own` (`src/lib/parsing/parseSfJson.ts:289`) | own: vorhanden 346/346; Bsp: 1 |
| Direkt.toOwnPlayer.identifier | `toTrimmedString(raw.identifier)` | `$.players[*].identifier` (`src/lib/parsing/parseSfJson.ts:291`) | identifier: vorhanden 346/346; Bsp: 's5_eu_p1859' |
| Direkt.toOwnPlayer.server | `toTrimmedString(raw.prefix)` | `$.players[*].prefix` (`src/lib/parsing/parseSfJson.ts:292`) | prefix: vorhanden 346/346; Bsp: 's5_eu' |
| Direkt.toOwnPlayer.playerId_from_identifier | `Number.parseInt(identifier.match(/_p(\d+)$/i)[1], 10)` | `$.players[*].identifier` (`src/lib/parsing/parseSfJson.ts:26-30,295`) | identifier: vorhanden 346/346; Bsp: 's5_eu_p1859' |
| Direkt.toOwnPlayer.name | `toTrimmedString(raw.name)` | `$.players[*].name` (`src/lib/parsing/parseSfJson.ts:306`) | name: vorhanden 346/346; Bsp: 'Darth Monk' |
| Direkt.toOwnPlayer.description | `raw.description` wenn `typeof raw.description === "string"` | `$.players[*].description` (`src/lib/parsing/parseSfJson.ts`) | description: vorhanden 346/346; Bsp: '  Good soldiers follow orders !$b         Execute Order 6...' |
| Direkt.toOwnPlayer.guildName_primary | `toTrimmedString(raw.guildName)` | `$.players[*].guildName` (`src/lib/parsing/parseSfJson.ts:307-308`) | guildName: nicht vorhanden in players (0/346) |
| Direkt.toOwnPlayer.guildName_fallback | `raw.group` wenn String und `guildName` leer | `$.players[*].group` (`src/lib/parsing/parseSfJson.ts:308`) | group: vorhanden 346/346; Bsp: 's5_eu_g14' |
| Direkt.toOwnPlayer.dungeons | `parseDungeons(raw.dungeons)` | `$.players[*].dungeons` (`src/lib/parsing/parseSfJson.ts:309`) | dungeons: vorhanden 1/346; Bsp: Objekt(keys=2) |
| Direkt.parseDungeons.modern.light_array | `asNumberArray(raw.light)` | `$.players[*].dungeons.light` (`src/lib/parsing/parseSfJson.ts:110`) | dungeons.light: Array(len=37; first=10) |
| Direkt.parseDungeons.modern.shadow_array | `asNumberArray(raw.shadow)` | `$.players[*].dungeons.shadow` (`src/lib/parsing/parseSfJson.ts:111`) | dungeons.shadow: Array(len=37; first=10) |
| Index.parseDungeons.modern.mapping_loop | `PLAYA_TO_INTERNAL_MAPPING.forEach((playaIndex, internalIndex) => normal[internalIndex]=light[playaIndex], shadow[internalIndex]=shadow[playaIndex])` | `$.players[*].dungeons.light[0..36]`, `$.players[*].dungeons.shadow[0..36]` (`src/lib/parsing/parseSfJson.ts:117-120`) | dungeons.light[0]=10; dungeons.shadow[0]=10 |
| Index.parseDungeons.modern.tower | `tower = light[14]` | `$.players[*].dungeons.light[14]` (`src/lib/parsing/parseSfJson.ts:128`) | dungeons.light[14]=100 |
| Index.parseDungeons.modern.twister | `twister = shadow[14]` | `$.players[*].dungeons.shadow[14]` (`src/lib/parsing/parseSfJson.ts:129`) | dungeons.shadow[14]=1000 |
| Index.parseDungeons.modern.player | `player = light[17]` | `$.players[*].dungeons.light[17]` (`src/lib/parsing/parseSfJson.ts:127`) | dungeons.light[17]=50 |
| Index.parseDungeons.modern.youtube | `youtube = shadow[17]` | `$.players[*].dungeons.shadow[17]` (`src/lib/parsing/parseSfJson.ts:131`) | dungeons.shadow[17]=30 |
| Index.parseDungeons.modern.sandstorm | `sandstorm = light[31]` | `$.players[*].dungeons.light[31]` (`src/lib/parsing/parseSfJson.ts:132`) | dungeons.light[31]=68 |
| Direkt.parseDungeons.legacy.normal_array | `asNumberArray(raw.Normal ?? raw.normal)` | `$.players[*].dungeons.Normal` / `$.players[*].dungeons.normal` (`src/lib/parsing/parseSfJson.ts:78`) | n/a (in Stichprobe nur modernes `dungeons.light/shadow`) |
| Direkt.parseDungeons.legacy.shadow_array | `asNumberArray(raw.Shadow ?? raw.shadow)` | `$.players[*].dungeons.Shadow` / `$.players[*].dungeons.shadow` (`src/lib/parsing/parseSfJson.ts:79`) | n/a (in Stichprobe nur modernes `dungeons.light/shadow`) |
| Direkt.parseDungeons.legacy.group_raid_fields | `group = raw.Group/raw.group`, `raid = raw.Raid/raw.raid` (Fallback) | `$.players[*].dungeons.{Group|group|Raid|raid}` (`src/lib/parsing/parseSfJson.ts:84,88`) | n/a (in Stichprobe nur modernes `dungeons.light/shadow`) |
| Direkt.toOwnPlayer.groupTournament | `parseGroupTournament(raw.gtsave)` | `$.players[*].gtsave` (`src/lib/parsing/parseSfJson.ts:310`) | gtsave: vorhanden 1/346; Bsp: Objekt(keys=3) |
| Direkt.parseGroupTournament.tokens | `tokens = toFiniteNumberOrNull(raw.tokens)` | `$.players[*].gtsave.tokens` (`src/lib/parsing/parseSfJson.ts:180`) | gtsave.tokens=122316 |
| Direkt.parseGroupTournament.floor | `floor = toFiniteNumberOrNull(raw.floor)` | `$.players[*].gtsave.floor` (`src/lib/parsing/parseSfJson.ts:181`) | gtsave.floor=10330 |
| Direkt.parseGroupTournament.floorMax | `floorMax = toFiniteNumberOrNull(raw.floor_max ?? raw.floorMax)` | `$.players[*].gtsave.floor_max` / `$.players[*].gtsave.floorMax` (`src/lib/parsing/parseSfJson.ts:182`) | gtsave.floor_max=345 |
| Direkt.parseGroupTournament.rank | `rank = toFiniteNumberOrNull(raw.rank)` | `$.players[*].gtsave.rank` (`src/lib/parsing/parseSfJson.ts:183`) | gtsave.rank: nicht vorhanden (0/1) |
| Direkt.toOwnPlayer.resources | `parseResources(raw.resources)` | `$.players[*].resources` (`src/lib/parsing/parseSfJson.ts:311`) | resources: vorhanden 1/346; Bsp: Array(len=17; first=1859) |
| Index.parseResources.skip_id | `resources[0]` wird bewusst übersprungen (`skip(1)`-Äquivalent aus `model.txt`) | `$.players[*].resources[0]` (`src/lib/parsing/parseSfJson.ts:190-211`) | resources[0]=1859 |
| Index.parseResources.mushrooms | `mushrooms = resources[1]` | `$.players[*].resources[1]` (`src/lib/parsing/parseSfJson.ts:195`) | resources[1]=93 |
| Index.parseResources.gold | `gold = resources[2]` | `$.players[*].resources[2]` (`src/lib/parsing/parseSfJson.ts:196`) | resources[2]=1015031509 |
| Index.parseResources.coins | `coins = resources[3]` | `$.players[*].resources[3]` (`src/lib/parsing/parseSfJson.ts:197`) | resources[3]=6 |
| Index.parseResources.hourglass | `hourglass = resources[4]` | `$.players[*].resources[4]` (`src/lib/parsing/parseSfJson.ts:198`) | resources[4]=6886 |
| Index.parseResources.wood | `wood = resources[5]` | `$.players[*].resources[5]` (`src/lib/parsing/parseSfJson.ts:199`) | resources[5]=3108587667 |
| Index.parseResources.secretWood | `secretWood = resources[6]` | `$.players[*].resources[6]` (`src/lib/parsing/parseSfJson.ts:200`) | resources[6]=90000000 |
| Index.parseResources.stone | `stone = resources[7]` | `$.players[*].resources[7]` (`src/lib/parsing/parseSfJson.ts:201`) | resources[7]=1046384291 |
| Index.parseResources.secretStone | `secretStone = resources[8]` | `$.players[*].resources[8]` (`src/lib/parsing/parseSfJson.ts:202`) | resources[8]=30000000 |
| Index.parseResources.metal | `metal = resources[9]` | `$.players[*].resources[9]` (`src/lib/parsing/parseSfJson.ts:203`) | resources[9]=5967493 |
| Index.parseResources.crystals | `crystals = resources[10]` | `$.players[*].resources[10]` (`src/lib/parsing/parseSfJson.ts:204`) | resources[10]=2152148 |
| Index.parseResources.souls | `souls = resources[11]` | `$.players[*].resources[11]` (`src/lib/parsing/parseSfJson.ts:205`) | resources[11]=1978045413 |
| Index.parseResources.shadowFood | `shadowFood = resources[12]` | `$.players[*].resources[12]` (`src/lib/parsing/parseSfJson.ts:206`) | resources[12]=539 |
| Index.parseResources.lightFood | `lightFood = resources[13]` | `$.players[*].resources[13]` (`src/lib/parsing/parseSfJson.ts:207`) | resources[13]=514 |
| Index.parseResources.earthFood | `earthFood = resources[14]` | `$.players[*].resources[14]` (`src/lib/parsing/parseSfJson.ts:208`) | resources[14]=617 |
| Index.parseResources.fireFood | `fireFood = resources[15]` | `$.players[*].resources[15]` (`src/lib/parsing/parseSfJson.ts:209`) | resources[15]=551 |
| Index.parseResources.waterFood | `waterFood = resources[16]` | `$.players[*].resources[16]` (`src/lib/parsing/parseSfJson.ts:210`) | resources[16]=552 |
| Direkt.toOwnPlayer.equippedItems | `parseEquippedItems(raw.equippedItems)` | `$.players[*].equippedItems` (`src/lib/parsing/parseSfJson.ts:577`) | equippedItems: vorhanden 346/346; Bsp: Array(len=191; first=6) |
| Direkt.toOwnPlayer.backpackItems | `parseBackpackItems(raw.backpackItems)` | `$.players[*].backpackItems` (`src/lib/parsing/parseSfJson.ts:578`) | backpackItems: vorhanden 1/346; Bsp: Array(len=951; first=0) |
| Direkt.toOwnPlayer.companionItems | `parseCompanionItems(raw.companionItems)` | `$.players[*].companionItems` (`src/lib/parsing/parseSfJson.ts:579`) | companionItems: vorhanden 1/346; Bsp: Array(len=571; first=6) |
| Direkt.toOwnPlayer.dummyItems | `parseDummyItems(raw.dummyItems)` | `$.players[*].dummyItems` (`src/lib/parsing/parseSfJson.ts`) | dummyItems: vorhanden 1/346; Bsp: Array(len=191; first=0) |
| Direkt.toOwnPlayer.shakesItems | `parseShopItems(raw.shakesItems)` | `$.players[*].shakesItems` (`src/lib/parsing/parseSfJson.ts`) | shakesItems: vorhanden 1/346; Bsp: Array(len=115; first=3) |
| Direkt.toOwnPlayer.fidgetItems | `parseShopItems(raw.fidgetItems)` | `$.players[*].fidgetItems` (`src/lib/parsing/parseSfJson.ts`) | fidgetItems: vorhanden 1/346; Bsp: Array(len=115; first=12) |
| Direkt.toOwnPlayer.pets | `parsePets(raw.pets)` | `$.players[*].pets` (`src/lib/parsing/parseSfJson.ts:580`) | pets: vorhanden 346/346; Bsp: Array(len=266; first=1859) |
| Direkt.toOwnPlayer.scrapbook | `parseScrapbook(raw.scrapbook)` | `$.players[*].scrapbook` (`src/lib/parsing/parseSfJson.ts:581`) | scrapbook: vorhanden 1/346; Bsp: String(len=708) |
| Direkt.toOwnPlayer.legendaryScrapbook | `parseScrapbook(raw.scrapbook_legendary)` | `$.players[*].scrapbook_legendary` (`src/lib/parsing/parseSfJson.ts:582`) | scrapbook_legendary: vorhanden 1/346; Bsp: String(len=64) |
| Direkt.toOwnPlayer.idle | `parseIdle(raw.idle)` | `$.players[*].idle` (`src/lib/parsing/parseSfJson.ts:583`) | idle: vorhanden 1/346; Bsp: Array(len=118; first=0) |
| Direkt.toOwnPlayer.dailyTasks | `parseDailyTasks(raw.dailyTasks, raw.dailyTasksRewards)` | `$.players[*].dailyTasks`, `$.players[*].dailyTasksRewards` (`src/lib/parsing/parseSfJson.ts:584`) | dailyTasks: vorhanden 1/346; Bsp: Array(len=57; first=5) \| dailyTasksRewards: vorhanden 1/346; Bsp: Array(len=15; first=1) |
| Direkt.toOwnPlayer.achievements | `parseAchievements(raw.achievements)` | `$.players[*].achievements` (`src/lib/parsing/parseSfJson.ts`) | achievements: vorhanden 1/346; Bsp: Array(len=231; first=1) |
| Direkt.toOwnPlayer.calendar | `parseCalendar(raw.calendar)` | `$.players[*].calendar` (`src/lib/parsing/parseSfJson.ts`) | calendar: vorhanden 1/346; Bsp: Array(len=40; first=24) |
| Direkt.toOwnPlayer.units | `parseUnits(raw.units)` | `$.players[*].units` (`src/lib/parsing/parseSfJson.ts`) | units: vorhanden 346/346; Bsp: Array(len=5; first=5) |
| Direkt.toOwnPlayer.witch | `parseWitch(raw.witch, raw.offset)` | `$.players[*].witch`, `$.players[*].offset` (`src/lib/parsing/parseSfJson.ts`) | witch: vorhanden 1/346; Bsp: Array(len=51; first=9) |
| Direkt.toOwnPlayer.timestamp | `parseFiniteNumber(raw.timestamp)` | `$.players[*].timestamp` (`src/lib/parsing/parseSfJson.ts`) | timestamp: vorhanden 346/346; Bsp: 1764957283804 |
| Direkt.toOwnPlayer.fortressRank | `parseFiniteNumber(raw.fortressrank)` | `$.players[*].fortressrank` (`src/lib/parsing/parseSfJson.ts`) | fortressrank: vorhanden 345/346; Bsp: 2329 |
| Direkt.toOwnPlayer.version | `parseFiniteNumber(raw.version)` | `$.players[*].version` (`src/lib/parsing/parseSfJson.ts`) | version: vorhanden 346/346; Bsp: 2015 |
| Direkt.toOwnPlayer.webshopId | `parseWebshopId(raw.webshopid)` | `$.players[*].webshopid` (`src/lib/parsing/parseSfJson.ts`) | webshopid: vorhanden 1/346; Bsp: 'VbGl8Msf$r466' |
| Direkt.parseSfJson.ownPlayer | `ownPlayers[0] ?? null` | abgeleitet aus `$.players[*]` (`src/lib/parsing/parseSfJson.ts:349`) | identifier='s5_eu_p1859'; own=1 |
| Direkt.parseSfJson.playersCount | `players.length` | abgeleitet aus `$.players` (`src/lib/parsing/parseSfJson.ts:350`) | players=346; own==1: 1 |
| Direkt.import.detectPayloadAsync.parser_order | Parser-Reihenfolge: `sftools-players-bare -> players-list -> guilds-list -> scan -> deep-fallback` | JSON root wird gegen alle Parser in dieser Reihenfolge geprüft (`src/lib/import/parsers.ts:122-193,196-207`) | Top-Level: players, groups |
| Direkt.import.sftools_players_bare.detect | `isObj(json) && Array.isArray(json.players)` | `$.players` (`src/lib/import/parsers.ts:126`) | players=346; own==1: 1 |
| Direkt.import.sftools_players_bare.arr_source | `arr = json.players` | `$.players[*]` (`src/lib/import/parsers.ts:128`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Index.import.sftools_players_bare.server_guess_arr0 | `guessServer(arr[0])` | `$.players[0].{server|prefix|world|realm|srv|group|groupname|shard}` (`src/lib/import/parsers.ts:130,24-40`) | prefix='s5_eu'; group='s5_eu_g14'; groupname='Order 66' |
| Direkt.import.sftools_players_bare.server_guess_root | `guessServer(json)` (Fallback) | `$.{server|prefix|world|realm|srv|group|groupname|shard}` (`src/lib/import/parsers.ts:130,24-40`) | keiner der Root-Kandidaten vorhanden |
| Direkt.import.sftools_players_bare.server_default | `"UNKNOWN"` wenn kein Server gefunden | kein JSON-Feld (Code-Fallback) (`src/lib/import/parsers.ts:130`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.guessServer.group_transform | `o.group.split("_").slice(0,2).join("_")` | Objektfeld `group` (`src/lib/import/parsers.ts:25-27`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.guessServer.groupname_transform | `o.groupname.split(" ")[0]` | Objektfeld `groupname` (`src/lib/import/parsers.ts:27-29`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.guessServer.priority | Priorität: `server -> prefix -> world -> realm -> srv -> fromGroup -> fromGroupName -> shard` | jeweilige Objektfelder (`src/lib/import/parsers.ts:30-38`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.guessServer.normalize | `up(s)` = `String(s).trim().toUpperCase()` | gefundener Serverwert (`src/lib/import/parsers.ts:16-18,40`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.pickFirst.key_transform_lower | pro Key zusätzlich `o[k.toLowerCase()]` | jeweiliges Objektfeld (Fallback) (`src/lib/import/parsers.ts:45-48`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.pickFirst.key_transform_upper | pro Key zusätzlich `o[k.toUpperCase()]` | jeweiliges Objektfeld (Fallback) (`src/lib/import/parsers.ts:46-48`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.pickFirst.key_transform_spaced | pro Key zusätzlich `o[k.replace(/_/g," ")]` | jeweiliges Objektfeld (Fallback) (`src/lib/import/parsers.ts:49-50`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.slimPlayer.id.pickFirst.id | pickFirst(o, …) Treffer auf Schlüssel "id" | $.players[*].id bzw. Deep-Fallback-Objekt.id (`src/lib/import/parsers.ts:74-78,42-53`) | id bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.id.pickFirst.identifier | pickFirst(o, …) Treffer auf Schlüssel "identifier" | $.players[*].identifier bzw. Deep-Fallback-Objekt.identifier (`src/lib/import/parsers.ts:74-78,42-53`) | identifier bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.id.pickFirst.link_identifier | pickFirst(o, …) Treffer auf Schlüssel "link identifier" | $.players[*].link identifier bzw. Deep-Fallback-Objekt.link identifier (`src/lib/import/parsers.ts:74-78,42-53`) | link identifier bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.id.pickFirst.player_id | pickFirst(o, …) Treffer auf Schlüssel "player_id" | $.players[*].player_id bzw. Deep-Fallback-Objekt.player_id (`src/lib/import/parsers.ts:74-78,42-53`) | player_id bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.id.pickFirst.pid | pickFirst(o, …) Treffer auf Schlüssel "pid" | $.players[*].pid bzw. Deep-Fallback-Objekt.pid (`src/lib/import/parsers.ts:74-78,42-53`) | pid bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.id.pickFirst.playerid | pickFirst(o, …) Treffer auf Schlüssel "playerid" | $.players[*].playerid bzw. Deep-Fallback-Objekt.playerid (`src/lib/import/parsers.ts:74-78,42-53`) | playerid bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.id.pickFirst.ID | pickFirst(o, …) Treffer auf Schlüssel "ID" | $.players[*].ID bzw. Deep-Fallback-Objekt.ID (`src/lib/import/parsers.ts:74-78,42-53`) | ID bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.id.pickFirst.Identifier | pickFirst(o, …) Treffer auf Schlüssel "Identifier" | $.players[*].Identifier bzw. Deep-Fallback-Objekt.Identifier (`src/lib/import/parsers.ts:74-78,42-53`) | Identifier bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.name.pickFirst.name | pickFirst(o, …) Treffer auf Schlüssel "name" | $.players[*].name bzw. Deep-Fallback-Objekt.name (`src/lib/import/parsers.ts:74-78,42-53`) | name bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.name.pickFirst.player | pickFirst(o, …) Treffer auf Schlüssel "player" | $.players[*].player bzw. Deep-Fallback-Objekt.player (`src/lib/import/parsers.ts:74-78,42-53`) | player bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.name.pickFirst.player_name | pickFirst(o, …) Treffer auf Schlüssel "player_name" | $.players[*].player_name bzw. Deep-Fallback-Objekt.player_name (`src/lib/import/parsers.ts:74-78,42-53`) | player_name bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.name.pickFirst.nickname | pickFirst(o, …) Treffer auf Schlüssel "nickname" | $.players[*].nickname bzw. Deep-Fallback-Objekt.nickname (`src/lib/import/parsers.ts:74-78,42-53`) | nickname bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.name.pickFirst.nick | pickFirst(o, …) Treffer auf Schlüssel "nick" | $.players[*].nick bzw. Deep-Fallback-Objekt.nick (`src/lib/import/parsers.ts:74-78,42-53`) | nick bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.name.pickFirst.Character_Name | pickFirst(o, …) Treffer auf Schlüssel "Character Name" | $.players[*].Character Name bzw. Deep-Fallback-Objekt.Character Name (`src/lib/import/parsers.ts:74-78,42-53`) | Character Name bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.class.pickFirst.class | pickFirst(o, …) Treffer auf Schlüssel "class" | $.players[*].class bzw. Deep-Fallback-Objekt.class (`src/lib/import/parsers.ts:74-78,42-53`) | class bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.class.pickFirst.classname | pickFirst(o, …) Treffer auf Schlüssel "classname" | $.players[*].classname bzw. Deep-Fallback-Objekt.classname (`src/lib/import/parsers.ts:74-78,42-53`) | classname bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.class.pickFirst.class_name | pickFirst(o, …) Treffer auf Schlüssel "class_name" | $.players[*].class_name bzw. Deep-Fallback-Objekt.class_name (`src/lib/import/parsers.ts:74-78,42-53`) | class_name bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.class.pickFirst.cls | pickFirst(o, …) Treffer auf Schlüssel "cls" | $.players[*].cls bzw. Deep-Fallback-Objekt.cls (`src/lib/import/parsers.ts:74-78,42-53`) | cls bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.class.pickFirst.Role | pickFirst(o, …) Treffer auf Schlüssel "Role" | $.players[*].Role bzw. Deep-Fallback-Objekt.Role (`src/lib/import/parsers.ts:74-78,42-53`) | Role bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.class.pickFirst.Class | pickFirst(o, …) Treffer auf Schlüssel "Class" | $.players[*].Class bzw. Deep-Fallback-Objekt.Class (`src/lib/import/parsers.ts:74-78,42-53`) | Class bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.level.pickFirst.level | pickFirst(o, …) Treffer auf Schlüssel "level" | $.players[*].level bzw. Deep-Fallback-Objekt.level (`src/lib/import/parsers.ts:74-78,42-53`) | level bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.level.pickFirst.lvl | pickFirst(o, …) Treffer auf Schlüssel "lvl" | $.players[*].lvl bzw. Deep-Fallback-Objekt.lvl (`src/lib/import/parsers.ts:74-78,42-53`) | lvl bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.level.pickFirst.lv | pickFirst(o, …) Treffer auf Schlüssel "lv" | $.players[*].lv bzw. Deep-Fallback-Objekt.lv (`src/lib/import/parsers.ts:74-78,42-53`) | lv bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.level.pickFirst.Level | pickFirst(o, …) Treffer auf Schlüssel "Level" | $.players[*].Level bzw. Deep-Fallback-Objekt.Level (`src/lib/import/parsers.ts:74-78,42-53`) | Level bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.guildId.pickFirst.guildid | pickFirst(o, …) Treffer auf Schlüssel "guildid" | $.players[*].guildid bzw. Deep-Fallback-Objekt.guildid (`src/lib/import/parsers.ts:74-78,42-53`) | guildid bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.guildId.pickFirst.guild_id | pickFirst(o, …) Treffer auf Schlüssel "guild_id" | $.players[*].guild_id bzw. Deep-Fallback-Objekt.guild_id (`src/lib/import/parsers.ts:74-78,42-53`) | guild_id bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.guildId.pickFirst.guild | pickFirst(o, …) Treffer auf Schlüssel "guild" | $.players[*].guild bzw. Deep-Fallback-Objekt.guild (`src/lib/import/parsers.ts:74-78,42-53`) | guild bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.guildId.pickFirst.Guild | pickFirst(o, …) Treffer auf Schlüssel "Guild" | $.players[*].Guild bzw. Deep-Fallback-Objekt.Guild (`src/lib/import/parsers.ts:74-78,42-53`) | Guild bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.guildId.pickFirst.Guild_ID | pickFirst(o, …) Treffer auf Schlüssel "Guild ID" | $.players[*].Guild ID bzw. Deep-Fallback-Objekt.Guild ID (`src/lib/import/parsers.ts:74-78,42-53`) | Guild ID bzw: nicht vorhanden in players (0/346) |
| Direkt.import.slimPlayer.id_assign | `base.id = String(id)` wenn `id != null` | aus pickFirst-ID-Quellen (`src/lib/import/parsers.ts:81`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.slimPlayer.name_assign | `base.name = String(name)` wenn `name != null` | aus pickFirst-Name-Quellen (`src/lib/import/parsers.ts:82`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.slimPlayer.class_assign | `base.class = (typeof cls === "number" ? cls : String(cls))` | aus pickFirst-Class-Quellen (`src/lib/import/parsers.ts:84`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.slimPlayer.level_assign | `base.level = toNumMaybe(lvl)` | aus pickFirst-Level-Quellen (`src/lib/import/parsers.ts:85`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.slimPlayer.level_toNumMaybe | `Number(String(v).replace(",", "."))` wenn finite, sonst `undefined` | Quellfeld aus Level-Key (`src/lib/import/parsers.ts:55-59`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.slimPlayer.guildId_assign | `base.guildId = String(guildId)` | aus pickFirst-GuildId-Quellen (`src/lib/import/parsers.ts:86`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.slimPlayer.server_assign | `base.server = guessServer(o)` | Objektfelder `server|prefix|world|realm|srv|group|groupname|shard` (`src/lib/import/parsers.ts:79,24-40,87`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.players_list.detect | `isObj(json) && json.type === "players" && Array.isArray(json.players)` | `$.type`, `$.players` (`src/lib/import/parsers.ts:142`) | players=346; own==1: 1 |
| Direkt.import.players_list.safeParse.type | `type: "players"` (literal) | `$.type` (`src/lib/import/schemas.ts:3-7`, genutzt in `src/lib/import/parsers.ts:144`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.players_list.safeParse.server | `server: z.string()` | `$.server` (`src/lib/import/schemas.ts:5`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.players_list.safeParse.players | `players: z.array(z.record(z.string(), z.any()))` | `$.players[*]` (`src/lib/import/schemas.ts:6`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.guilds_list.detect | `isObj(json) && json.type === "guilds" && Array.isArray(json.guilds)` | `$.type`, `$.guilds` (`src/lib/import/parsers.ts:151`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.guilds_list.safeParse.type | `type: "guilds"` (literal) | `$.type` (`src/lib/import/schemas.ts:10-14`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.guilds_list.safeParse.server | `server: z.string()` | `$.server` (`src/lib/import/schemas.ts:12`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.guilds_list.safeParse.guilds | `guilds: z.array(z.record(z.string(), z.any()))` | `$.guilds[*]` (`src/lib/import/schemas.ts:13`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.scan.detect | `isObj(json) && json.type === "scan" && typeof json.server === "string"` | `$.type`, `$.server` (`src/lib/import/parsers.ts:160`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.scan.safeParse.type | `type: "scan"` (literal) | `$.type` (`src/lib/import/schemas.ts:17-21`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.scan.safeParse.server | `server: z.string()` | `$.server` (`src/lib/import/schemas.ts:19`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.scan.safeParse.data_optional | `data: z.record(...).optional()` | `$.data` (`src/lib/import/schemas.ts:20`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deepFindArrays.stack_seed | `stack = [root]` | JSON root (`src/lib/import/parsers.ts:94-97`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Index.import.deepFindArrays.array_object_check | `Array.isArray(cur) && cur.length && isObj(cur[0])` | erstes Element `cur[0]` eines gefundenen Arrays (`src/lib/import/parsers.ts:100`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deepFindArrays.looksLikePlayer_name | `arr.some(o => o.name != null)` | gefundenes Array-Objektfeld `name` (`src/lib/import/parsers.ts:103-105`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deepFindArrays.looksLikePlayer_identifier | `arr.some(o => o.identifier != null)` | gefundenes Array-Objektfeld `identifier` (`src/lib/import/parsers.ts:103-105`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deepFindArrays.looksLikePlayer_id | `arr.some(o => o.id != null)` | gefundenes Array-Objektfeld `id` (`src/lib/import/parsers.ts:103-105`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deepFindArrays.looksLikePlayer_class | `arr.some(o => o.class != null)` | gefundenes Array-Objektfeld `class` (`src/lib/import/parsers.ts:103-105`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deepFindArrays.object_traversal | rekursiv über `Object.values(cur)` | alle Objektwerte im JSON (`src/lib/import/parsers.ts:108-110`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deep_fallback.players.server_guess | `up(guessServer(found.arr[0]) ?? "UNKNOWN")` | `found.arr[0].{server|prefix|world|realm|srv|group|groupname|shard}` (`src/lib/import/parsers.ts:176-178`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deep_fallback.players.playersSlim | `found.arr.map(slimPlayer)` | `found.arr[*]` (erstes gefundenes Objekt-Array) (`src/lib/import/parsers.ts:178`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deep_fallback.guilds.server_guess | `up(guessServer(found.arr[0]) ?? "UNKNOWN")` | `found.arr[0].{server|prefix|world|realm|srv|group|groupname|shard}` (`src/lib/import/parsers.ts:185`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Direkt.import.deep_fallback.guilds_raw | `guilds: found.arr` | `found.arr[*]` (erstes gefundenes Objekt-Array) (`src/lib/import/parsers.ts:186`) | n/a (kein direktes Quellfeld in Beispieldatei) |

## Save / Index Mapping

Dieser Block umfasst alle Save-bezogenen Pfade inklusive `save` vs `playerSave`, `saveString`-Fallback und die konkreten Indexzugriffe.
Auch Portrait-/Frame-Ableitungen aus `extractPortrait` und `portraitFromSave` sind hier vollständig enthalten.
Der Fokus liegt auf indexbasiertem Lesen (`save[17]`, `save[705]`, usw.) und den daraus gebildeten Werten.
Nicht enthalten sind Root-Erkennungsregeln und `latest.values`-Lookups.

| Label | Wert | Stelle in Json für Mapping | Rohwert aus Feld (Beispieldatei) |
| --- | --- | --- | --- |
| Direkt.toOwnPlayer.saveField_primary | `raw.save` | `$.players[*].save` (`src/lib/parsing/parseSfJson.ts:298`) | save: vorhanden 346/346; Bsp: Array(len=763; first=61433955) |
| Direkt.toOwnPlayer.saveField_fallback | `raw.playerSave` (nur wenn `raw.save` null/undefined) | `$.players[*].playerSave` (`src/lib/parsing/parseSfJson.ts:298`) | playerSave: nicht vorhanden in players (0/346) |
| Direkt.toOwnPlayer.saveArray | `saveField` wenn `Array.isArray(saveField)` | `$.players[*].save` oder `$.players[*].playerSave` (`src/lib/parsing/parseSfJson.ts:298-299`) | save: vorhanden 346/346; Bsp: Array(len=763; first=61433955) \| playerSave: nicht vorhanden in players (0/346) |
| Direkt.toOwnPlayer.saveString_from_saveField | `saveField` wenn `typeof saveField === "string"` | `$.players[*].save` oder `$.players[*].playerSave` (`src/lib/parsing/parseSfJson.ts:300-303`) | save: vorhanden 346/346; Bsp: Array(len=763; first=61433955) \| playerSave: nicht vorhanden in players (0/346) |
| Direkt.toOwnPlayer.saveString_fallback | `raw.saveString` wenn `saveField` kein String ist | `$.players[*].saveString` (`src/lib/parsing/parseSfJson.ts:303-305`) | saveString: nicht vorhanden in players (0/346) |
| Direkt.toOwnPlayer.portrait_from_saveArray | `extractPortraitFromSaveArray(saveArray)` | `$.players[*].save`/`$.players[*].playerSave` als Array (`src/lib/parsing/parseSfJson.ts:315-316`) | save: vorhanden 346/346; Bsp: Array(len=763; first=61433955) \| playerSave: nicht vorhanden in players (0/346) |
| Direkt.toOwnPlayer.portrait_from_saveString | `parseSaveStringToArray(saveString)` -> `extractPortraitFromSaveArray(parsedSave)` | `$.players[*].save`/`$.players[*].playerSave`/`$.players[*].saveString` als String (`src/lib/parsing/parseSfJson.ts:317-320`) | save: vorhanden 346/346; Bsp: Array(len=763; first=61433955) \| playerSave: nicht vorhanden in players (0/346) \| saveString: nicht vorhanden in players (0/346) |
| Direkt.toOwnPlayer.underworld | `parseUnderworldFromTower(raw.tower, resources, raw.offset)` | `$.players[*].tower`, `$.players[*].resources`, `$.players[*].offset` (`src/lib/parsing/parseSfJson.ts:576`) | tower: vorhanden 1/346; Bsp: Array(len=476; first=1859) |
| Index.parseUnderworld.goblins_trolls_keeper_upgrades | `goblinUpgrades=tower[146]`, `trollUpgrades=tower[294]`, `keeperUpgrades=tower[442]` | `$.players[*].tower[146|294|442]` (`src/lib/parsing/parseSfJson.ts:232-234`) | tower[146]=0; tower[294]=1; tower[442]=2043 |
| Index.parseUnderworld.segment_base | `towerSegment = tower.slice(448)` | `$.players[*].tower[448..]` (`src/lib/parsing/parseSfJson.ts:225`) | tower[448]=15 |
| Index.parseUnderworld.heart_gate_goldPit_extractor | `heart=tower[448+0]`, `gate=tower[448+1]`, `goldPit=tower[448+2]`, `extractor=tower[448+3]` | `$.players[*].tower[448..451]` (`src/lib/parsing/parseSfJson.ts:235-238`) | tower[448]=15; [449]=15; [450]=52; [451]=15 |
| Index.parseUnderworld.goblinPit_torture_trollBlock | `goblinPit=tower[448+4]`, `torture=tower[448+5]`, `trollBlock=tower[448+7]` | `$.players[*].tower[452]`, `[453]`, `[455]` (`src/lib/parsing/parseSfJson.ts:239-241`) | tower[452]=15; [453]=15; [455]=15 |
| Index.parseUnderworld.timeMachine_keeper | `timeMachine=tower[448+8]`, `keeper=tower[448+9]` | `$.players[*].tower[456]`, `[457]` (`src/lib/parsing/parseSfJson.ts:242-243`) | tower[456]=15; [457]=15 |
| Index.parseUnderworld.souls_primary | `soulsRaw = tower[448+10]` | `$.players[*].tower[458]` (`src/lib/parsing/parseSfJson.ts:230,244`) | tower[458]=0 |
| Index.parseUnderworld.souls_fallback_resources | `souls = soulsRaw ?? resources.souls ?? null` | `$.players[*].resources[11]` (Fallback) (`src/lib/parsing/parseSfJson.ts:244`) | resources[11]=1978045413 |
| Index.parseUnderworld.extractorSouls_extractMax_maxSouls | `extractorSouls=tower[448+11]`, `extractorMax=tower[448+12]`, `maxSouls=tower[448+13]` | `$.players[*].tower[459..461]` (`src/lib/parsing/parseSfJson.ts:245-247`) | tower[459]=1188000; [460]=1188000; [461]=162518400 |
| Index.parseUnderworld.extractorHourly | `extractorHourly=tower[448+15]` | `$.players[*].tower[463]` (`src/lib/parsing/parseSfJson.ts:248`) | tower[463]=49500 |
| Index.parseUnderworld.goldPit_values_div100 | `goldPitGold=tower[448+16]/100`, `goldPitMax=tower[448+17]/100`, `goldPitHourly=tower[448+18]/100` | `$.players[*].tower[464..466]` (`src/lib/parsing/parseSfJson.ts:249-260`) | tower[464]=0; [465]=30000000000; [466]=501561838 |
| Index.parseUnderworld.upgrade_building | `upgrade.building = tower[448+20] - 1` | `$.players[*].tower[468]` (`src/lib/parsing/parseSfJson.ts:262-265`) | tower[468]=3 |
| Index.parseUnderworld.upgrade_finish_start | `upgrade.finish = tower[448+21]*1000 + offset`, `upgrade.start = tower[448+22]*1000 + offset` | `$.players[*].tower[469]`, `$.players[*].tower[470]`, `$.players[*].offset` (`src/lib/parsing/parseSfJson.ts:266-267`) | tower[469]=1765921333; tower[470]=1764625333; offset=-3600000 |
| Index.parseUnderworld.timeMachine_meta | `timeMachineThirst=tower[448+25]`, `timeMachineMax=tower[448+26]`, `timeMachineDaily=tower[448+27]` | `$.players[*].tower[473..475]` (`src/lib/parsing/parseSfJson.ts:269-271`) | tower[473]=0; [474]=2000; [475]=80 |
| Direkt.parseEquippedItems.slot_chunks | `parseModernItemSlots(values, EQUIPPED_ITEM_SLOT_NAMES)` (Chunk-Größe 19) | `$.players[*].equippedItems[*]` (`src/lib/parsing/parseSfJson.ts:112-121`) | equippedItems: len=191 -> 10 Slots + remainder=1 |
| Direkt.parseBackpackItems.slot_split | `for slotIndex < 45`, `section = slotIndex >= 20 ? "chest" : "backpack"` | `$.players[*].backpackItems[*]` (`src/lib/parsing/parseSfJson.ts:123-149`) | backpackItems: len=951 -> 45 Slots + remainder=96 |
| Direkt.parseCompanionItems.group_offsets | `bert@0`, `mark@190`, `kunigunde@380` (je 10 Slots à 19) | `$.players[*].companionItems[*]` (`src/lib/parsing/parseSfJson.ts:151-185`) | companionItems: len=571 -> 3x10 Slots + remainder=1 |
| Direkt.parseDummyItems.slot_chunks | `parseModernItemSlots(values, EQUIPPED_ITEM_SLOT_NAMES)` (Chunk-Größe 19) | `$.players[*].dummyItems[*]` (`src/lib/parsing/parseSfJson.ts`) | dummyItems: len=191 -> 10 Slots + remainder=1 |
| Direkt.parseShopItems.shakes_slot_chunks | `parseModernItemSlots(values, ["Slot1".. "Slot6"])` (Chunk-Größe 19) | `$.players[*].shakesItems[*]` (`src/lib/parsing/parseSfJson.ts`) | shakesItems: len=115 -> 6 Slots + remainder=1 |
| Direkt.parseShopItems.fidget_slot_chunks | `parseModernItemSlots(values, ["Slot1".. "Slot6"])` (Chunk-Größe 19) | `$.players[*].fidgetItems[*]` (`src/lib/parsing/parseSfJson.ts`) | fidgetItems: len=115 -> 6 Slots + remainder=1 |
| Index.parsePets.own.levels_slice | `all = pets[2..101]`, danach `shadow/light/earth/fire/water` per 20er-Slice | `$.players[*].pets[2..101]` (`src/lib/parsing/parseSfJson.ts:221-233`) | pets[2]=200; pets len=266 |
| Index.parsePets.own.totals | `totalCount=pets[103]`, `shadow..water=pets[104..108]` | `$.players[*].pets[103..108]` (`src/lib/parsing/parseSfJson.ts:234-241`) | pets[103]=1; pets[104]=95; pets[108]=90 |
| Index.parsePets.own.dungeons_rank_honor | `dungeons=pets[210..214]`, `rank=pets[233]`, `honor=pets[234]` | `$.players[*].pets[210..214]`, `[233]`, `[234]` (`src/lib/parsing/parseSfJson.ts:242-245`) | pets[210]=0; pets[233]=910; pets[234]=9133 |
| Index.parsePets.own.metal_crystals_foods | `metal=pets[255]`, `crystals=pets[256]`, `foods=pets[259..263]` | `$.players[*].pets[255]`, `[256]`, `[259..263]` (`src/lib/parsing/parseSfJson.ts:245-253`) | pets[255]=5967493; pets[256]=2152148; pets[259]=539 |
| Index.parsePets.other.totals | bei kürzerem Pets-Array: `shadow..water = pets[1..5]` | `$.players[*].pets[1..5]` (`src/lib/parsing/parseSfJson.ts:257-269`) | n/a (own-sample nutzt own-Format) |
| Direkt.parseScrapbook.decode | Base64URL-Decode (`-/_` normalisieren, Padding) in Bit-Array | `$.players[*].scrapbook`, `$.players[*].scrapbook_legendary` (`src/lib/parsing/parseSfJson.ts:187-215`) | scrapbook len=708; scrapbook_legendary len=64 |
| Index.parseIdle.core | `sacrifices=idle[2]`, `buildings=idle[3..12]`, `money=idle[73]`, `readyRunes=idle[75]`, `runes=idle[76]` | `$.players[*].idle[2]`, `[3..12]`, `[73]`, `[75]`, `[76]` (`src/lib/parsing/parseSfJson.ts:277-293`) | idle[2]=431; idle[73]=48987; idle[75]=0; idle[76]=0 |
| Index.parseIdle.upgrades | `speed=idle[43..52]`, `money=idle[53..62]`, `moneyIncreaseFlag=idle[77]` | `$.players[*].idle[43..62]`, `[77]` (`src/lib/parsing/parseSfJson.ts:287-291`) | idle[43]=20; idle[53]=20; idle[77]=1 |
| Index.parseDailyTasks.triplets | `for index += 3` -> Tripel `{a,b,c}` | `$.players[*].dailyTasks[*]` (`src/lib/parsing/parseSfJson.ts:311-327`) | dailyTasks len=57 -> 19 Tripel |
| Index.parseDailyTasksRewards.blocks | `for index += 5` -> Reward-Blöcke aus `[collected, required, _, resourceType, resourceAmount]` | `$.players[*].dailyTasksRewards[*]` (`src/lib/parsing/parseSfJson.ts:295-309`) | dailyTasksRewards len=15 -> 3 Blöcke |
| Index.parseAchievements.half_split | `half = floor(len/2)`, `entries[i] = {owned: achievements[i]==1, progress: achievements[i+half] || 0}` für `i < min(115, half)` | `$.players[*].achievements[*]` (`src/lib/parsing/parseSfJson.ts`) | achievements len=231; achievements[0]=1; achievements[115]=0 |
| Index.parseUnits.core | `wall=units[0]`, `warriors=units[1]`, `mages=units[2]`, `archers=units[3]` | `$.players[*].units[0..3]` (`src/lib/parsing/parseSfJson.ts`) | units[0]=5; units[1]=35; units[2]=34; units[3]=35 |
| Index.parseWitch.core | `stage=witch[0]`, `items=witch[1]`, `itemsNext=witch[2]`, `item=witch[3]`, `finish=witch[6]*1000+offset` | `$.players[*].witch[0..3]`, `$.players[*].witch[6]`, `$.players[*].offset` (`src/lib/parsing/parseSfJson.ts`) | witch[0]=9; witch[1]=51; witch[2]=51; witch[3]=10011; witch[6]=1765201333; offset=-3600000 |
| Index.parseWitch.scroll_blocks | `for i<9`: Block ab `base=8+i*3`, `picIndex=witch[base+1]`, `date=witch[base+2]*1000+offset`, `type=picIndex%1000` | `$.players[*].witch[8..34]`, `$.players[*].offset` (`src/lib/parsing/parseSfJson.ts`) | witch[9]=10146; witch[10]=1749932533; witch[12]=10031; witch[13]=1750018933 |
| Direkt.extractPortrait.parseSaveStringToArray.token | `Number.parseInt(part.trim(), 10)` sonst `0` | `saveString.split("/")[*]` (`src/lib/parsing/extractPortrait.ts:10-15`) | saveString fehlt; aus save[] rekonstruierbar, first=61433955 |
| Index.extractPortrait.safeValue_fallback | fehlend/ungültig -> `fallback` (Standard `0`) | betrifft alle `save[index]`-Zugriffe in `extractPortraitFromSaveArray` (`src/lib/parsing/extractPortrait.ts:3-8`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Index.extractPortrait.genderByte | `safeValue(save, 28) & 0xff` | `save[28]` (`src/lib/parsing/extractPortrait.ts:22`) | save[28]=30539777 |
| Index.extractPortrait.genderName | `genderByte === 2 ? "female" : "male"` | `save[28]` (`src/lib/parsing/extractPortrait.ts:22,28`) | save[28]=30539777 |
| Index.extractPortrait.classId | `safeValue(save, 29) & 0xffff` | `save[29]` (`src/lib/parsing/extractPortrait.ts:32`) | save[29]=22282243 |
| Index.extractPortrait.raceId | `safeValue(save, 27) & 0xffff` | `save[27]` (`src/lib/parsing/extractPortrait.ts:33`) | save[27]=22282246 |
| Index.extractPortrait.mouth | `safeValue(save, 17)` | `save[17]` (`src/lib/parsing/extractPortrait.ts:34`) | save[17]=4 |
| Index.extractPortrait.hairRaw | `safeValue(save, 18)` | `save[18]` (`src/lib/parsing/extractPortrait.ts:19`) | save[18]=105 |
| Index.extractPortrait.hair | `Math.max(hairRaw % 100, 0)` | `save[18]` (`src/lib/parsing/extractPortrait.ts:19,35`) | save[18]=105 |
| Index.extractPortrait.brows | `Math.max(safeValue(save, 19) % 100, 0)` | `save[19]` (`src/lib/parsing/extractPortrait.ts:36`) | save[19]=101 |
| Index.extractPortrait.eyes | `safeValue(save, 20)` | `save[20]` (`src/lib/parsing/extractPortrait.ts:37`) | save[20]=4 |
| Index.extractPortrait.beard | `Math.max(safeValue(save, 21) % 100, 0)` | `save[21]` (`src/lib/parsing/extractPortrait.ts:38`) | save[21]=106 |
| Index.extractPortrait.nose | `safeValue(save, 22)` | `save[22]` (`src/lib/parsing/extractPortrait.ts:39`) | save[22]=1 |
| Index.extractPortrait.ears | `safeValue(save, 23)` | `save[23]` (`src/lib/parsing/extractPortrait.ts:40`) | save[23]=2 |
| Index.extractPortrait.extra | `safeValue(save, 24)` | `save[24]` (`src/lib/parsing/extractPortrait.ts:41`) | save[24]=8 |
| Index.extractPortrait.hornRaw | `safeValue(save, 25)` | `save[25]` (`src/lib/parsing/extractPortrait.ts:20`) | save[25]=0 |
| Index.extractPortrait.horn | `Math.max(hornRaw % 100, 0)` | `save[25]` (`src/lib/parsing/extractPortrait.ts:20,42`) | save[25]=0 |
| Index.extractPortrait.specialRaw | `safeValue(save, 26)` | `save[26]` (`src/lib/parsing/extractPortrait.ts:21`) | save[26]=0 |
| Index.extractPortrait.special | `Math.min(specialRaw, 0)` | `save[26]` (`src/lib/parsing/extractPortrait.ts:21,43`) | save[26]=0 |
| Index.extractPortrait.hairColor | `Math.max(Math.floor(hairRaw / 100), 1)` | `save[18]` (`src/lib/parsing/extractPortrait.ts:24-25,44`) | save[18]=105 |
| Index.extractPortrait.hornColor | `genderName === "female" ? 1 : hornColorBase === 0 ? hairColor : hornColorBase` | `save[28]` + `save[18]` (`src/lib/parsing/extractPortrait.ts:22,26,45`) | save[18]=105; save[28]=30539777 |
| Index.extractPortrait.frameId | `safeValue(save, 705)` | `save[705]` (`src/lib/parsing/extractPortrait.ts:46`) | save[705]=0 |
| Direkt.portraitFromSave.parseSaveStringToArray.token | `Number(part.trim())` sonst `0` | `saveString.split("/")[*]` (`src/lib/portraitFromSave.ts:87-93`) | saveString fehlt; aus save[] rekonstruierbar, first=61433955 |
| Index.portraitFromSave.safeValue_fallback | fehlend/ungültig -> `fallback` (Standard `0`) | betrifft alle `save[index]`-Zugriffe in `createPortraitOptionsFromSaveArray` (`src/lib/portraitFromSave.ts:25-30`) | n/a (kein direktes Quellfeld in Beispieldatei) |
| Index.portraitFromSave.genderByte | `safeValue(save, 28) & 0xff` | `save[28]` (`src/lib/portraitFromSave.ts:58`) | save[28]=30539777 |
| Index.portraitFromSave.genderName | `genderByte === 1 ? "female" : "male"` | `save[28]` (`src/lib/portraitFromSave.ts:58,66`) | save[28]=30539777 |
| Index.portraitFromSave.class | `safeValue(save, 29) & 0xffff` | `save[29]` (`src/lib/portraitFromSave.ts:67`) | save[29]=22282243 |
| Index.portraitFromSave.race | `safeValue(save, 27) & 0xffff` | `save[27]` (`src/lib/portraitFromSave.ts:68`) | save[27]=22282246 |
| Index.portraitFromSave.mouth | `safeValue(save, 17)` | `save[17]` (`src/lib/portraitFromSave.ts:69`) | save[17]=4 |
| Index.portraitFromSave.hairRaw | `safeValue(save, 18)` | `save[18]` (`src/lib/portraitFromSave.ts:54`) | save[18]=105 |
| Index.portraitFromSave.hair | `Math.max(hairRaw % 100, 0)` | `save[18]` (`src/lib/portraitFromSave.ts:54,70`) | save[18]=105 |
| Index.portraitFromSave.brows | `Math.max(safeValue(save, 19) % 100, 0)` | `save[19]` (`src/lib/portraitFromSave.ts:71`) | save[19]=101 |
| Index.portraitFromSave.eyes | `safeValue(save, 20)` | `save[20]` (`src/lib/portraitFromSave.ts:72`) | save[20]=4 |
| Index.portraitFromSave.beardRaw | `safeValue(save, 21)` | `save[21]` (`src/lib/portraitFromSave.ts:55`) | save[21]=106 |
| Index.portraitFromSave.beard | `Math.max(beardRaw % 100, 0)` | `save[21]` (`src/lib/portraitFromSave.ts:55,73`) | save[21]=106 |
| Index.portraitFromSave.nose | `safeValue(save, 22)` | `save[22]` (`src/lib/portraitFromSave.ts:74`) | save[22]=1 |
| Index.portraitFromSave.ears | `safeValue(save, 23)` | `save[23]` (`src/lib/portraitFromSave.ts:75`) | save[23]=2 |
| Index.portraitFromSave.extra | `safeValue(save, 24)` | `save[24]` (`src/lib/portraitFromSave.ts:76`) | save[24]=8 |
| Index.portraitFromSave.hornRaw | `safeValue(save, 25)` | `save[25]` (`src/lib/portraitFromSave.ts:56`) | save[25]=0 |
| Index.portraitFromSave.horn | `Math.max(hornRaw % 100, 0)` | `save[25]` (`src/lib/portraitFromSave.ts:56,77`) | save[25]=0 |
| Index.portraitFromSave.special | `Math.min(safeValue(save, 26), 0)` | `save[26]` (`src/lib/portraitFromSave.ts:78`) | save[26]=0 |
| Index.portraitFromSave.hairColor | `Math.max(Math.floor(hairRaw / 100), 1)` | `save[18]` (`src/lib/portraitFromSave.ts:60-61,79`) | save[18]=105 |
| Index.portraitFromSave.hornColor | `genderByte === 1 ? 1 : hornColorBase === 0 ? hairColor : hornColorBase` | `save[28]` + `save[18]` (`src/lib/portraitFromSave.ts:58,62,80`) | save[18]=105; save[28]=30539777 |
| Index.portraitFromSave.frameId | `safeValue(save, 705)` | `save[705]` (`src/lib/portraitFromSave.ts:57`) | save[705]=0 |
| Direkt.portraitFromSave.frame_case_1 | `"goldenFrame"` | `save[705] == 1` (`src/lib/portraitFromSave.ts:32-36`) | save[705]=0 |
| Direkt.portraitFromSave.frame_case_2 | `"twitchFrame"` | `save[705] == 2` (`src/lib/portraitFromSave.ts:32-38`) | save[705]=0 |
| Direkt.portraitFromSave.frame_case_3 | `"zenFrame"` | `save[705] == 3` (`src/lib/portraitFromSave.ts:32-40`) | save[705]=0 |
| Direkt.portraitFromSave.frame_case_4 | `"silverFrame"` | `save[705] == 4` (`src/lib/portraitFromSave.ts:32-42`) | save[705]=0 |
| Direkt.portraitFromSave.frame_case_50 | `"worldBossFrameGold"` | `save[705] == 50` (`src/lib/portraitFromSave.ts:32-44`) | save[705]=0 |
| Direkt.portraitFromSave.frame_case_51 | `"worldBossFrameSilver"` | `save[705] == 51` (`src/lib/portraitFromSave.ts:32-46`) | save[705]=0 |
| Direkt.portraitFromSave.frame_case_52 | `"worldBossFrameBronze"` | `save[705] == 52` (`src/lib/portraitFromSave.ts:32-48`) | save[705]=0 |
| Direkt.portraitFromSave.frame_default | `""` (leer) | `save[705]` anderer Wert (`src/lib/portraitFromSave.ts:48-50`) | save[705]=0 |

## latest.values Mapping

Dieser Block enthält alle Zuordnungen, die über `values`/`latest.values` laufen, inklusive exact/canonical Lookup, Schlüsselvarianten und Pattern-Matches.
Direkte Keys, Fallback-Logik, abgeleitete Werte sowie indexbasierte Potion-Slot-Zuordnungen aus `latestValues` bleiben erhalten.
Auch Advanced-Direct-Keys und Advanced-Pattern-Regeln sind unverändert aufgeführt.
Nicht enthalten sind Root-/Import-Erkennung und Save-/Portrait-Parsing.

| Label | Wert | Stelle in Json für Mapping | Rohwert aus Feld (Beispieldatei) |
| --- | --- | --- | --- |
| Direkt.latestValues.lookup.exact_map | `exact.set(key, value)` für alle `Object.entries(values)` | `$.values[*]` (`src/lib/parsing/latestValues.ts:234-236`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.lookup.canonical_map | `canonical.set(canonicalizeKey(key), value)` | canonicalisierte `$.values`-Keys (`src/lib/parsing/latestValues.ts:131,234-237`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.lookup.get_exact_first | `if (exact.has(key)) return exact.get(key)` | `$.values[<key>]` (`src/lib/parsing/latestValues.ts:239-244`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.lookup.get_canonical_fallback | `canonicalizeKey(requestedKey)` -> `canonical.get(canonicalKey)` | canonicalisierte Variante von `$.values`-Keys (`src/lib/parsing/latestValues.ts:241-244`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.className.Class | `lookup.text(["Class", ...])` | `$.values["Class"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:281`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.className.Class_Name | `lookup.text(["Class Name", ...])` | `$.values["Class Name"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:281`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.className.class | `lookup.text(["...", "class", ...])` | `$.values["class"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:281`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.className.className | `lookup.text(["...", "className"])` | `$.values["className"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:281`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.genericBase | `lookup.number(["Base"])` | `$.values["Base"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:283`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.combat.armor | `lookup.number(["Armor"])` | `$.values["Armor"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:286`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.combat.dmgMin | `lookup.number(["Damage Min"])` | `$.values["Damage Min"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:287`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.combat.dmgMax | `lookup.number(["Damage Max"])` | `$.values["Damage Max"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:288`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.combat.dmgAvg | `lookup.number(["Damage Avg"])` | `$.values["Damage Avg"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:289`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.combat.health | `lookup.number(["Health"])` | `$.values["Health"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:290`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.combat.weaponDamageMultiplier | `lookup.number(["Weapon Damage Multiplier"])` | `$.values["Weapon Damage Multiplier"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:291`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.combat.maximumDamageReduction | `lookup.number(["Maximum Damage Reduction"])` | `$.values["Maximum Damage Reduction"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:292`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.combat.dmgAvg_derived | wenn `dmgAvg == null` und `dmgMin/dmgMax != null`: `(dmgMin + dmgMax)/2` | abgeleitet aus `$.values["Damage Min"]` + `$.values["Damage Max"]` (`src/lib/parsing/latestValues.ts:294-296`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.total.strength | lookup.number(["Strength"]) | $.values["Strength"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.base_specific.strength | lookup.number(["Base Strength"]) | $.values["Base Strength"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.strength.base_items | lookup.number(["Strength Base Items"]) | $.values["Strength Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.strength.upgrades | lookup.number(["Strength Upgrades"]) | $.values["Strength Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.strength.equipment | lookup.number(["Strength Equipment"]) | $.values["Strength Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.strength.gems | lookup.number(["Strength Gems"]) | $.values["Strength Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.strength.pet | lookup.number(["Strength Pet"]) | $.values["Strength Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.strength.potion | lookup.number(["Strength Potion"]) | $.values["Strength Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.strength.items | lookup.number(["Strength Items"]) | $.values["Strength Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.strength.pet_bonus | lookup.number(["Strength Pet Bonus"]) | $.values["Strength Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.total.dexterity | lookup.number(["Dexterity"]) | $.values["Dexterity"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.base_specific.dexterity | lookup.number(["Base Dexterity"]) | $.values["Base Dexterity"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.dexterity.base_items | lookup.number(["Dexterity Base Items"]) | $.values["Dexterity Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.dexterity.upgrades | lookup.number(["Dexterity Upgrades"]) | $.values["Dexterity Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.dexterity.equipment | lookup.number(["Dexterity Equipment"]) | $.values["Dexterity Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.dexterity.gems | lookup.number(["Dexterity Gems"]) | $.values["Dexterity Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.dexterity.pet | lookup.number(["Dexterity Pet"]) | $.values["Dexterity Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.dexterity.potion | lookup.number(["Dexterity Potion"]) | $.values["Dexterity Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.dexterity.items | lookup.number(["Dexterity Items"]) | $.values["Dexterity Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.dexterity.pet_bonus | lookup.number(["Dexterity Pet Bonus"]) | $.values["Dexterity Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.total.intelligence | lookup.number(["Intelligence"]) | $.values["Intelligence"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.base_specific.intelligence | lookup.number(["Base Intelligence"]) | $.values["Base Intelligence"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.intelligence.base_items | lookup.number(["Intelligence Base Items"]) | $.values["Intelligence Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.intelligence.upgrades | lookup.number(["Intelligence Upgrades"]) | $.values["Intelligence Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.intelligence.equipment | lookup.number(["Intelligence Equipment"]) | $.values["Intelligence Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.intelligence.gems | lookup.number(["Intelligence Gems"]) | $.values["Intelligence Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.intelligence.pet | lookup.number(["Intelligence Pet"]) | $.values["Intelligence Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.intelligence.potion | lookup.number(["Intelligence Potion"]) | $.values["Intelligence Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.intelligence.items | lookup.number(["Intelligence Items"]) | $.values["Intelligence Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.intelligence.pet_bonus | lookup.number(["Intelligence Pet Bonus"]) | $.values["Intelligence Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.total.constitution | lookup.number(["Constitution"]) | $.values["Constitution"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.base_specific.constitution | lookup.number(["Base Constitution"]) | $.values["Base Constitution"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.constitution.base_items | lookup.number(["Constitution Base Items"]) | $.values["Constitution Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.constitution.upgrades | lookup.number(["Constitution Upgrades"]) | $.values["Constitution Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.constitution.equipment | lookup.number(["Constitution Equipment"]) | $.values["Constitution Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.constitution.gems | lookup.number(["Constitution Gems"]) | $.values["Constitution Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.constitution.pet | lookup.number(["Constitution Pet"]) | $.values["Constitution Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.constitution.potion | lookup.number(["Constitution Potion"]) | $.values["Constitution Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.constitution.items | lookup.number(["Constitution Items"]) | $.values["Constitution Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.constitution.pet_bonus | lookup.number(["Constitution Pet Bonus"]) | $.values["Constitution Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.total.luck | lookup.number(["Luck"]) | $.values["Luck"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:299`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.base_specific.luck | lookup.number(["Base Luck"]) | $.values["Base Luck"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:300`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.luck.base_items | lookup.number(["Luck Base Items"]) | $.values["Luck Base Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.luck.upgrades | lookup.number(["Luck Upgrades"]) | $.values["Luck Upgrades"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.luck.equipment | lookup.number(["Luck Equipment"]) | $.values["Luck Equipment"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.luck.gems | lookup.number(["Luck Gems"]) | $.values["Luck Gems"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.luck.pet | lookup.number(["Luck Pet"]) | $.values["Luck Pet"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.luck.potion | lookup.number(["Luck Potion"]) | $.values["Luck Potion"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.luck.items | lookup.number(["Luck Items"]) | $.values["Luck Items"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.breakdown.luck.pet_bonus | lookup.number(["Luck Pet Bonus"]) | $.values["Luck Pet Bonus"] (exakt oder canonical) (`src/lib/parsing/latestValues.ts:304-311`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.base_fallback_mainAttr | falls `specificBase == null` und `entry.code == mainAttributeCode`: nutze `genericBase` | `$.values["Base"]` + Klasse aus `$.values["Class"|"Class Name"|"class"|"className"]` (`src/lib/parsing/latestValues.ts:281-283,301-303`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.attribute.bonus_derived | `bonus = total - base` falls beide vorhanden | abgeleitet aus Attribut-`total`/`base` (`src/lib/parsing/latestValues.ts:313`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.runes.gold | `lookup.number(["Rune Gold"])` | `$.values["Rune Gold"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:318`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.runes.xp | `lookup.number(["Rune XP"])` | `$.values["Rune XP"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:319`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.runes.chance | `lookup.number(["Rune Chance"])` | `$.values["Rune Chance"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:320`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.runes.quality | `lookup.number(["Rune Quality"])` | `$.values["Rune Quality"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:321`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.runes.health | `lookup.number(["Rune Health"])` | `$.values["Rune Health"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:322`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.runes.damage | `lookup.number(["Rune Damage"])` | `$.values["Rune Damage"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:323`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.runes.resist | `lookup.number(["Rune Resist"])` | `$.values["Rune Resist"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:324`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.resistances.fireResist | `lookup.number(["Fire Resist"])` | `$.values["Fire Resist"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:328`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.resistances.coldResist | `lookup.number(["Cold Resist"])` | `$.values["Cold Resist"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:329`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.resistances.lightningResist | `lookup.number(["Lightning Resist"])` | `$.values["Lightning Resist"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:330`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.resistances.fireDamage | `lookup.number(["Fire Damage"])` | `$.values["Fire Damage"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:331`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.resistances.coldDamage | `lookup.number(["Cold Damage"])` | `$.values["Cold Damage"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:332`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.resistances.lightningDamage | `lookup.number(["Lightning Damage"])` | `$.values["Lightning Damage"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:333`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.resistances.fireDamage_filter | wenn `fireDamage <= 0` dann `null` | abgeleitet aus `$.values["Fire Damage"]` (`src/lib/parsing/latestValues.ts:335`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.resistances.coldDamage_filter | wenn `coldDamage <= 0` dann `null` | abgeleitet aus `$.values["Cold Damage"]` (`src/lib/parsing/latestValues.ts:336`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.resistances.lightningDamage_filter | wenn `lightningDamage <= 0` dann `null` | abgeleitet aus `$.values["Lightning Damage"]` (`src/lib/parsing/latestValues.ts:337`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Index.latestValues.potions.slot1_type | `lookup.text(["Potion 1 Type"])` | `$.values["Potion 1 Type"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Index.latestValues.potions.slot1_size | `lookup.number(["Potion 1 Size"])` | `$.values["Potion 1 Size"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Index.latestValues.potions.slot2_type | `lookup.text(["Potion 2 Type"])` | `$.values["Potion 2 Type"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Index.latestValues.potions.slot2_size | `lookup.number(["Potion 2 Size"])` | `$.values["Potion 2 Size"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Index.latestValues.potions.slot3_type | `lookup.text(["Potion 3 Type"])` | `$.values["Potion 3 Type"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Index.latestValues.potions.slot3_size | `lookup.number(["Potion 3 Size"])` | `$.values["Potion 3 Size"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:340-343`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.potions.lifePotion | `lookup.boolYesNo(["Life Potion"])` | `$.values["Life Potion"]` (exakt oder canonical) (`src/lib/parsing/latestValues.ts:345`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.meta.fortress | `lookup.number(["Fortress"])` | `$.values["Fortress"]` (`src/lib/parsing/latestValues.ts:350`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.meta.upgrades | `lookup.number(["Upgrades"])` | `$.values["Upgrades"]` (`src/lib/parsing/latestValues.ts:351`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.meta.fortifications | `lookup.number(["Fortifications"])` | `$.values["Fortifications"]` (`src/lib/parsing/latestValues.ts:352`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.meta.wall | `lookup.number(["Wall"])` | `$.values["Wall"]` (`src/lib/parsing/latestValues.ts:353`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.meta.space | `lookup.number(["Space"])` | `$.values["Space"]` (`src/lib/parsing/latestValues.ts:354`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.meta.quarters | `lookup.number(["Quarters"])` | `$.values["Quarters"]` (`src/lib/parsing/latestValues.ts:355`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.meta.portal | `lookup.number(["Portal"])` | `$.values["Portal"]` (`src/lib/parsing/latestValues.ts:356`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.buildings.woodcutter | `lookup.number(["Woodcutter"])` | `$.values["Woodcutter"]` (`src/lib/parsing/latestValues.ts:359`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.buildings.quarry | `lookup.number(["Quarry"])` | `$.values["Quarry"]` (`src/lib/parsing/latestValues.ts:360`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.buildings.gemMine | `lookup.number(["Gem Mine"])` | `$.values["Gem Mine"]` (`src/lib/parsing/latestValues.ts:361`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.buildings.academy | `lookup.number(["Academy"])` | `$.values["Academy"]` (`src/lib/parsing/latestValues.ts:362`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.buildings.smithy | `lookup.number(["Smithy"])` | `$.values["Smithy"]` (`src/lib/parsing/latestValues.ts:363`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.buildings.treasury | `lookup.number(["Treasury"])` | `$.values["Treasury"]` (`src/lib/parsing/latestValues.ts:364`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.buildings.barracks | `lookup.number(["Barracks"])` | `$.values["Barracks"]` (`src/lib/parsing/latestValues.ts:365`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.buildings.mageTower | `lookup.number(["Mage Tower"])` | `$.values["Mage Tower"]` (`src/lib/parsing/latestValues.ts:366`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.buildings.archeryGuild | `lookup.number(["Archery Guild"])` | `$.values["Archery Guild"]` (`src/lib/parsing/latestValues.ts:367`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.rank | `lookup.number(["Fortress Rank"])` | `$.values["Fortress Rank"]` (`src/lib/parsing/latestValues.ts:369`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.fortress.honor | `lookup.number(["Fortress Honor"])` | `$.values["Fortress Honor"]` (`src/lib/parsing/latestValues.ts:370`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.guildMeta.guild | `lookup.text(["Guild"])` | `$.values["Guild"]` (`src/lib/parsing/latestValues.ts:374`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.guildMeta.guildIdentifier | `lookup.text(["Guild Identifier"])` | `$.values["Guild Identifier"]` (`src/lib/parsing/latestValues.ts:375`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.guildMeta.role.Role | `lookup.text(["Role", "Guild Role"])` (Variante 1) | `$.values["Role"]` (`src/lib/parsing/latestValues.ts:376`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.guildMeta.role.Guild_Role | `lookup.text(["Role", "Guild Role"])` (Variante 2) | `$.values["Guild Role"]` (`src/lib/parsing/latestValues.ts:376`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.guildMeta.guildJoined | `parseDateTimeLoose(lookup.get(["Guild Joined"]))` | `$.values["Guild Joined"]` (`src/lib/parsing/latestValues.ts:377`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.guildMeta.guildPortal | `lookup.number(["Guild Portal"])` | `$.values["Guild Portal"]` (`src/lib/parsing/latestValues.ts:378`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.optionalProgress.raids | `lookup.number(["Raids"])` | `$.values["Raids"]` (`src/lib/parsing/latestValues.ts:383`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.optionalProgress.raidHonor | `lookup.number(["Raid Honor"])` | `$.values["Raid Honor"]` (`src/lib/parsing/latestValues.ts:384`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.optionalProgress.raidWood | `lookup.number(["Raid Wood"])` | `$.values["Raid Wood"]` (`src/lib/parsing/latestValues.ts:385`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.optionalProgress.raidStone | `lookup.number(["Raid Stone"])` | `$.values["Raid Stone"]` (`src/lib/parsing/latestValues.ts:386`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.optionalProgress.xp | `lookup.number(["XP"])` | `$.values["XP"]` (`src/lib/parsing/latestValues.ts:389`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.optionalProgress.xpRequired | `lookup.number(["XP Required"])` | `$.values["XP Required"]` (`src/lib/parsing/latestValues.ts:390`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.optionalProgress.xpTotal | `lookup.number(["XP Total"])` | `$.values["XP Total"]` (`src/lib/parsing/latestValues.ts:391`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.ID | `lookup.get(["ID"])` -> `parseAdvancedValue` | `$.values["ID"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Identifier | `lookup.get(["Identifier"])` -> `parseAdvancedValue` | `$.values["Identifier"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Prefix | `lookup.get(["Prefix"])` -> `parseAdvancedValue` | `$.values["Prefix"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Server | `lookup.get(["Server"])` -> `parseAdvancedValue` | `$.values["Server"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Server_ID | `lookup.get(["Server ID"])` -> `parseAdvancedValue` | `$.values["Server ID"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Timestamp | `lookup.get(["Timestamp"])` -> `parseAdvancedValue` | `$.values["Timestamp"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.timestampRaw | `lookup.get(["timestampRaw"])` -> `parseAdvancedValue` | `$.values["timestampRaw"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Last_Active | `lookup.get(["Last Active"])` -> `parseAdvancedValue` | `$.values["Last Active"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Power | `lookup.get(["Power"])` -> `parseAdvancedValue` | `$.values["Power"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Registered | `lookup.get(["Registered"])` -> `parseAdvancedValue` | `$.values["Registered"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Webshop | `lookup.get(["Webshop"])` -> `parseAdvancedValue` | `$.values["Webshop"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Attribute_Type | `lookup.get(["Attribute Type"])` -> `parseAdvancedValue` | `$.values["Attribute Type"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Attribute_Size | `lookup.get(["Attribute Size"])` -> `parseAdvancedValue` | `$.values["Attribute Size"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Runes | `lookup.get(["Runes"])` -> `parseAdvancedValue` | `$.values["Runes"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.direct.Runes_e33 | `lookup.get(["Runes: e33"])` -> `parseAdvancedValue` | `$.values["Runes: e33"]` (`src/lib/parsing/latestValues.ts:395-426`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.pattern.index | zusätzliche Aufnahme, wenn Key `/index/i` matcht | `$.values[*]` (beliebiger Key mit `index`) (`src/lib/parsing/latestValues.ts:412-417,430-437`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.pattern.attribute_type_size | zusätzliche Aufnahme, wenn Key `/^attribute\s+(type|size)/i` matcht | `$.values[*]` (`src/lib/parsing/latestValues.ts:412-417,430-437`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.pattern.runes_prefix | zusätzliche Aufnahme, wenn Key `/^runes?:/i` matcht | `$.values[*]` (`src/lib/parsing/latestValues.ts:412-417,430-437`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
| Direkt.latestValues.advanced.pattern_identity_time_power | zusätzliche Aufnahme, wenn Key `/(identifier|prefix|server id|timestamp|last active|power|registered|webshop)/i` matcht | `$.values[*]` (`src/lib/parsing/latestValues.ts:412-417,430-437`) | in Beispieldatei kein `values`/`latest.values`-Objekt |
