# OpenBook — "Bits of Intelligence" Flash Card App — Specification

### TLDR

OpenBook (working title) is a cross-platform (iOS, Android, Web) **Expo / React Native** app for showing
"Bits of Intelligence" flash cards, inspired by the method Glenn Doman developed. Parents download official
card packs (Nature & Science, Everyday Objects) or make their own cards from photos. They then run short,
cheerful sessions where cards flash by quickly: a large realistic image, an optional name in big red bold
text, the parent's recorded voice or the device's read-aloud voice, and a small fact caption meant for the parent. A guided scheduler runs
the classic program: each set is shown 3× a day for N days, then the whole set is retired. The app also
includes **Doman-style books** from the reading part of the program. Each text page (large type, red at
first, few words) is followed by its picture on a separate page. There are official books, homemade books
about the child's own life, and books generated from card packs. Books are read on a schedule and can be
printed. The app works
**fully offline**. A **custom Node/TypeScript API** handles parent accounts, cloud sync, the pack catalog,
private deck sharing and an admin CMS. It is free with no ads, and it collects no data about children.

---

## 1. Goals & Non-Goals

### Goals
- Show large, clean, realistic images of single subjects quickly, with no distractions.
- Make the Doman program easy to follow (sets, a daily schedule, retirement) without making it feel like
  testing.
- Work fully offline once content has been downloaded.
- Let parents make, voice and privately share their own cards.
- Share one codebase across iOS, Android and Web.

### Non-Goals (v1)
- Quizzes, scores or any kind of testing of the child.
- A public community gallery.
- Ads, in-app purchases or subscriptions.
- More than one language in the UI or content (the data model is ready for it, but v1 ships English only).
- Social login (Apple/Google). Email/password only in v1.

### Naming / trademark
- "Doman" must **not** appear in the app name, icon or store title. Store copy may say
  "inspired by the Doman method".

---

## 2. Platforms & Tech Stack

### 2.1 Client
| Concern | Choice |
|---|---|
| Platforms | iOS, Android (phones and tablets), Web (desktop and tablet browsers) |
| Framework | Expo SDK (latest stable), **managed workflow**, EAS Build / EAS Update |
| Navigation | Expo Router (file-based) |
| Language | TypeScript (strict) |
| State | **Redux Toolkit**; **RTK Query** for API calls; `redux-persist` for settings and session state |
| Local DB | `expo-sqlite` (also on web through its WASM backend) for structured content and progress |
| Media storage | `expo-file-system` on native; IndexedDB / Cache Storage on web, behind one `MediaStore` adapter |
| Images | `expo-image` (caching, fast crossfade transitions) |
| Audio | `expo-audio` for recording and playback (web uses MediaRecorder) |
| Read aloud | `expo-speech` using on-device voices only (§4.13) |
| Camera / photos | `expo-image-picker` + `expo-image-manipulator` (crop/resize) |
| Display | `expo-screen-orientation`, `expo-keep-awake`, `expo-navigation-bar` / status bar hidden; Fullscreen API on web |
| Notifications | `expo-notifications` (local reminders on native; no reminders on web in v1) |
| Secure storage | `expo-secure-store` (auth tokens, PIN hash); on web, tokens in memory + refresh cookie |
| i18n | `i18next` + `react-i18next`, English only in v1 |

### 2.2 Backend (custom API)
| Concern | Choice |
|---|---|
| Runtime | Node.js LTS, TypeScript |
| Framework | NestJS (REST), with an OpenAPI spec generated from code |
| DB | PostgreSQL + Prisma ORM |
| Object storage | S3-compatible (AWS S3 / Cloudflare R2 / MinIO in dev) behind a CDN |
| Auth | Email/password (argon2id hashes), JWT access tokens (15 min) + rotating refresh tokens |
| Email | Transactional provider (verification and password reset) |
| Admin CMS | Web admin app (React + Vite) talking to `/admin/*` endpoints with role-based access |
| Infra | Docker; Postgres and MinIO via docker-compose for local dev |

### 2.3 Repository layout (monorepo)
```
/apps/mobile        Expo app (iOS/Android/Web)
/apps/admin         CMS web app
/apps/api           NestJS API
/packages/shared    Shared TS types, zod schemas, API client types (generated from OpenAPI)
```

---

## 3. Core Concepts & Glossary

- **Card (Bit):** one subject: an image, a name, facts at magnitude levels 1–3, attribution, and optional
  parent voice recording(s).
- **Pack:** an official, curated collection of **20+ cards** in one category (e.g. "Birds of the World 1").
- **Custom Deck:** a deck a parent puts together from their own photo cards and/or official cards.
- **Set:** the group of cards a child is currently working on, taken from a pack or deck. Its size can be set
  from **5 to 20 (default 10)**.
- **Session:** one run through a set, shuffled.
- **Program:** a child's schedule of active sets, each shown **3× a day for N days (default 5)**, after which
  the **whole set is retired** and the next set from the pack or deck becomes active.
- **Magnitude level:** how detailed a fact is (1 = simplest, 3 = most detailed). A child's level for a card
  goes up each time that card cycles through the program again.
- **Book:** a Doman-style reading book. It is a sequence of **pages**, each with short text and an optional
  illustration. By default each text page is shown first and its illustration follows on a separate page,
  so the child takes in the words without a picture to guess from.
- **Book stage:** typography level 1–4 that sets text size, colour (red → black) and words per page. It goes
  from very large red text with a few words up to ordinary-sized black text.
- **Vocabulary:** the unique words in a book (normalized, lowercase). Words can be checked against a child's
  **known words** list.

---

## 4. Functional Requirements

### 4.1 Content: Official Packs
- FR-1: The app shows a **Pack Catalog** from the API, grouped by category:
  - **Nature & Science**: animals, birds, trees, flowers, rocks, constellations, human anatomy.
  - **Everyday Objects**: musical instruments, tools, vehicles.
- FR-2: Each pack has at least 20 cards. Pack metadata includes title, category, cover image, card count,
  download size, version and attribution summary.
- FR-3: Parents can **download** a pack. Images and content are stored locally, so the pack works offline.
  Downloads show progress and can be resumed after interruption.
- FR-4: Pack updates are versioned. The app notices a new version and offers to update. Progress for cards
  that still exist is kept.
- FR-5: Packs can be removed from the device. Progress history is kept.
- FR-6: Downloading packs does **not** need an account (anonymous catalog access).
- FR-7: **First launch:** there are no bundled decks, so onboarding asks the parent to download at least one
  pack. When offline with nothing downloaded, an empty state explains that a connection is needed once.

### 4.2 Content: Parent-Created Cards
- FR-8: Parents can make a card from the camera or photo library. The app guides the crop (single subject,
  plain background tip) and requires a **name**. **Facts** for levels 1–3 are optional.
- FR-9: Images are resized on the device (long edge 2048 px, JPEG/WebP ~85%) before they are stored.
- FR-10: Parents can create, edit, reorder and delete **Custom Decks** that mix their own cards with official
  cards.
- FR-11: Own-photo cards stay **local only** until the parent signs in and turns on sync (§4.8).

### 4.3 Card Image & Licensing
- FR-12: Official images are **public domain or Creative Commons** only (Wikimedia Commons, CC0, CC-BY,
  CC-BY-SA). Each card stores source URL, author, license and license URL.
- FR-13: Each card has an **Info / Attribution** screen (parent area), and there is an aggregated
  "Credits & Licenses" screen.
- FR-14: CMS validation rejects any card without full attribution data.

### 4.4 Card Presentation
- FR-15: **Name display can be set per child profile**:
  - `hidden`: the child sees only the image (default for infants).
  - `below`: the image with the name in large red bold text under it.
  - `after`: the image first, then the name shown on its own as a second beat.
- FR-16: The name is rendered in **red (#D0021B) bold sans-serif** and scaled to fill about 15–20% of the
  screen height.
- FR-17: **Fact caption:** a small, low-contrast caption in a corner, meant for the parent, shows one fact
  from the card's current magnitude level. It can be turned on or off per profile (default on). The fact
  rotates between sessions.
- FR-18: The flashing screen has a **pure white background** and no UI chrome. Card changes use a
  **≤150 ms crossfade**.

### 4.5 Audio: Parent Voice Recording
- FR-19: Parents can **record their own voice** saying the card's name, and optionally each fact. Recordings
  are stored per card **per parent account / device**, not per child.
- FR-20: In a session, the recording plays when the card appears, if one exists and audio is on (default on
  when recordings exist).
- FR-21: Recordings are AAC/M4A on native and WebM/Opus on web. Max 10 s. Audio is trimmed and
  volume-normalized where the platform allows.
- FR-22: A **bulk record mode** goes through a pack card by card (show, record, next) so voicing a pack is
  fast.
- FR-23: Recordings sync to the cloud when signed in, and are included when a parent shares a custom deck
  only if the parent explicitly opts in.

### 4.6 Session Mode (Flashing)
- FR-24: **Advancing:** auto-advance with speed adjustable from **0.5 s to 30 s per card (default 10 s)**, plus
  **tap / swipe / arrow key / space** to advance manually. Manual input resets the auto timer.
  - When a voice recording is longer than the interval, auto-advance waits for the clip to finish, up to 3 s.
  - The device voice has its own rule: auto-advance waits for it to finish, with no fixed cap (FR-86).
- FR-25: **Session size** comes from the profile setting (5–20, default 10) and is capped by the size of the
  set.
- FR-26: Card order is **shuffled every session** (Fisher-Yates). The same card never appears twice in a row
  across back-to-back sessions.
- FR-27: **Display:** landscape locked, immersive full screen, screen kept awake while a session runs.
  On web: the Fullscreen API starts on the user's gesture; if the window is in portrait, a "rotate device"
  hint is shown.
- FR-28: All images in a session are **preloaded** before it starts, so there is no flicker. The session
  starts within 500 ms of tapping "Start" for cached content.
- FR-29: A session ends with a short, joyful end card (e.g. a big smile or star). There is no score.
- FR-30: Pause / exit is a long-press (≥1 s) in a corner, so a child tapping at random doesn't trigger it.
- FR-31: A session counts as **completed** when at least 80% of its cards were shown.

### 4.7 Program & Scheduling (Guided)
- FR-32: Each child profile has a **Program** with up to **5 active sets** at once (setting; default 3).
- FR-33: Each active set is scheduled **3 sessions per day** for **N days** (N set per profile, default 5,
  range 1–10).
- FR-34: When a set has been active for N days, the **whole set retires** and the next unseen cards from the
  same pack/deck form a new set. When a pack runs out of cards, the parent is asked to pick another pack.
- FR-35: The **Today** screen shows each active set's sessions for the day (done / remaining). Parents can
  start any session at any time; the scheduler is a guide, not a lock.
- FR-36: **Local reminders** (native only) at times the parent sets (default 9:00, 13:00, 17:00). They can be
  turned off.
- FR-37: **Magnitude progression:** when a retired card appears again in a later cycle (parent re-activates a
  pack, or "Review retired"), its fact level goes up by one (max 3).
- FR-38: Missed days don't count toward N. A set retires after N *active* days (days with ≥1 completed
  session). Parents can also retire a set early or extend it by hand.
- FR-39: **Retired library:** the parent can browse retired sets and start review sessions.

### 4.8 Profiles, Progress & Accounts
- FR-40: **Multiple child profiles** with a nickname, an avatar (picked from built-in icons) and an optional
  birth month/year. No photos of children and no full names.
- FR-41: Each profile has its own settings: name display mode, fact caption, session size, speed, audio
  on/off, read-aloud switches for cards and books (FR-83), N days, max active sets, reminder times.
- FR-42: **Progress tracking:** a session log (timestamp, set, cards shown, completed flag), daily completion
  and **streaks** (consecutive days with ≥1 completed session). There is no quizzing or accuracy measure.
- FR-43: **Accounts are optional.** Email/password signup with email verification and password reset.
  An account is required for cloud sync and sharing.
- FR-44: **Cloud sync** (when signed in) covers profiles, settings, program state, session logs, custom cards
  and decks, and voice recordings. Sync is two-way, offline-first, and resolves conflicts per record with
  last-write-wins by `updatedAt` plus tombstones for deletes.
- FR-45: Data created before signing in is uploaded and merged when the parent first signs in.
- FR-46: Account deletion removes all server data within 30 days (and immediately from active tables).
  There is also data export as a ZIP of JSON + media.

### 4.9 Sharing (Private Links)
- FR-47: A signed-in parent can share a **Custom Deck** (own-photo cards and/or references to official cards)
  through a **private invite link / 8-character code**.
- FR-48: People who receive it must sign in to import. Importing copies the deck into their library; later
  changes by the sharer don't spread automatically. Voice recordings are included only if the sharer opted
  in.
- FR-49: The sharer can **revoke** a link. Links can optionally expire (7 / 30 days / never).
- FR-50: There is **no public gallery**. Every shared deck has a **Report** button. Admins can review
  reports and take content down in the CMS. Taken-down decks become unavailable to import, and a takedown
  notice appears for people who already imported them.

### 4.10 Parental Gate
- FR-51: All parent areas (settings, catalog, card creation, recording, sharing, account, credits) are
  behind a **4-digit parent PIN**, which is set during onboarding.
- FR-52: The PIN is stored as a salted hash in secure storage. After 5 failed attempts there is a 60 s
  lockout. The PIN can be reset by signing in to the account, or, without an account, by answering an
  arithmetic challenge and confirming.
- FR-53: The child-facing area (profile picker → Today → session) needs no PIN.

### 4.11 Admin CMS
- FR-54: Admin roles: `editor` (create/edit drafts) and `publisher` (publish, moderate).
- FR-55: Editors manage categories, packs and cards: upload an image (the server makes renditions), enter
  name, facts L1–L3, attribution and license.
- FR-56: Packs move through `draft → review → published → archived`. Publishing bumps the pack version.
- FR-57: Validation checks: ≥20 cards per pack, attribution complete, image ≥1600 px on the long edge, a
  name on every card, at least 1 L1 fact for official cards.
- FR-58: There is a moderation queue for reported shared decks (view, dismiss, take down, ban user).
- FR-59: Editors also manage **official books**: pages, text, illustrations with attribution, stage and
  category. Books follow the same `draft → review → published → archived` workflow and are validated
  against the stage rules (FR-63).

### 4.12 Doman-Style Books (Reading Program)

#### Content sources
- FR-60: **Official books** are downloadable from the catalog (offline like packs), grouped by category and
  stage. v1 launch catalog: ≥5 books for each of Nature & Science and Everyday Objects.
- FR-61: **Homemade books:** parents write books about the child's own life (family, pets, daily routines,
  outings), with their own photos or drawings. Starter templates are included, e.g. "All About Me",
  "My Family", "At the Park" and "My Day". Template text uses the child's nickname as a placeholder.
- FR-62: **Generate a book from a pack or deck.** Parents choose cards, and the app writes one text page per
  card from its name plus its Level 1 fact (e.g. "This is a bald eagle." / "The bald eagle lives in North
  America."). The card image becomes the illustration page. Parents can edit the result before saving.

#### Book format & stages
- FR-63: Every book has a **stage (1–4)**:

  | Stage | Text colour | Min. letter height (x-height, % of page height) | Max words / page | Max pages |
  |---|---|---|---|---|
  | 1 | Red #D0021B | 15% | 5 | 12 |
  | 2 | Red #D0021B | 10% | 10 | 16 |
  | 3 | Black | 6% | 20 | 24 |
  | 4 | Black | 4% | 40 | 32 |

  The editor warns (homemade) or blocks (official) when a page breaks its stage's limits.
- FR-64: Text is lowercase except for proper nouns and the start of sentences. It uses a clean sans-serif
  font with generous letter and line spacing, centered on a white page. The reader auto-fits text, never
  going below the stage's minimum size.
- FR-65: **Layout mode** can be set per book and per child profile:
  - `text-then-picture` (default): the text page, then its illustration as a separate page.
  - `text-only`: illustrations hidden.
  - `side-by-side`: text and picture on the same spread (for older or more advanced readers).
- FR-66: Each book has a cover page (title in stage typography) and an optional "The End" page.

#### Reading experience
- FR-67: The **reader** opens fullscreen in landscape with the screen kept awake, using the same white
  canvas as sessions. It is **parent-paced by default** (tap / swipe / arrow keys), with optional
  auto-advance (2–10 s per page, default 4 s).
- FR-68: **Parent voice recording per page** reuses the recording tools from §4.5, including bulk record
  mode across all pages of a book. When recordings exist, they play as each text page appears. Other pages use the device voice (§4.13).
- FR-69: Optional **word highlighting**: during playback or manual reading, the parent can tap a word to
  highlight it. Timed highlighting synced to parent recordings is out of scope for v1. The device voice highlights words as it reads (FR-89).
- FR-70: Leaving and closing works as in sessions (long-press corner). The reader remembers the last page,
  and the next reading starts from the cover.

#### Program integration
- FR-71: A book can be added to a child's Program as an **active book** alongside active card sets. It is
  read **2× a day for N days** by default (defaults 2 and 5; set per profile). After that it retires to the
  child's **Bookshelf**, where it can always be reread.
- FR-72: The Today screen lists the day's readings for active books next to card sessions. A reading counts
  as completed when ≥80% of its pages were shown.
- FR-73: Reading logs go into the session log (type `reading`) and count toward streaks.

#### Vocabulary
- FR-74: The app works out each book's **vocabulary** automatically (tokenize, lowercase, strip
  punctuation). Each child profile has a **known words** list. Parents add to it by hand, or with one tap
  "mark this book's words as known" once the book retires.
- FR-75: Book detail shows **readiness**: the % of the book's words that are already known for the selected
  child, with new words listed. This is only information for the parent and never blocks reading (no
  testing of the child).

#### Print, share & privacy
- FR-76: **Print / Export PDF** of any book (`expo-print` on native, browser print on web). Pages are laid out
  for A4/Letter landscape and keep the stage typography and the text-then-picture order.
- FR-77: Homemade and generated books can be **shared by private link/code** under the same rules as custom
  decks (§4.9: sign-in to import, revoke, expiry, report, admin takedown). Voice recordings are only
  included if the parent opts in.
- FR-78: Homemade book photos may show the child, so they are **private by default**. They stay on the
  device unless sync is on, are stored encrypted at rest on the server, are only served through signed
  URLs, and are never used in catalog or analytics. Before a book with own photos is shared, a confirmation
  warns that the photos will be visible to recipients.

### 4.13 Read Aloud (Device Voice)
Card names and book pages are read aloud by the device's built-in text-to-speech, so content has a voice
before a parent has recorded anything.

#### Voice and source
- FR-79: **Engine:** device text-to-speech through `expo-speech` on every platform. No server generates or
  stores speech, and no audio is downloaded.
- FR-80: **Offline and privacy:** only voices that run on the device may be used, so reading works with no
  network and text never leaves the device (NFR-1, NFR-7). On web this means `localService` voices only. On
  native, the M4.6 platform check sets the rule. If a device has no eligible voice, content stays silent and
  the child's settings show that no voice is available.
- FR-81: **One voice:** the best installed English voice at normal speed, chosen per device and not synced.
  Parents cannot change the voice or the speed in v1, and there are no pronunciation overrides.
- FR-82: **Source order** for each card name or book page:
  1. The parent's recording, if one exists and `audio` is on.
  2. The device voice, if the child's switch for cards or books is on and the item is not silenced (FR-84).
  3. Otherwise, silence.

#### Settings
- FR-83: Each child has separate **Read cards aloud** and **Read books aloud** switches, both on by default,
  including for profiles created before this feature. The existing `audio` setting controls parent
  recordings only.
- FR-84: Parent-created cards and homemade or generated books are read aloud like official content. Their
  editors have a **Read aloud** switch (default on) that silences the device voice for that card or whole
  book. It does not silence parent recordings. Official content has no such switch.

#### Cards
- FR-85: Only the card's **name** is read, never its facts. Reading starts when the card appears, including
  in `hidden` name mode. In `after` name mode it starts when the name appears.
- FR-86: Auto-advance waits for **both** the speed setting and the end of speech, with no fixed cap, so at
  fast speeds a card can stay longer than the setting. A safety timeout (§9.5) applies only if the voice
  fails to report that it finished. Manual advance stops speech at once.

#### Books
- FR-87: When a page with text opens (`text` and `spread` pages), its text is read automatically, and a
  **replay** button reads it again. The cover reads the title. `picture` and `end` pages are silent.
- FR-88: Reading never turns the page, and the reader stays parent-paced by default. Turning a page stops
  speech. If `pageAutoAdvanceSeconds` is set, its timer starts when speech ends.
- FR-89: **Word highlighting:** each word is highlighted as it is spoken, driven by the voice's word-boundary
  events. Where those events are missing, the page is read without highlighting; timing is never estimated.
  This is separate from tap-to-highlight (FR-69), and both can show at once.

#### Interruptions
- FR-90: Pausing a session or the reader stops speech. Resuming restarts the current name or page from its
  beginning, on every platform, because Android has no speech pause. Leaving the screen stops speech.

---

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Offline:** every child-facing feature and all parent features except catalog, sync, sharing and account work with no network. |
| NFR-2 | **Performance:** a card transition never drops below 55 fps on mid-range devices (e.g. Pixel 6a, iPhone 11). Cold start under 2.5 s. |
| NFR-3 | **Image renditions:** the server provides 1024, 2048 and 3072 px WebP (plus JPEG fallback). The client downloads the size that fits its screen class. |
| NFR-4 | **Storage:** a 20-card pack should be ≤15 MB at the 2048 rendition. The app shows storage used per pack. |
| NFR-5 | **Accessibility (parent screens):** screen reader labels, dynamic type, ≥4.5:1 contrast, colour-blind-safe status indicators. The flashing screen is intentionally simple and skips these where they would conflict with the method. |
| NFR-6 | **Security:** HTTPS only, argon2id hashes, refresh token rotation with reuse detection, signed short-lived S3 URLs for private media, rate limits on auth and share-code endpoints. |
| NFR-7 | **Privacy (COPPA / GDPR-K):** no analytics, ads or third-party tracking SDKs in the child area. No child PII beyond a nickname and optional birth month/year. Crash reporting (e.g. Sentry) only with PII scrubbing and only for parent-initiated errors. A privacy policy must be published before release. |
| NFR-8 | **App store kids' rules:** comply with the Apple Kids Category and Google Families policies (parental gate before any external link or purchase, no behavioural ads). |
| NFR-9 | **i18n-ready:** all UI strings in resource files. Card names and facts stored as localized maps (`{ "en": "..." }`). |
| NFR-10 | **Web:** a PWA that can be installed; content is cached for offline use with a service worker plus IndexedDB. |

---

## 6. Data Model

### 6.1 Shared entities (client SQLite + server Postgres)

```ts
type ID = string;            // UUID v7
type Localized = Record<string, string>; // { en: "Bald Eagle" }

interface Category {
  id: ID;
  slug: "nature-science" | "everyday-objects" | string;
  name: Localized;
  subcategories: { slug: string; name: Localized }[]; // animals, birds, tools, vehicles...
}

interface Pack {
  id: ID;
  categoryId: ID;
  subcategory: string;
  title: Localized;
  description: Localized;
  coverCardId: ID;
  version: number;
  status: "draft" | "review" | "published" | "archived";
  cardIds: ID[];             // ordered, length >= 20
  publishedAt?: string;
}

interface Card {
  id: ID;
  source: "official" | "user";
  ownerUserId?: ID;          // for source=user
  name: Localized;
  facts: { level: 1 | 2 | 3; text: Localized }[];
  image: {
    renditions: { size: 1024 | 2048 | 3072; url: string; format: "webp" | "jpeg" }[];
    localPath?: string;      // client only
    width: number; height: number;
  };
  attribution?: {            // required for official
    author: string; sourceUrl: string; license: string; licenseUrl: string;
  };
  updatedAt: string; deletedAt?: string;
}

interface VoiceRecording {
  id: ID;
  cardId: ID;
  ownerUserId?: ID;          // null when local-only
  kind: "name" | "fact";
  factLevel?: 1 | 2 | 3;
  uri: string; durationMs: number; mime: string;
  updatedAt: string; deletedAt?: string;
}

interface CustomDeck {
  id: ID;
  ownerUserId?: ID;
  title: string;
  cardIds: ID[];             // may mix official + user cards
  updatedAt: string; deletedAt?: string;
}
```

### 6.2 Child / program entities

```ts
interface ChildProfile {
  id: ID;
  ownerUserId?: ID;
  nickname: string;
  avatar: string;            // built-in icon key
  birthMonth?: string;       // "YYYY-MM"
  settings: {
    nameDisplay: "hidden" | "below" | "after";
    factCaption: boolean;
    sessionSize: number;     // 5..20, default 10
    secondsPerCard: number;  // 0.5..30, default 10
    audio: boolean;          // parent recordings
    readAloudCards: boolean; // device voice for cards, default true
    readAloudBooks: boolean; // device voice for books, default true
    daysPerSet: number;      // N, 1..10, default 5
    sessionsPerDay: number;  // default 3
    maxActiveSets: number;   // 1..5, default 3
    reminderTimes: string[]; // ["09:00","13:00","17:00"]
  };
  updatedAt: string; deletedAt?: string;
}

interface ActiveSet {
  id: ID;
  childId: ID;
  sourceType: "pack" | "deck";
  sourceId: ID;
  cardIds: ID[];
  startedOn: string;         // date
  activeDays: string[];      // dates with >=1 completed session
  status: "active" | "retired";
  retiredOn?: string;
  updatedAt: string;
}

interface CardProgress {      // per child per card
  childId: ID; cardId: ID;
  cycles: number;            // times the card has been through a full set lifetime
  factLevel: 1 | 2 | 3;
  lastShownAt?: string;
}

interface SessionLog {
  id: ID;
  childId: ID;
  type: "flash" | "reading";
  setId?: ID;                // type=flash
  activeBookId?: ID;         // type=reading
  startedAt: string; endedAt: string;
  cardIdsShown?: ID[];
  pagesShown?: number;
  completed: boolean;
}
```

### 6.3 Book entities

```ts
interface Book {
  id: ID;
  source: "official" | "homemade" | "generated";
  ownerUserId?: ID;          // homemade / generated
  categoryId?: ID;
  title: Localized;
  stage: 1 | 2 | 3 | 4;
  layout: "text-then-picture" | "text-only" | "side-by-side";
  coverImage?: BookImage;
  pages: BookPage[];         // ordered
  vocabulary: string[];      // derived, normalized lowercase unique words
  generatedFrom?: { sourceType: "pack" | "deck"; sourceId: ID; cardIds: ID[] };
  templateKey?: string;      // e.g. "all-about-me"
  version: number;           // official only
  status?: "draft" | "review" | "published" | "archived"; // official only
  containsPrivatePhotos: boolean;
  updatedAt: string; deletedAt?: string;
}

interface BookPage {
  id: ID;
  text: Localized;
  image?: BookImage;
  cardId?: ID;               // when generated from a card (reuses its image/attribution)
  voiceRecordingId?: ID;     // VoiceRecording with kind "page"
}

interface BookImage {
  renditions: { size: 1024 | 2048 | 3072; url: string; format: "webp" | "jpeg" }[];
  localPath?: string;
  attribution?: Card["attribution"];   // required for official
}

interface ActiveBook {
  id: ID;
  childId: ID; bookId: ID;
  startedOn: string;
  activeDays: string[];
  status: "active" | "retired";
  retiredOn?: string;
  updatedAt: string;
}

interface KnownWord {         // per child
  childId: ID;
  word: string;              // normalized lowercase
  addedAt: string;
  source: "manual" | "book";
  bookId?: ID;
}
```

`VoiceRecording.kind` is extended to `"name" | "fact" | "page"` (with `pageId`). `ChildProfile.settings`
gains `bookLayout`, `readingsPerDay` (default 2), `daysPerBook` (default 5), `maxActiveBooks` (default 2),
and `pageAutoAdvanceSeconds` (null = manual, 2–10). User `Card`s and homemade or generated `Book`s gain
`readAloud?: boolean` (absent means on; FR-84).

### 6.4 Server-only entities
`User` (email, passwordHash, emailVerifiedAt, role: `parent|editor|publisher`), `RefreshToken`,
`ShareLink` (code, type: deck|book, snapshotId, includeAudio, expiresAt, revokedAt), `DeckSnapshot`,
`BookSnapshot`,
`Report` (shareLinkId, reason, status), `AuditLog`.

---

## 7. API Contract (REST, `/v1`)

All bodies are JSON and validated with zod schemas shared from `/packages/shared`. The OpenAPI spec is
published at `/v1/openapi.json`.

### 7.1 Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | email, password → sends verification |
| POST | `/auth/verify-email` | token |
| POST | `/auth/login` | → access + refresh |
| POST | `/auth/refresh` | rotate refresh token |
| POST | `/auth/logout` | revoke refresh token |
| POST | `/auth/password/forgot` / `/auth/password/reset` | |
| DELETE | `/me` | account deletion |
| GET | `/me/export` | ZIP export |

### 7.2 Catalog (public, cacheable)
| Method | Path | Notes |
|---|---|---|
| GET | `/catalog/categories` | |
| GET | `/catalog/packs?category=&subcategory=&cursor=` | published only |
| GET | `/catalog/packs/:id` | metadata + version |
| GET | `/catalog/packs/:id/manifest?v=` | all cards + rendition URLs + attribution + checksums |
| GET | `/catalog/books?category=&stage=&cursor=` | published official books |
| GET | `/catalog/books/:id` | metadata + version |
| GET | `/catalog/books/:id/manifest?v=` | pages + image renditions + attribution + checksums |

### 7.3 Sync (auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/sync/pull?since=<cursor>` | changed records of all syncable types since cursor |
| POST | `/sync/push` | batch upsert/tombstones; server returns accepted + conflicts |
| POST | `/media/upload-url` | pre-signed PUT for images/audio |
| GET | `/media/:id` | redirects to a signed GET URL |

### 7.4 Sharing (auth)
| Method | Path | Notes |
|---|---|---|
| POST | `/shares` | `{ type: "deck" \| "book", id }`, includeAudio, expiresIn → code + link |
| GET | `/shares` | my shares |
| DELETE | `/shares/:code` | revoke |
| GET | `/shares/:code` | preview (title, card count, sharer display name) |
| POST | `/shares/:code/import` | copies the snapshot into the caller's library |
| POST | `/shares/:code/report` | reason |

### 7.5 Admin (role-based)
`/admin/categories`, `/admin/packs`, `/admin/cards`, `/admin/books`, `/admin/images` (upload → rendition
pipeline), `/admin/packs/:id/transition` and `/admin/books/:id/transition` (status changes),
`/admin/reports` (moderation queue), `/admin/users/:id/ban`.

Sync (§7.3) also covers `Book` (homemade/generated), `ActiveBook` and `KnownWord`.

---

## 8. Screens & Navigation (Expo Router)

```
app/
  _layout.tsx                 Redux Provider, theme, i18n, DB init
  index.tsx                   → onboarding or profile picker
  onboarding/                 welcome → set PIN → create first child → download first pack
  (child)/
    profiles.tsx              Profile picker (big avatars)
    [childId]/today.tsx       Today: active sets + session dots (done/remaining)
    [childId]/session/[setId].tsx   Fullscreen flashing screen
    [childId]/bookshelf.tsx   Child's active + retired books (big covers)
    [childId]/read/[bookId].tsx     Fullscreen book reader
  (parent)/                   PIN-gated group
    _layout.tsx               PIN gate
    catalog/index.tsx         Categories → packs
    catalog/[packId].tsx      Pack detail, preview, download/update/remove
    library/index.tsx         Downloaded packs, custom decks, my cards
    library/deck/[deckId].tsx Deck editor (add/reorder/remove cards)
    library/card/new.tsx      Create card (photo → crop → name → facts)
    library/card/[cardId].tsx Card detail: edit, facts, attribution, record voice
    record/[sourceId].tsx     Bulk voice recording mode (packs, decks, books)
    catalog/books/[bookId].tsx  Official book detail, preview, download
    books/index.tsx           My books (homemade, generated, downloaded)
    books/new.tsx             New book: blank / template / generate from pack or deck
    books/[bookId]/edit.tsx   Page editor (text, image, stage, layout; live stage-limit warnings)
    books/[bookId]/print.tsx  Print / export PDF preview
    children/[childId]/words.tsx    Known words list + readiness per book
    children/[childId].tsx    Child settings + program (active/retired sets, extend/retire)
    children/[childId]/history.tsx  Session log + streaks
    share/index.tsx           My shares (create/revoke)
    share/import.tsx          Enter code / open deep link
    account/                  Sign in / sign up / sync status / export / delete
    settings.tsx              PIN change, reminders, storage usage, credits & licenses, privacy policy
```
Deep links: `openbook://share/<code>` and `https://<domain>/s/<code>`.

---

## 9. Key Algorithms

### 9.1 Building a session
1. Load `ActiveSet.cardIds`; the size is `min(profile.sessionSize, set.length)`.
2. Fisher-Yates shuffle. If the first card matches the last card of the previous session, swap it with a
   random other card.
3. Preload images (and voice clips) for every card. Start only when they are all decoded.
4. For each card: show the image → (name, depending on `nameDisplay`) → play the voice clip or device voice
   → wait `max(secondsPerCard, min(clipDuration, 3s))` for a clip, or the §9.5 hold for the device voice, or
   for manual advance.

### 9.2 Day rollover & retirement (runs on app foreground and at local midnight)
```
for each active set:
  if today has >=1 completed session → add today to activeDays
  if activeDays.length >= profile.daysPerSet:
     retire set; for each card → CardProgress.cycles++, factLevel = min(3, cycles+1)
     create next set from the next unseen cards of the same source
     if source exhausted → flag "choose new pack" on Today screen
```

### 9.3 Books
- **Page sequence (text-then-picture):** `cover → [text₁, picture₁, text₂, picture₂, …] → the end`. Pages
  without an image are text pages only.
- **Text auto-fit:** binary-search the largest font size whose wrapped text fits 80% of the page width and
  70% of its height. Clamp to the stage's minimum x-height. If the text still doesn't fit at the minimum,
  the editor flags the page.
- **Vocabulary:** Unicode word segmentation (`Intl.Segmenter` with a regex fallback), lowercase, strip
  punctuation, de-duplicate. Recomputed on every save.
- **Generate from cards:** for each card, `text = "This is a {name}."`, plus a second text page with the
  L1 fact for stage ≥2. The stage defaults to 1 and the image comes from the card.
- **Day rollover:** like §9.2. An `ActiveBook` retires after `daysPerBook` active days, and the app then
  suggests the next book (same category/stage, highest readiness).

### 9.4 Sync
- Every syncable record has `updatedAt` (client clock, corrected by a server clock offset) and an optional
  `deletedAt`.
- Push uploads local changes in batches of 200 and media first (through pre-signed URLs).
  Pull uses a server cursor.
- Conflicts are resolved per record with last-write-wins. Arrays (e.g. `cardIds`) are replaced whole.
- Sync runs on sign-in, on app foreground, after local changes (debounced 10 s) and on manual refresh.

### 9.5 Read aloud
1. Pick the source using FR-82. Call `Speech.stop()` before every `speak()`, because `speak()` otherwise
   queues behind any speech still playing.
2. Give each utterance a token, and ignore callbacks from any token that is no longer current.
3. **Card hold:** advance once `secondsPerCard` has elapsed and speech has ended.
4. **Safety timeout:** `speechSafetyMs(text) = 2000 + 200 × text.length` ms, started at `speak()`. If no
   `onDone`, `onStopped` or `onError` arrives by then, treat speech as finished. It is far longer than normal
   speech, so it only acts on a failure. `onError` is not documented for web, so the timeout is what protects
   web sessions from hanging.
5. **Highlighting:** map each `onBoundary` `charIndex` to a word index using the same segmentation as
   `tokenize`, and clear the highlight when speech ends.

---

## 10. Visual Design

- **Flashing screen:** a #FFFFFF background. The image is centered and fills the safe area at its own aspect
  ratio (`contain`). The name is in red #D0021B, bold, sans-serif (system font or Inter). The fact caption is
  12–14 pt grey (#9B9B9B) in the bottom-right corner.
- **Transitions:** ≤150 ms crossfade. No other animation on the flashing screen.
- **Child area:** large touch targets (≥64 pt), little text, and big friendly avatars.
- **Parent area:** a calm, standard UI that follows the system light/dark theme.
- **End-of-session card:** one simple, cheerful illustration lasting about 1.5 s, then back to Today.
- **Book reader:** the same white canvas. Stage 1–2 text in red #D0021B and stage 3–4 in black #111111.
  Pages turn with a gentle horizontal slide or crossfade (≤200 ms). A small, faint page indicator is shown
  for the parent only.

---

## 11. Testing Strategy

| Layer | Tooling | Scope |
|---|---|---|
| Unit | Jest | Scheduler and retirement rules, shuffle, sync merge, reducers / RTK slices, book page sequencing, text auto-fit, vocabulary extraction, stage validation, read-aloud source selection, safety timeout, word-index mapping |
| Component | React Native Testing Library | Session screen behaviour (advance, name modes, caption, speech holds with a fake speech engine), PIN gate, card editor |
| E2E native | Maestro | Onboarding → download pack → run session; record voice; create card; share/import; create a book from a template → read → print |
| E2E web | Playwright | Same critical flows on web, plus offline mode via service worker |
| API | Jest + Supertest + Testcontainers (Postgres, MinIO) | Auth, catalog, sync, sharing, admin permissions |
| Contract | OpenAPI schema diff in CI | Client types generated from the spec; CI fails on drift |
| Performance | Manual + Flashlight (Android) | 55+ fps transitions on reference devices |

CI (GitHub Actions) runs lint, typecheck, unit and component tests, API tests and web E2E on every PR.
EAS builds and Maestro run nightly.

---

## 12. Milestones

### M0: Foundations
Monorepo, Expo app shell on all 3 platforms, NestJS API skeleton, Postgres/Prisma, MinIO, CI.
**Done when:** the app boots on iOS, Android and Web, and the API health check passes in CI.

### M1: Catalog & Offline Packs
CMS for creating and publishing packs; public catalog endpoints; pack download/update/remove; local DB and
media store.
**Done when:** an editor publishes a 20-card pack, and the app downloads it and shows it in airplane mode.

### M2: Session Mode
Fullscreen flashing screen, auto/manual advance, shuffle, name display modes, fact caption, preloading,
end card.
**Done when:** a 10-card session runs at 1 s/card without flicker on the reference devices and on web.

### M3: Profiles, Program & Scheduler
Child profiles and settings, active sets, the Today screen, 3×/day × N days with whole-set retirement,
retired library, magnitude progression, local reminders, PIN gate, session log and streaks.
**Done when:** a simulated 6-day timeline (unit + E2E with a mocked clock) retires a set and activates the next.

### M4: Parent Cards & Voice
Own-photo card creation, custom decks, voice recording (per card and bulk) and playback in sessions.
**Done when:** a parent creates a 5-card deck with voice clips and runs it offline.

### M4.5: Doman-Style Books
Book data model, reader (text-then-picture, stages, auto-fit), homemade book editor + templates, generating
books from packs/decks, page voice recording, active books in the Program, Bookshelf, known words and
readiness, print/export PDF, official books in the CMS and catalog.
**Done when:** a parent creates "All About Me" (stage 1), records each page, adds it to a child's Program,
reads it 2× a day for 5 simulated days until it retires to the Bookshelf, and prints it to PDF.
Generating a book from a 10-card set gives 10 editable text+picture pairs.

### M4.6: Read Aloud
Device-voice reading of card names and book pages (§4.13). It does not depend on parent recording, which is
still unbuilt; the playback layer leaves a place for it so FR-82 needs no redesign. Cards ship first, then
books, each on iOS, Android and Web together.

**Step 0: Platform check (before feature work).** Add `expo-speech` with `npx expo install` and test on iOS,
Android, desktop Chrome and Safari. Record the results here, since they settle the items below:
- Which voices work with the network off. `expo-speech` reports no local/remote flag on native, so Android
  needs its own rule (FR-80).
- Time from `speak()` to first sound on the reference devices, which sets the AC-16 target.
- Whether word-boundary events fire for the chosen voice on each platform (FR-89).
- Physical iPhones in silent mode: Expo documents no sound. Confirm whether that can be overridden; if not,
  add a hint to the child's settings.
- Whether web browsers allow speech on later cards and pages, after the one tap that started the session.
- Whether `onDone` fires reliably, including for the longest book page allowed.

**Step 1: Shared logic and settings** (`packages/shared`). Add `readAloudCards` and `readAloudBooks` to
`ChildSettings` and its defaults; `readAloud` to `Card` and `Book`; and pure functions for FR-82 source
selection, `speechSafetyMs` and `wordIndexAt`, with unit tests. Merge stored settings over the defaults when
loading a child in `apps/mobile/src/lib/repo.ts`, since settings are stored as JSON and existing profiles
will not have the new fields.

**Step 2: Narrator** (`apps/mobile/src/features/narration/`). One interface over `expo-speech`: `speak`,
`stop`, voice selection, utterance tokens and the safety timeout, with the parent-recording branch stubbed.

**Step 3: Cards (first release).** Speak on card and name beat in
`apps/mobile/src/app/(child)/[childId]/session/[setId].tsx`, replace the fixed auto-advance timer with the
§9.5 hold, and stop speech on advance, pause and exit. Add the two switches to the child settings screen, the
per-card switch to `(parent)/library/card/[cardId].tsx`, and strings to `apps/mobile/src/i18n/en.ts`.

**Step 4: Book reading.** In `(child)/[childId]/read/[bookId].tsx`, read text pages and the cover title, add
the replay button, start any page auto-advance timer after speech ends, and stop speech on page turn. Add the
per-book switch to `(parent)/books/[bookId]/edit.tsx`.

**Step 5: Word highlighting.** Render the spoken word in `apps/mobile/src/components/BookPage.tsx` from
boundary events, with the no-event fallback. It is the last step so that platform problems cannot hold up
reading itself.

**Step 6: Verification.** Component and E2E tests against a fake speech engine, because CI has no real
voices, then a manual pass of the acceptance criteria on the Step 0 device list.

**Done when:** in airplane mode on iOS, Android and Web, a card session reads each name and never cuts one
off, and a homemade book reads each page aloud with replay, highlighting where the platform supports it, and
AC-15 to AC-22 pass.

### M5: Accounts & Sync
Email/password auth, two-way sync incl. media, merging data from before sign-in, export, account deletion.
**Done when:** a change made offline on device A shows up on device B after reconnecting. Deletion purges
the data.

### M6: Sharing & Moderation
Private share links/codes, import, revoke/expiry, report flow, CMS moderation queue.
**Done when:** parent A shares, parent B imports, A revokes, new imports fail, and an admin takedown works.

### M7: Hardening & Release
Accessibility pass, privacy policy, store compliance (Kids / Families), performance tuning, PWA, store
listings.
**Done when:** store review submission is ready; there are no P1 bugs.

---

## 13. Acceptance Criteria (selected)

- AC-1: With the device offline, a parent can start and finish a session for any downloaded pack or custom deck.
- AC-2: At 1 s/card with read-aloud off, the measured time between cards stays within ±50 ms of the setting.
- AC-3: Changing `nameDisplay` takes effect in the next session with no restart.
- AC-4: After N active days, the set appears under Retired and a new set of the configured size is active.
- AC-5: A voice recording plays within 100 ms of its card appearing.
- AC-6: No parent screen opens without the correct PIN. 5 failures trigger a 60 s lockout.
- AC-7: No network requests to third-party analytics or ad domains (checked with a network proxy in E2E).
- AC-8: Every official card shows full attribution in the Credits screen.
- AC-9: A revoked share code returns 404/410, and the app shows a friendly message.
- AC-10: In `text-then-picture` mode, a text page is never on screen together with its illustration.
- AC-11: No rendered book text falls below its stage's minimum x-height on any supported screen size.
- AC-12: A book's vocabulary and readiness % update straight after its text is edited.
- AC-13: The exported PDF keeps the page order, stage colour and stage text size.
- AC-14: Homemade-book photos are never requested from a public (unsigned) URL.
- AC-15: With the network off, cards and books are read aloud, and reading makes no network requests.
- AC-16: The device voice starts within 500 ms of a card appearing on the reference devices (a provisional
  target, to be confirmed by the M4.6 platform check).
- AC-17: At 0.5 s/card, no card advances before its name has finished being spoken. If the voice never
  reports finishing, the session still moves on when the safety timeout expires.
- AC-18: A card or page with a parent recording plays only the recording while `audio` is on.
- AC-19: Turning off Read aloud on a parent-created card or book silences only that item's device voice.
- AC-20: The card and book switches work independently, and profiles created before this feature have both on.
- AC-21: Manual advance or a page turn stops speech at once, and speech never overlaps or queues.
- AC-22: Where word-boundary events exist, the highlighted word matches the spoken word. Where they do not,
  the page is read with no highlighting.

---

## 14. Open Questions

1. Final app name and domain (`openbook` is a working title).
2. Hosting provider for the API, DB and object storage (AWS vs. Cloudflare R2 + Fly/Render).
3. Who writes and fact-checks the official facts for L1–L3 (in-house vs. contractors)?
4. Should official recorded narration be added later to replace the device voice (§4.13) when there is no
   parent voice?
5. Should later versions add Art & History and Geography & Culture packs?
6. Should the other earlier steps of the reading program (single-word cards → couplets → phrases →
   sentences) be added as card types, so that known words fill in automatically?
7. Should Doman-style math (dot cards) be planned as a later module of the same app?
