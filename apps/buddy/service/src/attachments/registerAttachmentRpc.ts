import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { AttachmentService } from './AttachmentService'
import { z } from 'zod'
import { buddyAttachmentImportRequestSchema } from '../../../shared/attachmentPolicy'
import { parse } from '../rpc/runtimeRequest'
import { toPublicAttachment } from './publicAttachment'

const emptySchema = z.object({}).strict()
const idSchema = z.string().trim().min(1).max(256)
const sessionIdentitySchema = z.string().regex(/^[A-Z0-9][\w-]{0,127}$/i)

export interface RegisterAttachmentRpcOptions {
  rpc: RuntimeRequestRegistrar
  service: Pick<
    AttachmentService,
    | 'cleanupDrafts'
    | 'registerFiles'
    | 'registerUploads'
    | 'release'
    | 'resolvePreview'
  >
}

export function registerAttachmentRpc(options: RegisterAttachmentRpcOptions): () => void {
  const disposers = [
    options.rpc.onRequest('attachments.registerFiles', async (params) => {
      const input = parse(z.object({
        draftId: sessionIdentitySchema,
        paths: z.array(z.string().min(1)).max(16),
      }).strict(), params)
      return (await options.service.registerFiles(input.draftId, input.paths))
        .map(toPublicAttachment)
    }),
    options.rpc.onRequest('attachments.registerUploads', async (params) => {
      const input = parse(buddyAttachmentImportRequestSchema, params)
      return (await options.service.registerUploads(input.draftId, input.files))
        .map(toPublicAttachment)
    }),
    options.rpc.onRequest('attachments.resolvePreview', (params) => {
      const input = parse(z.object({ attachmentId: idSchema }).strict(), params)
      return options.service.resolvePreview(input.attachmentId)
    }),
    options.rpc.onRequest('attachments.release', async (params) => {
      const input = parse(z.object({
        attachmentIds: z.array(idSchema).max(16),
      }).strict(), params)
      return {
        releasedAttachmentIds: await options.service.release(input.attachmentIds),
      }
    }),
    options.rpc.onRequest('attachments.cleanupDrafts', async (params) => {
      parse(emptySchema, params)
      return {
        releasedAttachmentIds: await options.service.cleanupDrafts(),
      }
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
