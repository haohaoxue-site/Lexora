import type { PreparedMessageAttachments } from '../attachments/AttachmentService'
import type { TurnRequestRecord } from '../storage/turnRequestRepository'

export async function persistPreparedTurn(
  attachments: PreparedMessageAttachments | null,
  persist: () => TurnRequestRecord,
): Promise<TurnRequestRecord> {
  let prepared: TurnRequestRecord
  try {
    prepared = persist()
  }
  catch (error) {
    await attachments?.rollback()
    throw error
  }
  if (prepared.created)
    await attachments?.commit().catch(() => undefined)
  else
    await attachments?.rollback().catch(() => undefined)
  return prepared
}
