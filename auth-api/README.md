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

The existing hourly job now publishes the v2 public footer snapshot at
`visitor_metrics_public/current`. It no longer generates the private admin details.
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

The public manifest and immutable per-path documents share one generation. Each path
has its own SHA-256 document ID and at most 30 daily values, avoiding the 1 MiB document
limit. No private titles, referrers, API keys or admin top lists are published. A successful
missing-path read from a complete generation means zero; failed reads do not. Frontend
reads share a single manifest and per-path promises, with no focus/toggle refresh. Cached
manifests expire after two hours; generations are retained for 48 hours and at most two
expired generations are removed per job. A failed unpublished generation is also eligible
for this cleanup. One additional range supplies the full-period total after day 30;
up to 30 exact Berlin-day ranges supply the average, including current and zero days.
DST uses calendar days. Provider chart timezone is not used.

Private legacy admin details at `analytics/visitor_analytics` are generated/loaded only
by explicit POST `/api/admin/stats/visitor/refresh`. Their existing shape/top-25 taxonomy
is retained; totals are per-page counts and exclude events. They must not be interpreted
as the v2 website visitor totals, especially across the tracking transition.

Local checks (run in the existing independent external test copy):

```text
npm --prefix auth-api run build
npm --prefix auth-api test -- src/internal/analytics/visitor/metrics.test.ts --cache=false
```

Manual deployment, using the existing Firebase authapi workflow, after local review:

1. Deploy authApi only with the existing project selection (`firebase deploy --only
   functions:authapi:authApi`); predeploy runs the auth-api TypeScript build. The local
   function definition raises the request timeout to 240 seconds for bounded pagination.
2. Add **only** the `visitor_metrics_public` match from `firestore.rules` to the active
   rules: public single-document `get` for the manifest/generations and their `pages`
   subcollection; deny list/write. Keep all other active rules. Do not deploy the whole
   local rules file without comparing it to the active rules.
3. Deploy the frontend through its existing workflow. Then configure Visitor Analytics
   and confirm the deployed v2 tracker plus enabled Sessions as described above.
4. Preserve the existing hourly scheduler URL/method/internal header. Ensure its request
   deadline accommodates the 240-second function timeout. No new schedule, secrets,
   GoatCounter account changes or TTL policy are required.

No deployment or production configuration change is performed by these local edits.

### User Upload Inbox Endpoints

Authenticated users can fetch their inbox entries and download CSVs:

- `GET /user/upload-inbox` — lists non-expired scans (`ready`/`downloaded`).
- `GET /user/upload-inbox/:scanId/download` — returns CSV contents plus metadata and marks the entry as downloaded (extends expiry by 7 days from first download).
