<!--
  @component SlashCommandMenu
  @fileoverview Floating dropdown UI for slash commands in the editor.

  Positioned absolutely using the `clientRect` callback from Tiptap's
  suggestion system. Displays a filterable list of block-type commands
  with icon, title, and description. Supports keyboard navigation via
  the `selectedIndex` prop and click selection.

  @prop {SlashCommandItem[]} items - The filtered list of available commands.
  @prop {number} selectedIndex - Index of the keyboard-highlighted item.
  @prop {(item: SlashCommandItem) => void} onSelect - Callback when an item is selected.
  @prop {(() => DOMRect | null) | null} clientRect - Position callback from Tiptap suggestion.
-->
<script lang="ts">
  import { debug } from 'stellar-drive/utils';
  import type { SlashCommandItem } from './extensions/slash-commands';

  // ===========================================================================
  //  Props
  // ===========================================================================

  let {
    items,
    selectedIndex,
    onSelect,
    clientRect
  }: {
    items: SlashCommandItem[];
    selectedIndex: number;
    onSelect: (item: SlashCommandItem) => void;
    clientRect: (() => DOMRect | null) | null;
  } = $props();

  // ===========================================================================
  //  State
  // ===========================================================================

  let menuEl: HTMLDivElement | undefined = $state(undefined);

  // ===========================================================================
  //  Derived
  // ===========================================================================

  let position = $derived.by(() => {
    if (!clientRect) return { top: 0, left: 0, visible: false };

    const rect = clientRect();
    if (!rect) return { top: 0, left: 0, visible: false };

    return {
      top: rect.bottom + 8,
      left: rect.left,
      visible: true
    };
  });

  // ===========================================================================
  //  Effects
  // ===========================================================================

  $effect(() => {
    // Scroll the selected item into view
    if (menuEl && items.length > 0) {
      const selected = menuEl.querySelector(`[data-index="${selectedIndex}"]`);
      selected?.scrollIntoView({ block: 'nearest' });
    }
  });

  // ===========================================================================
  //  Handlers
  // ===========================================================================

  function handleItemClick(item: SlashCommandItem) {
    debug('log', '[SlashCommandMenu] Selected:', item.title);
    onSelect(item);
  }
</script>

{#if position.visible && items.length > 0}
  <div
    class="slash-menu"
    bind:this={menuEl}
    style="top: {position.top}px; left: {position.left}px;"
    role="listbox"
    aria-label="Slash commands"
  >
    {#each items as item, i (item.command)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="slash-item"
        class:selected={i === selectedIndex}
        data-index={i}
        role="option"
        tabindex="-1"
        aria-selected={i === selectedIndex}
        onclick={() => handleItemClick(item)}
      >
        <span class="item-badge">{item.icon}</span>
        <div class="item-text">
          <span class="item-title">{item.title}</span>
          <span class="item-desc">{item.description}</span>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .slash-menu {
    position: fixed;
    z-index: 60;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: 0.25rem;
    max-height: 280px;
    overflow-y: auto;
    min-width: 220px;
    max-width: 300px;
  }

  .slash-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.625rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .slash-item:hover,
  .slash-item.selected {
    background: var(--color-primary-subtle);
  }

  .item-badge {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: 1rem;
  }

  .item-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .item-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .item-desc {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
