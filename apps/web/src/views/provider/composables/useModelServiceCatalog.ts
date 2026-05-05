import type { MaybeRefOrGetter } from 'vue'
import type { ModelServiceConsoleMode, ModelServiceProviderRow } from '../typing'
import type { AiModelProviderTemplate, AiModelServiceConfigSummary } from '@/apis/ai'
import { computed, shallowRef, toValue } from 'vue'
import {
  createSystemAiModelService,
  createUserAiModelService,
  getAiCompatibleProviderTemplates,
  getAiModelProviderTemplates,
  getSystemAiModelServices,
  getUserAiModelServices,
} from '@/apis/ai'
import { isCompatibleProviderKey } from '../utils/modelService'

/**
 * 模型服务目录参数。
 */
export interface UseModelServiceCatalogOptions {
  /** 控制台模式 */
  mode: MaybeRefOrGetter<ModelServiceConsoleMode>
}

export function useModelServiceCatalog(options: UseModelServiceCatalogOptions) {
  const templates = shallowRef<AiModelProviderTemplate[]>([])
  const compatibleTemplates = shallowRef<AiModelProviderTemplate[]>([])
  const services = shallowRef<AiModelServiceConfigSummary[]>([])
  const selectedRowKey = shallowRef<string | null>(null)
  const searchKeyword = shallowRef('')

  const templateByKey = computed(() => new Map(
    [...templates.value, ...compatibleTemplates.value].map(template => [template.providerKey, template]),
  ))

  const allRows = computed<ModelServiceProviderRow[]>(() => {
    const builtinRows: ModelServiceProviderRow[] = templates.value
      .filter(template => !isCompatibleProviderKey(template.providerKey))
      .map((template) => {
        const service = services.value.find(item => item.providerKey === template.providerKey) ?? null

        return {
          rowKey: `template:${template.providerKey}`,
          kind: 'template' as const,
          providerKey: template.providerKey,
          title: template.providerName,
          template,
          service,
        }
      })

    const customRows: ModelServiceProviderRow[] = []
    for (const service of services.value) {
      if (!isCompatibleProviderKey(service.providerKey)) {
        continue
      }

      const template = templateByKey.value.get(service.providerKey)
      if (!template) {
        continue
      }

      customRows.push({
        rowKey: `service:${service.configId}`,
        kind: 'custom' as const,
        providerKey: service.providerKey,
        title: service.providerName,
        template,
        service,
      })
    }

    return [...builtinRows, ...customRows]
  })

  const filteredRows = computed(() => {
    const keyword = searchKeyword.value.trim().toLowerCase()
    if (!keyword) {
      return allRows.value
    }

    return allRows.value.filter(row =>
      row.title.toLowerCase().includes(keyword)
      || row.providerKey.toLowerCase().includes(keyword),
    )
  })

  const selectedRow = computed(() => allRows.value.find(row => row.rowKey === selectedRowKey.value) ?? null)
  const selectedService = computed(() => selectedRow.value?.service ?? null)
  const selectedTemplate = computed(() => selectedRow.value?.template ?? null)
  const selectedTitle = computed(() => selectedRow.value?.title ?? '')

  async function loadCatalog() {
    const [nextTemplates, nextCompatibleTemplates, nextServices] = await Promise.all([
      getAiModelProviderTemplates(),
      getAiCompatibleProviderTemplates(),
      loadServices(),
    ])

    templates.value = nextTemplates
    compatibleTemplates.value = nextCompatibleTemplates
    services.value = nextServices
    normalizeSelectedRow()
  }

  function loadServices() {
    return currentMode() === 'system'
      ? getSystemAiModelServices()
      : getUserAiModelServices()
  }

  function selectRow(rowKey: string | null) {
    selectedRowKey.value = rowKey
  }

  async function ensureSelectedService() {
    if (selectedService.value) {
      return selectedService.value
    }

    const row = selectedRow.value
    if (!row) {
      throw new Error('未选择服务商')
    }

    const service = currentMode() === 'system'
      ? await createSystemAiModelService({
          providerKey: row.providerKey,
          providerName: row.title,
        })
      : await createUserAiModelService({
          providerKey: row.providerKey,
          providerName: row.title,
        })

    services.value = [service, ...services.value]
    selectedRowKey.value = row.kind === 'template' && !isCompatibleProviderKey(row.providerKey)
      ? row.rowKey
      : `service:${service.configId}`

    return service
  }

  function patchService(service: AiModelServiceConfigSummary) {
    if (services.value.some(item => item.configId === service.configId)) {
      services.value = services.value.map(item => item.configId === service.configId ? service : item)
      return
    }

    services.value = [service, ...services.value]
  }

  function patchServiceModelCount(configId: string, modelCount: number) {
    services.value = services.value.map(item => item.configId === configId
      ? { ...item, modelCount }
      : item)
  }

  function removeService(configId: string) {
    services.value = services.value.filter(service => service.configId !== configId)
  }

  function normalizeSelectedRow() {
    if (selectedRowKey.value && allRows.value.some(row => row.rowKey === selectedRowKey.value)) {
      return
    }

    selectedRowKey.value = allRows.value[0]?.rowKey ?? null
  }

  function currentMode() {
    return toValue(options.mode)
  }

  return {
    compatibleTemplates,
    services,
    selectedRowKey,
    searchKeyword,
    filteredRows,
    selectedRow,
    selectedService,
    selectedTemplate,
    selectedTitle,
    loadCatalog,
    selectRow,
    ensureSelectedService,
    patchService,
    patchServiceModelCount,
    removeService,
    normalizeSelectedRow,
  }
}
