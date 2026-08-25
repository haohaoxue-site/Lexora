<script setup lang="ts" generic="T extends Record<string, unknown>">
import { NVirtualList } from 'naive-ui'
import { computed } from 'vue'
import {
  DESKTOP_CHAT_SIDEBAR_LIST_PADDING_TOP,
  DESKTOP_CHAT_SIDEBAR_ROW_SIZE,
  resolveDesktopChatSidebarSectionLayout,
} from '@/workbenches/chat/index/chatSidebarLayout'
import DesktopChatSidebarSectionHeader from '@/workbenches/chat/index/DesktopChatSidebarSectionHeader.vue'

const props = defineProps<{
  fillRemaining: boolean
  items: ReadonlyArray<T>
  keyField: string
  label: string
  section: 'pinned' | 'projects' | 'tasks'
  showAdd?: boolean
}>()
const emit = defineEmits<{
  add: []
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
      :expanded="expanded"
      :label="label"
      :show-add="showAdd"
      @add="emit('add')"
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
