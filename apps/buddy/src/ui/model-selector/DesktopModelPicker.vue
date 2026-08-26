<script setup lang="ts">
import type {
  LocalProvider,
  LocalRuntimeModelOption,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Checkmark16Regular, Search20Regular } from '@vicons/fluent'
import { NIcon, NInput } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

interface ModelGroup {
  models: ReadonlyArray<LocalRuntimeModelOption>
  providerId: string
  providerName: string
}

const props = defineProps<{
  language: BuddyLocale
  models: ReadonlyArray<LocalRuntimeModelOption>
  providers: ReadonlyArray<LocalProvider>
  selectedModelId: string | null
}>()

const emit = defineEmits<{
  select: [modelId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const query = shallowRef('')
const activeProviderId = shallowRef(resolveSelectedProviderId() ?? props.models[0]?.providerId ?? null)

const providerNames = computed(() => new Map(
  props.providers.map(provider => [provider.id, provider.displayName]),
))
const providerOrder = computed(() => new Map(
  props.providers.map((provider, index) => [provider.id, index]),
))
const visibleGroups = computed<ReadonlyArray<ModelGroup>>(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  const groups = new Map<string, LocalRuntimeModelOption[]>()

  for (const model of props.models) {
    const providerName = providerNames.value.get(model.providerId) ?? model.providerId
    const matches = !normalizedQuery
      || providerName.toLocaleLowerCase().includes(normalizedQuery)
      || model.displayName.toLocaleLowerCase().includes(normalizedQuery)
      || model.modelId.toLocaleLowerCase().includes(normalizedQuery)
    if (!matches)
      continue
    const models = groups.get(model.providerId) ?? []
    models.push(model)
    groups.set(model.providerId, models)
  }

  return [...groups.entries()]
    .map(([providerId, models]) => ({
      models,
      providerId,
      providerName: providerNames.value.get(providerId) ?? providerId,
    }))
    .sort((left, right) => (
      (providerOrder.value.get(left.providerId) ?? Number.MAX_SAFE_INTEGER)
      - (providerOrder.value.get(right.providerId) ?? Number.MAX_SAFE_INTEGER)
      || left.providerName.localeCompare(right.providerName)
    ))
})
const activeGroup = computed(() => (
  visibleGroups.value.find(group => group.providerId === activeProviderId.value)
  ?? visibleGroups.value.find(group => group.providerId === resolveSelectedProviderId())
  ?? visibleGroups.value[0]
  ?? null
))

function resolveSelectedProviderId(): string | null {
  return props.models.find(model => modelKey(model) === props.selectedModelId)?.providerId ?? null
}

function modelKey(model: Pick<LocalRuntimeModelOption, 'modelId' | 'providerId'>): string {
  return `${model.providerId}:${model.modelId}`
}
</script>

<template>
  <section class="desktop-model-picker">
    <div class="desktop-model-picker__search">
      <NInput
        v-model:value="query"
        clearable
        size="small"
        :placeholder="t('desktop.chat.searchModels')"
      >
        <template #prefix>
          <NIcon :component="Search20Regular" />
        </template>
      </NInput>
    </div>

    <div v-if="visibleGroups.length" class="desktop-model-picker__body">
      <div class="desktop-model-picker__providers">
        <button
          v-for="group in visibleGroups"
          :key="group.providerId"
          class="desktop-model-picker__provider"
          :class="{ 'is-active': activeGroup?.providerId === group.providerId }"
          type="button"
          :aria-pressed="activeGroup?.providerId === group.providerId"
          @click="activeProviderId = group.providerId"
        >
          <span>{{ group.providerName }}</span>
          <small>{{ group.models.length }}</small>
        </button>
      </div>

      <div class="desktop-model-picker__models" role="menu">
        <button
          v-for="model in activeGroup?.models ?? []"
          :key="modelKey(model)"
          class="desktop-model-picker__model"
          type="button"
          role="menuitemradio"
          :aria-checked="selectedModelId === modelKey(model)"
          @click="emit('select', modelKey(model))"
        >
          <span class="desktop-model-picker__model-copy">
            <strong>{{ model.displayName }}</strong>
            <small>{{ model.modelId }}</small>
          </span>
          <NIcon
            v-if="selectedModelId === modelKey(model)"
            :component="Checkmark16Regular"
          />
        </button>
      </div>
    </div>

    <span v-else class="desktop-model-picker__empty">
      {{ t('desktop.chat.noMatchingModels') }}
    </span>
  </section>
</template>

<style scoped>
.desktop-model-picker {
  display: grid;
  overflow: hidden;
  width: min(29rem, calc(100vw - 18rem));
  min-width: 22rem;
  max-height: min(25rem, 62vh);
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--desktop-model-popover-radius, 3px);
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-overlay);
}

.desktop-model-picker__search {
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0.55rem;
}

.desktop-model-picker__body {
  display: grid;
  height: min(17.75rem, calc(62vh - 6.5rem));
  min-height: 0;
  grid-template-columns: minmax(8.5rem, 0.8fr) minmax(12rem, 1.35fr);
  overflow: hidden;
}

.desktop-model-picker__providers,
.desktop-model-picker__models {
  display: grid;
  align-content: start;
  gap: 0.15rem;
  overflow: hidden auto;
  padding: 0.45rem;
}

.desktop-model-picker__providers {
  border-right: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-subtle);
}

.desktop-model-picker__provider,
.desktop-model-picker__model {
  border: 0;
  border-radius: var(--buddy-menu-item-radius);
  background: transparent;
  color: var(--buddy-text-strong);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.desktop-model-picker__provider,
.desktop-model-picker__model {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.42rem 0.55rem;
}

.desktop-model-picker__provider {
  min-height: 2.2rem;
}

.desktop-model-picker__model {
  height: 3.25rem;
  min-height: 3.25rem;
}

.desktop-model-picker__provider:hover,
.desktop-model-picker__provider:focus-visible,
.desktop-model-picker__provider.is-active,
.desktop-model-picker__model:hover,
.desktop-model-picker__model:focus-visible {
  background: var(--buddy-state-hover);
  outline: 0;
}

.desktop-model-picker__provider.is-active {
  background: var(--buddy-accent-surface);
  color: var(--buddy-accent-on-surface);
  font-weight: 650;
}

.desktop-model-picker__provider span,
.desktop-model-picker__model-copy strong,
.desktop-model-picker__model-copy small {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-model-picker__provider span {
  font-size: 0.76rem;
}

.desktop-model-picker__provider small {
  color: var(--buddy-text-muted);
  font-size: 0.66rem;
}

.desktop-model-picker__model-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.08rem;
}

.desktop-model-picker__model-copy strong {
  font-size: 0.78rem;
  font-weight: 650;
}

.desktop-model-picker__model-copy small {
  color: var(--buddy-text-muted);
  font-size: 0.66rem;
}

.desktop-model-picker__empty {
  min-height: 8rem;
  color: var(--buddy-text-muted);
  font-size: 0.72rem;
  padding: 2.5rem 1rem;
  text-align: center;
}

@media (max-width: 760px) {
  .desktop-model-picker {
    width: min(24rem, calc(100vw - 2rem));
    min-width: 20rem;
  }
}
</style>
