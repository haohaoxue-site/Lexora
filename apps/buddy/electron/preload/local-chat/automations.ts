import type { LocalChatApi } from '../../shared/localChatApi'
import { ipcRenderer } from 'electron'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'
import { subscribe } from '../subscribe'

export function createAutomationsApi(): Pick<LocalChatApi, 'automations'> {
  return {
    automations: Object.freeze({
      create: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsCreate, input),
      delete: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsDelete, input),
      deleteOccurrence: occurrenceId => ipcRenderer.invoke(
        LOCAL_CHAT_IPC_CHANNELS.automationsDeleteOccurrence,
        { occurrenceId },
      ),
      get: automationId => ipcRenderer.invoke(
        LOCAL_CHAT_IPC_CHANNELS.automationsGet,
        { automationId },
      ),
      list: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsList, input ?? {}),
      listOccurrences: input => ipcRenderer.invoke(
        LOCAL_CHAT_IPC_CHANNELS.automationsListOccurrences,
        input ?? {},
      ),
      pause: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsPause, input),
      preview: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsPreview, input),
      resume: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsResume, input),
      runNow: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsRunNow, input),
      update: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.automationsUpdate, input),
      onChanged: listener => subscribe<string>(LOCAL_CHAT_IPC_CHANNELS.automationChanged, listener),
    }),
  }
}
