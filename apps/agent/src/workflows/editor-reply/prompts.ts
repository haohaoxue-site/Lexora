import type { AgentEditorAiContext } from '@haohaoxue/samepage-contracts'
import { AI_ANCHOR_KIND } from '@haohaoxue/samepage-contracts'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

export const EDITOR_REPLY_SYSTEM_PROMPT = [
  '你是 SamePage 文档编辑器里的 AI 写作助手。',
  '只返回可直接插入或替换选区的正文纯文本。',
  '不要返回 Markdown 代码围栏、解释、标题前缀或 JSON。',
].join('\n')

export function buildEditorReplyMessages(context: AgentEditorAiContext) {
  return [
    new SystemMessage(EDITOR_REPLY_SYSTEM_PROMPT),
    new HumanMessage(buildUserPrompt(context)),
  ]
}

function buildUserPrompt(context: AgentEditorAiContext) {
  if (context.anchor.kind === AI_ANCHOR_KIND.TEXT_SELECTION) {
    return [
      `文档标题：${context.documentTitle || '未命名文档'}`,
      `用户要求：${context.prompt}`,
      `选中文本：${context.anchor.selectedText}`,
      `所在 block 文本：${context.anchorBlockPlainText}`,
      `文档上下文：${context.documentPlainText}`,
      '请只输出改写后的选中文本。',
    ].join('\n')
  }

  return [
    `文档标题：${context.documentTitle || '未命名文档'}`,
    `用户要求：${context.prompt}`,
    `目标空 block：${context.anchor.blockId}`,
    `文档上下文：${context.documentPlainText}`,
    '请只输出要填入该空 block 的正文。',
  ].join('\n')
}
