/**
 * @fileoverview Link preview API endpoint.
 *
 * POST endpoint that accepts a URL, fetches the page, and extracts
 * Open Graph metadata (title, description, image, favicon).
 * Server-side fetch avoids CORS issues.
 *
 * Request: POST { url: string }
 * Response: { url, title, description, image, favicon, domain }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as cheerio from 'cheerio';

/** Response cache: URL → { data, timestamp } */
const cache = new Map<string, { data: LinkPreviewData; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string | null;
  favicon: string | null;
  domain: string;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const url = body?.url;

    if (!url || typeof url !== 'string') {
      return json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Check cache
    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return json(cached.data);
    }

    // Fetch page with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; InfiniteNotes/1.0; +https://infinite.notes)',
          Accept: 'text/html'
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return json({ error: `Fetch failed: ${response.status}` }, { status: 502 });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract OG data
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      parsedUrl.hostname;

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null;

    // Resolve relative image URLs
    const resolvedImage = image ? new URL(image, url).href : null;

    // Favicon
    const faviconHref =
      $('link[rel="icon"]').attr('href') ||
      $('link[rel="shortcut icon"]').attr('href') ||
      '/favicon.ico';
    const favicon = new URL(faviconHref, url).href;

    const data: LinkPreviewData = {
      url,
      title: title.trim().substring(0, 200),
      description: description.trim().substring(0, 500),
      image: resolvedImage,
      favicon,
      domain: parsedUrl.hostname
    };

    // Cache result
    cache.set(url, { data, timestamp: Date.now() });

    // Prune old cache entries
    if (cache.size > 100) {
      const now = Date.now();
      for (const [key, val] of cache) {
        if (now - val.timestamp > CACHE_TTL) cache.delete(key);
      }
    }

    return json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
};
