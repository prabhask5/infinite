/**
 * @fileoverview Drag handle extension for block reordering.
 *
 * Adds a 6-dot grip icon to the left of top-level blocks on hover.
 * Dragging a block moves it via ProseMirror transactions (CRDT-safe).
 * Uses ProseMirror decorations for performance.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { debug } from 'stellar-drive/utils';

export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    let dragHandleEl: HTMLElement | null = null;
    let currentBlockPos: number | null = null;
    let dropIndicator: HTMLElement | null = null;

    /**
     * Creates the floating drag handle element with a 6-dot grip SVG icon.
     * Positioned absolutely to the left of the hovered block.
     */
    const createDragHandle = (): HTMLElement => {
      const el = document.createElement('div');
      el.className = 'drag-handle';
      el.setAttribute('draggable', 'true');
      el.setAttribute('aria-label', 'Drag to reorder');
      el.innerHTML = `<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
        <circle cx="2" cy="2" r="1.5"/>
        <circle cx="8" cy="2" r="1.5"/>
        <circle cx="2" cy="8" r="1.5"/>
        <circle cx="8" cy="8" r="1.5"/>
        <circle cx="2" cy="14" r="1.5"/>
        <circle cx="8" cy="14" r="1.5"/>
      </svg>`;
      el.style.cssText = `
        position: absolute;
        left: -28px;
        width: 20px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        color: var(--color-text-muted);
        opacity: 0;
        transition: opacity 0.15s ease;
        border-radius: 4px;
        z-index: 10;
      `;
      return el;
    };

    /**
     * Creates the horizontal drop indicator line shown during drag-over.
     * Uses --color-primary for visual consistency.
     */
    const createDropIndicator = (): HTMLElement => {
      const el = document.createElement('div');
      el.className = 'drop-indicator';
      el.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--color-primary);
        border-radius: 1px;
        pointer-events: none;
        display: none;
        z-index: 20;
      `;
      return el;
    };

    return [
      new Plugin({
        key: new PluginKey('dragHandle'),
        view(editorView) {
          dragHandleEl = createDragHandle();
          dropIndicator = createDropIndicator();

          const editorDom = editorView.dom.parentElement;
          if (editorDom) {
            editorDom.style.position = 'relative';
            editorDom.appendChild(dragHandleEl);
            editorDom.appendChild(dropIndicator);
          }

          /**
           * Shows the drag handle next to whichever top-level block
           * the cursor is hovering over.
           */
          const handleMouseMove = (e: MouseEvent) => {
            if (!dragHandleEl || !editorView.dom) return;

            const pos = editorView.posAtCoords({ left: e.clientX, top: e.clientY });
            if (!pos) {
              dragHandleEl.style.opacity = '0';
              return;
            }

            // Find the top-level block
            const resolved = editorView.state.doc.resolve(pos.pos);
            const topLevelDepth = 1;

            if (resolved.depth < topLevelDepth) {
              dragHandleEl.style.opacity = '0';
              return;
            }

            const blockPos = resolved.before(topLevelDepth);
            const blockNode = editorView.state.doc.nodeAt(blockPos);
            if (!blockNode) {
              dragHandleEl.style.opacity = '0';
              return;
            }

            currentBlockPos = blockPos;

            // Position the handle next to the block
            const domAtPos = editorView.domAtPos(blockPos);
            const blockDom =
              domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;

            if (blockDom) {
              const blockRect = blockDom.getBoundingClientRect();
              const editorRect = editorView.dom.parentElement!.getBoundingClientRect();

              dragHandleEl.style.top = `${blockRect.top - editorRect.top + 2}px`;
              dragHandleEl.style.opacity = '1';
            }
          };

          /**
           * Initiates the drag operation, storing the current block position.
           */
          const handleDragStart = (e: DragEvent) => {
            if (currentBlockPos === null) return;

            e.dataTransfer?.setData('text/plain', String(currentBlockPos));
            dragHandleEl!.style.cursor = 'grabbing';
            debug('log', `[DragHandle] Drag started at pos ${currentBlockPos}`);
          };

          /**
           * Positions the drop indicator above or below the hovered block
           * based on cursor position relative to block midpoint.
           */
          const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            if (!dropIndicator || !editorView.dom) return;

            const pos = editorView.posAtCoords({ left: e.clientX, top: e.clientY });
            if (!pos) return;

            const resolved = editorView.state.doc.resolve(pos.pos);
            if (resolved.depth < 1) return;

            const blockPos = resolved.before(1);
            const domAtPos = editorView.domAtPos(blockPos);
            const blockDom =
              domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;

            if (blockDom) {
              const blockRect = blockDom.getBoundingClientRect();
              const editorRect = editorView.dom.parentElement!.getBoundingClientRect();
              const midpoint = blockRect.top + blockRect.height / 2;

              // Show indicator above or below the block
              const indicatorTop =
                e.clientY < midpoint
                  ? blockRect.top - editorRect.top
                  : blockRect.bottom - editorRect.top;

              dropIndicator.style.display = 'block';
              dropIndicator.style.top = `${indicatorTop}px`;
            }
          };

          /**
           * Handles the drop event — moves the dragged block to the target
           * position via a ProseMirror transaction (CRDT-safe with Yjs).
           */
          const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            if (!dropIndicator) return;
            dropIndicator.style.display = 'none';

            const fromPosStr = e.dataTransfer?.getData('text/plain');
            if (!fromPosStr) return;

            const fromPos = parseInt(fromPosStr, 10);
            if (isNaN(fromPos)) return;

            const dropCoords = editorView.posAtCoords({
              left: e.clientX,
              top: e.clientY
            });
            if (!dropCoords) return;

            const { state } = editorView;
            const fromResolved = state.doc.resolve(fromPos);
            if (fromResolved.depth < 1) return;

            const blockStart = fromResolved.before(1);
            const blockNode = state.doc.nodeAt(blockStart);
            if (!blockNode) return;

            const blockEnd = blockStart + blockNode.nodeSize;

            // Determine insert position
            const dropResolved = state.doc.resolve(dropCoords.pos);
            let targetPos: number;
            if (dropResolved.depth >= 1) {
              const targetBlockPos = dropResolved.before(1);
              const targetNode = state.doc.nodeAt(targetBlockPos);
              if (!targetNode) return;

              const targetRect = editorView.domAtPos(targetBlockPos);
              const targetDom =
                targetRect.node instanceof HTMLElement
                  ? targetRect.node
                  : targetRect.node.parentElement;

              if (targetDom) {
                const rect = targetDom.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                targetPos =
                  e.clientY < midpoint ? targetBlockPos : targetBlockPos + targetNode.nodeSize;
              } else {
                targetPos = targetBlockPos + targetNode.nodeSize;
              }
            } else {
              targetPos = dropCoords.pos;
            }

            // Don't move if dropping in same position
            if (targetPos >= blockStart && targetPos <= blockEnd) return;

            // Build transaction
            const tr = state.tr;
            const slice = state.doc.slice(blockStart, blockEnd);

            // Delete original first, then insert at adjusted position
            tr.delete(blockStart, blockEnd);
            const adjustedPos = targetPos > blockStart ? targetPos - blockNode.nodeSize : targetPos;
            tr.insert(adjustedPos, slice.content);

            editorView.dispatch(tr);
            debug('log', `[DragHandle] Block moved from ${blockStart} to ${adjustedPos}`);
          };

          /**
           * Resets cursor and hides drop indicator when drag ends.
           */
          const handleDragEnd = () => {
            if (dragHandleEl) dragHandleEl.style.cursor = 'grab';
            if (dropIndicator) dropIndicator.style.display = 'none';
          };

          // Attach listeners
          editorView.dom.addEventListener('mousemove', handleMouseMove);
          dragHandleEl.addEventListener('dragstart', handleDragStart);
          editorView.dom.addEventListener('dragover', handleDragOver);
          editorView.dom.addEventListener('drop', handleDrop);
          editorView.dom.addEventListener('dragend', handleDragEnd);

          return {
            destroy() {
              editorView.dom.removeEventListener('mousemove', handleMouseMove);
              editorView.dom.removeEventListener('dragover', handleDragOver);
              editorView.dom.removeEventListener('drop', handleDrop);
              editorView.dom.removeEventListener('dragend', handleDragEnd);
              dragHandleEl?.remove();
              dropIndicator?.remove();
            }
          };
        }
      })
    ];
  }
});
