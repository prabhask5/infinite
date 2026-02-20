<!--
  @component AddCommentPopover
  Floating popover above the text selection for writing a new comment.
  Creates a comment mark in the editor and a database record via the comments store.
-->
<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { createComment } from '$lib/stores/comments';
  import { debug } from 'stellar-drive/utils';

  interface Props {
    /** The Tiptap editor instance. */
    editor: Editor | null;
    /** The current note ID. */
    noteId: string;
    /** Callback fired after a comment is successfully added. */
    onCommentAdded: () => void;
  }

  let { editor, noteId, onCommentAdded }: Props = $props();

  /** The comment text input. */
  let content = $state('');

  /** Whether the popover is visible. */
  let visible = $state(false);

  /** Position of the popover. */
  let posX = $state(0);
  let posY = $state(0);

  /** The quoted (selected) text. */
  let selectedText = $state('');

  /**
   * Show the popover above the current editor selection.
   * Call this from the parent when the user triggers "add comment".
   */
  export function show(): void {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      debug('warn', '[AddCommentPopover] No text selected');
      return;
    }
    selectedText = editor.state.doc.textBetween(from, to, ' ');
    // Position popover above the selection
    const coords = editor.view.coordsAtPos(from);
    posX = coords.left;
    posY = coords.top - 8;
    content = '';
    visible = true;
    debug('log', `[AddCommentPopover] Showing popover for selection: "${selectedText}"`);
    // Focus the textarea on next tick
    requestAnimationFrame(() => {
      const el = document.querySelector('.add-comment-popover__textarea') as HTMLTextAreaElement;
      el?.focus();
    });
  }

  /** Hide the popover. */
  export function hide(): void {
    visible = false;
    content = '';
    selectedText = '';
  }

  /**
   * Submit the comment: create mark in editor + persist to database.
   */
  async function handleSubmit(): Promise<void> {
    if (!editor || !content.trim()) return;
    const markId = crypto.randomUUID();
    debug('log', `[AddCommentPopover] Submitting comment, markId=${markId}`);

    // Apply the comment mark to the selected text
    editor.chain().focus().setComment(markId).run();

    // Persist to the database
    await createComment(noteId, markId, content.trim(), selectedText || undefined);

    hide();
    onCommentAdded();
  }

  /**
   * Handle keyboard shortcuts in the textarea.
   * @param e - Keyboard event.
   */
  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      hide();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="add-comment-backdrop" onclick={hide}></div>
  <div class="add-comment-popover" style="left: {posX}px; top: {posY}px;">
    {#if selectedText}
      <div class="add-comment-popover__quote">{selectedText}</div>
    {/if}
    <textarea
      class="add-comment-popover__textarea"
      bind:value={content}
      onkeydown={handleKeydown}
      placeholder="Write a comment..."
      rows="3"
    ></textarea>
    <div class="add-comment-popover__footer">
      <span class="add-comment-popover__hint">Ctrl+Enter to submit</span>
      <div class="add-comment-popover__buttons">
        <button class="add-comment-popover__btn add-comment-popover__btn--cancel" onclick={hide}>
          Cancel
        </button>
        <button
          class="add-comment-popover__btn add-comment-popover__btn--submit"
          onclick={handleSubmit}
          disabled={!content.trim()}
        >
          Add Comment
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .add-comment-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .add-comment-popover {
    position: fixed;
    z-index: 100;
    width: 280px;
    transform: translateY(-100%);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .add-comment-popover__quote {
    font-size: 12px;
    color: var(--color-text-muted);
    border-left: 2px solid var(--color-primary);
    padding-left: 8px;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .add-comment-popover__textarea {
    width: 100%;
    resize: vertical;
    font-size: 13px;
    font-family: inherit;
    line-height: 1.4;
    padding: 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text);
    outline: none;
    transition: border-color 0.15s ease;
  }

  .add-comment-popover__textarea:focus {
    border-color: var(--color-primary);
  }

  .add-comment-popover__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .add-comment-popover__hint {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .add-comment-popover__buttons {
    display: flex;
    gap: 6px;
  }

  .add-comment-popover__btn {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .add-comment-popover__btn--cancel {
    background: var(--color-bg);
    color: var(--color-text-secondary);
  }

  .add-comment-popover__btn--cancel:hover {
    background: var(--color-bg-tertiary);
  }

  .add-comment-popover__btn--submit {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
  }

  .add-comment-popover__btn--submit:hover:not(:disabled) {
    opacity: 0.9;
  }

  .add-comment-popover__btn--submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
