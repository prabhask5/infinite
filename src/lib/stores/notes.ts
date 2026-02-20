/**
 * @fileoverview Note data service — CRUD operations and reactive stores.
 *
 * This module provides all note-related data operations and Svelte-compatible
 * reactive stores. It wraps stellar-drive's generic data API with note-specific
 * convenience functions and handles the dual persistence model:
 *   - **Metadata** (title, icon, parent, order, etc.) → sync engine → Supabase
 *   - **Content** (rich text blocks) → CRDT → Yjs → Supabase Broadcast + IndexedDB
 *
 * @see {@link ../schema.ts} for the notes table definition
 * @see {@link ../types.ts} for the Note interface
 */

// =============================================================================
//  Imports
// =============================================================================

import {
  engineCreate,
  engineUpdate,
  engineDelete,
  queryAll,
  queryOne,
  queryByIndex
} from 'stellar-drive/data';
import { createCollectionStore, createDetailStore } from 'stellar-drive/stores';
import { debug } from 'stellar-drive/utils';
import type { Note } from '$lib/types';
import type { CollectionStore, DetailStore } from 'stellar-drive/stores';

// =============================================================================
//  Constants
// =============================================================================

/** The sync engine table name for notes. */
const TABLE = 'notes';

// =============================================================================
//  Reactive Stores
// =============================================================================

/**
 * Reactive collection store for all non-trashed notes.
 *
 * Auto-refreshes on sync-complete events. Use with `$notesStore` in Svelte
 * components for reactive access to the full note list.
 */
export const notesStore: CollectionStore<Note> = createCollectionStore<Note>({
  load: async () => {
    debug('log', '[Notes] Loading all notes');
    const all = await queryAll<Note>(TABLE);
    const nonTrashed = all.filter((n) => !n.is_trashed && !n.deleted);
    debug('log', `[Notes] Loaded ${nonTrashed.length} non-trashed notes`);
    return nonTrashed;
  }
});

/**
 * Reactive detail store for a single note.
 *
 * Load a specific note by ID and auto-refresh on sync-complete events.
 */
export const noteDetailStore: DetailStore<Note> = createDetailStore<Note>({
  load: async (id: string) => {
    debug('log', '[Notes] Loading note detail:', id);
    const note = await queryOne<Note>(TABLE, id);
    if (note) {
      debug('log', '[Notes] Note loaded:', note.title);
    } else {
      debug('warn', '[Notes] Note not found:', id);
    }
    return note;
  }
});

// =============================================================================
//  CRUD Operations
// =============================================================================

/**
 * Create a new note with sensible defaults.
 *
 * @param parentId - Optional parent note ID for nesting.
 * @param title - Optional initial title (defaults to 'Untitled').
 * @returns The newly created note entity.
 */
export async function createNote(parentId?: string | null, title?: string): Promise<Note> {
  debug('log', '[Notes] Creating note:', { parentId, title });

  const now = new Date().toISOString();
  const data: Record<string, unknown> = {
    title: title ?? 'Untitled',
    icon: null,
    parent_note_id: parentId ?? null,
    order: Date.now(),
    last_edited_at: now,
    last_edited_by: null,
    created_by: null,
    is_locked: false,
    is_trashed: false,
    is_offline: false
  };

  const result = (await engineCreate(TABLE, data)) as unknown as Note;
  debug('log', '[Notes] Note created:', result.id);

  // Optimistically add to the collection store
  notesStore.mutate((items) => [...items, result]);

  return result;
}

/**
 * Update a note's metadata fields.
 *
 * @param id - The note ID.
 * @param fields - Partial fields to update.
 * @returns The updated note entity, or undefined if not found.
 */
export async function updateNoteMeta(
  id: string,
  fields: Partial<Omit<Note, 'id' | 'created_at' | 'updated_at' | 'deleted'>>
): Promise<Note | undefined> {
  debug('log', '[Notes] Updating note meta:', id, fields);

  const result = (await engineUpdate(TABLE, id, fields as Record<string, unknown>)) as
    | Note
    | undefined;

  if (result) {
    // Optimistically update the collection store
    notesStore.mutate((items) => items.map((n) => (n.id === id ? { ...n, ...fields } : n)));
    noteDetailStore.mutate((note) => (note && note.id === id ? { ...note, ...fields } : note));
    debug('log', '[Notes] Note meta updated:', id);
  }

  return result;
}

/**
 * Move a note to the trash (soft-delete from the user's perspective).
 *
 * @param id - The note ID to trash.
 */
export async function trashNote(id: string): Promise<void> {
  debug('log', '[Notes] Trashing note:', id);
  await engineUpdate(TABLE, id, { is_trashed: true });
  notesStore.mutate((items) => items.filter((n) => n.id !== id));
  debug('log', '[Notes] Note trashed:', id);
}

/**
 * Permanently delete a note (hard-delete via sync engine).
 *
 * @param id - The note ID to delete.
 */
export async function deleteNote(id: string): Promise<void> {
  debug('log', '[Notes] Deleting note:', id);
  await engineDelete(TABLE, id);
  notesStore.mutate((items) => items.filter((n) => n.id !== id));
  debug('log', '[Notes] Note deleted:', id);
}

/**
 * Move a note to a new parent (or to root if parentId is null).
 *
 * @param id - The note ID to move.
 * @param newParentId - The new parent note ID, or null for root.
 */
export async function moveNote(id: string, newParentId: string | null): Promise<void> {
  debug('log', '[Notes] Moving note:', id, '→', newParentId ?? 'root');
  await updateNoteMeta(id, { parent_note_id: newParentId });
  debug('log', '[Notes] Note moved:', id);
}

/**
 * Toggle the lock state of a note.
 *
 * @param id - The note ID.
 * @param locked - Whether the note should be locked.
 */
export async function toggleLock(id: string, locked: boolean): Promise<void> {
  debug('log', '[Notes] Toggling lock:', id, locked);
  await updateNoteMeta(id, { is_locked: locked });
}

/**
 * Toggle offline availability for a note.
 * When enabled, the CRDT document will be persisted to IndexedDB.
 *
 * @param id - The note ID.
 * @param offline - Whether the note should be available offline.
 */
export async function toggleOffline(id: string, offline: boolean): Promise<void> {
  debug('log', '[Notes] Toggling offline:', id, offline);
  await updateNoteMeta(id, { is_offline: offline });
}

// =============================================================================
//  Query Helpers
// =============================================================================

/**
 * Get all root-level notes (no parent, not trashed).
 *
 * @returns Array of root notes sorted by order.
 */
export async function getRootNotes(): Promise<Note[]> {
  debug('log', '[Notes] Fetching root notes');
  const all = await queryAll<Note>(TABLE);
  const roots = all
    .filter((n) => !n.parent_note_id && !n.is_trashed && !n.deleted)
    .sort((a, b) => a.order - b.order);
  debug('log', `[Notes] Found ${roots.length} root notes`);
  return roots;
}

/**
 * Get child notes of a given parent.
 *
 * @param parentId - The parent note ID.
 * @returns Array of child notes sorted by order.
 */
export async function getChildNotes(parentId: string): Promise<Note[]> {
  debug('log', '[Notes] Fetching children of:', parentId);
  const children = await queryByIndex<Note>(TABLE, 'parent_note_id', parentId);
  const active = children
    .filter((n) => !n.is_trashed && !n.deleted)
    .sort((a, b) => a.order - b.order);
  debug('log', `[Notes] Found ${active.length} children for:`, parentId);
  return active;
}

/**
 * Build the breadcrumb chain from a note to the root.
 *
 * @param noteId - The starting note ID.
 * @returns Array of notes from root to the given note (inclusive).
 */
export async function getBreadcrumbs(noteId: string): Promise<Note[]> {
  debug('log', '[Notes] Building breadcrumbs for:', noteId);

  // Load all notes once and walk the tree in memory (avoids N+1 queries)
  const all = await queryAll<Note>(TABLE);
  const byId = new Map(all.map((n) => [n.id, n]));

  const crumbs: Note[] = [];
  let currentId: string | null = noteId;

  // Walk up the parent chain (max 20 levels to prevent infinite loops)
  let depth = 0;
  while (currentId && depth < 20) {
    const found = byId.get(currentId);
    if (!found) break;
    crumbs.unshift(found);
    currentId = found.parent_note_id;
    depth++;
  }

  debug('log', `[Notes] Breadcrumb chain: ${crumbs.map((n) => n.title).join(' → ')}`);
  return crumbs;
}

/**
 * Get all notes (including trashed) for the move-note tree picker.
 * Excludes a specific note and its descendants to prevent circular references.
 *
 * @param excludeId - The note ID to exclude (along with its descendants).
 * @returns Array of notes available as move targets.
 */
export async function getAvailableMoveTargets(excludeId: string): Promise<Note[]> {
  debug('log', '[Notes] Fetching move targets, excluding:', excludeId);
  const all = await queryAll<Note>(TABLE);
  const active = all.filter((n) => !n.is_trashed && !n.deleted);

  // Find all descendant IDs to exclude
  const excludeIds = new Set<string>([excludeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const note of active) {
      if (note.parent_note_id && excludeIds.has(note.parent_note_id) && !excludeIds.has(note.id)) {
        excludeIds.add(note.id);
        changed = true;
      }
    }
  }

  const targets = active.filter((n) => !excludeIds.has(n.id));
  debug('log', `[Notes] ${targets.length} available move targets`);
  return targets;
}

/**
 * Get recently edited notes for the home page.
 *
 * @param limit - Maximum number of notes to return.
 * @returns Array of notes sorted by last_edited_at descending.
 */
export async function getRecentNotes(limit = 5): Promise<Note[]> {
  debug('log', '[Notes] Fetching recent notes, limit:', limit);
  const all = await queryAll<Note>(TABLE);
  const recent = all
    .filter((n) => !n.is_trashed && !n.deleted)
    .sort((a, b) => new Date(b.last_edited_at).getTime() - new Date(a.last_edited_at).getTime())
    .slice(0, limit);
  debug('log', `[Notes] Found ${recent.length} recent notes`);
  return recent;
}
