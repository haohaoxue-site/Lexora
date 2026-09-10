import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { TaskMarkRepository } from '../storage/taskMarkRepository'
import { taskMarksRpc } from '../../../shared/conversation/taskMarkApi'
import { registerRuntimeRequest } from '../rpc/runtimeRequest'

export function registerTaskMarkRpc(rpc: RuntimeRequestRegistrar, repository: TaskMarkRepository): () => void {
  const disposers = [
    registerRuntimeRequest(rpc, taskMarksRpc.list, () => repository.list()),
    registerRuntimeRequest(rpc, taskMarksRpc.create, input => repository.create(input)),
    registerRuntimeRequest(rpc, taskMarksRpc.update, input => repository.update(input.id, input)),
    registerRuntimeRequest(rpc, taskMarksRpc.delete, input => repository.delete(input.id)),
    registerRuntimeRequest(rpc, taskMarksRpc.states, input => repository.states(input.conversationIds)),
    registerRuntimeRequest(rpc, taskMarksRpc.assign, input => repository.assign(input.conversationId, input.markId)),
    registerRuntimeRequest(rpc, taskMarksRpc.setRead, input => repository.setRead(input)),
    registerRuntimeRequest(rpc, taskMarksRpc.clear, input => repository.clear(input)),
  ]
  return () => disposers.forEach(dispose => dispose())
}
