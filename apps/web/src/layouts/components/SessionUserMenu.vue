<script setup lang="ts">
import EntityAvatar from '@/components/entity-avatar/EntityAvatar.vue'
import SessionAppearancePanel from './session-user-menu/SessionAppearancePanel.vue'
import SessionWorkspacePanel from './session-user-menu/SessionWorkspacePanel.vue'
import { useSessionUserMenu } from './session-user-menu/useSessionUserMenu'
import TeamSettingsDialog from './team-settings-dialog/TeamSettingsDialog.vue'
import WorkspaceCreateDialog from './workspace-create-dialog/WorkspaceCreateDialog.vue'

const props = withDefaults(defineProps<{
  showContextSwitch?: boolean
}>(), {
  showContextSwitch: true,
})

const {
  menuVisible,
  appearanceMenuVisible,
  workspaceMenuVisible,
  teamSettingsDialogVisible,
  workspaceCreateDialogVisible,
  isCreatingWorkspace,
  isLoggingOut,
  appearanceOptions,
  currentUser,
  contextSwitchAction,
  currentAppearance,
  currentAppearanceLabel,
  isSavingAppearance,
  currentWorkspaceLabel,
  currentWorkspaceId,
  currentTeamWorkspace,
  switchableWorkspaces,
  toggleAppearanceMenu,
  toggleWorkspaceMenu,
  openWorkspaceCreateDialog,
  openTeamSettingsDialog,
  handleAppearanceSelect,
  handleWorkspaceCreate,
  switchContext,
  openUserSettings,
  handleLogout,
  handleWorkspaceSelect,
  getLogoutIconName,
} = useSessionUserMenu({
  showContextSwitch: props.showContextSwitch,
})
</script>

<template>
  <ElPopover
    v-model:visible="menuVisible"
    trigger="click"
    placement="bottom-end"
    :width="256"
    :offset="12"
    :show-arrow="false"
    popper-class="session-user-menu-popper"
  >
    <template #reference>
      <ElButton
        circle
        class="session-user-avatar-trigger"
      >
        <EntityAvatar
          :name="currentUser.displayName"
          :src="currentUser.avatarUrl"
          :alt="`${currentUser.displayName} 的头像`"
          :size="40"
          shape="circle"
          kind="user"
          class="session-user-avatar-trigger__avatar"
        />
      </ElButton>
    </template>

    <div class="session-user-menu">
      <div class="session-user-profile">
        <EntityAvatar
          :name="currentUser.displayName"
          :src="currentUser.avatarUrl"
          :alt="`${currentUser.displayName} 的头像`"
          :size="40"
          shape="circle"
          kind="user"
          class="session-user-profile__avatar"
        />

        <div class="session-user-profile__meta">
          <div class="truncate text-[13px] font-semibold text-main">
            {{ currentUser.displayName }}
          </div>
          <div class="truncate pt-0.5 text-xs text-secondary">
            {{ currentUser.email }}
          </div>
        </div>
      </div>

      <ElButton
        v-if="contextSwitchAction"
        text
        class="session-context-switch session-menu-button-fill"
        @click="switchContext"
      >
        <span class="session-context-switch__content">
          <span class="session-context-switch__icon">
            <SvgIcon :category="contextSwitchAction.iconCategory" :icon="contextSwitchAction.icon" size="14px" />
          </span>

          <span class="session-context-switch__label">
            {{ contextSwitchAction.label }}
          </span>

          <SvgIcon category="ui" icon="chevron-right" size="12px" class="text-primary-a70" />
        </span>
      </ElButton>

      <div class="session-user-divider" />

      <div class="session-menu-subpanel-anchor">
        <ElButton
          text
          class="session-user-menu-item session-user-menu-entry session-menu-button-fill"
          :class="{ 'is-active': workspaceMenuVisible }"
          @click.stop="toggleWorkspaceMenu"
        >
          <span class="session-user-menu-entry__content">
            <SvgIcon
              category="ui"
              icon="workspace-node"
              size="14px"
              class="session-user-menu-entry__icon"
            />

            <span class="session-user-menu-entry__summary">
              <span class="session-user-menu-entry__title">
                切换空间
              </span>

              <span class="session-user-menu-entry__current">
                {{ currentWorkspaceLabel }}
              </span>
            </span>

            <SvgIcon
              category="ui"
              icon="chevron-right"
              size="14px"
              class="session-user-menu-entry__chevron"
              :class="workspaceMenuVisible ? 'translate-x-0.5 text-primary' : ''"
            />
          </span>
        </ElButton>

        <SessionWorkspacePanel
          v-if="workspaceMenuVisible"
          :current-user="currentUser"
          :current-workspace-id="currentWorkspaceId"
          :is-creating-workspace="isCreatingWorkspace"
          :workspaces="switchableWorkspaces"
          @create="openWorkspaceCreateDialog"
          @select="handleWorkspaceSelect"
        />
      </div>

      <ElButton
        v-if="currentTeamWorkspace"
        text
        class="session-user-menu-item session-menu-button-fill"
        @click="openTeamSettingsDialog"
      >
        <span class="session-user-menu-item__content">
          <SvgIcon category="ui" icon="user-group" size="14px" class="session-user-menu-item__icon" />
          <span class="leading-none">团队设置</span>
        </span>
      </ElButton>

      <div class="session-user-divider" />

      <div class="session-menu-subpanel-anchor">
        <ElButton
          text
          class="session-user-menu-item session-user-menu-entry session-menu-button-fill"
          :class="{ 'is-active': appearanceMenuVisible }"
          :disabled="isSavingAppearance"
          @click.stop="toggleAppearanceMenu"
        >
          <span class="session-user-menu-entry__content">
            <SvgIcon category="ui" icon="contrast" size="14px" class="session-user-menu-entry__icon" />

            <span class="session-user-menu-entry__summary">
              <span class="session-user-menu-entry__title">
                外观
              </span>

              <span class="session-user-menu-entry__current">
                {{ currentAppearanceLabel }}
              </span>
            </span>

            <SvgIcon
              category="ui"
              icon="chevron-right"
              size="14px"
              class="session-user-menu-entry__chevron"
              :class="appearanceMenuVisible ? 'translate-x-0.5 text-primary' : ''"
            />
          </span>
        </ElButton>

        <SessionAppearancePanel
          v-if="appearanceMenuVisible"
          :current-appearance="currentAppearance"
          :is-saving="isSavingAppearance"
          :options="appearanceOptions"
          @select="handleAppearanceSelect"
        />
      </div>

      <div class="session-user-divider" />

      <ElButton
        text
        class="session-user-menu-item session-menu-button-fill"
        @click="openUserSettings"
      >
        <span class="session-user-menu-item__content">
          <SvgIcon category="ui" icon="settings-gear" size="14px" class="session-user-menu-item__icon" />
          <span class="leading-none">个人设置</span>
        </span>
      </ElButton>

      <div class="session-user-divider" />

      <ElButton
        text
        class="session-user-menu-item session-user-logout session-menu-button-fill"
        :disabled="isLoggingOut"
        @click="handleLogout"
      >
        <span class="session-user-menu-item__content">
          <SvgIcon
            category="ui"
            :icon="getLogoutIconName()"
            size="14px"
            class="session-user-menu-item__icon"
            :class="{ 'animate-spin': isLoggingOut }"
          />
          <span class="leading-none">{{ isLoggingOut ? '退出中...' : '退出登录' }}</span>
        </span>
      </ElButton>
    </div>
  </ElPopover>

  <WorkspaceCreateDialog
    v-model="workspaceCreateDialogVisible"
    :is-submitting="isCreatingWorkspace"
    @submit="handleWorkspaceCreate"
  />

  <TeamSettingsDialog
    v-model="teamSettingsDialogVisible"
    :workspace="currentTeamWorkspace"
  />
</template>

<style scoped lang="scss">
@mixin session-menu-button-base($text-color) {
  margin-left: 0;
  width: 100%;
  height: 2.75rem;
  justify-content: flex-start;
  border-radius: 0.75rem;
  padding-inline: 0.5rem;
  padding-block: 0;
  font-size: 0.78125rem;
  line-height: 1;
  --el-button-text-color: #{$text-color};
}

.session-user-menu {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

:global(.session-user-menu-popper.el-popover) {
  position: relative;
  overflow: visible;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 92%, transparent);
  border-radius: 20px;
  background: color-mix(in srgb, var(--brand-bg-surface-raised) 96%, transparent);
  box-shadow: var(--brand-shadow-floating);
  backdrop-filter: blur(16px);
}

.session-user-profile {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 1px;
}

.session-user-profile__avatar {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 70%, transparent);
}

.session-user-profile__meta {
  flex: 1 1 0%;
  min-width: 0;
  padding-top: 1px;
}

.session-user-divider {
  height: 1px;
  background: color-mix(in srgb, var(--brand-border-base) 80%, transparent);
}

.session-context-switch {
  margin-left: 0;
  width: 100%;
  min-height: 2.5rem;
  justify-content: flex-start;
  border: 1px solid color-mix(in srgb, var(--brand-primary) 12%, transparent);
  border-radius: 0.75rem;
  padding: 0.375rem 0.5rem;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-surface-raised)),
    var(--brand-bg-surface-raised)
  );
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.session-context-switch:hover {
  border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--brand-primary) 10%, var(--brand-bg-surface-raised)),
    var(--brand-bg-surface-raised)
  );
}

.session-menu-button-fill > :deep(span) {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
}

.session-context-switch__content,
.session-user-menu-entry__content,
.session-user-menu-item__content {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  height: 100%;
  text-align: left;
}

.session-context-switch__icon,
.session-user-menu-entry__icon,
.session-user-menu-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  font-size: 14px;
}

.session-context-switch__icon {
  color: var(--brand-primary);
}

.session-context-switch__label {
  flex: 1 1 0%;
  min-width: 0;
  overflow: hidden;
  color: var(--brand-text-primary);
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-menu-subpanel-anchor {
  position: relative;
}

.session-user-menu-entry,
.session-user-menu-item {
  @include session-menu-button-base(var(--brand-text-primary));
}

.session-user-menu-entry:hover,
.session-user-menu-item:hover {
  --el-fill-color-light: var(--brand-fill-light);
  --el-button-text-color: var(--brand-text-primary);
}

.session-user-menu-entry.is-active {
  --el-fill-color-light: var(--brand-fill-light);
  --el-button-text-color: var(--brand-text-primary);
  background: var(--brand-fill-light);
}

.session-user-menu-entry__content,
.session-user-menu-item__content {
  gap: 0.625rem;
}

.session-user-menu-entry__icon {
  color: var(--brand-text-secondary);
}

.session-user-menu-entry__avatar {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 64%, transparent);
}

.session-user-menu-entry__summary {
  display: flex;
  flex: 1 1 0%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
}

.session-user-menu-entry__title {
  overflow: hidden;
  color: var(--brand-text-primary);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-user-menu-entry__current {
  flex-shrink: 0;
  color: var(--brand-text-secondary);
  font-size: 12px;
  line-height: 1;
}

.session-user-menu-entry__chevron {
  flex-shrink: 0;
  color: var(--brand-text-secondary);
  font-size: 14px;
  transition:
    transform 0.2s ease,
    color 0.2s ease;
}

.session-user-menu-item__icon {
  color: var(--brand-text-secondary);
  font-size: 14px;
}

.session-user-logout {
  @include session-menu-button-base(var(--brand-error));
}

.session-user-logout:hover {
  --el-fill-color-light: var(--el-color-danger-light-9);
  --el-button-text-color: var(--brand-error);
}

.session-user-logout .session-user-menu-item__icon {
  color: currentColor;
}

.session-user-avatar {
  &-trigger {
    overflow: hidden;
    width: 2.5rem;
    min-width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border-color: var(--brand-border-base);
    background: var(--brand-bg-surface);

    &:hover {
      border-color: color-mix(in srgb, var(--brand-primary) 20%, var(--brand-border-base));
      background: var(--brand-bg-surface);
    }

    &__avatar {
      width: 100%;
      height: 100%;
    }
  }
}
</style>
