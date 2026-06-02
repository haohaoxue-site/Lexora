<script setup lang="ts">
import type { PublicationPageOutlineProps } from './typing'

const props = withDefaults(defineProps<PublicationPageOutlineProps>(), {
  showTitle: true,
})
</script>

<template>
  <nav
    v-if="props.items.length"
    class="publication-page-outline min-w-0"
    :class="props.showTitle ? null : 'mt-1 border-l border-l-[color-mix(in_srgb,var(--brand-border-base)_62%,transparent)] pl-3'"
    aria-label="页面导航"
  >
    <p v-if="props.showTitle" class="publication-page-outline__title mb-3 text-[13px] font-bold leading-[1.5] text-main">
      页面导航
    </p>

    <ul class="publication-page-outline__list m-0 grid list-none gap-1 p-0">
      <li v-for="item in props.items" :key="item.id" class="publication-page-outline__item">
        <a class="publication-page-outline__link block overflow-hidden text-[13px] leading-[1.5] text-secondary no-underline text-ellipsis whitespace-nowrap" :href="`#${item.id}`">
          {{ item.title }}
        </a>
        <PublicationPageOutline v-if="item.children.length" :items="item.children" :show-title="false" />
      </li>
    </ul>
  </nav>
</template>

<style scoped lang="scss">
.publication-page-outline__link {
  &:hover,
  &:focus-visible {
    color: var(--brand-primary);
  }
}
</style>
