/**
 * @fileoverview Comment mark Tiptap extension.
 *
 * Renders highlighted text with a comment ID attribute. The mark links
 * inline text in the editor to comment records in the database.
 */

import { Mark, mergeAttributes } from '@tiptap/core';
import { debug } from 'stellar-drive/utils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setComment: (commentId: string) => ReturnType;
      unsetComment: () => ReturnType;
    };
  }
}

export const CommentMark = Mark.create({
  name: 'comment',

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.commentId) return {};
          return { 'data-comment-id': attributes.commentId };
        }
      }
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes({ class: 'comment-highlight' }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setComment:
        (commentId) =>
        ({ commands }) => {
          debug('log', '[CommentMark] Setting comment mark:', commentId);
          return commands.setMark(this.name, { commentId });
        },
      unsetComment:
        () =>
        ({ commands }) => {
          debug('log', '[CommentMark] Removing comment mark');
          return commands.unsetMark(this.name);
        }
    };
  }
});
