import {
  DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE,
  DocumentCollabStatelessSaveRequestPayloadSchema,
  DocumentCollabStatelessSaveResultPayloadSchema,
} from '@haohaoxue/samepage-contracts'

export interface HandleDocumentCollabSaveRequestInput {
  payload: string
  connection: {
    readOnly?: boolean
    context?: {
      canWrite?: boolean
    }
    sendStateless: (payload: string) => void
  }
  saveDocument: () => Promise<{
    savedAt: string
  }>
}

export async function handleDocumentCollabSaveRequest(
  input: HandleDocumentCollabSaveRequestInput,
): Promise<boolean> {
  const request = parseSaveRequest(input.payload)
  if (!request) {
    return false
  }

  if (input.connection.readOnly || !input.connection.context?.canWrite) {
    sendSaveResult(input.connection.sendStateless, {
      requestId: request.requestId,
      ok: false,
      savedAt: null,
      error: '当前连接没有写入权限',
    })
    return true
  }

  try {
    const result = await input.saveDocument()
    sendSaveResult(input.connection.sendStateless, {
      requestId: request.requestId,
      ok: true,
      savedAt: result.savedAt,
      error: null,
    })
  }
  catch (error) {
    sendSaveResult(input.connection.sendStateless, {
      requestId: request.requestId,
      ok: false,
      savedAt: null,
      error: error instanceof Error && error.message ? error.message : '保存失败',
    })
  }

  return true
}

function parseSaveRequest(payload: string) {
  try {
    return DocumentCollabStatelessSaveRequestPayloadSchema.parse(JSON.parse(payload))
  }
  catch {
    return null
  }
}

function sendSaveResult(
  sendStateless: (payload: string) => void,
  result: {
    requestId: string
    ok: boolean
    savedAt: string | null
    error: string | null
  },
): void {
  sendStateless(JSON.stringify(DocumentCollabStatelessSaveResultPayloadSchema.parse({
    type: DOCUMENT_COLLAB_STATELESS_MESSAGE_TYPE.SAVE_RESULT,
    ...result,
  })))
}
