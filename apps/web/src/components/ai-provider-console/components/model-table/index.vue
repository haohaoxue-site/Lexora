<script setup lang="ts">
import type { AiProviderModelTableEmits, AiProviderModelTableProps } from './typing'
import type { AiModelType } from '@/apis/ai'
import { AI_MODEL_TYPE_LABELS } from '../../utils/modelDisplay'

defineProps<AiProviderModelTableProps>()

const emit = defineEmits<AiProviderModelTableEmits>()

const MODEL_TYPE_COLUMN_WIDTH = 108
const MODEL_STATUS_COLUMN_WIDTH = 116
</script>

<template>
  <ElTable
    :data="models"
    row-key="modelId"
    height="100%"
    class="ai-provider-console__model-table"
  >
    <ElTableColumn label="模型名" prop="modelName" show-overflow-tooltip>
      <template #default="{ row }">
        <div class="ai-provider-console__table-model-name-cell">
          <span class="ai-provider-console__table-model-name">
            {{ row.modelName }}
          </span>
        </div>
      </template>
    </ElTableColumn>

    <ElTableColumn label="模型 ID" prop="modelId" show-overflow-tooltip>
      <template #default="{ row }">
        <div class="ai-provider-console__table-model-id-cell">
          <span class="ai-provider-console__table-model-id">
            {{ row.modelId }}
          </span>
        </div>
      </template>
    </ElTableColumn>

    <ElTableColumn
      label="类型"
      :width="MODEL_TYPE_COLUMN_WIDTH"
      align="center"
      class-name="ai-provider-console__table-type-column"
    >
      <template #default="{ row }">
        <div class="ai-provider-console__table-type-cell">
          <ElTag size="small">
            {{ AI_MODEL_TYPE_LABELS[row.modelType as AiModelType] }}
          </ElTag>
        </div>
      </template>
    </ElTableColumn>

    <ElTableColumn
      label="启用"
      :width="MODEL_STATUS_COLUMN_WIDTH"
      align="right"
      class-name="ai-provider-console__table-status-column"
    >
      <template #default="{ row }">
        <div class="ai-provider-console__table-switch-cell">
          <ElSwitch
            :model-value="row.enabled ?? false"
            :loading="isModelUpdating(row)"
            :disabled="isModelUpdating(row)"
            @change="value => emit('updateModelStatus', row, value)"
          />
        </div>
      </template>
    </ElTableColumn>
  </ElTable>
</template>
