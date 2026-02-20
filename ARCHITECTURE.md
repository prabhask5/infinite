# Architecture

Technical deep-dive into the design decisions, data flows, and system internals of Infinite Notes.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Project Structure](#project-structure)
3. [Auth System](#auth-system)
4. [Local-First Sync Engine](#local-first-sync-engine)
5. [CRDT Collaborative Editing](#crdt-collaborative-editing)
6. [Comments System](#comments-system)
7. [Image Pipeline](#image-pipeline)
8. [Link Preview Caching](#link-preview-caching)
9. [Drag-and-Drop Block Reordering](#drag-and-drop-block-reordering)
10. [Offline Availability Toggle](#offline-availability-toggle)
11. [Notes Data Flow](#notes-data-flow)
12. [Realtime Subscriptions](#realtime-subscriptions)
13. [Service Worker Lifecycle](#service-worker-lifecycle)
14. [Database Schema](#database-schema)
15. [Security Considerations](#security-considerations)
16. [Demo Mode Architecture](#demo-mode-architecture)

---

## System Overview

Infinite Notes is a local-first PWA. "Local-first" means the client database (IndexedDB via Dexie.js) is the primary source of truth for the UI. The remote database (Supabase Postgres) is a sync target, not a required dependency for reads or writes.

```
┌───────────────────────────────────────────────────────────────────┐
│                          Browser (Client)                         │
│                                                                   │
│  ┌──────────────┐    ┌──────────────────────────────────────┐     │
│  │  SvelteKit   │    │         stellar-drive engine          │     │
│  │  (Svelte 5)  │    │                                      │     │
│  │              │    │  ┌──────────┐    ┌────────────────┐   │     │
│  │  +layout     │◄──►│  │   Auth   │    │   Sync engine  │   │     │
│  │  +page       │    │  └──────────┘    └───────┬────────┘   │     │
│  │              │    │                          │            │     │
│  └──────┬───────┘    │  ┌───────────────────────▼─────────┐  │     │
│         │            │  │      Dexie.js / IndexedDB       │  │     │
│         │            │  │      (primary data store)       │  │     │
│         ▼            │  └───────────────────────┬─────────┘  │     │
│  ┌──────────────┐    │                          │            │     │
│  │   Tiptap     │    │  ┌───────────────────────▼─────────┐  │     │
│  │   Editor     │◄──►│  │   Yjs (CRDT engine)            │  │     │
│  │              │    │  │   Y.XmlFragment (content)       │  │     │
│  │  y-prosemirror│   │  │   Y.Map (meta: title, icon)    │  │     │
│  └──────────────┘    │  └─────────────────────────────────┘  │     │
│                      └──────────────────┬───────────────────┘     │
│                                         │                         │
│  ┌──────────────────────────────────┐   │                         │
│  │     Service Worker (sw.js)       │   │                         │
│  │  - Immutable asset caching       │   │                         │
│  │  - Offline navigation fallback   │   │                         │
│  │  - Background precaching         │   │                         │
│  └──────────────────────────────────┘   │                         │
└─────────────────────────────────────────┼─────────────────────────┘
                                          │ (online only)
                           ┌──────────────▼──────────────────┐
                           │           Supabase              │
                           │                                 │
                           │  ┌──────────┐    ┌───────────┐  │
                           │  │   Auth   │    │ Realtime  │  │
                           │  │ (anon +  │    │ (broadcast│  │
                           │  │  OTP)    │    │  + WAL)   │  │
                           │  └──────────┘    └───────────┘  │
                           │  ┌───────────────────────────┐  │
                           │  │  Postgres (RLS-protected) │  │
                           │  │  notes table + system cols│  │
                           │  └───────────────────────────┘  │
                           └─────────────────────────────────┘
```

### Key design principles

**Writes never block on the network.** Every write goes to IndexedDB first and resolves immediately. Supabase sync is asynchronous and best-effort. The UI responds at memory speed.

**Reads never need the network after first load.** Once the service worker has precached all chunks and the sync engine has pulled the latest data, the app functions completely offline -- including auth (PIN hash is stored in IndexedDB).

**Conflicts are resolved deterministically.** The sync engine uses a three-tier conflict resolution strategy (timestamp, field-level merge, CRDT) that produces the same result regardless of sync order.

---

## Project Structure

```
src/
  routes/
    +layout.svelte         # App shell: auth hydration, sidebar, SW update prompt
    +layout.ts             # Engine bootstrap, auth guard, redirect logic
    +page.svelte           # Home page (recent notes, create new)
    +error.svelte          # Error boundary
    [...catchall]/         # Catch-all route for 404 handling
    api/
      config/+server.ts    # GET /api/config: serves runtime Supabase config
      link-preview/+server.ts  # POST /api/link-preview: fetches OG tags via cheerio
      setup/
        validate/          # POST /api/setup/validate: test Supabase credentials
        deploy/            # POST /api/setup/deploy: set Vercel env vars + redeploy
    login/+page.svelte     # PIN auth: setup / unlock / link-device flows
    setup/+page.svelte     # First-time Supabase config wizard
    confirm/+page.svelte   # Email confirmation landing (OTP callback)
    demo/+page.svelte      # Demo mode landing
    profile/+page.svelte   # User profile, sign-out
    policy/+page.svelte    # Privacy policy / terms
    notes/
      +page.svelte         # Notes list / home
      +page.ts             # Notes list loader
      [id]/
        +page.svelte       # Note editor page
        +page.ts           # Opens CRDT document, loads breadcrumbs
  lib/
    schema.ts              # Schema definition (single source of truth)
    types.ts               # App type definitions and narrowings
    types.generated.ts     # Auto-generated entity types (do not edit)
    stores/
      notes.ts             # Note CRUD operations and reactive stores
      comments.ts          # Comment CRUD operations for note_comments table
    components/
      UpdatePrompt.svelte  # Service worker update notification
      notes/
        NoteEditor.svelte  # Tiptap editor wrapper with Yjs collaboration
        NoteTitle.svelte   # Editable title component
        NoteHeader.svelte  # Breadcrumbs + note menu bar
        NoteMenu.svelte    # Context menu (lock, move, trash)
        NoteSyncStatus.svelte  # Per-note sync indicator
        Breadcrumbs.svelte # Hierarchical breadcrumb trail
        MoveNoteModal.svelte   # Move note to different parent
        SlashCommandMenu.svelte    # Floating slash command dropdown
        EditorToolbar.svelte       # Floating bubble toolbar
        NoteCard.svelte    # Note card for list views
        CommentsPanel.svelte    # Slide-in right sidebar listing comments
        AddCommentPopover.svelte   # Popover for writing a comment on selected text
        extensions/
          slash-commands.ts # Custom Tiptap slash command extension
          comment-mark.ts   # Custom Mark: inline comment highlight
          image-block.ts    # Custom Node: image with resize handles
          link-preview-block.ts  # Custom Node: rich bookmark card
          note-block.ts     # Custom Node: embedded sub-page card
          toc-block.ts      # Custom Node: live table of contents
          drag-handle.ts    # ProseMirror plugin: drag handles for block reordering
      services/
        image-upload.ts    # Image validation and data URL conversion
    demo/
      config.ts            # Demo config (mock profile)
      mockData.ts          # Demo seed data
static/
  sw.js                    # Service worker (generated by stellarPWA)
  manifest.json            # PWA manifest
  offline.html             # Offline fallback page
  icons/                   # App icons (192px, 512px)
```

---

## Auth System

### Single-user auth model

Unlike a traditional multi-user app, Infinite Notes uses a "single-user" model: one Supabase project = one user. There is no multi-tenant user table. The app is designed to be self-hosted.

### PIN-based authentication

The user sets a 6-digit PIN during first-time setup. The PIN is never stored in plaintext:

1. Generate a random salt (unique per device setup).
2. Apply PBKDF2 with configured iterations to derive a key from the PIN + salt.
3. Store the derived hash + salt in IndexedDB (offline credentials).
4. Store a separate Supabase session (anonymous auth) independently.

When unlocking:

```
User enters PIN
      |
      v
Read salt from IndexedDB
      |
      v
PBKDF2(PIN, salt, iterations) -> derived hash
      |
      v
Compare with stored hash
      |
   +--+--+
match    mismatch
  |          |
  v          v
Restore    Error + rate-limit
Supabase   after N failures
session
  |
  v
Start sync engine -> navigate to app
```

The PIN hash never leaves the device. No network request is needed for verification.

### Device verification flow

When the app is opened on a new device:

1. `fetchRemoteGateConfig()` checks whether an account exists in Supabase.
2. The login page switches to "link device" mode.
3. The user enters their PIN. `linkSingleUserDevice(email, pin)` is called.
4. A device verification email (OTP) is sent.
5. Two detection mechanisms run in parallel:
   - **Polling**: `pollDeviceVerification()` every 3 seconds
   - **BroadcastChannel**: the `/confirm` page sends `AUTH_CONFIRMED` via `BroadcastChannel('infinite-auth-channel')`
6. `completeDeviceVerification()` finalizes the session.

```
New device                     Email                   Supabase
     |                           |                        |
     +-- fetchRemoteGateConfig() -------------------------+
     |<-- { email, name, gateType } ----------------------+
     |                           |                        |
     +-- linkSingleUserDevice() --------------------------+
     |                           |<-- send OTP email -----+
     |                           |                        |
     |  (poll every 3s) ----------------------------------+ "verified?"
     |                           |                        |
     |                User clicks email link              |
     |                    /confirm page runs              |
     |<-- BroadcastChannel: AUTH_CONFIRMED ---------------+
     |                           |                        |
     +-- completeDeviceVerification() --------------------+
     |<-- session ----------------------------------------+
     |                           |                        |
     Navigate to app             |                        |
```

### Auth state model

Auth state is an object store (`authState`) with the shape:

```ts
{
  mode: 'supabase' | 'offline' | 'demo' | 'none';
  session: Session | null;
  offlineProfile: Profile | null;
  isLoading: boolean;
  authKickedMessage: string | null;
}
```

The root layout calls `resolveRootLayout()` which returns `{ authMode, session, offlineProfile, serverConfigured }`. The `$effect` in `+layout.svelte` calls `hydrateAuthState(data)` to update the store. Components read the store reactively.

### Setup wizard

When no runtime config exists, the app redirects to `/setup`. The wizard guides the user through:

1. Create a Supabase project (instructions).
2. Initialize the database schema (SQL provided).
3. Enter and validate credentials (URL + publishable key) via `POST /api/setup/validate`.
4. Persist configuration via `POST /api/setup/deploy` with a Vercel API token, which sets env vars and triggers redeployment.
5. Poll for new service worker version to confirm the deploy succeeded.

---

## Local-First Sync Engine

### Outbox pattern

All writes follow the outbox pattern:

```
App writes record
       |
       v
Write to IndexedDB (immediate)
       |
       v
Append operation to outbox (IndexedDB table)
       |
   +---+-------------------+
   | online?               | offline?
   |                       |
   v                       v
Push to Supabase        Wait for connectivity
       |                       |
       v                       |
Remove from outbox<------------+ (retry when online)
```

The outbox is an IndexedDB table containing pending operations. Each entry has the table name, record ID, operation type (upsert/delete), and record data. When the device goes online, the engine drains the outbox.

### Operation coalescing

Multiple writes to the same record while offline are coalesced into a single upsert. The engine replaces any existing outbox entry for the same `(table, id)` tuple if the new `_version` is higher. This keeps the outbox small and avoids redundant network requests.

### Conflict resolution

Three-tier strategy when local and remote records conflict:

**Tier 1: Timestamp comparison.** `updated_at` timestamps are compared. The later timestamp wins for non-CRDT fields.

**Tier 2: Field-level merge.** If both devices modified different fields (e.g., Device A changed `title`, Device B changed `is_locked`), the engine merges at the field level using per-field `_version` numbers.

**Tier 3: CRDT merge.** For Yjs binary data (note content), conflicts are resolved by the Yjs merge algorithm. Updates are commutative -- applying A then B produces the same result as B then A.

### Sync cursor (incremental pulls)

The engine tracks a sync cursor -- the `updated_at` timestamp of the most recently seen remote record. Each pull queries only records newer than the cursor:

```sql
SELECT * FROM notes WHERE updated_at > $cursor AND user_id = $userId ORDER BY updated_at ASC
```

Sync scales with changes since the last pull, not total data size.

### Connectivity handling

On going **offline**: realtime subscriptions close, the outbox accumulates writes, and the `isOnline` store reflects offline status.

On going **online**: the outbox is drained, a pull is issued, and realtime subscriptions are re-established.

---

## CRDT Collaborative Editing

### Yjs document structure

Each note has a Yjs `Y.Doc` containing two shared types:

- **`Y.XmlFragment`** (`content`) -- the rich text document, bound to Tiptap via `y-prosemirror`
- **`Y.Map`** (`meta`) -- note metadata (title, icon) synced across devices

When a note is opened (`notes/[id]/+page.ts`):

```ts
const provider = await openDocument(documentId, noteId, { offlineEnabled: true });
const { content, meta } = createBlockDocument(provider.doc);
```

The `CRDTProvider` manages the document lifecycle: loading state from IndexedDB, connecting to Supabase Broadcast for real-time sync, and saving state back to IndexedDB.

### Supabase Broadcast for real-time CRDT sync

Yjs updates are relayed between devices using Supabase Broadcast (a lightweight pub/sub channel over WebSocket). When the user types:

1. Yjs generates a binary update (delta).
2. The provider broadcasts the update to the Supabase channel.
3. Other devices receive the broadcast and apply the update with `Y.applyUpdate(doc, update)`.
4. The editor updates in real-time via `y-prosemirror`.

### IndexedDB persistence

The full Yjs document state is periodically saved to IndexedDB as a `Uint8Array`. On the next load, `Y.applyUpdate(doc, savedState)` restores the document. This means a user can close the app, reopen it offline, and continue editing.

### State vectors for delta computation

When syncing after an offline period, the provider sends its state vector (a summary of which Yjs operations it has seen). The remote side computes only the missing updates and sends those as a binary diff. This makes sync proportional to missed changes, not document size.

### Offline merge scenario

1. Device A edits the first paragraph while on a plane.
2. Device B edits the last paragraph, also offline.
3. Both reconnect.
4. Device A pushes its Yjs update via Supabase Broadcast.
5. Device B receives and applies it -- both sets of changes are now visible.
6. Device B pushes its update.
7. Device A applies it.
8. Both devices converge to identical documents with all edits preserved.

No conflict resolution UI is needed. Yjs handles insertion ordering at the character level using internal operation IDs.

---

## Comments System

### Data model

Comments are stored in the `note_comments` table (synced via the standard sync engine). Each comment has a `note_id`, a `mark_id` (linking it to a `CommentMark` in the Tiptap document), the `content` text, an optional `quote` (the highlighted text at creation time), and a `resolved` boolean.

### Data flow

```
User selects text -> AddCommentPopover appears
  -> User writes comment and submits
  -> CommentMark applied to selected range (Tiptap transaction)
  -> note_comments record created via engineCreate()
  -> CommentsPanel reactively updates via collection store
```

The `CommentMark` is a custom Tiptap Mark that renders as `<mark class="comment-highlight" data-comment-id="...">`. Clicking a highlighted range scrolls the comments panel to the corresponding comment. Resolving or deleting a comment removes the mark from the document and updates/deletes the `note_comments` record.

### CRDT implications

The comment mark is part of the Yjs `XmlFragment`, so it syncs across devices via the standard CRDT path. The `note_comments` metadata syncs via the standard sync engine outbox. Both paths are independent -- the mark and the comment record may arrive on another device in any order. The UI handles the case where a mark exists but the comment record has not synced yet.

---

## Image Pipeline

### Offline-first image storage

Images are not uploaded to Supabase Storage. Instead, they are converted to data URLs and stored inline within the Tiptap document (which lives in the Yjs `XmlFragment`).

```
User pastes/drops/selects image
  -> image-upload.ts validates file type and size
  -> FileReader converts to base64 data URL
  -> ImageBlock node inserted into document
  -> Data URL persists in Yjs state -> IndexedDB + Supabase
```

This approach guarantees images are available offline and sync with the document via the existing CRDT pipeline. The tradeoff is increased document size for image-heavy notes.

### Resize handles

The `ImageBlock` custom node renders resize handles that allow the user to drag-resize images. The new dimensions are stored as node attributes (`width`, `height`) and sync via Yjs.

---

## Link Preview Caching

### Server-side OG fetching

The `/api/link-preview` endpoint fetches the target URL server-side and extracts Open Graph meta tags using cheerio:

```
Client sends POST /api/link-preview { url }
  -> SvelteKit server fetches the URL
  -> cheerio parses HTML for og:title, og:description, og:image, favicon
  -> Returns JSON { title, description, image, favicon, url }
  -> LinkPreviewBlock renders the bookmark card
```

OG metadata is stored as node attributes in the `LinkPreviewBlock`, so it persists in the Yjs document and does not require re-fetching. The bookmark card displays the title, description, image, and favicon as a rich preview.

---

## Drag-and-Drop Block Reordering

### Implementation

The `DragHandle` extension is a ProseMirror plugin (not a node or mark). It decorates the editor with a floating drag handle that appears on hover over any top-level block.

When the user drags a block:

1. The plugin identifies the source block's position in the ProseMirror document.
2. Native HTML5 drag-and-drop is used for the drag interaction.
3. On drop, a ProseMirror transaction moves the block to the new position.
4. The transaction flows through `y-prosemirror`, which converts it to a Yjs update.
5. The update syncs to other devices via the standard CRDT broadcast path.

### CRDT safety

Block reordering is a structural change to the `XmlFragment`. Yjs handles concurrent reorder operations correctly -- if two devices reorder different blocks simultaneously, both operations are preserved. If they reorder the same block, Yjs's internal operation ordering determines the final position deterministically.

---

## Offline Availability Toggle

### Per-note offline persistence

By default, a note's CRDT state is loaded on demand and may not be available offline if the user has not recently visited it. The "Available offline" toggle (in `NoteMenu`) sets `is_offline: true` on the note record and opens the CRDT document with `offlineEnabled: true`:

```
User toggles "Available offline" ON
  -> toggleOffline(noteId) updates is_offline in sync engine
  -> openDocument(docId, noteId, { offlineEnabled: true })
  -> Yjs state is persisted to IndexedDB proactively
  -> Note content is available even without network
```

When `is_offline` is false, the CRDT state may still be cached in IndexedDB from recent use, but it is not guaranteed to be up-to-date. Toggling it on ensures the latest state is always persisted locally.

---

## Notes Data Flow

Infinite Notes uses a **dual persistence model** for notes:

```
                          Note Data
                    ┌─────────┴─────────┐
                    |                   |
              Metadata              Content
         (title, icon,          (rich text blocks)
          parent, order,
          is_locked, etc.)
                    |                   |
                    v                   v
            Sync Engine           Yjs CRDT Engine
                    |                   |
                    v                   v
         ┌─────────┴──────┐    ┌───────┴────────┐
         |                |    |                |
    IndexedDB       Supabase  IndexedDB    Supabase
    (Dexie)        Postgres   (Y.Doc      Broadcast
                              binary)     (real-time)
```

### Metadata path

Note metadata (title, icon, parent_note_id, order, last_edited_at, is_locked, is_trashed) flows through the sync engine:

1. **Write**: `engineCreate()` or `engineUpdate()` writes to IndexedDB and enqueues an outbox entry.
2. **Optimistic update**: the `notesStore` and `noteDetailStore` are mutated immediately for instant UI feedback.
3. **Sync**: the outbox drains to Supabase when online.
4. **Remote changes**: arrive via Supabase Realtime WAL subscriptions and are merged into IndexedDB.

### Content path

Note content (rich text) flows through the CRDT engine:

1. **Write**: user types in Tiptap, which generates a ProseMirror transaction.
2. **y-prosemirror**: converts the transaction into a Yjs update on the `XmlFragment`.
3. **Broadcast**: the Yjs update is sent to other devices via Supabase Broadcast.
4. **Persistence**: the full Yjs state is saved to IndexedDB periodically.

### Title sync bridge

The title exists in both systems. When the user edits the title:

1. The title is written to the Yjs `meta` map (`meta.set('title', newTitle)`).
2. A debounced callback syncs the title back to the sync engine via `updateNoteMeta(id, { title })`.
3. This ensures the title in Supabase Postgres (used for note lists, search, breadcrumbs) stays in sync with the CRDT version.

### Note CRUD operations

All note operations are in `src/lib/stores/notes.ts`:

| Operation | Function | Behavior |
|-----------|----------|----------|
| Create | `createNote(parentId?, title?)` | Writes to sync engine, optimistically adds to store |
| Update metadata | `updateNoteMeta(id, fields)` | Updates sync engine + optimistic store mutation |
| Trash | `trashNote(id)` | Sets `is_trashed: true`, removes from store |
| Delete | `deleteNote(id)` | Hard-delete via sync engine |
| Move | `moveNote(id, newParentId)` | Updates `parent_note_id` |
| Lock/unlock | `toggleLock(id, locked)` | Updates `is_locked` |
| Toggle offline | `toggleOffline(id)` | Updates `is_offline`, re-opens CRDT doc with persistence |
| Get children | `getChildNotes(parentId)` | Queries by `parent_note_id` index |
| Get breadcrumbs | `getBreadcrumbs(noteId)` | Walks up parent chain (max 20 levels) |

---

## Realtime Subscriptions

### Supabase Postgres Changes

Supabase Realtime listens to Postgres's WAL (write-ahead log) and broadcasts row-level change events over WebSocket. The engine subscribes to each table and receives `INSERT`, `UPDATE`, and `DELETE` events.

### Channel management

One Supabase channel per subscribed table, grouped under a single multiplexed WebSocket. Channels are torn down on sign-out and re-established on sign-in. In demo mode, no channels are created.

### Deferred changes (edit-in-progress guard)

When a realtime update arrives for a record being actively edited, the engine queues the update rather than applying it immediately. When the edit concludes, queued updates are replayed and merged. For CRDT content, Yjs handles this directly via its merge semantics.

---

## Service Worker Lifecycle

### Generation

The service worker (`static/sw.js`) is generated at build time by `stellarPWA`. The plugin embeds the asset manifest directly into the SW source.

### Precaching strategy

On install, the SW caches: the HTML shell, `manifest.json`, icons, and the offline fallback page. Content-hashed chunks are cached on demand or via background precaching.

### Runtime caching

| URL pattern | Strategy |
|-------------|----------|
| `/_app/immutable/**` | Cache-first (hash guarantees freshness) |
| `/_app/version.json` | Network-first |
| Navigation requests | Network-first + offline fallback |
| `/api/**` | Network-only |
| Supabase URLs | Network-only |

### Update detection

The `UpdatePrompt` component monitors six signals:

1. `getRegistration()` on mount -- catches SWs already waiting.
2. `onupdatefound` -- new SW starts installing.
3. `onstatechange` -- installing SW transitions to "installed" (waiting).
4. `visibilitychange` -- re-checks when tab becomes visible.
5. `online` event -- re-checks when connectivity returns.
6. `setInterval` -- periodic check for iOS standalone mode.

Clicking "Refresh" sends `SKIP_WAITING` to the waiting SW, then reloads on `controllerchange`.

### Background precaching

After page load, `+layout.svelte` sends:
- `CACHE_URLS` -- scripts and stylesheets of the current page.
- `PRECACHE_ALL` -- all chunks from the asset manifest.

The SW responds with `PRECACHE_COMPLETE` including success/failure counts.

---

## Database Schema

### Notes table

The `notes` table is defined in `src/lib/schema.ts`:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | `uuid` | NOT NULL (PK) | Client-generated via `crypto.randomUUID()` |
| `user_id` | `uuid` | NOT NULL | Foreign key to `auth.users`, auto-set by engine |
| `title` | `text` | NOT NULL | Note title, synced from CRDT meta map |
| `icon` | `text` | NULL | Emoji or icon identifier |
| `parent_note_id` | `uuid` | NULL | Parent note for hierarchy (NULL = root) |
| `order` | `double precision` | NOT NULL | Sort order within siblings |
| `last_edited_at` | `timestamptz` | NOT NULL | Last content edit timestamp |
| `last_edited_by` | `text` | NULL | Device/user that last edited |
| `created_by` | `text` | NULL | Device/user that created the note |
| `is_locked` | `boolean` | NOT NULL | Whether the note is read-only |
| `is_trashed` | `boolean` | NOT NULL | Soft-delete from user's perspective |
| `is_offline` | `boolean` | NOT NULL | Whether the note's CRDT state is persisted offline |
| `created_at` | `timestamptz` | NOT NULL | Record creation timestamp (system) |
| `updated_at` | `timestamptz` | NOT NULL | Last modification timestamp (sync cursor) |
| `deleted` | `boolean` | NOT NULL | Hard soft-delete flag (tombstone, system) |
| `_version` | `integer` | NOT NULL | Optimistic concurrency version (system) |
| `device_id` | `uuid` | NOT NULL | Which device last wrote this record (system) |

Indexes: `parent_note_id`, `order`, `is_trashed`, `updated_at` (always indexed for sync cursor).

### Note comments table

The `note_comments` table stores comment threads attached to text ranges:

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | `uuid` | NOT NULL (PK) | Client-generated |
| `user_id` | `uuid` | NOT NULL | Foreign key to `auth.users` |
| `note_id` | `uuid` | NOT NULL | The note this comment belongs to |
| `content` | `text` | NOT NULL | Comment body text |
| `quote` | `text` | NULL | The highlighted text at time of creation |
| `mark_id` | `string` | NOT NULL | Links to the `commentId` attribute on the `CommentMark` in the document |
| `resolved` | `boolean` | NOT NULL | Whether the comment thread is resolved |
| + system columns | | | `created_at`, `updated_at`, `deleted`, `_version`, `device_id` |

Indexes: `note_id`, `mark_id`.

### Soft deletes and tombstones

Records are never hard-deleted from the database. Deletion sets `deleted: true` and syncs via the outbox. Other devices receive the update and remove the record from their local state. Tombstones older than a configurable threshold are eventually garbage-collected.

---

## Security Considerations

### PIN never sent over the network

PIN verification is entirely local. PBKDF2 derives a hash from the entered PIN + stored salt. The comparison happens in the browser. No network request is made.

### Supabase credentials are public keys

`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` are intentionally public. Supabase's anonymous auth and RLS policies are the security boundary. The secret service role key is never used in client code.

### Row Level Security (RLS)

Auto-generated RLS policies ensure each user can only read and write their own records:

```sql
CREATE POLICY "Users can read own records"
ON notes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can write own records"
ON notes FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### PKCE auth flow

Supabase Auth uses the PKCE (Proof Key for Code Exchange) flow for the email OTP verification. This prevents authorization code interception attacks during the device verification process.

### Runtime config served from the server

Supabase credentials are not baked into the client bundle. They are served dynamically from `GET /api/config`, allowing configuration changes without rebuilding.

### Device verification as a second factor

The email OTP acts as a second factor when adding new devices. Even if an attacker knows the PIN, they cannot link a device without email access.

### Rate limiting

Progressive rate limiting after consecutive PIN failures. Rate-limit state is tracked server-side in Supabase, not just client-side.

### User-scoped data isolation

All data access goes through RLS-protected Supabase tables. The `user_id` column is set automatically by the engine and checked by every RLS policy. There is no way for one user to access another user's data, even if they share the same Supabase project.

---

## Demo Mode Architecture

### Sandbox design

Demo mode operates an entirely separate Dexie database (`infinite_demo`) and never opens the real database. The isolation is enforced at `initEngine` time -- if demo mode is active, a different database prefix is used and all Supabase/network code is short-circuited.

### Data flow

```
User visits /demo -> clicks "Start Demo"
  -> setDemoMode(true)
  -> window.location.href = '/'  (full reload)
  -> initEngine() detects isDemoMode()
  -> opens 'infinite_demo' IndexedDB
  -> resolveAuthState() returns { authMode: 'demo' }
  -> seedDemoData(db) populates mock notes
  -> CRUD works against 'infinite_demo'
  -> All Supabase / network calls are no-ops
```

### Exit demo

Clicking "Exit Demo" calls `setDemoMode(false)` and reloads the page. The next `initEngine()` opens the real database and proceeds through normal auth.
