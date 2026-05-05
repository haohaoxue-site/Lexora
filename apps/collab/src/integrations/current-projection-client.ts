import type { MaterializeDocumentYdocCurrentProjectionRequest, MaterializeDocumentYdocCurrentProjectionResponse } from '@haohaoxue/samepage-contracts'
import type { DocumentYdocCurrentProjectionClient } from '../runtime/ports'
import { URL } from 'node:url'
import { MaterializeDocumentYdocCurrentProjectionResponseSchema } from '@haohaoxue/samepage-contracts'
import { z } from 'zod'

const MaterializeDocumentYdocCurrentProjectionResponseEnvelopeSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: MaterializeDocumentYdocCurrentProjectionResponseSchema,
}).strict()

/** 创建 DocumentYdoc 当前读模型物化客户端的输入。 */
export interface CreateDocumentYdocCurrentProjectionClientInput {
  apiInternalUrl: string
}

export function createDocumentYdocCurrentProjectionClient(
  input: CreateDocumentYdocCurrentProjectionClientInput,
): DocumentYdocCurrentProjectionClient {
  const apiInternalUrl = trimTrailingSlash(input.apiInternalUrl)

  return {
    async materializeDocumentYdocCurrentProjection(
      documentId: string,
      payload: MaterializeDocumentYdocCurrentProjectionRequest,
    ): Promise<MaterializeDocumentYdocCurrentProjectionResponse> {
      const response = await fetch(resolveProjectionUrl(apiInternalUrl, documentId), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`document-ydoc-current-projection-failed:${response.status}:${documentId}`)
      }

      return MaterializeDocumentYdocCurrentProjectionResponseEnvelopeSchema.parse(await response.json()).data
    },
  }
}

function resolveProjectionUrl(apiInternalUrl: string, documentId: string): string {
  return new URL(
    `internal/documents/${encodeURIComponent(documentId)}/ydoc-current-projections`,
    `${apiInternalUrl}/`,
  ).toString()
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
