# Creator Hub catalog

`GET /public/creator-hub.json` reads a separate public catalog at
`creator_hub/catalog`. It does not use or update the homepage sources,
YouTube snapshots, Twitch updater, scheduler or analytics. No new secrets,
Firestore indexes, client rules, listeners or scheduled jobs are required.
The Admin SDK reads the catalog through the existing backend identity; direct
browser Firestore access is unnecessary.

The root is `{ schemaVersion: 1, creators: [...] }`. Each creator has a stable
internal `id`, `name`, `languages`, optional public HTTPS `avatarUrl`, and
`channels`. YouTube accounts carry `channelId`, optional `handle`, `name`, and
the canonical channel-ID URL. Twitch accounts carry `login`, optional confirmed
numeric `userId`, `name`, and the canonical login URL. Unknown languages use an
empty array, unknown Twitch IDs are omitted. A platform account belongs to one
creator; a creator can own several accounts on either platform. Do not derive
internal IDs from display names or change them when names change.

Only these fields reach the public response. Subscriber counts, source settings,
credentials, internal evidence and administrative status fields are excluded.
There is no public verification, activity or homepage-inclusion status. Image
bytes remain in the existing browser image cache, never in the catalog.

`catalogDocuments(input)` validates and prepares documents without cloud writes.
The initial catalog needs one document. Above the existing 512 KiB safety bound,
the existing bundle/fragment helpers split records automatically and losslessly;
the root references hash-checked `creator_hub/catalog/parts/*` documents. There
is no row-count truncation. Publish parts before the root; readers reject mixed
or incomplete content and keep their last successful catalog on failure.

The backend coalesces simultaneous reads and caches the successful result for
60 seconds per warm instance. Cache hits do not extend that expiry. A failed
refresh retains the previous result with `stale: true` and a 15-second cooldown;
a missing first catalog returns HTTP 503 with a generic error. Responses use
`Cache-Control: no-store`; the frontend owns the explicit persistent read cache.

The browser reuses the existing public IndexedDB cache and cross-tab read lock,
with a five-minute success TTL and a one-minute stale retry. The mounted view
refreshes at that fixed expiry. Unmounting stops its timer. Focus, search,
filters, locale and detail selection do not trigger catalog reads or move the
expiry. A first load/browser cache miss still makes an HTTP request. A cold or
expired backend instance reads one Firestore document for the initial catalog;
a split catalog reads the manifest and its referenced parts. There is no
global zero-read guarantee across backend instances or visitors.

Manual rollout order:

1. Prepare/inspect the external confirmed catalog and create its documents once
   using the existing project/ADC. Never substitute the old creator sheet or
   ship a second hardcoded frontend list. W299 includes the complete initial
   artifact and a create-only import script with exact commands in its report.
2. If dependencies have not been installed locally, run `npm ci` in `auth-api`
   once. Run `npm run build` there. No package changes are needed for this feature.
   The local W299 backend build and targeted tests were run in an independent
   external copy, with Firestore replaced; they did not provision production.
3. Deploy the backend through the existing gcloud authApi workflow, retaining
   the existing project, region, environment, secrets and identity, with
   `--runtime=nodejs22 --timeout=240s`. Do not alter either homepage source list.
4. Check the deployed `GET /public/creator-hub.json` for the catalog, then publish
   the frontend through its existing workflow. The Creator Hub construction gate
   continues to allow only confirmed admins; public release is a separate change.

Later catalog metadata changes appear after the bounded caches expire without
a frontend deployment. Existing open views refresh within approximately six
minutes of a successful catalog change (browser plus warm backend TTL).
