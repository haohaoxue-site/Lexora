import type {
  CollabErrorCode,
  ConsumeCollabTicketResponse,
} from '@haohaoxue/samepage-contracts'
import { URL } from 'node:url'
import {
  CollabErrorCodeSchema,
  ConsumeCollabTicketRequestSchema,
  ConsumeCollabTicketResponseSchema,
} from '@haohaoxue/samepage-contracts'
import { z } from 'zod'

const ConsumeCollabTicketResponseEnvelopeSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: ConsumeCollabTicketResponseSchema,
}).strict()

export interface CollabTicketClient {
  consumeDocumentCollabTicket: (
    documentId: string,
    token: string,
  ) => Promise<ConsumeCollabTicketResponse>
}

export interface CreateCollabTicketClientInput {
  apiInternalUrl: string
}

export class CollabTicketClientError extends Error {
  constructor(readonly code: CollabErrorCode | null, message: string) {
    super(message)
    this.name = 'CollabTicketClientError'
  }
}

export function createCollabTicketClient(input: CreateCollabTicketClientInput): CollabTicketClient {
  const apiInternalUrl = trimTrailingSlash(input.apiInternalUrl)

  return {
    async consumeDocumentCollabTicket(documentId, token) {
      const response = await fetch(resolveConsumeTicketUrl(apiInternalUrl, documentId), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(ConsumeCollabTicketRequestSchema.parse({
          token,
        })),
      })

      if (!response.ok) {
        const payload = await safeReadJson(response)
        const code = readCollabErrorCode(payload)
        throw new CollabTicketClientError(
          code,
          `consume-collab-ticket-failed:${response.status}:${documentId}:${code ?? 'unknown'}`,
        )
      }

      return ConsumeCollabTicketResponseEnvelopeSchema.parse(await response.json()).data
    },
  }
}

function resolveConsumeTicketUrl(apiInternalUrl: string, documentId: string): string {
  return new URL(
    `internal/documents/${encodeURIComponent(documentId)}/collab-ticket-consumptions`,
    `${apiInternalUrl}/`,
  ).toString()
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  }
  catch {
    return null
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
