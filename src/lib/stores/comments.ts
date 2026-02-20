/**
 * @fileoverview Comment data service — CRUD and reactive store.
 */

import { engineCreate, engineUpdate, engineDelete, queryByIndex } from 'stellar-drive/data';
import { createCollectionStore } from 'stellar-drive/stores';
import { debug } from 'stellar-drive/utils';
import type { NoteComment } from '$lib/types';
import type { CollectionStore } from 'stellar-drive/stores';

const TABLE = 'note_comments';

/** Current note ID for filtering comments. */
let currentNoteId: string | null = null;

/**
 * Reactive collection store for comments on the current note.
 */
export const commentsStore: CollectionStore<NoteComment> = createCollectionStore<NoteComment>({
  load: async () => {
    if (!currentNoteId) return [];
    debug('log', `[Comments] Loading comments for note: ${currentNoteId}`);
    const comments = await queryByIndex<NoteComment>(TABLE, 'note_id', currentNoteId);
    const active = comments.filter((c) => !c.deleted);
    debug('log', `[Comments] Loaded ${active.length} comments`);
    return active;
  }
});

/**
 * Set the current note ID and refresh the comments store.
 * @param noteId - The note to load comments for.
 */
export async function loadCommentsForNote(noteId: string): Promise<void> {
  currentNoteId = noteId;
  await commentsStore.refresh();
}

/**
 * Create a new comment on a note.
 * @param noteId - The note ID.
 * @param markId - The Tiptap mark ID linking to highlighted text.
 * @param content - The comment text.
 * @param quote - The highlighted text (optional).
 * @returns The created comment.
 */
export async function createComment(
  noteId: string,
  markId: string,
  content: string,
  quote?: string
): Promise<NoteComment> {
  debug('log', `[Comments] Creating comment for note=${noteId}, mark=${markId}`);
  const now = new Date().toISOString();
  const data: Record<string, unknown> = {
    note_id: noteId,
    mark_id: markId,
    content,
    quote: quote ?? null,
    resolved: false,
    created_at: now,
    updated_at: now
  };
  const result = (await engineCreate(TABLE, data)) as unknown as NoteComment;
  commentsStore.mutate((items) => [...items, result]);
  debug('log', `[Comments] Comment created: ${result.id}`);
  return result;
}

/**
 * Resolve or unresolve a comment.
 * @param id - The comment ID.
 * @param resolved - Whether the comment is resolved.
 */
export async function resolveComment(id: string, resolved: boolean): Promise<void> {
  debug('log', `[Comments] ${resolved ? 'Resolving' : 'Unresolving'} comment: ${id}`);
  await engineUpdate(TABLE, id, { resolved, updated_at: new Date().toISOString() });
  commentsStore.mutate((items) => items.map((c) => (c.id === id ? { ...c, resolved } : c)));
}

/**
 * Delete a comment permanently.
 * @param id - The comment ID.
 */
export async function deleteComment(id: string): Promise<void> {
  debug('log', `[Comments] Deleting comment: ${id}`);
  await engineDelete(TABLE, id);
  commentsStore.mutate((items) => items.filter((c) => c.id !== id));
}
