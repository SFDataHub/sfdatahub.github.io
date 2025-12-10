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

### User Upload Inbox Endpoints

Authenticated users can fetch their inbox entries and download CSVs:

- `GET /user/upload-inbox` — lists non-expired scans (`ready`/`downloaded`).
- `GET /user/upload-inbox/:scanId/download` — returns CSV contents plus metadata and marks the entry as downloaded (extends expiry by 7 days from first download).
