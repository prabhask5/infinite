<!--
  @component NoteTitle
  @fileoverview Title + icon editor for a note.

  Renders a contenteditable heading for the note title with an emoji icon
  picker button on the left. The icon button cycles through default emojis
  on click and removes the icon on right-click. Title changes are debounced
  at 500ms and emitted via `onTitleChange`.

  @prop {string} title - The current note title.
  @prop {string | null} icon - The current note icon emoji, or null.
  @prop {boolean} isLocked - Whether the note is locked (disables editing).
  @prop {(title: string) => void} onTitleChange - Callback when title changes.
  @prop {(icon: string | null) => void} onIconChange - Callback when icon changes.
-->
<script lang="ts">
  import { debug } from 'stellar-drive/utils';

  // ===========================================================================
  //  Constants
  // ===========================================================================

  const DEFAULT_EMOJIS = [
    '\u{1F4DD}',
    '\u{1F4CB}',
    '\u{1F4CC}',
    '\u{1F4A1}',
    '\u{1F3AF}',
    '\u{1F4DA}',
    '\u2B50',
    '\u{1F516}'
  ];

  // ===========================================================================
  //  Props
  // ===========================================================================

  let {
    title,
    icon,
    isLocked,
    onTitleChange,
    onIconChange
  }: {
    title: string;
    icon: string | null;
    isLocked: boolean;
    onTitleChange: (title: string) => void;
    onIconChange: (icon: string | null) => void;
  } = $props();

  // ===========================================================================
  //  State
  // ===========================================================================

  let titleEl: HTMLDivElement | undefined = $state(undefined);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined = $state(undefined);

  // ===========================================================================
  //  Derived
  // ===========================================================================

  let displayIcon = $derived(icon ?? '\u{1F4C4}');

  // ===========================================================================
  //  Handlers
  // ===========================================================================

  function handleIconClick() {
    if (isLocked) return;

    const currentIndex = icon ? DEFAULT_EMOJIS.indexOf(icon) : -1;
    const nextIndex = (currentIndex + 1) % DEFAULT_EMOJIS.length;
    const nextIcon = DEFAULT_EMOJIS[nextIndex];

    debug('log', '[NoteTitle] Cycling icon to:', nextIcon);
    onIconChange(nextIcon);
  }

  function handleIconContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (isLocked) return;

    debug('log', '[NoteTitle] Removing icon');
    onIconChange(null);
  }

  function handleTitleInput() {
    if (!titleEl) return;

    const newTitle = titleEl.textContent?.trim() ?? '';

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debug('log', '[NoteTitle] Title changed:', newTitle);
      onTitleChange(newTitle || 'Untitled');
    }, 500);
  }

  function handleTitleBlur() {
    if (!titleEl) return;

    const newTitle = titleEl.textContent?.trim() ?? '';
    if (debounceTimer) clearTimeout(debounceTimer);

    debug('log', '[NoteTitle] Title blur:', newTitle);
    onTitleChange(newTitle || 'Untitled');
  }

  function handleTitleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl?.blur();
    }
  }
</script>

<div class="note-title-wrapper">
  <button
    class="icon-button"
    type="button"
    onclick={handleIconClick}
    oncontextmenu={handleIconContextMenu}
    disabled={isLocked}
    title={isLocked ? 'Note is locked' : 'Click to change icon, right-click to remove'}
    aria-label="Change note icon"
  >
    {displayIcon}
  </button>

  <div
    class="title-input"
    bind:this={titleEl}
    contenteditable={!isLocked}
    role="textbox"
    tabindex="0"
    aria-label="Note title"
    data-placeholder="Untitled"
    oninput={handleTitleInput}
    onblur={handleTitleBlur}
    onkeydown={handleTitleKeydown}
  >
    {title || ''}
  </div>
</div>

<style>
  .note-title-wrapper {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1.5rem 0 1rem;
  }

  .icon-button {
    flex-shrink: 0;
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
    padding: 0;
    line-height: 1;
  }

  .icon-button:hover:not(:disabled) {
    background: var(--color-bg-elevated);
    border-color: var(--color-border);
  }

  .icon-button:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .title-input {
    flex: 1;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 800;
    line-height: 1.2;
    color: var(--color-text);
    outline: none;
    word-break: break-word;
    min-height: 1.2em;
  }

  .title-input:empty::before {
    content: attr(data-placeholder);
    color: var(--color-text-muted);
    pointer-events: none;
  }

  .title-input[contenteditable='false'] {
    cursor: default;
  }
</style>
