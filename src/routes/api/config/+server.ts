/**
 * Config API Endpoint — `GET /api/config`
 *
 * Returns the runtime configuration object (Supabase URL, publishable key, app
 * settings) that the client fetches on first load via `initConfig()`.
 */

import { json } from '@sveltejs/kit';
import { getServerConfig } from 'stellar-drive/kit';
import type { RequestHandler } from './$types';

/**
 * Serve the runtime config as JSON.
 *
 * @returns A JSON response containing the server-side config object.
 */
export const GET: RequestHandler = async () => {
  return json(getServerConfig());
};
