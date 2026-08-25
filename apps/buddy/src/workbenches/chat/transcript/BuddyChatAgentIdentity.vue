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
    <img
      :src="DESKTOP_ASSET_URLS.appIcon"
      alt=""
      draggable="false"
      height="25"
      width="25"
    >
    <span>{{ t('desktop.chat.agentName') }}</span>
  </header>
</template>

<style scoped lang="scss">
.buddy-chat-agent-identity {
  display: inline-flex;
  width: fit-content;
  min-width: 0;
  align-items: center;
  gap: var(--buddy-chat-gap-block);

  img {
    width: var(--buddy-chat-avatar-size);
    height: var(--buddy-chat-avatar-size);
    flex: 0 0 auto;
    object-fit: contain;
  }

  span {
    min-width: 0;
    color: var(--buddy-text-primary);
    font-size: 13px;
  }
}
</style>
