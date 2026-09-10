<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { presentChatToolSearch } from '../../model/transcript/chatToolText'

const props = defineProps<{ output: string, toolName: string, language: BuddyLocale }>()
const { t } = useBuddyI18n(() => props.language)
const limit = shallowRef(200)
const content = computed(() => presentChatToolSearch(props.output, props.toolName, limit.value))
watch(() => props.toolName, () => limit.value = 200)
</script>

<template>
  <div class="buddy-chat-tool-search">
    <div class="buddy-chat-tool-search__viewport">
      <template v-for="(block, index) in content.blocks" :key="index">
        <section v-if="block.kind === 'file'" class="buddy-chat-tool-search__file">
          <header class="buddy-chat-tool-search__path">
            {{ block.path }}
          </header>
          <div v-for="(line, lineIndex) in block.lines" :key="lineIndex" class="buddy-chat-tool-search__line" :class="{ 'is-match': line.match }">
            <span class="buddy-chat-tool-search__number">{{ line.number }}</span>
            <code>{{ line.text }}</code>
          </div>
        </section>
        <pre v-else-if="block.text" class="buddy-chat-tool-search__text">{{ block.text }}</pre>
      </template>
    </div>
    <button v-if="content.remaining" class="buddy-chat-tool-search__more" type="button" @click="limit += 200">
      {{ t('desktop.chat.processToolMoreLines', { count: content.remaining }) }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.buddy-chat-tool-search__viewport { max-height: 15rem; overflow: auto; padding: 0 0 8px; }
.buddy-chat-tool-search__file { min-width: max-content; }
.buddy-chat-tool-search__path {
  position: sticky;
  top: 0;
  padding: 6px 10px;
  background: var(--buddy-surface-subtle);
  color: var(--buddy-text-secondary);
  font-family: var(--buddy-font-mono);
  font-size: var(--buddy-chat-caption-font-size);
  white-space: pre;
}

.buddy-chat-tool-search__line {
  display: flex;
  gap: 12px;
  padding: 0 10px;
  color: var(--buddy-text-muted);
  font-family: var(--buddy-font-mono);
  font-size: var(--buddy-chat-code-font-size);
  line-height: var(--buddy-chat-code-line-height);
  white-space: pre;
}

.buddy-chat-tool-search__number { flex: none; min-width: 4ch; color: var(--buddy-text-muted); text-align: right; font-variant-numeric: tabular-nums; }
.buddy-chat-tool-search__line.is-match { color: var(--buddy-chat-code-color); }
.buddy-chat-tool-search__line.is-match .buddy-chat-tool-search__number { color: var(--buddy-text-secondary); }
.buddy-chat-tool-search__line code { font: inherit; }
.buddy-chat-tool-search__text { margin: 0; padding: 4px 10px; color: var(--buddy-chat-code-color); font: var(--buddy-chat-code-font-size) / var(--buddy-chat-code-line-height) var(--buddy-font-mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.buddy-chat-tool-search__more {
  margin: 0 4px 4px;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: var(--buddy-text-muted);
  font: inherit;
  font-size: var(--buddy-chat-caption-font-size);
  cursor: pointer;

  &:hover { color: var(--buddy-text-primary); background: var(--buddy-state-hover); }
  &:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: 2px; }
}
</style>
