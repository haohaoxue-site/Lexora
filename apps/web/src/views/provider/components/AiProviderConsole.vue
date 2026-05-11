<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { AiProviderConsoleMode } from '../typing'
import type { AiModelType } from '@/apis/ai'
import { ElSwitch, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { useTemplateRef } from 'vue'
import { useAiProviderConsole } from '../composables/useAiProviderConsole'
import { AI_MODEL_TYPE_LABELS } from '../utils/modelDisplay'

const props = defineProps<{
  mode: AiProviderConsoleMode
}>()

const MODEL_TYPE_COLUMN_WIDTH = 108
const MODEL_STATUS_COLUMN_WIDTH = 116

const createCompatibleProviderFormRef = useTemplateRef<FormInstance>('createCompatibleProviderFormRef')
const editCompatibleProviderFormRef = useTemplateRef<FormInstance>('editCompatibleProviderFormRef')
const createModelFormRef = useTemplateRef<FormInstance>('createModelFormRef')

const {
  compatiblePresets,
  filteredRows,
  selectedRowKey,
  searchKeyword,
  isLoading,
  isLoadingModels,
  isDiscoveringModels,
  isAddingDiscoveredModels,
  isCreatingModel,
  isUpdatingProviderStatus,
  isSavingEndpoint,
  isSavingApiKey,
  isLoadingApiKey,
  isCreatingCompatibleProvider,
  isUpdatingCompatibleProvider,
  createCompatibleProviderDialogVisible,
  editCompatibleProviderDialogVisible,
  discoverDialogVisible,
  createModelDialogVisible,
  endpointForm,
  apiKeyForm,
  compatibleProviderCreateForm,
  compatibleProviderEditForm,
  createModelForm,
  models,
  filteredDiscoveredModels,
  discoverSearchKeyword,
  selectedRow,
  selectedProvider,
  canEditEndpoint,
  requiresApiKey,
  selectedTitle,
  discoverModelsButtonText,
  modelSummaryText,
  shouldShowModelsEmptyState,
  compatibleProviderCreateRules,
  compatibleProviderEditRules,
  createModelRules,
  selectRow,
  openCreateCompatibleProviderDialog,
  createCompatibleProvider,
  updateCompatibleProvider,
  handleCompatibleProviderCommand,
  saveApiKey,
  saveEndpoint,
  updateProviderEnabled,
  openDiscoverModelsDialog,
  refreshDiscoveredModels,
  addAllDiscoveredModels,
  openCreateModelDialog,
  handleCreateModelIdInput,
  createModel,
  updateModelStatus,
  isModelUpdating,
  getProviderInitial,
  getProviderStatusLabel,
  getProviderStatusType,
  handleRowContextMenu,
} = useAiProviderConsole({
  mode: () => props.mode,
  createCompatibleProviderFormRef,
  editCompatibleProviderFormRef,
  createModelFormRef,
})
</script>

<template>
  <div v-loading="isLoading" class="ai-provider-console">
    <aside class="ai-provider-console__sidebar">
      <div class="ai-provider-console__search">
        <ElInput v-model="searchKeyword" clearable placeholder="搜索服务商..." />
      </div>

      <ElScrollbar class="min-h-0 flex-1">
        <div class="ai-provider-console__provider-list">
          <template v-for="row in filteredRows" :key="row.rowKey">
            <ElDropdown
              v-if="row.kind === 'compatible'"
              trigger="contextmenu"
              @command="command => handleCompatibleProviderCommand(String(command), row)"
            >
              <button
                type="button"
                class="ai-provider-console__provider-item"
                :class="{ active: row.rowKey === selectedRowKey }"
                @click="selectRow(row.rowKey)"
                @contextmenu="handleRowContextMenu(row)"
              >
                <span class="ai-provider-console__provider-avatar">
                  {{ getProviderInitial(row) }}
                </span>
                <span class="ai-provider-console__provider-info">
                  <span class="ai-provider-console__provider-title">
                    {{ row.title }}
                  </span>
                </span>
                <ElTag
                  size="small"
                  effect="light"
                  class="ai-provider-console__provider-status"
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
              class="ai-provider-console__provider-item"
              :class="{ active: row.rowKey === selectedRowKey }"
              @click="selectRow(row.rowKey)"
            >
              <span class="ai-provider-console__provider-avatar">
                {{ getProviderInitial(row) }}
              </span>
              <span class="ai-provider-console__provider-info">
                <span class="ai-provider-console__provider-title">
                  {{ row.title }}
                </span>
              </span>
              <ElTag
                size="small"
                effect="light"
                class="ai-provider-console__provider-status"
                :type="getProviderStatusType(row)"
              >
                {{ getProviderStatusLabel(row) }}
              </ElTag>
            </button>
          </template>

          <ElEmpty v-if="filteredRows.length === 0" :image-size="88" description="没有匹配的服务商" />
        </div>
      </ElScrollbar>

      <div class="ai-provider-console__sidebar-footer">
        <ElButton class="w-full" size="large" type="primary" @click="openCreateCompatibleProviderDialog">
          <SvgIcon category="ui" icon="plus" size="1rem" class="mr-2" />
          添加
        </ElButton>
      </div>
    </aside>

    <main class="ai-provider-console__main">
      <template v-if="selectedRow">
        <section class="ai-provider-console__overview">
          <div class="ai-provider-console__overview-header">
            <h2 class="m-0 truncate text-xl font-bold text-main">
              {{ selectedTitle }}
            </h2>
            <ElSwitch
              :model-value="selectedProvider?.enabled ?? false"
              :loading="isUpdatingProviderStatus"
              :disabled="isUpdatingProviderStatus"
              @change="updateProviderEnabled"
            />
          </div>

          <div class="ai-provider-console__overview-form">
            <div v-if="canEditEndpoint" class="ai-provider-console__field">
              <div class="ai-provider-console__field-label">
                API 地址
              </div>
              <ElInput
                v-model="endpointForm.endpoint"
                placeholder="https://api.example.com/v1"
                :disabled="isSavingEndpoint"
                @change="saveEndpoint"
              />
            </div>
            <div v-if="requiresApiKey" class="ai-provider-console__field">
              <div class="ai-provider-console__field-label">
                API Key
              </div>
              <div class="ai-provider-console__field-row">
                <ElInput
                  v-model="apiKeyForm.apiKey"
                  class="min-w-0 flex-1"
                  type="password"
                  show-password
                  autocomplete="new-password"
                  placeholder="请输入 API Key"
                  :disabled="isLoadingApiKey || isSavingApiKey"
                  @keyup.enter="saveApiKey"
                />
                <ElButton
                  type="primary"
                  :loading="isSavingApiKey"
                  :disabled="isLoadingApiKey"
                  @click="saveApiKey"
                >
                  保存
                </ElButton>
              </div>
            </div>
          </div>
        </section>

        <section class="ai-provider-console__section ai-provider-console__section--models">
          <div class="ai-provider-console__section-header ai-provider-console__section-header--models">
            <h3 class="m-0 text-base font-semibold text-main">
              模型列表
            </h3>
            <span class="ai-provider-console__section-summary ml-4px">
              {{ modelSummaryText }}
            </span>
            <ElButtonGroup class="ai-provider-console__section-action">
              <ElButton
                type="primary"
                plain
                :loading="isDiscoveringModels"
                @click="openDiscoverModelsDialog"
              >
                <SvgIcon category="ui" icon="sync-refresh" size="1rem" class="mr-2" />
                {{ discoverModelsButtonText }}
              </ElButton>
              <ElTooltip content="添加模型" placement="top" effect="light">
                <ElButton type="primary" plain @click="openCreateModelDialog">
                  <SvgIcon category="ui" icon="plus" size="1rem" />
                </ElButton>
              </ElTooltip>
            </ElButtonGroup>
          </div>

          <div v-if="shouldShowModelsEmptyState" class="ai-provider-console__models-empty">
            <ElEmpty description="暂无模型" />
          </div>

          <template v-else>
            <div v-loading="isLoadingModels" class="ai-provider-console__model-list">
              <ElTable
                :data="models"
                row-key="modelId"
                height="100%"
                class="ai-provider-console__model-table"
              >
                <ElTableColumn label="模型名" prop="modelName" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="ai-provider-console__table-model-name-cell">
                      <span class="ai-provider-console__table-model-name">
                        {{ row.modelName }}
                      </span>
                    </div>
                  </template>
                </ElTableColumn>

                <ElTableColumn label="模型 ID" prop="modelId" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="ai-provider-console__table-model-id-cell">
                      <span class="ai-provider-console__table-model-id">
                        {{ row.modelId }}
                      </span>
                    </div>
                  </template>
                </ElTableColumn>

                <ElTableColumn
                  label="类型"
                  :width="MODEL_TYPE_COLUMN_WIDTH"
                  align="center"
                  class-name="ai-provider-console__table-type-column"
                >
                  <template #default="{ row }">
                    <div class="ai-provider-console__table-type-cell">
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
                  class-name="ai-provider-console__table-status-column"
                >
                  <template #default="{ row }">
                    <div class="ai-provider-console__table-switch-cell">
                      <ElSwitch
                        :model-value="row.enabled ?? false"
                        :loading="isModelUpdating(row)"
                        :disabled="isModelUpdating(row)"
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

    <ElDialog v-model="createCompatibleProviderDialogVisible" title="添加服务商" width="28rem">
      <ElForm ref="createCompatibleProviderFormRef" :model="compatibleProviderCreateForm" :rules="compatibleProviderCreateRules" label-position="top">
        <ElFormItem label="类型" prop="providerKey">
          <ElSelect v-model="compatibleProviderCreateForm.providerKey" class="w-full">
            <ElOption
              v-for="template in compatiblePresets"
              :key="template.providerKey"
              :label="template.providerName"
              :value="template.providerKey"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="名称" prop="providerName">
          <ElInput v-model="compatibleProviderCreateForm.providerName" placeholder="例如：本地 Xinference" />
        </ElFormItem>
      </ElForm>

      <template #footer>
        <ElButton @click="createCompatibleProviderDialogVisible = false">
          取消
        </ElButton>
        <ElButton type="primary" :loading="isCreatingCompatibleProvider" @click="createCompatibleProvider">
          添加
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="editCompatibleProviderDialogVisible" title="编辑服务商" width="28rem">
      <ElForm ref="editCompatibleProviderFormRef" :model="compatibleProviderEditForm" :rules="compatibleProviderEditRules" label-position="top">
        <ElFormItem label="类型" prop="providerKey">
          <ElSelect v-model="compatibleProviderEditForm.providerKey" class="w-full">
            <ElOption
              v-for="template in compatiblePresets"
              :key="template.providerKey"
              :label="template.providerName"
              :value="template.providerKey"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="名称" prop="providerName">
          <ElInput v-model="compatibleProviderEditForm.providerName" />
        </ElFormItem>
      </ElForm>

      <template #footer>
        <ElButton @click="editCompatibleProviderDialogVisible = false">
          取消
        </ElButton>
        <ElButton type="primary" :loading="isUpdatingCompatibleProvider" @click="updateCompatibleProvider">
          保存
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="discoverDialogVisible"
      :title="`${selectedTitle}模型`"
      width="min(72rem, calc(100vw - 4rem))"
      class="ai-provider-console__discover-dialog"
    >
      <div class="ai-provider-console__discover-toolbar">
        <ElInput
          v-model="discoverSearchKeyword"
          clearable
          class="ai-provider-console__discover-search"
          placeholder="搜索模型 ID 或名称"
        />
        <div class="ai-provider-console__discover-actions">
          <ElButton
            type="primary"
            :loading="isAddingDiscoveredModels"
            :disabled="filteredDiscoveredModels.length === 0"
            @click="addAllDiscoveredModels"
          >
            全部添加
          </ElButton>
          <ElButton :loading="isDiscoveringModels" @click="refreshDiscoveredModels()">
            <SvgIcon category="ui" icon="sync-refresh" size="1rem" class="mr-2" />
            刷新列表
          </ElButton>
        </div>
      </div>

      <div v-loading="isDiscoveringModels" class="ai-provider-console__discover-list">
        <ElTable
          :data="filteredDiscoveredModels"
          row-key="modelId"
          height="100%"
          class="ai-provider-console__model-table"
        >
          <ElTableColumn label="模型名" prop="modelName" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="ai-provider-console__table-model-name-cell">
                <span class="ai-provider-console__table-model-name">
                  {{ row.modelName }}
                </span>
              </div>
            </template>
          </ElTableColumn>

          <ElTableColumn label="模型 ID" prop="modelId" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="ai-provider-console__table-model-id-cell">
                <span class="ai-provider-console__table-model-id">
                  {{ row.modelId }}
                </span>
              </div>
            </template>
          </ElTableColumn>

          <ElTableColumn
            label="类型"
            :width="MODEL_TYPE_COLUMN_WIDTH"
            align="center"
            class-name="ai-provider-console__table-type-column"
          >
            <template #default="{ row }">
              <div class="ai-provider-console__table-type-cell">
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
            class-name="ai-provider-console__table-status-column"
          >
            <template #default="{ row }">
              <div class="ai-provider-console__table-switch-cell">
                <ElSwitch
                  :model-value="row.enabled ?? false"
                  :loading="isModelUpdating(row)"
                  :disabled="isModelUpdating(row)"
                  @change="value => updateModelStatus(row, value)"
                />
              </div>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </ElDialog>

    <ElDialog v-model="createModelDialogVisible" title="添加模型" width="42rem">
      <ElForm
        ref="createModelFormRef"
        :model="createModelForm"
        :rules="createModelRules"
        label-width="7rem"
      >
        <ElFormItem label="模型 ID" prop="modelId" required>
          <ElInput
            :model-value="createModelForm.modelId"
            placeholder="例如：gpt-4.1"
            @input="handleCreateModelIdInput"
          />
        </ElFormItem>
        <ElFormItem label="模型名称" prop="modelName">
          <ElInput v-model="createModelForm.modelName" placeholder="例如：GPT-4.1" />
        </ElFormItem>
      </ElForm>

      <template #footer>
        <ElButton @click="createModelDialogVisible = false">
          取消
        </ElButton>
        <ElButton type="primary" :loading="isCreatingModel" @click="createModel">
          添加模型
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped lang="scss">
.ai-provider-console {
  display: grid;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  background: var(--brand-bg-surface);
  grid-template-columns: minmax(17rem, 26rem) minmax(0, 1fr);

  .ai-provider-console__sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--brand-border-base);
  }

  .ai-provider-console__search {
    padding: 1rem;
  }

  .ai-provider-console__search-summary {
    margin: 0.625rem 0 0;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
  }

  .ai-provider-console__provider-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 1rem 1rem;
  }

  .ai-provider-console__provider-item {
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

  .ai-provider-console__provider-info {
    min-width: 0;
    flex: 1 1 0%;
    text-align: left;
  }

  .ai-provider-console__provider-title {
    display: block;
    overflow: hidden;
    color: inherit;
    font-size: 1rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-provider-console__provider-status {
    flex: 0 0 auto;
    min-width: 4.5rem;
    border-color: transparent;
  }

  .ai-provider-console__provider-item.active {
    .ai-provider-console__provider-title {
      color: var(--brand-primary);
    }
  }

  .ai-provider-console__provider-avatar {
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

  .ai-provider-console__provider-item.active {
    .ai-provider-console__provider-avatar {
      color: var(--brand-bg-surface);
      background: linear-gradient(135deg, var(--brand-primary), color-mix(in srgb, var(--brand-primary) 74%, white));
    }
  }

  .ai-provider-console__sidebar-footer {
    padding: 1rem;
    border-top: 1px solid var(--brand-border-base);
    background: color-mix(in srgb, var(--brand-fill-lighter) 55%, var(--brand-bg-surface));
    box-shadow: 0 -0.75rem 1.25rem -1rem color-mix(in srgb, var(--brand-text-primary) 10%, transparent);
  }

  .ai-provider-console__main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 1.25rem 1.5rem 1.5rem;
  }

  .ai-provider-console__overview + .ai-provider-console__section,
  .ai-provider-console__section + .ai-provider-console__section {
    margin-top: 1rem;
  }

  .ai-provider-console__overview,
  .ai-provider-console__section {
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--brand-bg-surface) 85%, var(--brand-fill-lighter));
  }

  .ai-provider-console__overview {
    padding: 1.25rem;
  }

  .ai-provider-console__section--models {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding: 1.25rem;
  }

  .ai-provider-console__overview-header,
  .ai-provider-console__section-header,
  .ai-provider-console__field-row,
  .ai-provider-console__model-row {
    display: flex;
    align-items: center;
  }

  .ai-provider-console__overview-header,
  .ai-provider-console__section-header {
    justify-content: space-between;
  }

  .ai-provider-console__overview-form {
    margin-top: 1.25rem;
    padding-top: 1.25rem;
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  }

  .ai-provider-console__section-header--models {
    flex: 0 0 auto;
    align-items: flex-end;
  }

  .ai-provider-console__section-summary {
    color: var(--brand-text-secondary);
    font-size: 0.725rem;
    line-height: 1.5;
  }

  .ai-provider-console__section-action {
    margin-left: auto;
  }

  .ai-provider-console__form {
    display: flex;
    flex-direction: column;
  }

  .ai-provider-console__field + .ai-provider-console__field {
    margin-top: 1.25rem;
  }

  .ai-provider-console__field-label {
    margin-bottom: 0.625rem;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .ai-provider-console__field-row {
    gap: 0.75rem;
  }

  .ai-provider-console__discover-toolbar,
  .ai-provider-console__discover-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .ai-provider-console__models-empty {
    display: flex;
    flex: 1 1 0%;
    align-items: center;
    justify-content: center;
    min-height: 0;
    border: 1px dashed color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    border-radius: 0.875rem;
    background: var(--brand-bg-surface);
  }

  .ai-provider-console__model-list {
    display: flex;
    flex: 1 1 0%;
    min-height: 0;
    margin-top: 1rem;
    overflow: hidden;
  }

  .ai-provider-console__model-table {
    flex: 1 1 0%;
    width: 100%;
    height: 100%;
  }

  .ai-provider-console__discover-toolbar {
    margin-bottom: 1rem;
  }

  .ai-provider-console__discover-search {
    min-width: 0;
    flex: 1 1 0%;
  }

  .ai-provider-console__discover-actions {
    flex: 0 0 auto;
  }

  .ai-provider-console__discover-list {
    height: min(34rem, calc(100vh - 16rem));
    min-height: 22rem;
  }

  .ai-provider-console__table-model-name-cell,
  .ai-provider-console__table-model-id-cell,
  .ai-provider-console__table-type-cell,
  .ai-provider-console__table-switch-cell {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
  }

  .ai-provider-console__table-model-name-cell,
  .ai-provider-console__table-model-id-cell {
    min-width: 0;
    flex: 1 1 0%;
  }

  .ai-provider-console__table-model-name {
    display: block;
    overflow: hidden;
    color: var(--brand-text-primary);
    font-size: 0.9375rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-provider-console__table-model-id {
    display: block;
    overflow: hidden;
    color: var(--brand-text-primary);
    font-size: 0.8125rem;
    font-weight: 500;
    font-family: var(--el-font-family-monospace, var(--el-font-family));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-provider-console__table-type-cell {
    justify-content: center;
  }

  .ai-provider-console__table-switch-cell {
    justify-content: flex-end;
  }

  :deep(.ai-provider-console__model-table .el-table__inner-wrapper::before) {
    display: none;
  }

  :deep(.ai-provider-console__model-table .el-scrollbar__bar) {
    z-index: 1;
  }

  :deep(.ai-provider-console__model-table th.el-table__cell) {
    padding: 0.625rem 0.25rem;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--brand-fill-lighter) 58%, var(--brand-bg-surface));
  }

  :deep(.ai-provider-console__model-table th.el-table__cell .cell) {
    padding: 0;
  }

  :deep(.ai-provider-console__model-table .el-table__cell) {
    padding: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    background: var(--brand-bg-surface);
  }

  :deep(.ai-provider-console__model-table .el-table__cell .cell) {
    padding: 0.875rem 0.25rem;
  }

  :deep(.ai-provider-console__model-table .el-table__body tr:hover > td.el-table__cell) {
    background: color-mix(in srgb, var(--brand-primary) 4%, var(--brand-bg-surface));
  }

  :deep(.ai-provider-console__model-table .ai-provider-console__table-type-column .cell) {
    display: flex;
    justify-content: center;
  }

  :deep(.ai-provider-console__model-table .ai-provider-console__table-status-column .cell) {
    display: flex;
    justify-content: flex-end;
  }
}

@media (max-width: 1023px) {
  .ai-provider-console {
    grid-template-columns: minmax(0, 1fr);

    .ai-provider-console__sidebar {
      min-height: 24rem;
      border-right: 0;
      border-bottom: 1px solid var(--brand-border-base);
    }

    .ai-provider-console__main {
      padding: 1.25rem;
    }

    .ai-provider-console__overview-header,
    .ai-provider-console__section-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .ai-provider-console__section-action,
    .ai-provider-console__discover-toolbar,
    .ai-provider-console__discover-actions {
      width: 100%;
    }

    .ai-provider-console__discover-toolbar {
      flex-direction: column;
      align-items: stretch;
    }

  }
}
</style>
