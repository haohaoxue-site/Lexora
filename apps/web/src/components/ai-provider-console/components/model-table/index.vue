<script setup lang="ts">
import type { AiProviderModelTableEmits, AiProviderModelTableProps } from './typing'
import type {
  AiModelCapability,
  AiModelModality,
  AiModelType,
} from '@/apis/ai'
import {
  AI_MODEL_CAPABILITY_LABELS,
  AI_MODEL_MODALITY_LABELS,
  AI_MODEL_TYPE_LABELS,
  formatModelLimit,
} from '../../utils/modelDisplay'

defineProps<AiProviderModelTableProps>()

const emit = defineEmits<AiProviderModelTableEmits>()

const MODEL_NAME_COLUMN_WIDTH = 188
const MODEL_USAGE_COLUMN_WIDTH = 84
const MODEL_MODALITY_COLUMN_MIN_WIDTH = 76
const MODEL_CAPABILITY_COLUMN_MIN_WIDTH = 150
const MODEL_LIMIT_COLUMN_MIN_WIDTH = 104
const MODEL_ACTION_COLUMN_WIDTH = 48
const MODEL_STATUS_COLUMN_WIDTH = 56

function getModalityLabel(modality: AiModelModality) {
  return AI_MODEL_MODALITY_LABELS[modality]
}

function getCapabilityLabel(capability: AiModelCapability) {
  return AI_MODEL_CAPABILITY_LABELS[capability]
}
</script>

<template>
  <ElTable
    :data="models"
    row-key="modelId"
    height="100%"
    class="ai-provider-console__model-table"
  >
    <ElTableColumn
      label="模型"
      prop="modelName"
      :width="MODEL_NAME_COLUMN_WIDTH"
      fixed
      show-overflow-tooltip
    >
      <template #default="{ row }">
        <div class="ai-provider-console__table-model-cell">
          <span class="ai-provider-console__table-model-name">
            {{ row.modelName }}
          </span>
          <span class="ai-provider-console__table-model-id">
            {{ row.modelId }}
          </span>
        </div>
      </template>
    </ElTableColumn>

    <ElTableColumn
      label="用途"
      :width="MODEL_USAGE_COLUMN_WIDTH"
      align="center"
      class-name="ai-provider-console__table-usage-column"
    >
      <template #default="{ row }">
        <div class="ai-provider-console__table-usage-cell">
          <ElTag size="small" effect="plain">
            {{ AI_MODEL_TYPE_LABELS[row.modelType as AiModelType] }}
          </ElTag>
        </div>
      </template>
    </ElTableColumn>

    <ElTableColumn
      label="输入"
      :min-width="MODEL_MODALITY_COLUMN_MIN_WIDTH"
      show-overflow-tooltip
    >
      <template #default="{ row }">
        <div class="ai-provider-console__table-tags-cell">
          <ElTag
            v-for="modality in row.inputModalities"
            :key="modality"
            size="small"
            effect="plain"
          >
            {{ getModalityLabel(modality as AiModelModality) }}
          </ElTag>
        </div>
      </template>
    </ElTableColumn>

    <ElTableColumn
      label="输出"
      :min-width="MODEL_MODALITY_COLUMN_MIN_WIDTH"
      show-overflow-tooltip
    >
      <template #default="{ row }">
        <div class="ai-provider-console__table-tags-cell">
          <ElTag
            v-for="modality in row.outputModalities"
            :key="modality"
            size="small"
            effect="plain"
          >
            {{ getModalityLabel(modality as AiModelModality) }}
          </ElTag>
        </div>
      </template>
    </ElTableColumn>

    <ElTableColumn
      label="能力"
      :min-width="MODEL_CAPABILITY_COLUMN_MIN_WIDTH"
      show-overflow-tooltip
    >
      <template #default="{ row }">
        <div class="ai-provider-console__table-tags-cell">
          <ElTag
            v-for="capability in row.capabilities"
            :key="capability"
            size="small"
            effect="plain"
          >
            {{ getCapabilityLabel(capability as AiModelCapability) }}
          </ElTag>
          <span v-if="row.capabilities.length === 0" class="ai-provider-console__table-muted">
            -
          </span>
        </div>
      </template>
    </ElTableColumn>

    <ElTableColumn
      label="上下文 / 输出"
      :min-width="MODEL_LIMIT_COLUMN_MIN_WIDTH"
      show-overflow-tooltip
    >
      <template #default="{ row }">
        <div class="ai-provider-console__table-limit-cell">
          {{ formatModelLimit(row.contextWindow) }} / {{ formatModelLimit(row.maxOutputTokens) }}
        </div>
      </template>
    </ElTableColumn>

    <ElTableColumn
      v-if="canConfigure"
      label="配置"
      :width="MODEL_ACTION_COLUMN_WIDTH"
      align="center"
      class-name="ai-provider-console__table-action-column"
    >
      <template #default="{ row }">
        <ElTooltip content="配置模型能力" placement="top" effect="light">
          <ElButton
            text
            circle
            aria-label="配置模型能力"
            :disabled="isModelUpdating(row)"
            @click="emit('configureModel', row)"
          >
            <SvgIcon category="ui" icon="settings-gear" size="0.95rem" />
          </ElButton>
        </ElTooltip>
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
