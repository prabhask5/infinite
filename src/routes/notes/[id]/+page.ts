/**
 * @fileoverview Note editor page loader — opens CRDT document for collaborative editing.
 *
 * Loads note metadata from the sync engine and opens a CRDT document
 * for the note's rich text content.
 */

import { browser } from '$app/environment';
import { error } from '@sveltejs/kit';
import { queryOne } from 'stellar-drive/data';
import { openDocument, closeDocument, createBlockDocument } from 'stellar-drive/crdt';
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

/** Track the current document ID at module scope to close it on re-navigation. */
let currentDocumentId: string | null = null;

export const load: PageLoad = async ({ params }): Promise<NotePageData> => {
  if (!browser) {
    // SSR fallback — return empty data, client will hydrate
    return {} as NotePageData;
  }

  const noteId = params.id;
  const documentId = `note-content-${noteId}`;
  debug('log', '[NoteEditor] Loading note:', noteId);

  // Close previous document if navigating between notes (SvelteKit reuses this route)
  if (currentDocumentId && currentDocumentId !== documentId) {
    debug('log', '[NoteEditor] Closing previous document:', currentDocumentId);
    void closeDocument(currentDocumentId);
  }
  currentDocumentId = documentId;

  debug('log', '[NoteEditor] Opening CRDT document:', documentId);

  // Load note metadata first to determine offline settings
  let provider: CRDTProvider | null = null;
  try {
    const [note, breadcrumbs] = await Promise.all([
      queryOne<Note>('notes', noteId),
      getBreadcrumbs(noteId)
    ]);

    if (!note) {
      debug('error', '[NoteEditor] Note not found:', noteId);
      currentDocumentId = null;
      error(404, 'Note not found');
    }

    // Only persist CRDT state to IndexedDB when the note has offline enabled
    const prov = await openDocument(documentId, noteId, {
      offlineEnabled: note.is_offline ?? false
    });
    provider = prov;

    // Create block document structure (ensures content + meta shared types exist)
    const { meta } = createBlockDocument(provider.doc);
    debug('log', '[NoteEditor] CRDT document opened, Y.Doc ready, offline=', note.is_offline);

    return { note, provider, ydoc: provider.doc, meta, breadcrumbs };
  } catch (e) {
    // Clean up on any error (including 404 redirect)
    if (provider) {
      void closeDocument(documentId);
      currentDocumentId = null;
    }
    throw e;
  }
};
