import type { ProviderModelIntentOption } from '../typing'
import type {
  AiModelCapability,
  AiModelType,
} from '@/apis/ai'
import { AI_MODEL_CAPABILITY, AI_MODEL_INTENT_KEY, AI_MODEL_TYPE } from '@haohaoxue/samepage-contracts'

export const AI_MODEL_TYPE_LABELS: Record<AiModelType, string> = {
  [AI_MODEL_TYPE.CHAT]: '对话',
  [AI_MODEL_TYPE.EMBEDDING]: '向量',
  [AI_MODEL_TYPE.RERANK]: '重排',
  [AI_MODEL_TYPE.IMAGE]: '图像',
}

export const AI_MODEL_CAPABILITY_LABELS: Record<AiModelCapability, string> = {
  [AI_MODEL_CAPABILITY.STREAMING]: '流式',
  [AI_MODEL_CAPABILITY.VISION]: '视觉',
  [AI_MODEL_CAPABILITY.TOOL_CALL]: '工具调用',
  [AI_MODEL_CAPABILITY.REASONING]: '推理',
  [AI_MODEL_CAPABILITY.JSON_MODE]: 'JSON',
}

export const AI_MODEL_INTENT_OPTIONS: ProviderModelIntentOption[] = [
  {
    key: AI_MODEL_INTENT_KEY.CHAT_DEFAULT,
    label: '对话默认模型',
    description: '聊天助手未显式选择模型时使用。',
  },
  {
    key: AI_MODEL_INTENT_KEY.DOCUMENT_GENERATE_DEFAULT,
    label: '文档生成默认模型',
    description: '新内容生成、段落扩写等写作入口使用。',
  },
  {
    key: AI_MODEL_INTENT_KEY.DOCUMENT_REWRITE_DEFAULT,
    label: '文档改写默认模型',
    description: '润色、改写、风格转换等编辑入口使用。',
  },
]

export function formatModelOptionLabel(providerName: string, modelName: string) {
  return `${providerName} / ${modelName}`
}
