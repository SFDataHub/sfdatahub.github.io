# Server / Fusion Coverage Sources

Accessed: 2026-09-23

This is analysis-only maintainer documentation. It should not be treated as runtime source code or an authoritative product registry by itself.

## Official / Preferred

- Official S&F config snapshot: `https://sfgame.net/config.json`
  - Supports host, numeric ID, server category, merge destination (`md`), migration/freeze timestamp (`m`) and target publish/open timestamp (`p`).
  - Snapshot observed 363 server entries and fusion groups through `f29.sfgame.net`.
  - Important examples:
    - `s1.sfgame.eu` -> numeric ID `458`, `md=f28.sfgame.net`, `m=2026-02-05 22:59:59`
    - `f28.sfgame.net` -> numeric ID `549`, `p=2026-02-06 15:00:00`
    - `f29.sfgame.net` -> numeric ID `550`, `p=2026-10-16 15:00:00`, origins `s5.sfgame.eu` to `s8.sfgame.eu`
    - `stumblesteppe.sfgame.net` -> numeric ID `560`, `p=2026-07-10 14:00:00`

- Official Playa Help Center, World Fusion Overview:
  - `https://playa-games.helpshift.com/hc/en/4-shakes-fidget-1653988985/faq/292-world-fusion-overview/?p=ios`
  - Supports origin membership for Fusion 1-28 and named targets Maerwynn, Blackforest, Gnarogrim and Stumble Steppe.
  - Note: localized snippets differ in places. The German/Spanish snippets include `f5.sfgame.net` under Maerwynn; one English snippet omitted it. The official config includes `f1`-`f5` -> Maerwynn, so use config as the stronger machine-readable source.

- Official Steam news, Producer's Note #28, Jan 13 2025:
  - `https://store.steampowered.com/news/posts/?appids=438040&enddate=1736938846&feed=steam_community_announcements`
  - Supports the introduction of future fusion compensation: server-age-based level ups, 0.5-month rounding, multiplied by 2 levels, plus gold bonus based on the same time factor and character level.

- Official Steam news, Producer's Note #29, Jan 20 2025:
  - `https://store.steampowered.com/news/posts/?appids=438040&enddate=1737565218&feed=steam_community_announcements`
  - Supports rationale for compensation: roughly two-thirds of potential XP for levels and about one-third of attainable gold for a f2p player.

- Official Steam news, Maerwynn announcement, Mar 28 2025:
  - `https://store.steampowered.com/news/posts/?appids=438040&enddate=1743246012&feed=steam_community_announcements`
  - Supports Maerwynn effective date estimate: Friday, 2025-04-25, with expected completion around 16:00 GMT+2.
  - Supports compensation policy for that event: no compensation other than the usual fusion coupon because it was a fusion of already fused worlds.

## Project / Internal

- Local product registry:
  - `src/data/serverRegistry.ts`
  - `src/data/serverFusions.ts`
  - `src/lib/servers/serverResolver.ts`
  - `src/lib/servers/fusionCompensation.ts`

- Firestore staging `servers` collection, read-only REST snapshot:
  - `https://firestore.googleapis.com/v1/projects/sfdatahub-staging/databases/(default)/documents/servers?pageSize=300`
  - Supports current manually maintained server registry state.
  - Snapshot contained 63 docs, no release dates, no aliases, mixed `numericId`/`numericID` casing, and missing numeric IDs for `EU29`, `EU30`, `STUMBLESTEPPE`.

- In-repo broad tree sketch:
  - `src/pages/servers/overview/serversOverview.config.ts`
  - Useful candidate list, but comments indicate screenshot-derived data. It lacks source metadata, numeric IDs, hosts, release dates and effective dates.

- In-repo UI/toplist picker:
  - `src/data/servers.ts`
  - Useful for current UI affordances, not authoritative registry data.

## Supplemental / Non-Authoritative

- The ManInBlack / Black Pirates server list:
  - `https://blog.black-pirates.info/server/shakes-fidget/`
  - Useful as broad release-date and historical fusion-date evidence, but explicitly says entries are without guarantee. Use only as supplemental evidence until confirmed by official sources or observed config/history.


## W-64 current picker reconciliation (2026-10-14)

- Primary snapshot: https://sfgame.net/config.json, retrieved 2026-10-14 12:54:05.986 UTC (14:54:05.986 Europe/Berlin), HTTP 200. Evidence: `tmp/w64/official-config.json`, `tmp/w64/official-source.json`, `tmp/w64/server-comparison.json`.
- Existing reconciliation follows the config `md`/`m` fusion destination/freeze fields and `p` publish field, corroborated by the official World Fusion Overview linked above. Compare as of retrieval, retaining historical registry records.
- 363 config entries; 47 active entries including the deliberately hidden SPEED; 46 selectable entries. EU5-EU8 are still active until the announced freeze on October 15. F29 is scheduled for October 16, 15:00 UTC and remains inactive.
- EU31 (official host `s31.sfgame.eu`, numeric ID 562) was already registered locally but inactive; it is now active. Its official `p` and `r` dates are September 25 and October 2 respectively. No duplicate registry record was created.
- Legacy picker config now includes EU29, EU30, EU31 and Stumble Steppe. Historical F6, F7, F10, F12, F13, F15, F16, F18 and F20 remain registered but are inactive in that config.
- Existing legacy picker value `mearwynn` is retained and added as a read alias of canonical MAERWYNN. STUMBLESTEPPE and the read alias `stumblesteppe_net` remain unchanged. BF/GN/MW/STS are display abbreviations only.
- No runtime official-config fetch, cloud config changes or archive changes were added.
