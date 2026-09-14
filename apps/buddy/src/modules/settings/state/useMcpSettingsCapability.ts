import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalConnector, LocalConnectorConfig, LocalConnectorCredentialMutation } from '@buddy-shared/connectors/connectorApi'
import type { Ref } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'

export function useMcpSettingsCapability(options: {
  api: LexoraDesktopApi['localChat']['connectors']
  language: Readonly<Ref<BuddyLocale>>
}) {
  const connectors = shallowRef<readonly LocalConnector[]>([])
  const busyId = shallowRef<string | null>(null)
  const error = shallowRef<string | null>(null)
  const loaded = shallowRef(false)
  let reading: Promise<void> | undefined

  async function load() {
    if (reading)
      return reading
    const operation = options.api.list().then((value) => {
      connectors.value = value
      loaded.value = true
    }).catch((cause: unknown) => {
      error.value = resolveLocalChatErrorMessage(cause, options.language.value)
    }).finally(() => { reading = undefined })
    reading = operation
    return operation
  }

  async function execute<T>(id: string, action: () => Promise<T>): Promise<T | null> {
    if (busyId.value)
      return null
    busyId.value = id
    error.value = null
    try {
      const result = await action()
      await reading
      await load()
      return result
    }
    catch (cause) {
      error.value = resolveLocalChatErrorMessage(cause, options.language.value)
      return null
    }
    finally { busyId.value = null }
  }

  return {
    connectors: readonly(connectors),
    busyId: readonly(busyId),
    error: readonly(error),
    loaded: readonly(loaded),
    language: options.language,
    load,
    save: (input: { config: LocalConnectorConfig, credential: LocalConnectorCredentialMutation }) => execute(input.config.id, () => options.api.upsert(input)),
    setEnabled: (id: string, enabled: boolean) => execute(id, () => options.api.setEnabled(id, enabled)),
    test: (id: string) => execute(id, () => options.api.test(id)),
    tools: (id: string) => execute(id, () => options.api.tools(id)),
    trust: (id: string, trusted = true) => execute(id, () => options.api.trust(id, trusted)),
    remove: (id: string) => execute(id, () => options.api.remove(id)),
    login: (id: string) => execute(id, () => options.api.login(id)),
    cancelLogin: (id: string) => execute(id, () => options.api.cancelLogin(id)),
    clearCredential: (id: string) => execute(id, () => options.api.clearCredential(id)),
  }
}

export type McpSettingsCapability = ReturnType<typeof useMcpSettingsCapability>
