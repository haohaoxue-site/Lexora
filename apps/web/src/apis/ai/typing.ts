import type {
  AiModelCapability,
  AiModelType,
} from '@haohaoxue/samepage-contracts'

export type {
  AiAnchor,
  AiAvailableModelOption,
  AiAvailableModelServiceOption,
  AiCandidate,
  AiDefaultModelPolicyItem,
  AiEditorStreamEvent,
  AiEditorWorkflowKey,
  AiModelCapability,
  AiModelEndpointMode,
  AiModelIntentKey,
  AiModelItem,
  AiModelProviderTemplate,
  AiModelRef,
  AiModelServiceConfigSummary,
  AiModelServiceScope,
  AiModelSyncResult,
  AiModelType,
  AiRun,
  AiSession,
  CreateAiEditorSessionRequest,
  CreateAiEditorSessionResponse,
  ResolveAiEditorCandidateResponse,
  UpdateAiDefaultModelPolicyRequest,
} from '@haohaoxue/samepage-contracts'

/**
 * 创建模型服务请求。
 */
export interface CreateAiModelServiceRequest {
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
 * 更新模型服务请求。
 */
export interface UpdateAiModelServiceRequest {
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
export interface CreateAiModelItemRequest {
  /** 模型 ID */
  modelId: string
  /** 模型名称 */
  modelName: string
  /** 模型类型 */
  modelType: AiModelType
  /** 模型能力 */
  capabilities: AiModelCapability[]
  /** 上下文窗口 */
  contextWindow?: number
  /** 最大输出 token */
  maxOutputTokens?: number
}

/**
 * 更新模型项请求。
 */
export interface UpdateAiModelItemRequest {
  /** 模型名称 */
  modelName?: string
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
