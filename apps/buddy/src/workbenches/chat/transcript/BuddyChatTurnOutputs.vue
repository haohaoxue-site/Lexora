<script setup lang="ts">
import type { LocalArtifact } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyArtifactGallery from './BuddyArtifactGallery.vue'
import BuddyArtifactTree from './BuddyArtifactTree.vue'

const props = defineProps<{
  artifacts: ReadonlyArray<LocalArtifact>
  language: BuddyLocale
}>()
const emit = defineEmits<{
  openArtifact: [artifactId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const hasNestedPaths = computed(() => props.artifacts.some(
  artifact => artifact.relativePath.includes('/'),
))
</script>

<template>
  <section class="buddy-chat-turn-outputs" data-testid="chat-turn-outputs">
    <header class="buddy-chat-turn-outputs__heading">
      <strong>{{ t('desktop.chat.turnOutputs') }}</strong>
      <small>{{ artifacts.length }}</small>
    </header>
    <BuddyArtifactTree
      v-if="hasNestedPaths"
      :artifacts="artifacts"
      :language="language"
      @open-artifact="emit('openArtifact', $event)"
    />
    <BuddyArtifactGallery
      v-else
      :artifacts="artifacts"
      :language="language"
      @open-artifact="emit('openArtifact', $event)"
    />
  </section>
</template>

<style scoped lang="scss">
.buddy-chat-turn-outputs {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: var(--buddy-chat-gap-tight);
}

.buddy-chat-turn-outputs__heading {
  display: flex;
  align-items: center;
  gap: 0.4rem;

  strong {
    color: var(--buddy-text-strong);
    font-size: var(--buddy-chat-meta-font-size);
    font-weight: 650;
  }

  small {
    color: var(--buddy-text-muted);
    font-size: var(--buddy-chat-caption-font-size);
    font-weight: 400;
  }
}
</style>
