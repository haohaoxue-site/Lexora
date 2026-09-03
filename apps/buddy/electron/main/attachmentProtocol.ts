import type { BuddyServiceSupervisor } from './runtime/BuddyServiceSupervisor'
import { readFile } from 'node:fs/promises'
import { protocol } from 'electron'
import {
  localChatResponseSchemas,
  localChatSchemas,
} from '../shared/localChatApiSchemas'

const ATTACHMENT_PROTOCOL = 'lexora-attachment'
const ARTIFACT_PROTOCOL = 'lexora-artifact'

export function registerAttachmentSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([ATTACHMENT_PROTOCOL, ARTIFACT_PROTOCOL].map(scheme => ({
    scheme,
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
  })))
}

export function installAttachmentProtocol(runtime: BuddyServiceSupervisor): () => void {
  const installPreviewProtocol = (
    scheme: string,
    idKey: 'artifactId' | 'attachmentId',
    method: 'artifacts.resolvePreview' | 'attachments.resolvePreview',
    schema: typeof localChatSchemas.artifactPreview | typeof localChatSchemas.attachmentPreview,
  ) => protocol.handle(scheme, async (request) => {
    if (request.method !== 'GET')
      return new Response(null, { status: 405 })

    const url = new URL(request.url)
    if (url.hostname !== 'preview')
      return new Response(null, { status: 404 })

    const id = decodeURIComponent(url.pathname.slice(1))
    if (!id || id.includes('/'))
      return new Response(null, { status: 400 })

    try {
      const input = schema.parse({ [idKey]: id })
      const preview = localChatResponseSchemas.artifactPreview.parse(
        await runtime.request(method, input),
      )
      const body = await readFile(preview.path)
      return new Response(body, {
        headers: {
          'cache-control': scheme === ARTIFACT_PROTOCOL
            ? 'private, no-store'
            : 'private, max-age=300',
          'content-type': preview.mimeType,
          'x-content-type-options': 'nosniff',
        },
      })
    }
    catch {
      return new Response(null, { status: 404 })
    }
  })

  void installPreviewProtocol(
    ATTACHMENT_PROTOCOL,
    'attachmentId',
    'attachments.resolvePreview',
    localChatSchemas.attachmentPreview,
  )
  void installPreviewProtocol(
    ARTIFACT_PROTOCOL,
    'artifactId',
    'artifacts.resolvePreview',
    localChatSchemas.artifactPreview,
  )

  return () => {
    protocol.unhandle(ATTACHMENT_PROTOCOL)
    protocol.unhandle(ARTIFACT_PROTOCOL)
  }
}
