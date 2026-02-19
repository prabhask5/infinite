/**
 * @fileoverview Note editor page loader — opens CRDT document for collaborative editing.
 *
 * Loads note metadata from the sync engine and opens a CRDT document
 * for the note's rich text content.
 */

import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';
import { queryOne } from 'stellar-drive/data';
import { openDocument, createBlockDocument } from 'stellar-drive/crdt';
import { debug } from 'stellar-drive/utils';
import { getBreadcrumbs } from '$lib/stores/notes';
import type { PageLoad } from './$types';
import type { Note } from '$lib/types';
import type { CRDTProvider, YDoc, YMap } from 'stellar-drive/crdt';

export interface NotePageData {
  note: Note;
  provider: CRDTProvider;
  ydoc: YDoc;
  meta: YMap<unknown>;
  breadcrumbs: Note[];
}

export const load: PageLoad = async ({ params }): Promise<NotePageData> => {
  if (!browser) {
    // SSR fallback — return empty data, client will hydrate
    return {} as NotePageData;
  }

  const noteId = params.id;
  debug('log', '[NoteEditor] Loading note:', noteId);

  // Load note metadata, breadcrumbs, and CRDT document in parallel
  const documentId = `note-content-${noteId}`;
  debug('log', '[NoteEditor] Opening CRDT document:', documentId);

  const [note, breadcrumbs, provider] = await Promise.all([
    queryOne<Note>('notes', noteId),
    getBreadcrumbs(noteId),
    openDocument(documentId, noteId, { offlineEnabled: true })
  ]);

  if (!note) {
    debug('error', '[NoteEditor] Note not found:', noteId);
    error(404, 'Note not found');
  }

  // Create block document structure (ensures content + meta shared types exist)
  const { meta } = createBlockDocument(provider.doc);
  debug('log', '[NoteEditor] CRDT document opened, Y.Doc ready');

  return { note, provider, ydoc: provider.doc, meta, breadcrumbs };
};
