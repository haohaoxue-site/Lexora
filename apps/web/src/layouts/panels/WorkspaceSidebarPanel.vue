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
</script>

<template>
  <aside class="workspace-sidebar" :class="getSidebarStateClass()">
    <div class="flex h-full flex-col py-4">
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
          <div v-if="!props.isCollapsed" class="min-w-0">
            <div class="truncate text-sm font-bold tracking-tight">
              SamePage
            </div>
          </div>
        </RouterLink>
      </div>

      <ElScrollbar class="min-h-0 flex-1 pt-2">
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
                size="2rem"
                class="workspace-sidebar__nav-icon-image"
              />
            </div>

            <div v-if="!props.isCollapsed" class="min-w-0">
              <div class="truncate text-sm font-semibold">
                {{ item.label }}
              </div>
            </div>
          </RouterLink>
        </nav>
      </ElScrollbar>

      <div class="workspace-sidebar__footer" :class="getSidebarStateClass()">
        <button
          type="button"
          class="workspace-sidebar__toggle"
          :class="getSidebarStateClass()"
          :title="props.isCollapsed ? '展开导航' : '收起导航'"
          @click="$emit('toggle')"
        >
          <span class="flex items-center gap-3">
            <span class="workspace-sidebar__toggle-icon">
              <SvgIcon category="ui" :icon="getToggleGlyphClass()" size="1rem" />
            </span>
            <span v-if="!props.isCollapsed" class="text-sm font-medium">
              收起侧栏
            </span>
          </span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.workspace-sidebar {
  flex-shrink: 0;
  height: 100vh;
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  background: var(--brand-bg-sidebar);
  transition:
    width 0.3s ease-out,
    padding 0.3s ease-out,
    border-color 0.3s ease-out;

  &.expanded {
    width: 16.5rem;
    padding-inline: 1rem;
  }

  &.collapsed {
    width: 6rem;
    padding-inline: 0.75rem;
  }

  .workspace-sidebar__brand-wrap {
    &.expanded {
      padding: 0 0.5rem 1rem;
    }

    &.collapsed {
      padding: 0 0.25rem 1.25rem;
    }
  }

  .workspace-sidebar__brand-link {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    color: var(--brand-text-primary);
    text-decoration: none;

    &.collapsed {
      justify-content: center;
      width: 3rem;
      height: 3rem;
      margin-inline: auto;
    }
  }

  .workspace-sidebar__brand-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
  }

  .workspace-sidebar__brand-mark-image {
    display: block;
  }

  .workspace-sidebar__nav {
    &.expanded {
      padding-right: 0.25rem;

      > * + * {
        margin-top: 0.5rem;
      }
    }

    &.collapsed {
      padding-inline: 0.25rem;

      > * + * {
        margin-top: 0.75rem;
      }
    }
  }

  .workspace-sidebar__nav-item {
    border: 1px solid transparent;
    border-radius: 1rem;
    color: var(--brand-text-secondary);
    text-decoration: none;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease;

    &.expanded {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
    }

    &.collapsed {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 3.5rem;
      padding-inline: 0;
    }

    &.active {
      border-color: color-mix(in srgb, var(--brand-primary) 10%, transparent);
      color: var(--brand-primary);
      background: var(--brand-bg-surface);
      box-shadow: 0 1px 2px 0 color-mix(in srgb, var(--brand-text-primary) 5%, transparent);
    }

    &.idle {
      &:hover {
        border-color: color-mix(in srgb, var(--brand-border-base) 80%, transparent);
        color: var(--brand-text-primary);
        background: var(--brand-bg-surface-raised);
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
    border-radius: 1rem;
    transition:
      color 0.2s ease,
      background-color 0.2s ease,
      transform 0.2s ease;

    &.active {
      background: color-mix(in srgb, var(--brand-primary) 6%, transparent);
      transform: translateY(-1px);
    }

    &.idle {
      background: color-mix(in srgb, var(--brand-bg-surface) 88%, white);
    }
  }

  .workspace-sidebar__nav-icon-image {
    display: block;
  }

  .workspace-sidebar__nav-item.idle:hover {
    .workspace-sidebar__nav-icon.idle {
      transform: translateY(-1px);
    }
  }

  .workspace-sidebar__footer {
    margin-top: 1rem;
    padding: 0.75rem 0.25rem 0;
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 60%, transparent);

    &.expanded {
      margin-inline: 0.5rem;
    }

    &.collapsed {
      margin-inline: 0.25rem;
    }
  }

  .workspace-sidebar__toggle {
    display: flex;
    align-items: center;
    width: 100%;
    height: 3rem;
    border: none;
    border-radius: 1rem;
    color: var(--brand-text-secondary);
    background: transparent;
    transition:
      color 0.2s ease,
      background-color 0.2s ease;

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent);
    }

    &.expanded {
      padding-inline: 0.75rem;

      &:hover {
        color: var(--brand-text-primary);
        background: var(--brand-bg-surface);
      }
    }

    &.collapsed {
      justify-content: center;
      padding: 0;

      &:hover {
        color: var(--brand-primary);
        background: var(--brand-bg-surface);
      }
    }
  }

  .workspace-sidebar__toggle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 50%, transparent);
    border-radius: 0.75rem;
    font-size: 15px;
    background: var(--brand-bg-surface-raised);
  }
}
</style>
