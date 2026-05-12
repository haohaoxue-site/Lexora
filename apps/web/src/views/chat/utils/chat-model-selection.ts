import type { AiModelRef } from '@/apis/ai'
import type { ChatModelItem, ChatModelSelection, ChatRuntimeConfig } from '@/apis/chat'

export interface ChatModelSettingsDraft {
  modelRef: AiModelRef | null
}

export function createModelSettingsDraft(modelRef: AiModelRef | null = null): ChatModelSettingsDraft {
  return {
    modelRef: modelRef ? { ...modelRef } : null,
  }
}

export function normalizeModelSelection(value: ChatModelSelection): ChatModelSelection {
  return {
    modelRef: value.modelRef
      ? {
          providerId: value.modelRef.providerId.trim(),
          modelId: value.modelRef.modelId.trim(),
        }
      : null,
  }
}

export function normalizeNullableModelRef(
  value: ChatModelSelection['modelRef'] | null | undefined,
): ChatModelSelection['modelRef'] | null {
  if (!value) {
    return null
  }

  return normalizeModelSelection({ modelRef: value }).modelRef ?? null
}

export function toModelRef(
  value: Pick<AiModelRef, 'providerId' | 'modelId'> | null | undefined,
): ChatModelSelection['modelRef'] | null {
  if (!value) {
    return null
  }

  return {
    providerId: value.providerId.trim(),
    modelId: value.modelId.trim(),
  }
}

export function isSameNullableModelRef(
  left: Pick<AiModelRef, 'providerId' | 'modelId'> | null | undefined,
  right: Pick<AiModelRef, 'providerId' | 'modelId'> | null | undefined,
) {
  const leftModelRef = toModelRef(left)
  const rightModelRef = toModelRef(right)

  if (!leftModelRef || !rightModelRef) {
    return !leftModelRef && !rightModelRef
  }

  return isSameModelRef(leftModelRef, rightModelRef)
}

export function toFullModelRef(
  value: Pick<AiModelRef, 'providerId' | 'scope' | 'providerKey' | 'modelId'> | null | undefined,
): AiModelRef | null {
  if (!value) {
    return null
  }

  return {
    providerId: value.providerId.trim(),
    scope: value.scope,
    providerKey: value.providerKey.trim(),
    modelId: value.modelId.trim(),
  }
}

export function createEmptyRuntimeConfig(): ChatRuntimeConfig {
  return {
    enabled: false,
    ready: false,
    defaultModel: null,
    notReadyReason: null,
  }
}

export function findMatchingModelOption(
  modelOptions: ChatModelItem[],
  modelRef: NonNullable<ChatModelSelection['modelRef']>,
): ChatModelItem | null {
  return modelOptions.find(model => model.providerId === modelRef.providerId && model.modelId === modelRef.modelId) ?? null
}

export function resolveSavedChatModelOverrideRef(
  value: ChatModelSettingsDraft,
  runtimeDefaultModel: ChatModelItem | null,
): NonNullable<ChatModelSelection['modelRef']> | null {
  const modelRef = toModelRef(value.modelRef)
  if (!modelRef) {
    return null
  }

  const defaultModelRef = toModelRef(runtimeDefaultModel)
  if (defaultModelRef && isSameModelRef(modelRef, defaultModelRef)) {
    return null
  }

  return modelRef
}

export function resolveSelectedChatModel(
  modelRef: ChatModelSelection['modelRef'] | null | undefined,
  modelOptions: ChatModelItem[],
  runtimeDefaultModel: ChatModelItem | null,
): ChatModelItem | null {
  const normalizedModelRef = normalizeNullableModelRef(modelRef)

  if (normalizedModelRef) {
    const matchedModel = findMatchingModelOption(modelOptions, normalizedModelRef)
    if (matchedModel?.selectable) {
      return matchedModel
    }

    if (
      runtimeDefaultModel
      && runtimeDefaultModel.providerId === normalizedModelRef.providerId
      && runtimeDefaultModel.modelId === normalizedModelRef.modelId
    ) {
      return runtimeDefaultModel
    }

    return null
  }

  return runtimeDefaultModel ?? null
}

export function resolveChatRequestModelRef(
  modelRef: ChatModelSelection['modelRef'] | null | undefined,
  _modelOptions: ChatModelItem[],
  runtimeDefaultModel: ChatModelItem | null,
): ChatModelSelection['modelRef'] | null {
  const normalizedModelRef = normalizeNullableModelRef(modelRef)

  if (normalizedModelRef) {
    return normalizedModelRef
  }

  return toModelRef(runtimeDefaultModel)
}

export function resolveLoadedChatModelRef(
  modelRef: ChatModelSelection['modelRef'] | null | undefined,
  modelOptions: ChatModelItem[],
  runtimeDefaultModel: ChatModelItem | null,
): AiModelRef | null {
  const normalizedModelRef = normalizeNullableModelRef(modelRef)

  if (normalizedModelRef) {
    const matchedModel = findMatchingModelOption(modelOptions, normalizedModelRef)
    if (matchedModel?.selectable) {
      return toFullModelRef(matchedModel)
    }

    if (runtimeDefaultModel && isSameModelRef(normalizedModelRef, runtimeDefaultModel)) {
      return toFullModelRef(runtimeDefaultModel)
    }

    return null
  }

  return toFullModelRef(runtimeDefaultModel)
}

function isSameModelRef(
  left: Pick<AiModelRef, 'providerId' | 'modelId'>,
  right: Pick<AiModelRef, 'providerId' | 'modelId'>,
) {
  return left.providerId === right.providerId && left.modelId === right.modelId
}
