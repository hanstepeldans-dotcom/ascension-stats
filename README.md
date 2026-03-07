# Unified Creator Stats

Combine Infloww and Fanvue analytics in one dashboard. Phase 1: scaffold with landing, authenticated app shell, placeholder pages, and integration-ready structure.

## Prerequisites

- **Node.js 18+**
- npm or pnpm

(Docker is optional — only needed if you use Postgres instead of the default SQLite.)

## Quick start (no Docker required)

From the project root:

```bash
npm install
cp .env.example .env
npm run dev:setup
npm run dev
```

`npm run dev` starts the app on port 3000 (required for OAuth callback URL). If port 3000 is in use, the script exits with instructions. Use the URLs from the terminal, for example:

- **App:** http://localhost:\<PORT\>
- **Login:** http://localhost:\<PORT\>/login
- **Verify seed:** http://localhost:\<PORT\>/api/auth/verify-seed

Log in with:

- **Email:** `admin@example.com`
- **Password:** `admin123`

Development uses **SQLite** by default (zero setup, no Docker). The database file is at `prisma/dev.db`.

**If anything fails, run `npm run dev:doctor` and follow the printed instructions.**

## Optional: Postgres with Docker

For Postgres instead of SQLite:

1. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
2. In `.env`, set:
   ```bash
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/unified_creator_stats?schema=public"
   ```
3. Start Postgres: `npm run db:up`
4. Run `npm run dev:setup` then `npm run dev`.

## Environment

Copy `.env.example` to `.env`. Defaults work with SQLite:

- **DATABASE_URL** — SQLite: `file:./dev.db`. For Postgres, use your connection string.
- **NEXTAUTH_URL** — e.g. `http://localhost:3000` (match the port printed when you run `npm run dev`)
- **NEXTAUTH_SECRET** — Use a random string (e.g. `openssl rand -base64 32`)
- **APP_BASE_URL** — Base URL for OAuth redirects (e.g. `http://localhost:3000`). Required for Fanvue OAuth.
- **FANVUE_*** — See “Connecting Fanvue (OAuth)” below.

## Connecting Fanvue (OAuth)

To connect a Fanvue Agency account via OAuth 2.0 (authorization code flow):

1. **Add the redirect URL in the Fanvue dashboard**  
   Set this exact URL as the OAuth redirect/callback in your Fanvue app settings:  
   **`http://localhost:3000/api/fanvue/oauth/callback`**  
   (If you run on another port, use that host/port and set `APP_BASE_URL` in `.env` to match.)

2. **Paste Client ID and Secret**  
   - **Easiest:** Go to **Settings** in the app. If Fanvue isn’t configured, you’ll see a **Fanvue setup** section. Paste your **Client ID** and **Client Secret** from Fanvue, then click **Save to .env (local dev)** (admin only). The app will fill in default endpoints (no need to set URLs).  
   - **Or** copy `.env.example` to `.env` and set `FANVUE_CLIENT_ID` and `FANVUE_CLIENT_SECRET` manually. Optional URL vars default to `https://api.fanvue.com` (see `.env.example`).  
   - **Fanvue API version:** Set `FANVUE_API_VERSION=2025-06-26` (or the version required by Fanvue). The app sends this in the `X-Fanvue-API-Version` header on every API request.

3. **Restart the dev server**  
   Env vars are read at startup. After saving Client ID/Secret (in Settings or in `.env`), **restart** (`Ctrl+C` then `npm run dev`) so the app picks them up.

4. **Run the app on port 3000**  
   `npm run dev` uses port 3000 by default. If port 3000 is in use, the script exits with: *"OAuth requires stable redirect. Free port 3000 OR update APP_BASE_URL and Fanvue Redirect URL."*

5. **Connect in the app**  
   Go to **Settings**, then click **Connect Fanvue**. Sign in with Fanvue if prompted; you’ll be redirected back with Fanvue connected. Use **Disconnect** to remove the connection.

6. **Scopes and “Insufficient scopes”**  
   The token Fanvue issues only contains the scopes we *request* at login. If you see `openid offline_access offline` at `/api/fanvue/scopes` and get 403 “Insufficient scopes” on API calls, the app was connected when only those three were requested (e.g. `FANVUE_SCOPES` was unset). The app now defaults to also requesting `read:creator read:insights read:agency read:self`. **Restart the dev server** so the new default is used, then click **Reconnect** in Settings (or Disconnect → Connect Fanvue) and approve again on Fanvue. The new token will include API scopes and `/creators`, sync, etc. will work.

**Security:** Never commit `.env` or share your client secret. If the secret was ever exposed, **rotate it** in the Fanvue dashboard and update `.env`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server on port 3000 (exits if 3000 is in use; required for OAuth) |
| `npm run dev:port` | Print first available port (3000–3010) |
| `npm run dev:setup` | Run migrations and seed (use once after clone or when DB is reset) |
| `npm run dev:doctor` | Check .env, database, and admin user |
| `npm run dev:full` | Run doctor, then dev:setup, then dev |
| `npm run db:migrate` | Run Prisma migrations only |
| `npm run db:seed` | Seed admin user only |
| `npm run db:up` | Start Postgres in Docker (optional) |
| `npm run db:down` | Stop Docker Postgres |
| `npm run db:reset` | Stop Docker and remove volume |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run prisma:studio` | Open Prisma Studio |

## Creating a user

The seed creates (or updates) one user:

- **Email:** `admin@example.com` (override with `SEED_USER_EMAIL`)
- **Password:** `admin123` (override with `SEED_USER_PASSWORD`)
- **Name:** `Admin User` (override with `SEED_USER_NAME`)

Run `npm run dev:setup` (or `npm run db:seed`). You should see:

```
Seed complete.
User: admin@example.com
Password: admin123
Seeded admin role: ADMIN
```

**After role or permission changes** (e.g. reseeding the admin user), log out and log back in so your session gets the updated role. The JWT is issued at login; it does not update until you sign in again.

## Troubleshooting

### Login says "Invalid email or password"

1. Run `npm run dev:setup` to create the database and seed the admin user.
2. Open the **Verify** URL printed when you ran `npm run dev` (e.g. http://localhost:3000/api/auth/verify-seed). It should return `{ "ok": true, "user": "admin@example.com", "message": "Seeded user exists and password matches." }`.

### "You don't have permission" when adding a member (admin)

The seeded user has role **ADMIN**, but your session may have been created before the role was set. **Log out and log back in** as `admin@example.com` so the new JWT includes `role: "ADMIN"`. Then try adding a member again.

### Doctor says admin user not found

Run:

```bash
npm run dev:setup
```

### Reset SQLite database

Delete the database file and run setup again:

```bash
rm -f prisma/dev.db prisma/dev.db-journal
npm run dev:setup
```

## Where to add provider integrations later

- **Infloww:** `lib/providers/infloww/` — replace mock in `client.ts` / `mock.ts` with real API; keep `normalizeToUnifiedSchema()`.
- **Fanvue:** `lib/providers/fanvue/` — same pattern.
- **Combining:** `lib/analytics/combiner.ts` — `combineUnifiedStats()`; extend for more providers or metrics.
- **Auth / connections:** Store OAuth tokens in `ProviderConnection`; add OAuth providers in `lib/auth/config.ts` and Settings UI.

## Project structure (high level)

- `app/(marketing)/` — landing page
- `app/(auth)/` — login
- `app/(app)/` — dashboard, Infloww, Fanvue, Combined, Settings (authenticated)
- `app/api/` — health, NextAuth, verify-seed (dev)
- `lib/auth/` — NextAuth config, schemas
- `lib/db/` — Prisma client
- `lib/providers/infloww|fanvue/` — provider services and mocks
- `lib/analytics/` — combining logic
- `components/layout/` — sidebar, topbar
- `components/charts/` — placeholder charts
- `components/ui/` — shadcn-style UI
- `prisma/` — schema, seed, and SQLite dev DB
- `scripts/` — doctor (run `npm run dev:doctor`)
- `docker-compose.yml` — optional Postgres for advanced use
