<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { DESKTOP_ASSET_URLS } from '@/assets/desktopAssetUrls'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
}>()

const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <header class="buddy-chat-agent-identity">
    <span class="buddy-chat-agent-identity__avatar">
      <img
        :src="DESKTOP_ASSET_URLS.appIcon"
        alt=""
        draggable="false"
        height="37"
        width="37"
      >
    </span>
    <span class="buddy-chat-agent-identity__name">
      {{ t('desktop.chat.agentName') }}
    </span>
  </header>
</template>

<style scoped lang="scss">
.buddy-chat-agent-identity {
  display: inline-flex;
  width: fit-content;
  min-width: 0;
  align-items: center;
  gap: var(--buddy-chat-avatar-gap);
}

.buddy-chat-agent-identity__avatar {
  position: relative;
  width: var(--buddy-chat-avatar-size);
  height: var(--buddy-chat-avatar-size);
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 50%;
  background: var(--buddy-surface-subtle);
}

.buddy-chat-agent-identity__avatar img {
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(var(--buddy-chat-avatar-size) + 5px);
  height: calc(var(--buddy-chat-avatar-size) + 5px);
  object-fit: contain;
  transform: translate(-50%, -47%);
}

.buddy-chat-agent-identity__name {
  min-width: 0;
  color: var(--buddy-chat-agent-name-color);
  font-family: var(--buddy-font-brand);
  font-size: var(--buddy-brand-name-font-size);
  font-weight: var(--buddy-brand-name-font-weight);
  line-height: var(--buddy-brand-name-line-height);
}
</style>
