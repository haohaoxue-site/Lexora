import type { AgentEditorAiContext, AgentRunModelTarget } from '@haohaoxue/samepage-contracts'
import type { AgentModelStreamPart } from '../../integrations/model-providers/stream-text'
import { Annotation } from '@langchain/langgraph'

export const EditorReplyState = Annotation.Root({
  editorContext: Annotation<AgentEditorAiContext>(),
  responseText: Annotation<string>(),
})

export interface EditorReplyGraphContext {
  modelTarget?: AgentRunModelTarget | null
  onStreamPart?: (part: AgentModelStreamPart) => Promise<void> | void
}
