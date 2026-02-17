# Meta Descriptions

Short-form descriptions for GitHub, social media, and search engines.

---

## GitHub Repository Description

Self-hosted offline-first notes PWA with PIN auth, multi-device sync, and CRDT collaborative editing — built with SvelteKit 2, Supabase, and Dexie.js.

---

## 160-Character Meta Description

Infinite Notes: a self-hosted PWA notes app with PIN-based auth, offline-first storage, multi-device sync, and real-time CRDT collaboration. Deploy to Vercel in minutes.

---

## Tweet-Length Summary

I built a self-hosted Notion alternative: offline-first, no passwords (PIN auth), multi-device sync, Yjs CRDTs for conflict-free editing, and installable as a PWA. SvelteKit + Supabase + Dexie.js.

---

## Long Description

Infinite Notes is a self-hosted, offline-first progressive web app for writing and organizing notes. Unlike cloud-dependent note apps, Infinite Notes keeps all your data in IndexedDB locally and syncs to your own Supabase database only when you are online. Writes are instant — they never wait for a network round-trip.

Authentication is PIN-based: no passwords to forget. Your 6-digit PIN is stretched with PBKDF2 and verified entirely on-device; the hash never leaves your browser. Adding a new device requires email OTP verification as a second factor, giving you the security of 2FA without the complexity of an authenticator app. Multiple devices stay in sync through an outbox-pattern sync engine that handles conflicts with a three-tier strategy: timestamp comparison, field-level merge, and Yjs CRDT merging for note content.

The app is built with SvelteKit 2 and Svelte 5 (runes), deployed to Vercel, and uses Supabase for auth, Postgres, and realtime subscriptions. A single schema file drives TypeScript types, Supabase DDL, and IndexedDB versioning automatically — no migration files ever. The service worker, generated at build time, pre-caches every page in the background so the entire app works offline after the first load.
