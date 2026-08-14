import type { BuddyServiceSupervisor } from './runtime/BuddyServiceSupervisor'
import { readFile } from 'node:fs/promises'
import { protocol } from 'electron'
import {
  localChatResponseSchemas,
  localChatSchemas,
} from '../shared/localChatApiSchemas'

const ATTACHMENT_PROTOCOL = 'lexora-attachment'

export function registerAttachmentSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: ATTACHMENT_PROTOCOL,
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
  }])
}

export function installAttachmentProtocol(runtime: BuddyServiceSupervisor): () => void {
  protocol.handle(ATTACHMENT_PROTOCOL, async (request) => {
    if (request.method !== 'GET')
      return new Response(null, { status: 405 })

    const url = new URL(request.url)
    if (url.hostname !== 'preview')
      return new Response(null, { status: 404 })

    const attachmentId = decodeURIComponent(url.pathname.slice(1))
    if (!attachmentId || attachmentId.includes('/'))
      return new Response(null, { status: 400 })

    try {
      const input = localChatSchemas.attachmentPreview.parse({ attachmentId })
      const preview = localChatResponseSchemas.attachmentPreview.parse(
        await runtime.request('attachments.resolvePreview', input),
      )
      const body = await readFile(preview.path)
      return new Response(body, {
        headers: {
          'cache-control': 'private, max-age=300',
          'content-type': preview.mimeType,
          'x-content-type-options': 'nosniff',
        },
      })
    }
    catch {
      return new Response(null, { status: 404 })
    }
  })

  return () => {
    protocol.unhandle(ATTACHMENT_PROTOCOL)
  }
}
