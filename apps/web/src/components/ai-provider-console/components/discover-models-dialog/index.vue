<script setup lang="ts">
import type {
  AiProviderDiscoverModelsDialogEmits,
  AiProviderDiscoverModelsDialogProps,
} from './typing'
import ProviderModelTable from '../model-table'

defineProps<AiProviderDiscoverModelsDialogProps>()

const emit = defineEmits<AiProviderDiscoverModelsDialogEmits>()
const visible = defineModel<boolean>('visible', { required: true })
const searchKeyword = defineModel<string>('searchKeyword', { required: true })
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="`${title}模型`"
    width="min(72rem, calc(100vw - 4rem))"
    class="ai-provider-console__discover-dialog"
  >
    <div class="ai-provider-console__discover-toolbar">
      <ElInput
        v-model="searchKeyword"
        clearable
        class="ai-provider-console__discover-search"
        placeholder="搜索模型 ID 或名称"
      />
      <div class="ai-provider-console__discover-actions">
        <ElButton
          type="primary"
          :loading="isAdding"
          :disabled="models.length === 0"
          @click="emit('addAll')"
        >
          全部添加
        </ElButton>
        <ElButton :loading="isDiscovering" @click="emit('refresh')">
          <SvgIcon category="ui" icon="sync-refresh" size="1rem" class="mr-2" />
          刷新列表
        </ElButton>
      </div>
    </div>

    <div v-loading="isDiscovering" class="ai-provider-console__discover-list">
      <ProviderModelTable
        :models="models"
        :is-model-updating="isModelUpdating"
        @update-model-status="(model, value) => emit('updateModelStatus', model, value)"
      />
    </div>
  </ElDialog>
</template>
