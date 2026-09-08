<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ChatPromptContextOption } from '@/modules/prompt-input'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { FileIcon } from '@/shared/ui/file-icon'

const props = withDefaults(defineProps<{
  activeIndex?: number
  accessibleLabel: string
  emptyLabel: string
  filesOnly?: boolean
  language: BuddyLocale
  loading?: boolean
  loadingLabel: string
  options: ReadonlyArray<ChatPromptContextOption>
}>(), {
  activeIndex: -1,
  filesOnly: false,
  loading: false,
})

const emit = defineEmits<{
  select: [option: ChatPromptContextOption]
}>()

const { t } = useBuddyI18n(() => props.language)
const visibleOptions = computed(() => props.options.filter(option => (
  (!props.filesOnly || option.kind === 'file') && (!props.filesOnly || option.source)
)))
const groupedOptions = computed(() => ['space', 'history', 'artifact'].flatMap((category) => {
  const options = visibleOptions.value.filter(option => option.category === category)
  return options.length ? [{ category, options }] : []
}).concat(visibleOptions.value.some(option => !option.category)
  ? [{ category: '', options: visibleOptions.value.filter(option => !option.category) }]
  : []))

function kindLabel(option: ChatPromptContextOption): string {
  return option.kind === 'skill' ? '$' : '/'
}

function groupLabel(category: string): string {
  if (category === 'space')
    return t('desktop.chat.sourcePickerSpace')
  if (category === 'history')
    return t('desktop.chat.sourcePickerHistory')
  return t('desktop.chat.sourcePickerArtifacts')
}

function select(option: ChatPromptContextOption) {
  emit('select', option)
}
</script>

<template>
  <div class="chat-composer-source-picker" role="listbox" :aria-label="accessibleLabel">
    <span v-if="loading && !visibleOptions.length" class="chat-composer-source-picker__empty">
      {{ loadingLabel }}
    </span>
    <template v-for="group in groupedOptions" :key="group.category">
      <div v-if="group.category" class="chat-composer-source-picker__group">
        {{ groupLabel(group.category) }}
      </div>
      <button
        v-for="option in group.options"
        :key="`${option.value}:${option.path ?? ''}`"
        class="chat-composer-source-picker__option"
        :class="{ 'is-active': visibleOptions.indexOf(option) === activeIndex }"
        role="option"
        :aria-selected="visibleOptions.indexOf(option) === activeIndex"
        type="button"
        @mousedown.prevent
        @click="select(option)"
      >
        <span
          class="chat-composer-source-picker__kind"
          :class="{ 'is-file': option.kind === 'file' }"
        >
          <FileIcon v-if="option.kind === 'file'" :name="option.label" />
          <template v-else>{{ kindLabel(option) }}</template>
        </span>
        <span class="chat-composer-source-picker__copy">
          <strong>{{ option.label }}</strong>
          <small v-if="option.description">{{ option.description }}</small>
        </span>
      </button>
    </template>
    <span v-if="!loading && !visibleOptions.length" class="chat-composer-source-picker__empty">
      {{ emptyLabel }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.chat-composer-source-picker {
  display: grid;
  max-height: 15rem;
  min-width: min(24rem, 100%);
  overflow-y: auto;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.55rem;
  background: var(--buddy-surface-raised);
  box-shadow: none;
  padding: 0.25rem;
}

.chat-composer-source-picker__option {
  display: grid;
  grid-template-columns: 1.4rem minmax(0, 1fr);
  align-items: center;
  gap: 0.45rem;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--buddy-text-strong);
  cursor: pointer;
  padding: 0.35rem 0.4rem;
  text-align: left;

  &:hover,
  &:focus-visible,
  &.is-active {
    background: var(--buddy-state-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.chat-composer-source-picker__group {
  color: var(--buddy-text-muted);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0;
  padding: 0.35rem 0.4rem 0.15rem;
  text-transform: uppercase;
}

.chat-composer-source-picker__kind {
  display: grid;
  width: 1.35rem;
  height: 1.35rem;
  place-items: center;
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-accent-surface);
  color: var(--buddy-accent-on-surface);
  font-size: 0.75rem;
  font-weight: 700;

  &.is-file {
    background: transparent;
  }

  &.is-file :deep(.buddy-file-icon) {
    width: 1.2rem;
    height: 1.2rem;
  }
}

.chat-composer-source-picker__copy {
  display: grid;
  min-width: 0;

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 0.76rem;
    line-height: 1.25;
  }

  small {
    color: var(--buddy-text-secondary);
    font-size: 0.66rem;
    line-height: 1.2;
  }
}

.chat-composer-source-picker__empty {
  color: var(--buddy-text-muted);
  font-size: 0.7rem;
  padding: 0.55rem 0.4rem;
}
</style>
