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
        secondary
        size="small"
        :aria-label="t('desktop.chat.executionProfileOpen')"
      >
        <template #icon>
          <NIcon :component="executionProfileIcon" />
        </template>
        {{ t(fullAccess ? 'desktop.chat.executionProfileFull' : 'desktop.chat.executionProfileDefault') }}
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
  border-radius: 0.6rem;
  color: var(--buddy-text-secondary);

  &.is-full-access {
    background-color: color-mix(in srgb, var(--buddy-accent-danger) 9%, transparent);
    color: var(--buddy-accent-danger);
  }

  &.is-full-access:hover,
  &.is-full-access:focus {
    background-color: color-mix(in srgb, var(--buddy-accent-danger) 13%, transparent);
    color: var(--buddy-accent-danger);
  }

  &.is-full-access:active {
    background-color: color-mix(in srgb, var(--buddy-accent-danger) 17%, transparent);
    color: var(--buddy-accent-danger);
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
  border-top: 1px solid var(--buddy-border-light);
  margin-top: 0.8rem;
  padding-top: 0.8rem;

  > span {
    display: grid;
    gap: 0.2rem;
  }

  strong {
    color: var(--buddy-text-primary);
    font-size: 0.86rem;
  }

  &.is-full-access strong {
    color: var(--buddy-accent-danger);
  }

  small {
    color: var(--buddy-text-placeholder);
    font-size: 0.68rem;
    line-height: 1.4;
  }
}

.desktop-execution-profile-selector__switch.is-full-access {
  --n-rail-color-active: var(--buddy-accent-danger) !important;
}
</style>
