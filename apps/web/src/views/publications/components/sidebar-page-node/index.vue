<script setup lang="ts">
import type { PublicationSidebarPageNodeProps } from './typing'

defineOptions({
  name: 'PublicationSidebarPageNode',
})

const props = defineProps<PublicationSidebarPageNodeProps>()
</script>

<template>
  <li class="publication-sidebar-page-node min-w-0">
    <RouterLink
      class="publication-sidebar-page-node__link block min-w-0 overflow-hidden rounded-md px-2 py-1 text-[13px] font-medium leading-[1.45] text-secondary no-underline text-ellipsis whitespace-nowrap"
      :class="{ 'is-active font-bold': props.page.documentId === props.activeDocumentId }"
      :to="`/s/${props.siteId}/${props.page.documentId}`"
    >
      {{ props.page.title }}
    </RouterLink>

    <ul v-if="props.page.children.length" class="publication-sidebar-page-node__children mt-px grid list-none gap-px pl-3">
      <PublicationSidebarPageNode
        v-for="child in props.page.children"
        :key="child.id"
        :page="child"
        :site-id="props.siteId"
        :active-document-id="props.activeDocumentId"
      />
    </ul>
  </li>
</template>

<style scoped lang="scss">
.publication-sidebar-page-node__link {
  &:hover,
  &:focus-visible {
    color: var(--brand-primary);
  }

  &.is-active {
    background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
    color: var(--brand-primary);
  }
}
</style>
