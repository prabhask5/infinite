<!--
  @component MoveNoteModal
  @fileoverview Tree picker modal for reparenting notes.

  Displays a centered modal overlay with a list of available move targets.
  Includes a "Root level" option to move the note to the top of the hierarchy.
  Fetches targets from the notes store, excluding the current note and its
  descendants to prevent circular references.

  @prop {string} noteId - The ID of the note being moved.
  @prop {boolean} isOpen - Whether the modal is visible.
  @prop {() => void} onClose - Callback to close the modal.
  @prop {(targetId: string | null) => void} onMove - Callback with the selected target ID (null = root).
-->
<script lang="ts">
  import { debug } from 'stellar-drive/utils';
  import { getAvailableMoveTargets } from '$lib/stores/notes';
  import type { Note } from '$lib/types';

  // ===========================================================================
  //  Props
  // ===========================================================================

  let {
    noteId,
    isOpen,
    onClose,
    onMove
  }: {
    noteId: string;
    isOpen: boolean;
    onClose: () => void;
    onMove: (targetId: string | null) => void | Promise<void>;
  } = $props();

  // ===========================================================================
  //  State
  // ===========================================================================

  let targets: Note[] = $state([]);
  let isLoading = $state(false);

  // ===========================================================================
  //  Effects
  // ===========================================================================

  $effect(() => {
    if (isOpen) {
      loadTargets();
    }
  });

  // ===========================================================================
  //  Functions
  // ===========================================================================

  async function loadTargets() {
    isLoading = true;
    debug('log', '[MoveNoteModal] Loading move targets for:', noteId);
    try {
      targets = await getAvailableMoveTargets(noteId);
      debug('log', '[MoveNoteModal] Loaded', targets.length, 'targets');
    } catch (err) {
      debug('error', '[MoveNoteModal] Failed to load targets:', err);
      targets = [];
    } finally {
      isLoading = false;
    }
  }

  let moveInProgress = false;
  async function handleSelect(targetId: string | null) {
    if (moveInProgress) return;
    moveInProgress = true;
    debug('log', '[MoveNoteModal] Selected target:', targetId ?? 'root');
    try {
      await onMove(targetId);
      onClose();
    } catch (err) {
      debug('error', '[MoveNoteModal] Move failed:', err);
    } finally {
      moveInProgress = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick}>
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Move note">
      <div class="modal-header">
        <h2 class="modal-title">Move to...</h2>
        <button class="close-button" type="button" onclick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <div class="modal-body">
        {#if isLoading}
          <div class="loading">Loading...</div>
        {:else}
          <button class="target-item root-item" type="button" onclick={() => handleSelect(null)}>
            <span class="target-icon">{'\u{1F3E0}'}</span>
            <span class="target-title">Root level</span>
          </button>

          {#each targets as target (target.id)}
            <button class="target-item" type="button" onclick={() => handleSelect(target.id)}>
              <span class="target-icon">{target.icon ?? '\u{1F4C4}'}</span>
              <span class="target-title">{target.title}</span>
            </button>
          {/each}

          {#if targets.length === 0}
            <div class="empty">No available targets</div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal-card {
    background: var(--color-bg-secondary, var(--color-bg));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 400px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
  }

  .modal-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background 0.15s ease;
    padding: 0;
  }

  .close-button:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text);
  }

  .modal-body {
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .target-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.625rem 1.25rem;
    background: transparent;
    border: none;
    color: var(--color-text);
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
  }

  .target-item:hover {
    background: var(--color-primary-subtle);
  }

  .root-item {
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 0.25rem;
  }

  .target-icon {
    flex-shrink: 0;
    font-size: 1rem;
    width: 1.5rem;
    text-align: center;
  }

  .target-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .loading,
  .empty {
    padding: 2rem 1.25rem;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }
</style>
