<script setup lang="ts">
import type { SidebarPanelBrand, SidebarPanelItem } from './typing'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SessionUserMenu from '@/layouts/components/SessionUserMenu.vue'

const props = withDefaults(defineProps<{
  brand: SidebarPanelBrand
  items: SidebarPanelItem[]
  isCollapsed?: boolean
}>(), {
  isCollapsed: false,
})

const emit = defineEmits<{
  toggle: []
}>()

const route = useRoute()
const sidebarStateClass = computed(() => props.isCollapsed ? 'collapsed' : 'expanded')
const shouldShowBrand = computed(() => !props.isCollapsed)
const repositoryUrl = 'https://github.com/haohaoxue-site/SamePage-AI'

function getItemStateClass(isActive: boolean) {
  return isActive ? 'active' : 'idle'
}

function isNavigationItemActive(item: SidebarPanelItem) {
  const routeName = route.name ?? ''
  return routeName === item.name
    || route.matched.some(matchedRoute => matchedRoute.name === item.name)
    || (item.name === 'home' && routeName === 'chat')
}

function getItemIconSrc(item: SidebarPanelItem, isActive: boolean) {
  return isActive ? item.activeIcon ?? item.icon : item.icon
}

function getToggleGlyphClass() {
  return props.isCollapsed
    ? 'sidebar-open'
    : 'sidebar-close'
}

function handleToggle() {
  emit('toggle')
}
</script>

<template>
  <aside class="sidebar-panel" :class="sidebarStateClass">
    <div
      class="sidebar-panel__brand-wrap has-toggle"
      :class="[sidebarStateClass]"
    >
      <RouterLink
        v-if="shouldShowBrand"
        :to="props.brand.to"
        class="sidebar-panel__brand-link"
        aria-label="打开同页入口"
      >
        <img
          :src="props.brand.iconSrc"
          alt=""
          aria-hidden="true"
          class="sidebar-panel__brand-image"
        >
      </RouterLink>

      <button
        type="button"
        class="sidebar-panel__toggle"
        :class="sidebarStateClass"
        @click="handleToggle"
      >
        <span class="sidebar-panel__toggle-icon">
          <SvgIcon category="ui" :icon="getToggleGlyphClass()" size="1.25rem" />
        </span>
      </button>
    </div>

    <ElScrollbar class="min-h-0 flex-1">
      <nav class="sidebar-panel__nav" :class="sidebarStateClass">
        <RouterLink
          v-for="item in props.items"
          :key="item.name"
          v-slot="{ href, navigate }"
          :to="item.to"
          custom
        >
          <a
            :href="href"
            class="sidebar-panel__nav-item"
            :class="[sidebarStateClass, getItemStateClass(isNavigationItemActive(item))]"
            @click="navigate"
          >
            <div class="sidebar-panel__nav-icon" :class="getItemStateClass(isNavigationItemActive(item))">
              <SvgIcon
                :category="item.iconCategory"
                :icon="getItemIconSrc(item, isNavigationItemActive(item))"
                size="2.75rem"
                class="sidebar-panel__nav-icon-image"
              />
            </div>

            <div class="sidebar-panel__nav-label truncate text-sm font-medium">
              {{ item.label }}
            </div>
          </a>
        </RouterLink>
      </nav>
    </ElScrollbar>

    <nav class="sidebar-panel__external-nav" aria-label="项目链接">
      <a
        :href="repositoryUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="sidebar-panel__external-link"
        :class="sidebarStateClass"
        aria-label="打开 SamePage AI GitHub 项目地址"
      >
        <span class="sidebar-panel__external-icon">
          <SvgIcon category="ui" icon="brand-github" size="18px" />
        </span>
        <span
          v-if="!props.isCollapsed"
          class="sidebar-panel__external-label truncate text-sm font-medium"
        >
          GitHub
        </span>
      </a>
    </nav>

    <footer class="sidebar-panel__footer" :class="sidebarStateClass">
      <SessionUserMenu
        :is-collapsed="props.isCollapsed"
      />
    </footer>
  </aside>
</template>

<style scoped lang="scss">
.sidebar-panel {
  --sidebar-panel-row-transition: 0.18s ease-out;

  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: var(--app-shell-height);
  overflow: hidden;
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  background: var(--brand-bg-sidebar);
  transition:
    width 0.3s ease-out,
    border-color 0.3s ease-out;

  &.expanded {
    width: var(--sidebar-panel-expanded-width);
  }

  &.collapsed {
    width: var(--sidebar-panel-rail-width);
  }

  .sidebar-panel__brand-wrap {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    height: var(--sidebar-panel-brand-height);
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);

    &.has-toggle {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 3rem;
      padding-right: 0.75rem;
    }

    &.collapsed.has-toggle {
      grid-template-columns: 1fr;
      justify-items: center;
      padding-right: 0;
    }
  }

  .sidebar-panel__brand-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    margin-left: 1.125rem;
    border-radius: 0.875rem;
    text-decoration: none;

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent);
    }
  }

  .sidebar-panel__brand-image {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 0.875rem;
    object-fit: cover;
  }

  .sidebar-panel__nav-label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    opacity: 1;
    transform: translateX(0);
    transition:
      opacity var(--sidebar-panel-row-transition),
      transform 0.22s ease-out;
  }

  &.collapsed {
    .sidebar-panel__nav-label {
      opacity: 0;
      transform: translateX(-0.25rem);
    }
  }

  .sidebar-panel__nav {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .sidebar-panel__nav-item {
    --sidebar-panel-row-bg: transparent;
    --sidebar-panel-row-bg-opacity: 0;
    --sidebar-panel-indicator-opacity: 0;
    --sidebar-panel-indicator-scale: 0.62;

    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: var(--sidebar-panel-rail-width) minmax(0, 1fr);
    align-items: center;
    width: 100%;
    height: var(--sidebar-panel-row-height);
    overflow: hidden;
    border: 0;
    border-radius: 0;
    color: var(--brand-text-secondary);
    text-decoration: none;
    transition:
      color 0.2s ease;

    &::before,
    &::after {
      position: absolute;
      content: '';
      pointer-events: none;
    }

    &::before {
      top: 0.6875rem;
      bottom: 0.6875rem;
      left: 0;
      z-index: 2;
      width: 3px;
      background: var(--brand-primary);
      opacity: var(--sidebar-panel-indicator-opacity);
      transform: scaleY(var(--sidebar-panel-indicator-scale));
      transform-origin: center;
      transition:
        opacity var(--sidebar-panel-row-transition),
        transform var(--sidebar-panel-row-transition);
    }

    &::after {
      inset: 0;
      z-index: 0;
      background: var(--sidebar-panel-row-bg);
      opacity: var(--sidebar-panel-row-bg-opacity);
      transition: opacity var(--sidebar-panel-row-transition);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--brand-primary) 22%, transparent);
      outline-offset: -2px;
    }

    &.expanded {
      &.active {
        --sidebar-panel-row-bg: color-mix(in srgb, var(--brand-primary) 4%, transparent);
        --sidebar-panel-row-bg-opacity: 1;
      }

      &.idle {
        &:hover {
          --sidebar-panel-row-bg: color-mix(in srgb, var(--brand-bg-surface) 72%, transparent);
          --sidebar-panel-row-bg-opacity: 1;
        }
      }
    }

    &.collapsed {
      .sidebar-panel__nav-label {
        opacity: 0;
        transform: translateX(-0.25rem);
      }
    }

    &.active {
      --sidebar-panel-indicator-opacity: 1;
      --sidebar-panel-indicator-scale: 1;

      color: var(--brand-primary);
    }

    &.idle {
      &:hover {
        color: var(--brand-text-primary);
      }
    }
  }

  .sidebar-panel__nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    justify-self: center;
    width: 2.75rem;
    height: 2.75rem;
    z-index: 1;
    transition: color 0.2s ease;
  }

  .sidebar-panel__nav-icon-image {
    display: block;
  }

  .sidebar-panel__nav-label {
    z-index: 1;
  }

  .sidebar-panel__external-nav {
    flex-shrink: 0;
    padding-block: 0.5rem;
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
  }

  .sidebar-panel__external-link {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    height: 2.5rem;
    overflow: hidden;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    color: var(--brand-text-primary);
    text-decoration: none;
    transition:
      color 0.2s ease,
      background 0.2s ease;

    &:hover {
      color: var(--brand-text-primary);
      background: color-mix(in srgb, var(--brand-fill-lighter) 76%, var(--brand-text-primary) 6%);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent);
    }

    &.collapsed {
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      margin-inline: auto;
      padding: 0;

      &:hover {
        background: color-mix(in srgb, var(--brand-fill-lighter) 76%, var(--brand-text-primary) 6%);
      }
    }
  }

  .sidebar-panel__external-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.25rem;
    height: 2.25rem;
  }

  .sidebar-panel__external-label {
    flex: 1 1 0%;
    min-width: 0;
    line-height: 1;
    text-align: left;
  }

  .sidebar-panel__toggle {
    cursor: pointer;
    display: grid;
    place-items: center;
    justify-self: end;
    width: 2.75rem;
    height: 2.75rem;
    border: none;
    border-radius: 0.5rem;
    color: var(--brand-text-secondary);
    background: transparent;
    transition:
      color 0.2s ease,
      background 0.2s ease;

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent);
    }

    &.expanded {
      &:hover {
        color: var(--brand-text-primary);
        background: color-mix(in srgb, var(--brand-bg-surface) 72%, transparent);
      }
    }

    &.collapsed {
      justify-self: center;

      &:hover {
        color: var(--brand-primary);
        background: color-mix(in srgb, var(--brand-primary) 6%, transparent);
      }
    }
  }

  .sidebar-panel__toggle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    justify-self: center;
    font-size: 20px;
  }

  .sidebar-panel__footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.5rem;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
    box-sizing: border-box;

    &.expanded {
      flex-basis: var(--default-footer-height);
      height: var(--default-footer-height);

      :deep(.session-user-sidebar-trigger) {
        height: 2.5rem;
        padding-block: 0.125rem;
      }
    }

    &.collapsed {
      grid-template-columns: 1fr;
      justify-items: center;
      gap: 0.625rem;
      padding-block: 0.75rem;
    }
  }
}
</style>
