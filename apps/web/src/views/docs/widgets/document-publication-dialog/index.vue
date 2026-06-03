<script setup lang="ts">
import type {
  DocumentPublicationDialogEmits,
  DocumentPublicationDialogProps,
} from './typing'
import type {
  DocumentSinglePublicationInfo,
  DocumentSinglePublicationScope,
  DocumentSinglePublicationState,
} from '@/apis/document-publication'
import {
  DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE,
  DOCUMENT_SINGLE_PUBLICATION_ROUTE_PREFIX,
  DOCUMENT_SINGLE_PUBLICATION_SCOPE,
  DOCUMENT_SINGLE_PUBLICATION_SCOPE_LABELS,
  DOCUMENT_SINGLE_PUBLICATION_SCOPE_VALUES,
  DOCUMENT_SINGLE_PUBLICATION_STATE,
} from '@haohaoxue/samepage-contracts/document/publication/constants'
import { useClipboard } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import {
  getDocumentSinglePublication,
  updateDocumentSinglePublication,
} from '@/apis/document-publication'
import { ElMessage } from '@/utils/element-plus'

const props = withDefaults(defineProps<DocumentPublicationDialogProps>(), {
  documentId: '',
})
const emits = defineEmits<DocumentPublicationDialogEmits>()
const { copy, isSupported: isClipboardSupported } = useClipboard({
  legacy: true,
})

const publicationInfo = shallowRef<DocumentSinglePublicationInfo | null>(null)
const isLoading = shallowRef(false)
const isSaving = shallowRef(false)
const errorMessage = shallowRef('')

const normalizedDocumentId = computed(() => props.documentId?.trim() ?? '')
const publicationUrl = computed(() => normalizedDocumentId.value
  ? new URL(`${DOCUMENT_SINGLE_PUBLICATION_ROUTE_PREFIX}/${normalizedDocumentId.value}`, window.location.origin).toString()
  : '',
)
const effectiveState = computed(() =>
  publicationInfo.value?.effectivePublicationState ?? DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.UNPUBLISHED,
)
const currentState = computed(() =>
  publicationInfo.value?.singlePublicationState ?? DOCUMENT_SINGLE_PUBLICATION_STATE.INHERIT,
)
const currentScope = computed(() =>
  publicationInfo.value?.singlePublicationScope ?? DOCUMENT_SINGLE_PUBLICATION_SCOPE.PAGE,
)
const isPublished = computed(() =>
  effectiveState.value === DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.ENABLED
  || effectiveState.value === DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.INHERITED_ENABLED,
)
const publicationAccessTitle = computed(() => {
  if (isPublished.value) {
    return '互联网获得链接的人'
  }

  if (effectiveState.value === DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.DISABLED) {
    return '当前页面已关闭'
  }

  return '未开启'
})
const publicationAccessDescription = computed(() => {
  if (isPublished.value) {
    return '互联网获得链接的人可阅读'
  }

  if (currentState.value === DOCUMENT_SINGLE_PUBLICATION_STATE.DISABLED) {
    return '当前页面不会继承父级公开状态'
  }

  return '只有拥有文档权限的人可以访问'
})
const currentScopeLabel = computed(() => DOCUMENT_SINGLE_PUBLICATION_SCOPE_LABELS[currentScope.value])
const publicationScopeOptions = DOCUMENT_SINGLE_PUBLICATION_SCOPE_VALUES.map(value => ({
  label: DOCUMENT_SINGLE_PUBLICATION_SCOPE_LABELS[value],
  value,
}))

watch(
  () => [props.modelValue, normalizedDocumentId.value] as const,
  ([visible, documentId]) => {
    if (!visible || !documentId) {
      return
    }

    void loadPublicationInfo()
  },
  { immediate: true },
)

function handleVisibleChange(visible: boolean) {
  emits('update:modelValue', visible)
}

async function handlePublicationStateCommand(command: string | number | object) {
  await updatePublicationState(String(command) as DocumentSinglePublicationState, currentScope.value)
}

async function handlePublicationScopeCommand(command: string | number | object) {
  await updatePublicationState(DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED, String(command) as DocumentSinglePublicationScope)
}

async function loadPublicationInfo() {
  if (!normalizedDocumentId.value || isLoading.value) {
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    publicationInfo.value = await getDocumentSinglePublication(normalizedDocumentId.value)
  }
  catch (error) {
    publicationInfo.value = null
    errorMessage.value = error instanceof Error ? error.message : '加载页面分享设置失败'
  }
  finally {
    isLoading.value = false
  }
}

async function updatePublicationState(
  state: DocumentSinglePublicationState,
  scope: DocumentSinglePublicationScope = currentScope.value,
) {
  if (
    !normalizedDocumentId.value
    || isSaving.value
    || (currentState.value === state && currentScope.value === scope)
  ) {
    return
  }

  isSaving.value = true

  try {
    publicationInfo.value = await updateDocumentSinglePublication(normalizedDocumentId.value, { state, scope })
    ElMessage.success('页面分享状态已更新')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新页面分享状态失败')
  }
  finally {
    isSaving.value = false
  }
}

async function copyPublicationUrl() {
  if (!publicationUrl.value || !isPublished.value) {
    return
  }

  if (!isClipboardSupported.value) {
    ElMessage.error('当前环境不支持复制')
    return
  }

  try {
    await copy(publicationUrl.value)
    ElMessage.success('页面链接已复制')
  }
  catch {
    ElMessage.error('复制失败')
  }
}

function openPublication() {
  if (!publicationUrl.value || !isPublished.value) {
    return
  }

  window.open(publicationUrl.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <ElDialog
    class="document-publication-dialog"
    :model-value="props.modelValue"
    width="560px"
    append-to-body
    align-center
    body-class="pt-1"
    @update:model-value="handleVisibleChange"
  >
    <template #header>
      <div class="inline-flex items-center gap-2">
        <span class="text-[1.15rem] font-bold leading-[1.4] text-main">分享页面</span>
        <ElTooltip content="页面分享是公开阅读链接，不会创建协作者" placement="top">
          <span class="inline-flex text-[var(--brand-text-tertiary)]">
            <SvgIcon category="ui" icon="info" size="0.95rem" />
          </span>
        </ElTooltip>
      </div>
    </template>

    <div v-loading="isLoading" class="grid gap-4">
      <ElAlert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
      />

      <template v-else>
        <ElAlert
          v-if="effectiveState === DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.INHERITED_ENABLED"
          title="当前页面继承了父级公开状态"
          type="info"
          :closable="false"
          show-icon
        />

        <section class="grid gap-3">
          <div class="document-publication-dialog__access-row grid grid-cols-[auto_minmax(0,1fr)_max-content] items-center gap-3 max-[640px]:grid-cols-[auto_minmax(0,1fr)]">
            <span
              class="document-publication-dialog__access-icon inline-flex h-10 w-10 items-center justify-center rounded-full"
              :class="{ 'is-muted': !isPublished }"
              aria-hidden="true"
            >
              <SvgIcon
                category="ui"
                :icon="isPublished ? 'share-public' : 'lock'"
                size="1.15rem"
              />
            </span>

            <div class="min-w-0">
              <ElDropdown trigger="click" @command="handlePublicationStateCommand">
                <ElButton
                  text
                  class="h-auto gap-1 p-0 text-sm font-semibold text-main"
                  :loading="isSaving"
                >
                  {{ publicationAccessTitle }}
                  <SvgIcon category="ui" icon="chevron-down" size="0.82rem" />
                </ElButton>

                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem
                      :command="DOCUMENT_SINGLE_PUBLICATION_STATE.INHERIT"
                      :disabled="currentState === DOCUMENT_SINGLE_PUBLICATION_STATE.INHERIT"
                    >
                      继承父级
                    </ElDropdownItem>
                    <ElDropdownItem
                      :command="DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED"
                      :disabled="currentState === DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED"
                    >
                      公开链接
                    </ElDropdownItem>
                    <ElDropdownItem
                      :command="DOCUMENT_SINGLE_PUBLICATION_STATE.DISABLED"
                      :disabled="currentState === DOCUMENT_SINGLE_PUBLICATION_STATE.DISABLED"
                    >
                      关闭当前页
                    </ElDropdownItem>
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
              <p class="m-0 mt-1 text-[13px] leading-[1.45] text-secondary">
                {{ publicationAccessDescription }}
              </p>
            </div>

            <ElDropdown
              trigger="click"
              :disabled="!isPublished || isSaving"
              @command="handlePublicationScopeCommand"
            >
              <ElButton
                link
                type="primary"
                class="min-w-0 h-auto justify-end gap-1 p-0 text-sm font-semibold max-[640px]:col-span-full max-[640px]:w-full max-[640px]:justify-start"
                :disabled="!isPublished || isSaving"
              >
                {{ currentScopeLabel }}
                <SvgIcon category="ui" icon="chevron-down" size="0.82rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="option in publicationScopeOptions"
                    :key="option.value"
                    :command="option.value"
                    :disabled="option.value === currentScope"
                  >
                    {{ option.label }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </div>
        </section>
      </template>
    </div>

    <template #footer>
      <div class="document-publication-dialog__footer flex items-center justify-between gap-3 pt-3">
        <ElButton
          class="gap-1.5 rounded-lg"
          :disabled="!isPublished"
          @click="copyPublicationUrl"
        >
          <SvgIcon category="ui" icon="link" size="0.95rem" />
          复制链接
        </ElButton>
        <ElButton
          text
          :disabled="!isPublished"
          @click="openPublication"
        >
          查看页面
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.document-publication-dialog__access-icon {
  background: color-mix(in srgb, var(--brand-primary) 12%, white);
  color: var(--brand-primary);

  &.is-muted {
    background: color-mix(in srgb, var(--brand-fill-lighter) 82%, white);
    color: var(--brand-text-secondary);
  }
}

.document-publication-dialog__footer {
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  background: transparent;
}
</style>
