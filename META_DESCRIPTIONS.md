# Meta Descriptions

Short-form descriptions for GitHub, social media, and search engines.

---

## GitHub Repository Description (one-line)

Offline-first notes PWA with rich text editing, comments, image blocks, bookmarks, drag-and-drop reordering, CRDT collaboration, and PIN-based auth -- built with SvelteKit, Tiptap, Yjs, and Supabase.

---

## GitHub Topics / Keywords

`notes` `pwa` `offline-first` `crdt` `yjs` `tiptap` `prosemirror` `sveltekit` `svelte` `supabase` `indexeddb` `dexie` `collaborative-editing` `self-hosted` `local-first` `rich-text-editor` `notion-alternative` `typescript` `comments` `drag-and-drop` `image-blocks` `link-preview`

---

## Social Preview Text (160 characters)

Infinite Notes: a self-hosted, offline-first notes app with slash commands, real-time CRDT collaboration, and PIN-based auth. Deploy to Vercel + Supabase in minutes.

---

## Tweet-Length Summary

I built a self-hosted Notion alternative: offline-first rich text editor with slash commands, Yjs CRDTs for conflict-free multi-device editing, PIN auth, and installable as a PWA. SvelteKit + Tiptap + Supabase.

---

## File Descriptions

### Extensions

| File | Description |
|------|-------------|
| `src/lib/components/notes/extensions/comment-mark.ts` | Custom Tiptap Mark that renders `<mark>` elements with a `commentId` attribute and `.comment-highlight` class for inline comment highlighting. |
| `src/lib/components/notes/extensions/image-block.ts` | Custom Tiptap Node for image blocks with resize handles and paste/drop upload support. Images stored as data URLs. |
| `src/lib/components/notes/extensions/link-preview-block.ts` | Custom Tiptap Node that renders a rich bookmark card with OG metadata (title, description, image, favicon). |
| `src/lib/components/notes/extensions/note-block.ts` | Custom Tiptap Node for embedded sub-page cards. Clicking the block navigates to the child note. |
| `src/lib/components/notes/extensions/toc-block.ts` | Custom Tiptap Node that renders a live-updating table of contents from the document's headings. |
| `src/lib/components/notes/extensions/drag-handle.ts` | ProseMirror plugin that adds floating drag handles on hover for native drag-and-drop block reordering. |

### Components

| File | Description |
|------|-------------|
| `src/lib/components/notes/CommentsPanel.svelte` | Slide-in right sidebar that lists all comments for the current note with resolve and delete actions. |
| `src/lib/components/notes/AddCommentPopover.svelte` | Floating popover that appears on text selection, allowing the user to write and submit a comment. |

### Stores and Services

| File | Description |
|------|-------------|
| `src/lib/stores/comments.ts` | CRUD operations for the `note_comments` table using the stellar-drive data API. Provides reactive collection store. |
| `src/lib/components/notes/services/image-upload.ts` | Validates image files (type, size) and converts them to base64 data URLs using FileReader. |

### API Routes

| File | Description |
|------|-------------|
| `src/routes/api/link-preview/+server.ts` | Server-side endpoint that fetches a URL, extracts Open Graph meta tags with cheerio, and returns structured preview data. |

### Modified Files (feature integration)

| File | Changes |
|------|---------|
| `src/lib/components/notes/NoteEditor.svelte` | Registers all 6 new Tiptap extensions; adds CSS for comment highlights, image blocks, bookmark cards, TOC, and drag handles. |
| `src/lib/components/notes/EditorToolbar.svelte` | Added comment button to the floating bubble toolbar. |
| `src/lib/components/notes/NoteHeader.svelte` | Added comments toggle button and offline availability indicator props. |
| `src/lib/components/notes/NoteMenu.svelte` | Added "Available offline" toggle menu item. |
| `src/routes/notes/[id]/+page.svelte` | Wired CommentsPanel, AddCommentPopover, and offline toggle into the note editor page. |
| `src/lib/components/notes/extensions/slash-commands.ts` | Added 4 new slash commands: Image (`/image`), Bookmark (`/bookmark`), Sub-page (`/sub-page`), Table of Contents (`/toc`). |
| `src/lib/schema.ts` | Added `note_comments` table and `is_offline` field to `notes` table. |
| `src/lib/types.ts` | Added `NoteComment` interface. |
| `src/lib/stores/notes.ts` | Added `toggleOffline()` function. |
