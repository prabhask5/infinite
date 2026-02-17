/**
 * @fileoverview Schema definition — single source of truth.
 *
 * Edit this file and save. During `npm run dev`:
 *   - TypeScript types auto-generate at src/lib/types.generated.ts
 *   - Supabase schema auto-migrates (when .env has DATABASE_URL)
 *   - Dexie (IndexedDB) auto-upgrades on next page load
 *
 * Each key is a Supabase table name (snake_case). Values are either:
 *   - A string of Dexie indexes (system indexes are auto-appended)
 *   - An object with full config (indexes, singleton, fields, etc.)
 *
 * @see FRAMEWORKS.md for field type reference and type narrowing patterns
 */

import type { SchemaDefinition } from 'stellar-drive/types';

/**
 * App schema — add your tables here.
 *
 * Examples:
 *   items: 'category_id, order'
 *   settings: { singleton: true }
 *   tasks: {
 *     indexes: 'project_id, order',
 *     fields: {
 *       title: 'string',
 *       completed: 'boolean',
 *       project_id: 'uuid',
 *       order: 'number',
 *     },
 *   }
 */
export const schema: SchemaDefinition = {
  // Add your tables here. Example:
  //
  //   items: {
  //     indexes: 'category_id, order',
  //     fields: {
  //       title: 'string',
  //       completed: 'boolean',
  //       category_id: 'uuid',
  //       order: 'number',
  //     },
  //   }
};
