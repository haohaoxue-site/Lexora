import type { FormInstance } from 'element-plus'
import type { MaybeRefOrGetter, Ref, ShallowRef } from 'vue'
import type { CompatibleProviderKey, ModelServiceConsoleMode, ModelServiceProviderRow } from '../typing'
import type { AiModelProviderTemplate, AiModelServiceConfigSummary } from '@/apis/ai'
import { ElMessage, ElMessageBox } from 'element-plus'
import { reactive, shallowRef, toValue } from 'vue'
import {
  createSystemAiModelService,
  createUserAiModelService,
  deleteSystemAiModelService,
  deleteUserAiModelService,
  updateSystemAiModelService,
  updateUserAiModelService,
} from '@/apis/ai'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { isCompatibleProviderKey } from '../utils/modelService'

/**
 * 自定义模型服务参数。
 */
export interface UseModelServiceCustomServicesOptions {
  /** 控制台模式 */
  mode: MaybeRefOrGetter<ModelServiceConsoleMode>
  /** 兼容服务模板 */
  compatibleTemplates: ShallowRef<AiModelProviderTemplate[]>
  /** 已保存服务 */
  services: ShallowRef<AiModelServiceConfigSummary[]>
  /** 当前行标识 */
  selectedRowKey: Readonly<ShallowRef<string | null>>
  /** 设置当前行标识 */
  selectCatalogRow: (rowKey: string | null) => void
  /** 创建表单实例 */
  createFormRef: Readonly<Ref<FormInstance | null>>
  /** 编辑表单实例 */
  editFormRef: Readonly<Ref<FormInstance | null>>
  /** 选择服务行 */
  selectRow: (rowKey: string) => Promise<void>
  /** 更新服务缓存 */
  patchService: (service: AiModelServiceConfigSummary) => void
  /** 移除服务缓存 */
  removeService: (configId: string) => void
  /** 归一化选中行 */
  normalizeSelectedRow: () => void
  /** 同步凭证表单 */
  syncCredentialForms: () => void
  /** 加载当前服务模型 */
  loadModelsForSelectedService: () => Promise<void>
  /** 清空模型 */
  clearModels: () => void
}

export function useModelServiceCustomServices(options: UseModelServiceCustomServicesOptions) {
  const isCreatingService = shallowRef(false)
  const isUpdatingCustomService = shallowRef(false)
  const createDialogVisible = shallowRef(false)
  const editDialogVisible = shallowRef(false)

  const createForm = reactive({
    providerKey: 'openai-compatible' as CompatibleProviderKey,
    providerName: '',
  })

  const editForm = reactive({
    configId: '',
    providerKey: 'openai-compatible' as CompatibleProviderKey,
    providerName: '',
  })

  const createRules = {
    providerKey: [{ required: true, message: '请选择类型', trigger: 'change' }],
    providerName: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  }

  const editRules = {
    providerKey: [{ required: true, message: '请选择类型', trigger: 'change' }],
    providerName: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  }

  function openCreateDialog() {
    const providerKey = options.compatibleTemplates.value[0]?.providerKey
    createForm.providerKey = (providerKey as CompatibleProviderKey | undefined) ?? 'openai-compatible'
    createForm.providerName = ''
    createDialogVisible.value = true
  }

  async function createCustomService() {
    const isValid = await options.createFormRef.value?.validate().catch(() => false)
    if (!isValid) {
      return
    }

    isCreatingService.value = true

    try {
      const service = currentMode() === 'system'
        ? await createSystemAiModelService({
            providerKey: createForm.providerKey,
            providerName: createForm.providerName.trim(),
          })
        : await createUserAiModelService({
            providerKey: createForm.providerKey,
            providerName: createForm.providerName.trim(),
          })

      createDialogVisible.value = false
      options.patchService(service)
      await options.selectRow(`service:${service.configId}`)
      ElMessage.success('服务商已添加')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '添加服务商失败'))
    }
    finally {
      isCreatingService.value = false
    }
  }

  function openEditDialog(row: ModelServiceProviderRow) {
    if (!row.service || row.kind !== 'custom' || !isCompatibleProviderKey(row.providerKey)) {
      return
    }

    editForm.configId = row.service.configId
    editForm.providerKey = row.providerKey
    editForm.providerName = row.title
    editDialogVisible.value = true
  }

  async function updateCustomService() {
    const isValid = await options.editFormRef.value?.validate().catch(() => false)
    if (!isValid) {
      return
    }

    const current = options.services.value.find(service => service.configId === editForm.configId)
    if (!current) {
      editDialogVisible.value = false
      return
    }

    if (current.providerKey !== editForm.providerKey) {
      await ElMessageBox.confirm(
        '切换类型会清空这个服务商已拉取的模型，并移除相关默认模型选择。',
        '切换服务商类型',
        {
          type: 'warning',
          confirmButtonText: '继续',
          cancelButtonText: '取消',
        },
      )
    }

    isUpdatingCustomService.value = true

    try {
      const service = currentMode() === 'system'
        ? await updateSystemAiModelService(editForm.configId, {
            providerKey: editForm.providerKey,
            providerName: editForm.providerName.trim(),
          })
        : await updateUserAiModelService(editForm.configId, {
            providerKey: editForm.providerKey,
            providerName: editForm.providerName.trim(),
          })

      options.patchService(service)
      editDialogVisible.value = false
      options.selectCatalogRow(`service:${service.configId}`)
      if (current.providerKey !== service.providerKey) {
        options.clearModels()
      }
      options.syncCredentialForms()
      ElMessage.success('服务商已更新')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '更新服务商失败'))
    }
    finally {
      isUpdatingCustomService.value = false
    }
  }

  async function deleteCustomService(row: ModelServiceProviderRow) {
    if (!row.service || row.kind !== 'custom') {
      return
    }

    await ElMessageBox.confirm(
      `确认删除「${row.title}」？相关模型和默认模型选择会一起失效。`,
      '删除服务商',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )

    try {
      if (currentMode() === 'system') {
        await deleteSystemAiModelService(row.service.configId)
      }
      else {
        await deleteUserAiModelService(row.service.configId)
      }

      options.removeService(row.service.configId)
      if (options.selectedRowKey.value === row.rowKey) {
        options.selectCatalogRow(null)
        options.clearModels()
      }
      options.normalizeSelectedRow()
      options.syncCredentialForms()
      await options.loadModelsForSelectedService()
      ElMessage.success('服务商已删除')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '删除服务商失败'))
    }
  }

  async function handleCustomCommand(command: string, row: ModelServiceProviderRow) {
    if (command === 'edit') {
      openEditDialog(row)
      return
    }

    if (command === 'delete') {
      await deleteCustomService(row)
    }
  }

  function currentMode() {
    return toValue(options.mode)
  }

  return {
    isCreatingService,
    isUpdatingCustomService,
    createDialogVisible,
    editDialogVisible,
    createForm,
    editForm,
    createRules,
    editRules,
    openCreateDialog,
    createCustomService,
    updateCustomService,
    handleCustomCommand,
  }
}
