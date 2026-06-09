import type {
  AiModelCapability,
  AiModelModality,
  AiModelType,
} from '@/apis/ai'
import {
  AI_MODEL_CAPABILITY,
  AI_MODEL_CAPABILITY_VALUES,
  AI_MODEL_MODALITY,
  AI_MODEL_MODALITY_VALUES,
  AI_MODEL_TYPE,
  AI_MODEL_TYPE_VALUES,
} from '@haohaoxue/samepage-contracts/ai/constants'

export const AI_MODEL_TYPE_LABELS: Record<AiModelType, string> = {
  [AI_MODEL_TYPE.CHAT]: '对话生成',
  [AI_MODEL_TYPE.EMBEDDING]: '文本向量',
  [AI_MODEL_TYPE.RERANK]: '排序重排',
  [AI_MODEL_TYPE.IMAGE]: '图像生成',
  [AI_MODEL_TYPE.AUDIO]: '音频处理',
}

export const AI_MODEL_CAPABILITY_LABELS: Record<AiModelCapability, string> = {
  [AI_MODEL_CAPABILITY.STREAMING]: '流式',
  [AI_MODEL_CAPABILITY.TOOL_CALL]: '工具调用',
  [AI_MODEL_CAPABILITY.REASONING]: '推理',
  [AI_MODEL_CAPABILITY.JSON_MODE]: 'JSON 模式',
  [AI_MODEL_CAPABILITY.STRUCTURED_OUTPUT]: '结构化输出',
}

export const AI_MODEL_MODALITY_LABELS: Record<AiModelModality, string> = {
  [AI_MODEL_MODALITY.TEXT]: '文本',
  [AI_MODEL_MODALITY.IMAGE]: '图像',
  [AI_MODEL_MODALITY.AUDIO]: '音频',
  [AI_MODEL_MODALITY.VIDEO]: '视频',
  [AI_MODEL_MODALITY.FILE]: '文件',
  [AI_MODEL_MODALITY.EMBEDDING]: '向量',
}

export const AI_MODEL_TYPE_OPTIONS = AI_MODEL_TYPE_VALUES.map(value => ({
  label: AI_MODEL_TYPE_LABELS[value],
  value,
}))

export const AI_MODEL_MODALITY_OPTIONS = AI_MODEL_MODALITY_VALUES.map(value => ({
  label: AI_MODEL_MODALITY_LABELS[value],
  value,
}))

export const AI_MODEL_CAPABILITY_OPTIONS = AI_MODEL_CAPABILITY_VALUES.map(value => ({
  label: AI_MODEL_CAPABILITY_LABELS[value],
  value,
}))

export function formatModelOptionLabel(providerName: string, modelName: string) {
  return `${providerName} / ${modelName}`
}

export function formatModelLimit(value: number | null | undefined) {
  return value == null ? '-' : value.toLocaleString('en-US')
}
