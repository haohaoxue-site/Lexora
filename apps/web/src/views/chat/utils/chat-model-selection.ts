import type { ChatModelItem, ChatModelSelection, ChatRuntimeConfig } from '@/apis/chat'

export function createModelSelection(modelRef: ChatModelSelection['modelRef'] | null = null): ChatModelSelection {
  return {
    modelRef: modelRef ?? null,
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
  value: Pick<ChatModelItem, 'providerId' | 'modelId'> | null | undefined,
): ChatModelSelection['modelRef'] | null {
  if (!value) {
    return null
  }

  return {
    providerId: value.providerId.trim(),
    modelId: value.modelId.trim(),
  }
}

export function toDraft(value: ChatModelSelection): ChatModelSelection {
  return {
    modelRef: value.modelRef
      ? { ...value.modelRef }
      : null,
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

export function resolveSavedChatModelRef(
  value: ChatModelSelection,
): NonNullable<ChatModelSelection['modelRef']> | null {
  const modelRef = normalizeModelSelection(value).modelRef
  return modelRef ?? null
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
): ChatModelSelection['modelRef'] | null {
  const normalizedModelRef = normalizeNullableModelRef(modelRef)

  if (normalizedModelRef) {
    const matchedModel = findMatchingModelOption(modelOptions, normalizedModelRef)
    if (matchedModel?.selectable) {
      return toModelRef(matchedModel)
    }
  }

  return toModelRef(runtimeDefaultModel)
}
