/**
 * @fileoverview Link preview block Tiptap extension.
 *
 * A custom block-level atom node that renders a rich link preview card
 * with title, description, OG image, favicon, and domain.
 * Metadata is stored in node attributes (persisted in Yjs doc).
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { debug } from 'stellar-drive/utils';

// Declare module augmentation for custom commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    linkPreviewBlock: {
      /** Insert a link preview block for the given URL. */
      insertLinkPreview: (options: { url: string }) => ReturnType;
    };
  }
}

export const LinkPreviewBlock = Node.create({
  name: 'linkPreviewBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: { default: null },
      title: { default: '' },
      description: { default: '' },
      image: { default: null },
      favicon: { default: null },
      domain: { default: '' },
      loaded: { default: false }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="link-preview"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-type': 'link-preview', class: 'link-preview-block' }),
      HTMLAttributes.title || HTMLAttributes.url || 'Link Preview'
    ];
  },

  addCommands() {
    return {
      insertLinkPreview:
        (options) =>
        ({ commands, editor }) => {
          debug('log', '[LinkPreview] Inserting preview for:', options.url);

          // Insert with loading state, then fetch metadata
          const inserted = commands.insertContent({
            type: this.name,
            attrs: { url: options.url, loaded: false }
          });

          // Fetch preview data asynchronously
          if (inserted) {
            void fetchAndUpdatePreview(editor, options.url);
          }

          return inserted;
        }
    };
  },

  addNodeView() {
    return ({ node, editor: _editor, getPos: _getPos }) => {
      const container = document.createElement('div');
      container.setAttribute('data-type', 'link-preview');
      container.className = 'link-preview-block';
      container.setAttribute('draggable', 'true');

      /**
       * Render the link preview card DOM into the container.
       * Handles both loading skeleton and fully-loaded states.
       */
      function render() {
        container.innerHTML = '';

        if (!node.attrs.loaded) {
          // Loading skeleton
          container.classList.add('loading');
          const skeleton = document.createElement('div');
          skeleton.className = 'link-preview-skeleton';
          skeleton.innerHTML = `
						<div class="skeleton-line skeleton-title"></div>
						<div class="skeleton-line skeleton-desc"></div>
						<div class="skeleton-line skeleton-domain"></div>
					`;
          container.appendChild(skeleton);
          return;
        }

        container.classList.remove('loading');

        // Main content wrapper (clickable)
        const link = document.createElement('a');
        link.href = node.attrs.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'link-preview-content';
        link.addEventListener('click', (e) => {
          // Only open in new tab, don't interfere with editor
          e.stopPropagation();
        });

        // Text side
        const textSide = document.createElement('div');
        textSide.className = 'link-preview-text';

        // Domain + favicon
        const domainRow = document.createElement('div');
        domainRow.className = 'link-preview-domain';
        if (node.attrs.favicon) {
          const favicon = document.createElement('img');
          favicon.src = node.attrs.favicon;
          favicon.className = 'link-preview-favicon';
          favicon.width = 14;
          favicon.height = 14;
          favicon.onerror = () => {
            favicon.style.display = 'none';
          };
          domainRow.appendChild(favicon);
        }
        const domainText = document.createElement('span');
        domainText.textContent = node.attrs.domain || new URL(node.attrs.url).hostname;
        domainRow.appendChild(domainText);
        textSide.appendChild(domainRow);

        // Title
        if (node.attrs.title) {
          const title = document.createElement('div');
          title.className = 'link-preview-title';
          title.textContent = node.attrs.title;
          textSide.appendChild(title);
        }

        // Description
        if (node.attrs.description) {
          const desc = document.createElement('div');
          desc.className = 'link-preview-desc';
          desc.textContent = node.attrs.description;
          textSide.appendChild(desc);
        }

        link.appendChild(textSide);

        // OG Image
        if (node.attrs.image) {
          const imgWrap = document.createElement('div');
          imgWrap.className = 'link-preview-image';
          const img = document.createElement('img');
          img.src = node.attrs.image;
          img.alt = node.attrs.title || '';
          img.onerror = () => {
            imgWrap.style.display = 'none';
          };
          imgWrap.appendChild(img);
          link.appendChild(imgWrap);
        }

        container.appendChild(link);
      }

      render();

      return {
        dom: container,
        update(updatedNode) {
          if (updatedNode.type.name !== 'linkPreviewBlock') return false;
          node = updatedNode;
          render();
          return true;
        }
      };
    };
  }
});

/**
 * Fetch link preview data from the API and update the node.
 * Calls the `/api/link-preview` endpoint, then traverses the editor
 * document to find the matching unloaded node and sets its attributes.
 *
 * @param editor - The Tiptap editor instance.
 * @param url - The URL to fetch preview for.
 */
async function fetchAndUpdatePreview(
  editor: import('@tiptap/core').Editor,
  url: string
): Promise<void> {
  try {
    debug('log', '[LinkPreview] Fetching metadata for:', url);

    const response = await fetch('/api/link-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      debug('warn', '[LinkPreview] API returned error:', response.status);
      return;
    }

    const data = await response.json();

    // Find the node in the document and update its attributes
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'linkPreviewBlock' && node.attrs.url === url && !node.attrs.loaded) {
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              title: data.title || '',
              description: data.description || '',
              image: data.image || null,
              favicon: data.favicon || null,
              domain: data.domain || '',
              loaded: true
            });
            return true;
          })
          .run();
        debug('log', '[LinkPreview] Updated preview for:', url);
        return false; // Stop traversal
      }
    });
  } catch (err) {
    debug('error', '[LinkPreview] Failed to fetch:', err);
  }
}
