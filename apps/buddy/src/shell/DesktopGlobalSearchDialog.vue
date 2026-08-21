<script setup lang="ts">
import type { LocalConversation, LocalProject } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Chat20Regular, Folder20Regular, Search24Regular } from '@vicons/fluent'
import { useDebounceFn } from '@vueuse/core'
import { NIcon, NInput, NModal } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  conversations: ReadonlyArray<LocalConversation>
  language: BuddyLocale
  projects: ReadonlyArray<LocalProject>
  show: boolean
}>()
const emit = defineEmits<{
  'openConversation': [conversationId: string]
  'openProject': [projectId: string]
  'update:show': [show: boolean]
}>()

const query = shallowRef('')
const debouncedQuery = shallowRef('')
const { t } = useBuddyI18n(() => props.language)
const activeProjects = computed(() => props.projects.filter(project => project.revokedAt === null))
const projectNames = computed(() => new Map(activeProjects.value.map(project => [project.id, project.name])))
const normalizedQuery = computed(() => debouncedQuery.value.trim().toLocaleLowerCase())
const matchingConversations = computed(() => {
  if (!normalizedQuery.value)
    return []
  return props.conversations.filter((conversation) => {
    const projectName = conversation.projectId === null
      ? ''
      : projectNames.value.get(conversation.projectId) ?? ''
    return formatConversationTitle(conversation).toLocaleLowerCase().includes(normalizedQuery.value)
      || projectName.toLocaleLowerCase().includes(normalizedQuery.value)
  })
})
const matchingProjects = computed(() => {
  if (!normalizedQuery.value)
    return []
  return activeProjects.value.filter(project => (
    project.name.toLocaleLowerCase().includes(normalizedQuery.value)
    || project.root.toLocaleLowerCase().includes(normalizedQuery.value)
  ))
})
const hasResults = computed(() => matchingConversations.value.length > 0 || matchingProjects.value.length > 0)
const updateDebouncedQuery = useDebounceFn((value: string) => {
  debouncedQuery.value = value
}, 220)

watch(query, (value) => {
  updateDebouncedQuery(value)
})

watch(() => props.show, (show) => {
  if (!show)
    return
  query.value = ''
  debouncedQuery.value = ''
})

function formatConversationTitle(conversation: LocalConversation) {
  return conversation.title?.trim() || t('desktop.chat.untitled')
}

function conversationContext(conversation: LocalConversation) {
  return conversation.projectId === null
    ? t('desktop.search.recentContext')
    : projectNames.value.get(conversation.projectId) ?? t('desktop.search.projectContext')
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="desktop-global-search-dialog"
    :style="{ width: 'min(44rem, calc(100vw - 2rem))' }"
    :title="t('desktop.search.title')"
    @update:show="emit('update:show', $event)"
  >
    <NInput
      v-model:value="query"
      clearable
      size="large"
      :placeholder="t('desktop.search.placeholder')"
    >
      <template #prefix>
        <NIcon :component="Search24Regular" />
      </template>
    </NInput>

    <div v-if="!normalizedQuery" class="desktop-global-search-dialog__initial">
      <span aria-hidden="true">
        <NIcon :component="Search24Regular" />
      </span>
      <p>{{ t('desktop.search.description') }}</p>
    </div>

    <div v-else class="desktop-global-search-dialog__results">
      <template v-if="hasResults">
        <section v-if="matchingConversations.length" class="desktop-global-search-dialog__section">
          <h3 class="desktop-global-search-dialog__section-title">
            {{ t('desktop.search.conversationCount', { count: matchingConversations.length }) }}
          </h3>
          <button
            v-for="conversation in matchingConversations"
            :key="conversation.id"
            class="desktop-global-search-dialog__result"
            type="button"
            @click="emit('openConversation', conversation.id)"
          >
            <NIcon :component="Chat20Regular" />
            <span>
              <strong>{{ formatConversationTitle(conversation) }}</strong>
              <small>{{ conversationContext(conversation) }}</small>
            </span>
          </button>
        </section>

        <section v-if="matchingProjects.length" class="desktop-global-search-dialog__section">
          <h3 class="desktop-global-search-dialog__section-title">
            {{ t('desktop.search.projectCount', { count: matchingProjects.length }) }}
          </h3>
          <button
            v-for="project in matchingProjects"
            :key="project.id"
            class="desktop-global-search-dialog__result"
            type="button"
            @click="emit('openProject', project.id)"
          >
            <NIcon :component="Folder20Regular" />
            <span>
              <strong>{{ project.name }}</strong>
              <small>{{ project.root }}</small>
            </span>
          </button>
        </section>
      </template>

      <div v-else class="desktop-global-search-dialog__no-results">
        <NIcon :component="Search24Regular" />
        <p>{{ t('desktop.search.noResults') }}</p>
      </div>
    </div>
  </NModal>
</template>

<style scoped lang="scss">
.desktop-global-search-dialog__initial,
.desktop-global-search-dialog__results {
  height: min(22rem, calc(100vh - 13rem));
  min-height: 15rem;
  margin-top: 1rem;
}

.desktop-global-search-dialog__initial {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;

  > span {
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border-radius: 0.75rem;
    background: var(--buddy-fill-light);
    color: var(--buddy-text-secondary);
    font-size: 1.4rem;
  }

  > p {
    margin: 1rem 0 0;
    color: var(--buddy-text-secondary);
    font-size: 0.82rem;
  }
}

.desktop-global-search-dialog__results {
  display: grid;
  align-content: start;
  gap: 1rem;
  overflow-y: auto;
  padding-right: 0.2rem;
}

.desktop-global-search-dialog__section {
  display: grid;
  gap: 0.25rem;
}

.desktop-global-search-dialog__section-title {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-size: var(--buddy-sidebar-section-font-size);
  font-weight: var(--buddy-sidebar-section-font-weight);
  padding: 0.25rem 0.4rem;
}

.desktop-global-search-dialog__result {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  padding: 0.65rem 0.75rem;
  text-align: left;

  > .n-icon {
    flex: none;
    font-size: 1rem;
  }

  > span {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--buddy-text-primary);
    font-size: 0.84rem;
    font-weight: 500;
  }

  small {
    color: var(--buddy-text-secondary);
    font-size: 0.72rem;
  }

  &:hover {
    background: var(--buddy-nav-active-bg);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }
}

.desktop-global-search-dialog__no-results {
  display: grid;
  height: 100%;
  place-items: center;
  align-content: center;
  gap: 0.75rem;
  color: var(--buddy-text-secondary);
  text-align: center;

  > .n-icon {
    font-size: 1.5rem;
  }

  > p {
    margin: 0;
    font-size: 0.82rem;
  }
}
</style>
