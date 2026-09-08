import { z } from 'zod'
import { runNativeImage } from '../images/runNativeImage'
import { AttachmentError } from './AttachmentService'

const imageInfoSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
}).strict()

export async function validateResourceBytes(resource: { mimeType: string, sizeBytes: number }, bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength !== resource.sizeBytes)
    throw new AttachmentError('VALIDATION_FAILED')
  try {
    if (!resource.mimeType.startsWith('image/')) {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return
    }
    const result = await runNativeImage(bytes, { operation: 'validate', options: { mimeType: resource.mimeType } })
    const info = imageInfoSchema.parse(JSON.parse(result.toString('utf8')))
    if (info.mimeType !== resource.mimeType)
      throw new AttachmentError('VALIDATION_FAILED')
  }
  catch (error) {
    throw new AttachmentError('VALIDATION_FAILED', { cause: error })
  }
}
