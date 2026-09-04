<script setup lang="ts">
import type { BuddyPermissionMode } from '@buddy-shared/permissionMode'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  HandLeft20Regular,
  LockClosed20Regular,
  LockOpen20Regular,
  ShieldTask20Regular,
} from '@vicons/fluent'
import { NButton, NIcon, NPopover } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopFullAccessConfirmationDialog from '@/workbenches/chat/composer/DesktopFullAccessConfirmationDialog.vue'

const props = defineProps<{
  canUpdate: boolean
  isUpdating: boolean
  language: BuddyLocale
  permissionMode: BuddyPermissionMode
}>()

const emit = defineEmits<{
  updatePermissionMode: [value: BuddyPermissionMode]
}>()

const permissionOptions = [
  {
    description: 'desktop.chat.permissionModeReadOnlyDescription',
    icon: LockClosed20Regular,
    label: 'desktop.chat.executionProfileReadOnly',
    value: 'read_only',
  },
  {
    description: 'desktop.chat.permissionModeManualDescription',
    icon: HandLeft20Regular,
    label: 'desktop.chat.permissionModeManual',
    value: 'manual_approval',
  },
  {
    description: 'desktop.chat.permissionModePolicyDescription',
    icon: ShieldTask20Regular,
    label: 'desktop.chat.permissionModePolicy',
    value: 'policy_approval',
  },
  {
    description: 'desktop.chat.permissionModeFullDescription',
    icon: LockOpen20Regular,
    label: 'desktop.chat.executionProfileFull',
    value: 'full_access',
  },
] as const

const { t } = useBuddyI18n(() => props.language)
const confirmationOpen = shallowRef(false)
const popoverOpen = shallowRef(false)
const selected = computed(() => permissionOptions.find(
  option => option.value === props.permissionMode,
) ?? permissionOptions[2])
const isFullAccess = computed(() => props.permissionMode === 'full_access')

function selectMode(value: BuddyPermissionMode) {
  if (value === props.permissionMode) {
    popoverOpen.value = false
    return
  }
  if (value === 'full_access') {
    popoverOpen.value = false
    confirmationOpen.value = true
    return
  }
  emit('updatePermissionMode', value)
  popoverOpen.value = false
}

function confirmFullAccess() {
  confirmationOpen.value = false
  emit('updatePermissionMode', 'full_access')
}
</script>

<template>
  <NPopover
    placement="top-start"
    trigger="click"
    :show="popoverOpen"
    :show-arrow="false"
    @update:show="popoverOpen = $event"
  >
    <template #trigger>
      <NButton
        class="desktop-permission-mode-selector__trigger"
        :class="{ 'is-full-access': isFullAccess }"
        quaternary
        size="small"
        :aria-label="t('desktop.chat.executionProfileOpen')"
        :aria-expanded="popoverOpen"
      >
        <template #icon>
          <NIcon :component="selected.icon" />
        </template>
        <span class="desktop-permission-mode-selector__trigger-label">
          {{ t(selected.label) }}
        </span>
      </NButton>
    </template>

    <section class="desktop-permission-mode-selector__popover">
      <header class="desktop-permission-mode-selector__header">
        {{ t('desktop.chat.permissionModeTitle') }}
      </header>
      <div class="desktop-permission-mode-selector__options" role="menu">
        <button
          v-for="option in permissionOptions"
          :key="option.value"
          class="desktop-permission-mode-selector__option"
          :class="{
            'is-danger': option.value === 'full_access',
            'is-selected': option.value === permissionMode,
          }"
          :disabled="!canUpdate || isUpdating"
          role="menuitemradio"
          :aria-checked="option.value === permissionMode"
          type="button"
          @click="selectMode(option.value)"
        >
          <NIcon
            class="desktop-permission-mode-selector__option-icon"
            :component="option.icon"
          />
          <span class="desktop-permission-mode-selector__option-copy">
            <strong>{{ t(option.label) }}</strong>
            <small>{{ t(option.description) }}</small>
          </span>
        </button>
      </div>
      <small v-if="!canUpdate && !isUpdating" class="desktop-permission-mode-selector__locked">
        {{ t('desktop.chat.executionProfileRunLocked') }}
      </small>
    </section>
  </NPopover>

  <DesktopFullAccessConfirmationDialog
    :language="language"
    :show="confirmationOpen"
    @cancel="confirmationOpen = false"
    @confirm="confirmFullAccess"
  />
</template>

<style scoped lang="scss">
.desktop-permission-mode-selector__trigger {
  min-width: 0;
  height: var(--buddy-composer-control-height);
  border-radius: var(--buddy-composer-control-radius);
  background-color: transparent;
  color: var(--buddy-text-secondary);

  &.n-button:not(.n-button--disabled):not(.is-full-access):hover,
  &.n-button:not(.n-button--disabled):not(.is-full-access):focus-visible,
  &.n-button:not(.n-button--disabled):not(.is-full-access)[aria-expanded='true'] {
    background-color: var(--buddy-accent-surface-subtle);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }

  &.is-full-access {
    background-color: var(--buddy-status-danger-surface);
    color: var(--buddy-status-danger-text);
  }
}

.desktop-permission-mode-selector__popover {
  width: min(14rem, calc(100vw - 1rem));
}

.desktop-permission-mode-selector__header {
  padding: 0.1rem 0.25rem 0.45rem;
  color: var(--buddy-text-muted);
  font-size: 0.7rem;
  line-height: 1.4;
}

.desktop-permission-mode-selector__options {
  display: grid;
  gap: 0.15rem;
}

.desktop-permission-mode-selector__option {
  display: grid;
  width: 100%;
  grid-template-columns: 1.1rem minmax(0, 1fr);
  align-items: center;
  border: 0;
  border-radius: var(--buddy-menu-item-radius);
  padding: 0.36rem 0.35rem;
  background: transparent;
  color: var(--buddy-text-primary);
  column-gap: 0.5rem;
  cursor: pointer;
  text-align: left;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    background: var(--buddy-accent-surface-subtle);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &.is-danger {
    color: var(--buddy-status-danger-text);
  }

  &.is-selected:not(.is-danger) {
    background: var(--buddy-accent-surface);
    color: var(--buddy-text-strong);
  }

  &.is-selected.is-danger {
    background: var(--buddy-status-danger-surface);
  }
}

.desktop-permission-mode-selector__option-icon {
  font-size: 1.05rem;
}

.desktop-permission-mode-selector__option-copy {
  display: grid;
  min-width: 0;
  gap: 0.05rem;

  strong {
    font-size: 0.8rem;
    font-weight: 580;
    line-height: 1.35;
  }

  small {
    color: var(--buddy-text-muted);
    font-size: 0.67rem;
    line-height: 1.35;
  }
}

.desktop-permission-mode-selector__option.is-danger small {
  color: var(--buddy-status-danger-text);
  opacity: 0.82;
}

.desktop-permission-mode-selector__locked {
  display: block;
  border-top: 1px solid var(--buddy-border-subtle);
  margin-top: 0.3rem;
  padding: 0.4rem 0.25rem 0.05rem;
  color: var(--buddy-text-muted);
  font-size: 0.68rem;
}
</style>
