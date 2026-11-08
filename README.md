# OpenBook

"Bits of Intelligence" flash cards and first reading books for young children — see [SPECS.md](SPECS.md).
This is the **MVP**: the offline core (milestones M0–M4.5) without audio.

| Path | What |
|---|---|
| `apps/mobile` | Expo SDK 58 app (iOS, Android, Web) — Expo Router, Redux Toolkit + RTK Query, expo-sqlite |
| `apps/api` | NestJS 12 + Prisma 7 + Postgres — catalog, auth, CMS endpoints |
| `packages/shared` | Domain types, zod schemas and the pure logic (scheduler, shuffle, books, validation) with Jest tests |
| `content` | `source.json` (packs, facts, books) → `seed.json` (resolved Wikimedia Commons images + attribution) |

## Run it

```sh
npm install
docker-compose up -d postgres                 # Postgres on :5433
cp apps/api/.env.example apps/api/.env
npm run build -w @openbook/shared
cd apps/api && npx prisma migrate deploy && npm run build && npm run db:seed && npm start   # API on :3000/v1
cd apps/mobile && npx expo start              # press w for web
```

Set `EXPO_PUBLIC_API_URL` if the API isn't on `http://localhost:3000/v1` (the Android emulator maps
`localhost` to `10.0.2.2` automatically). Native builds need a development build (`npx expo run:ios|android`)
because the app uses modules outside Expo Go.

Seeded CMS accounts: `editor@openbook.local` / `publisher@openbook.local`, password `openbook-dev-password`
(override with `SEED_ADMIN_PASSWORD`). API docs: `/v1/docs`, spec: `/v1/openapi.json`.

## Tests

```sh
npm test -w @openbook/shared      # scheduler, retirement timeline, shuffle, books, validation (Jest)
npm test -w api                   # API integration tests against the dev Postgres (node:test + supertest)
cd apps/mobile && npx tsc --noEmit && npx expo lint
```

## Packages (.rpm / .deb)

```sh
npm run package         # both; or package:rpm / package:deb → dist/packages/ (needs docker for nfpm)
```

The package bundles its own Node runtime, the API and the exported web app, served together by
`openbook.service` as the `openbook` system user on one port (`/` web app, `/v1` API). It needs
PostgreSQL. After installing:

1. Set `DATABASE_URL` (and optionally `PORT`, default 3000) in `/etc/openbook/openbook.env`.
2. `systemctl enable --now openbook` — migrations run on every start.
3. `openbook-seed` — loads the bundled packs and books (set `SEED_ADMIN_PASSWORD` first for CMS accounts).

## Content

`node apps/api/scripts/fetch-content.mjs` resolves every card in `content/source.json` to a Wikimedia Commons
image and checks the spec's rules (PD/CC license, full attribution, ≥1600 px). `find-images.mjs` suggests
replacements when a Wikipedia lead image doesn't qualify. Re-seeding bumps the version of any pack or book
whose content changed, so devices are offered an update.

## What's in the MVP

- Onboarding (PIN → child → first pack), profile picker, Today screen with session dots.
- Pack catalog, download with progress / resume, update detection, removal, storage per pack; all offline afterwards
  (files on native, Cache Storage on web).
- Flashing sessions: shuffle without repeating the last card, preloading, auto/manual advance (tap, swipe, keys),
  name hidden/below/after, rotating fact caption, ≤150 ms crossfade, landscape + keep-awake + fullscreen,
  long-press exit, end card, 80 % completion rule.
- Program: up to N active sets, 3×/day × N active days, whole-set retirement and next set, magnitude
  progression, extend / retire early, retired library with review, streaks and history, local reminders (native).
- Own photo cards (crop + resize to 2048 px), custom decks (mix own and official cards, reorder).
- Books: reader (text-then-picture / text-only / side-by-side, stage typography with auto-fit, word highlighting),
  templates, generate from pack/deck, page editor with live stage warnings and vocabulary, official books in the
  catalog, active books and Bookshelf, known words + readiness, print / PDF (A4 / Letter landscape).
- Parent PIN gate with 5-try / 60 s lockout and arithmetic reset; credits & licenses; light/dark parent UI.
- API: public catalog, email/password auth (argon2id, 15-min JWT, rotating refresh tokens with reuse detection,
  verification + reset via a logging mailer), account deletion, role-based CMS endpoints with the
  draft → review → published → archived workflow and pack/book validation.

## Not yet (next milestones)

- **Audio** (§4.5, FR-68): voice recording/playback, bulk record mode.
- **Accounts in the app, cloud sync, export** (M5) — the server auth exists; records already carry
  `updatedAt`/`deletedAt` tombstones for sync.
- **Sharing & moderation** (M6), **admin CMS web UI** (`apps/admin`), S3/MinIO image upload + renditions.
- PWA service worker, Maestro/Playwright E2E suites, component tests, store hardening (M7).
