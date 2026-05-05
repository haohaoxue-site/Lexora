import type { CompatibleProviderKey, ModelServiceProviderRow } from '../typing'
import { COMPATIBLE_PROVIDER_KEYS } from '../typing'

export function isCompatibleProviderKey(providerKey: string): providerKey is CompatibleProviderKey {
  return COMPATIBLE_PROVIDER_KEYS.includes(providerKey as CompatibleProviderKey)
}

export function isValidUrl(value: string) {
  try {
    void new URL(value)
    return true
  }
  catch {
    return false
  }
}

export function getProviderInitial(row: ModelServiceProviderRow) {
  return row.title.trim().slice(0, 1).toUpperCase() || 'AI'
}

export function getProviderStatusLabel(row: ModelServiceProviderRow) {
  return row.service?.enabled ? '已启用' : '未启用'
}

export function getProviderStatusType(row: ModelServiceProviderRow) {
  return row.service?.enabled ? 'success' : 'info'
}
