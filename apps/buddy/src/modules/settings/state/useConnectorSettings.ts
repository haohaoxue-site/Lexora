import type { LocalConnector } from '@buddy-shared/connectors/connectorApi'
import type { ConnectorSettingsStore, LocalCapabilitiesOptions } from './typing'
import { computed, readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'

export function useConnectorSettings(options: LocalCapabilitiesOptions): ConnectorSettingsStore {
  const connectors = shallowRef<readonly LocalConnector[]>([])
  const connectorsError = shallowRef<string | null>(null)
  const isLoadingConnectors = shallowRef(false)
  const pendingMutations = shallowRef(0)
  let generation = 0
  let disposed = false
  let mutation = Promise.resolve(true)

  async function loadConnectors(): Promise<boolean> {
    if (disposed)
      return false
    if (pendingMutations.value)
      return mutation
    const current = ++generation
    isLoadingConnectors.value = true
    connectorsError.value = null
    try {
      const result = await options.api.connectors.list()
      if (disposed || current !== generation)
        return false
      connectors.value = result
      return true
    }
    catch (error) {
      if (!disposed && current === generation)
        connectorsError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
    finally {
      if (!disposed && current === generation)
        isLoadingConnectors.value = false
    }
  }

  function mutate(action: () => Promise<readonly LocalConnector[]>): Promise<boolean> {
    if (disposed)
      return Promise.resolve(false)
    generation += 1
    isLoadingConnectors.value = false
    pendingMutations.value += 1
    mutation = mutation.then(async () => {
      if (disposed)
        return false
      connectorsError.value = null
      try {
        const result = await action()
        if (disposed)
          return false
        connectors.value = result
        return true
      }
      catch (error) {
        if (!disposed)
          connectorsError.value = resolveLocalChatErrorMessage(error, options.language.value)
        return false
      }
      finally {
        if (!disposed)
          pendingMutations.value -= 1
      }
    })
    return mutation
  }

  return {
    clearConnectorCredential: connectorId => mutate(async () => {
      await options.api.connectors.clearCredential(connectorId)
      return options.api.connectors.list()
    }),
    connectors: readonly(connectors),
    connectorsError: readonly(connectorsError),
    dispose: () => { disposed = true },
    isLoadingConnectors: readonly(isLoadingConnectors),
    isMutatingConnectors: computed(() => pendingMutations.value > 0),
    loadConnectors,
    removeConnector: connectorId => mutate(async () => {
      await options.api.connectors.remove(connectorId)
      return options.api.connectors.list()
    }),
    saveConnector: input => mutate(() => options.api.connectors.upsert(input)),
    setConnectorCredential: (connectorId, credential) => mutate(async () => {
      await options.api.connectors.setCredential(connectorId, credential)
      return options.api.connectors.list()
    }),
    trustConnector: connectorId => mutate(async () => {
      await options.api.connectors.trust(connectorId)
      return options.api.connectors.list()
    }),
  }
}
