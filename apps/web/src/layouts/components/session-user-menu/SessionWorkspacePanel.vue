<script setup lang="ts">
import type { SessionWorkspacePanelProps } from './typing'
import { WORKSPACE_TYPE } from '@haohaoxue/samepage-contracts'
import EntityAvatar from '@/components/entity-avatar/EntityAvatar.vue'

const props = defineProps<SessionWorkspacePanelProps>()
const emits = defineEmits<{
  create: []
  select: [workspaceId: string]
}>()

function getWorkspaceAvatarProps(workspace: SessionWorkspacePanelProps['workspaces'][number]) {
  if (workspace.type === WORKSPACE_TYPE.PERSONAL) {
    return {
      name: props.currentUser.displayName,
      src: props.currentUser.avatarUrl,
      alt: `${props.currentUser.displayName} 的头像`,
      shape: 'circle' as const,
      kind: 'user' as const,
    }
  }

  return {
    name: workspace.label,
    src: workspace.iconUrl,
    alt: `${workspace.label} 的图标`,
    shape: 'rounded' as const,
    kind: 'workspace' as const,
  }
}
</script>

<template>
  <div class="session-subpanel session-workspace-subpanel">
    <button
      type="button"
      class="session-workspace-create"
      :disabled="props.isCreatingWorkspace"
      @click.stop="emits('create')"
    >
      <span class="session-workspace-create__content">
        <span class="session-workspace-create__icon">
          <SvgIcon
            category="ui"
            :icon="props.isCreatingWorkspace ? 'spinner-orbit' : 'plus'"
            size="14px"
            :class="{ 'animate-spin': props.isCreatingWorkspace }"
          />
        </span>

        <span class="session-workspace-create__copy">
          <span class="session-workspace-create__title">
            创建团队
          </span>
        </span>
      </span>
    </button>

    <div class="session-subpanel-divider" />

    <ul class="session-workspace-list">
      <li
        v-for="workspace in props.workspaces"
        :key="workspace.id"
        class="session-workspace-option"
        :class="{ 'is-active': props.currentWorkspaceId === workspace.id }"
      >
        <button
          type="button"
          class="session-workspace-option__button"
          @click.stop="emits('select', workspace.id)"
        >
          <EntityAvatar
            v-bind="getWorkspaceAvatarProps(workspace)"
            :size="30"
            class="session-workspace-option__avatar"
          />

          <span class="session-workspace-option__copy">
            <span class="session-workspace-option__title">
              {{ workspace.label }}
            </span>

            <span
              v-if="workspace.description"
              class="session-workspace-option__description"
            >
              {{ workspace.description }}
            </span>
          </span>

          <span class="session-workspace-option__indicator">
            <SvgIcon
              category="ui"
              icon="check"
              size="14px"
              class="session-workspace-option__check"
              :class="{ 'is-visible': props.currentWorkspaceId === workspace.id }"
            />
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.session-subpanel {
  position: absolute;
  top: 50%;
  right: calc(100% + 14px);
  z-index: 5;
  transform: translateY(-50%);
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 92%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--brand-bg-surface-raised) 96%, transparent);
  box-shadow: var(--brand-shadow-floating);
  backdrop-filter: blur(16px);
}

.session-workspace-subpanel {
  width: 248px;
}

.session-subpanel-divider {
  height: 1px;
  margin-block: 0.5rem;
  background: color-mix(in srgb, var(--brand-border-base) 80%, transparent);
}

.session-workspace-create {
  display: flex;
  width: 100%;
  min-height: 2.75rem;
  align-items: center;
  appearance: none;
  border: 0;
  border-radius: 0.875rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0.5rem 0.625rem;
  text-align: left;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }

  &:hover:not(:disabled) {
    background: var(--brand-fill-light);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--brand-primary) 18%, transparent);
    outline-offset: 2px;
  }
}

.session-workspace-create__content {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
}

.session-workspace-create__icon {
  display: flex;
  width: 1.875rem;
  height: 1.875rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--brand-fill-light) 84%, var(--brand-bg-surface-raised));
  color: color-mix(in srgb, var(--brand-text-primary) 76%, var(--brand-primary) 24%);
}

.session-workspace-create__copy,
.session-workspace-option__copy {
  display: flex;
  min-width: 0;
  flex: 1 1 0%;
  flex-direction: column;
  justify-content: center;
  gap: 0.3125rem;
}

.session-workspace-create__title,
.session-workspace-option__title {
  overflow: hidden;
  color: var(--brand-text-primary);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-workspace-list {
  display: flex;
  max-height: min(19rem, calc(100vh - 12rem));
  flex-direction: column;
  gap: 0.375rem;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.session-workspace-option {
  list-style: none;
}

.session-workspace-option__button {
  display: flex;
  width: 100%;
  min-height: 3.125rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.625rem;
  border: 0;
  border-radius: 0.875rem;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  &:hover {
    background: var(--brand-fill-light);
  }
}

.session-workspace-option.is-active .session-workspace-option__button {
  background: color-mix(in srgb, var(--brand-fill-light) 86%, white 14%);
}

.session-workspace-option__button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--brand-primary) 18%, transparent);
  outline-offset: 2px;
}

.session-workspace-option__avatar {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 64%, transparent);
}

.session-workspace-option__description {
  overflow: hidden;
  color: var(--brand-text-secondary);
  font-size: 12px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-workspace-option__indicator {
  display: flex;
  width: 1rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.session-workspace-option__check {
  color: var(--brand-primary);
  opacity: 0;
  transition: opacity 0.2s ease;

  &.is-visible {
    opacity: 1;
  }
}
</style>
