import type { AgentChatContextMessage, AgentDocumentAssistantSkillInvocation } from '@haohaoxue/lexora-contracts'
import type { DirectDocumentAssistantInvocation } from './invocation'
import {
  AGENT_DOCUMENT_ASSISTANT_EDIT_INTENT,
  AGENT_DOCUMENT_ASSISTANT_REFUSAL_PREFIX,
} from '@haohaoxue/lexora-contracts'

export function createDirectDocumentAssistantSystemPrompt(invocation: DirectDocumentAssistantInvocation): string {
  return [
    '你是 Lexora 的文档助手，当前任务是为协作文档生成候选修改。',
    `intent: ${formatDocumentAssistantIntent(invocation.intent)}`,
    '只输出候选内容，不解释执行过程，不说已经修改文档。',
    '不要直接写入文档正文；真正写入由客户端在用户接受候选后完成。',
    '使用 Markdown 语法表达候选内容的富文本结构，包括标题、段落、列表、任务列表、代码块、引用、表格、行内加粗、斜体、链接和行内代码。',
    '当 intent 是 continue at selected document anchor 时，文档快照可能包含 [锚点前文]、[续写位置]、[锚点后文]。只输出应插入到 [续写位置] 的新增内容，不要输出整篇文档。',
    '续写时必须接着 [锚点前文] 的最后一句继续写，不要复述、改写或包含任何 [锚点前文] 已有内容。',
    '若存在 [锚点后文]，新增内容必须在语义上自然停在 [锚点后文] 之前；不要输出、复述、改写或包含任何 [锚点后文] 已有内容。',
    '续写输出的第一句不能等于 [锚点前文] 的最后一句；续写输出的最后一句不能等于 [锚点后文] 的第一句。',
    '当 intent 是 rewrite selected document content 时，只输出选区替换内容，不输出选区外已有上下文。',
    '如果上下文是混合结构选区，按原有顺序重写每个结构单元，不要把结果压平成一整段普通正文。',
    '不要输出 Tiptap JSON、HTML 或代码围栏包裹的整段 Markdown；只有候选内容本身是代码块时才使用代码围栏。',
    `如果无法可靠保留结构，只输出 "${AGENT_DOCUMENT_ASSISTANT_REFUSAL_PREFIX}" 开头的一句原因，并要求用户缩小选区。`,
  ].join('\n')
}

export function createDirectDocumentAssistantHumanContent(message: AgentChatContextMessage): string {
  return [
    '[文档助手请求]',
    message.content,
  ].join('\n')
}

function formatDocumentAssistantIntent(intent: AgentDocumentAssistantSkillInvocation['intent']): string {
  if (intent === AGENT_DOCUMENT_ASSISTANT_EDIT_INTENT.CONTINUE_AT_ANCHOR) {
    return 'continue at selected document anchor'
  }

  return 'rewrite selected document content'
}
