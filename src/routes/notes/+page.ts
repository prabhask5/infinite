/**
 * @fileoverview Notes listing page loader.
 *
 * Loads all root-level notes for the notes listing page.
 */

import { getRootNotes, notesStore } from '$lib/stores/notes';
import type { PageLoad } from './$types';
import type { Note } from '$lib/types';

export interface NotesPageData {
  notes: Note[];
}

export const load: PageLoad = async (): Promise<NotesPageData> => {
  await notesStore.load();
  const notes = await getRootNotes();
  return { notes };
};
