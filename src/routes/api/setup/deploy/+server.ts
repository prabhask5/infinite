/**
 * Vercel Deploy API Endpoint — `POST /api/setup/deploy`
 *
 * Accepts Supabase credentials and a Vercel token, then sets the
 * corresponding environment variables on the Vercel project and triggers
 * a redeployment so the new config takes effect.
 */

import { json } from '@sveltejs/kit';
import { deployToVercel } from 'stellar-drive/kit';
import type { RequestHandler } from './$types';

/**
 * Deploy Supabase credentials to Vercel environment variables.
 *
 * @param params - SvelteKit request event.
 * @returns JSON result with success/failure and optional error message.
 */
export const POST: RequestHandler = async ({ request }) => {
  /* ── Parse and validate request body ── */
  const { supabaseUrl, supabasePublishableKey, vercelToken } = await request.json();

  if (!supabaseUrl || !supabasePublishableKey || !vercelToken) {
    return json(
      { success: false, error: 'Supabase URL, Publishable Key, and Vercel Token are required' },
      { status: 400 }
    );
  }

  /* ── Ensure we're running on Vercel ── */
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId) {
    return json(
      { success: false, error: 'VERCEL_PROJECT_ID not found. This endpoint only works on Vercel.' },
      { status: 400 }
    );
  }

  /* ── Delegate to engine ── */
  const result = await deployToVercel({
    vercelToken,
    projectId,
    supabaseUrl,
    supabasePublishableKey
  });
  return json(result);
};
