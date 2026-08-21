import { mergeAttributes, Node } from '@tiptap/core'
import {
  CHAT_PROMPT_TOKEN_NODE_NAME,
  createChatPromptTokenText,
} from '@/workbenches/chat/composer/chatComposerInput'

export const ChatPromptToken = Node.create({
  name: CHAT_PROMPT_TOKEN_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: 'file' },
      label: { default: '' },
      value: { default: '' },
      path: { default: null },
      description: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="chat-prompt-token"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({
        'class': 'chat-prompt-token-node',
        'contenteditable': 'false',
        'data-type': 'chat-prompt-token',
      }, HTMLAttributes),
      createChatPromptTokenText({
        description: typeof node.attrs.description === 'string' ? node.attrs.description : null,
        kind: node.attrs.kind,
        label: node.attrs.label,
        path: typeof node.attrs.path === 'string' ? node.attrs.path : null,
        value: node.attrs.value,
      }),
    ]
  },
})
