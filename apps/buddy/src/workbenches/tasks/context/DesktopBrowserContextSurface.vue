<script setup lang="ts">
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import {
  ArrowClockwise16Regular,
  ArrowLeft16Regular,
  ArrowRight16Regular,
  DesktopCursor16Regular,
  FolderOpen16Regular,
  Globe16Regular,
  LockClosed16Regular,
  Pause16Regular,
  Stop16Regular,
  Warning16Regular,
} from '@vicons/fluent'
import { NIcon, NTooltip } from 'naive-ui'
import { computed, shallowRef, toRef, useId, useTemplateRef, watch } from 'vue'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { getBrowserStatusPresentation } from './browserStatusPresentation'
import { useBrowserContextSurface } from './useBrowserContextSurface'

const props = defineProps<{
  conversationId: string
  language: BuddyLocale
}>()

const { browser } = useDesktopApp()
const { t } = useBuddyI18n(() => props.language)
const surfaceElement = useTemplateRef<HTMLElement>('surfaceElement')
const addressInput = useTemplateRef<HTMLInputElement>('addressInput')
const addressId = useId()
const profileResetDescriptionId = useId()
const profileResetTitleId = useId()
const address = shallowRef('')
const {
  enablePersonalProfile,
  failure,
  focusPage,
  goBack,
  goForward,
  isLoading,
  isEnablingPersonalProfile,
  isOpeningLocalFile,
  isResettingPersonalProfile,
  isTakingControl,
  navigate,
  openLocalFile,
  reload,
  resetPersonalProfile,
  state,
  stop,
  takeControl,
} = useBrowserContextSurface({
  api: browser,
  conversationId: toRef(() => props.conversationId),
  surfaceElement,
  toolbarFocusElement: addressInput,
})
const securityIcon = computed(() => {
  const kind = state.value?.security.kind ?? 'blank'
  if (kind === 'certificate-error' || kind === 'insecure')
    return Warning16Regular
  if (kind === 'secure')
    return LockClosed16Regular
  return Globe16Regular
})
const securityLabel = computed(() => {
  const security = state.value?.security
  if (!security || security.kind === 'blank')
    return t('desktop.context.browserSecurityBlank')
  if (security.kind === 'certificate-error')
    return t('desktop.context.browserSecurityCertificateError')
  if (security.kind === 'insecure')
    return t('desktop.context.browserSecurityInsecure')
  if (security.kind === 'local') {
    return t(security.origin.startsWith('http://')
      ? 'desktop.context.browserSecurityLocalHttp'
      : 'desktop.context.browserSecurityLocal')
  }
  return t('desktop.context.browserSecuritySecure')
})
const statusPresentation = computed(() => getBrowserStatusPresentation(
  state.value,
  failure.value,
))
const statusLabel = computed(() => t(statusPresentation.value.messageKey))
const controlAnnouncementKey = shallowRef<BuddyI18nKey | null>(null)
const isProfileResetConfirming = shallowRef(false)
const controlAnnouncement = computed(() => controlAnnouncementKey.value
  ? t(controlAnnouncementKey.value)
  : '')

watch(
  [() => state.value?.sessionId, () => state.value?.url],
  ([sessionId, url], [previousSessionId]) => {
    if (url === 'about:blank' && sessionId !== previousSessionId) {
      address.value = ''
      return
    }
    if (url && url !== 'about:blank' && document.activeElement !== addressInput.value)
      address.value = url
  },
)

watch(
  () => state.value?.controller,
  (controller, previousController) => {
    if (controller === 'agent') {
      controlAnnouncementKey.value = 'desktop.context.browserAgentControlling'
      isProfileResetConfirming.value = false
      return
    }
    if (previousController === 'agent')
      controlAnnouncementKey.value = 'desktop.context.browserAgentPaused'
  },
)

watch(
  () => state.value?.profileMode,
  (profileMode) => {
    if (profileMode !== 'personal')
      isProfileResetConfirming.value = false
  },
)

function openAddress(): void {
  void navigate(address.value)
}

function restoreCurrentAddress(): void {
  const url = state.value?.url
  if (url && url !== 'about:blank')
    address.value = url
}

function toggleLoading(): void {
  void (isLoading.value ? stop() : reload())
}

function openProfileResetConfirmation(): void {
  if (state.value?.profileMode === 'personal' && state.value.controller === 'human')
    isProfileResetConfirming.value = true
}

function cancelProfileReset(): void {
  if (!isResettingPersonalProfile.value)
    isProfileResetConfirming.value = false
}

async function confirmProfileReset(): Promise<void> {
  if (await resetPersonalProfile())
    isProfileResetConfirming.value = false
}
</script>

<template>
  <section class="desktop-browser-context-surface" data-testid="browser-context-surface">
    <form
      class="desktop-browser-context-surface__toolbar"
      :aria-label="t('desktop.context.browserToolbar')"
      novalidate
      @submit.prevent="openAddress"
    >
      <NTooltip placement="top">
        <template #trigger>
          <button
            class="desktop-browser-context-surface__action"
            data-testid="browser-back"
            type="button"
            :aria-label="t('desktop.context.browserBack')"
            :disabled="!state?.canGoBack"
            @click="goBack"
          >
            <NIcon aria-hidden="true" :component="ArrowLeft16Regular" />
          </button>
        </template>
        <span role="tooltip">{{ t('desktop.context.browserBack') }}</span>
      </NTooltip>
      <NTooltip placement="top">
        <template #trigger>
          <button
            class="desktop-browser-context-surface__action"
            data-testid="browser-forward"
            type="button"
            :aria-label="t('desktop.context.browserForward')"
            :disabled="!state?.canGoForward"
            @click="goForward"
          >
            <NIcon aria-hidden="true" :component="ArrowRight16Regular" />
          </button>
        </template>
        <span role="tooltip">{{ t('desktop.context.browserForward') }}</span>
      </NTooltip>
      <NTooltip placement="top">
        <template #trigger>
          <button
            class="desktop-browser-context-surface__action"
            data-testid="browser-reload-stop"
            type="button"
            :aria-label="t(isLoading ? 'desktop.context.browserStop' : 'desktop.context.browserReload')"
            :disabled="!state || (!isLoading && state.url === 'about:blank')"
            @click="toggleLoading"
          >
            <NIcon
              aria-hidden="true"
              :component="isLoading ? Stop16Regular : ArrowClockwise16Regular"
            />
          </button>
        </template>
        <span role="tooltip">
          {{ t(isLoading ? 'desktop.context.browserStop' : 'desktop.context.browserReload') }}
        </span>
      </NTooltip>
      <label class="desktop-browser-context-surface__label" :for="addressId">
        {{ t('desktop.context.browserAddressLabel') }}
      </label>
      <input
        :id="addressId"
        ref="addressInput"
        v-model="address"
        class="desktop-browser-context-surface__address"
        data-testid="browser-address"
        autocomplete="off"
        inputmode="url"
        name="browser-address"
        :placeholder="t('desktop.context.browserAddressPlaceholder')"
        spellcheck="false"
        type="url"
        @blur="restoreCurrentAddress"
      >
      <NTooltip placement="top">
        <template #trigger>
          <button
            class="desktop-browser-context-surface__action"
            data-testid="browser-open-local-file"
            type="button"
            :aria-label="t('desktop.context.browserOpenLocalFile')"
            :disabled="!state || isOpeningLocalFile"
            @click="openLocalFile"
          >
            <NIcon aria-hidden="true" :component="FolderOpen16Regular" />
          </button>
        </template>
        <span role="tooltip">{{ t('desktop.context.browserOpenLocalFile') }}</span>
      </NTooltip>
      <NTooltip placement="top">
        <template #trigger>
          <button
            class="desktop-browser-context-surface__action"
            data-testid="browser-go"
            type="submit"
            :aria-label="t('desktop.context.browserGo')"
          >
            <NIcon aria-hidden="true" :component="ArrowRight16Regular" />
          </button>
        </template>
        <span role="tooltip">{{ t('desktop.context.browserGo') }}</span>
      </NTooltip>
      <NTooltip placement="top">
        <template #trigger>
          <button
            class="desktop-browser-context-surface__action"
            data-testid="browser-focus-page"
            type="button"
            :aria-label="t('desktop.context.browserFocusPage')"
            :disabled="!state?.visible"
            @click="focusPage"
          >
            <NIcon aria-hidden="true" :component="DesktopCursor16Regular" />
          </button>
        </template>
        <span role="tooltip">{{ t('desktop.context.browserFocusPageHint') }}</span>
      </NTooltip>
    </form>
    <div
      v-if="state?.controller === 'agent'"
      class="desktop-browser-context-surface__control"
      data-testid="browser-agent-control"
    >
      <span class="desktop-browser-context-surface__control-state">
        <span class="desktop-browser-context-surface__control-indicator" aria-hidden="true" />
        {{ t('desktop.context.browserAgentControlling') }}
      </span>
      <button
        class="desktop-browser-context-surface__take-control"
        data-testid="browser-take-control"
        type="button"
        :aria-busy="isTakingControl"
        :aria-label="t('desktop.context.browserTakeControl')"
        :disabled="isTakingControl"
        @click="takeControl"
      >
        <NIcon aria-hidden="true" :component="Pause16Regular" />
        <span>
          {{ t(isTakingControl
            ? 'desktop.context.browserTakingControl'
            : 'desktop.context.browserTakeControl') }}
        </span>
      </button>
    </div>
    <span
      class="desktop-browser-context-surface__control-announcement"
      data-testid="browser-control-announcement"
      aria-atomic="true"
      aria-live="polite"
      role="status"
    >
      {{ controlAnnouncement }}
    </span>
    <div class="desktop-browser-context-surface__meta">
      <NTooltip placement="top">
        <template #trigger>
          <button
            v-if="state?.profileMode !== 'personal'"
            class="desktop-browser-context-surface__profile"
            data-profile-mode="ephemeral"
            data-testid="browser-profile-mode"
            type="button"
            :aria-busy="isEnablingPersonalProfile"
            :aria-label="t('desktop.context.browserEnablePersonalProfile')"
            :disabled="!state || state.controller === 'agent' || isEnablingPersonalProfile"
            @click="enablePersonalProfile"
          >
            <span class="desktop-browser-context-surface__profile-indicator" aria-hidden="true" />
            <span>
              {{ t(isEnablingPersonalProfile
                ? 'desktop.context.browserEnablingPersonalProfile'
                : 'desktop.context.browserProfileEphemeral') }}
            </span>
          </button>
          <button
            v-else
            class="desktop-browser-context-surface__profile"
            data-profile-mode="personal"
            data-testid="browser-profile-mode"
            type="button"
            :aria-label="t('desktop.context.browserManagePersonalProfile')"
            :disabled="state.controller === 'agent' || isResettingPersonalProfile"
            @click="openProfileResetConfirmation"
          >
            <span class="desktop-browser-context-surface__profile-indicator" aria-hidden="true" />
            <span>{{ t('desktop.context.browserProfilePersonal') }}</span>
          </button>
        </template>
        <span role="tooltip">
          {{ t(state?.profileMode === 'personal'
            ? 'desktop.context.browserProfilePersonalHint'
            : 'desktop.context.browserProfileEphemeralHint') }}
        </span>
      </NTooltip>
      <span
        class="desktop-browser-context-surface__security"
        :data-security-kind="state?.security.kind ?? 'blank'"
        data-testid="browser-security"
      >
        <NIcon aria-hidden="true" :component="securityIcon" />
        <span>{{ securityLabel }}</span>
        <span
          v-if="state?.security.origin"
          class="desktop-browser-context-surface__origin"
          data-testid="browser-origin"
        >
          {{ state.security.origin }}
        </span>
      </span>
      <span
        class="desktop-browser-context-surface__status"
        :data-status-tone="statusPresentation.tone"
        data-testid="browser-status"
        aria-atomic="true"
        aria-live="polite"
        role="status"
      >
        {{ statusLabel }}
      </span>
    </div>
    <div
      v-if="isProfileResetConfirming"
      class="desktop-browser-context-surface__profile-reset"
      data-testid="browser-profile-reset-confirmation"
      role="group"
      :aria-describedby="profileResetDescriptionId"
      :aria-labelledby="profileResetTitleId"
    >
      <div class="desktop-browser-context-surface__profile-reset-copy">
        <strong :id="profileResetTitleId">
          {{ t('desktop.context.browserProfileResetTitle') }}
        </strong>
        <span :id="profileResetDescriptionId">
          {{ t('desktop.context.browserProfileResetDescription') }}
        </span>
      </div>
      <div class="desktop-browser-context-surface__profile-reset-actions">
        <button
          class="desktop-browser-context-surface__profile-reset-cancel"
          data-testid="browser-profile-reset-cancel"
          type="button"
          :disabled="isResettingPersonalProfile"
          @click="cancelProfileReset"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="desktop-browser-context-surface__profile-reset-confirm"
          data-testid="browser-profile-reset-confirm"
          type="button"
          :aria-busy="isResettingPersonalProfile"
          :disabled="isResettingPersonalProfile"
          @click="confirmProfileReset"
        >
          {{ t(isResettingPersonalProfile
            ? 'desktop.context.browserProfileResetting'
            : 'desktop.context.browserProfileResetConfirm') }}
        </button>
      </div>
    </div>
    <div
      ref="surfaceElement"
      class="desktop-browser-context-surface__viewport"
      data-testid="browser-native-surface"
      role="group"
      :aria-label="t('desktop.context.browserViewport')"
    />
  </section>
</template>

<style scoped>
.desktop-browser-context-surface {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--buddy-surface-base);
}

.desktop-browser-context-surface__toolbar {
  display: flex;
  min-width: 0;
  height: 3rem;
  flex: none;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0.375rem 0.5rem;
}

.desktop-browser-context-surface__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.desktop-browser-context-surface__address {
  min-width: 0;
  height: 2.25rem;
  flex: 1;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.5rem;
  outline: none;
  background: var(--buddy-surface-muted);
  color: var(--buddy-text-strong);
  font: inherit;
  font-size: 0.78rem;
  margin-left: 0.25rem;
  padding: 0 0.625rem;
}

.desktop-browser-context-surface__address:hover {
  border-color: var(--buddy-border-strong);
}

.desktop-browser-context-surface__address:focus-visible,
.desktop-browser-context-surface__action:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

.desktop-browser-context-surface__action {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-icon-button-radius);
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
}

.desktop-browser-context-surface__action:not(:disabled):hover {
  background: var(--buddy-state-hover);
  color: var(--buddy-text-strong);
}

.desktop-browser-context-surface__action:disabled {
  cursor: default;
  opacity: 0.45;
}

.desktop-browser-context-surface__control {
  display: flex;
  min-width: 0;
  min-height: 2.375rem;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--buddy-accent-border);
  background: var(--buddy-accent-surface-subtle);
  color: var(--buddy-accent-on-surface);
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;
}

.desktop-browser-context-surface__control-state {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.desktop-browser-context-surface__control-indicator {
  width: 0.5rem;
  height: 0.5rem;
  flex: none;
  border-radius: 50%;
  background: var(--buddy-accent-solid);
}

.desktop-browser-context-surface__take-control {
  display: flex;
  min-height: 1.875rem;
  flex: none;
  align-items: center;
  gap: 0.375rem;
  border: 0;
  border-radius: 0.375rem;
  background: var(--buddy-accent-solid);
  color: var(--buddy-text-on-accent);
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.625rem;
}

.desktop-browser-context-surface__take-control:not(:disabled):hover {
  background: var(--buddy-accent-solid-hover);
}

.desktop-browser-context-surface__take-control:not(:disabled):active {
  background: var(--buddy-accent-solid-pressed);
}

.desktop-browser-context-surface__take-control:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 2px;
}

.desktop-browser-context-surface__take-control:disabled {
  cursor: wait;
  opacity: 0.72;
}

.desktop-browser-context-surface__control-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.desktop-browser-context-surface__meta {
  display: flex;
  min-width: 0;
  min-height: 1.75rem;
  flex: none;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0 0.625rem;
}

.desktop-browser-context-surface__profile {
  display: flex;
  min-width: 0;
  height: 1.375rem;
  flex: none;
  align-items: center;
  gap: 0.3rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--buddy-text-muted);
  font: inherit;
  font-size: 0.7rem;
  white-space: nowrap;
}

button.desktop-browser-context-surface__profile {
  cursor: pointer;
  padding: 0 0.25rem;
}

button.desktop-browser-context-surface__profile:not(:disabled):hover {
  background: var(--buddy-state-hover);
  color: var(--buddy-text-strong);
}

button.desktop-browser-context-surface__profile:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

button.desktop-browser-context-surface__profile:disabled {
  cursor: default;
  opacity: 0.55;
}

.desktop-browser-context-surface__profile[data-profile-mode='personal'] {
  color: var(--buddy-accent-on-surface);
  font-weight: 600;
}

.desktop-browser-context-surface__profile-indicator {
  width: 0.375rem;
  height: 0.375rem;
  flex: none;
  border: 1px solid currentColor;
  border-radius: 50%;
}

.desktop-browser-context-surface__profile[data-profile-mode='personal']
  .desktop-browser-context-surface__profile-indicator {
  border-color: var(--buddy-accent-solid);
  background: var(--buddy-accent-solid);
}

.desktop-browser-context-surface__profile-reset {
  display: flex;
  min-width: 0;
  min-height: 3.75rem;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-muted);
  padding: 0.5rem 0.625rem 0.5rem 0.75rem;
}

.desktop-browser-context-surface__profile-reset-copy {
  display: grid;
  min-width: 0;
  gap: 0.125rem;
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  line-height: 1.35;
}

.desktop-browser-context-surface__profile-reset-copy strong {
  color: var(--buddy-text-strong);
  font-size: 0.75rem;
}

.desktop-browser-context-surface__profile-reset-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.375rem;
}

.desktop-browser-context-surface__profile-reset-cancel,
.desktop-browser-context-surface__profile-reset-confirm {
  min-height: 1.875rem;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.375rem;
  cursor: pointer;
  font: inherit;
  font-size: 0.7rem;
  padding: 0.25rem 0.625rem;
}

.desktop-browser-context-surface__profile-reset-cancel {
  background: var(--buddy-surface-base);
  color: var(--buddy-text-secondary);
}

.desktop-browser-context-surface__profile-reset-confirm {
  border-color: var(--buddy-status-danger-solid);
  background: var(--buddy-status-danger-solid);
  color: var(--buddy-text-on-accent);
}

.desktop-browser-context-surface__profile-reset-cancel:focus-visible,
.desktop-browser-context-surface__profile-reset-confirm:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 2px;
}

.desktop-browser-context-surface__profile-reset-cancel:disabled,
.desktop-browser-context-surface__profile-reset-confirm:disabled {
  cursor: wait;
  opacity: 0.68;
}

.desktop-browser-context-surface__security {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.25rem;
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  white-space: nowrap;
}

.desktop-browser-context-surface__security[data-security-kind='certificate-error'],
.desktop-browser-context-surface__security[data-security-kind='insecure'] {
  color: var(--buddy-status-danger-text);
}

.desktop-browser-context-surface__origin {
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-text-muted);
  font-family: var(--buddy-font-mono);
  text-overflow: ellipsis;
}

.desktop-browser-context-surface__status {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  margin-left: auto;
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-browser-context-surface__status[data-status-tone='warning'] {
  color: var(--buddy-status-warning-text);
}

.desktop-browser-context-surface__status[data-status-tone='danger'] {
  color: var(--buddy-status-danger-text);
}

.desktop-browser-context-surface__viewport {
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: white;
}
</style>
