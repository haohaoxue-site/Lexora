<script setup lang="ts">
import type { WorkspaceNavigationItem } from '@/router/typing'
import { useRoute } from 'vue-router'

const props = defineProps<{
  navigationItems: WorkspaceNavigationItem[]
  isCollapsed: boolean
}>()

defineEmits<{
  toggle: []
}>()

const route = useRoute()

function isActive(item: WorkspaceNavigationItem) {
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

function getSidebarStateClass() {
  return props.isCollapsed ? 'collapsed' : 'expanded'
}

function getItemStateClass(item: WorkspaceNavigationItem) {
  return isActive(item) ? 'active' : 'idle'
}

function getItemIconSrc(item: WorkspaceNavigationItem) {
  return isActive(item) ? item.activeIcon ?? item.icon : item.icon
}

function getBrandLinkStateClass() {
  return props.isCollapsed ? 'collapsed' : ''
}

function getToggleGlyphClass() {
  return props.isCollapsed
    ? 'sidebar-open'
    : 'sidebar-close'
}

function getToggleLabel() {
  return props.isCollapsed ? '展开导航' : '收起导航'
}
</script>

<template>
  <aside class="workspace-sidebar" :class="getSidebarStateClass()">
    <div class="flex h-full flex-col">
      <div class="workspace-sidebar__brand-wrap" :class="getSidebarStateClass()">
        <RouterLink
          to="/home"
          class="workspace-sidebar__brand-link"
          :class="getBrandLinkStateClass()"
          :title="props.isCollapsed ? 'SamePage Workspace' : undefined"
        >
          <div class="workspace-sidebar__brand-mark">
            <SvgIcon category="nav" icon="workspace" size="2.75rem" class="workspace-sidebar__brand-mark-image" />
          </div>
          <div class="workspace-sidebar__brand-label truncate text-base font-bold">
            SamePage
          </div>
        </RouterLink>
      </div>

      <ElScrollbar class="min-h-0 flex-1">
        <nav class="workspace-sidebar__nav" :class="getSidebarStateClass()">
          <RouterLink
            v-for="item in props.navigationItems"
            :key="item.id"
            :to="item.to"
            class="workspace-sidebar__nav-item"
            :class="[getSidebarStateClass(), getItemStateClass(item)]"
            :title="props.isCollapsed ? item.label : undefined"
          >
            <div class="workspace-sidebar__nav-icon" :class="getItemStateClass(item)">
              <SvgIcon
                :category="item.iconCategory"
                :icon="getItemIconSrc(item)"
                size="2.75rem"
                class="workspace-sidebar__nav-icon-image"
              />
            </div>

            <div class="workspace-sidebar__nav-label truncate text-sm font-medium">
              {{ item.label }}
            </div>
          </RouterLink>
        </nav>
      </ElScrollbar>

      <div class="workspace-sidebar__footer" :class="getSidebarStateClass()">
        <button
          type="button"
          class="workspace-sidebar__toggle"
          :class="getSidebarStateClass()"
          :aria-label="getToggleLabel()"
          :title="getToggleLabel()"
          @click="$emit('toggle')"
        >
          <span class="workspace-sidebar__toggle-icon">
            <SvgIcon category="ui" :icon="getToggleGlyphClass()" size="1.25rem" />
          </span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.workspace-sidebar {
  --workspace-sidebar-brand-height: 5.75rem;
  --workspace-sidebar-expanded-width: 13rem;
  --workspace-sidebar-rail-width: 5rem;
  --workspace-sidebar-row-height: 3.25rem;
  --workspace-sidebar-row-transition: 0.18s ease-out;

  flex-shrink: 0;
  height: 100vh;
  overflow: hidden;
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  background: var(--brand-bg-sidebar);
  transition:
    width 0.3s ease-out,
    border-color 0.3s ease-out;

  &.expanded {
    width: var(--workspace-sidebar-expanded-width);
  }

  &.collapsed {
    width: var(--workspace-sidebar-rail-width);
  }

  .workspace-sidebar__brand-wrap {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    height: var(--workspace-sidebar-brand-height);
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
  }

  .workspace-sidebar__brand-link {
    display: grid;
    grid-template-columns: var(--workspace-sidebar-rail-width) minmax(0, 1fr);
    align-items: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    color: var(--brand-text-primary);
    text-decoration: none;

    &.collapsed {
      .workspace-sidebar__brand-label {
        opacity: 0;
        transform: translateX(-0.25rem);
      }
    }
  }

  .workspace-sidebar__brand-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    justify-self: center;
  }

  .workspace-sidebar__brand-mark-image {
    display: block;
  }

  .workspace-sidebar__brand-label,
  .workspace-sidebar__nav-label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    opacity: 1;
    transform: translateX(0);
    transition:
      opacity var(--workspace-sidebar-row-transition),
      transform 0.22s ease-out;
  }

  &.collapsed {
    .workspace-sidebar__brand-label,
    .workspace-sidebar__nav-label {
      opacity: 0;
      transform: translateX(-0.25rem);
    }
  }

  .workspace-sidebar__nav {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .workspace-sidebar__nav-item {
    --workspace-sidebar-row-bg: transparent;
    --workspace-sidebar-row-bg-opacity: 0;
    --workspace-sidebar-indicator-opacity: 0;
    --workspace-sidebar-indicator-scale: 0.62;

    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: var(--workspace-sidebar-rail-width) minmax(0, 1fr);
    align-items: center;
    width: 100%;
    height: var(--workspace-sidebar-row-height);
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
      opacity: var(--workspace-sidebar-indicator-opacity);
      transform: scaleY(var(--workspace-sidebar-indicator-scale));
      transform-origin: center;
      transition:
        opacity var(--workspace-sidebar-row-transition),
        transform var(--workspace-sidebar-row-transition);
    }

    &::after {
      inset: 0;
      z-index: 0;
      background: var(--workspace-sidebar-row-bg);
      opacity: var(--workspace-sidebar-row-bg-opacity);
      transition: opacity var(--workspace-sidebar-row-transition);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--brand-primary) 22%, transparent);
      outline-offset: -2px;
    }

    &.expanded {
      &.active {
        --workspace-sidebar-row-bg: color-mix(in srgb, var(--brand-primary) 4%, transparent);
        --workspace-sidebar-row-bg-opacity: 1;
      }

      &.idle {
        &:hover {
          --workspace-sidebar-row-bg: color-mix(in srgb, var(--brand-bg-surface) 72%, transparent);
          --workspace-sidebar-row-bg-opacity: 1;
        }
      }
    }

    &.collapsed {
      .workspace-sidebar__nav-label {
        opacity: 0;
        transform: translateX(-0.25rem);
      }
    }

    &.active {
      --workspace-sidebar-indicator-opacity: 1;
      --workspace-sidebar-indicator-scale: 1;

      color: var(--brand-primary);
    }

    &.idle {
      &:hover {
        color: var(--brand-text-primary);
      }
    }
  }

  .workspace-sidebar__nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    justify-self: center;
    z-index: 1;
    transition: color 0.2s ease;
  }

  .workspace-sidebar__nav-icon-image {
    display: block;
  }

  .workspace-sidebar__nav-label {
    z-index: 1;
  }

  .workspace-sidebar__footer {
    margin-top: 1rem;
    padding: 0.75rem 0 1rem;
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 60%, transparent);
  }

  .workspace-sidebar__toggle {
    cursor: pointer;
    display: grid;
    align-items: center;
    width: 100%;
    height: 3rem;
    border: none;
    border-radius: 0;
    color: var(--brand-text-secondary);
    background: transparent;
    transition:
      color 0.2s ease;

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent);
    }

    &.expanded {
      &:hover {
        color: var(--brand-text-primary);
      }
    }

    &.collapsed {
      &:hover {
        color: var(--brand-primary);
      }
    }
  }

  .workspace-sidebar__toggle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    justify-self: center;
    font-size: 20px;
  }
}
</style>
