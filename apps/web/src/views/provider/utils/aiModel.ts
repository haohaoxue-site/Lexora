import type { ProviderModelIntentGroup, ProviderModelIntentOption } from '../typing'
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

const CHAT_ASSISTANT_INTENT_OPTION: ProviderModelIntentOption = {
  key: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
  label: '对话',
  description: '对话使用。',
  parentKey: AI_MODEL_INTENT_KEY.CHAT_DEFAULT,
}

const DOCUMENT_GENERATE_INTENT_OPTION: ProviderModelIntentOption = {
  key: AI_MODEL_INTENT_KEY.DOCUMENT_GENERATE_DEFAULT,
  label: '新内容生成、段落扩写',
  description: '空段落生成、续写和扩写类入口使用。',
  parentKey: AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT,
}

const DOCUMENT_REWRITE_INTENT_OPTION: ProviderModelIntentOption = {
  key: AI_MODEL_INTENT_KEY.DOCUMENT_REWRITE_DEFAULT,
  label: '润色、改写',
  description: '选中文本后的润色、改写和风格调整入口使用。',
  parentKey: AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT,
}

export const AI_MODEL_INTENT_GROUPS: ProviderModelIntentGroup[] = [
  {
    key: AI_MODEL_INTENT_KEY.CHAT_DEFAULT,
    label: '对话默认模型',
    description: '对话类能力兜底',
    children: [CHAT_ASSISTANT_INTENT_OPTION],
  },
  {
    key: AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT,
    label: '文档默认模型',
    description: '文档编辑能力兜底',
    children: [
      DOCUMENT_GENERATE_INTENT_OPTION,
      DOCUMENT_REWRITE_INTENT_OPTION,
    ],
  },
]

export function formatModelOptionLabel(providerName: string, modelName: string) {
  return `${providerName} / ${modelName}`
}
