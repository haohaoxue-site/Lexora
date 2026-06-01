<script setup lang="ts">
import type { AiProviderSidebarEmits, AiProviderSidebarProps } from './typing'

defineProps<AiProviderSidebarProps>()

const emit = defineEmits<AiProviderSidebarEmits>()
const searchKeyword = defineModel<string>('searchKeyword', { required: true })
</script>

<template>
  <aside class="ai-provider-console__sidebar">
    <div class="ai-provider-console__search">
      <ElInput v-model="searchKeyword" clearable placeholder="搜索服务商..." />
    </div>

    <ElScrollbar class="min-h-0 flex-1">
      <div class="ai-provider-console__provider-list">
        <template v-for="row in rows" :key="row.rowKey">
          <ElDropdown
            v-if="row.kind === 'compatible'"
            trigger="contextmenu"
            @command="command => emit('compatibleCommand', String(command), row)"
          >
            <button
              type="button"
              class="ai-provider-console__provider-item"
              :class="{ active: row.rowKey === selectedRowKey }"
              @click="emit('selectRow', row.rowKey)"
              @contextmenu="emit('rowContextMenu', row)"
            >
              <span class="ai-provider-console__provider-avatar">
                {{ getProviderInitial(row) }}
              </span>
              <span class="ai-provider-console__provider-info">
                <span class="ai-provider-console__provider-title">
                  {{ row.title }}
                </span>
              </span>
              <ElTag
                size="small"
                effect="light"
                class="ai-provider-console__provider-status"
                :type="getProviderStatusType(row)"
              >
                {{ getProviderStatusLabel(row) }}
              </ElTag>
            </button>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem command="edit">
                  编辑
                </ElDropdownItem>
                <ElDropdownItem command="delete" divided>
                  删除
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>

          <button
            v-else
            type="button"
            class="ai-provider-console__provider-item"
            :class="{ active: row.rowKey === selectedRowKey }"
            @click="emit('selectRow', row.rowKey)"
          >
            <span class="ai-provider-console__provider-avatar">
              {{ getProviderInitial(row) }}
            </span>
            <span class="ai-provider-console__provider-info">
              <span class="ai-provider-console__provider-title">
                {{ row.title }}
              </span>
            </span>
            <ElTag
              size="small"
              effect="light"
              class="ai-provider-console__provider-status"
              :type="getProviderStatusType(row)"
            >
              {{ getProviderStatusLabel(row) }}
            </ElTag>
          </button>
        </template>

        <ElEmpty v-if="rows.length === 0" :image-size="88" description="没有匹配的服务商" />
      </div>
    </ElScrollbar>

    <div class="ai-provider-console__sidebar-footer">
      <ElButton class="w-full" size="large" type="primary" @click="emit('openCreateProvider')">
        <SvgIcon category="ui" icon="plus" size="1rem" class="mr-2" />
        添加
      </ElButton>
    </div>
  </aside>
</template>
