# Framework Reference

This document explains every major technology used in Infinite Notes -- what it is, why it was chosen, and how it fits into the system. No prior experience is assumed.

---

## Table of Contents

1. [Svelte 5 (Runes)](#svelte-5-runes)
2. [SvelteKit 2](#sveltekit-2)
3. [Supabase](#supabase)
4. [Vite](#vite)
5. [Dexie.js / IndexedDB](#dexiejs--indexeddb)
6. [Yjs CRDTs](#yjs-crdts)
7. [Tiptap](#tiptap)
8. [y-prosemirror](#y-prosemirror)
9. [stellar-drive](#stellar-drive)
10. [TypeScript](#typescript)
11. [Service Workers](#service-workers)
12. [Schema-Driven Workflow](#schema-driven-workflow)

---

## Svelte 5 (Runes)

### What it is

Svelte is a UI component library with a compiler. Unlike React or Vue, Svelte compiles your components to vanilla JavaScript at build time -- no virtual DOM, no runtime framework overhead. In Svelte 5, the reactivity model was rebuilt around "runes": special syntax that tells the compiler exactly what is reactive.

### Key runes

**`$state()`** -- declares a reactive variable. When it changes, every part of the template that reads it updates automatically.

```svelte
<script lang="ts">
  let count = $state(0);
</script>
<button onclick={() => count++}>Clicked {count} times</button>
```

**`$derived()`** -- declares a value computed from other reactive values. Recalculates automatically when its dependencies change. Think of it as a cached computed property.

```svelte
<script lang="ts">
  let firstName = $state('');
  let lastName = $state('');
  const fullName = $derived(`${firstName} ${lastName}`.trim());
</script>
```

In the login page, `code` is derived from the six digit inputs:

```ts
let codeDigits = $state(['', '', '', '', '', '']);
const code = $derived(codeDigits.join(''));
```

**`$effect()`** -- runs a side effect whenever its reactive dependencies change. Similar to `useEffect` in React but with automatic dependency tracking -- you do not need to list dependencies manually.

```ts
// Hydrate auth state whenever layout data changes
$effect(() => {
  hydrateAuthState(data);
});
```

**`$props()`** -- declares the props a component receives from its parent. Replaces the old `export let` syntax.

```ts
let { children, data }: Props = $props();
```

### Snippets

Snippets replace the old slot system. A snippet is a reusable chunk of markup that can be passed as a prop, called with `{@render snippetName()}`, or defined inline with `{#snippet name()}`. The root layout renders the matched page with `{@render children?.()}`.

### Components

Each `.svelte` file is a self-contained component with a `<script>` block (logic), template (HTML-like markup), and optional `<style>` block (scoped CSS). Components compose together to build the full UI.

### How it is used in the app

The note editor page uses `$state()` for title, icon, lock status, and breadcrumbs. `$derived()` computes editor readiness and active navigation state. `$effect()` hydrates auth state and syncs title changes from the CRDT meta map back to the sync engine. `$props()` threads data through NoteEditor, NoteTitle, NoteHeader, and SlashCommandMenu components.

### Why Svelte 5 here

The runes model makes complex reactive state (six simultaneous PIN input states, multi-modal auth flows, real-time sync status) straightforward to express without boilerplate. The compiler output is smaller and faster than React for a PWA where bundle size directly affects offline load time.

**Docs:** [svelte.dev](https://svelte.dev/docs)

---

## SvelteKit 2

### What it is

SvelteKit is a "meta-framework" built on top of Svelte. If Svelte is React, SvelteKit is Next.js -- it adds routing, server-side rendering, build tooling, and deployment adapters on top of the core UI library.

### Key concepts

**File-based routing.** Every file under `src/routes/` becomes a URL. `src/routes/login/+page.svelte` becomes `/login`. `src/routes/notes/[id]/+page.svelte` becomes `/notes/:id` with dynamic params. No router configuration needed.

**`+page.svelte` vs `+layout.svelte`.** Pages render the content for a single route. Layouts wrap one or more pages and stay mounted across navigations. `src/routes/+layout.svelte` is the outermost shell -- it runs auth hydration and mounts the service-worker update prompt once, then every page renders inside it.

**Load functions (`+layout.ts` / `+page.ts`).** Load functions run before the page renders and provide data to the component. They can run on the server (SSR), in the browser (CSR), or both. In `+layout.ts` the engine is initialized, auth is resolved, and unauthenticated users are redirected to `/login` or `/setup`. In `notes/[id]/+page.ts` the CRDT document is opened and breadcrumbs are loaded.

```ts
// src/routes/+layout.ts -- simplified
export const load: LayoutLoad = async ({ url }) => {
  if (browser) {
    const result = await resolveRootLayout();
    if (result.authMode === 'none' && !isPublicRoute) {
      redirect(307, '/login');
    }
    return result;
  }
  return { session: null, authMode: 'none', offlineProfile: null };
};
```

**API routes (`+server.ts`).** Files named `+server.ts` export HTTP handler functions (`GET`, `POST`, etc.) and become serverless API endpoints. `src/routes/api/config/+server.ts` is a `GET /api/config` endpoint that serves the Supabase runtime config to clients.

**Form actions.** SvelteKit supports progressive-enhancement HTML forms with server-side action handlers. This app uses fetch-based calls instead, but the adapter system keeps the same mental model.

**Adapters.** `svelte.config.js` uses `adapter-auto`, which automatically detects the deployment platform (Vercel, Netlify, Cloudflare, bare Node.js) and generates the appropriate output format.

**SSR + CSR hybrid.** The app sets `ssr = true` on the root layout so the initial HTML shell is server-rendered for fast first paint. Auth-dependent content is filled in client-side after the load function resolves.

### Why SvelteKit here

SvelteKit's file-based routing and load function model are a natural fit for an app that needs per-route auth guards, a single shared layout, and serverless API endpoints -- all without the complexity of a separate backend server.

**Docs:** [kit.svelte.dev](https://kit.svelte.dev/docs)

---

## Supabase

### What it is

Supabase is an open-source Firebase alternative. It gives you a Postgres database, authentication, real-time subscriptions, file storage, and auto-generated REST/GraphQL APIs -- all on top of standard Postgres.

### Auth (anonymous sign-ins + email OTP)

Infinite Notes uses Supabase Auth in a non-standard way. Rather than traditional email/password or OAuth, the app signs every user in as an anonymous Supabase user on first setup. The user's identity is verified by a PIN hash stored in IndexedDB. The Supabase anonymous session is used purely to satisfy Row Level Security policies. Adding a new device requires an email OTP verification flow: Supabase sends a verification email, and the new device is trusted only after the OTP is confirmed.

### Postgres database

Supabase sits on top of a real Postgres database. The schema -- tables, columns, indexes, RLS policies, triggers -- is managed entirely by the `stellar-drive` Vite plugin. The plugin connects to Postgres directly using `DATABASE_URL` and pushes idempotent SQL on every build. No migration files, no ORM.

### Realtime (broadcast + presence)

Supabase Realtime lets clients subscribe to Postgres table changes over a WebSocket. When any device writes a record, Supabase broadcasts the change to all other subscribed devices. The sync engine receives these broadcasts and merges them into the local IndexedDB database. Supabase Broadcast is also used to relay Yjs CRDT updates between devices for real-time collaborative editing. Presence tracks which devices are currently connected.

### Row Level Security (RLS)

RLS is a Postgres feature that attaches policies to tables so each row is only visible to the user who owns it. The engine generates RLS policies automatically. This prevents one user from reading another user's data, even if they share the same Supabase project.

### Storage

Supabase Storage is available for file uploads but is not currently used by Infinite Notes. The CRDT binary data is stored directly in Postgres `bytea` columns.

### Why Supabase here

Supabase provides a managed Postgres database, real-time subscriptions, and auth -- without running a separate backend. The free tier is sufficient for a personal notes app. Being open-source means self-hosting is possible for full data sovereignty.

**Docs:** [supabase.com/docs](https://supabase.com/docs)

---

## Vite

### What it is

Vite is a modern JavaScript build tool. In development it serves files using native ES modules for near-instant hot-module replacement (HMR). In production it uses Rollup to bundle and tree-shake everything into optimized static assets.

### Plugin system

Two plugins are used:

**`sveltekit()`** -- the official SvelteKit/Vite integration. Compiles Svelte components, handles routing conventions, and manages SSR.

**`stellarPWA()`** -- from `stellar-drive`. This plugin watches `src/lib/schema.ts` and auto-generates TypeScript types (500ms debounce in dev), pushes idempotent schema SQL to Supabase during `buildStart`, and generates the service worker and asset manifest at build time.

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    sveltekit(),
    stellarPWA({ prefix: 'infinite', name: 'Infinite Notes', schema: true })
  ]
});
```

### Manual chunks

The config isolates heavy vendor libraries into their own chunks for long-term caching:

| Chunk | Libraries | Purpose |
|-------|-----------|---------|
| `vendor-supabase` | `@supabase/*` | Auth + realtime client |
| `vendor-dexie` | `dexie` | IndexedDB wrapper |
| `vendor-tiptap` | `@tiptap/*`, `prosemirror-*` | Rich text editor |
| `vendor-yjs` | `yjs`, `y-prosemirror` | CRDT engine |

When you deploy a new version, users only re-download the chunks that actually changed.

### HMR

During development, changing a Svelte component triggers an instant update in the browser without a full page reload. Component state is preserved across most edits.

### Why Vite here

Vite is the default choice for SvelteKit and provides the fastest development experience. The plugin API made it possible to wire the schema-driven workflow directly into the build pipeline.

**Docs:** [vitejs.dev](https://vitejs.dev/guide)

---

## Dexie.js / IndexedDB

### What IndexedDB is

IndexedDB is a browser-native database. It is a key-value store with support for indexes, transactions, and large datasets -- unlike `localStorage`, which is limited to small strings. Every major browser ships it built-in.

IndexedDB is the foundation of "local-first" architecture: all reads and writes go to the local database first, then sync to the server in the background.

### What Dexie.js is

Dexie is a wrapper library that makes IndexedDB pleasant to use:

- Promise-based API (`await db.table('notes').get(id)`)
- Reactive live queries that re-run when data changes
- Schema versioning with automatic database upgrades
- Full TypeScript support
- Transaction support for atomic multi-table operations

### How it is used here

The sync engine creates and manages a Dexie instance. The schema in `src/lib/schema.ts` becomes the Dexie store definition. Each table gets an IndexedDB object store with the specified indexes plus system columns: `id`, `created_at`, `updated_at`, `deleted`, `_version`, `device_id`.

When you write a record, it goes into IndexedDB immediately and the write resolves. Syncing to Supabase happens asynchronously. The UI is always responsive -- there is no "waiting for the network" to save.

### Demo mode isolation

In demo mode, the engine opens a separate IndexedDB database (`infinite_demo`) instead of the real one (`infinite`). This complete isolation means demo users cannot accidentally pollute or read real data.

### Why Dexie here

Dexie is the de-facto standard for IndexedDB in TypeScript projects. Its reactive query system integrates naturally with Svelte's reactivity model.

**Docs:** [dexie.org](https://dexie.org/docs)

---

## Yjs CRDTs

### What a CRDT is

CRDT stands for Conflict-free Replicated Data Type. It is a data structure designed so that multiple users can make concurrent edits -- even while offline -- and the edits will always merge into the same final state, without any manual conflict resolution.

### What Yjs is

Yjs is a high-performance CRDT implementation in JavaScript. It supports:

- **`Y.Text`** -- collaborative text with character-level insertions and deletions
- **`Y.XmlFragment`** -- collaborative XML structure (used for ProseMirror/Tiptap documents)
- **`Y.Map`** -- collaborative key-value store (used for note metadata like title and icon)
- **`Y.Array`** -- collaborative ordered list
- **Awareness protocol** -- ephemeral state channel for cursor positions, selections, and "who is online" indicators
- **Binary encoding** -- compact `Uint8Array` serialization for storage and transmission

### How it fits in Infinite Notes

Each note's content is stored as a Yjs `Y.Doc`. The document contains two shared types:

- **`Y.XmlFragment`** (`content`) -- the rich text content, bound to the Tiptap editor via `y-prosemirror`
- **`Y.Map`** (`meta`) -- note metadata (title, icon) that stays in sync across devices

When a user types, Yjs generates an "update" -- a binary diff. Updates are:

- Stored in IndexedDB alongside the note record
- Broadcast to other devices via Supabase Realtime
- Merged on other devices: applying a Yjs update is idempotent and order-independent

### State vectors for delta computation

Yjs uses state vectors to compute minimal deltas. When syncing, a device sends its state vector (a summary of which operations it has seen). The remote side computes only the missing updates and sends those. This means sync is proportional to changes, not document size.

### Offline CRDT merging

Updates from different devices that were applied while offline merge correctly when they sync. Two devices that have been offline for a week can reconnect and converge automatically -- no "rebasing" or conflict resolution UI needed. Yjs handles insertion ordering at the character level using internal operation IDs.

### Why Yjs here

Yjs is the most mature and widely used CRDT library in the JavaScript ecosystem. It powers collaborative editing in Notion, Linear, and dozens of other tools. For a notes app where users edit on multiple devices, a CRDT is the only correct solution -- timestamps and last-write-wins policies both discard data.

**Docs:** [docs.yjs.dev](https://docs.yjs.dev)

---

## Tiptap

### What it is

Tiptap is a headless rich text editor framework built on top of ProseMirror. It provides a clean, extensible API for building editors while ProseMirror handles the low-level document model, transactions, and input rules.

### Key concepts

**Extensions.** Tiptap's functionality is modular. Every feature -- bold, headings, lists, links -- is an extension that can be added or removed. The editor is configured by composing extensions:

```ts
const editor = new Editor({
  extensions: [
    StarterKit.configure({ history: false, codeBlock: false }),
    Collaboration.configure({ fragment: content }),
    Placeholder.configure({ placeholder: "Type '/' for commands..." }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlock,
    Underline,
    Link.configure({ openOnClick: false }),
    SlashCommands.configure({ suggestion: { ...callbacks } })
  ]
});
```

**StarterKit.** A bundle of common extensions: paragraphs, headings (H1-H6), bold, italic, strike, code, blockquote, bullet list, ordered list, hard break, horizontal rule.

**Commands.** Editor operations are chained: `editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()`. This chainable API makes it easy to compose multi-step operations.

**Suggestion.** The `@tiptap/suggestion` extension provides a generic trigger system. Infinite Notes uses it for the slash command palette -- typing `/` triggers a filtered dropdown of block types.

### Extensions used in Infinite Notes

| Extension | Purpose |
|-----------|---------|
| `StarterKit` | Base formatting (paragraphs, headings, bold, italic, strike, lists, quotes) |
| `Collaboration` | Binds the editor to a Yjs `XmlFragment` for CRDT sync |
| `Placeholder` | Shows "Type '/' for commands..." when the editor is empty |
| `TaskList` + `TaskItem` | Toggleable to-do checklists with nested support |
| `CodeBlock` | Monospace code blocks |
| `Underline` | Underline formatting |
| `Link` | Clickable hyperlinks |
| `SlashCommands` (custom) | Slash command palette triggered by `/` |

### Slash commands

The custom `SlashCommands` extension (in `src/lib/components/notes/extensions/slash-commands.ts`) uses `@tiptap/suggestion` to detect `/` input and show a floating dropdown. Available commands: Text, Heading 1-4, Bullet List, To-do List, Code Block. The dropdown supports keyboard navigation (arrow keys + Enter) and mouse selection.

### Editor toolbar

An `EditorToolbar` component provides a floating bubble toolbar for inline formatting when text is selected.

### Why Tiptap here

Tiptap provides the right abstraction level: full control over the editor's behavior and appearance without dealing with ProseMirror's low-level API directly. Its extension system makes it easy to add slash commands, collaboration, and task lists. The headless approach means the editor's UI is built with Svelte components rather than opaque library widgets.

**Docs:** [tiptap.dev/docs](https://tiptap.dev/docs)

---

## y-prosemirror

### What it is

`y-prosemirror` is the bridge between Yjs and ProseMirror (which Tiptap wraps). It provides ProseMirror plugins that bind the editor's document model to a Yjs shared type, enabling real-time collaborative editing.

### Key components

**Sync plugin.** Maps ProseMirror transactions to Yjs operations and vice versa. When the user types, the sync plugin converts the ProseMirror transaction into a Yjs update. When a remote Yjs update arrives, the sync plugin converts it back into a ProseMirror transaction and applies it to the editor.

**Cursor plugin.** Renders remote users' cursor positions and selections as colored overlays in the editor. Powered by Yjs's awareness protocol.

**Undo manager.** Provides collaborative-aware undo/redo. Unlike ProseMirror's built-in history (which tracks all changes), the Yjs undo manager only undoes the current user's changes -- it will not undo another user's edits.

### How it is used here

The `@tiptap/extension-collaboration` extension wraps `y-prosemirror` internally. When configured with `Collaboration.configure({ fragment: content })`, it:

1. Creates a `ySyncPlugin` that binds the Yjs `XmlFragment` to ProseMirror's document model.
2. Replaces ProseMirror's built-in history with Yjs's undo manager (which is why `history: false` is set on StarterKit).
3. Handles bidirectional sync: local edits become Yjs updates, remote Yjs updates become ProseMirror transactions.

### Why y-prosemirror here

It is the standard bridge for connecting Yjs to any ProseMirror-based editor. Without it, you would need to manually translate between ProseMirror's document model and Yjs's shared types -- a complex and error-prone task.

**Docs:** [github.com/yjs/y-prosemirror](https://github.com/yjs/y-prosemirror)

---

## stellar-drive

### What it is

`stellar-drive` is an npm package that encapsulates the shared infrastructure used by this app. It is the engine layer that sits between SvelteKit and Supabase/Dexie.

### What it provides

**`initEngine(config)`** -- bootstraps the entire system: connects Dexie, initializes Supabase, starts the sync engine, and resolves the initial auth state. Called once in `+layout.ts`.

**Auth utilities** -- `setupSingleUser`, `unlockSingleUser`, `lockSingleUser`, `linkSingleUserDevice`, `pollDeviceVerification`, `completeDeviceVerification`. These implement the full PIN-based auth flow including offline hash verification, rate limiting, device trust, and BroadcastChannel cross-tab communication.

**CRDT utilities** -- `openDocument`, `closeDocument`, `createBlockDocument`. These manage Yjs document lifecycle: opening a document loads its state from IndexedDB, connects to Supabase Broadcast for real-time sync, and returns shared types (`XmlFragment`, `Map`) for the editor.

**SvelteKit factory functions** -- `resolveRootLayout`, `hydrateAuthState`, `monitorSwLifecycle`, `handleSwUpdate`.

**Svelte stores** -- `authState`, `isOnline`, `hasHydrated`, `wasDbReset`, `onSyncComplete`.

**Data API** -- `engineCreate`, `engineUpdate`, `engineDelete`, `queryAll`, `queryOne`, `queryByIndex`. Generic CRUD operations against the sync engine.

**Collection and detail stores** -- `createCollectionStore`, `createDetailStore`. Svelte-compatible reactive stores that auto-refresh on sync-complete events.

**Vite plugin (`stellarPWA`)** -- schema code generation, service worker generation, asset manifest generation.

**Config system** -- `getConfig`, `setConfig`, `getServerConfig`. Runtime configuration stored in IndexedDB.

### Import paths

| Import path | What it provides |
|------------|-----------------|
| `stellar-drive` | `initEngine`, `supabase`, `sendDeviceVerification` |
| `stellar-drive/auth` | Auth functions |
| `stellar-drive/crdt` | `openDocument`, `closeDocument`, `createBlockDocument` |
| `stellar-drive/data` | CRUD operations |
| `stellar-drive/stores` | Svelte stores |
| `stellar-drive/kit` | SvelteKit helpers |
| `stellar-drive/vite` | `stellarPWA` Vite plugin |
| `stellar-drive/config` | Config management |
| `stellar-drive/utils` | `debug`, utility functions |
| `stellar-drive/types` | TypeScript type exports |
| `stellar-drive/components/DemoBanner` | Demo banner component |
| `stellar-drive/components/SyncStatus` | Sync status indicator component |

### Why a separate package

The same auth system, sync engine, and service worker infrastructure is used across multiple apps. Extracting it into a package means bug fixes propagate to all apps at once. The package is versioned with semver.

**Docs:** [npmjs.com/package/stellar-drive](https://www.npmjs.com/package/stellar-drive)

---

## TypeScript

### What it is

TypeScript is JavaScript with a type system. The compiler checks types at build time and reports errors before the code runs in a browser.

### Why it matters here

In a local-first app, data flows through many layers: schema definition, generated types, Dexie, sync engine, Supabase, SvelteKit load functions, and Svelte components. TypeScript ensures that a record from IndexedDB has exactly the fields the template expects. If you rename a field in the schema, TypeScript immediately highlights every place that needs updating.

### Generated types

The `stellarPWA` plugin reads `src/lib/schema.ts` and generates `src/lib/types.generated.ts`. Each table becomes a TypeScript interface with all columns typed.

### Type narrowing with Omit + extend

Generated types use wide types (`string`, `unknown`) for flexibility. To narrow them in app code:

```ts
// src/lib/types.ts
import type { Note as GenNote } from './types.generated';
export interface Note extends Omit<GenNote, 'content'> {
  content: Uint8Array | null; // Yjs binary document
}
```

### Schema field types

| Schema type | TypeScript | SQL |
|-------------|-----------|-----|
| `'string'` | `string` | `text` |
| `'number'` | `number` | `double precision` |
| `'boolean'` | `boolean` | `boolean` |
| `'uuid'` | `string` | `uuid` |
| `'date'` | `string` | `date` |
| `'timestamp'` | `string` | `timestamptz` |
| `'json'` | `unknown` | `jsonb` |
| `'string?'` | `string \| null` | `text` (nullable) |
| `['a', 'b']` | `'a' \| 'b'` | enum type |

**Docs:** [typescriptlang.org](https://www.typescriptlang.org/docs)

---

## Service Workers

### What a service worker is

A service worker is a JavaScript file that runs in the browser's background. It acts as a programmable network proxy: it can intercept every `fetch` request and respond from a cache, from the network, or a combination.

### Lifecycle

1. **Install** -- the browser downloads and installs the new SW. Critical assets are pre-cached.
2. **Waiting** -- if an active SW exists, the new one waits for all tabs to close.
3. **Activate** -- the new SW takes control. Old caches are cleaned up.
4. **Fetch** -- the active SW intercepts all network requests.

### Caching strategies

| URL pattern | Strategy | Reason |
|-------------|----------|--------|
| `/_app/immutable/**` | Cache-first | Content hash guarantees freshness |
| `/_app/version.json` | Network-first | Version check needs latest value |
| `/*.html` (navigation) | Network-first + offline fallback | Fresh content when online |
| `/api/**` | Network-only | API responses must not be cached |
| Supabase URLs | Network-only | Realtime and auth must not be cached |

### Update detection

The `UpdatePrompt` component monitors six signals to detect waiting service workers: initial mount check, `onupdatefound`, `onstatechange`, `visibilitychange`, `online` event, and periodic polling (for iOS standalone mode). When detected, the user sees an update notification. Clicking "Refresh" sends `SKIP_WAITING` to the waiting SW.

### Background pre-caching

After page load, `+layout.svelte` sends `CACHE_URLS` (current page assets) and `PRECACHE_ALL` (all app chunks) to the service worker. This ensures every page is available offline even before the user visits it.

### Chunk error handling

When offline navigation hits an uncached chunk, `+layout.svelte` catches the `unhandledrejection` event and shows a friendly toast instead of a cryptic error.

### Why a custom service worker

The `stellarPWA` plugin generates a purpose-built service worker that precisely matches the SvelteKit chunk structure, implements the background-precaching protocol, and handles the SKIP_WAITING update flow.

**Docs:** [developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

## Schema-Driven Workflow

### Overview

One file -- `src/lib/schema.ts` -- is the single source of truth for the entire data model. Editing it automatically propagates changes to three systems.

### The schema file

```ts
// src/lib/schema.ts
import type { SchemaDefinition } from 'stellar-drive/types';

export const schema: SchemaDefinition = {
  notes: {
    indexes: 'parent_note_id, order, is_trashed',
    fields: {
      title: 'string',
      icon: 'string?',
      parent_note_id: 'uuid?',
      order: 'number',
      last_edited_at: 'timestamp',
      last_edited_by: 'string?',
      created_by: 'string?',
      is_locked: 'boolean',
      is_trashed: 'boolean'
    }
  }
};
```

### System columns

Every table automatically gets these system columns:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `uuid` (PK) | Generated client-side using `crypto.randomUUID()` |
| `created_at` | `timestamptz` | Record creation timestamp |
| `updated_at` | `timestamptz` | Last modification timestamp (sync cursor) |
| `deleted` | `boolean` | Soft-delete flag (tombstone) |
| `_version` | `integer` | Optimistic concurrency version |
| `device_id` | `uuid` | Which device last wrote this record |

### What changes on save

In dev mode, every save to `src/lib/schema.ts` triggers (with a 500ms debounce):

1. **`src/lib/types.generated.ts`** is regenerated with one TypeScript interface per table.
2. **Supabase** receives the full idempotent schema SQL via a direct Postgres connection (`DATABASE_URL`).
3. The next page load auto-upgrades the **Dexie** schema version based on a content hash of the schema definition.

In production (`npm run build`), steps 1 and 2 run once during the Vite `buildStart` hook.
