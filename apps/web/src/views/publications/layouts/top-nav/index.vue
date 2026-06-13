<script setup lang="ts">
import type { ResolvedPublicationNavItem } from '../../utils/publicationRendering'
import type { PublicationTopNavProps } from './typing'
import { normalizePublicationHref } from '@haohaoxue/lexora-shared/document'
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { SvgIcon } from '@/components/svg-icon'
import { ElMessage } from '@/utils/element-plus'
import { getPublicationUnpublishedMessage } from '../../utils/publicationRendering'

const props = defineProps<PublicationTopNavProps>()
const router = useRouter()
const { t } = useI18n()
const isMobileMenuOpen = shallowRef(false)
const isAtTop = shallowRef(true)

function syncTopState() {
  isAtTop.value = window.scrollY <= 0
}

onMounted(() => {
  syncTopState()
  window.addEventListener('scroll', syncTopState, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', syncTopState)
})

function handleNavClick(item: ResolvedPublicationNavItem, event: MouseEvent) {
  if (item.disabled) {
    event.preventDefault()
    ElMessage.info(getPublicationUnpublishedMessage())
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

function handleMobileNavClick(item: ResolvedPublicationNavItem, event: MouseEvent) {
  handleNavClick(item, event)

  if (!event.defaultPrevented || !item.disabled) {
    isMobileMenuOpen.value = false
  }
}

function resolveNavHref(item: ResolvedPublicationNavItem) {
  return normalizePublicationHref(item.href) ?? undefined
}

function toggleMobileMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}
</script>

<template>
  <header
    class="publication-top-nav"
    :class="{
      'is-home': props.home,
      'is-top': props.home && isAtTop,
      'is-scrolled': props.home && !isAtTop,
      'is-screen-open': isMobileMenuOpen,
    }"
  >
    <div class="publication-top-nav__surface" aria-hidden="true" />
    <div class="publication-top-nav__container">
      <RouterLink class="publication-top-nav__brand inline-flex min-w-0 items-center gap-2 text-main no-underline" :to="`/s/${props.site.id}`">
        <img
          v-if="props.site.logoUrl"
          class="publication-top-nav__logo h-6 w-6 flex-[0_0_auto] object-contain"
          :src="props.site.logoUrl"
          alt=""
        >
        <span v-else class="publication-top-nav__fallback-logo inline-flex h-6 w-6 flex-[0_0_auto] items-center justify-center rounded-md text-sm font-700">
          {{ props.site.title.slice(0, 1) }}
        </span>
        <span class="overflow-hidden text-base font-600 leading-[1.4] text-ellipsis whitespace-nowrap">{{ props.site.title }}</span>
      </RouterLink>

      <nav
        v-if="props.navItems.length"
        class="publication-top-nav__links inline-flex min-w-0 items-center justify-end gap-5 max-[720px]:hidden"
        :aria-label="t('docs.publicReader.topNavigation')"
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

      <button
        v-if="props.navItems.length"
        class="publication-top-nav__menu-button hidden h-8 w-8 flex-[0_0_auto] items-center justify-center rounded-md border-none bg-transparent p-0 text-secondary max-[720px]:inline-flex"
        type="button"
        :aria-label="t('docs.publicReader.openSiteNavigation')"
        :aria-expanded="isMobileMenuOpen"
        @click="toggleMobileMenu"
      >
        <SvgIcon category="ui" icon="sidebar-open" size="1rem" />
      </button>
    </div>

    <nav
      v-if="props.navItems.length"
      class="publication-top-nav__mobile-menu"
      :class="{ 'is-open': isMobileMenuOpen }"
      :aria-label="t('docs.publicReader.mobileTopNavigation')"
    >
      <a
        v-for="item in props.navItems"
        :key="`mobile-${item.label}-${item.href}`"
        class="publication-top-nav__mobile-link"
        :class="{ 'is-disabled': item.disabled }"
        :href="resolveNavHref(item)"
        :target="item.external && item.openInNewTab ? '_blank' : undefined"
        :rel="item.external && item.openInNewTab ? 'noopener noreferrer' : undefined"
        @click="handleMobileNavClick(item, $event)"
      >
        {{ item.label }}
      </a>
    </nav>

    <div class="publication-top-nav__divider" aria-hidden="true">
      <div class="publication-top-nav__divider-line" />
    </div>
    <div class="publication-top-nav__mask" aria-hidden="true" />
  </header>
</template>

<style scoped lang="scss">
.publication-top-nav {
  position: sticky;
  top: 0;
  z-index: 30;
  background: transparent;
  transition: background-color 0.25s;
}

.publication-top-nav__surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--publication-c-bg);
  opacity: 1;
  pointer-events: none;
  transition: opacity 0.25s, background-color 0.5s;
}

.publication-top-nav.is-home.is-top:not(.is-screen-open) .publication-top-nav__surface {
  opacity: 0;
}

@supports ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) {
  .publication-top-nav__surface {
    background: color-mix(in srgb, var(--publication-c-bg) 86%, transparent);
    -webkit-backdrop-filter: saturate(180%) blur(12px);
    backdrop-filter: saturate(180%) blur(12px);
  }
}

.publication-top-nav__container {
  position: relative;
  z-index: 2;
  display: flex;
  width: 100%;
  max-width: var(--publication-layout-max-width);
  height: var(--publication-nav-height);
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.publication-top-nav__divider {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  width: 100%;
  height: 1px;
  pointer-events: none;
}

.publication-top-nav__divider-line {
  width: 100%;
  height: 1px;
  background: var(--publication-c-gutter);
  opacity: 1;
  transition: opacity 0.5s, background-color 0.5s;
}

.publication-top-nav.is-home.is-top:not(.is-screen-open) .publication-top-nav__divider-line {
  opacity: 0;
}

.publication-top-nav__mask {
  position: absolute;
  top: 100%;
  right: 0;
  left: 0;
  z-index: 1;
  height: 2.25rem;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--publication-c-bg) 92%, transparent),
    transparent
  );
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}

.publication-top-nav.is-home.is-scrolled .publication-top-nav__mask {
  opacity: 1;
}

.publication-top-nav__brand {
  min-height: calc(var(--publication-nav-height) - 1px);
}

.publication-top-nav__fallback-logo {
  background: var(--publication-c-brand-soft);
  color: var(--publication-c-brand-1);
}

.publication-top-nav__link {
  &:hover,
  &:focus-visible {
    color: var(--publication-c-brand-1);
  }

  &.is-disabled {
    color: var(--publication-c-text-3);
    cursor: not-allowed;
  }
}

.publication-top-nav__menu-button {
  &:hover,
  &:focus-visible {
    background: var(--publication-c-brand-soft);
    color: var(--publication-c-brand-1);
  }
}

.publication-top-nav__mobile-menu {
  position: absolute;
  top: var(--publication-nav-height);
  left: 0;
  right: 0;
  z-index: 3;
  display: none;
  gap: 0.125rem;
  padding: 0.5rem 1rem 0.875rem;
  border-bottom: 1px solid var(--publication-c-gutter);
  background: var(--publication-c-bg);
}

.publication-top-nav__mobile-menu.is-open {
  display: grid;
}

.publication-top-nav__mobile-link {
  display: block;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  color: var(--publication-c-text-2);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.5;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    background: var(--publication-c-bg-soft);
    color: var(--publication-c-brand-1);
  }

  &.is-disabled {
    color: var(--publication-c-text-3);
    cursor: not-allowed;
  }
}

@media (min-width: 768px) {
  .publication-top-nav__container {
    padding: 0 2rem;
  }
}

@media (min-width: 721px) {
  .publication-top-nav__mobile-menu {
    display: none;
  }
}

@media (min-width: 960px) {
  .publication-top-nav {
    position: fixed;
    right: 0;
    left: 0;
    width: 100%;
  }

  .publication-top-nav__brand {
    width: calc(var(--publication-sidebar-width) - 2rem);
  }
}

@media (max-width: 720px) {
  .publication-top-nav__container {
    padding: 0 1rem;
  }
}
</style>
