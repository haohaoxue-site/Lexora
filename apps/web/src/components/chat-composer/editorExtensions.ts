import type { Extensions } from '@tiptap/core'
import type { ChatReferenceCloneResult } from './extensions/ChatReference'
import type { ChatComposerAttachment } from './typing'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { CHAT_REFERENCE_NODE_NAME, ChatReference } from './extensions/ChatReference'

export interface CreateChatComposerExtensionsOptions {
  getAttachments: () => ChatComposerAttachment[]
  cloneInlineAttachment: (attachment: ChatComposerAttachment) => ChatReferenceCloneResult
}

export function createChatComposerExtensions(options: CreateChatComposerExtensionsOptions): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      link: false,
      listItem: false,
      orderedList: false,
      strike: false,
    }),
    Placeholder.configure({
      placeholder: '输入消息，Ctrl/⌘ + Enter 发送',
    }),
    ChatReference.configure({
      getAttachmentById: attachmentId =>
        options.getAttachments().find(attachment => attachment.id === attachmentId) ?? null,
      cloneAttachment: options.cloneInlineAttachment,
    }),
  ]
}

export { CHAT_REFERENCE_NODE_NAME }
