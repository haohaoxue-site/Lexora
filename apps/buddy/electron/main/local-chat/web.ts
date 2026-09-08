import type { LocalChatIpcContext } from './registrar'
import { z } from 'zod'
import { webRpc } from '../../../shared/network/webApi'
import { webCredentialInputSchema, webSettingsSchema } from '../../../shared/network/webProtocol'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function registerWebIpc(context: LocalChatIpcContext): void {
  const { handle, request, options } = context

  handle(LOCAL_CHAT_IPC_CHANNELS.webSettingsRead, () => request(webRpc.settings, {}))

  handle(LOCAL_CHAT_IPC_CHANNELS.webCredentialReveal, async () => z.string().nullable().parse(await options.readWebCredential()))

  handle(LOCAL_CHAT_IPC_CHANNELS.webSettingsSave, (_event, input) => request(webRpc.saveSettings, webSettingsSchema.parse(input)))

  handle(LOCAL_CHAT_IPC_CHANNELS.webCredentialSave, (_event, input) => request(webRpc.saveCredential, webCredentialInputSchema.parse(input)))
}
