import type { FormInstance } from 'element-plus'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { ModelServiceConsoleMode, ModelServiceProviderRow } from '../typing'
import { ElMessage } from 'element-plus'
import { onMounted, shallowRef } from 'vue'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import {
  getProviderInitial,
  getProviderStatusLabel,
  getProviderStatusType,
} from '../utils/modelService'
import { useModelServiceCatalog } from './useModelServiceCatalog'
import { useModelServiceCredentials } from './useModelServiceCredentials'
import { useModelServiceCustomServices } from './useModelServiceCustomServices'
import { useModelServiceModels } from './useModelServiceModels'
import { useModelServiceStatus } from './useModelServiceStatus'

/**
 * 模型服务控制台参数。
 */
export interface UseModelServiceConsoleOptions {
  /** 控制台模式 */
  mode: MaybeRefOrGetter<ModelServiceConsoleMode>
  /** 创建表单实例 */
  createFormRef: Readonly<Ref<FormInstance | null>>
  /** 编辑表单实例 */
  editFormRef: Readonly<Ref<FormInstance | null>>
}

export function useModelServiceConsole(options: UseModelServiceConsoleOptions) {
  const isLoading = shallowRef(false)

  const catalog = useModelServiceCatalog({
    mode: options.mode,
  })

  const credentials = useModelServiceCredentials({
    mode: options.mode,
    selectedService: catalog.selectedService,
    selectedTemplate: catalog.selectedTemplate,
    ensureSelectedService: catalog.ensureSelectedService,
    patchService: catalog.patchService,
  })

  const models = useModelServiceModels({
    mode: options.mode,
    selectedRow: catalog.selectedRow,
    selectedService: catalog.selectedService,
    canEditEndpoint: credentials.canEditEndpoint,
    ensureSelectedService: catalog.ensureSelectedService,
    patchServiceModelCount: catalog.patchServiceModelCount,
    saveEndpoint: credentials.saveEndpoint,
  })

  const status = useModelServiceStatus({
    mode: options.mode,
    selectedService: catalog.selectedService,
    totalModelCount: models.totalModelCount,
    ensureSelectedService: catalog.ensureSelectedService,
    patchService: catalog.patchService,
  })

  const customServices = useModelServiceCustomServices({
    mode: options.mode,
    compatibleTemplates: catalog.compatibleTemplates,
    services: catalog.services,
    selectedRowKey: catalog.selectedRowKey,
    selectCatalogRow: catalog.selectRow,
    createFormRef: options.createFormRef,
    editFormRef: options.editFormRef,
    selectRow,
    patchService: catalog.patchService,
    removeService: catalog.removeService,
    normalizeSelectedRow: catalog.normalizeSelectedRow,
    syncCredentialForms: credentials.syncCredentialForms,
    loadModelsForSelectedService: models.loadModelsForSelectedService,
    clearModels: models.clearModels,
  })

  onMounted(() => {
    void loadInitialData()
  })

  async function loadInitialData() {
    isLoading.value = true

    try {
      await catalog.loadCatalog()
      credentials.syncCredentialForms()
      await models.loadModelsForSelectedService()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '加载模型服务失败'))
    }
    finally {
      isLoading.value = false
    }
  }

  async function selectRow(rowKey: string) {
    catalog.selectRow(rowKey)
    credentials.syncCredentialForms()
    await models.loadModelsForSelectedService()
  }

  function handleRowContextMenu(row: ModelServiceProviderRow) {
    if (catalog.selectedRowKey.value === row.rowKey) {
      return
    }

    void selectRow(row.rowKey)
  }

  return {
    compatibleTemplates: catalog.compatibleTemplates,
    filteredRows: catalog.filteredRows,
    selectedRowKey: catalog.selectedRowKey,
    searchKeyword: catalog.searchKeyword,
    isLoading,
    isLoadingModels: models.isLoadingModels,
    isSyncingModels: models.isSyncingModels,
    isUpdatingServiceStatus: status.isUpdatingServiceStatus,
    isSavingEndpoint: credentials.isSavingEndpoint,
    isSavingApiKey: credentials.isSavingApiKey,
    isCreatingService: customServices.isCreatingService,
    isUpdatingCustomService: customServices.isUpdatingCustomService,
    isEditingApiKey: credentials.isEditingApiKey,
    createDialogVisible: customServices.createDialogVisible,
    editDialogVisible: customServices.editDialogVisible,
    updatingModelIds: models.updatingModelIds,
    endpointForm: credentials.endpointForm,
    apiKeyForm: credentials.apiKeyForm,
    createForm: customServices.createForm,
    editForm: customServices.editForm,
    models: models.models,
    selectedRow: catalog.selectedRow,
    selectedService: catalog.selectedService,
    canEditEndpoint: credentials.canEditEndpoint,
    requiresApiKey: credentials.requiresApiKey,
    hasSavedApiKey: credentials.hasSavedApiKey,
    shouldShowApiKeyInput: credentials.shouldShowApiKeyInput,
    selectedTitle: catalog.selectedTitle,
    syncModelsButtonText: models.syncModelsButtonText,
    modelSummaryText: models.modelSummaryText,
    shouldShowModelsEmptyState: models.shouldShowModelsEmptyState,
    createRules: customServices.createRules,
    editRules: customServices.editRules,
    selectRow,
    openCreateDialog: customServices.openCreateDialog,
    createCustomService: customServices.createCustomService,
    updateCustomService: customServices.updateCustomService,
    handleCustomCommand: customServices.handleCustomCommand,
    startApiKeyEdit: credentials.startApiKeyEdit,
    keepSavedApiKey: credentials.keepSavedApiKey,
    saveApiKey: credentials.saveApiKey,
    saveEndpoint: credentials.saveEndpoint,
    updateServiceEnabled: status.updateServiceEnabled,
    syncModels: models.syncModels,
    updateModelStatus: models.updateModelStatus,
    getProviderInitial,
    getProviderStatusLabel,
    getProviderStatusType,
    handleRowContextMenu,
  }
}
