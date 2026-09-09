import type { UserMessage } from '@earendil-works/pi-ai'
import type { AttachmentImageReference } from '../../attachments/AttachmentImageReference'
import { z } from 'zod'

const buddyInputImageReferenceSchema = z.object({
  attachmentId: z.string().min(1).max(256),
  mimeType: z.string().startsWith('image/').max(128),
}).strict()

const buddyInputReferenceSchema = z.object({
  images: z.array(buddyInputImageReferenceSchema).max(16),
  messageId: z.string().min(1).max(256),
  prompt: z.string().max(4 * 1024 * 1024),
  version: z.literal(1),
}).strict()

export interface BuddyInputReferenceV1 {
  images: AttachmentImageReference[]
  messageId: string
  prompt: string
  version: 1
}

export interface BuddyInputReferenceMessage extends UserMessage {
  buddyInput: BuddyInputReferenceV1
}

export interface BuddyInputReferenceStore {
  pending: BuddyInputReferenceV1 | null
}

export class BuddyInputReferenceError extends Error {
  readonly code: 'INPUT_REFERENCE_INVALID' | 'INPUT_REFERENCE_MISMATCH'

  constructor(code: BuddyInputReferenceError['code']) {
    super('Lexora Buddy input reference is invalid')
    this.name = 'BuddyInputReferenceError'
    this.code = code
  }
}

export function createBuddyInputReference(input: Omit<BuddyInputReferenceV1, 'version'>): BuddyInputReferenceV1 {
  return buddyInputReferenceSchema.parse({ ...input, version: 1 })
}

export function createBuddyInputPlaceholderContent(
  input: BuddyInputReferenceV1,
): UserMessage['content'] {
  return [
    { text: input.prompt, type: 'text' },
    ...input.images.map(image => ({
      data: '',
      mimeType: image.mimeType,
      type: 'image' as const,
    })),
  ]
}

export function createBuddyInputReferenceMessage(
  input: BuddyInputReferenceV1,
  timestamp: number,
): BuddyInputReferenceMessage {
  return {
    buddyInput: input,
    content: createBuddyInputPlaceholderContent(input),
    role: 'user',
    timestamp,
  }
}

export function readBuddyInputReference(message: unknown): BuddyInputReferenceV1 | null {
  if (!message || typeof message !== 'object' || Array.isArray(message))
    return null
  const record = message as Record<string, unknown>
  if (record.role !== 'user' || !('buddyInput' in record))
    return null
  const result = buddyInputReferenceSchema.safeParse(record.buddyInput)
  if (!result.success)
    throw new BuddyInputReferenceError('INPUT_REFERENCE_INVALID')
  return result.data
}

export function matchesBuddyInputPlaceholder(
  content: UserMessage['content'],
  input: BuddyInputReferenceV1,
): boolean {
  if (!Array.isArray(content) || content.length !== input.images.length + 1)
    return false
  const [text, ...images] = content
  return text?.type === 'text'
    && text.text === input.prompt
    && images.every((image, index) => (
      image.type === 'image'
      && image.data === ''
      && image.mimeType === input.images[index]?.mimeType
    ))
}
