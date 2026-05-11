import type {
  AiAvailableModelOption,
  AiAvailableProviderOption,
  AiDefaultModelPolicyItem,
  AiModelCapability,
  AiModelIntentKey,
  AiModelRef,
  AiModelType,
  AiProvider,
  AiProviderAuthMode,
  AiProviderEndpointMode,
  AiProviderModelItem,
  AiProviderScope,
  AiProviderSource,
} from '@haohaoxue/samepage-contracts'
import type {
  AiModelCapability as PrismaAiModelCapability,
  AiModelType as PrismaAiModelType,
  AiProvider as PrismaAiProvider,
  AiProviderAuthMode as PrismaAiProviderAuthMode,
  AiProviderEndpointMode as PrismaAiProviderEndpointMode,
  AiProviderModel as PrismaAiProviderModel,
  AiProviderScope as PrismaAiProviderScope,
  AiProviderSource as PrismaAiProviderSource,
} from '@prisma/client'
import {
  AI_MODEL_CAPABILITY,
  AI_MODEL_TYPE,
  AI_PROVIDER_AUTH_MODE,
  AI_PROVIDER_CREDENTIAL_STATUS,
  AI_PROVIDER_ENDPOINT_MODE,
  AI_PROVIDER_SCOPE,
  AI_PROVIDER_SOURCE,
} from '@haohaoxue/samepage-contracts'

interface ModelCountProjection {
  _count?: {
    models?: number
  }
}

export function toDomainScope(scope: PrismaAiProviderScope): AiProviderScope {
  return scope === 'SYSTEM' ? AI_PROVIDER_SCOPE.SYSTEM : AI_PROVIDER_SCOPE.USER
}

export function toPrismaScope(scope: AiProviderScope): PrismaAiProviderScope {
  return scope === AI_PROVIDER_SCOPE.SYSTEM ? 'SYSTEM' : 'USER'
}

export function toDomainProviderSource(source: PrismaAiProviderSource): AiProviderSource {
  return source === 'PRESET' ? AI_PROVIDER_SOURCE.PRESET : AI_PROVIDER_SOURCE.COMPATIBLE
}

export function toPrismaProviderSource(source: AiProviderSource): PrismaAiProviderSource {
  return source === AI_PROVIDER_SOURCE.PRESET ? 'PRESET' : 'COMPATIBLE'
}

export function toDomainEndpointMode(mode: PrismaAiProviderEndpointMode): AiProviderEndpointMode {
  return mode === 'FIXED' ? AI_PROVIDER_ENDPOINT_MODE.FIXED : AI_PROVIDER_ENDPOINT_MODE.CUSTOM
}

export function toPrismaEndpointMode(mode: AiProviderEndpointMode): PrismaAiProviderEndpointMode {
  return mode === AI_PROVIDER_ENDPOINT_MODE.FIXED ? 'FIXED' : 'CUSTOM'
}

export function toDomainAuthMode(mode: PrismaAiProviderAuthMode): AiProviderAuthMode {
  if (mode === 'API_KEY') {
    return AI_PROVIDER_AUTH_MODE.API_KEY
  }
  if (mode === 'BEARER') {
    return AI_PROVIDER_AUTH_MODE.BEARER
  }
  return AI_PROVIDER_AUTH_MODE.NONE
}

export function toPrismaAuthMode(mode: AiProviderAuthMode): PrismaAiProviderAuthMode {
  if (mode === AI_PROVIDER_AUTH_MODE.API_KEY) {
    return 'API_KEY'
  }
  if (mode === AI_PROVIDER_AUTH_MODE.BEARER) {
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

export function toProvider(
  provider: PrismaAiProvider & ModelCountProjection,
): AiProvider {
  const endpointMode = toDomainEndpointMode(provider.endpointMode)
  const source = toDomainProviderSource(provider.source)

  return {
    providerId: provider.id,
    scope: toDomainScope(provider.scope),
    source,
    providerKey: provider.providerKey,
    providerName: provider.providerName,
    adapterKey: provider.adapterKey,
    endpointMode,
    authMode: toDomainAuthMode(provider.authMode),
    endpointEditable: source === AI_PROVIDER_SOURCE.COMPATIBLE && endpointMode === AI_PROVIDER_ENDPOINT_MODE.CUSTOM,
    nameEditable: source === AI_PROVIDER_SOURCE.COMPATIBLE,
    deletable: source === AI_PROVIDER_SOURCE.COMPATIBLE,
    endpoint: provider.endpoint,
    credentialStatus: provider.authMode === 'NONE' || provider.apiKeyEncrypted
      ? AI_PROVIDER_CREDENTIAL_STATUS.CONFIGURED
      : AI_PROVIDER_CREDENTIAL_STATUS.MISSING,
    enabled: provider.enabled,
    modelCount: provider._count?.models ?? 0,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  }
}

export function toProviderModelItem(item: PrismaAiProviderModel): AiProviderModelItem {
  return {
    providerId: item.providerId,
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
  providerId: string
  scope: PrismaAiProviderScope
  providerKey: string
  modelId: string
}): AiModelRef {
  return {
    providerId: params.providerId,
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
  provider: PrismaAiProvider
  model: PrismaAiProviderModel
  selectable: boolean
  unavailableReason: string | null
}): AiAvailableModelOption {
  return {
    providerId: params.provider.id,
    scope: toDomainScope(params.provider.scope),
    providerKey: params.provider.providerKey,
    providerName: params.provider.providerName,
    modelId: params.model.modelId,
    modelName: params.model.modelName,
    modelType: toDomainModelType(params.model.modelType),
    capabilities: params.model.capabilities.map(toDomainCapability),
    selectable: params.selectable,
    unavailableReason: params.unavailableReason,
  }
}

export function toAvailableProviderOption(
  provider: PrismaAiProvider,
): AiAvailableProviderOption {
  return {
    providerId: provider.id,
    scope: toDomainScope(provider.scope),
    providerKey: provider.providerKey,
    providerName: provider.providerName,
  }
}
