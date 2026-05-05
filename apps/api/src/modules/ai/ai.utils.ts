import type {
  AiAvailableModelOption,
  AiAvailableModelServiceOption,
  AiDefaultModelPolicyItem,
  AiModelAuthMode,
  AiModelCapability,
  AiModelEndpointMode,
  AiModelIntentKey,
  AiModelItem,
  AiModelRef,
  AiModelServiceConfigSummary,
  AiModelServiceScope,
  AiModelType,
} from '@haohaoxue/samepage-contracts'
import type {
  AiModelAuthMode as PrismaAiModelAuthMode,
  AiModelCapability as PrismaAiModelCapability,
  AiModelEndpointMode as PrismaAiModelEndpointMode,
  AiModelItem as PrismaAiModelItem,
  AiModelServiceConfig as PrismaAiModelServiceConfig,
  AiModelServiceScope as PrismaAiModelServiceScope,
  AiModelType as PrismaAiModelType,
} from '@prisma/client'
import {
  AI_MODEL_AUTH_MODE,
  AI_MODEL_CAPABILITY,
  AI_MODEL_ENDPOINT_MODE,
  AI_MODEL_SERVICE_SCOPE,
  AI_MODEL_SERVICE_STATUS,
  AI_MODEL_TYPE,
} from '@haohaoxue/samepage-contracts'

interface ModelCountProjection {
  _count?: {
    models?: number
  }
}

export function toDomainScope(scope: PrismaAiModelServiceScope): AiModelServiceScope {
  return scope === 'SYSTEM' ? AI_MODEL_SERVICE_SCOPE.SYSTEM : AI_MODEL_SERVICE_SCOPE.USER
}

export function toPrismaScope(scope: AiModelServiceScope): PrismaAiModelServiceScope {
  return scope === AI_MODEL_SERVICE_SCOPE.SYSTEM ? 'SYSTEM' : 'USER'
}

export function toDomainEndpointMode(mode: PrismaAiModelEndpointMode): AiModelEndpointMode {
  return mode === 'FIXED' ? AI_MODEL_ENDPOINT_MODE.FIXED : AI_MODEL_ENDPOINT_MODE.CUSTOM
}

export function toPrismaEndpointMode(mode: AiModelEndpointMode): PrismaAiModelEndpointMode {
  return mode === AI_MODEL_ENDPOINT_MODE.FIXED ? 'FIXED' : 'CUSTOM'
}

export function toDomainAuthMode(mode: PrismaAiModelAuthMode): AiModelAuthMode {
  if (mode === 'API_KEY') {
    return AI_MODEL_AUTH_MODE.API_KEY
  }
  if (mode === 'BEARER') {
    return AI_MODEL_AUTH_MODE.BEARER
  }
  return AI_MODEL_AUTH_MODE.NONE
}

export function toPrismaAuthMode(mode: AiModelAuthMode): PrismaAiModelAuthMode {
  if (mode === AI_MODEL_AUTH_MODE.API_KEY) {
    return 'API_KEY'
  }
  if (mode === AI_MODEL_AUTH_MODE.BEARER) {
    return 'BEARER'
  }
  return 'NONE'
}

export function toDomainModelType(type: PrismaAiModelType): AiModelType {
  if (type === 'EMBEDDING') {
    return AI_MODEL_TYPE.EMBEDDING
  }
  if (type === 'RERANK') {
    return AI_MODEL_TYPE.RERANK
  }
  if (type === 'IMAGE') {
    return AI_MODEL_TYPE.IMAGE
  }
  return AI_MODEL_TYPE.CHAT
}

export function toPrismaModelType(type: AiModelType): PrismaAiModelType {
  if (type === AI_MODEL_TYPE.EMBEDDING) {
    return 'EMBEDDING'
  }
  if (type === AI_MODEL_TYPE.RERANK) {
    return 'RERANK'
  }
  if (type === AI_MODEL_TYPE.IMAGE) {
    return 'IMAGE'
  }
  return 'CHAT'
}

export function toDomainCapability(capability: PrismaAiModelCapability): AiModelCapability {
  if (capability === 'VISION') {
    return AI_MODEL_CAPABILITY.VISION
  }
  if (capability === 'TOOL_CALL') {
    return AI_MODEL_CAPABILITY.TOOL_CALL
  }
  if (capability === 'REASONING') {
    return AI_MODEL_CAPABILITY.REASONING
  }
  if (capability === 'JSON_MODE') {
    return AI_MODEL_CAPABILITY.JSON_MODE
  }
  return AI_MODEL_CAPABILITY.STREAMING
}

export function toPrismaCapability(capability: AiModelCapability): PrismaAiModelCapability {
  if (capability === AI_MODEL_CAPABILITY.VISION) {
    return 'VISION'
  }
  if (capability === AI_MODEL_CAPABILITY.TOOL_CALL) {
    return 'TOOL_CALL'
  }
  if (capability === AI_MODEL_CAPABILITY.REASONING) {
    return 'REASONING'
  }
  if (capability === AI_MODEL_CAPABILITY.JSON_MODE) {
    return 'JSON_MODE'
  }
  return 'STREAMING'
}

export function toModelServiceSummary(
  service: PrismaAiModelServiceConfig & ModelCountProjection,
): AiModelServiceConfigSummary {
  const endpointMode = toDomainEndpointMode(service.endpointMode)

  return {
    configId: service.id,
    scope: toDomainScope(service.scope),
    providerKey: service.providerKey,
    providerName: service.providerName,
    adapterKey: service.adapterKey,
    endpointMode,
    endpointEditable: endpointMode === AI_MODEL_ENDPOINT_MODE.CUSTOM,
    endpoint: service.endpoint,
    credentialStatus: service.authMode === 'NONE' || service.apiKeyEncrypted
      ? AI_MODEL_SERVICE_STATUS.CONFIGURED
      : AI_MODEL_SERVICE_STATUS.MISSING,
    enabled: service.enabled,
    modelCount: service._count?.models ?? 0,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  }
}

export function toModelItem(item: PrismaAiModelItem): AiModelItem {
  return {
    modelItemId: item.id,
    configId: item.serviceConfigId,
    modelId: item.modelId,
    modelName: item.modelName,
    modelType: toDomainModelType(item.modelType),
    capabilities: item.capabilities.map(toDomainCapability),
    contextWindow: item.contextWindow,
    maxOutputTokens: item.maxOutputTokens,
    enabled: item.enabled,
    updatedAt: item.updatedAt.toISOString(),
  }
}

export function buildAiModelRef(params: {
  configId: string
  scope: PrismaAiModelServiceScope
  providerKey: string
  modelId: string
}): AiModelRef {
  return {
    configId: params.configId,
    scope: toDomainScope(params.scope),
    providerKey: params.providerKey,
    modelId: params.modelId,
  }
}

export function toDefaultModelPolicyItem(params: {
  intentKey: AiModelIntentKey
  modelRef: AiModelRef | null
  status: AiDefaultModelPolicyItem['status']
  invalidReason: string | null
  updatedAt: Date | null
}): AiDefaultModelPolicyItem {
  return {
    intentKey: params.intentKey,
    modelRef: params.modelRef,
    status: params.status,
    invalidReason: params.invalidReason,
    updatedAt: params.updatedAt?.toISOString() ?? null,
  }
}

export function toAvailableModelOption(params: {
  service: PrismaAiModelServiceConfig
  model: PrismaAiModelItem
  selectable: boolean
  unavailableReason: string | null
}): AiAvailableModelOption {
  return {
    configId: params.service.id,
    scope: toDomainScope(params.service.scope),
    providerKey: params.service.providerKey,
    providerName: params.service.providerName,
    modelId: params.model.modelId,
    modelName: params.model.modelName,
    modelType: toDomainModelType(params.model.modelType),
    capabilities: params.model.capabilities.map(toDomainCapability),
    selectable: params.selectable,
    unavailableReason: params.unavailableReason,
  }
}

export function toAvailableModelServiceOption(
  service: PrismaAiModelServiceConfig,
): AiAvailableModelServiceOption {
  return {
    configId: service.id,
    scope: toDomainScope(service.scope),
    providerKey: service.providerKey,
    providerName: service.providerName,
  }
}
