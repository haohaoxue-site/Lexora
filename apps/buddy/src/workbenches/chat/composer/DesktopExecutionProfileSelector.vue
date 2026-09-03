<script setup lang="ts">
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { LockOpen20Regular, LockShield20Regular } from '@vicons/fluent'
import { NButton, NIcon, NPopover, NSwitch } from 'naive-ui'
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
const executionProfileIcon = computed(() => fullAccess.value ? LockOpen20Regular : LockShield20Regular)
const confirmationOpen = shallowRef(false)
const popoverOpen = shallowRef(false)

function updateFullAccess(value: boolean) {
  if (!value) {
    emit('updateExecutionProfile', 'controlled')
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
          {{ t(fullAccess ? 'desktop.chat.executionProfileFull' : 'desktop.chat.executionProfileDefault') }}
        </span>
      </NButton>
    </template>

    <div class="desktop-execution-profile-selector__popover">
      <p>
        {{ t(fullAccess
          ? 'desktop.chat.executionProfileFullDescription'
          : 'desktop.chat.executionProfileDefaultDescription') }}
      </p>
      <div
        class="desktop-execution-profile-selector__switch-row"
        :class="{ 'is-full-access': fullAccess }"
      >
        <span>
          <strong>{{ t('desktop.chat.executionProfileAllowFull') }}</strong>
          <small v-if="!canUpdate && !isUpdating">
            {{ t('desktop.chat.executionProfileRunLocked') }}
          </small>
        </span>
        <NSwitch
          class="desktop-execution-profile-selector__switch"
          :class="{ 'is-full-access': fullAccess }"
          :disabled="!canUpdate"
          :loading="isUpdating"
          :value="fullAccess"
          @update:value="updateFullAccess"
        />
      </div>
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
  width: min(19rem, calc(100vw - 2rem));

  > p {
    margin: 0;
    color: var(--buddy-text-secondary);
    font-size: 0.78rem;
    line-height: 1.65;
  }
}

.desktop-execution-profile-selector__switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid var(--buddy-border-subtle);
  margin-top: 0.8rem;
  padding-top: 0.8rem;

  > span {
    display: grid;
    gap: 0.2rem;
  }

  strong {
    color: var(--buddy-text-strong);
    font-size: 0.86rem;
  }

  &.is-full-access strong {
    color: var(--buddy-status-danger-text);
  }

  small {
    color: var(--buddy-text-muted);
    font-size: 0.68rem;
    line-height: 1.4;
  }
}

.desktop-execution-profile-selector__switch.is-full-access {
  --n-rail-color-active: var(--buddy-status-danger-solid) !important;
}
</style>
