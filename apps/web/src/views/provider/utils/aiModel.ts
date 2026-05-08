import type {
  AiModelCapability,
  AiModelType,
} from '@/apis/ai'
import { AI_MODEL_CAPABILITY, AI_MODEL_TYPE } from '@haohaoxue/samepage-contracts'

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

export function formatModelOptionLabel(providerName: string, modelName: string) {
  return `${providerName} / ${modelName}`
}
