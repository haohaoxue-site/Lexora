import { mergeAttributes, Node } from '@tiptap/core'
import {
  BUDDY_PROMPT_TOKEN_NODE_NAME,
  createBuddyPromptTokenText,
} from '@/chat/buddyChatInput'

export const BuddyPromptToken = Node.create({
  name: BUDDY_PROMPT_TOKEN_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: 'file',
        parseHTML: element => element.getAttribute('data-kind'),
        renderHTML: attributes => ({ 'data-kind': attributes.kind }),
      },
      label: {
        default: '',
        parseHTML: element => element.getAttribute('data-label') ?? '',
        renderHTML: attributes => ({ 'data-label': attributes.label }),
      },
      value: {
        default: '',
        parseHTML: element => element.getAttribute('data-value') ?? '',
        renderHTML: attributes => ({ 'data-value': attributes.value }),
      },
      path: {
        default: null,
        parseHTML: element => element.getAttribute('data-path'),
        renderHTML: attributes => renderOptionalAttribute('data-path', attributes.path),
      },
      description: {
        default: null,
        parseHTML: element => element.getAttribute('data-description'),
        renderHTML: attributes => renderOptionalAttribute('data-description', attributes.description),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="buddy-prompt-token"]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        {
          'class': 'buddy-prompt-token-node',
          'contenteditable': 'false',
          'data-type': 'buddy-prompt-token',
        },
        HTMLAttributes,
      ),
      createBuddyPromptTokenText({
        description: typeof node.attrs.description === 'string' ? node.attrs.description : null,
        kind: node.attrs.kind,
        label: node.attrs.label,
        path: typeof node.attrs.path === 'string' ? node.attrs.path : null,
        value: node.attrs.value,
      }),
    ]
  },

  renderText({ node }) {
    return createBuddyPromptTokenText({
      description: typeof node.attrs.description === 'string' ? node.attrs.description : null,
      kind: node.attrs.kind,
      label: node.attrs.label,
      path: typeof node.attrs.path === 'string' ? node.attrs.path : null,
      value: node.attrs.value,
    })
  },
})

function renderOptionalAttribute(name: string, value: unknown) {
  return typeof value === 'string' && value.length > 0
    ? { [name]: value }
    : {}
}
