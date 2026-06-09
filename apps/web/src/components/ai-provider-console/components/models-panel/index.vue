<script setup lang="ts">
import type { AiProviderModelsPanelEmits, AiProviderModelsPanelProps } from './typing'
import ProviderModelTable from '../model-table'

defineProps<AiProviderModelsPanelProps>()

const emit = defineEmits<AiProviderModelsPanelEmits>()
</script>

<template>
  <section class="ai-provider-console__section ai-provider-console__section--models">
    <div class="ai-provider-console__section-header ai-provider-console__section-header--models">
      <h3 class="m-0 text-base font-semibold text-main">
        模型列表
      </h3>
      <span class="ai-provider-console__section-summary ml-1">
        {{ modelSummaryText }}
      </span>
      <ElButtonGroup class="ai-provider-console__section-action">
        <ElButton
          type="primary"
          plain
          :loading="isDiscoveringModels"
          @click="emit('openDiscoverModels')"
        >
          <SvgIcon category="ui" icon="sync-refresh" size="1rem" class="mr-2" />
          {{ discoverModelsButtonText }}
        </ElButton>
        <ElTooltip content="添加模型" placement="top" effect="light">
          <ElButton
            type="primary"
            plain
            aria-label="添加模型"
            @click="emit('openCreateModel')"
          >
            <SvgIcon category="ui" icon="plus" size="1rem" />
          </ElButton>
        </ElTooltip>
      </ElButtonGroup>
    </div>

    <div v-if="shouldShowEmptyState" class="ai-provider-console__models-empty">
      <ElEmpty description="暂无模型" />
    </div>

    <div v-else v-loading="isLoadingModels" class="ai-provider-console__model-list">
      <ProviderModelTable
        :models="models"
        :can-configure="true"
        :is-model-updating="isModelUpdating"
        @configure-model="model => emit('configureModel', model)"
        @update-model-status="(model, value) => emit('updateModelStatus', model, value)"
      />
    </div>
  </section>
</template>
