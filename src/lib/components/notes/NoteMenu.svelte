<!--
  @component NoteMenu
  @fileoverview Three-dot dropdown menu for note actions.

  Renders a vertical ellipsis button that toggles a dropdown with options
  to move, lock/unlock, and trash the note. Closes on click outside.

  @prop {boolean} isLocked - Whether the note is currently locked.
  @prop {() => void} onToggleLock - Callback to toggle note lock state.
  @prop {() => void} onTrash - Callback to trash the note.
  @prop {() => void} onMove - Callback to open the move-note modal.
-->
<script lang="ts">
  import { debug } from 'stellar-drive/utils';

  // ===========================================================================
  //  Props
  // ===========================================================================

  let {
    isLocked,
    onToggleLock,
    onTrash,
    onMove
  }: {
    isLocked: boolean;
    onToggleLock: () => void;
    onTrash: () => void;
    onMove: () => void;
  } = $props();

  // ===========================================================================
  //  State
  // ===========================================================================

  let isOpen = $state(false);
  let menuEl: HTMLDivElement | undefined = $state(undefined);

  // ===========================================================================
  //  Handlers
  // ===========================================================================

  function toggle() {
    isOpen = !isOpen;
    debug('log', '[NoteMenu] Toggle dropdown:', isOpen);
  }

  function close() {
    isOpen = false;
  }

  function handleClickOutside(e: MouseEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) {
      close();
    }
  }

  function handleMove() {
    close();
    onMove();
  }

  function handleToggleLock() {
    close();
    onToggleLock();
  }

  function handleTrash() {
    close();
    onTrash();
  }

  // ===========================================================================
  //  Effects
  // ===========================================================================

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside, true);
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  });
</script>

<div class="note-menu" bind:this={menuEl}>
  <button
    class="menu-trigger"
    type="button"
    onclick={toggle}
    aria-label="Note menu"
    aria-expanded={isOpen}
  >
    &#x22EE;
  </button>

  {#if isOpen}
    <div class="dropdown" role="menu">
      <button class="dropdown-item" type="button" role="menuitem" onclick={handleMove}>
        <span class="item-icon">{'\u{1F4C1}'}</span>
        Move to...
      </button>

      <div class="divider"></div>

      <button class="dropdown-item" type="button" role="menuitem" onclick={handleToggleLock}>
        <span class="item-icon">{isLocked ? '\u{1F513}' : '\u{1F512}'}</span>
        {isLocked ? 'Unlock page' : 'Lock page'}
      </button>

      <div class="divider"></div>

      <button class="dropdown-item danger" type="button" role="menuitem" onclick={handleTrash}>
        <span class="item-icon">{'\u{1F5D1}'}</span>
        Move to trash
      </button>
    </div>
  {/if}
</div>

<style>
  .note-menu {
    position: relative;
  }

  .menu-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: 1.25rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
    padding: 0;
    line-height: 1;
  }

  .menu-trigger:hover {
    background: var(--color-bg-elevated);
    border-color: var(--color-border);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 180px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: 0.25rem 0;
    z-index: 50;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--color-text);
    font-size: 0.8125rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
  }

  .dropdown-item:hover {
    background: var(--color-primary-subtle);
  }

  .dropdown-item.danger {
    color: var(--color-red);
  }

  .dropdown-item.danger:hover {
    background: rgba(248, 113, 113, 0.1);
  }

  .item-icon {
    flex-shrink: 0;
    width: 1.25rem;
    text-align: center;
    font-size: 0.875rem;
  }

  .divider {
    height: 1px;
    background: var(--color-border);
    margin: 0.25rem 0;
  }
</style>
