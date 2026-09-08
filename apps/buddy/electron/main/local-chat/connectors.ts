import type { LocalChatIpcContext } from './registrar'
import { connectorsRequestSchemas, connectorsRpc } from '../../../shared/connectors/connectorApi'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function registerConnectorsIpc(context: LocalChatIpcContext): void {
  const { handle, request } = context

  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsList, () => request(connectorsRpc.list, {}))

  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsUpsert, (_event, input) => {
    const update = connectorsRequestSchemas.connectorUpsert.parse(input)
    return request(connectorsRpc.upsert, update)
  })

  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsRemove, (_event, input) => request(connectorsRpc.remove, connectorsRequestSchemas.connectorId.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsTrust, (_event, input) => request(connectorsRpc.trust, connectorsRequestSchemas.connectorId.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsSetCredential, async (_event, input) => {
    const { connectorId, credential } = connectorsRequestSchemas.connectorCredential.parse(input)
    return request(connectorsRpc.saveCredential, { connectorId, credential })
  })

  handle(LOCAL_CHAT_IPC_CHANNELS.connectorsClearCredential, async (_event, input) => {
    const { connectorId } = connectorsRequestSchemas.connectorId.parse(input)
    return request(connectorsRpc.clearCredential, { connectorId })
  })
}
