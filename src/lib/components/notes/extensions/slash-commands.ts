/**
 * @fileoverview Slash command Tiptap extension — triggers a command palette on `/`.
 *
 * Uses `@tiptap/suggestion` to detect when the user types `/` at the start of
 * a block or after a space. Shows a filtered dropdown of available block types
 * that the user can navigate with arrow keys and select with Enter.
 *
 * Phase 1 commands: text, header1-4, bullet, todo, code.
 * Phase 2 will add: link, note, image, tableofcontents.
 *
 * @see {@link ../SlashCommandMenu.svelte} for the floating dropdown UI
 */

// =============================================================================
//  Imports
// =============================================================================

import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import type { Editor, Range } from '@tiptap/core';
import type { SuggestionOptions } from '@tiptap/suggestion';

// =============================================================================
//  Types
// =============================================================================

/** A single slash command entry. */
export interface SlashCommandItem {
  /** Display title (e.g. "Heading 1"). */
  title: string;
  /** Short description shown below the title. */
  description: string;
  /** The slash trigger text (e.g. "header1"). */
  command: string;
  /** Icon label for visual identification. */
  icon: string;
  /** The action to execute when this command is selected. */
  action: (editor: Editor, range: Range) => void;
}

/** Props passed to the slash command menu renderer. */
export interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  clientRect: (() => DOMRect | null) | null;
}

// =============================================================================
//  Command Definitions
// =============================================================================

/** All available slash commands for Phase 1. */
export const slashCommands: SlashCommandItem[] = [
  {
    title: 'Text',
    description: 'Plain text paragraph',
    command: 'text',
    icon: 'T',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    }
  },
  {
    title: 'Heading 1',
    description: 'Large section heading',
    command: 'header1',
    icon: 'H1',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    }
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    command: 'header2',
    icon: 'H2',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    }
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    command: 'header3',
    icon: 'H3',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    }
  },
  {
    title: 'Heading 4',
    description: 'Smallest section heading',
    command: 'header4',
    icon: 'H4',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 4 }).run();
    }
  },
  {
    title: 'Bullet List',
    description: 'Unordered bullet list',
    command: 'bullet',
    icon: '•',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    }
  },
  {
    title: 'To-do List',
    description: 'Checklist with toggleable items',
    command: 'todo',
    icon: '☑',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    }
  },
  {
    title: 'Code Block',
    description: 'Monospace code block',
    command: 'code',
    icon: '</>',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    }
  }
];

// =============================================================================
//  Extension
// =============================================================================

/**
 * Custom Tiptap extension that provides slash command functionality.
 *
 * Renders a floating dropdown when the user types `/` at the beginning of a
 * block. The dropdown filters commands as the user continues typing.
 *
 * The extension delegates rendering to external callbacks (onStart, onUpdate,
 * onExit, onKeyDown) that are connected to the SlashCommandMenu Svelte component.
 */
export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({
          editor,
          range,
          props
        }: {
          editor: Editor;
          range: Range;
          props: SlashCommandItem;
        }) => {
          props.action(editor, range);
        },
        items: ({ query }: { query: string }): SlashCommandItem[] => {
          const q = query.toLowerCase();
          return slashCommands.filter(
            (item) => item.title.toLowerCase().includes(q) || item.command.toLowerCase().includes(q)
          );
        }
      } satisfies Partial<SuggestionOptions<SlashCommandItem>>
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        ...this.options.suggestion
      })
    ];
  }
});
