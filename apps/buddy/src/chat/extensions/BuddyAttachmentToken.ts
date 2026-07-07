import { mergeAttributes, Node } from '@tiptap/core'
import {
  BUDDY_ATTACHMENT_TOKEN_NODE_NAME,
  createBuddyAttachmentTokenText,
} from '@/chat/buddyChatInput'

export const BuddyAttachmentToken = Node.create({
  name: BUDDY_ATTACHMENT_TOKEN_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      attachmentId: {
        default: '',
        parseHTML: element => element.getAttribute('data-attachment-id') ?? '',
        renderHTML: attributes => ({ 'data-attachment-id': attributes.attachmentId }),
      },
      index: {
        default: 1,
        parseHTML: element => Number(element.getAttribute('data-index') ?? 1),
        renderHTML: attributes => ({ 'data-index': attributes.index }),
      },
      kind: {
        default: 'image',
        parseHTML: element => element.getAttribute('data-kind'),
        renderHTML: attributes => ({ 'data-kind': attributes.kind }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="buddy-attachment-token"]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        {
          'class': 'buddy-prompt-token-node buddy-attachment-token-node',
          'contenteditable': 'false',
          'data-type': 'buddy-attachment-token',
        },
        HTMLAttributes,
      ),
      createBuddyAttachmentTokenText({
        attachmentId: typeof node.attrs.attachmentId === 'string' ? node.attrs.attachmentId : '',
        index: Number(node.attrs.index),
        kind: node.attrs.kind === 'image' ? 'image' : 'file',
      }),
    ]
  },

  renderText({ node }) {
    return createBuddyAttachmentTokenText({
      attachmentId: typeof node.attrs.attachmentId === 'string' ? node.attrs.attachmentId : '',
      index: Number(node.attrs.index),
      kind: node.attrs.kind === 'image' ? 'image' : 'file',
    })
  },
})
