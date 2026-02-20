<!--
  @component CommentsPanel
  Slide-in right sidebar listing all comments for the current note.
  Clicking a comment scrolls the editor to the highlighted text.
-->
<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { commentsStore, resolveComment, deleteComment } from '$lib/stores/comments';
  import { debug } from 'stellar-drive/utils';
  import type { NoteComment } from '$lib/types';

  interface Props {
    /** The current note ID. */
    noteId: string;
    /** The Tiptap editor instance. */
    editor: Editor | null;
    /** Whether the panel is open. */
    isOpen: boolean;
    /** Callback to close the panel. */
    onClose: () => void;
  }

  let { noteId: _noteId, editor, isOpen, onClose }: Props = $props();

  /** All comments from the store. */
  let comments: NoteComment[] = $derived($commentsStore);

  /** Unresolved comments first, then resolved. */
  let sortedComments: NoteComment[] = $derived(
    [...comments].sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })
  );

  /**
   * Scroll the editor to the mark matching the comment.
   * @param comment - The comment to scroll to.
   */
  function scrollToComment(comment: NoteComment): void {
    if (!editor) return;
    debug('log', `[CommentsPanel] Scrolling to comment mark: ${comment.mark_id}`);
    const markEl = editor.view.dom.querySelector(`mark[data-comment-id="${comment.mark_id}"]`);
    if (markEl) {
      markEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Briefly flash the highlight
      markEl.classList.add('comment-highlight--flash');
      setTimeout(() => markEl.classList.remove('comment-highlight--flash'), 1200);
    }
  }

  /**
   * Toggle resolved state for a comment.
   * @param comment - The comment to toggle.
   */
  async function handleResolve(comment: NoteComment): Promise<void> {
    await resolveComment(comment.id, !comment.resolved);
  }

  /**
   * Delete a comment after confirmation.
   * @param comment - The comment to delete.
   */
  async function handleDelete(comment: NoteComment): Promise<void> {
    await deleteComment(comment.id);
    // Remove the mark from the editor
    if (editor) {
      const { state, dispatch } = editor.view;
      const { tr } = state;
      let found = false;
      state.doc.descendants((node, pos) => {
        node.marks.forEach((mark) => {
          if (mark.type.name === 'comment' && mark.attrs.commentId === comment.mark_id) {
            tr.removeMark(pos, pos + node.nodeSize, mark.type);
            found = true;
          }
        });
      });
      if (found) dispatch(tr);
    }
  }

  /**
   * Format a timestamp to a human-readable relative string.
   * @param iso - ISO 8601 timestamp.
   */
  function formatDate(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
</script>

<aside class="comments-panel" class:comments-panel--open={isOpen}>
  <header class="comments-panel__header">
    <h3 class="comments-panel__title">Comments</h3>
    <span class="comments-panel__count">{comments.length}</span>
    <button class="comments-panel__close" onclick={onClose} aria-label="Close comments panel">
      &times;
    </button>
  </header>

  <div class="comments-panel__list">
    {#if sortedComments.length === 0}
      <p class="comments-panel__empty">No comments yet.</p>
    {:else}
      {#each sortedComments as comment (comment.id)}
        <div
          class="comments-panel__item"
          class:comments-panel__item--resolved={comment.resolved}
          role="button"
          tabindex="0"
          onclick={() => scrollToComment(comment)}
          onkeydown={(e) => {
            if (e.key === 'Enter') scrollToComment(comment);
          }}
        >
          {#if comment.quote}
            <blockquote class="comments-panel__quote">{comment.quote}</blockquote>
          {/if}
          <p class="comments-panel__content">{comment.content}</p>
          <div class="comments-panel__meta">
            <time class="comments-panel__time">{formatDate(comment.created_at)}</time>
            <div class="comments-panel__actions">
              <button
                class="comments-panel__btn comments-panel__btn--resolve"
                onclick={(e) => {
                  e.stopPropagation();
                  handleResolve(comment);
                }}
                title={comment.resolved ? 'Unresolve' : 'Resolve'}
              >
                {comment.resolved ? 'Reopen' : 'Resolve'}
              </button>
              <button
                class="comments-panel__btn comments-panel__btn--delete"
                onclick={(e) => {
                  e.stopPropagation();
                  handleDelete(comment);
                }}
                title="Delete comment"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .comments-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 300px;
    background: var(--color-bg-elevated);
    border-left: 1px solid var(--color-border);
    box-shadow: var(--shadow-md);
    transform: translateX(100%);
    transition: transform 0.25s ease;
    z-index: 50;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .comments-panel--open {
    transform: translateX(0);
  }

  .comments-panel__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .comments-panel__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    flex: 1;
  }

  .comments-panel__count {
    font-size: 12px;
    color: var(--color-text-muted);
    background: var(--color-bg-tertiary);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .comments-panel__close {
    background: none;
    border: none;
    font-size: 20px;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .comments-panel__close:hover {
    color: var(--color-text);
  }

  .comments-panel__list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .comments-panel__empty {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
    padding: 24px 16px;
    margin: 0;
  }

  .comments-panel__item {
    padding: 12px;
    border-radius: var(--radius-md);
    background: var(--color-bg-secondary);
    margin-bottom: 8px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .comments-panel__item:hover {
    background: var(--color-bg-tertiary);
  }

  .comments-panel__item--resolved {
    opacity: 0.55;
  }

  .comments-panel__quote {
    font-size: 12px;
    color: var(--color-text-muted);
    border-left: 2px solid var(--color-primary);
    padding-left: 8px;
    margin: 0 0 8px 0;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .comments-panel__content {
    font-size: 13px;
    color: var(--color-text);
    margin: 0 0 8px 0;
    line-height: 1.4;
    word-break: break-word;
  }

  .comments-panel__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .comments-panel__time {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .comments-panel__actions {
    display: flex;
    gap: 4px;
  }

  .comments-panel__btn {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .comments-panel__btn:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  .comments-panel__btn--delete:hover {
    border-color: #e53e3e;
    color: #e53e3e;
  }
</style>
