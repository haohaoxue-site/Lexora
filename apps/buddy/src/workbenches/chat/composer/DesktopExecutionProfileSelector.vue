<script setup lang="ts">
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { LockShield20Regular } from '@vicons/fluent'
import { NButton, NIcon, NPopover, NSwitch } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

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

function updateFullAccess(value: boolean) {
  emit('updateExecutionProfile', value ? 'full_access' : 'sandboxed')
}
</script>

<template>
  <NPopover placement="top-start" trigger="click" :show-arrow="false">
    <template #trigger>
      <NButton
        class="desktop-execution-profile-selector__trigger"
        secondary
        size="small"
        :loading="isUpdating"
        :aria-label="t('desktop.chat.executionProfileOpen')"
      >
        <template #icon>
          <NIcon :component="LockShield20Regular" />
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
      <div class="desktop-execution-profile-selector__switch-row">
        <span>
          <strong>{{ t('desktop.chat.executionProfileAllowFull') }}</strong>
          <small v-if="!canUpdate && !isUpdating">
            {{ t('desktop.chat.executionProfileRunLocked') }}
          </small>
        </span>
        <NSwitch
          :disabled="!canUpdate"
          :value="fullAccess"
          @update:value="updateFullAccess"
        />
      </div>
    </div>
  </NPopover>
</template>

<style scoped lang="scss">
.desktop-execution-profile-selector__trigger {
  min-width: 0;
  border-radius: 0.6rem;
  color: var(--buddy-text-secondary);
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

  small {
    color: var(--buddy-text-placeholder);
    font-size: 0.68rem;
    line-height: 1.4;
  }
}
</style>
