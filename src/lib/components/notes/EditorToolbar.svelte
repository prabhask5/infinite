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

    editor.on('selectionUpdate', updatePosition);
    editor.on('blur', () => {
      // Small delay to allow button clicks to register
      setTimeout(() => {
        if (!editor.isFocused) {
          isVisible = false;
        }
      }, 150);
    });

    return () => {
      editor.off('selectionUpdate', updatePosition);
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
    { label: 'Bold', mark: 'bold', icon: 'B', style: 'font-weight: 700;' },
    { label: 'Italic', mark: 'italic', icon: 'I', style: 'font-style: italic;' },
    { label: 'Underline', mark: 'underline', icon: 'U', style: 'text-decoration: underline;' },
    { label: 'Strikethrough', mark: 'strike', icon: 'S', style: 'text-decoration: line-through;' },
    {
      label: 'Code',
      mark: 'code',
      icon: '<>',
      style: 'font-family: monospace; font-size: 0.75rem;'
    }
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
        <span style={btn.style}>{btn.icon}</span>
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
      <span style="font-size: 0.8rem;">{'\u{1F517}'}</span>
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
