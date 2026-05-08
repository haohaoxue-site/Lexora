<script setup lang="ts">
import type { SidebarPanelBrand, SidebarPanelItem } from './typing'
import { computed } from 'vue'
import SessionNotificationBell from '@/layouts/components/session-notification-bell/SessionNotificationBell.vue'
import SessionUserMenu from '@/layouts/components/SessionUserMenu.vue'

const props = withDefaults(defineProps<{
  brand: SidebarPanelBrand
  items: SidebarPanelItem[]
  isCollapsed?: boolean
  showToggle?: boolean
}>(), {
  isCollapsed: false,
  showToggle: false,
})

defineEmits<{
  toggle: []
}>()

const sidebarStateClass = computed(() => props.isCollapsed ? 'collapsed' : 'expanded')
const shouldShowBrand = computed(() => !props.isCollapsed || !props.showToggle)

function getItemStateClass(isActive: boolean) {
  return isActive ? 'active' : 'idle'
}

function getItemIconSrc(item: SidebarPanelItem, isActive: boolean) {
  return isActive ? item.activeIcon ?? item.icon : item.icon
}

function getToggleGlyphClass() {
  return props.isCollapsed
    ? 'sidebar-open'
    : 'sidebar-close'
}
</script>

<template>
  <aside class="sidebar-panel" :class="sidebarStateClass">
    <div class="flex h-full flex-col">
      <div
        class="sidebar-panel__brand-wrap"
        :class="[sidebarStateClass, { 'has-toggle': props.showToggle }]"
      >
        <RouterLink
          v-if="shouldShowBrand"
          :to="props.brand.to"
          class="sidebar-panel__brand-link"
        >
          <div class="sidebar-panel__brand-mark">
            <SvgIcon
              :category="props.brand.iconCategory"
              :icon="props.brand.icon"
              size="2.75rem"
              class="sidebar-panel__brand-mark-image"
            />
          </div>
          <div class="sidebar-panel__brand-text">
            <div class="sidebar-panel__brand-label truncate text-base font-bold">
              {{ props.brand.label }}
            </div>
            <div
              v-if="props.brand.meta"
              class="sidebar-panel__brand-meta truncate text-xs font-medium"
            >
              {{ props.brand.meta }}
            </div>
          </div>
        </RouterLink>

        <button
          v-if="props.showToggle"
          type="button"
          class="sidebar-panel__toggle"
          :class="sidebarStateClass"
          @click="$emit('toggle')"
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
            v-slot="{ href, navigate, isActive }"
            :to="item.to"
            custom
          >
            <a
              :href="href"
              class="sidebar-panel__nav-item"
              :class="[sidebarStateClass, getItemStateClass(isActive)]"
              @click="navigate"
            >
              <div class="sidebar-panel__nav-icon" :class="getItemStateClass(isActive)">
                <SvgIcon
                  :category="item.iconCategory"
                  :icon="getItemIconSrc(item, isActive)"
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

      <div class="sidebar-panel__footer" :class="sidebarStateClass">
        <div class="sidebar-panel__session" :class="sidebarStateClass">
          <SessionUserMenu
            :is-collapsed="props.isCollapsed"
          />
          <SessionNotificationBell
            :is-collapsed="props.isCollapsed"
          />
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.sidebar-panel {
  --sidebar-panel-row-transition: 0.18s ease-out;

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
    gap: 0.625rem;
    width: 100%;
    height: 100%;
    min-width: 0;
    padding-left: 1.125rem;
    color: var(--brand-text-primary);
    text-decoration: none;
  }

  .sidebar-panel__brand-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
  }

  .sidebar-panel__brand-mark-image {
    display: block;
  }

  .sidebar-panel__brand-text {
    min-width: 0;
  }

  .sidebar-panel__brand-label,
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

  .sidebar-panel__brand-meta {
    min-width: 0;
    margin-top: 0.125rem;
    overflow: hidden;
    color: var(--brand-text-secondary);
    white-space: nowrap;
  }

  &.collapsed {
    .sidebar-panel__brand-label,
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
    flex-shrink: 0;
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
  }

  .sidebar-panel__session {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.5rem;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;

    &.collapsed {
      grid-template-columns: 1fr;
      justify-items: center;
      gap: 0.625rem;
      padding-inline: 0;
    }
  }
}
</style>
