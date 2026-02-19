# Infinite Notes

An offline-first, self-hosted progressive web app for writing and organizing notes. All data lives in your browser's IndexedDB first and syncs to your own Supabase backend when online. Writes are instant, authentication is PIN-based with no passwords, and the entire app works without a network connection after the first load. Think of it as a personal Notion alternative you can deploy to Vercel in minutes and install on any device as a PWA.

**Live demo:** [notes.prabhas.io](https://notes.prabhas.io) -- try it without creating an account.

> **Technical deep-dive:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for system internals.
> **Framework reference:** See [FRAMEWORKS.md](./FRAMEWORKS.md) for technology explanations.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Quick Start (Self-Hosting)](#quick-start-self-hosting)
4. [Development Setup](#development-setup)
5. [Environment Variables](#environment-variables)
6. [Available Scripts](#available-scripts)
7. [Deployment](#deployment)
8. [Install as a PWA](#install-as-a-pwa)
9. [Demo Mode](#demo-mode)
10. [Debug Tools](#debug-tools)
11. [Schema Workflow](#schema-workflow)
12. [License](#license)

---

## Features

- **Rich text editing** -- Tiptap-powered editor with headings, bullet lists, to-do lists, code blocks, inline formatting (bold, italic, underline, strikethrough, links), and a slash command palette.
- **Slash commands** -- type `/` to insert headings, lists, code blocks, and more from a filterable dropdown.
- **Offline-first** -- reads and writes work without any network connection; changes sync automatically when connectivity returns.
- **CRDT collaboration** -- concurrent edits on multiple devices are merged without conflicts using Yjs conflict-free replicated data types.
- **Real-time sync** -- changes from other devices arrive instantly via Supabase Realtime WebSocket subscriptions.
- **PIN-based auth** -- no passwords. A 6-digit PIN is hashed locally with PBKDF2; the hash never leaves your device.
- **Multi-device** -- link as many devices as you want. Each new device goes through an email-OTP verification flow.
- **PWA installable** -- add to your iOS, Android, or desktop home screen for a native-app experience with full offline support.
- **Self-hosted** -- deploy to your own Vercel + Supabase instance. You own your data entirely.
- **Nested notes** -- organize notes in a hierarchy with parent/child relationships, breadcrumb navigation, and a move-note modal.
- **Schema-driven workflow** -- edit one schema file; TypeScript types, Supabase DDL, and IndexedDB stores all update automatically.
- **Demo mode** -- a fully isolated sandbox at `/demo` with mock data, zero network access, and no account required.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [SvelteKit 2](https://kit.svelte.dev) + [Svelte 5](https://svelte.dev) (runes) |
| Rich text editor | [Tiptap 3](https://tiptap.dev) (ProseMirror wrapper) |
| CRDT engine | [Yjs](https://yjs.dev) + [y-prosemirror](https://github.com/yjs/y-prosemirror) |
| Backend | [Supabase](https://supabase.com) (auth, Postgres, realtime) |
| Local storage | [Dexie.js](https://dexie.org) / IndexedDB |
| Sync engine | [stellar-drive](https://www.npmjs.com/package/stellar-drive) |
| Build tool | [Vite 6](https://vitejs.dev) |
| PWA | Custom service worker via `stellarPWA` Vite plugin |
| Language | TypeScript |
| Hosting | Vercel (frontend) + Supabase (backend) |

---

## Quick Start (Self-Hosting)

1. **Fork** this repository on GitHub.
2. **Deploy to Vercel** -- import the fork from your Vercel dashboard. Leave environment variables empty for now; the app will prompt you to configure them.
3. **Create a Supabase project** at [supabase.com](https://supabase.com). Enable anonymous sign-ins in the Supabase dashboard under Authentication > Providers > Anonymous.
4. **Run the setup wizard** -- visit your deployed Vercel URL. The app detects no configuration and redirects you to `/setup`, where you paste your Supabase URL and publishable key. The wizard validates the connection, sets environment variables on Vercel via the Vercel API, and triggers an automatic redeploy.
5. **Install the PWA** -- once the redeployment completes, reload the app and install it to your home screen for offline access.

---

## Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-username/infinite-notes.git
cd infinite-notes

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your Supabase credentials (see Environment Variables below)

# 4. Start the development server
npm run dev
```

The dev server starts at `http://localhost:5173`. TypeScript types auto-generate and Supabase schema auto-migrates on every save to `src/lib/schema.ts`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the following:

| Variable | Where to find it | Required for |
|----------|-----------------|--------------|
| `PUBLIC_SUPABASE_URL` | Supabase Dashboard > Settings > API > Project URL | Client auth + data access |
| `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase Dashboard > Settings > API > `publishable` key | Client auth + data access |
| `DATABASE_URL` | Supabase Dashboard > Settings > Database > Connection string (URI) | Auto schema sync (dev/build) |

> `DATABASE_URL` is optional for local development. Without it, TypeScript types still auto-generate but Supabase schema sync is skipped. It is only used server-side during builds and is never bundled into client code.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite development server with HMR |
| `npm run build` | Production build (also runs schema sync) |
| `npm run preview` | Preview the production build locally |
| `npm run check` | Type-check with `svelte-check` |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format with Prettier |
| `npm run dead-code` | Detect unused exports with Knip |
| `npm run cleanup` | Auto-fix lint errors and format code |
| `npm run validate` | Full validation: `check` + `lint` + `dead-code` |

---

## Deployment

### Vercel (Recommended)

Set the following environment variables in Vercel (Settings > Environment Variables):

| Variable | Type | Required |
|----------|------|----------|
| `PUBLIC_SUPABASE_URL` | Plain | Yes |
| `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Plain | Yes |
| `DATABASE_URL` | Secret | Yes |

The `stellarPWA` Vite plugin pushes the full idempotent schema SQL to Supabase during every `vite build`. No manual migrations are needed.

### Security note

`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` are public keys protected by Supabase Row Level Security policies, not secrets. `DATABASE_URL` (the Postgres connection string) is only used during the build and never reaches the browser.

---

## Install as a PWA

Infinite Notes is a Progressive Web App -- install it for offline access and an app-like experience.

### iOS (Safari)

1. Open the app in **Safari**.
2. Tap the **Share** button (square with arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**.

### Android (Chrome)

1. Open the app in **Chrome**.
2. Tap the **three-dot menu** (top right).
3. Tap **Add to Home screen** or **Install app**.
4. Confirm the installation.

### Desktop (Chrome / Edge)

1. Open the app in your browser.
2. Click the **install icon** in the address bar.
3. Click **Install**.

Once installed, the app runs as a standalone window with full offline support. The service worker pre-caches all app chunks in the background so every page is available without a network connection.

---

## Demo Mode

Visit `/demo` to try Infinite Notes without creating an account. Demo mode is a completely isolated sandbox:

- **Separate IndexedDB database** -- your real data is never opened or modified.
- **No Supabase connections** -- zero network requests to the backend.
- **Data resets on refresh** -- mock data is re-seeded each time.

---

## Debug Tools

Enable debug mode by setting `infinite_debug_mode` to `'true'` in your browser's `localStorage`:

```js
localStorage.setItem('infinite_debug_mode', 'true');
```

With debug mode enabled:

- **Structured logging** -- the `debug()` utility emits detailed logs for auth events, sync operations, CRDT document lifecycle, and service-worker signals in the browser console.
- **Force sync** -- call `forcePush()` or `forcePull()` from the console to manually trigger outbox drain or remote pull.
- **Auth state inspection** -- the `authState` Svelte store from `stellar-drive/stores` exposes the current `authMode`, `session`, and `offlineProfile`.
- **IndexedDB inspection** -- use the Dexie DevTools browser extension to inspect records, tombstones, and the outbox queue.

---

## Schema Workflow

`src/lib/schema.ts` is the single source of truth for the entire database. Editing it triggers three automatic updates:

1. **TypeScript types** -- auto-generated at `src/lib/types.generated.ts` (do not edit manually).
2. **Supabase schema** -- auto-synced via direct Postgres connection when `DATABASE_URL` is set.
3. **IndexedDB (Dexie)** -- auto-versioned at runtime via hash-based version detection.

See [FRAMEWORKS.md](./FRAMEWORKS.md#schema-driven-workflow) for field type reference and type narrowing patterns.

---

## License

MIT

**Author:** Prabhas Kurapati
