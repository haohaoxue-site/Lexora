<script setup lang="ts">
import type { AiProviderConsoleMode, AiProviderFormController } from './typing'
import { useTemplateRef } from 'vue'
import CompatibleProviderDialog from './components/compatible-provider-dialog'
import ConsoleContent from './components/console-content'
import CreateModelDialog from './components/create-model-dialog'
import DiscoverModelsDialog from './components/discover-models-dialog'
import ModelCapabilityDialog from './components/model-capability-dialog'
import ProviderSidebar from './components/provider-sidebar'
import { useAiProviderConsole } from './composables/useAiProviderConsole'

const props = defineProps<{
  mode: AiProviderConsoleMode
}>()

const createCompatibleProviderFormRef = useTemplateRef<AiProviderFormController>('createCompatibleProviderFormRef')
const editCompatibleProviderFormRef = useTemplateRef<AiProviderFormController>('editCompatibleProviderFormRef')
const createModelFormRef = useTemplateRef<AiProviderFormController>('createModelFormRef')

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
  isSavingModelCapability,
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
  modelCapabilityDialogVisible,
  endpointForm,
  apiKeyForm,
  compatibleProviderCreateForm,
  compatibleProviderEditForm,
  createModelForm,
  modelCapabilityForm,
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
  modelCapabilityRules,
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
  openModelCapabilityDialog,
  saveModelCapability,
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
    <ProviderSidebar
      v-model:search-keyword="searchKeyword"
      :rows="filteredRows"
      :selected-row-key="selectedRowKey"
      :get-provider-initial="getProviderInitial"
      :get-provider-status-label="getProviderStatusLabel"
      :get-provider-status-type="getProviderStatusType"
      @select-row="selectRow"
      @open-create-provider="openCreateCompatibleProviderDialog"
      @compatible-command="handleCompatibleProviderCommand"
      @row-context-menu="handleRowContextMenu"
    />

    <ConsoleContent
      :selected-row="selectedRow"
      :selected-title="selectedTitle"
      :selected-provider="selectedProvider"
      :endpoint-form="endpointForm"
      :api-key-form="apiKeyForm"
      :can-edit-endpoint="canEditEndpoint"
      :requires-api-key="requiresApiKey"
      :is-updating-provider-status="isUpdatingProviderStatus"
      :is-saving-endpoint="isSavingEndpoint"
      :is-saving-api-key="isSavingApiKey"
      :is-loading-api-key="isLoadingApiKey"
      :models="models"
      :model-summary-text="modelSummaryText"
      :discover-models-button-text="discoverModelsButtonText"
      :should-show-empty-state="shouldShowModelsEmptyState"
      :is-loading-models="isLoadingModels"
      :is-discovering-models="isDiscoveringModels"
      :is-model-updating="isModelUpdating"
      @update-provider-enabled="updateProviderEnabled"
      @save-endpoint="saveEndpoint"
      @save-api-key="saveApiKey"
      @open-discover-models="openDiscoverModelsDialog"
      @open-create-model="openCreateModelDialog"
      @configure-model="openModelCapabilityDialog"
      @update-model-status="updateModelStatus"
    />

    <CompatibleProviderDialog
      ref="createCompatibleProviderFormRef"
      v-model:visible="createCompatibleProviderDialogVisible"
      mode="create"
      :presets="compatiblePresets"
      :form="compatibleProviderCreateForm"
      :rules="compatibleProviderCreateRules"
      :loading="isCreatingCompatibleProvider"
      @submit="createCompatibleProvider"
    />

    <CompatibleProviderDialog
      ref="editCompatibleProviderFormRef"
      v-model:visible="editCompatibleProviderDialogVisible"
      mode="edit"
      :presets="compatiblePresets"
      :form="compatibleProviderEditForm"
      :rules="compatibleProviderEditRules"
      :loading="isUpdatingCompatibleProvider"
      @submit="updateCompatibleProvider"
    />

    <DiscoverModelsDialog
      v-model:visible="discoverDialogVisible"
      v-model:search-keyword="discoverSearchKeyword"
      :title="selectedTitle"
      :models="filteredDiscoveredModels"
      :is-discovering="isDiscoveringModels"
      :is-adding="isAddingDiscoveredModels"
      :is-model-updating="isModelUpdating"
      @add-all="addAllDiscoveredModels"
      @refresh="refreshDiscoveredModels()"
      @update-model-status="updateModelStatus"
    />

    <CreateModelDialog
      ref="createModelFormRef"
      v-model:visible="createModelDialogVisible"
      :form="createModelForm"
      :rules="createModelRules"
      :loading="isCreatingModel"
      @model-id-input="handleCreateModelIdInput"
      @submit="createModel"
    />

    <ModelCapabilityDialog
      v-model:visible="modelCapabilityDialogVisible"
      :form="modelCapabilityForm"
      :rules="modelCapabilityRules"
      :loading="isSavingModelCapability"
      @submit="saveModelCapability"
    />
  </div>
</template>

<style src="./index.scss" lang="scss"></style>
