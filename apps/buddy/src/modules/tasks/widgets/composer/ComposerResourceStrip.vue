<script setup lang="ts">
import type { ComposerResourceView } from '../../state/composer/typing'

import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Dismiss16Regular } from '@vicons/fluent'
import { NButton, NSpin } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { FileIcon } from '@/shared/ui/file-icon'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import BuddyImagePreview from '@/shared/ui/media/BuddyImagePreview.vue'

const props = defineProps<{
  disabled: boolean
  language: BuddyLocale
  resources: readonly ComposerResourceView[]
}>()
const emit = defineEmits<{
  remove: [resourceId: string]
  retry: [resourceId: string]
}>()
const { t } = useBuddyI18n(() => props.language)
const previewVisible = shallowRef(false)
const previewIndex = shallowRef(0)
const previewSources = computed(() => props.resources.flatMap(({ resource }) => (
  resource.state === 'ready' && resource.kind === 'image' && resource.previewUrl ? [resource.previewUrl] : []
)))
function openPreview(source: string) {
  previewIndex.value = previewSources.value.indexOf(source)
  previewVisible.value = true
}
</script>

<template>
  <div v-if="resources.length" class="composer-resource-strip">
    <div
      v-for="{ resource, canRetry } in resources"
      :key="resource.resourceId"
      class="composer-resource-strip__card"
      :class="{ 'is-failed': resource.state === 'failed' }"
    >
      <NSpin v-if="resource.state === 'importing'" :size="20" />
      <button
        v-else-if="resource.state === 'ready' && resource.kind === 'image' && resource.previewUrl"
        class="composer-resource-strip__preview"
        type="button"
        @click="openPreview(resource.previewUrl)"
      >
        <img :src="resource.previewUrl" :alt="resource.name" width="36" height="36">
      </button>
      <FileIcon v-else :name="resource.name" size="medium" />
      <span class="composer-resource-strip__details">
        <span>{{ resource.name }}</span>
        <small v-if="resource.state !== 'ready'">
          {{ t(resource.state === 'importing'
            ? 'desktop.chat.importingAttachment'
            : canRetry
              ? 'desktop.chat.failedAttachment'
              : 'desktop.chat.attachmentSourceUnavailable') }}
        </small>
      </span>
      <NButton v-if="resource.state === 'failed' && canRetry" text :disabled="disabled" size="tiny" @click="emit('retry', resource.resourceId)">
        {{ t('desktop.chat.retryAttachment') }}
      </NButton>
      <NButton
        class="buddy-icon-button"
        quaternary
        size="tiny"
        :disabled="disabled"
        :aria-label="t('desktop.chat.removeAttachment')"
        @click="emit('remove', resource.resourceId)"
      >
        <template #icon>
          <DesktopIcon :component="Dismiss16Regular" />
        </template>
      </NButton>
    </div>
  </div>
  <BuddyImagePreview v-model:show="previewVisible" v-model:current="previewIndex" :language="language" :sources="previewSources" />
</template>

<style scoped lang="scss">
.composer-resource-strip {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.45rem;
  margin-bottom: 0.5rem;
  overflow-x: auto;
  overscroll-behavior-inline: contain;

  &__card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    max-width: min(18rem, 100%);
    flex: 0 0 auto;
    border: 1px solid var(--buddy-border-subtle);
    border-radius: var(--buddy-radius-micro);
    background: var(--buddy-surface-raised);
    padding: 0.4rem;
    font-size: 0.75rem;
  }

  &__details {
    display: grid;
    min-width: 0;
    max-width: 13rem;

    > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: var(--buddy-text-muted);
    }
  }

  &__preview {
    display: flex;
    border: 0;
    border-radius: var(--buddy-radius-micro);
    overflow: hidden;
    background: transparent;
    cursor: pointer;
    padding: 0;

    img { object-fit: cover; }
  }
}
</style>
