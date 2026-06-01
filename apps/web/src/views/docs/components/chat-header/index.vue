<script setup lang="ts">
import type {
  DocsChatHeaderEmits,
  DocsChatHeaderProps,
} from './typing'
import DocsChatHistoryDropdown from '../chat-history-dropdown'

const props = defineProps<DocsChatHeaderProps>()
const emits = defineEmits<DocsChatHeaderEmits>()
</script>

<template>
  <header class="docs-chat-header flex min-h-12 min-w-0 flex-none items-center justify-between gap-2 px-3 py-2">
    <DocsChatHistoryDropdown
      :title="props.title"
      :sessions="props.sessions"
      :active-session-id="props.activeSessionId"
      :is-loading="props.isLoadingSessions"
      @load="emits('loadHistory')"
      @select="emits('selectHistory', $event)"
    />

    <div v-if="props.hasActiveSession" class="docs-chat-header__actions flex flex-none items-center gap-[0.125rem]">
      <ElTooltip content="新对话" placement="bottom" :show-after="120">
        <ElButton
          text
          class="docs-chat-header__icon-button h-8 min-w-8 w-8 rounded-lg p-0 text-base"
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
          class="docs-chat-header__icon-button h-8 min-w-8 w-8 rounded-lg p-0 text-base"
          title="更多"
        >
          <SvgIcon category="ui" icon="more" />
        </ElButton>

        <template #dropdown>
          <ElDropdownMenu class="docs-chat-header__menu box-border min-w-[8.5rem] p-[0.3125rem]">
            <ElDropdownItem
              class="docs-chat-header__menu-item min-h-[2.125rem] w-full box-border gap-2 rounded-md px-2"
              @click="emits('renameSession')"
            >
              <template #icon>
                <span class="inline-flex h-4 w-4 flex-none items-center justify-center text-regular">
                  <SvgIcon category="ui" icon="edit" size="1rem" />
                </span>
              </template>
              重命名
            </ElDropdownItem>

            <ElDropdownItem
              class="docs-chat-header__delete-item docs-chat-header__menu-item min-h-[2.125rem] w-full box-border gap-2 rounded-md px-2"
              :disabled="props.isDeleting"
              @click="emits('deleteSession')"
            >
              <template #icon>
                <span class="inline-flex h-4 w-4 flex-none items-center justify-center text-regular">
                  <SvgIcon category="ui" icon="trash-can" size="1rem" />
                </span>
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
  border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
}

.docs-chat-header__icon-button {
  --el-button-hover-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);
  --el-button-active-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 84%, transparent);
  color: var(--brand-text-primary);
}

:global(.el-dropdown-menu__item.docs-chat-header__delete-item:not(.is-disabled):hover),
:global(.el-dropdown-menu__item.docs-chat-header__delete-item:not(.is-disabled):focus) {
  color: var(--el-color-danger);
  background-color: color-mix(in srgb, var(--el-color-danger) 9%, transparent);
}
</style>
