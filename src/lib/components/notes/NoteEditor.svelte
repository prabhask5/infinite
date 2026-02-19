<!--
  @component NoteEditor
  @fileoverview Main Tiptap editor wrapper for Infinite Notes.

  Wraps the Tiptap rich-text editor with Yjs collaboration support, slash
  commands, task lists, and a floating toolbar. Content changes are debounced
  and forwarded to the parent via the `onContentChange` callback.

  This component owns the editor lifecycle (create on mount, destroy on
  unmount) and manages the slash command menu popup state.

  @see {@link ./extensions/slash-commands.ts} for the `/` trigger extension
  @see {@link ./SlashCommandMenu.svelte} for the floating dropdown UI
  @see {@link ./EditorToolbar.svelte} for the bubble toolbar
-->
<script lang="ts">
  // ===========================================================================
  //  Imports
  // ===========================================================================

  import { onMount, onDestroy, tick } from 'svelte';
  import { Editor, Extension } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Collaboration from '@tiptap/extension-collaboration';
  import Placeholder from '@tiptap/extension-placeholder';
  import TaskList from '@tiptap/extension-task-list';
  import TaskItem from '@tiptap/extension-task-item';
  import CodeBlock from '@tiptap/extension-code-block';
  import Underline from '@tiptap/extension-underline';
  import Link from '@tiptap/extension-link';
  import { SlashCommands } from './extensions/slash-commands';
  import type { SlashCommandItem } from './extensions/slash-commands';
  import SlashCommandMenu from './SlashCommandMenu.svelte';
  import EditorToolbar from './EditorToolbar.svelte';
  import { debug } from 'stellar-drive/utils';
  import type { YDoc, YMap } from 'stellar-drive/crdt';

  // ===========================================================================
  //  Props
  // ===========================================================================

  interface Props {
    /** The Y.js document backing collaborative editing. */
    ydoc: YDoc;
    /** Yjs map holding note metadata (title, icon, etc.). */
    meta: YMap<unknown>;
    /** Whether the note is locked (read-only). */
    isLocked: boolean;
    /** Unique note identifier (used for debug logging). */
    noteId: string;
    /** Called when content changes (debounced). */
    onContentChange?: () => void;
  }

  let { ydoc, meta: _meta, isLocked, noteId, onContentChange }: Props = $props();

  // ===========================================================================
  //  State
  // ===========================================================================

  /** The Tiptap editor instance. */
  let editor: Editor | null = $state(null);

  /** Container element the editor mounts into. */
  let editorContainer: HTMLDivElement | undefined = $state();

  /** Debounce timer for content change callbacks. */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // -- Slash command menu state -----------------------------------------------

  let slashMenuShowing = $state(false);
  let slashMenuItems: SlashCommandItem[] = $state([]);
  let slashMenuSelectedIndex = $state(0);
  let slashMenuCommand: ((item: SlashCommandItem) => void) | null = $state(null);
  let slashMenuClientRect: (() => DOMRect | null) | null = $state(null);

  // ===========================================================================
  //  Derived
  // ===========================================================================

  /** Whether the editor is ready for interaction. */
  let _editorReady = $derived(editor !== null);

  // ===========================================================================
  //  Slash command suggestion callbacks
  // ===========================================================================

  /**
   * Build the suggestion option overrides that wire the SlashCommands extension
   * into Svelte 5 reactive state. These callbacks open, update, and close the
   * floating `<SlashCommandMenu>`.
   */
  /**
   * Build the suggestion `render` function for Tiptap v3.
   * In v3, lifecycle callbacks must be returned from `render()`,
   * not passed as top-level suggestion options.
   */
  function buildSuggestionRender() {
    return () => ({
      onStart: (props: {
        items: SlashCommandItem[];
        command: (item: SlashCommandItem) => void;
        clientRect: (() => DOMRect | null) | null;
      }) => {
        debug('log', `[NoteEditor:${noteId}] Slash menu opened`);
        slashMenuItems = props.items;
        slashMenuCommand = props.command;
        slashMenuClientRect = props.clientRect;
        slashMenuSelectedIndex = 0;
        slashMenuShowing = true;
      },

      onUpdate: (props: {
        items: SlashCommandItem[];
        command: (item: SlashCommandItem) => void;
        clientRect: (() => DOMRect | null) | null;
      }) => {
        slashMenuItems = props.items;
        slashMenuCommand = props.command;
        slashMenuClientRect = props.clientRect;
        slashMenuSelectedIndex = 0;
      },

      onKeyDown: ({ event }: { event: KeyboardEvent }): boolean => {
        if (!slashMenuShowing) return false;

        if (event.key === 'ArrowUp') {
          slashMenuSelectedIndex =
            (slashMenuSelectedIndex + slashMenuItems.length - 1) % slashMenuItems.length;
          return true;
        }

        if (event.key === 'ArrowDown') {
          slashMenuSelectedIndex = (slashMenuSelectedIndex + 1) % slashMenuItems.length;
          return true;
        }

        if (event.key === 'Enter') {
          const item = slashMenuItems[slashMenuSelectedIndex];
          if (item && slashMenuCommand) {
            slashMenuCommand(item);
          }
          return true;
        }

        if (event.key === 'Escape') {
          slashMenuShowing = false;
          return true;
        }

        return false;
      },

      onExit: () => {
        debug('log', `[NoteEditor:${noteId}] Slash menu closed`);
        slashMenuShowing = false;
        slashMenuItems = [];
        slashMenuCommand = null;
        slashMenuClientRect = null;
      }
    });
  }

  // ===========================================================================
  //  Lifecycle
  // ===========================================================================

  onMount(async () => {
    if (!editorContainer) return;

    // Wait for the DOM to settle and Y.Doc state to be fully loaded
    await tick();

    debug('log', `[NoteEditor:${noteId}] Creating editor instance`);

    editor = new Editor({
      element: editorContainer,
      editable: !isLocked,
      extensions: [
        StarterKit.configure({
          // CodeBlock is added separately with full config.
          codeBlock: false
        }),
        Collaboration.configure({
          document: ydoc,
          field: 'content'
        }),
        Placeholder.configure({
          placeholder: "Type '/' for commands..."
        }),
        TaskList,
        TaskItem.configure({
          nested: true
        }),
        CodeBlock,
        Underline,
        Link.configure({
          openOnClick: false
        }),
        SlashCommands.configure({
          suggestion: {
            render: buildSuggestionRender()
          }
        }),
        // Tab/Shift+Tab indent/outdent for lists and task lists
        Extension.create({
          name: 'listIndent',
          addKeyboardShortcuts() {
            return {
              Tab: () => {
                if (this.editor.isActive('listItem')) {
                  return this.editor.commands.sinkListItem('listItem');
                }
                if (this.editor.isActive('taskItem')) {
                  return this.editor.commands.sinkListItem('taskItem');
                }
                return false;
              },
              'Shift-Tab': () => {
                if (this.editor.isActive('listItem')) {
                  return this.editor.commands.liftListItem('listItem');
                }
                if (this.editor.isActive('taskItem')) {
                  return this.editor.commands.liftListItem('taskItem');
                }
                return false;
              }
            };
          }
        })
      ],
      onUpdate: () => {
        // Debounce content change notifications to avoid flooding the parent
        // with events on every keystroke. 1 second is a good balance between
        // responsiveness and performance.
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debug('log', `[NoteEditor:${noteId}] Content changed (debounced)`);
          onContentChange?.();
        }, 1000);
      }
    });

    debug('log', `[NoteEditor:${noteId}] Editor mounted, editable=${!isLocked}`);
  });

  onDestroy(() => {
    debug('log', `[NoteEditor:${noteId}] Destroying editor`);

    /* Flush any pending content change before destroy */
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      onContentChange?.();
    }

    editor?.destroy();
    editor = null;
  });

  // ===========================================================================
  //  Effects
  // ===========================================================================

  /**
   * Keep the editor's editable state in sync with the `isLocked` prop.
   * When the note is locked externally (e.g. by another collaborator or from
   * the note settings), the editor becomes read-only immediately.
   */
  $effect(() => {
    if (editor) {
      editor.setEditable(!isLocked);
      debug('log', `[NoteEditor:${noteId}] Editable updated: ${!isLocked}`);
    }
  });

  // ===========================================================================
  //  Event handlers
  // ===========================================================================

  /**
   * Called when the user picks a command from the slash menu dropdown.
   */
  function handleSlashSelect(item: SlashCommandItem) {
    if (slashMenuCommand) {
      slashMenuCommand(item);
    }
  }
</script>

<!-- =========================================================================
     Template
     ========================================================================= -->

<div class="note-editor">
  {#if editor}
    <EditorToolbar {editor} />
  {/if}

  <div class="editor-container" bind:this={editorContainer}></div>

  {#if slashMenuShowing}
    <SlashCommandMenu
      items={slashMenuItems}
      selectedIndex={slashMenuSelectedIndex}
      onSelect={handleSlashSelect}
      clientRect={slashMenuClientRect}
    />
  {/if}
</div>

<!-- =========================================================================
     Styles
     ========================================================================= -->

<style>
  /* --------------------------------------------------------------------------
     Container
     -------------------------------------------------------------------------- */

  .note-editor {
    position: relative;
    width: 100%;
  }

  .editor-container {
    width: 100%;
    min-height: calc(100vh - 200px);
    min-height: calc(100dvh - 200px);
  }

  /* --------------------------------------------------------------------------
     Tiptap content area
     -------------------------------------------------------------------------- */

  :global(.tiptap) {
    outline: none;
    padding: 0.5rem 0;
    line-height: 1.7;
    font-size: 1rem;
    color: var(--color-text);
    caret-color: var(--color-primary);
  }

  :global(.tiptap:focus) {
    outline: none;
  }

  /* --------------------------------------------------------------------------
     Placeholder
     -------------------------------------------------------------------------- */

  :global(.tiptap p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    color: var(--color-text-muted);
    pointer-events: none;
    height: 0;
    font-style: italic;
  }

  /* --------------------------------------------------------------------------
     Headings — SF Pro weighted hierarchy
     -------------------------------------------------------------------------- */

  :global(.tiptap h1) {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.2;
    margin: 1.5rem 0 0.75rem;
    color: var(--color-text);
    letter-spacing: -0.02em;
  }

  :global(.tiptap h2) {
    font-size: 1.5rem;
    font-weight: 650;
    line-height: 1.3;
    margin: 1.25rem 0 0.625rem;
    color: var(--color-text);
    letter-spacing: -0.015em;
  }

  :global(.tiptap h3) {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.4;
    margin: 1rem 0 0.5rem;
    color: var(--color-text);
  }

  :global(.tiptap h4) {
    font-size: 1.1rem;
    font-weight: 600;
    line-height: 1.4;
    margin: 0.875rem 0 0.4375rem;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.85rem;
  }

  /* --------------------------------------------------------------------------
     Lists
     -------------------------------------------------------------------------- */

  :global(.tiptap ul),
  :global(.tiptap ol) {
    padding-left: 1.5rem;
    margin: 0.5rem 0;
  }

  :global(.tiptap li) {
    margin: 0.25rem 0;
  }

  :global(.tiptap li p) {
    margin: 0;
  }

  /* --------------------------------------------------------------------------
     Task list — custom checkboxes with ink-blue accent
     -------------------------------------------------------------------------- */

  :global(.tiptap ul[data-type='taskList']) {
    list-style: none;
    padding-left: 0;
    margin: 0.5rem 0;
  }

  :global(.tiptap ul[data-type='taskList'] li) {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }

  :global(.tiptap ul[data-type='taskList'] li label) {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-top: 0.25rem;
  }

  :global(.tiptap ul[data-type='taskList'] li label input[type='checkbox']) {
    appearance: none;
    width: 1.125rem;
    height: 1.125rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
  }

  :global(.tiptap ul[data-type='taskList'] li label input[type='checkbox']:checked) {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  :global(.tiptap ul[data-type='taskList'] li label input[type='checkbox']:checked::after) {
    content: '';
    position: absolute;
    left: 3px;
    top: 0px;
    width: 5px;
    height: 9px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  :global(.tiptap ul[data-type='taskList'] li[data-checked='true'] > div > p) {
    text-decoration: line-through;
    color: var(--color-text-muted);
  }

  /* --------------------------------------------------------------------------
     Code blocks & inline code
     -------------------------------------------------------------------------- */

  :global(.tiptap pre) {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-md);
    padding: 0.875rem 1rem;
    margin: 0.75rem 0;
    overflow-x: auto;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    border: 1px solid var(--color-border);
  }

  :global(.tiptap pre code) {
    background: none;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
    color: inherit;
  }

  :global(.tiptap code) {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-sm);
    padding: 0.15em 0.35em;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.875em;
    color: var(--color-primary);
  }

  /* --------------------------------------------------------------------------
     Links — ink-blue
     -------------------------------------------------------------------------- */

  :global(.tiptap a) {
    color: var(--color-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
    text-decoration-thickness: 1px;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  :global(.tiptap a:hover) {
    opacity: 0.8;
  }

  /* --------------------------------------------------------------------------
     Blockquote — left border accent
     -------------------------------------------------------------------------- */

  :global(.tiptap blockquote) {
    border-left: 3px solid var(--color-primary);
    padding-left: 1rem;
    margin: 0.75rem 0;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  /* --------------------------------------------------------------------------
     Horizontal rule
     -------------------------------------------------------------------------- */

  :global(.tiptap hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 1.5rem 0;
  }

  /* --------------------------------------------------------------------------
     Paragraphs
     -------------------------------------------------------------------------- */

  :global(.tiptap p) {
    margin: 0.25rem 0;
  }
</style>
