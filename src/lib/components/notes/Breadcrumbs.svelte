<!--
  @component Breadcrumbs
  @fileoverview Parent chain navigation for the note hierarchy.

  Renders a horizontal breadcrumb trail of ancestor notes as links.
  If more than 4 crumbs, collapses the middle ones into an ellipsis
  (showing the first crumb, "...", and the last 2). The last crumb
  (current page) is rendered as plain text, not a link.

  @prop {Note[]} crumbs - Array of notes from root to current (inclusive).
-->
<script lang="ts">
  import { debug } from 'stellar-drive/utils';
  import type { Note } from '$lib/types';

  // ===========================================================================
  //  Props
  // ===========================================================================

  let {
    crumbs
  }: {
    crumbs: Note[];
  } = $props();

  // ===========================================================================
  //  Derived
  // ===========================================================================

  /** Visible crumbs with optional ellipsis collapse. */
  let visibleCrumbs = $derived.by(() => {
    if (crumbs.length <= 4)
      return crumbs.map((c, i) => ({
        note: c,
        isEllipsis: false,
        isLast: i === crumbs.length - 1
      }));

    debug('log', '[Breadcrumbs] Collapsing', crumbs.length, 'crumbs');
    const first = crumbs[0];
    const lastTwo = crumbs.slice(-2);

    return [
      { note: first, isEllipsis: false, isLast: false },
      { note: null as unknown as Note, isEllipsis: true, isLast: false },
      { note: lastTwo[0], isEllipsis: false, isLast: false },
      { note: lastTwo[1], isEllipsis: false, isLast: true }
    ];
  });
</script>

{#if crumbs.length > 0}
  <nav class="breadcrumbs" aria-label="Note breadcrumbs">
    {#each visibleCrumbs as crumb, i (crumb.isEllipsis ? `ellipsis-${i}` : (crumb.note?.id ?? i))}
      {#if i > 0}
        <span class="separator" aria-hidden="true">&rsaquo;</span>
      {/if}

      {#if crumb.isEllipsis}
        <span class="ellipsis" aria-hidden="true">&hellip;</span>
      {:else if crumb.isLast}
        <span class="crumb current" aria-current="page">
          {#if crumb.note.icon}<span class="crumb-icon">{crumb.note.icon}</span>{/if}
          <span class="crumb-title">{crumb.note.title}</span>
        </span>
      {:else}
        <a class="crumb" href="/notes/{crumb.note.id}">
          {#if crumb.note.icon}<span class="crumb-icon">{crumb.note.icon}</span>{/if}
          <span class="crumb-title">{crumb.note.title}</span>
        </a>
      {/if}
    {/each}
  </nav>
{/if}

<style>
  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    overflow: hidden;
    min-width: 0;
  }

  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--color-text-muted);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
    transition: color 0.15s ease;
  }

  a.crumb:hover {
    color: var(--color-text-secondary);
  }

  .crumb.current {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .crumb-icon {
    flex-shrink: 0;
    font-size: 0.75rem;
  }

  .crumb-title {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .separator {
    flex-shrink: 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    opacity: 0.6;
  }

  .ellipsis {
    color: var(--color-text-muted);
    letter-spacing: 0.1em;
  }
</style>
