/**
 * @fileoverview Image block Tiptap extension for Infinite Notes.
 *
 * Provides a custom block-level image node with:
 * - Paste and drop support for image files
 * - Resize handles via CSS
 * - Width and alignment attributes persisted in Yjs
 * - Alt text support
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { debug } from 'stellar-drive/utils';
import { validateImageFile, uploadImage } from '$lib/services/image-upload';

// Declare module augmentation for custom commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageBlock: {
      insertImage: (options: { src: string; alt?: string; width?: number }) => ReturnType;
    };
  }
}

export const ImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      width: { default: 100 }, // percentage
      alignment: { default: 'center' } // left, center, right
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="image-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, width, alignment } = HTMLAttributes;
    return [
      'figure',
      mergeAttributes({
        'data-type': 'image-block',
        class: `image-block align-${alignment}`,
        style: `max-width: ${width}%`
      }),
      ['img', { src, alt }]
    ];
  },

  addCommands() {
    return {
      insertImage:
        (options) =>
        ({ commands }) => {
          debug('log', '[ImageBlock] Inserting image:', options.src?.substring(0, 50) + '...');
          return commands.insertContent({
            type: this.name,
            attrs: options
          });
        }
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const figure = document.createElement('figure');
      figure.setAttribute('data-type', 'image-block');
      figure.className = `image-block align-${node.attrs.alignment}`;
      figure.style.maxWidth = `${node.attrs.width}%`;
      figure.setAttribute('draggable', 'true');

      const img = document.createElement('img');
      img.src = node.attrs.src;
      img.alt = node.attrs.alt || '';
      img.draggable = false;
      figure.appendChild(img);

      // Resize handle
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'image-resize-handle';
      figure.appendChild(resizeHandle);

      let startX = 0;
      let startWidth = 0;

      const onMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = figure.offsetWidth;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        figure.classList.add('resizing');
      };

      const onMouseMove = (e: MouseEvent) => {
        const diff = e.clientX - startX;
        const parent = figure.parentElement;
        if (!parent) return;
        const parentWidth = parent.offsetWidth;
        const newWidthPx = Math.max(100, startWidth + diff);
        const newWidthPct = Math.min(100, Math.round((newWidthPx / parentWidth) * 100));
        figure.style.maxWidth = `${newWidthPct}%`;
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        figure.classList.remove('resizing');

        const parent = figure.parentElement;
        if (!parent) return;
        const parentWidth = parent.offsetWidth;
        const newWidthPct = Math.min(100, Math.round((figure.offsetWidth / parentWidth) * 100));

        // Update node attributes via transaction
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (pos !== undefined) {
          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                width: newWidthPct
              });
              return true;
            })
            .run();
          debug('log', `[ImageBlock] Resized to ${newWidthPct}%`);
        }
      };

      resizeHandle.addEventListener('mousedown', onMouseDown);

      return {
        dom: figure,
        destroy() {
          resizeHandle.removeEventListener('mousedown', onMouseDown);
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }
      };
    };
  },

  addProseMirrorPlugins() {
    const noteId = 'unknown'; // Will be set per-editor

    return [
      new Plugin({
        key: new PluginKey('imageBlockPaste'),
        props: {
          handlePaste: (view, event) => {
            const files = Array.from(event.clipboardData?.files ?? []);
            const images = files.filter((f) => f.type.startsWith('image/'));

            if (images.length === 0) return false;

            event.preventDefault();

            for (const file of images) {
              const error = validateImageFile(file);
              if (error) {
                debug('warn', `[ImageBlock] Paste rejected: ${error}`);
                continue;
              }

              void uploadImage(file, noteId).then((src) => {
                const { state } = view;
                const tr = state.tr;
                const node = state.schema.nodes.imageBlock.create({
                  src,
                  alt: file.name
                });
                tr.replaceSelectionWith(node);
                view.dispatch(tr);
                debug('log', '[ImageBlock] Image pasted successfully');
              });
            }

            return true;
          },
          handleDrop: (view, event) => {
            const files = Array.from(event.dataTransfer?.files ?? []);
            const images = files.filter((f) => f.type.startsWith('image/'));

            if (images.length === 0) return false;

            event.preventDefault();

            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY
            });
            if (!coordinates) return false;

            for (const file of images) {
              const error = validateImageFile(file);
              if (error) {
                debug('warn', `[ImageBlock] Drop rejected: ${error}`);
                continue;
              }

              void uploadImage(file, noteId).then((src) => {
                const { state } = view;
                const tr = state.tr;
                const node = state.schema.nodes.imageBlock.create({
                  src,
                  alt: file.name
                });
                tr.insert(coordinates.pos, node);
                view.dispatch(tr);
                debug('log', '[ImageBlock] Image dropped successfully');
              });
            }

            return true;
          }
        }
      })
    ];
  }
});
