import type { AiProvider } from '@/apis/ai'

export const COMPATIBLE_PROVIDER_KEYS = ['openai-compatible', 'anthropic-compatible'] as const

export type CompatibleProviderKey = typeof COMPATIBLE_PROVIDER_KEYS[number]

export type AiProviderConsoleMode = 'system' | 'user'

/**
 * AI 服务商列表行。
 */
export interface AiProviderRow {
  /** 行标识 */
  rowKey: string
  /** 行类型 */
  kind: 'preset' | 'compatible'
  /** 服务商键 */
  providerKey: string
  /** 展示名称 */
  title: string
  /** 已绑定服务商 */
  provider: AiProvider
}
