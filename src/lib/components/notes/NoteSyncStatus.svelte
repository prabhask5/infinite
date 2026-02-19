<!--
  @component NoteSyncStatus
  @fileoverview Relative time display for note edit status.

  Shows how long ago the note was last edited in a human-readable relative
  format ("Edited just now", "Edited 5m ago", etc.). Updates every 30 seconds
  via setInterval. Hover tooltip shows the editor name and full datetime.

  @prop {string} lastEditedAt - ISO timestamp of the last edit.
  @prop {string | null} lastEditedBy - Display name of the last editor, or null.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';

  // ===========================================================================
  //  Props
  // ===========================================================================

  let {
    lastEditedAt,
    lastEditedBy
  }: {
    lastEditedAt: string;
    lastEditedBy: string | null;
  } = $props();

  // ===========================================================================
  //  State
  // ===========================================================================

  let now = $state(Date.now());

  // ===========================================================================
  //  Derived
  // ===========================================================================

  let relativeTime = $derived.by(() => {
    const editedMs = new Date(lastEditedAt).getTime();
    const diffSec = Math.floor((now - editedMs) / 1000);

    if (diffSec < 60) return 'Edited just now';
    if (diffSec < 3600) return `Edited ${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `Edited ${Math.floor(diffSec / 3600)}h ago`;
    return `Edited ${Math.floor(diffSec / 86400)}d ago`;
  });

  let tooltipText = $derived.by(() => {
    const date = new Date(lastEditedAt);
    const formatted = date.toLocaleString();
    if (lastEditedBy) {
      return `Edited by ${lastEditedBy} at ${formatted}`;
    }
    return `Edited at ${formatted}`;
  });

  // ===========================================================================
  //  Interval
  // ===========================================================================

  const interval = setInterval(() => {
    now = Date.now();
  }, 30_000);

  onDestroy(() => {
    clearInterval(interval);
  });
</script>

<span class="sync-status" title={tooltipText}>
  {relativeTime}
</span>

<style>
  .sync-status {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    cursor: default;
    user-select: none;
  }
</style>
