# Toplists audit

## 1) Overview (what is Toplists today?)

Active UI route is `/toplists` (HashRouter). The page renders a tab switcher between Players and Guilds, but only the Players tab is wired to Firestore snapshots today. Guild Toplists is mock data. The data flow is currently snapshot-based and reads from `stats_public` with in-memory TTL caching only.

Legacy or unused pieces are still present:
- Legacy sub-routes `/toplists/players`, `/toplists/guilds`, `/toplists/servers` are now mapped to NotFound. The in-page tabs still navigate to those legacy paths.
- `src/lib/api/toplists.ts` defines an Apps Script API fetch layer, but nothing references it.
- `src/data/toplists.ts` has a lazy registry for toplists pages, but nothing references it.

## 2) File/Component Map (with paths)

Routing and entry
- `src/main.tsx` (route `/toplists`, FeatureGate `main.toplists`)
- `src/lib/featureAccessConfig.tsx` (feature config `main.toplists`)
- `src/components/Sidebar/Sidebar.tsx` (sidebar nav item)

Toplists pages
- `src/pages/Toplists/index.tsx` (tab selection via `?tab=players|guilds`)
- `src/pages/Toplists/playertoplists.tsx` (Players Toplists UI + Firestore data)
- `src/pages/Toplists/guildtoplists.tsx` (Guilds Toplists mock rows only)

Data and context
- `src/context/ToplistsDataContext.tsx` (Toplists provider, Firestore reads, TTL cache)
- `src/lib/api/toplistsFirestore.ts` (Firestore paths, decoders, snapshot schema)
- `src/data/servers.ts` (fallback server list, used indirectly)
- `src/components/Filters/serverGroups.ts` (server grouping helpers)

Filter UI and state
- `src/components/Filters/FilterContext.tsx` (filter state + localStorage)
- `src/components/Filters/HudFilters.tsx` (HUD filter UI)
- `src/components/Filters/BottomFilterSheet.tsx` (mobile sheet filters)
- `src/components/Filters/ServerSheet.tsx` (server picker)
- `src/components/Filters/ListSwitcher.tsx` (cards/buttons list view shell)

Related, non-routing Toplists UI
- `src/components/home/HomeToplistsPreview.tsx` (home preview placeholder)

Legacy or unused API/registry
- `src/lib/api/toplists.ts` (Apps Script API, unused)
- `src/data/toplists.ts` (lazy registry, unused)

## 3) Routing & Navigation (including FeatureGate/Access)

- `/toplists` route is defined in `src/main.tsx` and wrapped by `FeatureGate` with feature id `main.toplists`.
- Feature config for `main.toplists` is active and requires role `user` in `src/lib/featureAccessConfig.tsx`.
- Sidebar entry exists at `/toplists` in `src/components/Sidebar/Sidebar.tsx`.
- `src/pages/Toplists/index.tsx` uses `?tab=players|guilds` query param to toggle between pages.
- The in-page tabs in `src/pages/Toplists/playertoplists.tsx` link to `/toplists/players` and `/toplists/guilds`, but these routes are explicitly mapped to NotFound in `src/main.tsx`.
  - This is a routing mismatch (active vs legacy) and currently breaks the tab navigation.

## 4) URL Params & Filter logic

URL params (actual)
- `tab=players|guilds` is read by `src/pages/Toplists/index.tsx`.
- No other URL params are parsed by Toplists code.

URL params (examples but not implemented)
- `src/pages/Playground/Interop/DeeplinksDemoPage.tsx` shows `/toplists?server=eu1&class=warrior&range=7d`, but there is no parsing or syncing for `server`, `class`, `range`, or `sort`.

Filter state (localStorage)
- `src/components/Filters/FilterContext.tsx` persists filter state to `localStorage` key `TL_FILTERS_V2`.
- Stored fields include servers, classes, days, sortBy, favoritesOnly, activeOnly, searchText, quick flags, and UI mode flags.

Filter-to-provider wiring (Players Toplists)
- `src/pages/Toplists/playertoplists.tsx` maps UI filter state into the Toplists provider via `setFilters` and `setSort`.
- Only `group` and `timeRange` affect Firestore reads. Classes and servers are currently not used in the fetch path.
- `group` is derived from the first selected server only (EU, US, FUSION, INT). Multiple servers from different regions are not handled distinctly.
- `timeRange` mapping:
  - `all` -> `all`
  - `60` -> `30d` (hardcoded special case)
  - otherwise `${days}d`
- `sortBy` is mapped to provider sort (level/main/con/sum/lastScan/name), but provider sort is not used in any query; Firestore uses `sort: "sum"` only.

List view wiring
- `ListSwitcher` expects `list` and `filtered` arrays on filter context, but those are not provided by `FilterContext`. Cards/buttons views therefore show empty content.
- Table view is rendered directly in `playertoplists.tsx` and shows data from Firestore rows.

## 5) Data sources (Firestore/API)

Firestore roots and collections
- Root: `stats_public`
- `stats_public/toplists_bundle_v1` (server list bundle)
- `stats_public/toplists_meta_v1` (thresholds and scope change status)
- `stats_public/toplists_players_v1/lists/{listId}` (player toplist snapshots)

List id format (players)
- `listId = "{group}__{timeRange}__{sort}"`
- Values are normalized to lowercase in `buildPlayerListId`.
- Current usage always uses `sort = "sum"`.

API (legacy, unused)
- `src/lib/api/toplists.ts` defines `fetchToplists()` with query params `server`, `class`, `search`, `range`, `sort`, `order`, `limit`, `offset` for an Apps Script endpoint.
- No code calls this API at the moment.

Table: use-case -> source -> path/endpoint -> estimated reads

| Use-case | Source | Path/Endpoint | Estimated reads |
| --- | --- | --- | --- |
| Load server list for filters | Firestore | `stats_public/toplists_bundle_v1` | 1 doc read per mount |
| Load toplists meta (thresholds/scope) | Firestore | `stats_public/toplists_meta_v1` | 1 doc read per mount |
| Load player toplist snapshot (primary) | Firestore | `stats_public/toplists_players_v1/lists/{group}__{timeRange}__sum` | 1 doc read per filter change |
| Player toplist fallback to group=all | Firestore | `stats_public/toplists_players_v1/lists/all__{timeRange}__sum` | +1 doc read when primary missing/empty and group != all |
| Guild toplists | Mock | `demoRows` in `guildtoplists.tsx` | 0 |

## 6) Snapshot/TTL status

Snapshot structures currently expected:

`stats_public/toplists_bundle_v1`
- Field: `servers` as either an array of server codes or a JSON stringified array.

`stats_public/toplists_meta_v1`
- Fields:
  - `thresholds.players.minChanges` and `thresholds.players.maxAgeDays`
  - `scopeChange[scopeId]` entries with `lastRebuildAtMs`, `lastChangeAtMs`, `changedSinceLastRebuild`
  - `lastComputedAt`, `nextUpdateAt` (present in type but not used in UI)
- `scopeId` is built as `GROUP_all_sum` or `GROUP_{SERVER}_sum` (uppercased).

`stats_public/toplists_players_v1/lists/{listId}`
- Required fields: `entity`, `group`, `server`, `metric`, `timeRange`, `limit`, `rows`.
- Optional fields: `updatedAt`, `nextUpdateAt`, `ttlSec`.
- `rows` item shape: flag, deltaRank, server, name, class, level, guild, main, con, sum, ratio, mine, treasury, lastScan, deltaSum.

TTL and staleness handling
- `ToplistsDataContext` caches player lists in memory only (`Map` in a ref).
- TTL is honored via `ttlSec` from the list doc; if TTL is absent, cached data never expires within the session.
- No localStorage cache for toplist data. Cache is lost on reload/unmount.
- `updatedAt` is shown in the UI; `nextUpdateAt` and `ttlSec` are not displayed.
- No background refresh or SWR behavior beyond the in-memory TTL check.

## 7) Open points / blockers (for production-ready behavior)

- Routing mismatch: `/toplists/players` and `/toplists/guilds` are linked in the UI but route to NotFound. The active page uses `?tab=` query param instead.
- Filter UI is not wired to data: servers, classes, searchText, favoritesOnly, activeOnly do not affect Firestore reads or row filtering.
- Sort UI is not wired to data: Firestore always uses `sort = "sum"` and rows are not re-sorted client-side.
- Range mapping has a special case `60 -> 30d` that likely does not match user intent.
- Cards/buttons list view uses `list`/`filtered` properties that are not provided by the context, so non-table views show empty content.
- Guild Toplists is mock data only; no snapshot path or provider for guilds.
- No URL param syncing for filters, despite deeplink examples in playground.
- i18n is inconsistent: toplists UI strings are hardcoded in English; no i18n keys are used in these components.
- Snapshot status is only partially shown (updatedAt). TTL and nextUpdateAt are not surfaced.

Snapshot production blockers (backend or external)
- No producer is documented in repo for `stats_public/toplists_players_v1` lists or `toplists_meta_v1`.
- The list id naming scheme and `scopeChange` keys must be produced server-side; there is no generator in this repo.

## 8) Recommended next steps (suggestions only, no implementation)

1) Fix routing to align with query param tabs or switch tabs to query string links; remove legacy NotFound routes if no longer needed.
2) Decide whether to keep Firestore snapshots only or re-enable the Apps Script API; wire filters and sort to the chosen data source.
3) Define and implement a snapshot builder for players (and guilds) that writes to `stats_public/toplists_players_v1/lists/{listId}` and `toplists_meta_v1`.
4) Implement server/class filtering either by generating more granular snapshots or adding client-side filtering where acceptable.
5) Add staleness UI using `updatedAt`, `nextUpdateAt`, and `ttlSec`, and define refresh behavior.
6) Wire list views (cards/buttons) to the same data source and filtering pipeline.
7) Add URL param sync for filters if deeplinks are required.
8) Standardize i18n keys for toplists UI strings.
