# Playground YouTube card — Patch 1.1.2

The Playground reads `GET /public/creators-live.json` from the existing
`VITE_AUTH_BASE_URL`. A visitor GET never starts YouTube requests. The homepage,
card layout, three initially visible channels, expand/collapse, three videos per
channel, publication ordering, languages and analytics are unchanged.

## One server-side source variable

Configure `YOUTUBE_SOURCES` as a **normal AuthAPI environment variable**, through
the same runtime configuration path as `TWITCH_CHANNELS`. It is not a secret and
does not need Secret Manager. Its complete starting value, with the unchanged
eight channels and playlist mappings, is in `auth-api/.env.example`.

The value is a non-empty JSON array of objects:
`[{"channelId":"UC…","playlistIds":["PL…"]},{"channelId":"UC…"}]`.

- `channelId` is required; `playlistIds` is optional. Missing/empty playlists
  select the channel's uploads playlist from YouTube metadata.
- Explicit playlists define membership exclusively. Uploads provide current
  candidates; their membership is checked with `playlistItems.list(playlistId,
  videoId)`. Upstream errors abort the update without widening selection.
- Names, channel links, avatars, available statistics and languages come from
  YouTube metadata. No separate names, handles or frontend allowlist are needed.
- Surrounding whitespace is trimmed; IDs remain case-sensitive. Repeated channel
  entries merge their playlists. Empty duplicate entries do not widen explicit
  playlists to uploads. Duplicate playlist IDs are requested once per page.
- Invalid/missing/empty configuration returns HTTP 503 with
  `YOUTUBE_SOURCES_INVALID` on the authenticated
  refresh endpoints. Other features can continue starting without this variable.

`sources.ts` memoizes the normalized configuration shared by collection, cache
addressing and completeness checks. A SHA-256 fingerprint ignores JSON spacing,
source ordering, playlist ordering and duplicate entries. Every published snapshot
contains `sourcesFingerprint` and `sourceCount`; the backend validates exact
channel membership, while frontend/export validate the declared count, unique IDs
and channel/video structure without knowing the source list.

## Cache, storage and endpoints

`POST /admin/creators/youtube/refresh` requires the signed session, admin role
and a current active admin user record. It forces an update.
`POST /internal/creators/youtube/refresh-snapshot` keeps the existing
`x-internal-token` / `UPLOAD_INBOX_TOKEN` authentication. It skips a successful
snapshot younger than one hour only when it also matches the current normalized
configuration. Added/removed channels and changed playlists therefore take effect
on the next successful synchronization even within that hour. Old snapshots
without configuration metadata are refreshed once.

Both paths use `service.ts` / `youtube.ts` and
`creator_snapshots/creators-live.json` (field `youtube`). Matching per-channel
cache pages/details from legacy `creator_youtube_cache/{channelId}` are reused on migration. Changed
playlists start without unrelated ETags. Removed channel documents are not
globally deleted; only configured channels appear in the new snapshot.

Channel metadata and video-detail calls use batches of at most 50 IDs. A cold
cache builds a persistent publication-date/membership index of each explicit
playlist once, including oldest-first lists larger than 2,500 entries. Available
legacy pages and ETags are reused. This is an initial indexing operation under the
existing request/overall deadlines, not the hourly collection algorithm. A failed
bootstrap publishes nothing and retains the last successful snapshot.

Regular runs reuse that index and read upload heads until they overlap the retained
window. Cold upload reads stop after covering 30 days and, for unrestricted channels,
finding ten available videos (or reaching the end). Explicit membership is checked
for relevant recent candidates and the historical candidates needed to fill ten.
The documented `videoId` filter accepts one video ID, not a comma-separated list;
no title heuristic, game category or arbitrary mixed playlist is admitted. Known
positive memberships are checked first and union checks stop at a confirmed match.
Relevant playlist/video query ETags and 304 responses reuse already-read metadata.
Canonical detail batches and removal of obsolete historical negative probes keep
unchanged caches stable across cold/warm collection. Independent membership lookups
run in bounded groups of five without adding requests, retries or polling.

Video details validate ownership, public availability, publication time and upcoming
state. Deduplication and backfill retain up to ten newest matching available videos;
the Card renders three. The 30-day count validates all relevant videos, including
those beyond ten. Failed/incomplete API traversals cannot publish an exact zero or
partial total. Playlist position/addition time is never the publication date.

The 210-second Firestore lease and shared in-process promise prevent parallel
updates. Another instance receives HTTP 409 / `Retry-After: 5`. Collection keeps
its 180-second overall / 15-second request budgets. The publishing transaction
checks lease ownership/expiry and atomically writes the snapshot and caches.
Invalid configuration, failed requests and failed publication preserve the last
successful snapshot. No visitor retry loop or automatic stale refresh was added.

The existing `npm run sync:creators` uses the internal generator before exporting
its YouTube field to `public/data/creators-live.json`. It needs `AUTH_BASE_URL`
(or `VITE_AUTH_BASE_URL`) and the server-side `UPLOAD_INBOX_TOKEN`. Existing
sheet membership, legacy statistics and Twitch hydration are retained. It refuses
malformed/incomplete snapshots before writing the export.

## One-time manual setup / deployment (not performed by Codex)

1. Copy the complete JSON value from `auth-api/.env.example` into the AuthAPI
   runtime's normal `YOUTUBE_SOURCES` environment variable. In the cloud editor,
   enter the JSON array itself without the dotenv wrapping single quotes.
   Preserve the existing `YOUTUBE_API_KEY` environment/Functions binding and
   all other settings; no new key or source-list secret is required.
2. Deploy the updated AuthAPI once through the established **gcloud** workflow,
   preserving the existing project, region, entry point, service account, environment
   and secret parameters, with `--runtime=nodejs22 --timeout=240s`. Build through
   that existing workflow. Do not switch deployment tools or change rules, indexes,
   unrelated functions or the scheduler.
3. Trigger one synchronization with the existing admin button in
   `/#/playground/youtube`, or an authorized POST to the existing internal
   endpoint. Check its success and source count. Failing playlists must be
   corrected explicitly rather than replaced with unrelated uploads.
4. Publish the updated frontend once through the existing frontend process,
   after the backend has published the first new-format snapshot. This includes
   the dynamic snapshot reader/validator. Static exports use the updated CLI.

Later source edits require only editing/saving that same `YOUTUBE_SOURCES`
runtime variable (activating the updated runtime revision as usual) and the next
successful scheduled/manual synchronization. No frontend change/deployment,
source-code edit, cache clearing or Firestore deletion is needed. Unchanged JSON
semantics retain the current one-hour cache.

## Verification boundaries

Focused tests use explicitly simulated YouTube and Firestore responses. They
cover source validation/normalization, the original seven source mappings,
different channel counts, metadata batching, uploads/playlist selection, cache
changes, errors, authentication and frontend/export validation. Such tests do
not establish current live playlist availability, real API quota, cloud
transactions, deployment or a running scheduler. No Cloud configuration,
secrets, scheduler, rules, commits, pushes or deployments are changed by this task.

## Safe manual-update diagnostics (W280)

The authorized admin refresh response returns a fixed `error` code and a
`diagnostic` object with an approved processing `stage`, optional upstream
`httpStatus`, public `channelId`/`playlistId`, approved YouTube `reason` and
approved `storageCode`. Unknown errors become `YOUTUBE_REFRESH_FAILED` without
their text. Neither raw errors/stacks, request URLs, response bodies nor
credentials are logged or returned. Logs contain the same sanitized fields with
event `youtube_sync_failed`. Internal scheduled callers receive the safe code
only; public reads receive only `YOUTUBE_SNAPSHOT_MISSING` or
`YOUTUBE_SNAPSHOT_UNAVAILABLE` on failure, without internal diagnostics.

The existing Playground status area distinguishes an absent first snapshot, a
failed initial update, a failed update with existing data retained, and a busy
update. Texts in EN/DE/HU/CS/PL append the approved code. Technical fields and
upstream text are not rendered. The button is usable again after a failed first
attempt. There are no new retries, requests, timers or status polling.

Manual steps for Danny: deploy this backend through the existing gcloud Node22 /
240-second workflow and publish the updated frontend through its normal workflow.
Then click Update now **once** as an authorized admin. If it fails, inspect the
POST /admin/creators/youtube/refresh response: record only `error` and the
whitelisted `diagnostic` fields (or the corresponding `youtube_sync_failed` log).
For example, an upstream failure can report `YOUTUBE_API_REJECTED`,
`stage=playlist_items`, a numeric HTTP status and an approved reason; a failed
publication reports `YOUTUBE_SNAPSHOT_WRITE_FAILED`, `stage=publish_snapshot`
and an approved storage code when available. These examples are possible
classifications, not a diagnosis of the original live 503. Do not copy request
URLs, headers, cookies, tokens or environment values into a report.

The original live failure remains unverified until that single deployed attempt
provides evidence. No missing index, frontend Rules issue, API key problem or
quota exhaustion is inferred from a generic 503. No Cloud/rules/index/secret or
scheduler change is part of this task.


## Patch 1.1.2 — bounded storage (W281)

The one public YouTube snapshot contains **up to ten** newest available own public
videos per channel. Card rendering slices three, including old exports. New frontend
and export requests opt into `?videos=10` on the existing endpoints. Requests without
that parameter return three for already-open older clients. Selection still traverses
all configured playlists within the existing safety cap; thirty-day counts are not
limited to the ten displayed-snapshot videos. `YOUTUBE_SOURCES` remains authoritative.

Internal YouTube pages/details are fragmented losslessly (16,384 UTF-16 code units,
without splitting surrogate pairs), then grouped by stable SHA-256 prefix into
`creator_youtube_cache/b_root` and, only when necessary, `b_<binary-prefix>`.
The durable `creator_sync/youtube` lease holds the small leaf directory and successful
`checkedAt`/content hash. Empty leaves remain; splits never cause regular deletes or
whole-cache repacking. Removed channels stay reusable. Changed cache leaves alone
are written. Unchanged public content is retained byte-for-byte: successful check
metadata updates the lease instead. A public read uses two transaction document
reads (snapshot + coordination) to report the successful-check time accurately;
the lease content is never exposed. There are no new timers or provider requests.

GoatCounter uses `visitor_metrics_public/bundled` (schema 4) and its existing
`pages/b_root` / `pages/b_<binary-prefix>` namespace. Private per-page hash shards
are replaced by content hashes in the required central manifest; no additional
private index is read/written. The current manifest and changed bundles publish in
one bounded atomic commit. Its timestamp/sequence is publication metadata; unchanged
metric bundles are not written. Old `current`, generations and W279 `live` remain
frozen. New clients fall back bundled -> live -> current only while migrating.
Normal readers fetch the manifest and just the page's bundle, reusing an unchanged
bundle hash across routes and hours. Exact bundle-hash verification and one shared
manifest reconciliation reject mixed statistics; verified absent paths yield zero.
The existing hourly scheduling/retry bounds and error retention are preserved.

Both packers measure Firestore UTF-8 strings, field names, nested maps/arrays,
scalar values and document names using the official storage-size rules, rather
than character counts. Documents stay <=512 KiB (50% of 1 MiB), including public metric bundles.
Only overflowing leaves split; ordinary records are not truncated or repacked.
An individually oversized metric row is encoded into stable `f_<path-hash>_<part>`
documents (65,536 UTF-16 units without breaking surrogate pairs). Its addressed
bundle contains ordered fragment hashes. Readers fetch only the needed row's
fragments, verify every hash, reassemble JSON, and verify the complete page path.
Shared content-hash caches also reuse fragments. The central publication holds
only the required comparison hashes; unchanged fragments are never rewritten.
An aggregate bundle-size threshold itself never aborts publication: it splits.
Cold visitors may transfer up to 512 KiB for one needed bundle; this deliberately
prioritizes fewer document reads. Transfer sizes and this tradeoff are recorded
separately from operation counts in the task report. Public root/lease directories are size-checked too. Atomic writes
are conservatively bounded to 8 MiB and 450 operations; excess fails before
publication and keeps the last success. No configurable channel-count cap added.
References: https://firebase.google.com/docs/firestore/storage-size and
https://firebase.google.com/docs/firestore/quotas .

### Manual steps for Danny — exact order

1. Deploy the backend using the existing **gcloud**, **Node 22**, **240 seconds**
   workflow and the existing project/region/service account/environment/secrets.
   Preserve scheduler/authentication, YOUTUBE_SOURCES, counting start/revision and
   all existing settings. Do not deploy speculative Rules/index changes.
2. Wait for one successful hourly publication of both services, or deliberately
   invoke the existing authorized internal endpoints/admin controls once. Confirm
   YouTube's ten-cap snapshot, durable cacheLayout/check time and schema-4 complete
   GoatCounter `bundled` with its addressed bundles. On failure keep old frontend
   and all previous snapshots; use W280's sanitized diagnostics only.
3. Publish frontend and use the updated export CLI. Already-open old clients
   continue to receive compatible YouTube responses / frozen GoatCounter data.
   Reload old clients before removing that frozen data. Existing Rules already
   permit get on `visitor_metrics_public/{id}/pages/{id}` and its root; no new
   rule/index path is required by the checked-in Rules.
4. Optional, later, **one-time cleanup** after all old backend instances and old
   readers have stopped: from auth-api run
   `node tools/snapshot-legacy.cjs --project PROJECT --plan ABSOLUTE_EXTERNAL_PLAN.json`.
   This only previews legacy YouTube channel docs, obsolete split parents, W279
   `live/pages`, frozen `live` and old private `page_hashes`. Inspect every planned
   path/project/update time. Apply exactly that plan with the same command plus
   `--delete --ack-old-readers-reloaded`. Update-time preconditions reject changed
   targets; current active leaves, leases, configuration and new snapshots are
   excluded. Do not run concurrently with a backend rollback. Earlier hourly
   generations/current retain the separate `visitor-generations.cjs` preview/apply
   procedure from W279; run that before removing its frozen `live` prerequisite.
   No cleanup runs during app startup, a public read or an hourly job.

No cloud cleanup/deployment is performed by this change. Operation/transfer
measurements in the W281 report are simulated fixture values, not live billing.


## Patch 1.1.2 — current-source selection and channel images (W282)

The current complete eight-channel `YOUTUBE_SOURCES` value is in
`auth-api/.env.example`. SF Coaching (`UCKGe-gffylarIyHhL65PkUg`) now has
`playlistIds: []`; KugysPLAY (`UCSdgSH0IoO83ufqO3fFkVmA`) retains `[]`. All other
channel IDs and playlist bindings are retained, including Dorzer's confirmed S&F
lists. The public snapshot validator and frontend require no second source list.

ZsombeyHD remains `UCQ_QAobbdVw6ntDMAloTKww` with the dedicated S&F playlist
`PL9NhY-4uDdGohWFkdyE5Zq5juX5H5cuUt`. Public channel playlists, videos,
streams and channel search were checked. The additional public stream playlist
`PL9NhY-4uDdGrseNV8dC18ca03WlNdGueK` contains other games and is excluded.
No similar-name channel or unverified current S&F source is substituted. The W282
external report records the dated source evidence and live verification boundaries.

Channel metadata URLs load directly in the regular Playground. An image failure
renders the existing neutral Lucide ImageOff icon, with the existing avatar/thumbnail
geometry and translated accessible label in EN/DE/HU/CS/PL. The shared player portrait
is no longer a YouTube fallback. Image state belongs to the metadata URL and resets
when that URL changes. There are no image retry loops, proxies, polling or changes
to global image policy. Existing Card CSS is unchanged.

### Manual steps for Danny

1. Copy the complete JSON value from the `YOUTUBE_SOURCES` line in
   `auth-api/.env.example`, without dotenv's outer single quotes, into the existing
   AuthAPI environment setting. Keep the existing key/binding and all other values.
2. Deploy AuthAPI through the existing **gcloud**, **Node 22**, **240 seconds**
   workflow, preserving project, region, service account, entry point and secrets.
   No scheduler, Rules, index or unrelated service change is required.
3. Allow the existing hourly job to publish its first successful indexed snapshot,
   or use the existing authorized manual Admin button once. The first collection
   builds the persistent source index; subsequent collections reuse it. Do not clear
   the cache or delete the last good snapshot. Existing bundled storage/unchanged
   write suppression, safe diagnostics and error retention remain in place.
4. Publish the updated frontend through its normal process after backend success.
   This task does not run deployments, live refresh endpoints, commits or pushes.

## Patch 1.1.2 — public read reuse and browser channel images (W283)

Public YouTube GETs share a coalesced, fixed 60-second response cache within one
warm backend process (bounded at the hourly publication window). Both three- and
ten-video representations derive from that same snapshot. A successful central or
manual publication primes it immediately; read failures retain the last success.
Other instances and restarts still read independently. HTTP max-age/s-maxage use
the remaining fixed lifetime. GET never starts collection or writes Firestore.

YouTube and public GoatCounter readers reuse only public records in the existing
IndexedDB `sfdatahub/metadata` store, under `sfdatahub:public-read:v1:`. Keys include
endpoint/project and schema/content versions. Fixed expiry follows the next hourly
publication window (hour + two minutes); an absent/late publication gets the existing
limited three-minute retry, at most two attempts in the current hour. Reloads retain
that budget. A failed manual update leaves data and the actual success timestamp
unchanged. The public cache does not contain sessions, roles, accounts or favorites.
Denied storage falls back to memory; reload persistence then cannot be guaranteed.
Same-origin Web Locks coordinate pending loads, with in-tab coalescing as fallback.
BroadcastChannel distributes successful YouTube publication updates. No Firestore
listener, additional public-cache write or infrastructure is introduced.

GoatCounter persists the manifest and only requested, hash-verified buckets and
fragments. Hash-addressed successful data has a fixed one-day lifetime; unchanged
hashes can survive a new publication. Missing/unverifiable bundles stay unavailable,
not zero. Berlin date boundaries, counting and publication packing are unchanged.

Channel metadata now selects YouTube's provided medium (240 px) avatar, sufficient
for the existing 104 px image at 2x density; video thumbnail selection is unchanged.
The browser uses normal HTTP caching for anonymous CORS requests, without cookies
or page referrers. The observed CDN response allows `Access-Control-Allow-Origin: *`
and public max-age 86400. Decoded image bytes are reused in the bounded browser-only
CacheStorage `sfdatahub:youtube-avatars:v1` (maximum 32 URLs), never Firestore or
cloud storage. Only successful image responses that actually decode are saved.
Cache-Control no-store is respected. Existing successful images remain available
when a replacement fails. Only URL/coordination metadata uses the shared public
metadata namespace. Blob URLs are created for display and revoked on replacement
or unmount, not persisted.

A failed source gets a browser-local cooldown, with no retry timer or host/URL
rotation. Readable Retry-After seconds/dates are honored; if the CDN does not expose
that header to CORS, the conservative fallback is one hour. The observed successful
CDN response exposes Content-Length only. A genuinely changed metadata URL has an
independent failure state. A neutral icon is shown only if no successful image is
available. The existing EN/DE/HU/CS/PL image-unavailable labels remain in use.

Danny's observed HTTP 429 -> HTML -> Chrome ERR_BLOCKED_BY_ORB remains distinct
from successful image requests in the private test Chrome. The affected personal
browser was not accessed, so resolution of that specific browser failure remains
unverified. There are no disabled browser protections, proxies or cachebusters.

### Manual steps for Danny

Use the existing AuthAPI gcloud deployment workflow with Node 22 and timeout 240s,
preserving the existing environment/secrets and W282 source configuration. Let the
existing scheduled or authorized manual publisher produce the smaller-image
snapshot, then publish the frontend normally. No additional Cloud Storage, Rules,
indexes, scheduler, Firestore image records or paid service is required. No deployment,
commit, push, production refresh or cloud write was run for W283.
