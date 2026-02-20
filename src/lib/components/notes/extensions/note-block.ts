/**
 * @fileoverview Note block Tiptap extension.
 *
 * A custom block-level atom node that embeds a link to a child note.
 * Displays the note's icon and title in a card-style block.
 * Click navigates to the child note.
 * Deleted notes show a grey "removed" state.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { debug } from 'stellar-drive/utils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteBlock: {
      insertNoteBlock: (options: {
        noteId: string;
        noteTitle: string;
        noteIcon?: string;
      }) => ReturnType;
    };
  }
}

export const NoteBlock = Node.create({
  name: 'noteBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      noteId: { default: null },
      noteTitle: { default: 'Untitled' },
      noteIcon: { default: null }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="note-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({
        'data-type': 'note-block',
        'data-note-id': HTMLAttributes.noteId,
        'data-note-title': HTMLAttributes.noteTitle,
        class: 'note-block'
      }),
      `${HTMLAttributes.noteIcon || '📄'} ${HTMLAttributes.noteTitle}`
    ];
  },

  addCommands() {
    return {
      insertNoteBlock:
        (options) =>
        ({ commands }) => {
          debug('log', '[NoteBlock] Inserting note block:', options.noteId);
          return commands.insertContent({
            type: this.name,
            attrs: options
          });
        }
    };
  },

  addNodeView() {
    return ({ node }) => {
      const container = document.createElement('div');
      container.setAttribute('data-type', 'note-block');
      container.setAttribute('data-note-id', node.attrs.noteId || '');
      container.setAttribute('data-note-title', node.attrs.noteTitle || '');
      container.className = 'note-block';
      container.setAttribute('draggable', 'true');
      container.setAttribute('role', 'link');
      container.setAttribute('tabindex', '0');

      const icon = document.createElement('span');
      icon.className = 'note-block-icon';
      icon.textContent = node.attrs.noteIcon || '\u{1F4C4}';
      container.appendChild(icon);

      const title = document.createElement('span');
      title.className = 'note-block-title';
      title.textContent = node.attrs.noteTitle || 'Untitled';
      container.appendChild(title);

      const arrow = document.createElement('span');
      arrow.className = 'note-block-arrow';
      arrow.textContent = '\u{2192}';
      container.appendChild(arrow);

      // Click navigates to the child note
      const handleClick = (e: Event) => {
        e.preventDefault();
        if (node.attrs.noteId) {
          // Use window.location for navigation (works with SvelteKit)
          window.location.href = `/notes/${node.attrs.noteId}`;
        }
      };

      container.addEventListener('click', handleClick);
      container.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') handleClick(e);
      });

      return {
        dom: container,
        update(updatedNode) {
          if (updatedNode.type.name !== 'noteBlock') return false;
          icon.textContent = updatedNode.attrs.noteIcon || '\u{1F4C4}';
          title.textContent = updatedNode.attrs.noteTitle || 'Untitled';
          container.setAttribute('data-note-id', updatedNode.attrs.noteId || '');
          return true;
        }
      };
    };
  }
});
