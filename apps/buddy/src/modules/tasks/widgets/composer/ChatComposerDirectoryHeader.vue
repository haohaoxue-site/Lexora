<script setup lang="ts">
import type { BuddyComposerDirectory } from '@buddy-shared/conversation/composerResource'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { composerReferencePath } from '@buddy-shared/conversation/composerReferencePath'
import { NTooltip } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { composerDirectoryBreadcrumbs, composerParentDirectory } from './chatComposerSourcePresentation'

const props = defineProps<{ directory: BuddyComposerDirectory, language: BuddyLocale }>()
const emit = defineEmits<{ navigate: [path: string] }>()
const { t } = useBuddyI18n(() => props.language)
const breadcrumbs = computed(() => composerDirectoryBreadcrumbs(props.directory))
const external = computed(() => composerReferencePath(props.directory.path, props.directory.workingDirectory) === props.directory.path)
const parent = computed(() => composerParentDirectory(props.directory))
</script>

<template>
  <div class="chat-composer-directory-header" @mousedown.prevent>
    <NTooltip v-if="directory.workingDirectory" :delay="400" to=".buddy-app">
      <template #trigger>
        <button class="chat-composer-directory-header__root" type="button" tabindex="-1" @click="emit('navigate', directory.workingDirectory)">
          {{ t(external ? 'desktop.chat.sourcePickerExternal' : 'desktop.chat.sourcePickerWorkspace') }}
        </button>
      </template>
      {{ directory.workingDirectory }}
    </NTooltip>
    <span v-else class="chat-composer-directory-header__root">{{ t('desktop.chat.sourcePickerDirectory') }}</span>
    <span v-if="external" class="chat-composer-directory-header__external">{{ directory.path }}</span>
    <template v-for="crumb in breadcrumbs" :key="crumb.path">
      <span class="chat-composer-directory-header__separator">›</span>
      <NTooltip :delay="400" to=".buddy-app">
        <template #trigger>
          <button type="button" tabindex="-1" @click="emit('navigate', crumb.path)">
            {{ crumb.name }}
          </button>
        </template>
        {{ crumb.path }}
      </NTooltip>
    </template>
    <button v-if="parent" class="chat-composer-directory-header__back" type="button" tabindex="-1" @click="emit('navigate', parent)">
      {{ t('desktop.chat.sourcePickerParent') }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.chat-composer-directory-header {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.35rem 0.4rem 0.15rem;
  color: var(--buddy-text-muted);
  font-size: 0.62rem;

  button {
    min-width: 0;
    overflow: hidden;
    padding: 0.1rem 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;

    &:hover { color: var(--buddy-text-strong); }
  }
}

.chat-composer-directory-header__root {
  flex: none;
}

.chat-composer-directory-header .chat-composer-directory-header__root {
  font-weight: 600;
}

.chat-composer-directory-header__separator { flex: none; }

.chat-composer-directory-header__external {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-composer-directory-header__back {
  flex: none;
  margin-left: auto;
}
</style>
