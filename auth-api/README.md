# SFDataHub Auth API

Lightweight Node + TypeScript backend responsible for handling auth-related endpoints for SFDataHub. It will eventually live on its own deployment (e.g., Vercel/Netlify/server) and the frontend will talk to it via `AUTH_BASE_URL`.

## Getting Started

```bash
cd auth-api
npm install
cp .env.example .env   # fill in all required values
npm run dev            # starts http://localhost:4000
```

### Environment Variables

See `.env.example` for the required JWT secret, Firebase project ID, and provider placeholders.

### Authentication to Firebase

This service relies on **Application Default Credentials (ADC)** for `firebase-admin`.

- **Local development:** run `gcloud auth application-default login` once (using an account with access to `PROJECT_ID`) before `npm run dev`.
- **Production (Cloud Run / Cloud Functions):** the runtime’s default service account automatically provides credentials—no JSON keys or `.env` secrets are needed beyond the project ID.
- **Security note:** never store or commit service-account keys in the repo; ADC makes them unnecessary.

### Frontend Integration

When deploying this service, configure the frontend `.env` to set `VITE_AUTH_BASE_URL` (consumed as `AUTH_BASE_URL`) to the public URL of this backend so the `AuthContext` can reach `/auth/session`, `/auth/logout`, etc.

- Session cookies automatically switch to `SameSite=None; Secure` when this backend runs on Cloud Run / staging so cross-site `fetch(..., { credentials: "include" })` calls from `sfdatahub.github.io` keep the login alive.
- In local development (when `FRONTEND_BASE_URL` points at `localhost`), the cookie falls back to `SameSite=Lax` without `Secure` so `http://localhost` testing still works.

### Discord OAuth Setup

- Create/update your Discord application in the Developer Portal:
  - Add the redirect URL from `DISCORD_REDIRECT_URI` (e.g., `https://auth.sfdatahub.com/auth/discord/callback`).
  - Copy the Client ID/Secret into `.env` (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`).
- Ensure `FRONTEND_BASE_URL` matches your Vite app (default `http://localhost:5173`).
- Run `npm run dev` in `auth-api/` and set `VITE_AUTH_BASE_URL=http://localhost:4000` in the frontend to test the complete login flow.

### Internal Upload Inbox Endpoint

An internal endpoint allows the Discord bot to deposit processed scans:

```
POST /internal/upload-inbox/add
Header: x-internal-token: $UPLOAD_INBOX_TOKEN
```

Example:

```bash
curl -X POST "https://<auth-api-url>/internal/upload-inbox/add" \
  -H "Content-Type: application/json" \
  -H "x-internal-token: $UPLOAD_INBOX_TOKEN" \
  -d '{
    "discordUserId": "138679453717889024",
    "scanId": "test-scan-001",
    "playersCount": 3,
    "guildsCount": 1,
    "playerIds": ["p1","p2","p3"],
    "guildIds": ["g1"],
    "server": "eu1",
    "source": "discord",
    "playersCsvBase64": "UExBQ0VIT0xERVI7..."
  }'
```

Configure `UPLOAD_INBOX_TOKEN` and `UPLOAD_INBOX_BUCKET` in your environment (see `.env.example`).

### Internal Visitor Analytics Snapshot Sync

The GoatCounter visitor snapshot can be refreshed via:

```
POST /internal/analytics/visitor/sync-snapshot
Header: x-internal-token: $UPLOAD_INBOX_TOKEN
```

Required environment values:

- `GOATCOUNTER_API_BASE_URL` (recommended: `https://<your-site>.goatcounter.com`; `/api/v0` is also accepted)
- `GOATCOUNTER_API_TOKEN` (Bearer token)

The existing hourly job publishes the current v3 public footer snapshot at
`visitor_metrics_public/live`. It no longer generates the private admin details.
Repeated runs within an hour reuse the current snapshot unless configuration changed.
The job uses the existing token, API rate gap and bounded retries. It reads complete
`stats/hits` pages using `exclude_paths`, never `stats/total` as a website visitor count.
It aborts without replacing the current snapshot on missing/malformed data or bounds:
240 upstream attempts / 180 seconds, 200 pages per range, 20,000 public paths.

The deployed v2 tracker sends the fixed `sfdatahub/website-visit-v2` event with
session detection and sends versioned `sfdatahub/page-view-v2:<tracking-path>` events with per-hit
`no_session: true`. It also preserves the existing normal session-counted path hit
for the admin lists; the public snapshot ignores that stream, including old open clients.
Other events are excluded. Website totals mean temporary-session visits, not
permanently unique people. No new user identifier or account linkage is introduced.

`/api/admin/stats/visitor/config` (GET/PUT) uses the existing admin session guard.
In Visitor Analytics, set the common start date (00:00 Europe/Berlin). After deploying
the tracker, explicitly verify GoatCounter → Settings → Data collection → Sessions
and confirm the checkbox. This service does not read/change active account settings.
The selected start date is the sole evaluation boundary, including the current partial
Berlin day. Confirmation verifies the deployed v2 tracker and enabled Sessions; it does
not postpone evaluation. Previously stored automatic collection dates are ignored on
read and aligned with the selected start on save, without toggling the checkbox. Only
existing v2 events within the selected period count; legacy history is never substituted.
Saving changes the configuration revision. The next regular hourly job also replaces
snapshots based on the old later boundary even if the revision has not changed.

Public storage (Patch 1.1.2):

- `visitor_metrics_public/live`: schemaVersion=3, generation="live", monotonic sequence,
  complete=true, state, timezone, startDate/collectionStartDate/effectiveStartDate,
  configRevision, asOf, today, basis, dayCount, pathCount, website={today,total,dailyAverage}.
- `visitor_metrics_public/live/pages/{SHA256(canonicalPath)}`: schemaVersion=3,
  path, basis, sequence of the last actual change, today, total, dailyAverage.
- `analytics/visitor_sync_lease`: stable id/until coordination; released to empty id/0.
  Its private `page_hashes/{0..f}` documents contain `hashes: {pageId: valueHash}`.
  These sixteen bounded current indexes avoid reading every public page each run.

Daily ranges stay in calculation memory; only the displayed aggregates/dayCount
are stored. No history is produced. One transaction updates changed/new/removed
pages, changed hash shards, the manifest and unlocked lease together. Unchanged
runs write only lease acquisition, central freshness and lease release (3 writes,
no page/index writes/deletes). Same-hour duplicates read 3 documents and write none.
Publication aborts while retaining the previous state if any document would exceed
512 KiB or the estimated atomic payload (including per-write overhead) exceeds 8 MiB.
The existing 20,000-path bound also remains. Large all-path configuration/day changes
can hit the atomic payload bound earlier; partial publication is never used.

New readers get only the manifest and their page. Shared promises/cache and the
existing hour+2min/one retry at +3min scheduler remain. Page basis/sequence detect
read races; one shared reconciliation read is allowed, with previous visible values
retained on failure. A missing mutable page becomes zero only after verifying that
the manifest did not change. Confirmed zeroes are cached too. There are no new
listeners, polling loops, focus/toggle/locale reads. Number/date formatting and layout
remain unchanged; the footer uses central dayCount instead of persisting daily rows.
One full-period range after day 30 and up to 30 exact Berlin daily ranges still supply
the same visitor/page totals and averages, including current/zero days and DST.

Private legacy admin details at `analytics/visitor_analytics` are generated/loaded only
by explicit POST `/api/admin/stats/visitor/refresh`. Their existing shape/top-25 taxonomy
is retained; totals are per-page counts and exclude events. They must not be interpreted
as the v2 website visitor totals, especially across the tracking transition.

Local checks (run in the existing independent external test copy):

```text
npm --prefix auth-api run build
npm --prefix auth-api test -- src/internal/analytics/visitor/metrics.test.ts --cache=false
```

Manual deployment for Danny (Patch 1.1.2):

1. Use the established **gcloud** authApi deployment with the existing project,
   region, entry point, environment/secrets and service account; retain
   `--runtime=nodejs22 --timeout=240s`. Build the auth-api source through the existing
   gcloud workflow. Do not switch to Firebase deployment or create new secrets.
   Keep `visitor-analytics-sync`, its hourly cadence, URL
   `/internal/analytics/visitor/sync-snapshot`, HTTP method and existing authentication.
2. Existing checked-in Rules already allow individual `get` on every
   `visitor_metrics_public/{snapshotId}` and its `pages/{pathId}`, while denying
   list/write. They cover `live` unchanged; no rules change is needed if that match
   is active. Do not publish the entire local rules file blindly.
3. Backend first. The old `current` pointer and all generations remain frozen and
   readable for old open clients. Wait for a successful regular publication at
   `live`, or use the existing authorized sync endpoint once. No config reset:
   confirmed start date, revision and source counting stay intact. Before that
   success the new frontend falls back to the existing v2 pointer.
4. Publish the frontend through its existing workflow. Old open pages still show
   their frozen legacy values (and the existing stale indication); ask users to
   reload those pages. Keep old generations until the agreed legacy-client
   transition is complete. No ongoing compatibility-generation production.
5. **Separate, explicit one-time cleanup**, only after legacy readers were reloaded.
   Preview from `auth-api` using existing ADC/project access (no new secrets):

   ```text
   node tools/visitor-generations.cjs --project PROJECT --plan D:/SFDataHub/codex/sfdatahub.github.io/tmp/w279/cleanup-plan.json
   ```

   Inspect the finite JSON list of exact old generation/page paths plus old
   `visitor_metrics_public/current`. Then explicitly run the same command with
   `--delete --ack-old-readers-reloaded`. Preview does not delete; apply verifies
   project, live availability, target paths/update times, and uses conditional
   batches. It preserves `live`, private config/lease/indexes and every unrelated
   collection. Interrupted apply can resume with the same plan; changed targets
   require review and a fresh preview. No recursive or periodic cleanup is installed.
   Read/list enumeration during this manual preview is distinct from document
   deletes and is not part of the regular hourly job.

No deployment or production configuration change is performed by these local edits.

### User Upload Inbox Endpoints

Authenticated users can fetch their inbox entries and download CSVs:

- `GET /user/upload-inbox` — lists non-expired scans (`ready`/`downloaded`).
- `GET /user/upload-inbox/:scanId/download` — returns CSV contents plus metadata and marks the entry as downloaded (extends expiry by 7 days from first download).
