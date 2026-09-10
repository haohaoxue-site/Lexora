import type { LocalChatApi } from '../../shared/localChatApi'
import { ipcRenderer } from 'electron'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function createTaskMarksApi(): Pick<LocalChatApi, 'taskMarks'> {
  return {
    taskMarks: Object.freeze({
      list: () => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.taskMarksList),
      create: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.taskMarksCreate, input),
      update: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.taskMarksUpdate, input),
      delete: id => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.taskMarksDelete, { id }),
      states: conversationIds => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.taskMarksStates, { conversationIds }),
      assign: (conversationId, markId) => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.taskMarksAssign, { conversationId, markId }),
      setRead: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.taskMarksSetRead, input),
      clear: input => ipcRenderer.invoke(LOCAL_CHAT_IPC_CHANNELS.taskMarksClear, input),
    }),
  }
}
