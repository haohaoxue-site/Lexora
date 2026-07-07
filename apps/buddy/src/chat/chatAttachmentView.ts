import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauriRuntime } from '@/lib/invokeClient'

export type BuddyChatDraftAttachmentKind = 'image' | 'text' | 'binary'

export interface BuddyChatDraftAttachment {
  attachmentId?: string
  dataUrl?: string
  id: string
  kind: BuddyChatDraftAttachmentKind
  mimeType: string
  name: string
  previewPath?: string
  sizeBytes: number
  text?: string
}

export interface BuddyNativeClipboardImageAttachment {
  attachmentId?: string
  dataUrl?: string
  mimeType: string
  name: string
  previewPath?: string
  sizeBytes: number
}

export interface BuddyNativeFileAttachment {
  attachmentId?: string
  dataUrl?: string
  kind: BuddyChatDraftAttachmentKind
  mimeType: string
  name: string
  previewPath?: string
  sizeBytes: number
  text?: string
}

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml']

export async function createBuddyChatDraftAttachment(
  file: File,
): Promise<BuddyChatDraftAttachment> {
  const base = {
    id: createBuddyChatDraftAttachmentId(file.name),
    mimeType: file.type || 'application/octet-stream',
    name: file.name,
    sizeBytes: file.size,
  }

  if (file.type.startsWith('image/')) {
    return {
      ...base,
      dataUrl: await readFileAsDataUrl(file),
      kind: 'image',
    }
  }

  if (isTextFile(file)) {
    return {
      ...base,
      kind: 'text',
      text: await readFileAsText(file),
    }
  }

  return {
    ...base,
    kind: 'binary',
  }
}

export function createBuddyChatDraftAttachmentFromNativeClipboardImage(
  image: BuddyNativeClipboardImageAttachment,
): BuddyChatDraftAttachment {
  return {
    attachmentId: image.attachmentId ?? undefined,
    dataUrl: image.dataUrl ?? undefined,
    id: image.attachmentId ?? createBuddyChatDraftAttachmentId(image.name),
    kind: 'image',
    mimeType: image.mimeType,
    name: image.name,
    previewPath: image.previewPath ?? undefined,
    sizeBytes: image.sizeBytes,
  }
}

export function createBuddyChatDraftAttachmentFromNativeFile(
  file: BuddyNativeFileAttachment,
): BuddyChatDraftAttachment {
  return {
    attachmentId: file.attachmentId ?? undefined,
    dataUrl: file.dataUrl ?? undefined,
    id: file.attachmentId ?? createBuddyChatDraftAttachmentId(file.name),
    kind: file.kind,
    mimeType: file.mimeType,
    name: file.name,
    previewPath: file.previewPath ?? undefined,
    sizeBytes: file.sizeBytes,
    text: file.text ?? undefined,
  }
}

export function resolveBuddyAttachmentPreviewUrl(attachment: {
  dataUrl?: string
  previewPath?: string
}) {
  if (attachment.dataUrl)
    return attachment.dataUrl

  if (!attachment.previewPath || !isTauriRuntime())
    return undefined

  return convertFileSrc(attachment.previewPath)
}

function createBuddyChatDraftAttachmentId(name: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${name}`
}

function isTextFile(file: File) {
  if (TEXT_MIME_PREFIXES.some(prefix => file.type.startsWith(prefix)))
    return true

  return /\.(?:md|mdx|txt|csv|ts|tsx|js|jsx|json|vue|rs|toml|yaml|yml|xml|html|css|scss)$/i
    .test(file.name)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return readFile(file, 'dataUrl')
}

function readFileAsText(file: File): Promise<string> {
  return readFile(file, 'text')
}

function readFile(file: File, mode: 'dataUrl' | 'text'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取附件失败'))

    if (mode === 'dataUrl')
      reader.readAsDataURL(file)
    else
      reader.readAsText(file)
  })
}
