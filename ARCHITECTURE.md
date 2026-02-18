# Architecture

Technical deep-dive into the design decisions, data flows, and system internals of Infinite Notes. Written to convey the level of engineering rigor behind what looks like a simple notes app.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Project Structure](#project-structure)
3. [Auth System](#auth-system)
4. [Local-First Sync Engine](#local-first-sync-engine)
5. [Realtime Subscriptions](#realtime-subscriptions)
6. [CRDT Collaborative Editing](#crdt-collaborative-editing)
7. [Service Worker Lifecycle](#service-worker-lifecycle)
8. [Database Schema Design](#database-schema-design)
9. [Security Considerations](#security-considerations)
10. [Demo Mode Architecture](#demo-mode-architecture)

---

## System Overview

Infinite Notes is a local-first PWA. "Local-first" means the client database (IndexedDB via Dexie.js) is the primary source of truth for the application's UI. The remote database (Supabase Postgres) is a sync target, not a required dependency for reads or writes.

```
┌───────────────────────────────────────────────────────────────┐
│                        Browser (Client)                       │
│                                                               │
│  ┌─────────────────┐    ┌─────────────────────────────────┐   │
│  │   SvelteKit UI  │◄──►│         stellar-drive engine    │   │
│  │  (Svelte 5)     │    │                                 │   │
│  │                 │    │  ┌──────────┐  ┌─────────────┐  │   │
│  │  +layout.svelte │    │  │  Auth    │  │  Sync       │  │   │
│  │  +page.svelte   │    │  │  system  │  │  engine     │  │   │
│  │  +layout.ts     │    │  └──────────┘  └──────┬──────┘  │   │
│  └────────┬────────┘    │                       │         │   │
│           │             │  ┌────────────────────▼──────┐  │   │
│           └────────────►│  │    Dexie.js / IndexedDB   │  │   │
│                         │  │    (local database)       │  │   │
│                         │  └────────────────────┬──────┘  │   │
│                         └───────────────────────┼─────────┘   │
│                                                 │             │
│  ┌────────────────────────────────────────────┐ │             │
│  │         Service Worker (sw.js)             │ │             │
│  │  - Asset caching                           │ │             │
│  │  - Offline fallback                        │ │             │
│  │  - Background precaching                   │ │             │
│  └────────────────────────────────────────────┘ │             │
└────────────────────────────────────────────────┼─────────────┘
                                                  │ (online only)
                                   ┌──────────────▼──────────────┐
                                   │         Supabase            │
                                   │                             │
                                   │  ┌──────────┐ ┌──────────┐  │
                                   │  │  Auth    │ │ Realtime │  │
                                   │  └──────────┘ └──────────┘  │
                                   │  ┌──────────────────────┐   │
                                   │  │  Postgres (RLS)      │   │
                                   │  └──────────────────────┘   │
                                   └─────────────────────────────┘
```

### Key design principles

**Writes never block on the network.** Every write goes to IndexedDB first and resolves immediately. Supabase sync is asynchronous and best-effort. The UI responds at memory speed.

**Reads never need the network after first load.** Once the service worker has precached all chunks and the sync engine has pulled the latest data, the app functions completely offline — including auth (PIN hash is stored in IndexedDB).

**Conflicts are resolved deterministically.** The sync engine uses a three-tier conflict resolution strategy (timestamp, field-level merge, CRDT) that produces the same result regardless of sync order.

---

## Project Structure

```
src/
  routes/
    +layout.svelte         # App shell — auth hydration, SW update prompt
    +layout.ts             # Engine bootstrap, auth guard, redirect logic
    +page.svelte           # Home page (authenticated)
    +error.svelte          # Error boundary
    [...]catchall/         # Catch-all route for 404 handling
    api/
      config/+server.ts    # GET /api/config — serves runtime Supabase config
      setup/
        validate/          # POST /api/setup/validate — test Supabase credentials
        deploy/            # POST /api/setup/deploy — set Vercel env vars + redeploy
    login/+page.svelte     # PIN auth: setup / unlock / link-device flows
    setup/+page.svelte     # First-time Supabase config wizard (5 steps)
    setup/+page.ts         # Access guard: first-time vs authenticated
    confirm/+page.svelte   # Email confirmation landing (OTP callback)
    demo/+page.svelte      # Demo mode landing
    profile/+page.svelte   # User profile, sign-out
    policy/+page.svelte    # Privacy policy / terms
  lib/
    schema.ts              # Schema definition (single source of truth)
    types.ts               # App type definitions and narrowings
    types.generated.ts     # Auto-generated entity types (do not edit)
    components/
      UpdatePrompt.svelte  # Service worker update notification
    demo/
      config.ts            # Demo config (mock profile)
      mockData.ts          # Demo seed data
static/
  sw.js                    # Service worker (generated by stellarPWA plugin)
  manifest.json            # PWA manifest
  offline.html             # Offline fallback page
  icons/                   # App icons (192px, 512px)
  *.html                   # Email templates (signup, device verification, etc.)
vite.config.ts             # Vite config: plugins, chunk splitting
svelte.config.js           # SvelteKit config: adapter, preprocessor
knip.json                  # Dead code detection config
```

---

## Auth System

The authentication system is one of the most technically interesting parts of the app. It has no passwords, works offline, and supports linking multiple trusted devices to a single account.

### Overview: single-user auth model

Unlike a traditional multi-user app, Infinite Notes uses a "single-user" auth model: one Supabase project = one user. There is no multi-tenant user table. The app is designed to be self-hosted, so you deploy your own Supabase project and it is exclusively yours.

### PIN-based authentication

The user sets a 6-digit PIN during first-time setup. This PIN is never stored in plaintext. Instead, the engine:

1. Generates a random salt (unique per device setup).
2. Applies PBKDF2 with a configured number of iterations (PIN padding/stretching) to derive a key from the PIN and salt.
3. Stores the derived hash + salt in IndexedDB (offline credentials).
4. Stores a separate Supabase session (anonymous auth) separately.

When the user enters their PIN to unlock:

1. The engine reads the stored salt from IndexedDB.
2. Derives the hash from the entered PIN + salt using the same PBKDF2 parameters.
3. Compares against the stored hash. The comparison is done locally — no network request is needed.
4. On match: the stored Supabase session is restored and the sync engine starts.
5. On mismatch: an error is returned. After N failed attempts the engine applies a rate-limit countdown.

**The PIN hash never leaves the device.** The hash stored in IndexedDB and the hash verified locally are the same value. Supabase never sees the PIN.

```
User enters PIN
      │
      ▼
Read salt from IndexedDB
      │
      ▼
PBKDF2(PIN, salt, iterations) → derived hash
      │
      ▼
Compare with stored hash
      │
   ┌──┴──┐
match    mismatch
  │          │
  ▼          ▼
Restore    Error + shake animation
Supabase   (rate-limit after N failures)
session
  │
  ▼
Start sync engine → navigate to app
```

### Device verification flow

When a user opens the app on a new device for the first time, their account already exists on Supabase (from the first device). The new device cannot simply accept the PIN — it needs to prove that the person entering the PIN has access to the registered email address.

The flow:

1. The new device calls `fetchRemoteGateConfig()` — this checks whether a user account exists in Supabase (the gate config endpoint stores minimal public account metadata).
2. If an account is found, the login page switches to "link device" mode, showing the remote user's name and a PIN entry form.
3. The user enters their PIN. The engine calls `linkSingleUserDevice(email, pin)`.
4. The engine sends a device verification email (OTP) to the registered email address via `sendDeviceVerification`.
5. A modal appears: "Check your email — we sent a verification link to x***@example.com".
6. Simultaneously, two polling mechanisms start:
   - **Polling**: `pollDeviceVerification()` runs every 3 seconds, checking whether the Supabase user has been flagged as verified.
   - **BroadcastChannel**: If the user opens the verification link in the same browser, the `/confirm` page sends an `AUTH_CONFIRMED` message to the login page via `BroadcastChannel('infinite-auth-channel')`. The login page responds immediately without waiting for the poll.
7. When either mechanism fires, `completeDeviceVerification()` finalizes the session. The device is now trusted and the full app opens.

```
New device                     Email                   Supabase
     │                           │                        │
     ├─ fetchRemoteGateConfig() ──────────────────────────►│
     │◄── { email, name, gateType } ──────────────────────┤
     │                           │                        │
     ├─ linkSingleUserDevice() ──────────────────────────►│
     │                           │◄── send OTP email ─────┤
     │                           │                        │
     │  (poll every 3s) ─────────────────────────────────►│ "verified?"
     │                           │                        │
     │                User clicks email link              │
     │                    /confirm page runs              │
     │◄── BroadcastChannel: AUTH_CONFIRMED ───────────────│
     │                           │                        │
     ├─ completeDeviceVerification() ────────────────────►│
     │◄── session ────────────────────────────────────────┤
     │                           │                        │
     Navigate to app             │                        │
```

### BroadcastChannel cross-tab communication

The `BroadcastChannel` API allows multiple tabs of the same origin to communicate without a server. This project uses it to handle the case where the user clicks the verification link in a new tab:

1. The login tab opens `BroadcastChannel('infinite-auth-channel')` and listens for messages.
2. The `/confirm` page (the OTP callback) posts `{ type: 'AUTH_CONFIRMED' }` to the same channel.
3. The login tab receives this message, calls `window.focus()` to bring itself to the foreground, and completes the verification.

This eliminates the need for the user to manually switch tabs and refresh.

### Multi-device trust model

Each trusted device gets its own entry in a `devices` table in Supabase (managed by the engine). A device is identified by a stable UUID stored in IndexedDB. When the sync engine starts, it checks whether the current device's UUID is in the trusted devices list. If not, it triggers the device verification flow before allowing data access.

Devices can be revoked: removing a device's UUID from the trusted list will cause that device to be kicked out on its next sync attempt. The `onAuthKicked` callback in `initEngine` handles this gracefully — it calls `lockSingleUser()` and redirects to `/login`.

### Auth state model

Auth state is an object store (`authState`) from `stellar-drive/stores` with the shape:

```ts
{
  mode: 'supabase' | 'offline' | 'demo' | 'none';
  session: Session | null;         // Supabase session
  offlineProfile: Profile | null;  // Cached offline profile
  isLoading: boolean;
  authKickedMessage: string | null;
}
```

The root layout load function (`+layout.ts`) calls `resolveRootLayout()`, which returns `{ authMode, session, offlineProfile, serverConfigured }`. The `$effect` in `+layout.svelte` calls `hydrateAuthState(data)` which updates the store. Components read the store reactively — they never call `resolveRootLayout()` themselves.

### Setup wizard (first-time configuration)

When no runtime config exists, the app redirects to `/setup` instead of `/login`. The setup wizard (`src/routes/setup/+page.svelte`) is a five-step guided process:

1. Create a Supabase project (instructions only).
2. Configure auth (enable anonymous sign-ins).
3. Initialize the database schema (SQL provided).
4. Enter and validate credentials (Supabase URL + publishable key) — calls `POST /api/setup/validate`.
5. Persist configuration — calls `POST /api/setup/deploy` with a Vercel API token, which sets the env vars (`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`) on the Vercel project and triggers a redeployment. The wizard then polls `navigator.serviceWorker.registration.update()` every 3 seconds until a new service worker version is detected in the waiting state, confirming the deploy succeeded.

### Email templates and multi-app Supabase

The engine's `name` and `domain` fields (set in `initEngine()`) are written to Supabase `user_metadata` as `app_name` and `app_domain`. Supabase email templates use `{{ .Data.app_domain }}` for confirmation links and `{{ .Data.app_name }}` for the app name. The `domain` is always `window.location.origin` at runtime, so no environment variable is needed. This allows Infinite Notes and Stellar Planner to share one Supabase project while each app's emails link to the correct domain. See [stellar-drive EMAIL_TEMPLATES.md](https://github.com/prabhask5/stellar-drive/blob/main/EMAIL_TEMPLATES.md) for full template setup instructions.

---

## Local-First Sync Engine

The sync engine is the heart of the local-first architecture. It manages the bidirectional flow of data between IndexedDB and Supabase, handles connectivity changes, and ensures consistency under partial failure.

### Outbox pattern

All writes follow the outbox pattern:

```
App writes record
       │
       ▼
Write to IndexedDB (immediate)
       │
       ▼
Append operation to outbox (IndexedDB table)
       │
   ┌───┴───────────────┐
   │ online?           │ offline?
   │                   │
   ▼                   ▼
Push to Supabase    Wait for connectivity
       │                   │
       ▼                   │
Remove from outbox◄─────────┘ (retry when online)
```

The outbox is an IndexedDB table that contains pending operations. Each operation is a record with the table name, record ID, operation type (upsert/delete), and a copy of the record data. When the device goes online, the engine drains the outbox by sending each operation to Supabase in order.

### Operation coalescing

If the same record is written multiple times while offline (e.g., autosave fires 10 times while the user types), the outbox does not accumulate 10 separate operations. Instead, the engine coalesces writes to the same record ID into a single upsert. This keeps the outbox small and avoids redundant network requests.

The coalescing logic uses the record's `_version` field: a write to a record replaces any existing outbox entry for the same `(table, id)` tuple if the new `_version` is higher.

### Conflict resolution

When a record modified locally is also modified on another device, the engine uses a three-tier resolution strategy:

**Tier 1: Timestamp comparison.** `updated_at` timestamps are compared. The record with the later timestamp wins for non-CRDT fields. This handles the common case where only one device modified the record.

**Tier 2: Field-level merge.** If both devices modified different fields of the same record (e.g., Device A changed `title`, Device B changed `pinned`), the engine merges at the field level rather than picking one record wholesale. Each field is compared individually using its `_version` number.

**Tier 3: CRDT merge.** For fields that store Yjs binary data (the note's content), conflicts are resolved by the Yjs merge algorithm. Yjs updates are commutative — applying A then B produces the same result as applying B then A. There is no "conflict" at the CRDT level.

### Sync cursor (incremental pulls)

The engine does not re-download all data on every sync. Instead, it tracks a sync cursor — the `updated_at` timestamp of the most recently seen record from Supabase. On each pull, it queries:

```sql
SELECT * FROM notes
WHERE updated_at > $cursor
  AND user_id = $userId
ORDER BY updated_at ASC
```

This means sync scales with the number of changes since the last pull, not the total data size. A user with 10,000 notes and no changes since the last sync does a near-zero-cost pull.

### Egress optimization (deduplicated pushes)

When pushing local changes to Supabase, the engine avoids sending records that Supabase already has (received via realtime and already merged). Before pushing an outbox entry, it checks whether the local record's `_version` matches the last-seen remote version for that record. If they match, the push is skipped.

### Connectivity handling

The engine subscribes to the browser's `online`/`offline` events. On going offline:
- Realtime subscriptions are closed (they will error anyway).
- The outbox continues to accumulate writes.
- The UI reflects offline status via the `isOnline` store.

On going online:
- The outbox is drained (push pending local changes).
- A pull is issued (fetch remote changes since last cursor).
- Realtime subscriptions are re-established.

---

## Realtime Subscriptions

### Supabase Postgres Changes

Supabase Realtime works by listening to Postgres's WAL (write-ahead log) and broadcasting row-level change events to subscribed clients over a WebSocket. The engine subscribes to each table in the schema and receives `INSERT`, `UPDATE`, and `DELETE` events in real time.

```ts
// Simplified — actual implementation is in stellar-drive
supabase
  .channel('db-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'notes',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    handleRemoteChange(payload);
  })
  .subscribe();
```

### Channel management

The engine creates one Supabase channel per subscribed table, grouped under a single multiplexed WebSocket connection. Channels are torn down on sign-out and re-established on sign-in. In demo mode, no channels are created — the channel setup is guarded by the `authMode !== 'demo'` check.

### Deferred changes (edit-in-progress guard)

A subtle problem: if the user is actively editing a note on Device A, and Device B syncs a change to the same note, the realtime update arriving on Device A might overwrite the user's in-progress edits.

The engine solves this with a deferred change queue. When a realtime update arrives for a record that the UI has flagged as "being edited", the engine queues the update rather than applying it immediately. When the edit concludes (the editor loses focus or the autosave completes), queued updates are replayed and merged.

For CRDT fields, this is handled by Yjs directly — the awareness protocol signals when another user's cursor is active, and Yjs merges updates at the character level regardless of timing.

---

## CRDT Collaborative Editing

### Yjs integration

Each note's content is stored as a Yjs `Y.Doc`. The note record in Dexie has a `content` field that stores the binary-encoded Yjs state vector — the complete document history in a compact form.

When a note is opened:
1. The engine loads the `content` bytes from IndexedDB.
2. A `Y.Doc` is created and the saved state is applied: `Y.applyUpdate(doc, content)`.
3. The editor mounts with the `Y.Text` as its data source.

When the user types:
1. Yjs generates an "update" (a binary delta).
2. The update is applied to the in-memory `Y.Doc`.
3. `Y.encodeStateAsUpdate(doc)` computes the new full state.
4. The new binary is written to the note record's `content` field in IndexedDB.
5. The outbox queues a sync of the note record.

### Document awareness (cursors and selections)

Yjs's awareness protocol is used for ephemeral state — cursor positions and "who is editing" indicators. Awareness state is broadcast over the same WebSocket as realtime changes and never persisted to the database.

When the user's cursor moves, their awareness state is updated:
```ts
provider.awareness.setLocalState({
  user: { name: 'Prabhas', color: '#6366f1' },
  cursor: { anchor: 45, head: 48 }
});
```

Other connected clients receive this state and render cursor overlays. When the connection drops, Supabase's realtime channel closes and all remote awareness states are cleared automatically.

### Offline CRDT merging

The most powerful property of Yjs for an offline-first app: updates from different devices that were applied while offline merge correctly when they finally sync.

Scenario:
- Device A edits the first paragraph of a note while on a plane.
- Device B edits the last paragraph of the same note, also offline.
- Both devices reconnect.

Merge outcome:
1. Device A pushes its Yjs update to Supabase (the outbox entry for the note).
2. Device B pulls Device A's update, applies it with `Y.applyUpdate`, and sees both sets of changes.
3. Device B pushes its own update.
4. Device A pulls and applies Device B's update.
5. Both devices now have an identical document that includes all edits from both.

There is no "conflict" to resolve. Yjs handles insertion and deletion ordering at the character level — even if both devices inserted text at the same position, Yjs deterministically picks a stable ordering based on the operations' internal IDs.

### Binary encoding for storage

Yjs provides `Y.encodeStateAsUpdate(doc)` which returns a `Uint8Array`. This is stored directly in the `content` column. On loading, `Y.applyUpdate(doc, content)` restores the full document. The binary format is compact — a document with thousands of edits might still compress to tens of kilobytes.

In Supabase, the column type is `bytea`. The TypeScript type is narrowed in `src/lib/types.ts` from the generated `unknown` (json field) to `Uint8Array | null`.

---

## Service Worker Lifecycle

### Generation by `stellarPWA`

The service worker (`static/sw.js`) is generated at build time by the `stellarPWA` Vite plugin. The plugin reads the built asset manifest (the list of all output chunks and their hashes) and embeds it directly into the service worker source. This means the service worker knows exactly which files to cache without any runtime discovery.

### Precaching strategy

On install, the service worker caches:
- The HTML shell (`/`)
- `manifest.json`
- All icon files
- The offline fallback page (`/offline.html`)

Content-hashed chunks are **not** precached on install — they are cached on demand when first requested, or proactively via the background precaching flow.

### Runtime caching (on fetch)

The `fetch` event handler applies different strategies based on the request URL:

| URL pattern | Strategy | Reason |
|-------------|----------|--------|
| `/_app/immutable/**` | Cache-first | Content hash guarantees freshness |
| `/_app/version.json` | Network-first | Version check needs latest value |
| `/*.html` (navigation) | Network-first + offline fallback | Fresh content when online |
| `/api/**` | Network-only | API responses must not be cached |
| Supabase URLs | Network-only | Realtime and auth must not be cached |

### Update detection and prompting

When a new version of the app is deployed, the service worker file changes (new asset hashes). The browser detects this and installs the new service worker. The new SW enters the "waiting" state — it cannot activate until all tabs are closed, because activating would change the cache while the old app is running.

The `UpdatePrompt` component monitors six signals:

1. `serviceWorker.getRegistration()` on mount — catches SWs already waiting.
2. `registration.onupdatefound` — fires when a new SW starts installing.
3. `installingWorker.onstatechange` — fires when the installing SW transitions to "installed" (waiting).
4. `document.onvisibilitychange` — re-checks when the tab becomes visible (user switches back to the tab).
5. `window.online` — re-checks when connectivity returns (may have missed an update while offline).
6. `setInterval` — periodic check for iOS standalone mode, where some lifecycle events are unreliable.

When a waiting SW is detected, `showPrompt` is set to `true` and the user sees an update notification. Clicking "Refresh" sends `{ type: 'SKIP_WAITING' }` to the waiting SW, which forces it to activate immediately. The page then listens for `controllerchange` (fired when the new SW takes control) and calls `window.location.reload()`.

### Background asset prefetching

After the initial page load, `+layout.svelte` sends two messages to the active service worker controller:

```ts
// Cache assets used by the current page
controller.postMessage({ type: 'CACHE_URLS', urls: [...scripts, ...styles] });

// Trigger background precaching of all app chunks
controller.postMessage({ type: 'PRECACHE_ALL' });
```

The service worker's message handler receives `PRECACHE_ALL`, reads the embedded asset manifest, and fetches each chunk with `cache.add()`. This ensures every page in the app is available offline even before the user navigates to it. The `PRECACHE_COMPLETE` message is posted back to the client with a count of successfully cached assets.

---

## Database Schema Design

### System columns on every table

Every table managed by the sync engine automatically gets six system columns beyond the user-defined fields:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` NOT NULL PRIMARY KEY | Generated client-side using `crypto.randomUUID()`. Client-side generation avoids a round-trip to the database to get the new row's ID and enables offline creation of records. |
| `user_id` | `uuid` NOT NULL | Foreign key to `auth.users`. Used in RLS policies. Set automatically by the engine — app code never needs to set it. |
| `created_at` | `timestamptz` NOT NULL DEFAULT now() | Set once on creation, never updated. |
| `updated_at` | `timestamptz` NOT NULL | Updated on every write. Used as the sync cursor — incremental pulls use `WHERE updated_at > $cursor`. |
| `deleted` | `boolean` NOT NULL DEFAULT false | Soft-delete flag. Records are never hard-deleted from the database. They are marked `deleted: true` and eventually garbage-collected via tombstone cleanup. |
| `_version` | `integer` NOT NULL DEFAULT 1` | Optimistic concurrency counter. Incremented on every write. Used for field-level conflict resolution. |
| `device_id` | `uuid` NOT NULL | The device that last wrote this record. Used for deduplication — the engine skips applying a realtime update for a record that was just written by the same device. |

### Soft deletes and tombstones

Records are never hard-deleted. When the app deletes a note, the engine sets `deleted: true` on the record and writes it to the outbox. Supabase receives the upsert with `deleted: true`. Other devices receive the update via realtime or pull and remove the record from their local state.

Tombstones accumulate over time. The engine periodically runs a garbage collection pass: tombstones older than a configurable threshold (e.g., 90 days) that have been confirmed synced across all registered devices are hard-deleted from both Supabase and IndexedDB.

### RLS policies

Supabase Row Level Security policies are generated by the engine for each table:

```sql
-- Read: only the owning user
CREATE POLICY "Users can read own records"
ON <table> FOR SELECT
USING (auth.uid() = user_id);

-- Write: only the owning user
CREATE POLICY "Users can write own records"
ON <table> FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

This means even if a bug exposed a Supabase endpoint without auth, an attacker could only read their own (empty) rows.

### Singleton tables

Some tables hold a single record per user — for example, a `settings` table. The schema definition supports `{ singleton: true }` which generates a unique constraint on `user_id` and convenience helpers (`getSettings`, `setSettings`) that always operate on that single row.

### Indexes

Indexes are defined per-table in the schema. The engine generates both the Supabase SQL index (`CREATE INDEX IF NOT EXISTS`) and the Dexie compound index string. The `updated_at` column is always indexed (used for the sync cursor query). Other indexes should be added for any field used in a Dexie `where()` clause.

---

## Security Considerations

### PIN never sent over the network

The PIN verification is entirely local. When the user enters their PIN to unlock, the engine derives a hash using PBKDF2 and compares it against the stored hash in IndexedDB. No network request is made. The hash stored in IndexedDB is the only form of the PIN ever persisted — not the PIN itself.

### Supabase credentials are public keys

The `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (note: "publishable", not "secret") are intentionally public. Supabase's anonymous auth and RLS policies are the security boundary. The publishable key can only perform operations that RLS allows for the authenticated user. The secret service role key is never used in client code.

### Runtime config served from the server

Supabase credentials are not baked into the client bundle at build time. Instead, they are served dynamically from `GET /api/config` on every page load. This allows changing the Supabase project (re-running the setup wizard) without rebuilding the app.

### Device verification as a second factor

The device verification email OTP acts as a second factor for adding new devices. Even if an attacker knows the user's PIN, they cannot link a new device without access to the registered email address.

### Rate limiting

The unlock and link-device flows apply progressive rate limiting after consecutive PIN failures. The rate-limit state is tracked server-side in Supabase, not just in the client. This prevents an attacker from clearing the client-side countdown and trying again.

### Demo mode isolation

Demo mode is completely sandboxed at the engine level. The `isDemoMode()` check is enforced before every Supabase call, every sync operation, and every auth function. There are no "almost-connected" states in demo mode — the isolation is binary.

---

## Demo Mode Architecture

### Sandbox design

Demo mode operates an entirely separate Dexie database (`infinite_demo`) and never opens the real database (`infinite`). The isolation is enforced at `initEngine` time — if demo mode is active, a different database prefix is used and all Supabase/network code is short-circuited.

### Data flow

```
User visits /demo → clicks "Start Demo"
  → setDemoMode(true)
  → window.location.href = '/'  (full reload for clean state)
  → initEngine() detects isDemoMode()
  → opens 'infinite_demo' IndexedDB
  → resolveAuthState() returns { authMode: 'demo' }
  → seedDemoData(db) populates mock data
  → CRUD works against 'infinite_demo'
  → All Supabase / network calls are no-ops
```

### Mock profile

The `demoConfig` in `src/lib/demo/config.ts` provides a mock user profile:

```ts
export const demoConfig: DemoConfig = {
  seedData: seedDemoData,
  mockProfile: {
    email: 'demo@example.com',
    firstName: 'Demo',
    lastName: 'User',
  },
};
```

The `authState` store's `offlineProfile` is set to this mock profile. Components that display the user's name (e.g., `resolveFirstName($authState.session, $authState.offlineProfile)`) render "Demo" without any special-casing.

### Exit demo

Clicking "Exit Demo" calls `setDemoMode(false)` and reloads the page. The next `initEngine()` call opens the real database and proceeds through the normal auth flow.
