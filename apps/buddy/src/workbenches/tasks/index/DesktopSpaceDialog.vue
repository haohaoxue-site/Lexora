<script setup lang="ts">
import type { LocalSpace } from '@buddy-electron/shared/localChatApi'
import type { SelectOption } from 'naive-ui'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type {
  TaskSpaceInput,
  TaskSpacePrimaryDirectoryInput,
} from '@/workbenches/tasks/state/useTaskSpaces'
import { NAlert, NButton, NForm, NFormItem, NInput, NModal, NSelect } from 'naive-ui'
import { computed, h, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSpacePrimaryDirectoryField from './DesktopSpacePrimaryDirectoryField.vue'

const props = defineProps<{
  language: BuddyLocale
  space: LocalSpace | null
  selectDirectory: () => Promise<string | null>
  show: boolean
}>()
const emit = defineEmits<{
  'save': [input: TaskSpaceInput]
  'update:show': [show: boolean]
}>()
const { t } = useBuddyI18n(() => props.language)
const name = shallowRef('')
const memoryScope = shallowRef<TaskSpaceInput['memoryScope']>('personal_and_space')
const primaryDirectory = shallowRef<TaskSpacePrimaryDirectoryInput | null>(null)
const memoryOptions = computed(() => [
  {
    description: t('desktop.tasks.spaceMemoryDefaultDescription'),
    label: t('desktop.tasks.spaceMemoryDefault'),
    value: 'personal_and_space',
  },
  {
    description: t('desktop.tasks.spaceMemoryIsolatedDescription'),
    label: t('desktop.tasks.spaceMemoryIsolated'),
    value: 'space_only',
  },
])
const dialogTitle = computed(() => props.space
  ? t('desktop.tasks.editSpaceTitle')
  : t('desktop.tasks.createSpaceTitle'))
const directoryConfigurationChanged = computed(() => {
  if (!props.space)
    return primaryDirectory.value !== null
  return JSON.stringify(normalizePrimaryDirectory(primaryDirectory.value)) !== JSON.stringify(
    normalizePrimaryDirectory(
      props.space.primaryDirectory
        ? {
            id: props.space.primaryDirectory.id,
            root: props.space.primaryDirectory.root,
          }
        : null,
    ),
  )
})
const directoryEditingDisabled = computed(() => Boolean(
  props.space && props.space.activeRunCount > 0,
))
const directoryChangeBlocked = computed(() => Boolean(
  directoryEditingDisabled.value
  && directoryConfigurationChanged.value,
))

watch(
  [() => props.show, () => props.space],
  ([show, space]) => {
    if (!show)
      return
    name.value = space?.name ?? ''
    memoryScope.value = space?.memoryScope ?? 'personal_and_space'
    primaryDirectory.value = space?.primaryDirectory
      ? {
          id: space.primaryDirectory.id,
          root: space.primaryDirectory.root,
        }
      : null
  },
  { immediate: true },
)

async function selectPrimaryDirectory() {
  if (primaryDirectory.value)
    return
  const selected = await props.selectDirectory()
  if (!selected)
    return
  const existingAdditionalDirectory = props.space?.additionalDirectories.find(
    directory => directory.root === selected,
  )
  primaryDirectory.value = {
    id: existingAdditionalDirectory?.id ?? null,
    root: selected,
  }
}

function confirm() {
  const spaceName = name.value.trim()
  if (!spaceName || directoryChangeBlocked.value)
    return
  emit('save', {
    memoryScope: memoryScope.value,
    name: spaceName,
    primaryDirectory: primaryDirectory.value ? { ...primaryDirectory.value } : null,
  })
  emit('update:show', false)
}

function renderMemoryLabel(option: SelectOption, selected: boolean) {
  if (selected)
    return option.label as string
  return h('div', { class: 'desktop-space-dialog__memory-option' }, [
    h('strong', {}, option.label as string),
    h('small', {}, option.description as string),
  ])
}

function normalizePrimaryDirectory(primary: TaskSpacePrimaryDirectoryInput | null) {
  return primary
    ? {
        id: primary.id,
        root: primary.root,
      }
    : null
}
</script>

<template>
  <NModal
    class="desktop-space-dialog"
    preset="card"
    :show="show"
    :style="{ width: 'min(34rem, calc(100vw - 2rem))' }"
    :title="dialogTitle"
    @update:show="emit('update:show', $event)"
  >
    <NForm @submit.prevent="confirm">
      <NFormItem :label="t('desktop.tasks.spaceName')" required>
        <NInput
          v-model:value="name"
          autofocus
          maxlength="80"
          :placeholder="t('desktop.tasks.spaceNamePlaceholder')"
        />
      </NFormItem>
      <NFormItem :label="t('desktop.tasks.spaceMemory')">
        <NSelect
          v-model:value="memoryScope"
          :consistent-menu-width="false"
          :options="memoryOptions"
          :render-label="renderMemoryLabel"
        />
      </NFormItem>
      <NFormItem :show-label="false">
        <DesktopSpacePrimaryDirectoryField
          :disabled="directoryEditingDisabled"
          :language="language"
          :primary-directory="primaryDirectory"
          @remove-primary="primaryDirectory = null"
          @select-primary="selectPrimaryDirectory"
        />
      </NFormItem>
      <NAlert
        v-if="directoryChangeBlocked"
        :show-icon="false"
        type="warning"
      >
        {{ t('desktop.tasks.spaceActiveRunDirectoryWarning') }}
      </NAlert>
      <NAlert
        v-else-if="space && space.activeRunCount > 0"
        :show-icon="false"
        type="info"
      >
        {{ t('desktop.tasks.spaceActiveRunUpdateWarning') }}
      </NAlert>
    </NForm>
    <template #footer>
      <div class="desktop-space-dialog__actions">
        <NButton @click="emit('update:show', false)">
          {{ t('common.cancel') }}
        </NButton>
        <NButton
          type="primary"
          :disabled="!name.trim() || directoryChangeBlocked"
          @click="confirm"
        >
          {{ space ? t('common.save') : t('common.confirm') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
:global(.desktop-space-dialog__memory-option) {
  display: grid;
  min-width: 22rem;
  gap: 0.15rem;
  padding: 0.25rem 0;
}

:global(.desktop-space-dialog__memory-option strong) {
  font-weight: 600;
}

:global(.desktop-space-dialog__memory-option small) {
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  white-space: normal;
}

.desktop-space-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
