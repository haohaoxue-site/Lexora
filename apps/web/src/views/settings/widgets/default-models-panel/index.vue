<script setup lang="ts">
import type { SettingsModelIntentGroup, SettingsModelIntentOption } from '../../typing'
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
import { AI_MODEL_INTENT_GROUPS } from '../../utils/aiDefaultModel'

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

async function handleIntentModelChange(item: Pick<SettingsModelIntentOption, 'key'>, modelRef: AiModelRef | null) {
  selections[item.key] = modelRef ? { ...modelRef } : null

  if (!modelRef && !hasStoredPolicy(item.key)) {
    return
  }

  savingIntentKey.value = item.key

  try {
    const nextPolicy = await updateAiDefaultModel(item.key, {
      modelRef: modelRef
        ? {
            providerId: modelRef.providerId,
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

function getPolicyInvalidReason(item: Pick<SettingsModelIntentOption, 'key'>) {
  const ownPolicy = policyByIntent.value[item.key]
  const effectivePolicy = resolveEffectiveAiDefaultModelPolicy(policyByIntent.value, item.key)

  if (ownPolicy?.invalidReason) {
    return ownPolicy.invalidReason
  }

  return effectivePolicy.inherited ? effectivePolicy.invalidReason : null
}

function getGroupChildren(group: SettingsModelIntentGroup) {
  return group.children
}

function getOverrideHint(group: SettingsModelIntentGroup) {
  return `可覆盖${group.label}`
}
</script>

<template>
  <div v-loading="isLoading" class="settings-default-models-page mx-auto w-full max-w-[var(--page-mode-table-max-width)] px-8 pb-10 pt-5 max-[1099px]:px-4">
    <div class="grid grid-cols-2 items-start gap-4 max-[1099px]:grid-cols-1">
      <section
        v-for="group in AI_MODEL_INTENT_GROUPS"
        :key="group.key"
        class="settings-default-models-page__group"
      >
        <div class="settings-default-models-page__group-header px-5 pb-4 pt-4">
          <div class="mb-4 flex min-w-0 items-center justify-between gap-4 max-[1099px]:flex-col max-[1099px]:items-start max-[1099px]:gap-[0.375rem]">
            <h2 class="m-0 text-lg font-bold text-main">
              {{ group.label }}
            </h2>
            <span class="text-[0.8125rem] leading-5 text-regular">
              {{ group.description }}
            </span>
          </div>

          <div class="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-4 max-[1099px]:grid-cols-1 max-[1099px]:gap-[0.625rem]">
            <span class="text-[0.8125rem] font-semibold leading-5 text-regular">默认模型</span>
            <ModelCascader
              :model-value="selections[group.key]"
              :intent-key="group.key"
              :disabled="savingIntentKey === group.key"
              class="settings-default-models-page__model-cascader w-full"
              placeholder="选择默认模型"
              @update:model-value="value => handleIntentModelChange(group, value)"
            />
          </div>

          <p v-if="getPolicyInvalidReason(group)" class="m-0 mt-3 text-xs leading-5 text-warning">
            {{ getPolicyInvalidReason(group) }}
          </p>
        </div>

        <div class="settings-default-models-page__rows grid">
          <section
            v-for="item in getGroupChildren(group)"
            :key="item.key"
            class="settings-default-models-page__row grid min-h-[4.75rem] gap-2.5 px-5 py-3.5"
          >
            <div class="flex min-w-0 items-center justify-between gap-3 max-[1099px]:flex-col max-[1099px]:items-start max-[1099px]:gap-[0.375rem]">
              <h3 class="m-0 text-sm font-semibold text-main">
                {{ item.label }}
              </h3>
              <span class="text-xs leading-[1.125rem] text-secondary">
                {{ getOverrideHint(group) }}
              </span>
            </div>

            <ModelCascader
              :model-value="selections[item.key]"
              :intent-key="item.key"
              :disabled="savingIntentKey === item.key"
              class="settings-default-models-page__model-cascader w-full"
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
.settings-default-models-page {
  .settings-default-models-page__group {
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    border-radius: 0.5rem;
    background: var(--brand-bg-surface);
    box-shadow: var(--brand-shadow-hairline);
  }

  .settings-default-models-page__group-header {
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    background: color-mix(in srgb, var(--brand-bg-surface-raised) 88%, var(--brand-bg-surface));
  }

  .settings-default-models-page__rows {
    background: color-mix(in srgb, var(--brand-fill-light) 78%, var(--brand-border-light));
  }

  .settings-default-models-page__row {
    background: color-mix(in srgb, var(--brand-fill-light) 78%, var(--brand-border-light));
  }

  .settings-default-models-page__row + .settings-default-models-page__row {
    border-top: 1px solid color-mix(in srgb, var(--brand-border-dark) 62%, transparent);
  }

  .settings-default-models-page__row:hover {
    background: color-mix(in srgb, var(--brand-fill-light) 86%, var(--brand-bg-surface));
  }

  .settings-default-models-page__model-cascader {
    min-width: 0;

    :deep(.el-input__wrapper) {
      min-height: 2.5rem;
      border-radius: 0.5rem;
      background: var(--brand-bg-surface);
      box-shadow: var(--brand-shadow-hairline);
    }
  }
}
</style>
