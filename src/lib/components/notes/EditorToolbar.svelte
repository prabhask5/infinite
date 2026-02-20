<!--
  @component EditorToolbar
  @fileoverview Inline formatting bubble toolbar for text selection.

  Appears above the user's text selection in the Tiptap editor. Provides
  toggle buttons for inline marks: Bold, Italic, Underline, Strikethrough,
  Code, and Link. Each button reflects its active state. The toolbar is
  positioned using Tiptap's `coordsAtPos` API.

  @prop {Editor | null} editor - The Tiptap editor instance, or null if not ready.
-->
<script lang="ts">
  import { debug } from 'stellar-drive/utils';
  import type { Editor } from '@tiptap/core';

  // ===========================================================================
  //  Props
  // ===========================================================================

  let {
    editor
  }: {
    editor: Editor | null;
  } = $props();

  // ===========================================================================
  //  State
  // ===========================================================================

  let toolbarEl: HTMLDivElement | undefined = $state(undefined);
  let isVisible = $state(false);
  let top = $state(0);
  let left = $state(0);

  // ===========================================================================
  //  Effects
  // ===========================================================================

  $effect(() => {
    if (!editor) {
      isVisible = false;
      return;
    }

    const updatePosition = () => {
      const { from, to, empty } = editor.state.selection;

      if (empty || from === to) {
        isVisible = false;
        return;
      }

      try {
        const fromCoords = editor.view.coordsAtPos(from);
        const toCoords = editor.view.coordsAtPos(to);

        const centerX = (fromCoords.left + toCoords.right) / 2;
        const topY = Math.min(fromCoords.top, toCoords.top);

        const toolbarWidth = toolbarEl?.offsetWidth ?? 280;

        left = Math.max(8, centerX - toolbarWidth / 2);
        top = topY - 48;
        isVisible = true;
      } catch {
        isVisible = false;
      }
    };

    const handleBlur = () => {
      // Small delay to allow button clicks to register
      setTimeout(() => {
        if (!editor.isFocused) {
          isVisible = false;
        }
      }, 150);
    };

    editor.on('selectionUpdate', updatePosition);
    editor.on('blur', handleBlur);

    return () => {
      editor.off('selectionUpdate', updatePosition);
      editor.off('blur', handleBlur);
    };
  });

  // ===========================================================================
  //  Format Helpers
  // ===========================================================================

  function toggleMark(mark: string) {
    if (!editor) return;
    debug('log', '[EditorToolbar] Toggling mark:', mark);
    editor.chain().focus().toggleMark(mark).run();
  }

  function toggleLink() {
    if (!editor) return;

    if (editor.isActive('link')) {
      debug('log', '[EditorToolbar] Removing link');
      editor.chain().focus().unsetLink().run();
      return;
    }

    const url = window.prompt('Enter URL:');
    if (url) {
      debug('log', '[EditorToolbar] Setting link:', url);
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  function isActive(mark: string): boolean {
    return editor?.isActive(mark) ?? false;
  }

  // ===========================================================================
  //  Button Definitions
  // ===========================================================================

  const buttons = [
    { label: 'Bold', mark: 'bold' },
    { label: 'Italic', mark: 'italic' },
    { label: 'Underline', mark: 'underline' },
    { label: 'Strikethrough', mark: 'strike' },
    { label: 'Code', mark: 'code' }
  ];
</script>

{#if isVisible}
  <div
    class="editor-toolbar"
    bind:this={toolbarEl}
    style="top: {top}px; left: {left}px;"
    role="toolbar"
    aria-label="Text formatting"
  >
    {#each buttons as btn (btn.mark)}
      <button
        class="toolbar-btn"
        class:active={isActive(btn.mark)}
        type="button"
        title={btn.label}
        aria-label={btn.label}
        aria-pressed={isActive(btn.mark)}
        onmousedown={(e) => {
          e.preventDefault();
          toggleMark(btn.mark);
        }}
      >
        {#if btn.mark === 'bold'}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H6V4h8a4 4 0 0 1 0 8" /></svg
          >
        {:else if btn.mark === 'italic'}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><line x1="19" x2="10" y1="4" y2="4" /><line x1="14" x2="5" y1="20" y2="20" /><line
              x1="15"
              x2="9"
              y1="4"
              y2="20"
            /></svg
          >
        {:else if btn.mark === 'underline'}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M6 4v6a6 6 0 0 0 12 0V4" /><line x1="4" x2="20" y1="20" y2="20" /></svg
          >
        {:else if btn.mark === 'strike'}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M16 4H9a3 3 0 0 0-2.83 4" /><path d="M14 12a4 4 0 0 1 0 8H6" /><line
              x1="4"
              x2="20"
              y1="12"
              y2="12"
            /></svg
          >
        {:else if btn.mark === 'code'}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg
          >
        {/if}
      </button>
    {/each}

    <span class="toolbar-divider"></span>

    <button
      class="toolbar-btn"
      class:active={isActive('link')}
      type="button"
      title="Link"
      aria-label="Link"
      aria-pressed={isActive('link')}
      onmousedown={(e) => {
        e.preventDefault();
        toggleLink();
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path
          d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        /></svg
      >
    </button>
  </div>
{/if}

<style>
  .editor-toolbar {
    position: fixed;
    z-index: 55;
    display: flex;
    align-items: center;
    gap: 0.125rem;
    padding: 0.25rem 0.375rem;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-md);
    pointer-events: auto;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition:
      background 0.1s ease,
      color 0.1s ease;
    padding: 0;
  }

  .toolbar-btn:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  .toolbar-btn.active {
    background: var(--color-primary-subtle);
    color: var(--color-primary);
  }

  .toolbar-divider {
    width: 1px;
    height: 1rem;
    background: var(--color-border);
    margin: 0 0.125rem;
  }
</style>
