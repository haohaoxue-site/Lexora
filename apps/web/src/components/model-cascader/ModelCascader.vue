<script setup lang="ts">
import type {
  CascaderNode,
  CascaderOption,
  CascaderProps,
  CascaderValue,
} from 'element-plus'
import type {
  ModelCascaderEmits,
  ModelCascaderModelRef,
  ModelCascaderOption,
  ModelCascaderProps,
} from './typing'
import type {
  AiAvailableModelOption,
  AiAvailableModelServiceOption,
  AiModelRef,
  AiModelServiceScope,
} from '@/apis/ai'
import { AI_MODEL_SERVICE_SCOPE } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'
import {
  getAvailableAiModelServiceModels,
  getAvailableAiModelServices,
} from '@/apis/ai'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

const componentProps = withDefaults(defineProps<ModelCascaderProps>(), {
  modelValue: null,
  placeholder: '选择模型',
  disabled: false,
  clearable: true,
  filterable: false,
  showAllLevels: true,
})
const emits = defineEmits<ModelCascaderEmits>()
const VALUE_SEPARATOR = ':'
const SCOPE_VALUE_PREFIX = 'scope'
const SERVICE_VALUE_PREFIX = 'service'
const MODEL_VALUE_PREFIX = 'model'

const availableServicesByScope = shallowRef<Partial<Record<AiModelServiceScope, AiAvailableModelServiceOption[]>>>({})
const serviceLoadingPromises = shallowRef<Partial<Record<AiModelServiceScope, Promise<AiAvailableModelServiceOption[]>>>>({})
const availableModelsByConfigId = shallowRef<Record<string, AiAvailableModelOption[]>>({})
const modelLoadingPromises = shallowRef<Record<string, Promise<AiAvailableModelOption[]>>>({})

const cascaderProps: CascaderProps = {
  lazy: true,
  emitPath: true,
  checkStrictly: false,
  lazyLoad: loadNode,
}

const selectedPath = computed<CascaderValue | null>({
  get: () => {
    const modelRef = componentProps.modelValue
      ? resolveModelRef(componentProps.modelValue)
      : null

    return modelRef ? buildModelPath(modelRef) : null
  },
  set: (value) => {
    emits('update:modelValue', parseModelPath(value))
  },
})

watch(() => componentProps.intentKey, () => {
  resetAvailableModels()
  void loadSelectedModelRefOptions()
})

watch(() => componentProps.modelValue, () => {
  void loadSelectedModelRefOptions()
}, { immediate: true })

async function loadNode(
  node: CascaderNode,
  resolve: (dataList?: CascaderOption[]) => void,
  reject: () => void,
) {
  try {
    const nodeValue = getNodeValue(node)

    if (node.level === 0) {
      resolve(buildRootOptions())
      return
    }

    if (node.level === 1) {
      const scope = parseScopeValue(nodeValue)
      resolve(scope ? buildProviderOptions(await ensureAvailableServices(scope)) : [])
      return
    }

    if (node.level === 2) {
      const configId = parseServiceValue(nodeValue)
      resolve(configId ? buildModelOptions(await ensureAvailableModels(configId)) : [])
      return
    }

    resolve([])
  }
  catch (error) {
    reject()
    ElMessage.error(getRequestErrorDisplayMessage(error, '加载模型列表失败'))
  }
}

async function ensureAvailableServices(scope: AiModelServiceScope) {
  const cachedServices = availableServicesByScope.value[scope]

  if (cachedServices) {
    return cachedServices
  }

  const loadingPromise = serviceLoadingPromises.value[scope]

  if (loadingPromise) {
    return loadingPromise
  }

  const promise = getAvailableAiModelServices(componentProps.intentKey, scope)
    .then((services) => {
      availableServicesByScope.value = {
        ...availableServicesByScope.value,
        [scope]: services,
      }
      return services
    })
    .finally(() => {
      const nextPromises = { ...serviceLoadingPromises.value }
      delete nextPromises[scope]
      serviceLoadingPromises.value = nextPromises
    })

  serviceLoadingPromises.value = {
    ...serviceLoadingPromises.value,
    [scope]: promise,
  }

  return promise
}

async function ensureAvailableModels(configId: string) {
  const cachedModels = availableModelsByConfigId.value[configId]

  if (cachedModels) {
    return cachedModels
  }

  const loadingPromise = modelLoadingPromises.value[configId]

  if (loadingPromise) {
    return loadingPromise
  }

  const promise = getAvailableAiModelServiceModels(componentProps.intentKey, configId)
    .then((models) => {
      availableModelsByConfigId.value = {
        ...availableModelsByConfigId.value,
        [configId]: models,
      }
      return models
    })
    .finally(() => {
      const nextPromises = { ...modelLoadingPromises.value }
      delete nextPromises[configId]
      modelLoadingPromises.value = nextPromises
    })

  modelLoadingPromises.value = {
    ...modelLoadingPromises.value,
    [configId]: promise,
  }

  return promise
}

async function loadSelectedModelRefOptions() {
  const modelRef = componentProps.modelValue

  if (!shouldLoadModelRefOptions(modelRef)) {
    return
  }

  try {
    await ensureAvailableModels(modelRef.configId)

    if (!resolveModelRef(modelRef)) {
      emits('update:modelValue', null)
    }
  }
  catch (error) {
    ElMessage.error(getRequestErrorDisplayMessage(error, '加载模型列表失败'))
  }
}

function shouldLoadModelRefOptions(modelRef: ModelCascaderModelRef | null): modelRef is ModelCascaderModelRef {
  return Boolean(modelRef && (!modelRef.scope || !modelRef.providerKey))
}

function resetAvailableModels() {
  availableServicesByScope.value = {}
  serviceLoadingPromises.value = {}
  availableModelsByConfigId.value = {}
  modelLoadingPromises.value = {}
}

function buildRootOptions(): ModelCascaderOption[] {
  return [
    {
      value: buildScopeValue(AI_MODEL_SERVICE_SCOPE.SYSTEM),
      label: '系统',
      leaf: false,
      nodeKind: 'scope',
      scope: AI_MODEL_SERVICE_SCOPE.SYSTEM,
    },
    {
      value: buildScopeValue(AI_MODEL_SERVICE_SCOPE.USER),
      label: '个人',
      leaf: false,
      nodeKind: 'scope',
      scope: AI_MODEL_SERVICE_SCOPE.USER,
    },
  ]
}

function buildProviderOptions(services: AiAvailableModelServiceOption[]) {
  return services.map<ModelCascaderOption>(service => ({
    value: buildServiceValue(service.configId),
    label: service.providerName,
    leaf: false,
    nodeKind: 'provider',
    scope: service.scope,
    configId: service.configId,
    providerKey: service.providerKey,
  }))
}

function buildModelOptions(models: AiAvailableModelOption[]) {
  return models.map<ModelCascaderOption>(item => ({
    value: buildModelValue(item),
    label: item.modelName || item.modelId,
    disabled: !item.selectable,
    leaf: true,
    nodeKind: 'model',
    scope: item.scope,
    configId: item.configId,
    providerKey: item.providerKey,
    modelId: item.modelId,
    unavailableReason: item.unavailableReason,
  }))
}

function buildModelPath(modelRef: AiModelRef) {
  return [
    buildScopeValue(modelRef.scope),
    buildServiceValue(modelRef.configId),
    buildModelValue(modelRef),
  ]
}

function parseModelPath(value: CascaderValue | null | undefined): AiModelRef | null {
  if (!Array.isArray(value)) {
    return null
  }

  const leafValue = value.at(-1)

  if (typeof leafValue !== 'string') {
    return null
  }

  return parseModelValue(leafValue)
}

function resolveModelRef(modelRef: ModelCascaderModelRef): AiModelRef | null {
  if (modelRef.scope && modelRef.providerKey) {
    return {
      configId: modelRef.configId,
      scope: modelRef.scope,
      providerKey: modelRef.providerKey,
      modelId: modelRef.modelId,
    }
  }

  const matchedModel = availableModelsByConfigId.value[modelRef.configId]?.find(item => item.modelId === modelRef.modelId && item.selectable)

  return matchedModel
    ? {
        configId: matchedModel.configId,
        scope: matchedModel.scope,
        providerKey: matchedModel.providerKey,
        modelId: matchedModel.modelId,
      }
    : null
}

function buildScopeValue(scope: AiModelServiceScope) {
  return [SCOPE_VALUE_PREFIX, scope].join(VALUE_SEPARATOR)
}

function parseScopeValue(value: string): AiModelServiceScope | null {
  const parts = parsePrefixedValue(value, SCOPE_VALUE_PREFIX, 1)
  const scope = parts?.[0]

  return isAiModelServiceScope(scope) ? scope : null
}

function buildServiceValue(configId: string) {
  return [SERVICE_VALUE_PREFIX, encodeValuePart(configId)].join(VALUE_SEPARATOR)
}

function parseServiceValue(value: string) {
  return parsePrefixedValue(value, SERVICE_VALUE_PREFIX, 1)?.[0] ?? null
}

function buildModelValue(modelRef: Pick<AiModelRef, 'configId' | 'scope' | 'providerKey' | 'modelId'>) {
  return [
    MODEL_VALUE_PREFIX,
    encodeValuePart(modelRef.configId),
    modelRef.scope,
    encodeValuePart(modelRef.providerKey),
    encodeValuePart(modelRef.modelId),
  ].join(VALUE_SEPARATOR)
}

function parseModelValue(value: string): AiModelRef | null {
  const parts = parsePrefixedValue(value, MODEL_VALUE_PREFIX, 4)

  if (!parts) {
    return null
  }

  const [configId, scope, providerKey, modelId] = parts

  if (!configId || !isAiModelServiceScope(scope) || !providerKey || !modelId) {
    return null
  }

  return {
    configId,
    scope,
    providerKey,
    modelId,
  }
}

function parsePrefixedValue(value: string, prefix: string, size: number) {
  const [actualPrefix, ...rawParts] = value.split(VALUE_SEPARATOR)

  if (actualPrefix !== prefix || rawParts.length !== size) {
    return null
  }

  try {
    return rawParts.map(decodeURIComponent)
  }
  catch {
    return null
  }
}

function encodeValuePart(value: string) {
  return encodeURIComponent(value)
}

function isAiModelServiceScope(value: string | undefined): value is AiModelServiceScope {
  return value === AI_MODEL_SERVICE_SCOPE.SYSTEM || value === AI_MODEL_SERVICE_SCOPE.USER
}

function getNodeValue(node: CascaderNode) {
  const value = node.value ?? node.data.value

  return typeof value === 'string' ? value : ''
}

function getUnavailableReason(data: CascaderOption) {
  return typeof data.unavailableReason === 'string' ? data.unavailableReason : ''
}
</script>

<template>
  <ElCascader
    v-model="selectedPath"
    class="model-cascader"
    :props="cascaderProps"
    :placeholder="componentProps.placeholder"
    :disabled="componentProps.disabled"
    :clearable="componentProps.clearable"
    :filterable="componentProps.filterable"
    :show-all-levels="componentProps.showAllLevels"
  >
    <template #default="{ data }">
      <div class="model-cascader__node">
        <span class="model-cascader__label">{{ data.label }}</span>
        <span v-if="getUnavailableReason(data)" class="model-cascader__reason">
          {{ getUnavailableReason(data) }}
        </span>
      </div>
    </template>
  </ElCascader>
</template>

<style scoped lang="scss">
.model-cascader {
  width: 100%;

  .model-cascader__node {
    display: flex;
    min-width: 0;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .model-cascader__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-cascader__reason {
    flex: none;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
  }
}
</style>
