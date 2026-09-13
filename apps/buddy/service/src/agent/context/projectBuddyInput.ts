import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { InputModel } from '../../providers/modelCapabilities'
import type { BuddyInputReferenceV1 } from './BuddyInputReference'
import { supportsModelFileInput } from '../../providers/modelCapabilities'
import { base64BytesLength } from '../../providers/modelInputBudget'

export function projectMessageImages(message: AgentSession['messages'][number], model: InputModel): AgentSession['messages'][number] {
  if (model.input.includes('image') || (message.role !== 'user' && message.role !== 'toolResult') || !Array.isArray(message.content))
    return message
  return {
    ...message,
    content: message.content.map(block => block.type === 'image'
      ? { type: 'text' as const, text: '[Image content is not supplied to the current model. Use available file paths for file operations; do not claim to have seen this image.]' }
      : block),
  }
}

export function projectBuddyInput(
  reference: BuddyInputReferenceV1,
  model: InputModel,
  sizes: ReadonlyMap<string, number>,
  remainingBytes = Number.POSITIVE_INFINITY,
): { input: BuddyInputReferenceV1, bytes: number } {
  let bytes = 0
  const fits = (id: string) => {
    const size = base64BytesLength(sizes.get(id) ?? 0) + 512
    if (bytes + size > remainingBytes)
      return false
    bytes += size
    return true
  }
  const images = reference.images.filter(file => model.input.includes('image') && fits(file.attachmentId))
  const documents = reference.documents?.filter(file => supportsModelFileInput(model, file.mimeType) && fits(file.attachmentId))
  return {
    bytes,
    input: {
      ...reference,
      attachmentIds: reference.attachmentIds ?? [...reference.images, ...reference.documents ?? []].map(file => file.attachmentId),
      images,
      documents,
    },
  }
}
