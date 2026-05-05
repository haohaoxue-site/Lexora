<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { ModelServiceConsoleMode } from '../typing'
import type { AiModelType } from '@/apis/ai'
import { ElSwitch, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { useTemplateRef } from 'vue'
import { useModelServiceConsole } from '../composables/useModelServiceConsole'
import { AI_MODEL_TYPE_LABELS } from '../utils/aiModel'

const props = defineProps<{
  mode: ModelServiceConsoleMode
}>()

const MODEL_TYPE_COLUMN_WIDTH = 108
const MODEL_STATUS_COLUMN_WIDTH = 116

const createFormRef = useTemplateRef<FormInstance>('createFormRef')
const editFormRef = useTemplateRef<FormInstance>('editFormRef')

const {
  compatibleTemplates,
  filteredRows,
  selectedRowKey,
  searchKeyword,
  isLoading,
  isLoadingModels,
  isSyncingModels,
  isUpdatingServiceStatus,
  isSavingEndpoint,
  isSavingApiKey,
  isCreatingService,
  isUpdatingCustomService,
  isEditingApiKey,
  createDialogVisible,
  editDialogVisible,
  updatingModelIds,
  endpointForm,
  apiKeyForm,
  createForm,
  editForm,
  models,
  selectedRow,
  selectedService,
  canEditEndpoint,
  requiresApiKey,
  hasSavedApiKey,
  shouldShowApiKeyInput,
  selectedTitle,
  syncModelsButtonText,
  modelSummaryText,
  shouldShowModelsEmptyState,
  createRules,
  editRules,
  selectRow,
  openCreateDialog,
  createCustomService,
  updateCustomService,
  handleCustomCommand,
  startApiKeyEdit,
  keepSavedApiKey,
  saveApiKey,
  saveEndpoint,
  updateServiceEnabled,
  syncModels,
  updateModelStatus,
  getProviderInitial,
  getProviderStatusLabel,
  getProviderStatusType,
  handleRowContextMenu,
} = useModelServiceConsole({
  mode: () => props.mode,
  createFormRef,
  editFormRef,
})
</script>

<template>
  <div v-loading="isLoading" class="model-service-console">
    <aside class="model-service-console__sidebar">
      <div class="model-service-console__search">
        <ElInput v-model="searchKeyword" clearable placeholder="搜索服务商..." />
      </div>

      <ElScrollbar class="min-h-0 flex-1">
        <div class="model-service-console__provider-list">
          <template v-for="row in filteredRows" :key="row.rowKey">
            <ElDropdown
              v-if="row.kind === 'custom'"
              trigger="contextmenu"
              @command="command => handleCustomCommand(String(command), row)"
            >
              <button
                type="button"
                class="model-service-console__provider-item"
                :class="{ active: row.rowKey === selectedRowKey }"
                @click="selectRow(row.rowKey)"
                @contextmenu="handleRowContextMenu(row)"
              >
                <span class="model-service-console__provider-avatar">
                  {{ getProviderInitial(row) }}
                </span>
                <span class="model-service-console__provider-copy">
                  <span class="model-service-console__provider-title">
                    {{ row.title }}
                  </span>
                </span>
                <ElTag
                  size="small"
                  effect="light"
                  class="model-service-console__provider-status"
                  :type="getProviderStatusType(row)"
                >
                  {{ getProviderStatusLabel(row) }}
                </ElTag>
              </button>
              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem command="edit">
                    编辑
                  </ElDropdownItem>
                  <ElDropdownItem command="delete" divided>
                    删除
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
            <button
              v-else
              type="button"
              class="model-service-console__provider-item"
              :class="{ active: row.rowKey === selectedRowKey }"
              @click="selectRow(row.rowKey)"
            >
              <span class="model-service-console__provider-avatar">
                {{ getProviderInitial(row) }}
              </span>
              <span class="model-service-console__provider-copy">
                <span class="model-service-console__provider-title">
                  {{ row.title }}
                </span>
              </span>
              <ElTag
                size="small"
                effect="light"
                class="model-service-console__provider-status"
                :type="getProviderStatusType(row)"
              >
                {{ getProviderStatusLabel(row) }}
              </ElTag>
            </button>
          </template>

          <ElEmpty v-if="filteredRows.length === 0" :image-size="88" description="没有匹配的服务商" />
        </div>
      </ElScrollbar>

      <div class="model-service-console__sidebar-footer">
        <ElButton class="w-full" size="large" type="primary" @click="openCreateDialog">
          <SvgIcon category="ui" icon="plus" size="1rem" class="mr-2" />
          添加
        </ElButton>
      </div>
    </aside>

    <main class="model-service-console__main">
      <template v-if="selectedRow">
        <section class="model-service-console__overview">
          <div class="model-service-console__overview-header">
            <h2 class="m-0 truncate text-xl font-bold text-main">
              {{ selectedTitle }}
            </h2>
            <ElSwitch
              :model-value="selectedService?.enabled ?? false"
              :loading="isUpdatingServiceStatus"
              :disabled="isUpdatingServiceStatus"
              @change="updateServiceEnabled"
            />
          </div>

          <div class="model-service-console__overview-form">
            <div v-if="canEditEndpoint" class="model-service-console__field">
              <div class="model-service-console__field-label">
                API 地址
              </div>
              <ElInput
                v-model="endpointForm.endpoint"
                placeholder="https://api.example.com/v1"
                :disabled="isSavingEndpoint"
                @change="saveEndpoint"
              />
            </div>
            <div v-if="requiresApiKey" class="model-service-console__field">
              <div class="model-service-console__field-label">
                API Key
              </div>
              <ElButton
                v-if="hasSavedApiKey && !isEditingApiKey"
                plain
                type="primary"
                class="w-full"
                @click="startApiKeyEdit"
              >
                更换 API Key
              </ElButton>
              <div v-else class="model-service-console__field-row">
                <ElInput
                  v-model="apiKeyForm.apiKey"
                  class="min-w-0 flex-1"
                  type="password"
                  show-password
                  autocomplete="new-password"
                  :placeholder="hasSavedApiKey ? '输入新的 API Key' : '请输入 API Key'"
                  @keyup.enter="saveApiKey"
                />
                <ElButton type="primary" :loading="isSavingApiKey" @click="saveApiKey">
                  保存
                </ElButton>
                <ElButton
                  v-if="hasSavedApiKey && shouldShowApiKeyInput"
                  link
                  class="shrink-0"
                  @click="keepSavedApiKey"
                >
                  取消更换
                </ElButton>
              </div>
            </div>
          </div>
        </section>

        <section class="model-service-console__section model-service-console__section--models">
          <div class="model-service-console__section-header model-service-console__section-header--models">
            <h3 class="m-0 text-base font-semibold text-main">
              模型列表
            </h3>
            <span class="model-service-console__section-summary ml-4px">
              {{ modelSummaryText }}
            </span>
            <ElTooltip :content="syncModelsButtonText" placement="top" effect="light">
              <ElButton
                circle
                text
                type="primary"
                class="model-service-console__section-action"
                :loading="isSyncingModels"
                @click="syncModels"
              >
                <SvgIcon category="ui" icon="sync-refresh" size="1rem" />
              </ElButton>
            </ElTooltip>
          </div>

          <div v-if="shouldShowModelsEmptyState" class="model-service-console__models-empty">
            <ElEmpty description="暂无模型">
              <ElButton type="primary" :loading="isSyncingModels" @click="syncModels">
                同步并显示模型
              </ElButton>
            </ElEmpty>
          </div>

          <template v-else>
            <div v-loading="isLoadingModels" class="model-service-console__model-list">
              <ElTable
                :data="models"
                row-key="modelItemId"
                height="100%"
                class="model-service-console__model-table"
              >
                <ElTableColumn label="模型名" prop="modelName" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="model-service-console__table-model-name-cell">
                      <span class="model-service-console__table-model-name">
                        {{ row.modelName }}
                      </span>
                    </div>
                  </template>
                </ElTableColumn>

                <ElTableColumn label="模型 ID" prop="modelId" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="model-service-console__table-model-id-cell">
                      <span class="model-service-console__table-model-id">
                        {{ row.modelId }}
                      </span>
                    </div>
                  </template>
                </ElTableColumn>

                <ElTableColumn
                  label="类型"
                  :width="MODEL_TYPE_COLUMN_WIDTH"
                  align="center"
                  class-name="model-service-console__table-type-column"
                >
                  <template #default="{ row }">
                    <div class="model-service-console__table-type-cell">
                      <ElTag size="small">
                        {{ AI_MODEL_TYPE_LABELS[row.modelType as AiModelType] }}
                      </ElTag>
                    </div>
                  </template>
                </ElTableColumn>

                <ElTableColumn
                  label="启用"
                  :width="MODEL_STATUS_COLUMN_WIDTH"
                  align="right"
                  class-name="model-service-console__table-status-column"
                >
                  <template #default="{ row }">
                    <div class="model-service-console__table-switch-cell">
                      <ElSwitch
                        :model-value="row.enabled"
                        :loading="updatingModelIds.has(row.modelItemId)"
                        :disabled="updatingModelIds.has(row.modelItemId)"
                        @change="value => updateModelStatus(row, value)"
                      />
                    </div>
                  </template>
                </ElTableColumn>
              </ElTable>
            </div>
          </template>
        </section>
      </template>
    </main>

    <ElDialog v-model="createDialogVisible" title="添加服务商" width="28rem">
      <ElForm ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <ElFormItem label="类型" prop="providerKey">
          <ElSelect v-model="createForm.providerKey" class="w-full">
            <ElOption
              v-for="template in compatibleTemplates"
              :key="template.providerKey"
              :label="template.providerName"
              :value="template.providerKey"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="名称" prop="providerName">
          <ElInput v-model="createForm.providerName" placeholder="例如：本地 Xinference" />
        </ElFormItem>
      </ElForm>

      <template #footer>
        <ElButton @click="createDialogVisible = false">
          取消
        </ElButton>
        <ElButton type="primary" :loading="isCreatingService" @click="createCustomService">
          添加
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="editDialogVisible" title="编辑服务商" width="28rem">
      <ElForm ref="editFormRef" :model="editForm" :rules="editRules" label-position="top">
        <ElFormItem label="类型" prop="providerKey">
          <ElSelect v-model="editForm.providerKey" class="w-full">
            <ElOption
              v-for="template in compatibleTemplates"
              :key="template.providerKey"
              :label="template.providerName"
              :value="template.providerKey"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="名称" prop="providerName">
          <ElInput v-model="editForm.providerName" />
        </ElFormItem>
      </ElForm>

      <template #footer>
        <ElButton @click="editDialogVisible = false">
          取消
        </ElButton>
        <ElButton type="primary" :loading="isUpdatingCustomService" @click="updateCustomService">
          保存
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped lang="scss">
.model-service-console {
  display: grid;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  background: var(--brand-bg-surface);
  grid-template-columns: minmax(17rem, 26rem) minmax(0, 1fr);

  .model-service-console__sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--brand-border-base);
  }

  .model-service-console__search {
    padding: 1rem;
  }

  .model-service-console__search-summary {
    margin: 0.625rem 0 0;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
  }

  .model-service-console__provider-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 1rem 1rem;
  }

  .model-service-console__provider-item {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 3.75rem;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    color: var(--brand-text-primary);
    background: color-mix(in srgb, var(--brand-bg-surface) 86%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 32%, transparent);
    cursor: pointer;
    transition:
      box-shadow 0.18s ease,
      border-color 0.18s ease,
      background-color 0.18s ease,
      transform 0.18s ease;

    &::before {
      position: absolute;
      inset: 0 auto 0 0;
      width: 0.25rem;
      border-radius: 0.5rem 0 0 0.5rem;
      background: transparent;
      content: '';
      transition: background-color 0.18s ease;
    }

    &:hover {
      border-color: color-mix(in srgb, var(--brand-primary) 18%, var(--brand-border-base));
      background: color-mix(in srgb, var(--brand-primary) 4%, var(--brand-bg-surface));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-primary) 16%, transparent);
    }

    &.active {
      border-color: color-mix(in srgb, var(--brand-primary) 38%, var(--brand-border-base));
      background: color-mix(in srgb, var(--brand-primary) 11%, var(--brand-bg-surface));
      box-shadow:
        inset 0 0 0 1px color-mix(in srgb, var(--brand-primary) 26%, transparent),
        0 0.75rem 1.75rem color-mix(in srgb, var(--brand-primary) 10%, transparent);
      transform: translateY(-1px);

      &::before {
        background: var(--brand-primary);
      }
    }
  }

  .model-service-console__provider-copy {
    min-width: 0;
    flex: 1 1 0%;
    text-align: left;
  }

  .model-service-console__provider-title {
    display: block;
    overflow: hidden;
    color: inherit;
    font-size: 1rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-service-console__provider-status {
    flex: 0 0 auto;
    min-width: 4.5rem;
    border-color: transparent;
  }

  .model-service-console__provider-item.active {
    .model-service-console__provider-title {
      color: var(--brand-primary);
    }
  }

  .model-service-console__provider-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    color: var(--brand-primary);
    background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
    font-size: 0.8125rem;
    font-weight: 800;
  }

  .model-service-console__provider-item.active {
    .model-service-console__provider-avatar {
      color: var(--brand-bg-surface);
      background: linear-gradient(135deg, var(--brand-primary), color-mix(in srgb, var(--brand-primary) 74%, white));
    }
  }

  .model-service-console__sidebar-footer {
    padding: 1rem;
    border-top: 1px solid var(--brand-border-base);
    background: color-mix(in srgb, var(--brand-fill-lighter) 55%, var(--brand-bg-surface));
    box-shadow: 0 -0.75rem 1.25rem -1rem color-mix(in srgb, var(--brand-text-primary) 10%, transparent);
  }

  .model-service-console__main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 1.25rem 1.5rem 1.5rem;
  }

  .model-service-console__overview + .model-service-console__section,
  .model-service-console__section + .model-service-console__section {
    margin-top: 1rem;
  }

  .model-service-console__overview,
  .model-service-console__section {
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--brand-bg-surface) 85%, var(--brand-fill-lighter));
  }

  .model-service-console__overview {
    padding: 1.25rem;
  }

  .model-service-console__section--models {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding: 1.25rem;
  }

  .model-service-console__overview-header,
  .model-service-console__section-header,
  .model-service-console__field-row,
  .model-service-console__model-row {
    display: flex;
    align-items: center;
  }

  .model-service-console__overview-header,
  .model-service-console__section-header {
    justify-content: space-between;
  }

  .model-service-console__overview-form {
    margin-top: 1.25rem;
    padding-top: 1.25rem;
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  }

  .model-service-console__section-header--models {
    flex: 0 0 auto;
    align-items: flex-end;
  }

  .model-service-console__section-summary {
    color: var(--brand-text-secondary);
    font-size: 0.725rem;
    line-height: 1.5;
  }

  .model-service-console__section-action {
    margin-left: auto;
  }

  .model-service-console__form {
    display: flex;
    flex-direction: column;
  }

  .model-service-console__field + .model-service-console__field {
    margin-top: 1.25rem;
  }

  .model-service-console__field-label {
    margin-bottom: 0.625rem;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .model-service-console__field-row {
    gap: 0.75rem;
  }

  .model-service-console__models-empty {
    display: flex;
    flex: 1 1 0%;
    align-items: center;
    justify-content: center;
    min-height: 0;
    border: 1px dashed color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    border-radius: 0.875rem;
    background: var(--brand-bg-surface);
  }

  .model-service-console__model-list {
    display: flex;
    flex: 1 1 0%;
    min-height: 0;
    margin-top: 1rem;
    overflow: hidden;
  }

  .model-service-console__model-table {
    flex: 1 1 0%;
    width: 100%;
    height: 100%;
  }

  .model-service-console__table-model-name-cell,
  .model-service-console__table-model-id-cell,
  .model-service-console__table-type-cell,
  .model-service-console__table-switch-cell {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
  }

  .model-service-console__table-model-name-cell,
  .model-service-console__table-model-id-cell {
    min-width: 0;
    flex: 1 1 0%;
  }

  .model-service-console__table-model-name {
    display: block;
    overflow: hidden;
    color: var(--brand-text-primary);
    font-size: 0.9375rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-service-console__table-model-id {
    display: block;
    overflow: hidden;
    color: var(--brand-text-primary);
    font-size: 0.8125rem;
    font-weight: 500;
    font-family: var(--el-font-family-monospace, var(--el-font-family));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-service-console__table-type-cell {
    justify-content: center;
  }

  .model-service-console__table-switch-cell {
    justify-content: flex-end;
  }

  :deep(.model-service-console__model-table .el-table__inner-wrapper::before) {
    display: none;
  }

  :deep(.model-service-console__model-table .el-scrollbar__bar) {
    z-index: 1;
  }

  :deep(.model-service-console__model-table th.el-table__cell) {
    padding: 0.625rem 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--brand-fill-lighter) 58%, var(--brand-bg-surface));
  }

  :deep(.model-service-console__model-table th.el-table__cell .cell) {
    padding: 0;
  }

  :deep(.model-service-console__model-table .el-table__cell) {
    padding: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    background: var(--brand-bg-surface);
  }

  :deep(.model-service-console__model-table .el-table__cell .cell) {
    padding: 0.875rem 0.25rem;
  }

  :deep(.model-service-console__model-table .el-table__body tr:hover > td.el-table__cell) {
    background: color-mix(in srgb, var(--brand-primary) 4%, var(--brand-bg-surface));
  }

  :deep(.model-service-console__model-table .model-service-console__table-type-column .cell) {
    display: flex;
    justify-content: center;
  }

  :deep(.model-service-console__model-table .model-service-console__table-status-column .cell) {
    display: flex;
    justify-content: flex-end;
  }
}

@media (max-width: 1023px) {
  .model-service-console {
    grid-template-columns: minmax(0, 1fr);

    .model-service-console__sidebar {
      min-height: 24rem;
      border-right: 0;
      border-bottom: 1px solid var(--brand-border-base);
    }

    .model-service-console__main {
      padding: 1.25rem;
    }

    .model-service-console__overview-header,
    .model-service-console__section-header {
      flex-direction: column;
      align-items: flex-start;
    }

  }
}
</style>
