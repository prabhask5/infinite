# Framework Reference

This document explains every major technology used in Infinite Notes — what it is, why it was chosen, and how it fits into the system. No prior experience is assumed.

---

## Table of Contents

1. [SvelteKit 2](#sveltekit-2)
2. [Svelte 5 (Runes)](#svelte-5-runes)
3. [Supabase](#supabase)
4. [Vite](#vite)
5. [Dexie.js / IndexedDB](#dexiejs--indexeddb)
6. [Yjs CRDTs](#yjs-crdts)
7. [stellar-drive](#stellar-drive)
8. [TypeScript](#typescript)
9. [Service Workers](#service-workers)
10. [Schema-Driven Workflow](#schema-driven-workflow)

---

## SvelteKit 2

### What it is

SvelteKit is a "meta-framework" built on top of Svelte. If Svelte is React, SvelteKit is Next.js — it adds routing, server-side rendering, build tooling, and deployment adapters on top of the core UI library.

### Key concepts

**File-based routing.** Every file you create under `src/routes/` becomes a URL. A file named `src/routes/login/+page.svelte` becomes the `/login` page automatically. No router configuration needed.

**`+page.svelte` vs `+layout.svelte`.** Pages render the content for a single route. Layouts wrap one or more pages and stay mounted across navigations. In this project, `src/routes/+layout.svelte` is the outermost shell — it runs auth hydration and mounts the service-worker update prompt once, then every page renders inside it.

**Load functions (`+layout.ts` / `+page.ts`).** Load functions run before the page renders and provide data to the component. They can run on the server (SSR), in the browser (CSR), or both. In `+layout.ts` the engine is initialized, auth is resolved, and unauthenticated users are redirected to `/login` or `/setup`.

```ts
// src/routes/+layout.ts — simplified
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

**Adapters.** The `svelte.config.js` uses `adapter-auto`, which automatically detects the deployment platform (Vercel, Netlify, Cloudflare, bare Node.js) and generates the appropriate output format. No manual switching between adapters when changing hosts.

**SSR + CSR hybrid.** The app sets `ssr = true` on the root layout so the initial HTML shell is server-rendered for fast first paint. Auth-dependent content is filled in client-side after the load function resolves.

### Why SvelteKit here

SvelteKit's file-based routing and load function model are a natural fit for an app that needs per-route auth guards, a single shared layout, and serverless API endpoints — all without the complexity of a separate backend server.

---

## Svelte 5 (Runes)

### What it is

Svelte is a UI component library with a compiler. Unlike React or Vue, Svelte compiles your components to vanilla JavaScript at build time — no virtual DOM, no runtime framework overhead. In Svelte 5, the reactivity model was rebuilt around "runes": special syntax that tells the compiler exactly what is reactive.

### Key runes

**`$state()`** — declares a reactive variable. When it changes, every part of the template that reads it updates automatically.

```svelte
<script lang="ts">
  let count = $state(0);
</script>
<button onclick={() => count++}>Clicked {count} times</button>
```

**`$derived()`** — declares a value computed from other reactive values. Recalculates automatically when its dependencies change. Think of it as a cached computed property.

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

**`$effect()`** — runs a side effect whenever its reactive dependencies change. Similar to `useEffect` in React but with automatic dependency tracking — you do not need to list dependencies manually.

```ts
// Hydrate auth state whenever layout data changes
$effect(() => {
  hydrateAuthState(data);
});
```

**`$props()`** — declares the props a component receives from its parent. Replaces the old `export let` syntax.

```ts
let { children, data }: Props = $props();
```

### Snippets

Snippets replace the old slot system. A snippet is a reusable chunk of markup that can be passed as a prop, called with `{@render snippetName()}`, or defined inline with `{#snippet name()}`. The root layout renders the matched page with `{@render children?.()}`.

### Components

Each `.svelte` file is a self-contained component with a `<script>` block (logic), template (HTML-like markup), and optional `<style>` block (scoped CSS). Components compose together to build the full UI.

### Why Svelte 5 here

The runes model makes complex reactive state (six simultaneous PIN input states, multi-modal auth flows, real-time sync status) straightforward to express without boilerplate. The compiler output is smaller and faster than React for a PWA where bundle size directly affects offline load time.

---

## Supabase

### What it is

Supabase is an open-source Firebase alternative. It gives you a Postgres database, authentication, real-time subscriptions, file storage, and auto-generated REST/GraphQL APIs — all on top of standard Postgres. You can self-host it or use their managed cloud service.

### Auth with anonymous sign-ins

Infinite Notes uses Supabase Auth in a non-standard way. Rather than traditional email/password or OAuth, the app signs every user in as an anonymous Supabase user on first setup. The user's identity is actually stored in IndexedDB, verified by a PIN hash, and the Supabase anonymous session is used purely to satisfy Row Level Security policies. This means:

- There is no "account" in the traditional sense — no password to forget.
- The Supabase user ID is a stable UUID tied to the device's offline profile.
- Anonymous sessions can be linked to a real email via Supabase's identity linking, which is what happens during device verification.

### Postgres database

Supabase sits on top of a real Postgres database. The schema — tables, columns, indexes, RLS policies, triggers — is managed entirely by the `stellar-drive` Vite plugin. The plugin connects to Postgres directly using the `DATABASE_URL` connection string and pushes idempotent SQL on every build. No migration files, no ORM — just SQL generated from the schema definition in `src/lib/schema.ts`.

### Realtime subscriptions

Supabase Realtime lets clients subscribe to Postgres table changes over a WebSocket. When any device writes a record, Supabase broadcasts the change to all other devices subscribed to that table. The sync engine handles receiving these broadcasts and merging them into the local IndexedDB database.

### Row Level Security (RLS)

RLS is a Postgres feature that lets you attach policies to tables so that each row is only visible to the user who owns it. The engine generates the RLS policies automatically based on the schema. This is the mechanism that prevents one user from reading another user's notes in a shared Supabase project.

### Why Supabase here

Supabase provides a managed Postgres database (with all its consistency guarantees), real-time subscriptions, and auth — without running a separate backend. The free tier is sufficient for a personal notes app. The fact that it is open-source means self-hosting is possible if you want full data sovereignty.

---

## Vite

### What it is

Vite is a modern JavaScript build tool. In development it serves files using native ES modules, so the browser can import them directly without a bundling step — which makes hot-module replacement (HMR) nearly instant. In production it uses Rollup under the hood to bundle and tree-shake everything into optimized static assets.

### Plugin system

Vite's plugin API lets you hook into every stage of the build. This project uses two plugins:

**`sveltekit()`** — the official SvelteKit/Vite integration. It compiles Svelte components, handles SvelteKit's routing conventions, and manages server-side rendering.

**`stellarPWA()`** — from `stellar-drive`. This plugin:
1. Watches `src/lib/schema.ts` and auto-generates TypeScript types on every save (500ms debounce in dev).
2. Pushes the full idempotent schema SQL to Supabase during `buildStart`.
3. Generates the service worker (`static/sw.js`) and asset manifest at build time.

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    sveltekit(),
    stellarPWA({ prefix: 'infinite', name: 'Infinite Notes', schema: true })
  ]
});
```

### Chunk splitting

The Vite config isolates `@supabase` and `dexie` into their own vendor chunks. This means these large but rarely-changing dependencies get their own cache entry in the browser. When you deploy a new version of the app, users only re-download the chunks that actually changed — not the entire bundle.

### HMR

During development, changing a Svelte component triggers an instant update in the browser without a full page reload. Component state is preserved across most edits. This dramatically shortens the feedback loop when building UI.

### Why Vite here

Vite is the default choice for SvelteKit and provides the fastest possible development experience. The plugin API made it possible to wire the schema-driven workflow directly into the build pipeline without any external tooling.

---

## Dexie.js / IndexedDB

### What IndexedDB is

IndexedDB is a browser-native database. It is a key-value store with support for indexes, transactions, and large datasets — unlike `localStorage`, which is limited to small strings. Every major browser (Chrome, Firefox, Safari, Edge) ships it built-in, with no installation required.

IndexedDB is the foundation of "local-first" architecture: all reads and writes go to the local database first, then sync to the server in the background.

### What Dexie.js is

Dexie is a wrapper library that makes IndexedDB pleasant to use. The raw IndexedDB API is callback-based and verbose. Dexie gives you:

- Promise-based API (`await db.table('notes').get(id)`)
- Reactive live queries that re-run when data changes
- Schema versioning with automatic database upgrades
- Full TypeScript support

### How it is used here

The sync engine (`stellar-drive`) creates and manages a Dexie instance. The schema you define in `src/lib/schema.ts` becomes the Dexie store definition. Each table in the schema gets an IndexedDB object store with the specified indexes plus a set of system columns: `id`, `created_at`, `updated_at`, `deleted`, `_version`, `device_id`.

When you write a record, it goes into IndexedDB immediately and the write resolves. Syncing to Supabase happens asynchronously in the background. This means the UI is always responsive — there is no "waiting for the network" to save.

### Offline storage

IndexedDB persists across page refreshes and browser restarts. A user can close the app on a plane, reopen it without internet, edit notes, and their changes will be waiting in IndexedDB when connectivity returns. The outbox pattern (see ARCHITECTURE.md) handles pushing those queued writes to Supabase.

### Demo mode isolation

In demo mode, the engine opens a separate IndexedDB database named `${appPrefix}_demo` instead of the real database. The real database is never opened. This complete isolation means demo users cannot accidentally pollute or read real data.

### Why Dexie here

Dexie is the de-facto standard for IndexedDB in TypeScript projects. Its reactive query system integrates naturally with Svelte's reactivity model — a live query returning notes from IndexedDB will automatically trigger a Svelte re-render when the underlying data changes.

---

## Yjs CRDTs

### What a CRDT is

CRDT stands for Conflict-free Replicated Data Type. It is a data structure designed so that multiple users can make concurrent edits — even while offline — and the edits will always merge into the same final state, without any manual conflict resolution.

The classic conflict in collaborative editing: two users both edit the same paragraph while offline. When they reconnect, whose version wins? A CRDT avoids the conflict entirely by encoding every edit as a commutative operation that can be applied in any order and still produce the same result.

### What Yjs is

Yjs is a high-performance CRDT implementation written in JavaScript. It supports:

- `Y.Text` — a collaborative text type that handles character-level insertions and deletions
- `Y.Map` and `Y.Array` — collaborative key-value and list types
- **Awareness** — a lightweight ephemeral state channel for cursor positions, selections, and "who is online" indicators
- Binary encoding — Yjs serializes its state to a compact binary format (Uint8Array) suitable for storing in a database or transmitting over a network

### How it fits in Infinite Notes

Each note's content is stored as a Yjs `Y.Doc`. When a user types, Yjs generates an "update" — a binary diff that describes only the changes. These updates can be:

- Stored in IndexedDB alongside the note record
- Synced to Supabase as binary blobs
- Merged on other devices: applying a Yjs update is idempotent and order-independent

If a user edits a note while offline and another user edits the same note on a different device, both sets of Yjs updates get synced when connectivity returns. Yjs merges them automatically at the character level, producing a result that incorporates both users' changes.

### Awareness protocol

Yjs's awareness channel transmits ephemeral state (cursor position, user name, current selection) without writing to the database. This is how "user X is editing here" indicators work in collaborative editors. The awareness state lives only in memory and is broadcast over WebSockets — it does not need to be persisted.

### Offline CRDT merging

One of the most important properties of Yjs: updates can be merged even when received out of order or after a long offline period. There is no "rebasing" or "conflict resolution UI". The merge is deterministic and automatic. Two devices that have been offline for a week can sync and converge without any human intervention.

### Binary encoding for storage

Yjs documents are encoded as compact binary (Uint8Array). This binary blob is stored in the `content` field of a note record in IndexedDB and synced to Supabase as a `bytea` column. The field type in the schema would be `'json'` or a custom binary type, and the app-level types layer handles encoding/decoding.

### Why Yjs here

Yjs is the most mature, best-documented, and most widely used CRDT library in the JavaScript ecosystem. It powers collaborative editing in Notion, Linear, and dozens of other tools. For a notes app where users may edit on multiple devices, a CRDT is the only correct solution — timestamps and last-write-wins policies both discard data.

---

## stellar-drive

### What it is

`stellar-drive` is an npm package that encapsulates the shared infrastructure used by this app. It is the engine layer that sits between SvelteKit and Supabase/Dexie.

### What it provides

**`initEngine(config)`** — bootstraps the entire system: connects Dexie, initializes Supabase, starts the sync engine, and resolves the initial auth state. Called once in `+layout.ts`.

**Auth utilities** — `setupSingleUser`, `unlockSingleUser`, `lockSingleUser`, `linkSingleUserDevice`, `pollDeviceVerification`, `completeDeviceVerification`. These functions implement the full PIN-based auth flow including offline hash verification, rate limiting, device trust, and BroadcastChannel cross-tab communication.

**SvelteKit factory functions** — `resolveRootLayout`, `hydrateAuthState`, `monitorSwLifecycle`, `handleSwUpdate`. These are thin wrappers that integrate the engine with SvelteKit's load/render lifecycle.

**Svelte stores** — `authState` (object store with `mode`, `session`, `offlineProfile`, `isLoading`), `isOnline`, `onSyncComplete`. These are standard Svelte stores that components can subscribe to.

**Vite plugin (`stellarPWA`)** — schema code generation, service worker generation, asset manifest generation. Hooks into Vite's plugin lifecycle.

**UI components** — `DemoBanner` (shown in demo mode), `UpdatePrompt` pattern utilities. Consumed in `+layout.svelte`.

**Config system** — `getConfig`, `setConfig`, `getServerConfig`. Manages runtime configuration stored in IndexedDB and served from `GET /api/config`.

### Why a separate package

The same auth system, sync engine, and service worker infrastructure is used across multiple apps. Extracting it into a package means bug fixes and improvements propagate to all apps at once. The package is versioned with semver, so each app can upgrade on its own schedule.

### Import paths

`stellar-drive` uses subpath exports:

| Import path | What it provides |
|------------|-----------------|
| `stellar-drive` | `initEngine`, `supabase`, `sendDeviceVerification` |
| `stellar-drive/auth` | Auth functions (`setupSingleUser`, `unlockSingleUser`, etc.) |
| `stellar-drive/stores` | Svelte stores (`authState`, `isOnline`, etc.) |
| `stellar-drive/kit` | SvelteKit helpers (`resolveRootLayout`, `hydrateAuthState`, etc.) |
| `stellar-drive/vite` | `stellarPWA` Vite plugin |
| `stellar-drive/config` | `getConfig`, `setConfig`, `getServerConfig` |
| `stellar-drive/utils` | `debug`, utility functions |
| `stellar-drive/types` | TypeScript type exports |
| `stellar-drive/components/DemoBanner` | Demo banner Svelte component |

---

## TypeScript

### What it is

TypeScript is JavaScript with a type system. You annotate variables, function parameters, and return values with types. The TypeScript compiler (`tsc`) checks these types at build time and reports errors before the code ever runs in a browser.

### Why it matters here

In a local-first app, data flows through many layers: the schema definition, the generated types, Dexie, the sync engine, Supabase, SvelteKit load functions, and Svelte components. TypeScript ensures that a record from IndexedDB has exactly the fields the template expects — if you rename a field in the schema, TypeScript will immediately highlight every place in the code that needs updating.

### Generated types

The `stellarPWA` Vite plugin reads `src/lib/schema.ts` and generates `src/lib/types.generated.ts`. Each table in the schema becomes a TypeScript interface with all columns typed:

```ts
// Generated — do not edit
export interface Note {
  id: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
  _version: number;
  device_id: string;
  title: string;
  content: unknown; // json field
}
```

### Type narrowing with Omit + extend

Generated types use wide types (`string`, `unknown`) for flexibility. To narrow them in app code, use the `Omit` + extend pattern:

```ts
// src/lib/types.ts
import type { Note as GenNote } from './types.generated';
export interface Note extends Omit<GenNote, 'content'> {
  content: Uint8Array | null; // Yjs binary document
}
```

### Interfaces vs types

Svelte 5's `$props()` rune works best with `interface Props { ... }` declarations. The codebase uses `interface` for component props and `type` for union types and utility aliases.

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

---

## Service Workers

### What a service worker is

A service worker is a JavaScript file that runs in the browser's background — separate from the page. It acts as a programmable network proxy: it can intercept every `fetch` request the page makes and respond from a cache, from the network, or from a combination of both.

Service workers are the foundation of offline PWA functionality. Without them, every page load and every API call requires a network connection.

### Lifecycle

A service worker goes through several lifecycle stages:

1. **Install** — the browser downloads and installs the new service worker. During this phase, the SW typically pre-caches critical assets.
2. **Waiting** — if there is already an active service worker, the new one waits for all tabs using the old SW to be closed.
3. **Activate** — the new service worker takes control. Old caches are cleaned up.
4. **Fetch** — the active SW intercepts all network requests from controlled pages.

The update prompt in `src/lib/components/UpdatePrompt.svelte` detects when a new SW is in the waiting state and asks the user to refresh. The `monitorSwLifecycle` utility from `stellar-drive/kit` wires up six separate detection signals (state changes, update events, visibility changes, connectivity events, periodic polling, and initial mount checks) to catch updates reliably across browsers and iOS standalone mode.

### Caching strategies

The service worker generated by `stellarPWA` uses three strategies:

**Immutable asset caching.** SvelteKit outputs JavaScript and CSS files with content hashes in their filenames (e.g., `_app/immutable/chunks/abc123.js`). The service worker caches these files indefinitely — the hash guarantees a new filename whenever the content changes, so stale responses are never possible.

**Versioned shell caching.** The HTML page, `manifest.json`, and icons are cached with a version key. When a new version deploys, the version key changes and the old cache entries are replaced.

**Network-first navigation.** When the user navigates to a URL, the service worker tries the network first. If the network fails (offline), it falls back to the cached HTML shell. The SvelteKit client-side router then handles rendering the correct page from locally cached JavaScript.

### Background pre-caching

After the page loads, `+layout.svelte` sends two messages to the service worker:

1. `CACHE_URLS` — cache the scripts and stylesheets used by the current page.
2. `PRECACHE_ALL` — walk the asset manifest and cache every chunk for every route.

This "background precaching" ensures the entire app is available offline even for pages the user has not visited yet. It runs after the initial page paint to avoid affecting Lighthouse performance scores.

### Chunk error handling

When the user is offline and navigates to a page whose JavaScript has not been cached yet, the dynamic import fails. `+layout.svelte` listens for `unhandledrejection` events and shows a friendly "This page is not available offline" toast instead of letting the cryptic chunk-load error surface to the user.

### Why a custom service worker

PWA frameworks like Workbox generate service workers, but they often add complexity and assumptions. The `stellarPWA` plugin generates a purpose-built service worker that precisely matches the SvelteKit chunk structure, implements the background-precaching protocol, and handles the SKIP_WAITING update flow.

---

## Schema-Driven Workflow

### Overview

The schema-driven workflow is the defining architectural pattern of Infinite Notes. One file — `src/lib/schema.ts` — is the single source of truth for the entire data model. Editing it automatically propagates changes to three systems.

### The schema file

```ts
// src/lib/schema.ts
import type { SchemaDefinition } from 'stellar-drive/types';

export const schema: SchemaDefinition = {
  notes: {
    indexes: 'updated_at',
    fields: {
      title: 'string',
      content: 'json',
      pinned: 'boolean',
    },
  },
  tags: 'name',
};
```

Each key is a table name. The value is either a Dexie index string or an object with `indexes` and `fields`.

### System columns

Every table automatically gets these system columns:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `uuid` (PK) | Stable identifier, generated client-side |
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

In production (`npm run build`), steps 1 and 2 run once during the Vite `buildStart` hook, ensuring the Supabase schema is always up to date after a Vercel deploy.
