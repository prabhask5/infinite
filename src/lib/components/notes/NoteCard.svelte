<!--
  @component NoteCard
  @fileoverview Card component for note listings.

  Renders a linked card tile showing the note's icon, title, and relative
  edit time. Uses the app's `.card` design pattern with elevated background,
  border, and hover lift effect. Title is truncated to 2 lines.

  @prop {Note} note - The note to display.
-->
<script lang="ts">
  import type { Note } from '$lib/types';

  // ===========================================================================
  //  Props
  // ===========================================================================

  let {
    note
  }: {
    note: Note;
  } = $props();

  // ===========================================================================
  //  Derived
  // ===========================================================================

  let displayIcon = $derived(note.icon ?? '\u{1F4C4}');

  let relativeTime = $derived.by(() => {
    const editedMs = new Date(note.last_edited_at).getTime();
    const diffSec = Math.floor((Date.now() - editedMs) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  });
</script>

<a class="note-card card" href="/notes/{note.id}">
  <span class="card-icon">{displayIcon}</span>
  <span class="card-title">{note.title}</span>
  <span class="card-time">{relativeTime}</span>
</a>

<style>
  .note-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    /* The .card class from app.css provides bg, border, radius, and hover */
  }

  .card-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .card-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-time {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: auto;
  }
</style>
