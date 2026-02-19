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
import type { CRDTProvider } from 'stellar-drive/crdt';
import type { XmlFragment as YXmlFragment, Map as YMap } from 'yjs';

export interface NotePageData {
  note: Note;
  provider: CRDTProvider;
  content: YXmlFragment;
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

  // Load note metadata
  const note = await queryOne<Note>('notes', noteId);
  if (!note) {
    debug('error', '[NoteEditor] Note not found:', noteId);
    error(404, 'Note not found');
  }

  // Load breadcrumbs
  const breadcrumbs = await getBreadcrumbs(noteId);

  // Open CRDT document for collaborative editing
  const documentId = `note-content-${noteId}`;
  debug('log', '[NoteEditor] Opening CRDT document:', documentId);
  const provider = await openDocument(documentId, noteId, { offlineEnabled: true });

  // Create block document structure (content + meta)
  const { content, meta } = createBlockDocument(provider.doc);
  debug('log', '[NoteEditor] CRDT document opened, content fragment ready');

  return { note, provider, content, meta, breadcrumbs };
};
