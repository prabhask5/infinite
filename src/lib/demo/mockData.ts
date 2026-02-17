import type Dexie from 'dexie';

/**
 * Populate the demo Dexie database with mock data.
 *
 * This function is called once per page load when demo mode is active.
 * Add your app-specific mock data here using `db.table('name').bulkPut([...])`.
 *
 * @param db - The sandboxed Dexie database instance.
 *
 * @example
 * ```ts
 * await db.table('items').bulkPut([
 *   { id: '1', name: 'Sample Item', deleted: false, ... },
 *   { id: '2', name: 'Another Item', deleted: false, ... },
 * ]);
 * ```
 */
export async function seedDemoData(_db: Dexie): Promise<void> {
  // No tables defined yet — add seed data here when schema tables are added.
}
