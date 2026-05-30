<script setup lang="ts">
import type { ChatSessionSummary } from '@/apis/chat'
import DocsChatHistoryDropdown from './DocsChatHistoryDropdown.vue'

const props = defineProps<{
  activeSessionId: string | null
  hasActiveSession: boolean
  isDeleting: boolean
  isLoadingSessions: boolean
  sessions: ChatSessionSummary[]
  title: string
}>()

const emits = defineEmits<{
  deleteSession: []
  loadHistory: []
  newSession: []
  renameSession: []
  selectHistory: [sessionId: string]
}>()
</script>

<template>
  <header class="docs-chat-header">
    <DocsChatHistoryDropdown
      :title="props.title"
      :sessions="props.sessions"
      :active-session-id="props.activeSessionId"
      :is-loading="props.isLoadingSessions"
      @load="emits('loadHistory')"
      @select="emits('selectHistory', $event)"
    />

    <div v-if="props.hasActiveSession" class="docs-chat-header__actions">
      <ElTooltip content="新对话" placement="bottom" :show-after="120">
        <ElButton
          text
          class="docs-chat-header__icon-button"
          title="新对话"
          @click="emits('newSession')"
        >
          <SvgIcon category="ui" icon="plus" />
        </ElButton>
      </ElTooltip>

      <ElDropdown
        trigger="click"
        popper-class="docs-chat-header__more-popper"
      >
        <ElButton
          text
          class="docs-chat-header__icon-button"
          title="更多"
        >
          <SvgIcon category="ui" icon="more" />
        </ElButton>

        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem @click="emits('renameSession')">
              <template #icon>
                <SvgIcon category="ui" icon="edit" size="1rem" />
              </template>
              重命名
            </ElDropdownItem>

            <ElDropdownItem
              class="docs-chat-header__delete-item"
              :disabled="props.isDeleting"
              @click="emits('deleteSession')"
            >
              <template #icon>
                <SvgIcon category="ui" icon="trash-can" size="1rem" />
              </template>
              删除
            </ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </div>
  </header>
</template>

<style scoped lang="scss">
.docs-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex: 0 0 auto;
  min-width: 0;
  min-height: 3rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
}

.docs-chat-header__actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex: none;
}

.docs-chat-header__icon-button {
  --el-button-hover-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);
  --el-button-active-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 84%, transparent);
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
  padding: 0;
  border-radius: 0.5rem;
  color: var(--brand-text-primary);
  font-size: 1rem;
}

:global(.docs-chat-header__more-popper .el-dropdown-menu) {
  min-width: 8.5rem;
  padding: 0.3125rem;
}

:global(.docs-chat-header__more-popper .el-dropdown-menu__item) {
  gap: 0.5rem;
  min-height: 2.125rem;
  padding: 0 0.5rem;
  border-radius: 0.375rem;
}

:global(.el-dropdown-menu__item.docs-chat-header__delete-item:not(.is-disabled):hover),
:global(.el-dropdown-menu__item.docs-chat-header__delete-item:not(.is-disabled):focus) {
  color: var(--el-color-danger);
  background-color: color-mix(in srgb, var(--el-color-danger) 9%, transparent);
}
</style>
