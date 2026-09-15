import type { BuddyComposerSourceOption } from '../../../shared/conversation/composerResource'
import type { AttachmentRecord } from '../storage/attachmentRepository'
import type { ConversationRepository } from '../storage/conversationRepository'
import { getBuddyUserContentResourceIds, readBuddyUserMessageContent } from '../../../shared/conversation/buddyUserContent'
import { getChatImageLabels } from '../../../shared/conversation/imageLabels'
import { normalizeAttachmentMetadata } from './AttachmentService'

export function historicalComposerSources(messages: ReturnType<ConversationRepository['listBranchMessages']>, attachments: readonly AttachmentRecord[], conversationId: string, branchId: string): BuddyComposerSourceOption[] {
  const byMessage = new Map<string, AttachmentRecord[]>()
  for (const attachment of attachments) {
    if (attachment.messageId)
      byMessage.set(attachment.messageId, [...(byMessage.get(attachment.messageId) ?? []), attachment])
  }
  return messages.filter(message => message.role === 'user').flatMap((message, index) => {
    const content = readBuddyUserMessageContent(message.content)
    const messageAttachments = byMessage.get(message.id) ?? []
    const snapshots = new Map(content?.resourceSnapshots.map(snapshot => [snapshot.resourceId, snapshot]) ?? [])
    const ordered = content ? getBuddyUserContentResourceIds(content.userContent) : messageAttachments.map(attachment => attachment.id)
    const candidates = ordered.flatMap((id): Array<{ id: string, option: BuddyComposerSourceOption }> => {
      const snapshot = snapshots.get(id)
      const attachment = messageAttachments.find(attachment => attachment.id === (snapshot?.attachmentId ?? id))
      const reference = snapshot?.localReference
      try {
        if (!reference && !attachment)
          return []
        const metadata = reference ?? normalizeAttachmentMetadata(attachment!)
        return [{ id, option: {
          ...metadata,
          category: 'history',
          description: null,
          label: metadata.name,
          nameSource: attachment?.nameSource,
          history: { messageNumber: index + 1, createdAt: message.createdAt },
          path: reference?.path ?? null,
          kind: reference?.kind ?? 'file',
          source: snapshot ? { branchId, conversationId, messageId: message.id, resourceId: id } : { branchId, conversationId, messageId: message.id, attachmentId: attachment!.id },
        } }]
      }
      catch { return [] }
    })
    const labels = getChatImageLabels(candidates.map(({ id, option }) => ({ resourceId: id, kind: option.mimeType.startsWith('image/') ? 'image' : 'file', nameSource: option.nameSource })))
    return candidates.map(({ id, option }) => ({ ...option, label: labels.get(id) ?? option.label }))
  })
}
