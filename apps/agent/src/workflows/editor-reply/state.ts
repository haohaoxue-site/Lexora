import type { AgentEditorAiContext, AgentRunModelTarget } from '@haohaoxue/samepage-contracts'
import { Annotation } from '@langchain/langgraph'

export const EditorReplyState = Annotation.Root({
  editorContext: Annotation<AgentEditorAiContext>(),
  responseText: Annotation<string>(),
})

export interface EditorReplyGraphContext {
  modelTarget?: AgentRunModelTarget | null
  onTextDelta?: (text: string) => Promise<void> | void
}
