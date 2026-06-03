import type { MaybeRefOrGetter, Ref, ShallowRef } from 'vue'
import type { AiProviderConsoleMode, AiProviderFormController, AiProviderRow, CompatibleProviderKey } from '../typing'
import type { AiProvider, AiProviderPreset } from '@/apis/ai'
import { reactive, shallowRef, toValue } from 'vue'
import {
  createPlatformAiProvider,
  createUserAiProvider,
  deletePlatformAiProvider,
  deleteUserAiProvider,
  updatePlatformAiProvider,
  updateUserAiProvider,
} from '@/apis/ai'
import { ElMessage, ElMessageBox } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { isCompatibleProviderKey } from '../utils/providerDisplay'

/**
 * 兼容服务商参数。
 */
export interface UseAiCompatibleProvidersOptions {
  /** 控制台模式 */
  mode: MaybeRefOrGetter<AiProviderConsoleMode>
  /** 确保兼容服务商预设已加载 */
  ensureCompatiblePresets: () => Promise<AiProviderPreset[]>
  /** 已保存服务商 */
  providers: ShallowRef<AiProvider[]>
  /** 当前行标识 */
  selectedRowKey: Readonly<ShallowRef<string | null>>
  /** 设置当前行标识 */
  selectCatalogRow: (rowKey: string | null) => void
  /** 创建表单实例 */
  createCompatibleProviderFormRef: Readonly<Ref<AiProviderFormController | null>>
  /** 编辑表单实例 */
  editCompatibleProviderFormRef: Readonly<Ref<AiProviderFormController | null>>
  /** 选择服务商行 */
  selectRow: (rowKey: string) => Promise<void>
  /** 更新服务商缓存 */
  patchProvider: (provider: AiProvider) => void
  /** 移除服务商缓存 */
  removeProvider: (providerId: string) => void
  /** 归一化选中行 */
  normalizeSelectedRow: () => void
  /** 同步凭证表单 */
  syncCredentialForms: () => void
  /** 加载当前服务商 API Key */
  loadApiKeyForSelectedProvider: () => Promise<void>
  /** 加载当前服务商模型 */
  loadModelsForSelectedProvider: () => Promise<void>
  /** 清空模型 */
  clearModels: () => void
}

export function useAiCompatibleProviders(options: UseAiCompatibleProvidersOptions) {
  const isCreatingCompatibleProvider = shallowRef(false)
  const isUpdatingCompatibleProvider = shallowRef(false)
  const createCompatibleProviderDialogVisible = shallowRef(false)
  const editCompatibleProviderDialogVisible = shallowRef(false)

  const compatibleProviderCreateForm = reactive({
    providerKey: 'openai-compatible' as CompatibleProviderKey,
    providerName: '',
  })

  const compatibleProviderEditForm = reactive({
    providerId: '',
    providerKey: 'openai-compatible' as CompatibleProviderKey,
    providerName: '',
  })

  const compatibleProviderCreateRules = {
    providerKey: [{ required: true, message: '请选择类型', trigger: 'change' }],
    providerName: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  }

  const compatibleProviderEditRules = {
    providerKey: [{ required: true, message: '请选择类型', trigger: 'change' }],
    providerName: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  }

  async function openCreateCompatibleProviderDialog() {
    const presets = await loadCompatibleProviderPresets()
    if (!presets) {
      return
    }

    const providerKey = presets[0]?.providerKey
    compatibleProviderCreateForm.providerKey = (providerKey as CompatibleProviderKey | undefined) ?? 'openai-compatible'
    compatibleProviderCreateForm.providerName = ''
    createCompatibleProviderDialogVisible.value = true
  }

  async function createCompatibleProvider() {
    const isValid = await options.createCompatibleProviderFormRef.value?.validate().catch(() => false)
    if (!isValid) {
      return
    }

    isCreatingCompatibleProvider.value = true

    try {
      const provider = currentMode() === 'platform'
        ? await createPlatformAiProvider({
            providerKey: compatibleProviderCreateForm.providerKey,
            providerName: compatibleProviderCreateForm.providerName.trim(),
          })
        : await createUserAiProvider({
            providerKey: compatibleProviderCreateForm.providerKey,
            providerName: compatibleProviderCreateForm.providerName.trim(),
          })

      createCompatibleProviderDialogVisible.value = false
      options.patchProvider(provider)
      await options.selectRow(`provider:${provider.providerId}`)
      ElMessage.success('服务商已添加')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '添加服务商失败'))
    }
    finally {
      isCreatingCompatibleProvider.value = false
    }
  }

  async function openEditCompatibleProviderDialog(row: AiProviderRow) {
    if (row.kind !== 'compatible' || !isCompatibleProviderKey(row.providerKey)) {
      return
    }

    const presets = await loadCompatibleProviderPresets()
    if (!presets) {
      return
    }

    compatibleProviderEditForm.providerId = row.provider.providerId
    compatibleProviderEditForm.providerKey = row.providerKey
    compatibleProviderEditForm.providerName = row.title
    editCompatibleProviderDialogVisible.value = true
  }

  async function updateCompatibleProvider() {
    const isValid = await options.editCompatibleProviderFormRef.value?.validate().catch(() => false)
    if (!isValid) {
      return
    }

    const current = options.providers.value.find(provider => provider.providerId === compatibleProviderEditForm.providerId)
    if (!current) {
      editCompatibleProviderDialogVisible.value = false
      return
    }

    if (current.providerKey !== compatibleProviderEditForm.providerKey) {
      await ElMessageBox.confirm(
        '切换类型会清空这个服务商已添加的模型，并移除相关默认模型选择。',
        '切换服务商类型',
        {
          type: 'warning',
          confirmButtonText: '继续',
          cancelButtonText: '取消',
        },
      )
    }

    isUpdatingCompatibleProvider.value = true

    try {
      const provider = currentMode() === 'platform'
        ? await updatePlatformAiProvider(compatibleProviderEditForm.providerId, {
            providerKey: compatibleProviderEditForm.providerKey,
            providerName: compatibleProviderEditForm.providerName.trim(),
          })
        : await updateUserAiProvider(compatibleProviderEditForm.providerId, {
            providerKey: compatibleProviderEditForm.providerKey,
            providerName: compatibleProviderEditForm.providerName.trim(),
          })

      options.patchProvider(provider)
      editCompatibleProviderDialogVisible.value = false
      options.selectCatalogRow(`provider:${provider.providerId}`)
      if (current.providerKey !== provider.providerKey) {
        options.clearModels()
      }
      options.syncCredentialForms()
      await options.loadApiKeyForSelectedProvider()
      ElMessage.success('服务商已更新')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '更新服务商失败'))
    }
    finally {
      isUpdatingCompatibleProvider.value = false
    }
  }

  async function deleteCompatibleProvider(row: AiProviderRow) {
    if (row.kind !== 'compatible') {
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
      if (currentMode() === 'platform') {
        await deletePlatformAiProvider(row.provider.providerId)
      }
      else {
        await deleteUserAiProvider(row.provider.providerId)
      }

      options.removeProvider(row.provider.providerId)
      if (options.selectedRowKey.value === row.rowKey) {
        options.selectCatalogRow(null)
        options.clearModels()
      }
      options.normalizeSelectedRow()
      options.syncCredentialForms()
      await Promise.all([
        options.loadApiKeyForSelectedProvider(),
        options.loadModelsForSelectedProvider(),
      ])
      ElMessage.success('服务商已删除')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '删除服务商失败'))
    }
  }

  async function handleCompatibleProviderCommand(command: string, row: AiProviderRow) {
    if (command === 'edit') {
      await openEditCompatibleProviderDialog(row)
      return
    }

    if (command === 'delete') {
      await deleteCompatibleProvider(row)
    }
  }

  function currentMode() {
    return toValue(options.mode)
  }

  async function loadCompatibleProviderPresets() {
    try {
      const presets = await options.ensureCompatiblePresets()
      if (presets.length === 0) {
        ElMessage.warning('暂无可添加的兼容服务商类型')
        return null
      }

      return presets
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '加载服务商类型失败'))
      return null
    }
  }

  return {
    isCreatingCompatibleProvider,
    isUpdatingCompatibleProvider,
    createCompatibleProviderDialogVisible,
    editCompatibleProviderDialogVisible,
    compatibleProviderCreateForm,
    compatibleProviderEditForm,
    compatibleProviderCreateRules,
    compatibleProviderEditRules,
    openCreateCompatibleProviderDialog,
    createCompatibleProvider,
    updateCompatibleProvider,
    handleCompatibleProviderCommand,
  }
}
