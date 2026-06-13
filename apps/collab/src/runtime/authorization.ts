import type { CollabHocuspocusContext } from './ports'
import { COLLAB_ERROR_CODE } from '@haohaoxue/lexora-contracts'

/** 协作连接授权输入。 */
export interface ApplyCollabConnectionAuthorizationInput {
  documentName: string
  context: CollabHocuspocusContext
  connectionConfig: {
    readOnly: boolean
  }
}

export function applyCollabConnectionAuthorization(input: ApplyCollabConnectionAuthorizationInput): void {
  if (input.context.documentId !== input.documentName) {
    throw new Error(COLLAB_ERROR_CODE.DOCUMENT_MISMATCH)
  }

  input.connectionConfig.readOnly = !input.context.canWrite
}
