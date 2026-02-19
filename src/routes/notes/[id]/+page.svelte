<!--
  @fileoverview Note editor page — the main note editing experience.

  Combines a CRDT-backed Tiptap editor with note metadata management.
  The page loads a Y.js document for collaborative/offline-first editing
  and provides controls for title, icon, locking, moving, and trashing.

  Features:
  1. **CRDT editing** — content syncs via Y.js with offline persistence.
  2. **Breadcrumb navigation** — shows the note's position in the hierarchy.
  3. **Title editing** — debounced sync to both Y.Map meta and the note store.
  4. **Lock toggle** — prevents accidental edits on finalised notes.
  5. **Move & trash** — reorganise or soft-delete notes from the editor.
-->

<script lang="ts">
  /**
   * @fileoverview Note editor page script — CRDT lifecycle, metadata sync,
   * and editor orchestration.
   */

  // ==========================================================================
  //                                IMPORTS
  // ==========================================================================

  /* ── Svelte Lifecycle ── */
  import { onDestroy } from 'svelte';

  /* ── SvelteKit Navigation ── */
  import { goto } from '$app/navigation';

  /* ── Stellar Drive — CRDT & Utilities ── */
  import { closeDocument } from 'stellar-drive/crdt';
  import { debug } from 'stellar-drive/utils';

  /* ── App Stores ── */
  import {
    updateNoteMeta,
    trashNote,
    toggleLock,
    moveNote,
    getBreadcrumbs
  } from '$lib/stores/notes';

  /* ── Components ── */
  import NoteHeader from '$lib/components/notes/NoteHeader.svelte';
  import NoteTitle from '$lib/components/notes/NoteTitle.svelte';
  import NoteEditor from '$lib/components/notes/NoteEditor.svelte';
  import MoveNoteModal from '$lib/components/notes/MoveNoteModal.svelte';

  /* ── Types ── */
  import type { NotePageData } from './+page';
  import type { Note } from '$lib/types';

  // ==========================================================================
  //                           COMPONENT PROPS
  // ==========================================================================

  /** Page data from the load function (note, CRDT provider, content, meta, breadcrumbs). */
  let { data }: { data: NotePageData } = $props();

  // ==========================================================================
  //                           COMPONENT STATE
  // ==========================================================================

  /** Current note title — synced from the CRDT meta Y.Map. */
  let title = $state(data.note?.title ?? 'Untitled');

  /** Current note icon/emoji. */
  let icon = $state(data.note?.icon ?? '');

  /** Whether the note is locked (read-only mode). */
  let isLocked = $state(data.note?.is_locked ?? false);

  /** Controls visibility of the move-note modal. */
  let showMoveModal = $state(false);

  /** Current breadcrumb trail for the note hierarchy. */
  let breadcrumbs = $state<Note[]>(data.breadcrumbs ?? []);

  // ==========================================================================
  //                           TITLE SYNC
  // ==========================================================================

  /**
   * Handles title changes from the NoteTitle component.
   * NoteTitle already debounces at 500ms, so we sync immediately here.
   *
   * @param newTitle - The updated title string
   */
  function handleTitleChange(newTitle: string): void {
    title = newTitle;
    debug('log', '[NoteEditor] Syncing title:', newTitle);

    /* Update CRDT meta map for collaborative sync */
    if (data.meta) {
      data.meta.set('title', newTitle);
    }

    /* Persist to the note metadata store */
    if (data.note) {
      updateNoteMeta(data.note.id, { title: newTitle });
    }
  }

  // ==========================================================================
  //                        CONTENT CHANGE HANDLER
  // ==========================================================================

  /**
   * Called when the Tiptap editor content changes.
   * Updates the `last_edited_at` timestamp on the note metadata.
   */
  function handleContentChange(): void {
    if (data.note) {
      updateNoteMeta(data.note.id, { last_edited_at: new Date().toISOString() });
    }
  }

  // ==========================================================================
  //                           NOTE ACTIONS
  // ==========================================================================

  /**
   * Soft-deletes the current note and navigates back to the notes listing.
   */
  async function handleTrash(): Promise<void> {
    if (!data.note) return;
    debug('log', '[NoteEditor] Trashing note:', data.note.id);
    await trashNote(data.note.id);
    await goto('/notes');
  }

  /**
   * Toggles the locked/read-only state of the current note.
   */
  let lockInProgress = false;
  async function handleToggleLock(): Promise<void> {
    if (!data.note || lockInProgress) return;
    lockInProgress = true;
    debug('log', '[NoteEditor] Toggling lock for note:', data.note.id);
    const newLocked = !isLocked;
    isLocked = newLocked; // Optimistic update
    try {
      await toggleLock(data.note.id, newLocked);
    } catch {
      isLocked = !newLocked; // Revert on failure
    } finally {
      lockInProgress = false;
    }
  }

  /**
   * Moves the current note to a new parent and refreshes breadcrumbs.
   *
   * @param targetParentId - The ID of the new parent note, or null for root level
   */
  async function handleMove(targetParentId: string | null): Promise<void> {
    if (!data.note) return;
    debug('log', '[NoteEditor] Moving note:', data.note.id, 'to parent:', targetParentId);
    await moveNote(data.note.id, targetParentId);
    showMoveModal = false;

    /* Refresh breadcrumbs after the move */
    breadcrumbs = await getBreadcrumbs(data.note.id);
    debug('log', '[NoteEditor] Breadcrumbs refreshed after move');
  }

  // ==========================================================================
  //                         LIFECYCLE — DESTROY
  // ==========================================================================

  onDestroy(() => {
    /* Close the CRDT document to release resources (fire-and-forget is safe —
       closeDocument persists dirty state internally before destroying) */
    if (data.note) {
      const documentId = `note-content-${data.note.id}`;
      debug('log', '[NoteEditor] Closing CRDT document:', documentId);
      void closeDocument(documentId);
    }
  });
</script>

<svelte:head>
  <title>{title} - Infinite Notes</title>
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Note Editor Page
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if data.note}
  {#key data.note.id}
    <div class="note-page">
      <!-- ── Header: breadcrumbs, sync status, menu ── -->
      <NoteHeader
        noteId={data.note.id}
        note={data.note}
        {breadcrumbs}
        {isLocked}
        onTrash={handleTrash}
        onToggleLock={handleToggleLock}
        onMove={() => (showMoveModal = true)}
      />

      <!-- ── Editor Content Area ── -->
      <div class="note-content">
        <!-- ── Title / Icon ── -->
        <NoteTitle
          {title}
          {icon}
          {isLocked}
          onTitleChange={handleTitleChange}
          onIconChange={(newIcon) => {
            icon = newIcon ?? '';
            if (data.note) {
              updateNoteMeta(data.note.id, { icon: newIcon });
            }
          }}
        />

        <!-- ── Rich Text Editor ── -->
        <NoteEditor
          ydoc={data.ydoc}
          meta={data.meta}
          noteId={data.note.id}
          {isLocked}
          onContentChange={handleContentChange}
        />
      </div>

      <!-- ── Move Note Modal ── -->
      {#if showMoveModal}
        <MoveNoteModal
          noteId={data.note.id}
          isOpen={showMoveModal}
          onMove={handleMove}
          onClose={() => (showMoveModal = false)}
        />
      {/if}
    </div>
  {/key}
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     NOTE PAGE LAYOUT
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .note-page {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 0 1.5rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SYNC STATUS ROW
     ═══════════════════════════════════════════════════════════════════════════════════ */

  /* Shift the layout's fixed sync status indicator below the note header */
  :global(.desktop-sync) {
    top: 60px !important;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     NOTE CONTENT — centred editing area, fills remaining height
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .note-content {
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    padding: 0 0 3rem;
    flex: 1;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 768px) {
    .note-page {
      padding: 0 1rem;
    }
  }

  @media (max-width: 480px) {
    .note-page {
      padding: 0 0.75rem;
    }
  }
</style>
