<script setup lang="ts">
import type { PublicationSidebarTreeProps } from './typing'
import { computed, reactive, watch } from 'vue'
import { SvgIcon } from '@/components/svg-icon'
import PublicationSidebarPageNode from '../sidebar-page-node'

const props = defineProps<PublicationSidebarTreeProps>()
const expandedByGroupId = reactive<Record<string, boolean>>({})

const visibleGroups = computed(() => props.groups.filter(group => group.pages.length))

watch(
  visibleGroups,
  (groups) => {
    for (const group of groups) {
      expandedByGroupId[group.id] ??= !group.collapsed
    }
  },
  { immediate: true },
)

function toggleGroup(groupId: string) {
  expandedByGroupId[groupId] = !expandedByGroupId[groupId]
}
</script>

<template>
  <nav class="publication-sidebar-tree grid gap-5" aria-label="站点侧边栏">
    <section
      v-for="group in visibleGroups"
      :id="`publication-section-${group.id}`"
      :key="group.id"
      class="publication-sidebar-tree__group min-w-0 border-t border-t-[color-mix(in_srgb,var(--brand-border-base)_64%,transparent)] pt-5 first:border-t-0 first:pt-0"
    >
      <button
        class="publication-sidebar-tree__group-trigger flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 border-none bg-transparent px-2 py-1 text-left text-main [font:inherit]"
        type="button"
        @click="toggleGroup(group.id)"
      >
        <span class="min-w-0 overflow-hidden text-[13px] font-bold leading-[1.45] text-ellipsis whitespace-nowrap">{{ group.title }}</span>
        <SvgIcon
          category="ui"
          :icon="expandedByGroupId[group.id] ? 'chevron-down' : 'chevron-right'"
          size="12px"
        />
      </button>

      <ul v-show="expandedByGroupId[group.id]" class="mt-px grid list-none gap-px p-0">
        <PublicationSidebarPageNode
          v-for="page in group.pages"
          :key="page.id"
          :page="page"
          :site-id="props.siteId"
          :active-document-id="props.activeDocumentId"
        />
      </ul>
    </section>
  </nav>
</template>

<style scoped lang="scss">
.publication-sidebar-tree__group-trigger {
  &:hover,
  &:focus-visible {
    color: var(--brand-primary);
  }
}
</style>
