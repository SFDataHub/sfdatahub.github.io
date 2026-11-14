# Visitor data contract (W298)

`GET /api/admin/stats/visitor/snapshot` requires a valid session with `admin` or
`don`. Missing/invalid sessions return 401; other roles return 403. Don is an
additional role beside `user`, with no moderator/developer/admin inheritance.
The admin-only PUT config, POST refresh, existing menu/page gates and Collection
admin preview remain protected. No account is assigned a role by this change.

GET returns stored data, never GoatCounter evaluation or writes. A private 60s
process cache coalesces subsequent settled reads; refresh invalidates it. Distinct
cold processes still read independently. Sources can have different data dates.
On read failure a previous in-process source is returned with state `error` and
its original date. On refresh failure stored metrics retain their original date;
only `lastRefresh` changes. No automatic detail refresh/job has been added.

## Envelope, schemaVersion 1

- `timezone`: Europe/Berlin; `retrievedAt`: API response time, not measurement time.
- `website`, `details`: `{state, asOf, ageSeconds, stale, error, data}`.
- Source states: `available`, `legacy` (old detail schema), `not_available`, `error`.
  `data` is null when missing. Error may retain valid previous `data`.
- `stale` when unknown age, over two hours, or the latest refresh/read failed.
  The details are explicitly refreshed by an admin and can naturally be older.
- `availability` names unavailable/new fields for old snapshots; `limits` exposes
  the top-25 ranking limit. Tool targets and usage entries are not top-25 truncated.
- An API/network error remains an error, never a zero. Consumers retain their last
  successful response on transport failure. No names are fabricated or loaded.

## Dashboard field mapping

All paths below are relative to the GET response. No preview image was provided
with W298; this covers every numerical requirement in its task, without inventing
further visual cards.

| Metric | Response field | Counting and period | Availability / bounds |
| --- | --- | --- | --- |
| Website visitors today | `website.data.website.today` | Existing fixed `sfdatahub/website-visit-v2` session event; Berlin today up to `website.asOf` | Only when `website.data.state=ready`; never sum page counts |
| Website visitors total | `website.data.website.total` | Same stream since `website.data.effectiveStartDate` | Existing verified public configuration, unchanged |
| Website daily average | `website.data.website.dailyAverage` | Same stream; trailing max.30 calendar days, clipped to effective start, includes zero/partial days; divisor `website.data.dayCount` | Existing denominator/period unchanged |
| Existing page visits today/7d/30d | `details.data.totals.{today,last7d,last30d}.visits` | Sum of non-event per-path session counts, not website uniques | Full window totals, not top-25 sum |
| Top pages | `details.data.topPages.{last7d,last30d}` | Same existing session page stream | At most25 entries per window |
| Top player profiles | `details.data.topPlayers.{last7d,last30d}` | Same page stream; old `/player/:id`, `/players/profile/:id` and current local player route | At most25; actual identifier only, no name enrichment |
| Top guild profiles | `details.data.topGuilds.{last7d,last30d}` | Same stream; old `/guild/:id`, `/guilds/profile/:id` and current local guild dashboard route | At most25; actual identifier only |
| Top guides | `details.data.topGuides.{last7d,last30d}` | Same stream; existing guide query selection retained | At most25 |
| Internal usage total/categories/actions | `details.data.eventUsage.{today,last7d,last30d}.{count,categories,events}` | Exact fixed catalog and six existing dynamic families; action occurrences, `no_session=true` | Unknown historical collection start/retention; all available recognized rows evaluated |
| Successful Collection displays | `details.data.collectionDisplays.{today,last7d,last30d}` | `sfcollection/display-v1`, first valid height per actual mount | Per-window `state`, nullable `count`, `coverage`, `trackingStartedAt`; no reconstruction from `/sf-collection` |
| Tool clicks total/each target | `details.data.toolClicks.{today,last7d,last30d}.{count,targets}` | `sfcollection/tool-click-v1:` + normalized target, every valid activation | Same availability as displays; sum targets equals count; not confirmed new-tab views |
| Separate newer page events | `details.data.pageViewEvents.{today,last7d,last30d}.count` | `sfdatahub/page-view-v2:` event occurrences | Explicitly separate from old session pages and website visitors; historical coverage unknown |
| Data date / age / last attempt | `website.asOf`, `details.asOf`, `*.ageSeconds`, `details.data.lastRefresh` | Measurement cutoff and refresh attempt are separate | Last valid data retained after errors |

Detail snapshot schemaVersion2 retains all old fields, plus `ranges`, `counting`,
`limits`, `eventUsage`, `collectionDisplays`, `toolClicks`, `pageViewEvents` and
`lastRefresh`. `ranges`/each event window provide `startDate`, `endDate`, exact UTC
`startDateTime`/`endDateTime`. Today, today minus6 and minus29 start at midnight in
Europe/Berlin (DST included), ending at the shared snapshot instant. The current
partial day is included. Older schema1 snapshots have no new counters; consumers
must consult the envelope before accessing them.

## Tracking / availability

The existing central `/sf-collection` page tracker is unchanged. CollectionFrame
registers one combined height/click receiver. Exact origin `https://sfgame.12hp.de`
and current iframe.contentWindow are required. First valid positive finite height
counts once; effect replays, width resets and later heights do not reset the ref.
Unmount/access loss removes the receiver; a later genuine visit mounts anew.
Auth-loading/construction/access-denied states never mount the frame.

Current Don protocol: `{type:"dons-sf-collection:tool-link-click",url:<absolute URL>}`.
The former `dons-sf-collection:link-click` is ignored. The handler never controls
opening the tab, waits for it, or rate-deduplicates genuine repeated clicks.

Tool URL: string<=2048, absolute HTTP(S), no credentials/controls/whitespace or
backslashes; normalized target<=512. URL parsing canonicalizes scheme/host/default
port; path stays case-sensitive and trailing slashes fold (root stays `/`). Query
and fragment are discarded before queueing, grouping and display. Thus query-only
or fragment-only variants group together. No seven-tool allowlist; future valid
HTTP(S) destinations work. No account/session/user data is appended. Only the
validated normalized target enters the fixed event prefix, never the raw message.
The existing bounded10s queue and provider-exception handling are reused.

`events.ts` is the pure browser/backend catalog. Fixed IDs keep their established
meaning. Dynamic families: YouTube channel/video IDs, Twitch login, seven dungeon
book IDs, help question slug, toplist players/guilds server registry code and a
positive safe setup server count. Historical valid help/server IDs remain readable
without requiring today's catalog to contain them. Categories have stable IDs and
labels. No new user actions were introduced solely for statistics.

For new counters without a verified start: positive counts are `observed` with
unknown coverage; absent rows are `not_recorded` with `count:null`, never a fully
measured zero. A confirmed collection tracking start can be stored by admin PUT
config as optional ISO `collectionTrackingStartedAt` (null removes it). Ordinary
settings saves preserve it. This is independent of legacy `collectionStartDate`,
which concerns the website v2 verification. No historical start is inferred.
With the verified start inside a window, counts including0 are `partial`; with
start at/before its boundary they are `available`. Before a future start, absent
rows remain `not_recorded`. Historical gaps, retention and blockers can still
limit actual source coverage; counts describe recorded events, not all humans.

## Storage / rollout

Only explicit admin POST refresh runs the existing three fully paginated
GoatCounter window reads. The same returned rows feed legacy pages and all event
sections once; no extra query per family/action, no Firestore per click. Existing
API retry/deadline/pagination protections are retained. Details have a512KiB
size/8MiB atomic-payload guard; overflow fails visibly, retaining last valid data.
No public publisher/scheduler/metric implementation, rules or indexes change.

Manual steps for Danny, not executed here:

1. Deploy authApi through the established gcloud workflow, retaining Node22,
   timeout240s and existing secrets/project/region/service account. No new secret,
   function, scheduler, rules or index is required.
2. Publish frontend through the existing workflow. After the new tracker is
   actually active, an admin may record the verified ISO deployment time using
   PUT config with the existing startDate/sessionsVerified and optional
   collectionTrackingStartedAt. Leave unset until deployment is known; do not
   backdate from route visits. Existing settings UI needs no change.
3. Run the existing explicit admin refresh once to create detail schema2; later
   refresh deliberately as needed. GET and Don never trigger a full evaluation.
4. Danny assigns `don` through the existing admin user controls. Base `user` is
   retained. The target signs in again to obtain new access/refresh role claims;
   existing refresh tokens retain their issued roles, as before (no global
   session-policy change). No real account was modified during development.
5. Build the new dashboard/settings overlay separately, consuming this GET
   contract and handling source/window availability before showing numbers.


## W300 – dashboard and optional dynamic tool names

The existing `/admin/visitor-analytics` frontend now consumes the shared stored
GET envelope after authenticated `admin`/`don` access is settled. Tabs and the
7/30-day selector use that single response. Admin explicitly refreshes with POST
then GET; Don uses GET only. Settings/config are mounted and fetched only when an
admin opens the compact dialog. Website cards keep their own today/start/max30
periods; response time is never presented as a measurement cutoff. No backend
permission, public metric, tracking count or Collection height rule changes.

The current Don message additionally contains optional `toolName`. The exact
Origin/iframe Source checks stay in place. `normalizeToolName` accepts trimmed,
nonempty plain strings up to120 UTF-16 code units, excluding control characters,
HTML angle brackets and the technical tool-event prefix. Invalid/missing names
never discard a valid URL click. The existing event path remains
`sfcollection/tool-click-v1:<normalized target>`; only GoatCounter `title` may carry
the display name. The existing queue, `no_session`, count semantics and target
normalization remain unchanged; no name catalog or per-click database write.

The existing paginated `stats/hits` reader carries an optional valid `title` in
`Hit`. `buildEventStats` groups and sums only by normalized target URL and projects
optional `toolName` on `toolClicks.{today,last7d,last30d}.targets[]`, next to existing
`id`, `target`, `count`. Stored schema2 snapshots and the GET envelope carry this
property without a migration/schema change. Old targets omit it; the dashboard
then displays the target URL. Technical historical event titles are not names.
Identical names on different URLs remain separate; changed names on the same URL
never create a new counter. If several input rows for one URL have different
valid titles, the title from the largest-count row wins (lexical tie break), not
an invented latest title: the statistics response has no title-change timestamp.

Provider behavior checked against official documentation and upstream source:
[JavaScript parameters](https://www.goatcounter.com/help/js),
[stats/hits HitList.title contract](https://www.goatcounter.com/api.json),
[Path.GetOrInsert/updateTitle](https://github.com/arp242/goatcounter/blob/master/path.go).
Upstream keeps the path identity and changes an existing title only after more
than10 repeated observations of that new title in its title-change cache. Its
path cache can also delay visibility. Therefore names require actual newly
recorded clicks, provider propagation and a later explicit detail refresh; no
instant rename or historical per-click name reconstruction is promised. This
source review is not a live mutation test of the hosted GoatCounter instance;
no real statistics were written for verification. Old snapshots remain readable
until refreshed, and title metadata has no effect on public visitor/page counts.


## W301 – stored screen-width distributions and private 800 KiB limit

This addition extends W298/W300 without changing any tracking/session definitions.
Only deliberate admin POST refresh calls `stats/sizes`; protected GET, Don reads,
tabs, periods and content expansion continue reading the one stored snapshot.
The public hourly publisher still uses only its existing hits reader.

### Source contract and counting

Official sources checked on 2026-11-14:
- [API schema](https://www.goatcounter.com/api.json), `stats/{page}` with page=sizes:
  start/end, limit (max100), offset, include_paths (IDs), path_by_name (not used).
  Response `{stats:[{id,name,count}],more:boolean}`.
- [API handler](https://github.com/arp242/goatcounter/blob/main/handlers/api.go):
  sizes uses ListSizes, which currently returns all five classes without pagination.
- [ListSizes](https://github.com/arp242/goatcounter/blob/main/hit_stats.go): IDs
  phone=(0,600], tablet=(600,1000], desktop=(1000,1920], desktophd=>1920,
  unknown=width0. Those are width ranges, not reliable device classifications.
- [counter](https://github.com/arp242/goatcounter/blob/main/public/count.js):
  screen.width, not viewport width; CSS pixels, not physical pixel resolution.
- [size aggregation](https://github.com/arp242/goatcounter/blob/main/cron/size_stat.go)
  and [hit aggregation](https://github.com/arp242/goatcounter/blob/main/cron/hit_count.go)
  both exclude bots and count FirstVisit, whose session handling is per path in
  [memstore](https://github.com/arp242/goatcounter/blob/main/memstore.go).
  Thus the underlying session stream agrees, but the aggregation periods differ:
  sizes stores day buckets; hits stores hourly counts. ListSizes converts request
  bounds through the API user's timezone to dates, then selects inclusive stored
  dates. The hosted user's timezone and historical retention have not been read.
  No exact equality with Berlin hourly page totals is assumed, even if observed
  counts happen to agree. Unknown is taken solely from the provider class.

Klein<=600, Mittel=601–1000, Groß>1000 CSS pixels. These match existing
VisitorAnalytics.module.css responsive boundaries (600/1000). The two wide native
classes are added whole; no range is split or exact widths invented. Browser
window breakpoints are a useful reference only: screen width does not assert the
actual layout viewport. The dashboard explains this distinction.

### Stored additive schema2 field

`screenSizes = {classes:{smallMax:600,mediumMax:1000,unit:screen_css_pixels,
basis:per_path_sessions_provider_days},asOf,last7d,last30d}`.
Each window stores requested start/end dates and instants, `overall`, and `byPath`.
`byPath` keys are the exact normalized ranking paths, once each across all four
Top25 lists. Each distribution is `{state,counts:{small,medium,large,unknown}|null,
total:number|null,pageVisits}`. No raw widths, original path arrays or duplicate
ranking payloads are persisted. Original path IDs are transiently associated using
the existing page normalizer; all originals in a merged guide/page are included,
while separate player/guild profile paths remain separate. Only non-event rows
accepted by that normalizer enter either overall page totals or sizes.

`total` is the sum of four measured classes, including Unknown, and is the only
percentage denominator. `pageVisits` is the existing hourly-page count, shown
separately. No subtraction fills Unknown and no scaling forces agreement. A full
five-class response with zeros preserves actual source zeros; empty stats is
not_recorded/null; missing/duplicate/unknown classes or incomplete pagination
fail the refresh. An observed response does not claim complete historical
coverage. When some requested ID blocks provide no measurement, available sums
are partial, explicitly labelled. All missing blocks means not_recorded.
Zero denominators show no percentage. Old schema1/2 snapshots without this field
show “Noch keine Messdaten”. Source error/age and original asOf still apply.

### Requests, failure and limits

Per 7/30-day window, deduplicate delivered normalized Top25 paths (G<=100), read
each group's original IDs in blocks of<=100, then remaining non-event IDs in
blocks of<=100 for the overall distribution. No original ID is read twice within
that window, including paths also present in profile/guide lists. Events are
never queried for sizes, regardless of their number. No unfiltered sizes request
is allowed. The overall distribution adds these disjoint blocks.

For P original accepted non-event paths, size requests per window are
sum(ceil(group-originals/100)) + ceil(remaining-originals/100), at most
G + ceil(P/100). Normally each native response has five rows and more=false.
All future pagination uses offset and rejects repetition/no-progress/missing
classes instead of publishing a truncated result. Add the existing three fully
paginated hits-window reads. The single reader shares all guards: max240 HTTP
attempts total (including max2 retries on429), 180s deadline, 10s request timeout,
350ms spacing, bounded Retry-After, 14,000-character URL bound and max200 pages
per query. Exceeding any bound fails the entire refresh. These are hard ceilings,
not a guarantee every possible dataset will fit. No cloud timeout/job/secrets
change. All old data and its date remain on provider/pagination/size failures.

Only the private writer opts into 819,200 bytes for analytics/visitor_analytics.
SAFE_DOCUMENT_BYTES remains524,288; all other callers/documents retain it.
assertAtomicSize still applies its8MiB aggregate/450-write limits. documentBytes
is reused, including document name/field/map metadata. The serverTimestamp field
is sized as its eventual8-byte Timestamp, not the transform sentinel's internals.
The error-marker merge is checked against the retained complete document too;
if even that marker cannot fit, the POST reports failure and the old document
remains untouched. No splitting, trimming, dropping ranks/events or new document.

Local proof uses controlled official-format API responses and the existing W300
private test basis; it is not live private history or a real cloud persistence
test. Publish the complete AuthAPI and frontend together through the existing
workflow, then deliberately run an admin refresh and compare genuine provider
coverage, dates and measured size totals. This task performs no build, commit,
push, publication, role assignment, rules/index or cloud changes.


## W303 – public inline metrics and private configuration/lease

This storage update starts from the current W298/W300/W301 implementation. Public
website/page counts keep their existing event paths, canonicalization, Berlin date
boundaries, selected start, max30-day averages and hourly publication. The private
analytics/visitor_analytics document remains separate with its opt-in800KiB guard;
screen sizes, internal usage, Collection and Don details never enter public storage.
readSnapshot accepts both public schemas4 and5, preserving the shared dashboard
website source/envelope and the private detail source.

### Public layout

The existing visitor_metrics_public/bundled document contains website metrics and,
when the complete document fits <=524288 Firestore storage bytes, inlineEntries
with every compact page row addressed by its existing canonical-path SHA256. The
size calculation includes names, nested maps, public metadata, sequence, basis,
bundle/fragment directories and the document path. An overflowing total is packed
losslessly into the existing stable pages/b_<prefix> leaves; oversized individual
rows retain the existing addressed/hash-verified fragments. Only the requested
page's external leaf/parts are read. No path count cutoff, truncation, generation
rotation, collection scan or recurring delete is introduced. The existing8MiB/
450-write atomic-publication guard remains; exceeding that independent safety
limit retains the old publication and is not represented as successful partial data.
Unchanged external hashes are reused without readback or rewrite.

New public readers accept schemas2/3/4/5 and use the existing browser cache and
request coalescing. A small cold snapshot costs exactly1 document read,0 writes;
its inline pages, missing-page zeros and warm navigation need0 further reads.
An external cold page needs1 root +1 addressed leaf +F required fragments; other
leaves are never requested. A valid browser cache can reduce those numbers to0.
The unchanged hourly clock, two-attempt bound and one reconciliation handle late
publication/errors without replacing successful data/time with invented values.
Fallback to live/current is only used when bundled is absent during historical
migration, not as a permanent status check.

### Private coordination and old instances

analytics/visitor_config keeps every setting and collectionTrackingStartedAt plus
private syncLease={version:1,id,until}. Acquire/release writes touch only this map;
config PUT preserves the map and unrelated fields. Config API responses exclude
coordination. The prepublication comparison hashes evaluation settings including
the optional tracking date and rollout option, never syncLease. Thus a changed
lease expiry is not misreported as a settings change, while owner/expiry are still
checked separately. Config changes during fetch or provider/commit failure preserve
the entire last successful public snapshot/asOf.

The first acquire reads the legacy analytics/visitor_sync_lease once as well as
config/root. An active old owner causes a skip, with no polling. Once idle/expired,
the transaction writes the shared lease and a permanent legacy fence
{id:config-document-v1,until:Number.MAX_SAFE_INTEGER}. Old publishers can neither
acquire nor publish after takeover. The old document is never automatically deleted.
New steady refreshes ignore it. Config saves in OLD backends used replacement-set
and cannot preserve an unknown shared lease: before migration, route config writes
to the new backend exclusively. If an old writer nevertheless erases coordination,
publication fails ownership validation; subsequent acquires detect the legacy fence
and fail closed rather than steal an unprovable owner. Stop old writers; wait for
all in-flight leases to expire and deliberately restore the private shared idle
marker before retrying. This recovery is a separate manual intervention, not an
automatic lock reset. No personal/live settings are accessed by the local proof.

### Already-open clients and finite compatibility bridge

legacyPublicClients defaults to true for existing configurations. In that mode the
public root stays schema4, adding inlineEntries for new readers while keeping all
old schema4 addressed bundle descriptors/data current. Already-open old clients
still read their original root+leaf format. Small new readers still use one read.
Only changed bridge leaves are written, unchanged leaves reused. The temporary
duplicate small page map is intentional and its extra writes are counted separately.
After all old backends/clients stop, an admin may PUT the existing valid startDate,
sessionsVerified and legacyPublicClients:false using the existing config endpoint.
Ordinary settings saves preserve this option and the optional tracking date. The
next job publishes schema5 with no compatibility page writes for inline data.
Larger data retain external schema4 bundles, whose immutable-by-hash content format
stays readable by the new reader. Old live/current generations remain frozen.

### Local document accounting and limits

Counts exclude provider HTTP calls and auth role reads, and assume no transaction
retry. Steady complete hourly refresh:3 reads (config+root acquire, config validate),
3+C writes (private acquire/release, public root, C changed external leaves/parts),
0 deletes. Small schema5 has C=0 for both unchanged and changed page values. First
handover adds1 legacy read/1 legacy write. Steady same-hour skip:2 reads/0 writes;
an active legacy owner:3 reads/0 writes. A failed acquired run adds1 private cleanup
read and, only for its own owner,1 release write. Additional bundles/parts contribute
only their changed writes. Actual Firestore transaction retries add their repeated
reads; aborted attempts commit no writes. The compatibility bridge has its actual
changed-leaf writes in C. These are locally simulated measurements/formulas, not
live billing or measured production savings. Public reads never consult config/lease.

### Manual steps for Danny – not executed

1. Publish the new frontend first. Its public reader accepts old schemas and the
   new inline layout. Keep the old frontend available until rollout is ready.
2. Publish the complete current AuthAPI (including W298/W300/W301 and YouTube
   changes) through the established Node22/240s path. Before its first hourly/manual
   public publication, route admin config writes exclusively to the new revision.
   Keep project, secrets, scheduler, tracking configuration and count events intact.
3. The next hourly sync performs the private fence migration and updates the shared
   public snapshot. An active old lease may defer that one attempt; use the existing
   bounded scheduler/action later. Do not run new polling/retry jobs. Verify real
   persistence/data coverage after deployment; the local proof uses storage adapters.
4. Complete backend routing and reload old frontend tabs. Use authenticated
   GET/PUT `${AUTH_BASE_URL}/api/admin/stats/visitor/config` for the following
   explicit rollout save; omit collectionTrackingStartedAt to preserve its value.
   While any old public
   reader remains, keep legacyPublicClients:true. After old backends and clients are
   stopped, explicitly save legacyPublicClients:false with the current settings;
   no source settings or tracking date should be reconstructed/overwritten.
5. No new Rules paths or indexes are needed with the checked-in Rules: only get on
   visitor_metrics_public/{id} and its pages/{id} is public; analytics/visitor_config
   and legacy lease remain client-denied and use Admin SDK. Verify deployed Rules
   match those existing exact grants; never expose config/lease. No Rules deployment
   was performed. W301's private800KiB document remains private.
6. Cleanup is optional and separate, after successful new snapshots and ALL old
   readers/backends stop. First create an external preview of exact legacy targets,
   update times and the currently referenced bundles/fragments; exclude every active
   reference. Review before an explicit one-shot update-time-guarded deletion.
   Fenced visitor_sync_lease and creator_sync/youtube may then be considered manually;
   no deletion is necessary. Existing snapshot-legacy.cjs still requires an old idle
   YouTube lease and therefore fails closed with the new fence; do not use it to
   remove fences. It was intentionally left unchanged. No cloud cleanup was run.


## Patch 1.1.2 — W305: hourly private details and visible dashboard reads

This additive section supersedes the earlier manual-only detail-refresh notes;
W298/W300/W301 and W303 publication/configuration/storage contracts remain.
The existing protected `POST /internal/analytics/visitor/sync-snapshot` now runs
public publication followed by the complete private W301 builder. No Scheduler,
Function, secret, deployment timeout, rules, index or tracking definition changed.
Its response has independent `public` and `private` outcomes and successful
`asOf` values; HTTP 500 on either failure/busy outcome allows the existing bounded
scheduler retry to revisit unfinished work. A successful area's commit is never
rolled back when the other area fails. Opening/reading the dashboard never runs
this endpoint or queries GoatCounter.

### Coordination and retained measurements

`analytics/visitor_config.syncLease` keeps the W303 public owner/expiry and legacy
fence. Its sibling `privateSync={owner,until}` coordinates BOTH the automatic
private run and the existing conscious admin POST. Each private acquisition
transaction reads config and the existing detail snapshot, then reserves 240s;
commit rereads config and atomically writes details plus releases only its owner.
Public/private transactions can contend on config and retry, while preserving
the other lease, settings, unrelated fields and collectionTrackingStartedAt.
No additional recurring control documents, generations or deletes are introduced.

Each successful snapshot stores `configSettingsHash` of parseConfig plus the
collection tracking timestamp; lease metadata never changes this hash. Hourly
skips require the relevant successful saved hour AND matching settings, separately
for each area. A public skip cannot skip private work. Older requested samples
cannot replace a newer saved asOf, including manual/automatic overlap. Owner,
unexpired lease, settings and reader deadline are checked again immediately
before commit. Cleanup checks its own owner; an expired/replaced attempt cannot
stamp an error over its successor or release another owner's lease.

Failures retain the previous payload and its actual asOf/updatedAtIso, adding
only size-checked `lastRefresh={state:error,attemptedAt,code:refresh_failed}` when
the attempt still owns a live lease with matching settings. A full document may
retain no new error marker if that marker would overflow; the HTTP result still
reports failure. Error markers do not count as hourly success. Public remains
512KiB and private remains the explicit W301 800KiB path. A settings change during
collection cancels publication rather than labeling old calculations as current.
Successful private publication and the combined run invalidate this process's
private read cache. Other processes keep their existing <=60s TTL; no immediate
global cache invalidation is claimed. GET snapshot still performs only reads.

### One bounded provider reader and W301 request planning

The entire automatic run uses ONE reader: max240 actual HTTP attempts including
pagination/retries, 180s total reader time, >=350ms request spacing, request timeout
min(10s,remaining time), 200 pages/query and 14000-character URLs. Commit checks
remaining reader time, too. At most two retries follow 429; Retry-After seconds
or HTTP-date are respected. Delays exceeding 10s or remaining time fail the area
instead of retrying early or extending the Function's unchanged 240s contract.
No request after a wait may start beyond the deadline. Failed/incomplete queries
never publish partial results. Query cache entries are per run, keyed by EXACT
start/end (and canonical size-ID set); failed entries are evicted. Equal today
queries are reused; seven-/thirty-day per-path sessions are never derived by
adding daily sessions or subtracting overlapping windows.

Let D<=30 be public daily queries and A=1 if the configured total starts earlier
than those days (otherwise 0). Public uses D+A hit queries. Private adds three
hit windows, minus exact matches already fetched: normally today is reused, so
D+A+2 unique hit queries (max33). HTTP pages per query depend on ALL returned
paths/events, not just the four Top25 lists. Additional identical total/window
matches are also cached. With unconfigured public data the private builder still
collects its three windows independently.

W301 size model is unchanged: for each 7/30-day window, G<=100 unique selected
normal-page groups; each group's original IDs in chunks<=100, plus all remaining
normal-page IDs in chunks<=100. Size request count is
sum(ceil(selected-group IDs/100))+ceil(remaining IDs/100), per window, times actual
size pagination pages. Every normal-page ID appears once per window. Events and
tool targets cause hit pagination but no sizes calls. The existing W301 139-page
full-ranking example needs202 size queries; with one hits page/window and33
unique hit windows that would be235 requests. Once >100 total paths/events need
two hit pages/window, this becomes268, so the shared240 cap intentionally stops
before a complete new private publication. W301's additional720 events/50 tools
can further increase hit pages. There is no claim that all W301 stress inputs
can finish a full hourly run inside the existing deployment limits.

Measured current-code cases (local provider adapter, not live history):
- Six returned rows / one ranked normal page, one public day: 3 unique hit
  windows +2 sizes =5 HTTP, one exact today cache hit.
- Same rows with30 public days +older total:33 hits +2 sizes =35 HTTP,
  one today cache hit; local CPU67.0ms with deliberate waits/provider latency
  replaced. Real spacing alone is at least34*350ms=11.9s, plus API/DB time.
- Four full Top25 /100 normal pages +5 event paths,30 days +older total:
  uncapped66 hit-page +200 sizes =266 HTTP. At240 attempts public is committed,
  private reports failure and preserves its original15:00 measurement. Local
  adapter CPU91.1ms; neither timing predicts hosted latency.
- Pagination/repeated-path/invalid native-class tests retain W301 guards; 429,
  long Retry-After,240 attempts,180s deadline and800KiB failure preservation tested.

Official contracts consulted: [GoatCounter API](https://www.goatcounter.com/api.json)
and [Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After).

### Dashboard scheduling and access counts

The existing authenticated identity/role gate still owns the hook. StrictMode
starts exactly one stored GET. Visible dashboards read at hour+5min (240s backend
plus60s other-process cache allowance), then at most once more two minutes later
if a source is old/missing/error or GET failed. No regular hidden-tab reads;
return/focus coalesces into one due-hour read. Pending requests block overlap.
Unmount/identity change/role loss cancels timer, request and listeners. Values,
five tabs, period/content selection, native expanded rows and open settings
survive a background GET; load/error status does not replace the page. Automatic
admin and Don requests are GET only; conscious admin Refresh remains POST+GET.

Local document operations, R/W/D, excluding SDK transaction retries:

| Path | Reads | Writes | Deletes | GoatCounter |
| --- | ---: | ---: | ---: | --- |
| Public inline lookup, cold / warm | 1 / 0 | 0 | 0 | 0 |
| Public overflow lookup | root + required leaf/fragments | 0 | 0 | 0 |
| Private GET cold/TTL expired / warm<=60s | 2 / 0 | 0 | 0 | 0 |
| Public hourly area, steady inline | 3 | 3 | 0 | D+A fully paginated queries |
| Private hourly/manual area, successful | 3 | 3 | 0 | 3 hit windows + sizes, less exact run-cache hits |
| Combined successful hour, steady inline | 6 | 6 | 0 | shared max240; example35 |
| Combined same successful hour/settings | 4 | 0 | 0 | 0 |
| Public current + private missing/error | 5 | 3 | 0 | private work only |
| Manual admin POST followed by stored GET | 5 | 3 | 0 | private work only |

Each successful area uses acquire+commit: two transactions. Combined success uses
four, same-hour skip two read-only transactions. Public first legacy-fence
migration adds1R/1W once. Public changed external leaves/fragments or active legacy
client bridge add their actual writes, preserving W303's rules. A busy area's
acquisition reads2 docs, writes0; a live owner's ordinary failure uses3R/3W
(acquire, error-marker+release), possibly fewer writes if metadata is too large,
settings changed, lease expired or ownership transferred. Firestore may retry
callbacks on config contention: additional reads/latency, committed writes only;
local adapters do not prove real distributed contention costs. Auth middleware
checks the existing signed session roles locally, without an extra users read.
GET parallel misses can each read the documents; no new cross-request cache
coalescing or cross-instance invalidation has been added. Private GET includes
both sources; one expired source can cost1R instead of2.

24 regular successful steady inline hours correspond to144R/144W/0D per day,
plus changed external/compatibility content and actual transaction retries. The
35-request example is840 provider requests/day; this is dataset-dependent, not
a quota or price promise. Failed-hour retries, manual admin runs, dashboard GETs
and public readers are additional. Each continuously visible private dashboard
normally adds24 GETs/day (at most48 with the bounded retry), up to48/96 document
reads if every GET misses both per-process caches. These are central scheduled
provider queries, never provider queries per dashboard visitor. No universal
free operation or unlimited scalability is claimed.

### Evidence and publication boundary

One prescribed-starter independent copy `run-YLNSLN`, one private Headless Chrome
and one local Vite server.75 distinct backend cases passed over the initial71,
only7 initially open cases repeated, then4 new budget/endpoint cases. Backend
noEmit0; frontend exactly the existing seven TS6133 diagnoses, compared with
saved initial sources. Regular Home -> Tools -> Admin submenu -> Statistics,
admin/don roles, simulated hour changes, hidden return, bounded old/error retries,
open native row/period/tab/settings, manual admin POST+GET, Don GET-only, pending
request abort and role-loss cleanup passed. Browser received a current-builder
saved in-memory snapshot with dynamic name and screen sizes; W283 public and
W301 private local historical fixtures also retained. Auth/Firestore/HTTP and
clock/visibility/timer boundaries were controlled, external renderer modules
stubbed. A released canceled fixture response produced one expected CDP Invalid
InterceptionId, classified separately from zero app runtime exceptions.
No personal browser data or live provider writes were used.

Taskdiff/file list/count tables and limitations: external `tmp/w305/report.txt`;
logs/browser proof under `test-runs/w305`; before bytes under `tmp/w305/before`.
No live private history, real Scheduler timing, OAuth roles, Firestore contention
or hosted persistence is proven by these adapters. No build/commit/push/deploy,
Cloud/rules/index/secret/role change or deletion was performed.

Manual steps for Danny: publish the COMPLETE current AuthAPI and frontend through
the existing workflow (including W298/W300/W301/W303 and concurrent changes),
drain older settings AND uncoordinated manual-refresh writers/old instances,
keep W303's legacy-client bridge rollout order, then observe the first existing
hourly job and both actual saved source dates with Don read access. No Scheduler
configuration change is required by this patch. Address the separate existing
frontend TS gate in the regular release process; do not mistake the old dist
bundle for this source change. Genuine private history/hosted capacity remain
release checks, not a local claim or a substitute for personal acceptance.


## Patch 1.1.2 — W306: bounded retry proof for the W305 large stream (2026-11-14)

This additive section qualifies W305's automatic-completion/deployment notes.
The existing backend is sufficient for the original **266-request W305 case**:
keep the publisher, reader and locks unchanged. No persistent continuation,
progress document, new Scheduler/Function, limit increase or partial publication
was introduced. The largest W301 synthetic stress stream has a separate capacity
limit described below; it is not covered by this completion claim.

### Status-driven completion and measurements

The unchanged protected POST `/internal/analytics/visitor/sync-snapshot` returns
500 after successful public publication and an incomplete private build. A
bounded HTTP Scheduler retry starts a NEW reader. The public same-hour/config
check skips its saved result; private work is rebuilt in full. No admin click,
background work after HTTP completion or cross-run query cache is involved.

Original 105 rows (100 normal paths, five events), identical to the saved W305
fixture; 30 public days plus an older total; four full top-25 lists in each
private seven-/thirty-day window. Adapter measurements through the real handler:

| Call | HTTP result | GoatCounter hits / sizes | Actual requests | Cache hits | Firestore R / W / D | Transactions | Simulated reader time | Local CPU/HTTP adapter time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Initial hourly call | 500; public saved, old private retained | 66 / 174 | 240 | 1 | 6 / 6 / 0 | 4 | 83.650 s | 138.7 ms |
| One automatic retry, 60 s after failure | 200; public skipped, private saved | 6 / 200 | 206 | 0 | 5 / 3 / 0 | 3 | 71.750 s | 71.9 ms |
| Duplicate successful delivery | 200; both skipped | 0 / 0 | 0 | 0 | 4 / 0 / 0 | 2 | 0 | 7.7 ms |
| Don GET after publication | 200; stored results only | 0 / 0 | 0 | — | 2 / 0 / 0 | 0 | — | not separately timed |

Completion alone totals **446 requests, 11 reads, 9 writes, zero deletes**, one
cache hit and seven transactions. Including duplicate delivery and one cold Don
GET: 446 requests, 17 reads, nine writes, zero deletes. No progress data accesses.
The repeat performs no publication. Counts use the established fenced inline
public configuration (`legacyPublicClients:false`), no transaction contention;
legacy migration, compatibility bundles/fragments and Firestore transaction
retries retain W303's additional costs. Warm GET can use the existing 60 s cache.

This distributes work; it does not reduce total provider traffic. Compared with
the hypothetical unbounded shared 266-request pass, 180 requests are repeated:
174 size requests and six hit pages. The retry needs **206**, not 266 minus 66:
its empty cache must also query today's two pages again. Successful public work
is not repeated. Failed private intermediate work is deliberately discarded.
24 identical large two-call hourly updates would use 10,704 provider requests,
264 Firestore reads and 216 writes before dashboard/delivery/other overheads.
This is a measured fixture model, not a live bill or a scalability promise.

The private final document is 61,999 estimated Firestore bytes; all four lists
have 25 entries in both windows, complete size distributions and the dynamic
`Dynamic Hourly Tool` title survive the protected Don GET. Every private range
ends at that retry's own asOf; no first-run partial results are merged. Public
keeps its own explicitly separate earlier asOf. Last successful values/date
survive request, time, provider, configuration and owner failures. A newer
manual refresh cannot be overwritten or have its successor's lease released.
The existing 240 requests / 180 s reader, 240 s Function/lease, pagination,
512 KiB public and 800 KiB private bounds remain unchanged.

### Capacity of the largest existing W301 fixture

The **unchanged** W301 stress input has 914 rows: 139 normal paths plus 775
events/tool rows, including 720 usage rows and 50 named stress tools. Ten hit
pages per window require **310 public requests** for the configured 31 public
queries. Two status-driven hourly calls each stop at 240 hit requests, zero
sizes, 83.650 s simulated reader time; each costs 6 R / 6 W / 0 D. Across both:
480 provider attempts, 12 R / 12 W / 0 D, no complete publication. Existing
retry does **not** complete this full stress stream. More identical retries
cannot solve that public-first limit. It is a capacity boundary, not a verified
large-stream completion or a reason to increase limits globally.

A separate explicitly substituted already-complete public seed isolates private
capacity: the real endpoint then needs 30 hits + 202 sizes = **232 requests**,
zero cache hits, 5 R / 3 W / 0 D, 80.850 s simulated time / 88.4 ms adapter CPU.
Its private snapshot is 634,733 bytes, with 721 usage events, 51 tool targets,
all rankings and sizes intact. This seeded diagnostic is not an automatic full
W301 solution. The seed uses the local complete builder without HTTP; no claimed
provider cost or automatic completion is attributed to that substitution.

For this configuration, uniform public pagination must satisfy 31*P <= 240
(at most seven pages/query, before retries). A cold private-only run requires
3*P + S <= 240 and must also finish within 180 s. The W301 private stream has
only eight request attempts of margin. At a controlled 800 ms response time,
each private-only attempt reaches 180 s after 225 requests (30 hits / 195 sizes),
retains the old complete private sample and costs 5 R / 3 W / 0 D; one retry
repeats that failure (450 requests, 10 R / 6 W / 0 D total). Request spacing
measures from request start, so response time can overlap the 350 ms gap.
Real API/Firestore latency, 429 retries, sizes pagination, URL/document/atomic
limits and changing input can reduce capacity further.

### Dashboard and deployment prerequisite

The Datenbasis tab tells both Admin and Don that data are saved hourly and
processing/retry can take several minutes after the hour. It makes no five-minute
completion guarantee. Actual saved dates remain visible. The first visible-hour
GET stays at +5 min; the single stale/error follow-up now waits five more minutes
(about +10 min for an on-time first GET). There is no tighter polling or automatic
POST. Tabs, period, expanded content, settings and values during GET are retained.
Initial load still performs one stored GET; this change does not create an
additional initial-load retry policy. Hidden/focus/identity cleanup stays W305's.

For two bounded Function calls, a 60 s backoff and another process's 60 s read
cache, the nominal allowance is 240+60+240+60 = 600 s. Scheduling/delivery can be
later; +10 min is a read opportunity, not a guaranteed freshness deadline. Within
the provider-only model, completion occurs at 215.4 s including the 60 s backoff;
local CPU, DB and real delivery/network latency are not included in that clock.

An active Cloud retry is a **deployment prerequisite**. Repository prose alone
is not evidence that it is configured. The read-only describe attempt for
`sfdatahub-staging/europe-west1/visitor-analytics-sync` failed because existing
credentials require interactive reauthentication. No credentials, Cloud job or
other Cloud state were changed. Local tests use a finite, status-driven Scheduler
adapter with one retry after 60 s, the real protected endpoint and empty readers;
they do not prove actual Cloud delivery or execution. The default zero retry
count/zero retry duration does not retry failed attempts. See the primary
[Cloud Scheduler retry documentation](https://docs.cloud.google.com/scheduler/docs/configuring/retry-jobs)
and [Job API contract](https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs).

Manual steps for Danny, after publishing the common W305/W306 backend/frontend
state through the established release path (no deployment performed here):

1. Reauthenticate with the established account if required; inspect ONLY the
   existing job's metadata, preserving its hourly schedule, target and auth:
   `gcloud scheduler jobs describe visitor-analytics-sync --project=sfdatahub-staging --location=europe-west1 --format="yaml(name,schedule,timeZone,state,attemptDeadline,retryConfig,httpTarget.httpMethod)"`.
2. Verify a finite retry can run within the same hour, with an HTTP deadline that
   permits the unchanged 240 s Function contract. If absent/insufficient, the
   concrete existing-job-only example is:
   `gcloud scheduler jobs update http visitor-analytics-sync --project=sfdatahub-staging --location=europe-west1 --retry-count=1 --max-retry-duration=0s --min-backoff=60s --max-backoff=60s --max-doublings=0 --attempt-deadline=240s`.
   Do not alter an already suitable configuration merely to match this example;
   if location/project differ, use their verified existing values. No second job.
3. Observe the first actual scheduled 500 -> automatic retry -> 200 as needed,
   public skip and private completion, real request/time limits, both stored
   source dates, and Don's GET-only display. This remains a live verification
   boundary, separate from the completed local implementation/proof. W303's
   draining/compatibility deployment order still applies.

### Bounded verification and scope

Six distinct new backend cases passed; only failed/open tests were repeated
(missing publishMetrics test import, then the controlled time-latency assumption
corrected from 500 to 800 ms). None of the previous 75 cases were rerun. One
independent starter copy `run-DtrPhJ`, one private Headless Chrome/Vite server,
regular Home -> Tools -> Admin submenu -> Statistics entry. New Admin and Don
warm GET groups passed, including the final saved protected-endpoint fixture,
retained interaction state, correct +5/+10 min cadence and zero automatic POSTs.
The first open browser assertion incorrectly inspected the overview for a hint
in Datenbasis; only that open group was corrected in the same browser. No runtime
exceptions. Both owned browser/server were closed.

Backend noEmit passes. Frontend before/after has the same seven TS6133 diagnostics
in compareGuilds/GuildHub Dashboard/Index, no new diagnosis; no build was run.
Task changes are only hourly.test.ts, useVisitorSnapshot.ts, VisitorAnalytics.tsx
and this additive README. Backend publishers, reader, size logic, routes, read
cache, metrics model, CSS, roles, Rules, indexes, YouTube and counting code are
byte-identical to the targeted initial backup. Original fixture arrays were
compared with the unchanged historical W301/W305 copies, not replaced by current
code. Browser auth/cloud/API transport, clock/visibility and optional renderers
are replaced; old browser source dates are a controlled state fixture, final
private payload comes from the actual local endpoint -> stored -> Don GET chain.
No live private history, personal browser data, OAuth roles, hosted latency or
Cloud billing is verified. No commit, push, build, deployment, Cloud mutation,
Rules/index change or deletion. Detailed additive workbook/report: external
`codex/sfdatahub.github.io/tmp/w306`; logs/results in `test-runs/w306`.


## Patch 1.1.2 — W307: durable GoatCounter continuation (2026-11-14)

This additive entry supersedes W306's capacity conclusion and one-retry advice.
The protected hourly endpoint now executes `resumeVisitorAnalytics`, rather than
restarting unfinished builders with an empty reader. W305 and the largest W301
fixture both finish, including W301 with controlled 800 ms responses. Existing
counting, rankings, public bundle/legacy bridge, roles and document limits stay.

### Stored state and publication

`analytics/visitor_work` is one private reusable evaluation: random evaluation ID,
relevant settings/provider fingerprint (no secret), parsed configuration, immutable
`asOf`, public/private/complete phase, owner/expiry, checkpoint, page/query counts,
active query/page cursor and at most eight slot digests. Config has only a small
`visitorWork` coordination marker, excluded from `settingsHash`.

`analytics/visitor_work/bundles/w_0` through `w_7` hold bounded maps of parameter
hashes to losslessly deflated/base64 query states. Each state includes full rows,
original seen path/size IDs, page offset and completion flag. Hits keys include
exact start/end; sizes also include the canonical ID set. No mixing of windows.
A resumed partial query reconstructs exclude_paths/offset from saved rows and
requests the next page. Completed queries return saved results. Builders replay
local aggregation only; they do not re-fetch completed ranges. Cache lifetime is
one evaluation; a new completed-hour evaluation samples the provider afresh.

Every eight successful pages, at planned handoff, before publication, and after a
provider failure, changed slots plus their referencing root commit atomically.
The existing full-wrapper `documentBytes`/`assertAtomicSize` checks include all
administrative fields; each work/config/public document remains <=512 KiB.
There are at most eight stable slots, each <=512 KiB; decoded query state is
also limited to 8 MiB. There is no collection scan, document per metric, hourly
history, delete job or unbounded config array. A single oversized query or full
slot set fails closed; this is bounded capacity, not unlimited scalability.
The private finished snapshot remains ONE document with its existing 800 KiB
exception. Common storage helpers/default limits are unchanged.

Owner, lease expiry and relevant config fingerprint are checked transactionally
at every checkpoint and both final publications. Public/private existing leases
remain in force. An incompatible evaluation resets its formerly referenced
stable slots atomically with the replacement root; finished work clears its
referenced slots atomically with completion/release. Old owners cannot restore
retired data or release a successor's lock. A new hour resumes pending work with
its original cutoff; it never queues or resets hourly evaluations. Coordination
changes alone do not invalidate work. Pending compatible hourly work blocks a
manual private refresh, and an active manual writer blocks hourly acquisition.
Don gains no write, configuration or continuation authority.

A complete public area may publish before private work finishes. Partial areas
never publish metrics. Planned pauses release their area lease without an error
marker; actual provider/storage errors remain errors and retain prior complete
metrics/dates. A failed atomic checkpoint leaves the previous root/data pair.
A process death can repeat at most eight successful pages not yet checkpointed;
aggregation rebuilds from saved query state, so replay cannot double-count.
GET/public readers never load work slots and never query GoatCounter.

### Bounds, retries and dashboard

Reader hard bounds remain 240 HTTP attempts/180 s; Function/lease remain 240 s.
The resumable reader hands off at 232 attempts, or before another request plus
its 10 s timeout and 20 s checkpoint/release reserve fits the remaining reader/
Function time. Pacing, Retry-After, max three 429 attempts, 14,000-character URL
and 200-page guards remain. Controlled response/model time excludes real DB/
network/Scheduler latency; reserves are not live latency guarantees.

A planned handoff/busy delivery returns HTTP503 (`continuation_pending` for the
planned handoff), complete work returns 200, genuine errors return 500. There is
no after-response work or self-call chain. The finite local Scheduler adapter
retries non-2xx responses after 60 s, up to THREE retries (four attempts).
The large cases require two retries; the extra retry reserves one failed stage.
Cloud retry configuration is NOT verified or modified by this task. Non-2xx
alone does not prove an active Cloud retry. After retry exhaustion, the next
regular hour still resumes the same checkpoint. A killed owner may require lease
expiry/another regular tick; immediate automatic recovery is not guaranteed.

The visible dashboard keeps its first GET at +5 minutes and at most one further
GET after 15 more minutes (+20). Planning envelope: 4*240 s + 3*60 s backoff +
60 s other-process read cache = 20 minutes. This is a bounded read opportunity,
not a freshness promise under delayed delivery. No automatic POST/polling loop,
layout change or loss of tab/period/expanded/settings state. Actual complete
measurement dates remain visible throughout.

### Measured complete chains

One independent starter copy `run-JMZPOL`; all three cases start at the real
protected hourly endpoint with NO prefilled complete public snapshot. Existing
legacy fence and inline schema5, legacyPublicClients:false. Provider responses,
clock, Firestore and Scheduler are controlled local adapters. Each final state
passes the actual protected signed-session Don GET, followed by warm dashboard
GET replacement in one private headless Chrome using regular app bootstrap:
Home -> Tools -> Admin submenu -> Statistics. External auth/cloud/API/optional
renderer boundaries are replaced; browser GET transport serves the actual saved
Don GET output. Browser and server closed; no personal browser data used.

Original full arrays compare equal to unchanged historical W305 `run-YLNSLN`
and W301 `run-iINk56` sources (hashes in external input-provenance.json):
105 rows/100 normal paths for W305; 914 rows/139 normal paths, 720 additional
usage rows and 50 named tools for W301. Rankings keep all four top25s per window,
sizes cover all 139 normal paths (100 selected groups), 721 usage events and
51 tool targets remain. All exact window ends and both final dates share the
original evaluation cutoff. Public requires 310 W301 hits pages; total requires
330 hits pages +202 sizes =532, rather than repeating public work indefinitely.

R/W/D includes all work/config/public/private access. No contention/extra public
external leaves in these fixtures. Local milliseconds are measured separately
from the controlled provider/pacing clock and are not hosted execution times.

| Case/stage | HTTP hits/sizes | Saved query reuses | Reused pages | Firestore R/W/D | Transactions | Model seconds | Local ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| W305/1 (503) | 66/166 | 0 | 0 | 39/69/0 | 36 | 80.850 | 127.30 |
| W305/2 (200) | 0/34 | 169 | 172 | 12/18/0 | 9 | 11.550 | 37.23 |
| W301/1 (503) | 232/0 | 0 | 0 | 35/64/0 | 33 | 80.850 | 277.04 |
| W301/2 (503) | 98/134 | 23 | 232 | 40/69/0 | 36 | 80.850 | 269.20 |
| W301/3 (200) | 0/68 | 137 | 164 | 16/26/0 | 13 | 23.450 | 89.19 |
| W301 800ms/1 (503) | 188/0 | 0 | 0 | 29/53/0 | 27 | 150.400 | 227.41 |
| W301 800ms/2 (503) | 142/46 | 18 | 188 | 35/59/0 | 31 | 150.400 | 247.24 |
| W301 800ms/3 (200) | 0/156 | 49 | 76 | 27/48/0 | 24 | 124.800 | 135.63 |

Totals: W305 **266 HTTP**, 51R/87W/0D, 45 transactions, 169 saved complete
query reuses, 164.53 ms local execution, 152.400 s model including one 60 s
backoff. W301 **532 HTTP**, 91R/159W/0D, 82 transactions, 160 saved complete
query reuses, 635.44 ms local, 305.150 s including two 60 s backoffs. Slow W301
**532 HTTP**, 91R/160W/0D, 82 transactions, 67 saved complete query reuses,
610.28 ms local, 545.600 s including backoffs. ZERO repeated successful source
requests in all three regular chains. Reuse totals distinguish saved queries
from the one same-process shared today query, and pages from full queries.
W305 saves 180 provider requests versus W306's446; work persistence costs MORE
Firestore writes (87 versus9). This is not a claim of overall monetary savings.

Each completed duplicate reads config+work root:2R/0W/0D,0 provider,1 transaction.
Each cold Don GET:2R/0W/0D,0 provider,0 work reads. Including both: W30555R/87W,
W30195R/159W, slow W30195R/160W. Existing legacy migration, external public
bundles/bridge and transaction retries add actual access when present. New
hour/config evaluations additionally reset the previous referenced stable slots
(one extra write per old slot); first-ever fixture evaluations have none.

Work sizes after stages (root/slot bytes, all wrappers included): W305841/69,693
then723/179; W301840/190,439 then841/298,869 then723/179; slow W301840/154,241
then841/280,029 then723/179. Final private61,999 and634,733 bytes respectively
(timestamp sized as8 bytes); public917/913 bytes. These are recorded end-stage
sizes, not a claim that intermediate writes have exactly those sizes; every
intermediate write is separately size-checked before commit.

36 distinct hourly/continuation cases plus18 selected affected existing cases
pass. The initial33 passed; two new storage cases followed, with one expectation
corrected only for the existing additive public error marker (no complete metrics
published). Only that failed case was repeated. After adding explicit atomic
retirement of incompatible slots, only its two affected config cases and backend
types were repeated. Extra proofs: provider503 after saved private work, serialized
Firestore + empty module-cache restart, three actual fresh Node processes
(PIDs30616/5288/24012) resuming W301/800ms from serialized Firestore with
188/188/156 requests and a final protected Don GET, checkpoint interruption between staged
slot/root writes (exactly8 unsaved successful requests replayed, no doubled
aggregation), size offset pagination (666 unique requests across3 calls), duplicate
delivery, active/paused manual coordination, takeover, new-hour continuation,
config invalidation/late owner, missing bundle and oversized compressed query.
Backend noEmit:0. Frontend before/after: same7 known TS6133, no new diagnosis.
No delivery build, commit, push, deployment, Cloud/Rules/index/secret/role change
or deletion. Existing original evidence and all prior workbook bytes retained.

### Manual steps for Danny — only after this checked local state

1. Publish the COMPLETE common current AuthAPI and frontend through the established
   release path; resolve the seven existing frontend release diagnostics in their
   own scope. Retain W303 old-writer drain and compatibility rollout order.
2. Inspect the existing job without displaying headers/secrets (confirm actual
   project/region/job first):
   `gcloud scheduler jobs describe visitor-analytics-sync --project=sfdatahub-staging --location=europe-west1 --format="yaml(name,schedule,timeZone,state,attemptDeadline,retryConfig,httpTarget.httpMethod)"`.
3. If needed, configure that same job to match the locally tested finite policy:
   `gcloud scheduler jobs update http visitor-analytics-sync --project=sfdatahub-staging --location=europe-west1 --max-retry-attempts=3 --max-retry-duration=0s --min-backoff=60s --max-backoff=60s --max-doublings=0 --attempt-deadline=240s`.
   Explicit zero duration plus retryCount3 gives a count-bounded policy; positive
   duration can extend beyond the retry count. Do not add a job or alter auth,
   schedule, endpoint, Function limits or Rules. W306's CLI `--retry-count` example
   is superseded here by the documented `--max-retry-attempts` flag.
4. Verify the first REAL complete protected hours/retries: 503 -> resumed saved
   work ->200, both measured dates, actual access/latency, correct configured
   retries and Don's read. HTTP503/500 alone is not proof of Cloud delivery.

Primary references checked for the manual policy:
[Scheduler retry semantics](https://docs.cloud.google.com/scheduler/docs/configuring/retry-jobs),
[CLI flags](https://docs.cloud.google.com/sdk/gcloud/reference/scheduler/jobs/update/http).
Cloud configuration, live persistent/provider consistency, real OAuth roles,
Scheduler delivery/latency, hosted runtime/costs and personal acceptance remain
separate live limits. Full local evidence: external `tmp/w307/report.txt`,
`input-provenance.json`, `task-changes.patch`, `code-proof.json`, `type-proof.json`;
measurements/browser logs under `test-runs/w307`. W305/W306 history is unchanged.


## Patch 1.1.2 — W308: batch continuation at necessary transitions (2026-11-14)

This additive fix replaces W307's frequent checkpoints and private eight-slot
allocator. The complete original W305/W301 inputs and all counting/reader/role
contracts remain. W301's three-call evaluation now uses **20 reads/20 writes**
instead of91/159; its800ms variant also20/20 instead of91/160. These counts include
ALL configuration, leases, work, publication and release accesses. They meet the
requested <=30 reads/30 writes envelope. Provider requests stay266/532, with no
repeated saved success during regular handoffs. This does not claim monetary
savings for unrelated traffic or real Cloud pricing.

### Necessary persistence only

`journal.put` updates the process-local compressed query map and counters only.
There is no fixed request-count, query-completion or time-based storage loop.
A dedicated gate at the50th provider request observed only the initial4reads/
3writes and0persisted pages. Request and time guards remain unchanged:240 attempts/
180s per reader,240s Function/lease, soft pause232, full timeout/checkpoint reserve.

The necessary persistence causes are now:

- New evaluation: initialize its fixed ID/config/cutoff and acquire coordination.
  Resuming an existing evaluation writes only the config ownership marker;
  it does not rewrite its unchanged full work root.
- Complete public publication: write the public snapshot, accumulated work with
  phase private, and area-lease release in the SAME transaction.
- Controlled pause or catchable error: after the existing area cleanup, save
  accumulated useful progress and release outer coordination in ONE transaction.
  An unchanged saved root produces no root/bundle write, only necessary lease
  changes. A failed load never replaces a partially loaded root/data pair.
- Complete private publication: write the private snapshot, completed work root
  and both private/outer releases in the SAME transaction. The finished root
  drops its inline results/references, retaining layout hints. It does not
  rewrite empty external documents. Skipped already-current area transitions
  coalesce with the next necessary save. Completed duplicates write nothing.

Publication hooks return prepared writes plus a config patch; publishers check
owner/config/expiry inside their existing transaction and check the combined
work+snapshot+config atomic size. The local committed-root pointer advances only
AFTER commit, including when Firestore reruns a transaction callback. Prepared
inline results are copied so next-stage memory updates cannot mutate that saved
baseline. No separate writes immediately before/after normal publications.

### Shared inline/bundle storage

`analytics/visitor_work` version2 stores small query maps inline together with
metadata, cursor, complete entries digest and layout information. The full root
must fit512KiB. Overflow uses the EXISTING `packBundles`, `bundleId`, `digest`,
`documentBytes` and `assertAtomicSize`: private addressed `bundles/b_<prefix>`
leaves, previous split layout and previous leaf hashes, writes only changed
leaves. No new common helper or global storage conversion was needed. Shared
bundles.ts/fragments.ts are byte-identical to the start. There is no new slot
allocator, per-query document, hourly document history or delete/reset job.

W307's individual encoded-query capacity remains bounded by512KiB, including its
wrapper. The required inputs fit each query comfortably. The decoded8MiB guard
also remains. No new fragment lifecycle is needed for these inputs: dynamically
hashed time-window fragment IDs would otherwise accumulate history. A single
oversized encoded query fails closed with the existing shared bundle size guard;
there is no truncation or fabricated complete snapshot. Atomic8MiB/450 and public/
config/work512KiB limits remain; finished private analytics still ONE800KiB doc.

The initial implementation briefly exercised generic fragments locally; final
scope uses only the required shared bundles. Only the affected overflow/size
cases were repeated, plus a real endpoint overflow and the saved-inline alias
regression. An obsolete empty fragments metadata field was removed (10bytes).
No deployed version2 data existed as an assumption for the migration proof;
the supported predecessor is actual version1 W307 data, described below.

### Compatibility, crash and access protection

W307 version1 roots/slots are read and hash-validated as an explicit predecessor
format. An unchanged actual W307/800ms checkpoint (188successful requests) resumes
its original evaluation ID/cutoff; the following188+156 requests complete. Its
legacy slot is neither rewritten, cleared nor deleted. The next necessary save
converts the logical work root to version2 inline/shared bundles. No assumption
of an empty database or preparatory reset. The remaining migration stages cost
15R/14W, including the single legacy-slot read, separate from already-spent W307
work. Completed predecessor work also remains usable by the same-hour skip.

A hard process death/failed checkpoint may now repeat the UNSAVED CURRENT STAGE,
up to its last committed transition, rather than at most eight responses. This
is the accepted write/recovery trade-off. The interruption test stages a complete
private publication, fails its progress commit and the catch save, then resumes
from232 saved pages. It repeats34unsaved source successes, finishes with exactly
100page visits and no double aggregation. Its three calls cost21R/19W and300
successful provider requests, including the34repeats. Genuine provider503 after
nine new successes checkpoints those successes; all266successful requests remain
unique (one additional failed request); total20R/21W. Owner replacement, expiry,
configuration changes, duplicate delivery, manual/hourly coordination and fixed
measurement cutoffs remain fenced. GET and Don remain read-only, without work
loads or provider calls. Normal dashboard GETs never migrate continuation state.

### Actual comparison and access chain

W307 baseline comes from its preserved measurements; the starting backend hashes
match that verified W307 code. Complete input arrays are equal, with historical
W305/W301 provenance retained. No contention, legacy migration or extra public
leaves in this normal comparison. R/W/D includes every backend operation.

| Fixture | Calls / provider | W307 R/W/D | W308 R/W/D | Saved success repeats |
| --- | --- | --- | --- | --- |
| W305 | 2 /266 | 51/87/0 | 14/15/0 | 0 |
| W301 | 3 /532 | 91/159/0 | 20/20/0 | 0 |
| W301800ms | 3 /532 | 91/160/0 | 20/20/0 | 0 |

| Stage | Provider hits/sizes | All R/W/D | Transactions | Model seconds | Local ms |
| --- | --- | --- | --- | --- | --- |
| W305/1 | 66/166 | 9/10/0 | 6 | 80.850 | 139.77 |
| W305/2 | 0/34 | 5/5/0 | 3 | 11.550 | 33.33 |
| W301/1 | 232/0 | 6/6/0 | 4 | 80.850 | 319.49 |
| W301/2 | 98/134 | 9/9/0 | 6 | 80.850 | 255.53 |
| W301/3 | 0/68 | 5/5/0 | 3 | 23.450 | 81.49 |
| Slow/1 | 188/0 | 6/6/0 | 4 | 150.400 | 271.12 |
| Slow/2 | 142/46 | 9/9/0 | 6 | 150.400 | 265.36 |
| Slow/3 | 0/156 | 5/5/0 | 3 | 124.800 | 89.82 |

W301 stage1: acquisition2R/2W; public acquisition2R/1W; area pause release1R/1W;
progress+outer release1R/2W =6R/6W. Stage2: resumed acquisition2R/1W; public
acquisition2R/1W; combined public/phase commit1R/3W; private acquisition2R/1W;
area pause release1R/1W; progress+outer release1R/2W =9R/9W. Stage3: resumed
acquisition2R/1W; private acquisition2R/1W; combined final commit1R/3W =5R/5W.
The existing area cleanup is separate from outer handoff; no access is omitted.

Including60s backoff(s): W305152.400s model/173.10ms local execution;
W301305.150s/656.51ms; slow545.600s/626.30ms. Pacing/response model and measured
local execution are separate; neither is real hosted DB/network/Scheduler time.

Additional separately measured cases:

- Small first evaluation:5provider,8R/10W/0D,5transactions, one work doc. Next hour
  with unchanged metric values: also5provider,8R/10W. A same-hour duplicate reads
  config+work root2R/0W/0D, no provider. The complete-hour reuse contract is unchanged.
  W307 small durable-endpoint costs were not separately remeasured for this fix.
- One controlled public-commit transaction retry:9R/10W instead of8R/10W; unchanged
  five provider requests and writes. Real contention can cause more retries.
- Each cold private GET:2R/0W/0D, warm private GET:0; no work/provider. Small public
  saved-root read:1R/0W/0D. Thus normal W301 plus one duplicate and cold Don GET is
 24R/20W/0D; W30518R/15W. Public readers/manual refresh are additional traffic.
- Synthetic actual-endpoint overflow: original small stream plus four opaque
 6KB random event paths,35provider,8R/13W/0D,5transactions. Three real shared-leaf
  writes (326929/457625/228906bytes), each written once. No empty rewrite at final
  completion; root725bytes. Ordinary first-ever counterpart is8R/10W, so these
  leaves add exactly3writes. Finished private values remain complete.
- Synthetic layout/hash proof uses three larger leaves plus root. Unchanged
  preparation returns0writes; changing one entry returns one leaf+root. An actual
  provider error using that saved layout reads9/writes5, including all three
  leaves; it writes0leaves and0work roots because progress is unchanged. This
  preloaded synthetic layout is a boundary fixture, not a mandatory-case seed.
- Initial legacy-fence migration and real extra public bundles add their existing
  operations. Existing public overflow regression: first4R/6W, unchanged3R/3W,
  changed3R/4W; shared public read paths/legacy bridge are unchanged. No fake
  contention or public overflow is hidden inside the <=30normal target.

### Data, sizes and verification limits

The largest original input remains914rows/139normal paths,720extra usage rows,
50named tools. All four top25s/window,100selected size groups/all139normal paths,
721usage events/51tool targets remain complete. W305 retains its266unique-source
plan. Both area timestamps and every window retain the original evaluation cutoff.
No artificially prefilled complete public snapshot in the three required chains.

Main measured end-stage work roots (including the then-unused empty fragments
field) were70359→727bytes,191104→299535→727,154906→280695→727. Final serialized
shape is10bytes smaller:70349→717,191094→299525→717,154896→280685→717. The latter
are calculated from the same persisted states using unchanged documentBytes,
not an additional full campaign; final-storage-sizes.json labels that distinction.
Final overflow checks use the actual final source. Finished private61999/634733
bytes and public917/913bytes unchanged; private timestamp sized as8bytes.

One starter copy run-iUOLuh, one private headless Chrome/server, regular bootstrap
Home→Tools→Admin submenu→Statistics. Actual current protected endpoint/reader/
builders→in-memory Firestore→signed-session protected Don GET output→warm dashboard
GET response fixture for all three cases. Original W305/W301 arrays compare equal
to untouched historical sources. Eight fresh Node processes additionally serialize
Firestore between all stages:2/3/3processes for W305/W301/slow; no reader/memo state
survives. All complete with zero repeated saved success and final Don GET.
Tabs, period, expanded content, settings and visible values stay; Don sees tool
names/sizes without settings or POST. Existing+5/+20minute GET policy unchanged.
Browser/server closed, zero runtime errors; frontend/model/CSS byte-identical.

39initial targeted hourly cases passed (fresh-process case deferred);17selected
existing cases passed; the fresh-process case passed across all eight processes;
one new actual overflow case also passed.58distinct backend cases overall. Only
the affected overflow/size/immutable-inline tests were repeated after narrowing
to the necessary bundle capacity. Backend noEmit0; frontend before/after exactly
seven known TS6133, no new diagnosis/build. Final source/copy equality and task
diff are recorded. The final narrow changes after the main chains do not change
requests/accesses: removal of unused fragment support/empty metadata and immutable
copying of prepared inline data; their storage cases were checked separately.

Provider, Firestore, Scheduler, browser auth/API transport, clock/visibility and
optional renderers are local adapters. Browser transports actual saved Don GET
responses, not a through-going hosted Cloud HTTP chain. No personal browser data,
live private history, actual Cloud roles/configuration, Firestore contention,
provider consistency, hosted latency/billing or personal acceptance is proven.
No commit/push/delivery build/deployment/Cloud/Rules/index/secret/role change/delete.

### Manual steps for Danny — not executed

If W307 has already shipped, prevent mixed old/new continuation writers: pause
delivery of the SAME existing job for the release window, let in-flight hourly/
manual refreshes and leases drain, then publish the COMPLETE current AuthAPI.
Ensure traffic/instances use the new version before resuming deliveries. A W307
writer does not understand version2 and must not restart its paused work. Do not
clear/migrate/delete Firestore state beforehand: the new backend reads version1
and converts it on the next necessary transition. Keep W303 writer-drain/bridge
requirements. This fix has no frontend changes or new frontend publishing need.

Retain/verify W307's bounded existing-job policy (three retries, constant60s backoff,
240s deadline; no positive-duration extension). No second job or self-call chain.
Actual configuration remains unverified; non-2xx alone is no proof of active Cloud
retries. Check the first real complete public/private finish, saved dates, Don GET
and actual access/latency after resuming. Live checks remain distinct from the
completed local proof. Full report/provenance/diff/cost/restart/type/source evidence:
external tmp/w308; measurements/browser evidence: test-runs/w308.
