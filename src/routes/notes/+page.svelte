<!--
  @fileoverview Notes listing page — displays a grid of note cards.

  Shows all root-level notes (those without a parent) in a responsive grid
  layout. Provides a "New Note" action button and an empty-state prompt
  for first-time users.

  Features:
  1. **Responsive grid** — auto-fill columns with a 280px minimum.
  2. **New Note button** — creates a blank note and navigates to the editor.
  3. **Empty state** — friendly prompt when no notes exist yet.
  4. **Staggered entrance** — cards fade and slide in sequentially.
-->

<script lang="ts">
  /**
   * @fileoverview Notes listing page script — note creation, store
   * subscription, and grid rendering.
   */

  // ==========================================================================
  //                                IMPORTS
  // ==========================================================================

  /* ── SvelteKit Navigation ── */
  import { goto } from '$app/navigation';

  /* ── Stellar Drive — Utilities ── */
  import { debug } from 'stellar-drive/utils';

  /* ── App Stores ── */
  import { notesStore, createNote } from '$lib/stores/notes';

  /* ── Components ── */
  import NoteCard from '$lib/components/notes/NoteCard.svelte';

  /* ── Types ── */
  import type { NotesPageData } from './+page';

  // ==========================================================================
  //                           COMPONENT PROPS
  // ==========================================================================

  /** Page data from the load function (triggers initial data load). */
  let { data: _data }: { data: NotesPageData } = $props();

  // ==========================================================================
  //                           DERIVED STATE
  // ==========================================================================

  /**
   * Root-level notes from the reactive store.
   * Filters for notes where `parent_note_id` is null (top-level only).
   */
  const notes = $derived($notesStore.filter((note) => note.parent_note_id === null));

  // ==========================================================================
  //                            ACTIONS
  // ==========================================================================

  /**
   * Creates a new blank note and navigates to the editor.
   * Called when the user clicks the "New Note" button.
   */
  async function handleCreateNote(): Promise<void> {
    debug('log', '[NotesPage] Creating new note');
    const newNote = await createNote();
    if (newNote) {
      debug('log', '[NotesPage] Note created, navigating to:', newNote.id);
      await goto(`/notes/${newNote.id}`);
    }
  }
</script>

<svelte:head>
  <title>Notes - Infinite Notes</title>
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Notes Listing Page
     ═══════════════════════════════════════════════════════════════════════════ -->
<div class="notes-page">
  <!-- ── Page Header ── -->
  <header class="page-header">
    <div class="header-text">
      <h1 class="page-title">Notes</h1>
      <p class="page-description">Your thoughts, ideas, and everything in between.</p>
    </div>
    <button class="new-note-btn" onclick={handleCreateNote}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      New Note
    </button>
  </header>

  <!-- ── Notes Grid or Empty State ── -->
  {#if notes.length > 0}
    <div class="notes-grid">
      {#each notes as note, i (note.id)}
        <div class="note-card-wrapper" style="animation-delay: {0.05 * i}s">
          <NoteCard {note} />
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      </div>
      <p class="empty-message">No notes yet. Create your first note to get started.</p>
      <button class="new-note-btn" onclick={handleCreateNote}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Create Note
      </button>
    </div>
  {/if}
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     PAGE CONTAINER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .notes-page {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1.5rem 3rem;
    min-height: 100vh;
    min-height: 100dvh;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     PAGE HEADER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 2rem;
    opacity: 0;
    animation: fadeSlideIn 0.7s var(--ease-out, ease-out) 0.1s forwards;
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  .page-title {
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 5vw, 2.25rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--color-text);
    margin: 0 0 0.25rem;
    line-height: 1.2;
  }

  .page-description {
    font-family: var(--font-body);
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     NEW NOTE BUTTON
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .new-note-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-bg);
    background: var(--color-primary);
    border: none;
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.2s var(--ease-out, ease-out),
      transform 0.15s var(--ease-out, ease-out),
      box-shadow 0.2s var(--ease-out, ease-out);
  }

  .new-note-btn:hover {
    background: var(--color-primary-hover, var(--color-primary));
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(74, 125, 255, 0.3);
  }

  .new-note-btn:active {
    transform: translateY(0);
    box-shadow: none;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     NOTES GRID
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .notes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .note-card-wrapper {
    opacity: 0;
    animation: fadeSlideIn 0.5s var(--ease-out, ease-out) forwards;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     EMPTY STATE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4rem 1.5rem;
    opacity: 0;
    animation: fadeSlideIn 0.7s var(--ease-out, ease-out) 0.2s forwards;
  }

  .empty-icon {
    color: var(--color-text-muted);
    opacity: 0.5;
    margin-bottom: 1.25rem;
  }

  .empty-message {
    font-family: var(--font-body);
    font-size: 1rem;
    color: var(--color-text-secondary);
    margin: 0 0 1.5rem;
    max-width: 360px;
    line-height: 1.6;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     ENTRANCE ANIMATIONS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @keyframes fadeSlideIn {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 768px) {
    .notes-page {
      padding: 1.5rem 1rem 2.5rem;
    }

    .page-header {
      flex-direction: column;
      gap: 0.75rem;
    }

    .new-note-btn {
      align-self: flex-start;
    }
  }

  @media (max-width: 480px) {
    .notes-page {
      padding: 1.25rem 0.75rem 2rem;
    }

    .notes-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .page-header,
    .note-card-wrapper,
    .empty-state {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }
</style>
