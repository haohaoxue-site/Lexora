import type { LocalChatIpcContext } from './registrar'
import { taskMarksRpc } from '../../../shared/conversation/taskMarkApi'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function registerTaskMarksIpc({ handle, request }: LocalChatIpcContext): void {
  handle(LOCAL_CHAT_IPC_CHANNELS.taskMarksList, () => request(taskMarksRpc.list, {}))
  handle(LOCAL_CHAT_IPC_CHANNELS.taskMarksCreate, (_event, input) => request(taskMarksRpc.create, taskMarksRpc.create.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.taskMarksUpdate, (_event, input) => request(taskMarksRpc.update, taskMarksRpc.update.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.taskMarksDelete, (_event, input) => request(taskMarksRpc.delete, taskMarksRpc.delete.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.taskMarksStates, (_event, input) => request(taskMarksRpc.states, taskMarksRpc.states.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.taskMarksAssign, (_event, input) => request(taskMarksRpc.assign, taskMarksRpc.assign.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.taskMarksSetRead, (_event, input) => request(taskMarksRpc.setRead, taskMarksRpc.setRead.input.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.taskMarksClear, (_event, input) => request(taskMarksRpc.clear, taskMarksRpc.clear.input.parse(input)))
}
