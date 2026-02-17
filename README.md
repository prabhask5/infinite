# Infinite Notes

A self-hosted, offline-first PWA notes app with PIN-based authentication and multi-device sync.

**Live demo:** [notes.prabhas.io](https://notes.prabhas.io) — try it before self-hosting.

> **Technical deep-dive:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for system internals.
> **Framework reference:** See [FRAMEWORKS.md](./FRAMEWORKS.md) for technology explanations.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Features](#features)
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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [SvelteKit 2](https://kit.svelte.dev) + [Svelte 5](https://svelte.dev) (runes) |
| Backend | [Supabase](https://supabase.com) (auth, Postgres, realtime) |
| Local storage | [Dexie.js](https://dexie.org) / IndexedDB |
| Sync engine | [stellar-drive](https://www.npmjs.com/package/stellar-drive) |
| Build tool | [Vite 6](https://vitejs.dev) |
| PWA | Custom service worker via `stellarPWA` Vite plugin |
| Language | TypeScript |
| Hosting | Vercel (frontend) + Supabase (backend) |

---

## Features

- **Offline-first** — reads and writes work without any network connection; changes sync automatically when you come back online.
- **PIN-based auth** — no passwords. A 6-digit PIN is salted and hashed locally; the hash never leaves your device in plaintext.
- **Multi-device** — link as many devices as you want. Each new device goes through an email-OTP trust flow before it can access your data.
- **CRDT collaboration** — concurrent edits on multiple devices are merged without conflicts using Yjs conflict-free replicated data types.
- **PWA installable** — add to your iOS/Android/desktop home screen for a native-app experience with full offline support.
- **Self-hosted** — deploy to your own Vercel + Supabase instance in minutes. You own your data entirely.
- **Schema-driven workflow** — edit one schema file; TypeScript types, Supabase DDL, and IndexedDB stores all update automatically.
- **Demo mode** — a fully isolated sandbox at `/demo` with mock data, zero network access, and no account required.
- **Diagnostics dashboard** — real-time sync engine statistics, queue state, realtime connection health, and egress monitoring (debug mode).

---

## Quick Start (Self-Hosting)

1. **Fork** this repository on GitHub.
2. **Deploy to Vercel** — import the fork from your Vercel dashboard. Leave environment variables empty for now; the app will prompt you to configure them.
3. **Create a Supabase project** at [supabase.com](https://supabase.com). Enable anonymous sign-ins in the Supabase dashboard under Authentication → Providers → Anonymous.
4. **Run the setup wizard** — visit your deployed Vercel URL. The app detects no configuration and redirects you to `/setup`, where you paste your Supabase URL and publishable key. The wizard validates the connection, sets environment variables on Vercel via the Vercel API, and triggers an automatic redeploy.
5. **Install the PWA** — once the redeployment completes, reload the app and install it to your home screen for offline access.

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
| `PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL | Client auth + data access |
| `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase Dashboard → Settings → API → `publishable` key | Client auth + data access |
| `DATABASE_URL` | Supabase Dashboard → Settings → Database → Connection string (URI) | Auto schema sync (dev/build) |

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

Set the following environment variables in Vercel (Settings → Environment Variables):

| Variable | Type | Required |
|----------|------|----------|
| `PUBLIC_SUPABASE_URL` | Plain | Yes |
| `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Plain | Yes |
| `DATABASE_URL` | Secret | Yes — enables auto schema sync on deploy |

The `stellarPWA` Vite plugin pushes the full idempotent schema SQL to Supabase during every `vite build`. No manual migrations are needed; `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements make the process safe to re-run on every deploy.

### Security note

`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` are served to clients at runtime via `GET /api/config`. These are public keys protected by Supabase Row Level Security policies, not secrets. `DATABASE_URL` (the Postgres connection string) is only used during the build and never reaches the browser.

---

## Install as a PWA

Infinite Notes is a Progressive Web App — install it for offline access and an app-like experience.

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
2. Click the **install icon** in the address bar (or look for an install prompt).
3. Click **Install**.

Once installed, the app runs as a standalone window with full offline support. The service worker pre-caches all app chunks in the background so every page is available without a network connection.

---

## Demo Mode

Visit `/demo` to try Infinite Notes without creating an account. Demo mode is a completely isolated sandbox:

- **Separate IndexedDB database** — your real data is never opened or modified.
- **No Supabase connections** — zero network requests to the backend.
- **Data resets on refresh** — mock data is re-seeded from `src/lib/demo/mockData.ts` each time.

To customize the demo experience:

- Edit `src/lib/demo/mockData.ts` to populate the demo database with app-specific mock data.
- Edit `src/lib/demo/config.ts` to customize the mock user profile (name, email).

---

## Debug Tools

When running in development mode, the `stellar-drive` engine exposes debug utilities:

- **Debug logging** — the `debug()` utility from `stellar-drive/utils` emits structured logs for auth events, sync operations, and service-worker lifecycle signals. Check your browser console.
- **Force sync** — call `forcePush()` or `forcePull()` from the browser console to manually trigger the outbox sync or pull the latest changes from Supabase.
- **Tombstone inspection** — soft-deleted records are retained with a `deleted: true` flag. Use the Dexie DevTools browser extension to inspect tombstones in IndexedDB directly.
- **Auth state** — the `authState` Svelte store from `stellar-drive/stores` exposes the current `authMode`, `session`, and `offlineProfile`. Inspect it in Svelte DevTools.

---

## Schema Workflow

`src/lib/schema.ts` is the single source of truth for the entire database. Editing it triggers three automatic updates:

1. **TypeScript types** — auto-generated at `src/lib/types.generated.ts` (do not edit this file manually).
2. **Supabase schema** — auto-synced via direct Postgres connection when `DATABASE_URL` is set.
3. **IndexedDB (Dexie)** — auto-versioned at runtime via a hash-based version detection scheme.

The full idempotent schema SQL is pushed on every build. No snapshots, no migration files — just one schema file that is always the truth.

See [FRAMEWORKS.md](./FRAMEWORKS.md#schemadrivenworkflow) for field type reference and the `Omit` + extend pattern for type narrowing.

---

## Extension

The sync engine, auth system, schema-driven workflow, service worker utilities, and shared UI components are packaged separately as [`stellar-drive`](https://www.npmjs.com/package/stellar-drive). Infinite Notes is one of the apps built on top of that shared infrastructure.

---

## License

MIT — see [LICENSE](./LICENSE) for details.

**Author:** Prabhas Kurapati
