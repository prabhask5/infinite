/**
 * @fileoverview Vite build configuration for the Infinite PWA.
 *
 * This config handles three key concerns:
 *   1. SvelteKit integration — via the official `sveltekit()` plugin
 *   2. Service worker + asset manifest — via the `stellarPWA()` plugin from
 *      stellar-drive, which generates `static/sw.js` and `asset-manifest.json`
 *      at build time
 *   3. Chunk-splitting — isolates heavy vendor libs (`@supabase`, `dexie`)
 *      into their own bundles for long-term caching
 */

// =============================================================================
//                                  IMPORTS
// =============================================================================

import { sveltekit } from '@sveltejs/kit/vite';
import { stellarPWA } from 'stellar-drive/vite';
import { defineConfig } from 'vite';

// =============================================================================
//                            VITE CONFIGURATION
// =============================================================================

export default defineConfig({
  plugins: [
    sveltekit(),
    stellarPWA({ prefix: 'infinite', name: 'Infinite Notes', schema: { includeCRDT: true } })
  ],
  build: {
    rollupOptions: {
      output: {
        /* ── Vendor chunk isolation ── */
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            /** Supabase auth + realtime — ~100 KB gzipped */
            if (id.includes('@supabase')) return 'vendor-supabase';
            /** Dexie (IndexedDB wrapper) — offline-first storage layer */
            if (id.includes('dexie')) return 'vendor-dexie';
            /** Tiptap + ProseMirror — rich text editor */
            if (id.includes('tiptap') || id.includes('prosemirror')) return 'vendor-tiptap';
            /** Yjs + y-prosemirror — CRDT collaboration layer */
            if (id.includes('yjs') || id.includes('y-prosemirror')) return 'vendor-yjs';
          }
        }
      }
    },
    /** Reduce noise — only warn for chunks above 500 KB */
    chunkSizeWarningLimit: 500,
    /** esbuild is faster than terser and produces comparable output */
    minify: 'esbuild',
    /** Target modern browsers → enables smaller output (no legacy polyfills) */
    target: 'es2020'
  }
});
