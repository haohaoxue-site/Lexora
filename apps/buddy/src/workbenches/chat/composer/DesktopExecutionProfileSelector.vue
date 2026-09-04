<script setup lang="ts">
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { LockClosed20Regular, LockOpen20Regular, LockShield20Regular } from '@vicons/fluent'
import { NButton, NIcon, NPopover, NRadioButton, NRadioGroup } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopFullAccessConfirmationDialog from '@/workbenches/chat/composer/DesktopFullAccessConfirmationDialog.vue'

const props = defineProps<{
  canUpdate: boolean
  executionProfile: BuddyExecutionProfile
  isUpdating: boolean
  language: BuddyLocale
}>()

const emit = defineEmits<{
  updateExecutionProfile: [value: BuddyExecutionProfile]
}>()

const { t } = useBuddyI18n(() => props.language)
const fullAccess = computed(() => props.executionProfile === 'full_access')
const readOnly = computed(() => props.executionProfile === 'read_only')
const executionProfileIcon = computed(() => {
  if (fullAccess.value)
    return LockOpen20Regular
  return readOnly.value ? LockClosed20Regular : LockShield20Regular
})
const profileLabelKey = computed(() => {
  if (fullAccess.value)
    return 'desktop.chat.executionProfileFull' as const
  return readOnly.value
    ? 'desktop.chat.executionProfileReadOnly' as const
    : 'desktop.chat.executionProfileDefault' as const
})
const profileDescriptionKey = computed(() => {
  if (fullAccess.value)
    return 'desktop.chat.executionProfileFullDescription' as const
  return readOnly.value
    ? 'desktop.chat.executionProfileReadOnlyDescription' as const
    : 'desktop.chat.executionProfileDefaultDescription' as const
})
const confirmationOpen = shallowRef(false)
const popoverOpen = shallowRef(false)

function selectProfile(value: BuddyExecutionProfile) {
  if (value === props.executionProfile)
    return
  if (value !== 'full_access') {
    emit('updateExecutionProfile', value)
    return
  }
  popoverOpen.value = false
  confirmationOpen.value = true
}

function confirmFullAccess() {
  confirmationOpen.value = false
  emit('updateExecutionProfile', 'full_access')
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
        class="desktop-execution-profile-selector__trigger"
        :class="{ 'is-full-access': fullAccess }"
        quaternary
        size="small"
        :aria-label="t('desktop.chat.executionProfileOpen')"
        :aria-expanded="popoverOpen"
      >
        <template #icon>
          <NIcon :component="executionProfileIcon" />
        </template>
        <span class="desktop-execution-profile-selector__label">
          {{ t(profileLabelKey) }}
        </span>
      </NButton>
    </template>

    <div class="desktop-execution-profile-selector__popover">
      <p>{{ t(profileDescriptionKey) }}</p>
      <NRadioGroup
        class="desktop-execution-profile-selector__group"
        :class="{ 'is-full-access': fullAccess }"
        :disabled="!canUpdate || isUpdating"
        :value="executionProfile"
        size="small"
        @update:value="selectProfile"
      >
        <NRadioButton value="read_only">
          {{ t('desktop.chat.executionProfileReadOnly') }}
        </NRadioButton>
        <NRadioButton value="workspace_write">
          {{ t('desktop.chat.executionProfileDefault') }}
        </NRadioButton>
        <NRadioButton value="full_access">
          {{ t('desktop.chat.executionProfileFull') }}
        </NRadioButton>
      </NRadioGroup>
      <small v-if="!canUpdate && !isUpdating">
        {{ t('desktop.chat.executionProfileRunLocked') }}
      </small>
    </div>
  </NPopover>

  <DesktopFullAccessConfirmationDialog
    :language="language"
    :show="confirmationOpen"
    @cancel="confirmationOpen = false"
    @confirm="confirmFullAccess"
  />
</template>

<style scoped lang="scss">
.desktop-execution-profile-selector__trigger {
  min-width: 0;
  height: var(--buddy-composer-control-height);
  border-radius: var(--buddy-composer-control-radius);
  background-color: transparent;
  color: var(--buddy-text-secondary);
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &.n-button:not(.n-button--disabled):not(.is-full-access):hover,
  &.n-button:not(.n-button--disabled):not(.is-full-access):focus-visible {
    background-color: var(--buddy-accent-surface-subtle);
    color: var(--buddy-text-strong);
  }

  &.n-button:not(.n-button--disabled):not(.is-full-access)[aria-expanded='true'] {
    background-color: var(--buddy-accent-surface);
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

  &.is-full-access:hover,
  &.is-full-access:focus {
    background-color: var(--buddy-status-danger-surface-hover);
    color: var(--buddy-status-danger-text);
  }

  &.is-full-access:active {
    background-color: var(--buddy-status-danger-border);
    color: var(--buddy-status-danger-text);
  }
}

.desktop-execution-profile-selector__popover {
  width: min(21rem, calc(100vw - 2rem));

  > p {
    margin: 0;
    color: var(--buddy-text-secondary);
    font-size: 0.78rem;
    line-height: 1.65;
  }

  > small {
    display: block;
    margin-top: 0.5rem;
    color: var(--buddy-text-muted);
    font-size: 0.68rem;
    line-height: 1.4;
  }
}

.desktop-execution-profile-selector__group {
  display: flex;
  border-top: 1px solid var(--buddy-border-subtle);
  margin-top: 0.8rem;
  padding-top: 0.8rem;

  &.is-full-access :deep(.n-radio-button--checked) {
    color: var(--buddy-status-danger-text);
  }
}
</style>
