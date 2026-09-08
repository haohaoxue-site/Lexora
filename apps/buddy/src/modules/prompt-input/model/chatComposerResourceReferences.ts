import type { JSONContent } from '@tiptap/core'
import { CHAT_RESOURCE_REFERENCE_NODE_NAME } from './chatComposerDocument'

export function getChatComposerResourceIds(document: JSONContent | null): string[] {
  const panel: string[] = document?.attrs?.panelResourceIds ?? []
  const inline: string[] = []
  function visit(node: JSONContent) {
    if (node.type === CHAT_RESOURCE_REFERENCE_NODE_NAME)
      inline.push(node.attrs!.resourceId)
    node.content?.forEach(visit)
  }
  if (document)
    visit(document)
  const bodyIds = new Set(inline)
  return [...new Set([...panel.filter(id => !bodyIds.has(id)), ...inline])]
}

export function pruneChatComposerResources(document: JSONContent, rejected: ReadonlySet<string>): JSONContent {
  return {
    ...document,
    ...(document.type === 'doc'
      ? { attrs: {
          ...document.attrs,
          panelResourceIds: (document.attrs?.panelResourceIds ?? []).filter((id: string) => !rejected.has(id)),
        } }
      : {}),
    ...(document.content
      ? { content: document.content
          .filter(node => node.type !== CHAT_RESOURCE_REFERENCE_NODE_NAME || !rejected.has(node.attrs!.resourceId))
          .map(node => pruneChatComposerResources(node, rejected)) }
      : {}),
  }
}
