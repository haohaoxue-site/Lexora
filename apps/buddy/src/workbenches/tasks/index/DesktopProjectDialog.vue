<script setup lang="ts">
import type { LocalProject } from '@buddy-electron/shared/localChatApi'
import type { SelectOption } from 'naive-ui'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NAlert, NButton, NForm, NFormItem, NInput, NModal, NSelect } from 'naive-ui'
import { computed, h, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  language: BuddyLocale
  project: LocalProject | null
  show: boolean
}>()
const emit = defineEmits<{
  'save': [input: {
    instructions: string
    memoryScope: 'personal_and_project' | 'project_only'
    name: string
    root: string | null
  }]
  'update:show': [show: boolean]
}>()
const desktopApi = requireDesktopApi()
const { t } = useBuddyI18n(() => props.language)
const name = shallowRef('')
const memoryScope = shallowRef<'personal_and_project' | 'project_only'>('personal_and_project')
const root = shallowRef<string | null>(null)
const instructions = shallowRef('')
const selectingDirectory = shallowRef(false)
const memoryOptions = computed(() => [
  {
    description: t('desktop.tasks.projectMemoryDefaultDescription'),
    label: t('desktop.tasks.projectMemoryDefault'),
    value: 'personal_and_project',
  },
  {
    description: t('desktop.tasks.projectMemoryIsolatedDescription'),
    label: t('desktop.tasks.projectMemoryIsolated'),
    value: 'project_only',
  },
])
const dialogTitle = computed(() => props.project
  ? t('desktop.tasks.editProjectTitle')
  : t('desktop.tasks.createProjectTitle'))

watch(
  [() => props.show, () => props.project],
  ([show, project]) => {
    if (!show)
      return
    name.value = project?.name ?? ''
    memoryScope.value = project?.memoryScope ?? 'personal_and_project'
    root.value = project?.directoryRoot ?? null
    instructions.value = project?.instructions ?? ''
  },
  { immediate: true },
)

async function selectDirectory() {
  if (selectingDirectory.value)
    return
  selectingDirectory.value = true
  try {
    const selected = await desktopApi.localChat.projects.selectDirectory()
    if (selected)
      root.value = selected
  }
  finally {
    selectingDirectory.value = false
  }
}

function confirm() {
  const projectName = name.value.trim()
  if (!projectName)
    return
  emit('save', {
    instructions: instructions.value.trim(),
    memoryScope: memoryScope.value,
    name: projectName,
    root: root.value,
  })
  emit('update:show', false)
}

function renderMemoryLabel(option: SelectOption, selected: boolean) {
  if (selected)
    return option.label as string
  return h('div', { class: 'desktop-project-create-dialog__memory-option' }, [
    h('strong', {}, option.label as string),
    h('small', {}, option.description as string),
  ])
}

function requireDesktopApi() {
  const api = window.lexoraDesktop
  if (!api)
    throw new Error('Lexora Buddy Desktop bridge is unavailable')
  return api
}
</script>

<template>
  <NModal
    class="desktop-project-create-dialog"
    preset="card"
    :show="show"
    :style="{ width: 'min(32rem, calc(100vw - 2rem))' }"
    :title="dialogTitle"
    @update:show="emit('update:show', $event)"
  >
    <NForm @submit.prevent="confirm">
      <NFormItem :label="t('desktop.tasks.projectName')" required>
        <NInput
          v-model:value="name"
          autofocus
          maxlength="80"
          :placeholder="t('desktop.tasks.projectNamePlaceholder')"
        />
      </NFormItem>
      <NFormItem :label="t('desktop.tasks.projectMemory')">
        <NSelect
          v-model:value="memoryScope"
          :consistent-menu-width="false"
          :options="memoryOptions"
          :render-label="renderMemoryLabel"
        />
      </NFormItem>
      <NFormItem :label="t('desktop.tasks.projectDirectory')">
        <div class="desktop-project-create-dialog__directory">
          <NInput
            readonly
            :placeholder="t('desktop.tasks.projectDirectoryPlaceholder')"
            :value="root ?? ''"
          />
          <NButton :loading="selectingDirectory" @click="selectDirectory">
            {{ t('desktop.tasks.selectProjectDirectory') }}
          </NButton>
          <NButton v-if="root" quaternary @click="root = null">
            {{ t('desktop.tasks.clearProjectDirectory') }}
          </NButton>
        </div>
      </NFormItem>
      <p class="desktop-project-create-dialog__directory-note">
        {{ t('desktop.tasks.projectDirectoryDescription') }}
      </p>
      <NFormItem :label="t('desktop.tasks.projectInstructions')">
        <NInput
          v-model:value="instructions"
          maxlength="8000"
          :placeholder="t('desktop.tasks.projectInstructionsPlaceholder')"
          :autosize="{ minRows: 4, maxRows: 10 }"
          type="textarea"
        />
      </NFormItem>
      <NAlert
        v-if="project && project.activeRunCount > 0"
        :show-icon="false"
        type="warning"
      >
        {{ t('desktop.tasks.projectActiveRunUpdateWarning') }}
      </NAlert>
    </NForm>
    <template #footer>
      <div class="desktop-project-create-dialog__actions">
        <NButton @click="emit('update:show', false)">
          {{ t('common.cancel') }}
        </NButton>
        <NButton type="primary" :disabled="!name.trim()" @click="confirm">
          {{ project ? t('common.save') : t('common.confirm') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.desktop-project-create-dialog__directory {
  display: flex;
  width: 100%;
  gap: 0.5rem;
}

.desktop-project-create-dialog__directory-note {
  margin: -0.65rem 0 1rem;
  color: var(--buddy-text-secondary);
  font-size: 0.72rem;
  line-height: 1.55;
}

:global(.desktop-project-create-dialog__memory-option) {
  display: grid;
  min-width: 22rem;
  gap: 0.15rem;
  padding: 0.25rem 0;
}

:global(.desktop-project-create-dialog__memory-option strong) {
  font-weight: 600;
}

:global(.desktop-project-create-dialog__memory-option small) {
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  white-space: normal;
}

.desktop-project-create-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
