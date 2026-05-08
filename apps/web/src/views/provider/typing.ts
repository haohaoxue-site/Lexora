import type { AiModelProviderTemplate, AiModelServiceConfigSummary } from '@/apis/ai'

export const COMPATIBLE_PROVIDER_KEYS = ['openai-compatible', 'anthropic-compatible'] as const

export type CompatibleProviderKey = typeof COMPATIBLE_PROVIDER_KEYS[number]

export type ModelServiceConsoleMode = 'system' | 'user'

/**
 * 模型服务商列表行。
 */
export interface ModelServiceProviderRow {
  /** 行标识 */
  rowKey: string
  /** 行类型 */
  kind: 'template' | 'custom'
  /** 服务商键 */
  providerKey: string
  /** 展示名称 */
  title: string
  /** 服务商模板 */
  template: AiModelProviderTemplate
  /** 已保存的服务配置 */
  service: AiModelServiceConfigSummary | null
}
