<script setup lang="ts" generic="T extends Record<string, unknown>">
import type { DesktopChatSidebarSection } from '@buddy-electron/shared/desktopApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NVirtualList } from 'naive-ui'
import { computed } from 'vue'
import {
  DESKTOP_CHAT_SIDEBAR_LIST_PADDING_TOP,
  DESKTOP_CHAT_SIDEBAR_ROW_SIZE,
  resolveDesktopChatSidebarSectionLayout,
} from '@/workbenches/chat/index/chatSidebarLayout'
import DesktopChatSidebarSectionHeader from '@/workbenches/chat/index/DesktopChatSidebarSectionHeader.vue'

const props = defineProps<{
  canMoveDown: boolean
  canMoveUp: boolean
  fillRemaining: boolean
  items: ReadonlyArray<T>
  keyField: string
  label: string
  language: BuddyLocale
  section: DesktopChatSidebarSection
  showAdd?: boolean
}>()
const emit = defineEmits<{
  add: []
  move: [direction: 'up' | 'down']
}>()
defineSlots<{
  default: (props: { item: T }) => unknown
}>()
const expanded = defineModel<boolean>('expanded', { required: true })
const layout = computed(() => resolveDesktopChatSidebarSectionLayout({
  expanded: expanded.value,
  fillRemaining: props.fillRemaining,
  rowCount: props.items.length,
}))
const virtualItems = computed(() => [...props.items])
const sectionStyle = computed(() => ({
  '--buddy-chat-sidebar-section-natural-size': layout.value.naturalSize,
}))
</script>

<template>
  <section
    class="desktop-chat-sidebar__section"
    :class="[`is-${layout.mode}`, `desktop-chat-sidebar__${section}`]"
    :style="sectionStyle"
  >
    <DesktopChatSidebarSectionHeader
      :can-move-down="canMoveDown"
      :can-move-up="canMoveUp"
      :expanded="expanded"
      :label="label"
      :language="language"
      :show-add="showAdd"
      @add="emit('add')"
      @move="emit('move', $event)"
      @toggle="expanded = !expanded"
    />
    <NVirtualList
      v-show="expanded"
      class="desktop-chat-sidebar__virtual-list"
      :item-size="DESKTOP_CHAT_SIDEBAR_ROW_SIZE"
      :items="virtualItems"
      :key-field="keyField"
      :padding-top="DESKTOP_CHAT_SIDEBAR_LIST_PADDING_TOP"
    >
      <template #default="{ item }">
        <slot :item="item" />
      </template>
    </NVirtualList>
  </section>
</template>

<style scoped lang="scss">
.desktop-chat-sidebar__section {
  display: flex;
  min-height: var(--buddy-chat-sidebar-section-header-size);
  flex-direction: column;
  overflow: hidden;

  &.is-content-shrink {
    flex: 0 1 var(--buddy-chat-sidebar-section-natural-size);
  }

  &.is-fill-remaining {
    flex-grow: 1;
    flex-shrink: 0;
    flex-basis: min(
      var(--buddy-chat-sidebar-section-natural-size),
      calc(50% - var(--buddy-chat-sidebar-section-half-gap))
    );
  }

  &.is-collapsed {
    flex: 0 0 var(--buddy-chat-sidebar-section-header-size);
  }
}

.desktop-chat-sidebar__virtual-list {
  height: 100%;
  min-height: 0;
  flex: 1;
}
</style>
