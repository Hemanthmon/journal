# Journal

A private, offline-first app for daily habits, journaling and urge tracking.

```
packages/shared   Zod schemas, types, sync protocol, date/progress utilities (used by both apps)
apps/api          Node + Express + MySQL REST API
apps/mobile       Expo (React Native) app with local SQLite and background sync
```

## Running it

### 1. API (first time)

1. `npm install` (from the repo root)
2. Copy `apps/api/.env.example` → `apps/api/.env` and `apps/api/.env.test.example` → `apps/api/.env.test`,
   and fill in the database details and a random `JWT_ACCESS_SECRET`:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
3. Hosted MySQL (Aiven): save the service's CA certificate as `apps/api/certs/ca.pem` (the server
   certificate is always verified). For a local MySQL instead, set `DB_SSL=0` and use
   `apps/api/scripts/setup-db.sql`.
4. From `apps/api`: `npm run db:create` and `npm run db:create -- --test`
5. `npm run api:migrate`

### 2. Every time

```
npm run api:dev        # API on http://<your-PC>:4000 (leave running)
npm run mobile:start   # Expo dev server; scan the QR code with Expo Go
```

- Install **Expo Go** on your phone. Phone and PC must be on the **same Wi-Fi**.
- `apps/mobile/.env` sets `EXPO_PUBLIC_API_URL` to your PC's Wi-Fi address, e.g. `http://10.154.196.216:4000`.
  If your network changes, update it (find the address with `ipconfig`) and restart `mobile:start`.
- If Windows asks whether Node.js may accept connections, allow it on **private networks**.
- Android emulator: use `http://10.0.2.2:4000`. This is a phone app: the web target is not supported.

### Android APK (installable app)

Built in the cloud with EAS Build (free Expo account). The APK talks to the deployed API
(`EXPO_PUBLIC_API_URL` in `apps/mobile/eas.json`).

```
cd apps/mobile
npx eas-cli login                                  # once
npx eas-cli build --platform android --profile preview
```

The first build asks to create the Expo project and an Android signing key; answer **yes** to both
(EAS stores the key). When it finishes (~10–20 min) it prints a link/QR code to download the APK.
Use `--profile production` for a Play Store bundle (.aab).

### Tests

```
npm test               # everything
npm run api:test       # API: auth, authorization, CRUD, sync, validation, idempotency, schema (real MySQL)
npm run mobile:test    # app logic + end-to-end offline scenario against the real API
```

The API tests reset every table in the `*_test` database.

## How it works

**Offline first.** Every change is written to SQLite on the phone immediately (in one transaction
with an *outbox* entry), so the UI never waits for the network. A background sync uploads the outbox
and downloads changes whenever the app is online: shortly after edits, on reconnect, on returning to
the app, and every 5 minutes, with exponential backoff after failures. The header shows
Synced / Syncing / Offline / Sync failed.

**Sync protocol** (`POST /api/sync/push`, `GET /api/sync/pull`):
- Ids are UUIDs generated on the device, so the server never has to assign new ones. Once-per-day
  records (daily routine, habit log, journal answer) use deterministic UUIDv5 ids derived from
  user + date (+ habit/question), so two devices creating "today's log" produce the same record.
- Each server write gets a per-user sequence number; pulls fetch only `server_seq > cursor`
  (incremental, paged, from a consistent snapshot).
- Every change carries a `changeId`; the server records processed ids, so retries never apply twice.
- Conflicts: last-write-wins on `updatedAt` for ordinary records. **Journal text** uses version
  checks instead. If another device changed the answer since this device last saw it, nothing is
  overwritten; the app keeps both versions and asks you (Keep mine / Keep other / Keep both).
- Deletes are soft (`deleted_at`) and synced as tombstones. Deleted habits, questions and urges
  can't be revived by stale edits from another device.
- "Delete personal data" bumps a data epoch, so every device discards its local copy.

**History is preserved.** Habit logs snapshot the target, unit and type; journal answers snapshot the
question text and type. Editing, archiving or deleting a habit or question never changes past records,
and the database uses RESTRICT foreign keys so history can't be hard-deleted by accident.

## API endpoints

All routes except `/api/auth/*` and `/api/health` require `Authorization: Bearer <access token>` and only
ever read or write the caller's own records (other users' ids return 404). Responses are `{ data }`
or `{ error: { code, message, details? } }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `/login`, `/refresh`, `/logout` |
| Profile | `GET /api/profile`, `PATCH /api/profile` |
| Account | `DELETE /api/account` (password), `DELETE /api/account/data` (password) |
| Habits | `GET/POST /api/habits`, `GET/PATCH/DELETE /api/habits/:id`, `POST /api/habits/reorder` |
| Habit logs | `GET/POST /api/habit-logs`, `GET/PATCH/DELETE /api/habit-logs/:id` |
| Questions | `GET/POST /api/journal-questions`, `GET/PATCH/DELETE /api/journal-questions/:id`, `POST /api/journal-questions/reorder` |
| Answers | `GET/POST /api/journal-answers`, `GET/PATCH/DELETE /api/journal-answers/:id` |
| Daily routines | `GET /api/daily-routines?from&to`, `GET/PUT /api/daily-routines/:date` |
| Urges | `GET/POST /api/urges`, `GET/PATCH/DELETE /api/urges/:id` |
| Sync | `POST /api/sync/push`, `GET /api/sync/pull?cursor&limit` |

The app itself only uses auth, profile, account and sync. The CRUD routes share the same write path
(`apps/api/src/records/records.ts`), so they apply the same validation and conflict rules.

## Security and privacy

- Passwords: bcrypt (cost 12). Access tokens: 15-minute JWTs. Refresh tokens: random, stored hashed,
  rotated on every use; reusing an old one revokes that login on all devices.
- On the phone, tokens are in SecureStore (Keychain/Keystore), and data is in the app's private SQLite database.
  Logging out removes the user's data from the device.
- Server: Zod validation on every input, parameterized SQL only, helmet headers, CORS allowlist,
  rate-limited auth, HTTPS required in production (terminate TLS at a proxy and set `TRUST_PROXY=1`).
- Logs contain only method, path, status and timing, never bodies, tokens, journal or urge content.
- `.env` files are git-ignored. Rotate any credential that has been shared.

## Known limitations

- Local data is not encrypted at rest beyond the OS's app sandbox. SQLCipher encryption is supported
  by expo-sqlite but requires a development build (not Expo Go).
- A habit's schedule history isn't versioned: for past days without a log, "scheduled" is judged
  by the current schedule.
- Profile edits, account/data deletion and first sign-in need a connection; everything else works offline.
- Email changes and password reset aren't implemented yet.
