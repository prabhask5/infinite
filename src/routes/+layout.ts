/**
 * @fileoverview Root layout loader — engine bootstrap + auth resolution.
 *
 * Runs on every navigation. In the browser it initialises runtime config,
 * resolves the current auth state (online session or offline credentials),
 * and starts the sync engine when the user is authenticated.
 */

// =============================================================================
//                                  IMPORTS
// =============================================================================

import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { goto } from '$app/navigation';
import { initEngine } from 'stellar-drive';
import { lockSingleUser } from 'stellar-drive/auth';
import { resolveRootLayout } from 'stellar-drive/kit';
import { schema } from '$lib/schema';
import { demoConfig } from '$lib/demo/config';
import type { RootLayoutData } from 'stellar-drive/kit';
import type { LayoutLoad } from './$types';

// =============================================================================
//                          SVELTEKIT ROUTE CONFIG
// =============================================================================

/** Allow server-side rendering for initial page load performance. */
export const ssr = true;
/** Disable prerendering — pages depend on runtime auth state. */
export const prerender = false;

// =============================================================================
//                             TYPE RE-EXPORTS
// =============================================================================

/** Re-export the root layout data type so `+layout.svelte` can import it. */
export type { RootLayoutData as LayoutData };

// =============================================================================
//                          ENGINE BOOTSTRAP
// =============================================================================

/**
 * Initialize the sync engine at module scope (runs once on first navigation).
 * The schema in $lib/schema.ts is the single source of truth — it drives:
 *   - Dexie (IndexedDB) stores and versioning
 *   - TypeScript types auto-generated at src/lib/types.generated.ts
 *   - Supabase schema auto-migrated during `npm run dev`
 */
if (browser) {
  initEngine({
    prefix: 'infinite',
    schema,
    auth: { gateType: 'code' },
    demo: demoConfig,
    onAuthStateChange: (_event, _session) => {
      // TODO: Handle auth events (e.g., analytics, logging)
    },
    onAuthKicked: async () => {
      await lockSingleUser();
      goto('/login');
    }
  });
}

// =============================================================================
//                         PUBLIC ROUTES
// =============================================================================

/** Routes accessible without authentication. */
const PUBLIC_ROUTES = ['/policy', '/login', '/demo', '/confirm', '/setup'];

// =============================================================================
//                            LOAD FUNCTION
// =============================================================================

/**
 * Root layout load — initialises config, resolves auth, and starts sync.
 *
 * @param params - SvelteKit load params (provides the current URL).
 * @returns Layout data with session and auth state.
 */
export const load: LayoutLoad = async ({ url }): Promise<RootLayoutData> => {
  if (browser) {
    const result = await resolveRootLayout();

    const isPublicRoute = PUBLIC_ROUTES.some((r) => url.pathname.startsWith(r));
    if (result.authMode === 'none' && !isPublicRoute) {
      if (!result.serverConfigured) {
        redirect(307, '/setup');
      } else {
        const returnUrl = url.pathname + url.search;
        const loginUrl =
          returnUrl && returnUrl !== '/'
            ? `/login?redirect=${encodeURIComponent(returnUrl)}`
            : '/login';
        redirect(307, loginUrl);
      }
    }

    return result;
  }

  /* SSR fallback — no auth info available on the server */
  return { session: null, authMode: 'none', offlineProfile: null, serverConfigured: false };
};
