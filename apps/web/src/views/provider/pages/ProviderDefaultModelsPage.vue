<script setup lang="ts">
import type { AiDefaultModelPolicyItem, AiModelIntentKey, AiModelRef } from '@/apis/ai'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import {
  getAiDefaultModels,
  updateAiDefaultModel,
} from '@/apis/ai'
import { ModelCascader } from '@/components/model-cascader'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { AI_MODEL_INTENT_OPTIONS } from '../utils/aiModel'

const policies = shallowRef<AiDefaultModelPolicyItem[]>([])
const isLoading = shallowRef(false)
const savingIntentKey = shallowRef<AiModelIntentKey | null>(null)
const selections = reactive<Record<string, AiModelRef | null>>({})

const policyByIntent = computed(() =>
  Object.fromEntries(policies.value.map(policy => [policy.intentKey, policy])),
)

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

async function saveIntentModel(intentKey: AiModelIntentKey) {
  const modelRef = selections[intentKey]

  if (!modelRef) {
    ElMessage.warning('请选择模型')
    return
  }

  savingIntentKey.value = intentKey

  try {
    const nextPolicy = await updateAiDefaultModel(intentKey, {
      configId: modelRef.configId,
      modelId: modelRef.modelId,
    })
    policies.value = [
      ...policies.value.filter(policy => policy.intentKey !== intentKey),
      nextPolicy,
    ]
    selections[intentKey] = nextPolicy.modelRef ? { ...nextPolicy.modelRef } : null
    ElMessage.success('默认模型已更新')
  }
  catch (error) {
    ElMessage.error(getRequestErrorDisplayMessage(error, '更新默认模型失败'))
  }
  finally {
    savingIntentKey.value = null
  }
}

function syncSelections() {
  for (const item of AI_MODEL_INTENT_OPTIONS) {
    const policy = policyByIntent.value[item.key]
    selections[item.key] = policy?.modelRef ? { ...policy.modelRef } : null
  }
}

function getPolicyStatusLabel(policy: AiDefaultModelPolicyItem | undefined) {
  if (!policy || policy.status === 'not_configured') {
    return '未配置'
  }

  if (policy.status === 'invalid') {
    return '配置失效'
  }

  return '已配置'
}

function getPolicyStatusType(policy: AiDefaultModelPolicyItem | undefined) {
  if (!policy || policy.status === 'not_configured') {
    return 'info'
  }

  return policy.status === 'invalid' ? 'warning' : 'success'
}
</script>

<template>
  <div v-loading="isLoading" class="provider-default-models-page">
    <div class="grid gap-4">
      <section
        v-for="item in AI_MODEL_INTENT_OPTIONS"
        :key="item.key"
        class="provider-default-models-page__item"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="m-0 text-base font-bold text-main">
              {{ item.label }}
            </h2>
            <ElTag size="small" :type="getPolicyStatusType(policyByIntent[item.key])">
              {{ getPolicyStatusLabel(policyByIntent[item.key]) }}
            </ElTag>
          </div>
          <p class="mt-1.5 text-sm leading-6 text-secondary">
            {{ item.description }}
          </p>
          <p v-if="policyByIntent[item.key]?.invalidReason" class="mt-1 text-xs text-warning">
            {{ policyByIntent[item.key]?.invalidReason }}
          </p>
        </div>

        <div class="provider-default-models-page__selector">
          <ModelCascader
            v-model="selections[item.key]"
            :intent-key="item.key"
            class="w-full"
            placeholder="选择默认模型"
          />
          <ElButton
            type="primary"
            :loading="savingIntentKey === item.key"
            :disabled="!selections[item.key]"
            @click="saveIntentModel(item.key)"
          >
            保存
          </ElButton>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.provider-default-models-page {
  padding: 1.5rem 2rem 3rem;

  .provider-default-models-page__item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(22rem, 0.9fr);
    gap: 1.5rem;
    align-items: center;
    padding: 1.25rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 84%, transparent);
    border-radius: 1rem;
    background: var(--brand-bg-surface);
  }

  .provider-default-models-page__selector {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
  }
}

@media (max-width: 1023px) {
  .provider-default-models-page {
    padding-inline: 1rem;

    .provider-default-models-page__item,
    .provider-default-models-page__selector {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
