/**
 * @fileoverview Table of Contents block Tiptap extension.
 *
 * A custom block-level atom node that scans the document for headings
 * and renders a clickable, indented table of contents. Updates live
 * on every editor transaction. Click scrolls to the heading position.
 *
 * Uses a plain DOM NodeView for performance (no Svelte component).
 *
 * @see {@link ../NoteEditor.svelte} for CSS styles
 */

import { Node } from '@tiptap/core';

// =============================================================================
//  Module augmentation
// =============================================================================

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tocBlock: {
      /** Insert a Table of Contents block at the current position. */
      insertToc: () => ReturnType;
    };
  }
}

// =============================================================================
//  Extension
// =============================================================================

/**
 * Table of Contents block node.
 *
 * Renders a live-updating list of all headings in the document.
 * Each entry is clickable and scrolls to the corresponding heading.
 * Empty state is shown when no headings exist.
 */
export const TocBlock = Node.create({
  name: 'tocBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {};
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toc-block"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'toc-block', class: 'toc-block' }];
  },

  addCommands() {
    return {
      insertToc:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name });
        }
    };
  },

  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('div');
      dom.setAttribute('data-type', 'toc-block');
      dom.classList.add('toc-block');

      /** Scan the document for headings and rebuild the ToC DOM. */
      function buildToc() {
        dom.innerHTML = '';

        const headings: { level: number; text: string; pos: number }[] = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') {
            headings.push({
              level: node.attrs.level as number,
              text: node.textContent,
              pos
            });
          }
        });

        if (headings.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'toc-empty';
          empty.textContent = 'Add headings to see the table of contents';
          dom.appendChild(empty);
          return;
        }

        const title = document.createElement('div');
        title.className = 'toc-title';
        title.textContent = 'Table of Contents';
        dom.appendChild(title);

        const list = document.createElement('nav');
        list.className = 'toc-list';

        for (const h of headings) {
          const item = document.createElement('a');
          item.className = `toc-item toc-level-${h.level}`;
          item.textContent = h.text || 'Untitled';
          item.setAttribute('role', 'link');
          item.setAttribute('tabindex', '0');
          item.addEventListener('click', (e) => {
            e.preventDefault();
            editor
              .chain()
              .focus()
              .setTextSelection(h.pos + 1)
              .scrollIntoView()
              .run();
          });
          item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              editor
                .chain()
                .focus()
                .setTextSelection(h.pos + 1)
                .scrollIntoView()
                .run();
            }
          });
          list.appendChild(item);
        }

        dom.appendChild(list);
      }

      // Build initially
      buildToc();

      // Re-build on editor content changes
      const updateHandler = () => buildToc();
      editor.on('update', updateHandler);

      return {
        dom,
        destroy() {
          editor.off('update', updateHandler);
        }
      };
    };
  }
});
