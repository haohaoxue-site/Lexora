<script setup lang="ts">
import type { ResolvedPublicationNavItem } from '../../utils/publicationRendering'
import type { PublicationTopNavProps } from './typing'
import { normalizePublicationHref } from '@haohaoxue/samepage-shared'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { PUBLICATION_UNPUBLISHED_MESSAGE } from '../../utils/publicationRendering'

const props = defineProps<PublicationTopNavProps>()
const router = useRouter()

function handleNavClick(item: ResolvedPublicationNavItem, event: MouseEvent) {
  if (item.disabled) {
    event.preventDefault()
    ElMessage.info(PUBLICATION_UNPUBLISHED_MESSAGE)
    return
  }

  const safeHref = normalizePublicationHref(item.href)

  if (!safeHref) {
    event.preventDefault()
    return
  }

  if (
    item.external
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || event.button !== 0
    || !safeHref.startsWith('/')
  ) {
    return
  }

  event.preventDefault()
  void router.push(safeHref)
}

function resolveNavHref(item: ResolvedPublicationNavItem) {
  return normalizePublicationHref(item.href) ?? undefined
}
</script>

<template>
  <header class="publication-top-nav flex items-center justify-between gap-5 h-16">
    <RouterLink class="inline-flex min-w-0 items-center gap-2 text-main no-underline" :to="`/s/${props.site.id}`">
      <img
        v-if="props.site.logoUrl"
        class="publication-top-nav__logo h-[1.55rem] w-[1.55rem] flex-[0_0_auto] rounded-[0.35rem] object-cover"
        :src="props.site.logoUrl"
        alt=""
      >
      <span v-else class="publication-top-nav__fallback-logo inline-flex h-[1.55rem] w-[1.55rem] flex-[0_0_auto] items-center justify-center rounded-[0.35rem] text-[0.85rem] font-800">
        {{ props.site.title.slice(0, 1) }}
      </span>
      <span class="overflow-hidden text-[0.95rem] font-700 leading-[1.4] text-ellipsis whitespace-nowrap">{{ props.site.title }}</span>
    </RouterLink>

    <nav
      v-if="props.navItems.length"
      class="publication-top-nav__links inline-flex min-w-0 items-center justify-end gap-5 max-[720px]:hidden"
      aria-label="顶部导航"
    >
      <a
        v-for="item in props.navItems"
        :key="`${item.label}-${item.href}`"
        class="publication-top-nav__link text-[13px] font-semibold leading-[1.4] text-secondary no-underline whitespace-nowrap"
        :class="{ 'is-disabled': item.disabled }"
        :href="resolveNavHref(item)"
        :target="item.external && item.openInNewTab ? '_blank' : undefined"
        :rel="item.external && item.openInNewTab ? 'noopener noreferrer' : undefined"
        @click="handleNavClick(item, $event)"
      >
        {{ item.label }}
      </a>
    </nav>
  </header>
</template>

<style scoped lang="scss">
.publication-top-nav {
  position: sticky;
  top: 0;
  z-index: 30;
  padding: 0 max(1.5rem, calc((100vw - 72rem) / 2));
  border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 64%, transparent);
  background: color-mix(in srgb, var(--brand-bg-surface) 94%, transparent);
  backdrop-filter: blur(1rem);
}

.publication-top-nav__fallback-logo {
  background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  color: var(--brand-primary);
}

.publication-top-nav__link {
  &:hover,
  &:focus-visible {
    color: var(--brand-primary);
  }

  &.is-disabled {
    color: var(--brand-text-tertiary);
    cursor: not-allowed;
  }
}

@media (max-width: 720px) {
  .publication-top-nav {
    padding: 0 1rem;
  }
}
</style>
