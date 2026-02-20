<!--
  @component NoteHeader
  @fileoverview Top bar for the note page.

  Renders a horizontal header with breadcrumb navigation on the left and
  sync status + three-dot menu on the right. Uses a subtle bottom border
  to separate from the note content below.

  @prop {string} noteId - The current note's ID.
  @prop {Note} note - The current note object.
  @prop {Note[]} breadcrumbs - Ancestor chain from root to current note.
  @prop {boolean} isLocked - Whether the note is locked.
  @prop {() => void} onToggleLock - Callback to toggle note lock.
  @prop {() => void} onTrash - Callback to trash the note.
  @prop {() => void} onMove - Callback to open the move-note modal.
-->
<script lang="ts">
  import { debug } from 'stellar-drive/utils';
  import type { Note } from '$lib/types';
  import Breadcrumbs from './Breadcrumbs.svelte';
  import NoteSyncStatus from './NoteSyncStatus.svelte';
  import NoteMenu from './NoteMenu.svelte';

  // ===========================================================================
  //  Props
  // ===========================================================================

  let {
    noteId,
    note,
    breadcrumbs,
    isLocked,
    onToggleLock,
    onTrash,
    onMove
  }: {
    noteId: string;
    note: Note;
    breadcrumbs: Note[];
    isLocked: boolean;
    onToggleLock: () => void;
    onTrash: () => void;
    onMove: () => void;
  } = $props();

  $effect(() => {
    debug('log', '[NoteHeader] Rendered for note:', noteId);
  });
</script>

<header class="note-header">
  <div class="header-left">
    <Breadcrumbs crumbs={breadcrumbs} />
  </div>

  <div class="header-right">
    <NoteSyncStatus lastEditedAt={note.last_edited_at} lastEditedBy={note.last_edited_by} />
    <NoteMenu {isLocked} {onToggleLock} {onTrash} {onMove} />
  </div>
</header>

<style>
  .note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .header-left {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }
</style>
