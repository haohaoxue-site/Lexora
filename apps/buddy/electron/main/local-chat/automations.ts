import type { LocalChatIpcContext } from './registrar'
import { automationsRequestSchemas, automationsRpc } from '../../../shared/automation/automationApi'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function registerAutomationsIpc(context: LocalChatIpcContext): void {
  const { handle, request } = context

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsPreview, (_event, input) => request(automationsRpc.preview, automationsRequestSchemas.automationPreview.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsList, (_event, input) => request(automationsRpc.list, automationsRequestSchemas.automationList.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsGet, (_event, input) => request(automationsRpc.get, automationsRequestSchemas.automationGet.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsCreate, (_event, input) => request(automationsRpc.create, automationsRequestSchemas.automationCreate.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsUpdate, (_event, input) => request(automationsRpc.update, automationsRequestSchemas.automationUpdate.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsPause, (_event, input) => request(automationsRpc.pause, automationsRequestSchemas.automationPause.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsResume, (_event, input) => request(automationsRpc.resume, automationsRequestSchemas.automationResume.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsDelete, (_event, input) => request(automationsRpc.delete, automationsRequestSchemas.automationDelete.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsDeleteOccurrence, (_event, input) => request(automationsRpc.deleteOccurrence, automationsRequestSchemas.automationDeleteOccurrence.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsRunNow, (_event, input) => request(automationsRpc.runNow, automationsRequestSchemas.automationRunNow.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.automationsListOccurrences, (_event, input) => request(automationsRpc.listOccurrences, automationsRequestSchemas.automationListOccurrences.parse(input)))
}
