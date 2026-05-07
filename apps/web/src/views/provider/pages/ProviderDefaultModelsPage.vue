<script setup lang="ts">
import type { ProviderModelIntentGroup, ProviderModelIntentOption } from '../typing'
import type { AiDefaultModelPolicyItem, AiModelIntentKey, AiModelRef } from '@/apis/ai'
import { AI_DEFAULT_MODEL_STATUS } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import {
  getAiDefaultModels,
  updateAiDefaultModel,
} from '@/apis/ai'
import { ModelCascader } from '@/components/model-cascader'
import {
  buildAiDefaultModelPolicyRecord,
  resolveEffectiveAiDefaultModelPolicy,
} from '@/utils/ai-default-model'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { AI_MODEL_INTENT_GROUPS } from '../utils/aiModel'

const policies = shallowRef<AiDefaultModelPolicyItem[]>([])
const isLoading = shallowRef(false)
const savingIntentKey = shallowRef<AiModelIntentKey | null>(null)
const selections = reactive<Record<string, AiModelRef | null>>({})

const policyByIntent = computed(() => buildAiDefaultModelPolicyRecord(policies.value))
const selectableIntentOptions = computed(() => AI_MODEL_INTENT_GROUPS.flatMap(group => [group, ...group.children]))

onMounted(() => {
  void loadPage()
})

async function loadPage() {
  isLoading.value = true

  try {
    const nextPolicies = await getAiDefaultModels()
    policies.value = nextPolicies
    syncSelections()
  }
  catch (error) {
    ElMessage.error(getRequestErrorDisplayMessage(error, '加载默认模型配置失败'))
  }
  finally {
    isLoading.value = false
  }
}

async function handleIntentModelChange(item: Pick<ProviderModelIntentOption, 'key'>, modelRef: AiModelRef | null) {
  selections[item.key] = modelRef ? { ...modelRef } : null

  if (!modelRef && !hasStoredPolicy(item.key)) {
    return
  }

  savingIntentKey.value = item.key

  try {
    const nextPolicy = await updateAiDefaultModel(item.key, {
      modelRef: modelRef
        ? {
            configId: modelRef.configId,
            modelId: modelRef.modelId,
          }
        : null,
    })
    updatePolicy(nextPolicy)
    selections[item.key] = nextPolicy.modelRef ? { ...nextPolicy.modelRef } : null
    ElMessage.success(modelRef ? '默认模型已更新' : '默认模型已清空')
  }
  catch (error) {
    syncSelections()
    ElMessage.error(getRequestErrorDisplayMessage(error, '更新默认模型失败'))
  }
  finally {
    savingIntentKey.value = null
  }
}

function syncSelections() {
  for (const item of selectableIntentOptions.value) {
    const policy = policyByIntent.value[item.key]
    selections[item.key] = policy?.modelRef ? { ...policy.modelRef } : null
  }
}

function updatePolicy(nextPolicy: AiDefaultModelPolicyItem) {
  policies.value = [
    ...policies.value.filter(policy => policy.intentKey !== nextPolicy.intentKey),
    nextPolicy,
  ]
}

function hasStoredPolicy(intentKey: AiModelIntentKey) {
  const policy = policyByIntent.value[intentKey]
  return Boolean(policy && policy.status !== AI_DEFAULT_MODEL_STATUS.NOT_CONFIGURED)
}

function getPolicyInvalidReason(item: Pick<ProviderModelIntentOption, 'key'>) {
  const ownPolicy = policyByIntent.value[item.key]
  const effectivePolicy = resolveEffectiveAiDefaultModelPolicy(policyByIntent.value, item.key)

  if (ownPolicy?.invalidReason) {
    return ownPolicy.invalidReason
  }

  return effectivePolicy.inherited ? effectivePolicy.invalidReason : null
}

function getGroupChildren(group: ProviderModelIntentGroup) {
  return group.children
}

function getOverrideHint(group: ProviderModelIntentGroup) {
  return `可覆盖${group.label}`
}
</script>

<template>
  <div v-loading="isLoading" class="provider-default-models-page">
    <div class="provider-default-models-page__groups">
      <section
        v-for="group in AI_MODEL_INTENT_GROUPS"
        :key="group.key"
        class="provider-default-models-page__group"
      >
        <div class="provider-default-models-page__group-header">
          <div class="provider-default-models-page__group-title-line">
            <h2 class="m-0 text-lg font-bold text-main">
              {{ group.label }}
            </h2>
            <span class="provider-default-models-page__group-hint">
              {{ group.description }}
            </span>
          </div>

          <div class="provider-default-models-page__default-row">
            <span class="provider-default-models-page__default-label">默认模型</span>
            <ModelCascader
              :model-value="selections[group.key]"
              :intent-key="group.key"
              :disabled="savingIntentKey === group.key"
              class="provider-default-models-page__model-cascader w-full"
              placeholder="选择默认模型"
              @update:model-value="value => handleIntentModelChange(group, value)"
            />
          </div>

          <p v-if="getPolicyInvalidReason(group)" class="provider-default-models-page__group-error">
            {{ getPolicyInvalidReason(group) }}
          </p>
        </div>

        <div class="provider-default-models-page__rows">
          <section
            v-for="item in getGroupChildren(group)"
            :key="item.key"
            class="provider-default-models-page__row"
          >
            <div class="provider-default-models-page__row-title-line">
              <h3 class="m-0 text-sm font-semibold text-main">
                {{ item.label }}
              </h3>
              <span class="provider-default-models-page__row-hint">
                {{ getOverrideHint(group) }}
              </span>
            </div>

            <ModelCascader
              :model-value="selections[item.key]"
              :intent-key="item.key"
              :disabled="savingIntentKey === item.key"
              class="provider-default-models-page__model-cascader w-full"
              placeholder="选择模型"
              @update:model-value="value => handleIntentModelChange(item, value)"
            />

            <p v-if="getPolicyInvalidReason(item)" class="m-0 text-xs text-warning">
              {{ getPolicyInvalidReason(item) }}
            </p>
          </section>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.provider-default-models-page {
  padding: 1.5rem 2rem 3rem;
  .provider-default-models-page__groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 1.125rem;
  }

  .provider-default-models-page__group {
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 84%, transparent);
    border-radius: 0.625rem;
    background: var(--brand-bg-surface);
    box-shadow: 0 0.75rem 2rem rgba(31, 35, 41, 0.045);
  }

  .provider-default-models-page__group-header {
    padding: 1.375rem 1.5rem 1.25rem;
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 84%, transparent);
    background: color-mix(in srgb, var(--brand-bg-surface-raised) 82%, var(--brand-bg-surface));
  }

  .provider-default-models-page__group-title-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    gap: 1rem;
    margin-bottom: 1.125rem;
  }

  .provider-default-models-page__group-hint {
    flex: none;
    color: var(--brand-text-regular);
    font-size: 0.8125rem;
    line-height: 1.25rem;
  }

  .provider-default-models-page__default-row {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: 1.125rem;
    align-items: center;
  }

  .provider-default-models-page__default-label {
    color: var(--brand-text-regular);
    font-size: 0.8125rem;
    font-weight: 650;
    line-height: 1.25rem;
  }

  .provider-default-models-page__group-error {
    color: var(--brand-warning);
    font-size: 0.75rem;
    line-height: 1.25rem;
  }

  .provider-default-models-page__group-error {
    margin: 0.75rem 0 0;
  }

  .provider-default-models-page__rows {
    display: grid;
    background: color-mix(in srgb, var(--brand-fill-light) 82%, var(--brand-border-light));
  }

  .provider-default-models-page__row {
    display: grid;
    gap: 0.75rem;
    min-height: 5.25rem;
    padding: 0.9375rem 1.125rem 1rem 1.5rem;
    background: color-mix(in srgb, var(--brand-fill-light) 82%, var(--brand-border-light));
  }

  .provider-default-models-page__row + .provider-default-models-page__row {
    border-top: 1px solid color-mix(in srgb, var(--brand-border-dark) 68%, transparent);
  }

  .provider-default-models-page__row:hover {
    background: color-mix(in srgb, var(--brand-fill-light) 92%, var(--brand-bg-surface));
  }

  .provider-default-models-page__row-title-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    gap: 0.875rem;
  }

  .provider-default-models-page__row-hint {
    flex: none;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    line-height: 1.125rem;
  }

  .provider-default-models-page__model-cascader {
    min-width: 0;

    :deep(.el-input__wrapper) {
      min-height: 2.625rem;
      border-radius: 0.5rem;
      background: var(--brand-bg-surface);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-dark) 72%, transparent) inset, 0 1px 2px rgba(31, 35, 41, 0.03);
    }
  }
}

@media (max-width: 1099px) {
  .provider-default-models-page {
    padding-inline: 1rem;

    .provider-default-models-page__groups {
      grid-template-columns: minmax(0, 1fr);
    }

    .provider-default-models-page__summary,
    .provider-default-models-page__group-title-line,
    .provider-default-models-page__row-title-line {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.375rem;
    }

    .provider-default-models-page__default-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.625rem;
    }
  }
}
</style>
