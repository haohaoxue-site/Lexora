import type {
  CollabErrorCode,
  ConsumeCollabTicketResponse,
  MaterializeDocumentYdocCurrentProjectionRequest,
  MaterializeDocumentYdocCurrentProjectionResponse,
} from '@haohaoxue/lexora-contracts'
import {
  CollabErrorCodeSchema,
  ConsumeCollabTicketRequestSchema,
  ConsumeCollabTicketResponseSchema,
  MaterializeDocumentYdocCurrentProjectionResponseSchema,
} from '@haohaoxue/lexora-contracts'
import { ApiInternalRequestError, normalizeApiInternalBaseUrl, postApiInternalJson } from './utils'

export interface CollabTicketClient {
  consumeDocumentCollabTicket: (
    documentId: string,
    token: string,
  ) => Promise<ConsumeCollabTicketResponse>
}

export interface DocumentYdocCurrentProjectionClient {
  materializeDocumentYdocCurrentProjection: (
    documentId: string,
    payload: MaterializeDocumentYdocCurrentProjectionRequest,
  ) => Promise<MaterializeDocumentYdocCurrentProjectionResponse>
}

export interface CreateCollabTicketClientInput {
  apiInternalUrl: string
  appInternalKey: string
}

export interface CreateDocumentYdocCurrentProjectionClientInput {
  apiInternalUrl: string
  appInternalKey: string
}

export class CollabTicketClientError extends Error {
  constructor(readonly code: CollabErrorCode | null, message: string) {
    super(message)
    this.name = 'CollabTicketClientError'
  }
}

export function createCollabTicketClient(input: CreateCollabTicketClientInput): CollabTicketClient {
  const baseUrl = normalizeApiInternalBaseUrl(input.apiInternalUrl)

  return {
    async consumeDocumentCollabTicket(documentId, token) {
      try {
        return ConsumeCollabTicketResponseSchema.parse(await postApiInternalJson({
          baseUrl,
          path: `internal/documents/${encodeURIComponent(documentId)}/collab-ticket-consumptions`,
          payload: ConsumeCollabTicketRequestSchema.parse({
            token,
          }),
          errorMessage: `consume-collab-ticket-failed:${documentId}`,
          appInternalKey: input.appInternalKey,
        }))
      }
      catch (error) {
        if (error instanceof ApiInternalRequestError) {
          const code = readCollabErrorCode(error.payload)
          throw new CollabTicketClientError(
            code,
            `consume-collab-ticket-failed:${error.status}:${documentId}:${code ?? 'unknown'}`,
          )
        }

        throw error
      }
    },
  }
}

export function createDocumentYdocCurrentProjectionClient(
  input: CreateDocumentYdocCurrentProjectionClientInput,
): DocumentYdocCurrentProjectionClient {
  const baseUrl = normalizeApiInternalBaseUrl(input.apiInternalUrl)

  return {
    async materializeDocumentYdocCurrentProjection(documentId, payload) {
      try {
        return MaterializeDocumentYdocCurrentProjectionResponseSchema.parse(await postApiInternalJson({
          baseUrl,
          path: `internal/documents/${encodeURIComponent(documentId)}/ydoc-current-projections`,
          payload,
          errorMessage: `document-ydoc-current-projection-failed:${documentId}`,
          appInternalKey: input.appInternalKey,
        }))
      }
      catch (error) {
        if (error instanceof ApiInternalRequestError) {
          throw new Error(`document-ydoc-current-projection-failed:${error.status}:${documentId}`)
        }

        throw error
      }
    },
  }
}

function readCollabErrorCode(payload: unknown): CollabErrorCode | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const code = readObjectString(payload, 'code') ?? readObjectString(payload, 'message')
  const parsed = CollabErrorCodeSchema.safeParse(code)

  return parsed.success ? parsed.data : null
}

function readObjectString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object' || !(key in payload)) {
    return null
  }

  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}
