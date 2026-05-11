import type {
  AiModelCapability,
  AiModelType,
} from '@haohaoxue/samepage-contracts'

export type {
  AiAnchor,
  AiAvailableModelOption,
  AiAvailableProviderOption,
  AiCandidate,
  AiDefaultModelPolicyItem,
  AiEditorStreamEvent,
  AiEditorWorkflowKey,
  AiModelCapability,
  AiModelIntentKey,
  AiModelRef,
  AiModelType,
  AiProvider,
  AiProviderCredential,
  AiProviderEndpointMode,
  AiProviderModelItem,
  AiProviderModels,
  AiProviderPreset,
  AiProviderScope,
  AiRun,
  AiSession,
  CreateAiEditorSessionRequest,
  CreateAiEditorSessionResponse,
  ResolveAiEditorCandidateResponse,
  UpdateAiDefaultModelPolicyRequest,
} from '@haohaoxue/samepage-contracts'

/**
 * 创建服务商请求。
 */
export interface CreateAiProviderRequest {
  /** 服务商键 */
  providerKey: string
  /** 服务商名称 */
  providerName?: string
  /** API 地址 */
  endpoint?: string
  /** API 密钥 */
  apiKey?: string
}

/**
 * 更新服务商请求。
 */
export interface UpdateAiProviderRequest {
  /** 服务商键 */
  providerKey?: string
  /** 服务商名称 */
  providerName?: string
  /** API 地址 */
  endpoint?: string
  /** API 密钥 */
  apiKey?: string
  /** 清空 API 密钥 */
  clearApiKey?: boolean
  /** 是否启用 */
  enabled?: boolean
}

/**
 * 创建模型项请求。
 */
export interface UpsertAiProviderModelRequest {
  /** 模型 ID */
  modelId: string
  /** 模型名称 */
  modelName: string
  /** 模型类型 */
  modelType?: AiModelType
  /** 模型能力 */
  capabilities?: AiModelCapability[]
  /** 上下文窗口 */
  contextWindow?: number
  /** 最大输出 token */
  maxOutputTokens?: number
  /** 是否启用 */
  enabled?: boolean
}

export interface UpsertAiProviderModelsRequest {
  /** 模型列表 */
  models: UpsertAiProviderModelRequest[]
}
