<script setup lang="ts">
import type { LocalBuddyServiceSupervisorState } from '@buddy-shared/runtime/serviceState'
import type { ChatBlocker } from '../../model/status/typing'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { DesktopSettingsCategory } from '@/shared/navigation/desktopRoutes'
import { ArrowClockwise20Regular, Settings20Regular, Warning20Regular } from '@vicons/fluent'
import { NButton } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{
  blocker: ChatBlocker | null
  canRestartRuntime: boolean
  errorMessage: string | null
  language: BuddyLocale
  runtimeError: string | null
  runtimeStatus: LocalBuddyServiceSupervisorState['status']
}>()
const emit = defineEmits<{
  dismissBlocker: []
  openSettings: [category: DesktopSettingsCategory]
  restartRuntime: []
}>()
const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <article
    v-if="blocker"
    class="desktop-chat-page__alert"
    :class="`is-${blocker.kind}`"
    role="alert"
  >
    <DesktopIcon :component="Warning20Regular" />
    <div>
      <strong>{{ t(`desktop.chat.blocker.${blocker.kind}.title`) }}</strong>
      <p>{{ blocker.kind === 'runtime' && runtimeError ? runtimeError : t(`desktop.chat.blocker.${blocker.kind}.description`) }}</p>
    </div>
    <div class="desktop-chat-page__alert-actions">
      <NButton
        v-if="blocker.kind === 'runtime' && canRestartRuntime"
        size="small"
        type="error"
        ghost
        @click="emit('restartRuntime')"
      >
        <template #icon>
          <DesktopIcon :component="ArrowClockwise20Regular" />
        </template>
        {{ t('desktop.chat.runtimeRestart') }}
      </NButton>
      <NButton
        size="small"
        :type="blocker.kind === 'runtime' ? 'default' : 'primary'"
        @click="emit('openSettings', blocker.kind === 'runtime' ? 'data' : 'models')"
      >
        <template #icon>
          <DesktopIcon :component="Settings20Regular" />
        </template>
        {{ t(`desktop.chat.blocker.${blocker.kind}.action`) }}
      </NButton>
      <NButton v-if="blocker.dismissible" text size="small" @click="emit('dismissBlocker')">
        {{ t('desktop.chat.blocker.ignore') }}
      </NButton>
    </div>
  </article>

  <article v-else-if="errorMessage" class="desktop-chat-page__alert is-runtime" role="alert">
    <DesktopIcon :component="Warning20Regular" />
    <div><p>{{ errorMessage }}</p></div>
  </article>
</template>

<style scoped lang="scss">
.desktop-chat-page__alert {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid var(--buddy-status-warning-border);
  border-radius: 0.65rem;
  background: var(--buddy-status-warning-surface);
  color: var(--buddy-text-primary);
  padding: 0.65rem 0.75rem;

  > .n-icon {
    color: var(--buddy-status-warning-text);
    font-size: 1.1rem;
  }

  &.is-runtime {
    border-color: var(--buddy-status-danger-border);
    background: var(--buddy-status-danger-surface);

    > .n-icon {
      color: var(--buddy-status-danger-text);
    }
  }

  strong,
  p {
    margin: 0;
  }

  strong {
    font-size: 0.75rem;
  }

  p {
    margin-top: 0.12rem;
    color: var(--buddy-text-secondary);
    font-size: 0.68rem;
    line-height: 1.45;
  }
}

.desktop-chat-page__alert-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

@container desktop-chat-page (max-width: 34rem) {
  .desktop-chat-page__alert {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .desktop-chat-page__alert-actions {
    grid-column: 2;
    justify-content: flex-start;
  }
}
</style>
