import type { LocalConnector, LocalConnectorConfig } from '@buddy-shared/connectors/connectorApi'
import type { DesktopConnectorSavePlan } from '../../model/desktopConnectorForm'
import type { ConnectorsSettingsProps } from './typing'
import { onScopeDispose, shallowRef } from 'vue'

export function useConnectorEditor(props: Readonly<ConnectorsSettingsProps>) {
  const editingConnector = shallowRef<LocalConnector | null | undefined>()
  const saving = shallowRef(false)
  let generation = 0
  let disposed = false

  function edit(connector: LocalConnector | null = null): void {
    generation += 1
    editingConnector.value = connector
  }

  function cancel(): void {
    generation += 1
    editingConnector.value = undefined
  }

  async function save(plan: DesktopConnectorSavePlan): Promise<void> {
    if (saving.value || props.busy)
      return
    const current = generation
    saving.value = true
    try {
      const saved = await props.saveConnector(plan)
      if (!disposed && saved && current === generation)
        editingConnector.value = undefined
    }
    finally {
      if (!disposed)
        saving.value = false
    }
  }

  function toggle(connector: LocalConnector, enabled: boolean): void {
    const config: LocalConnectorConfig = connector.transport === 'stdio'
      ? { args: [...connector.args], command: connector.command, cwd: connector.cwd, enabled, id: connector.id, name: connector.name, transport: 'stdio' }
      : { enabled, id: connector.id, name: connector.name, transport: 'streamable-http', url: connector.url }
    void props.saveConnector({ config, credential: { mode: 'keep' } })
  }

  onScopeDispose(() => {
    disposed = true
  })
  return { cancel, edit, editingConnector, save, saving, toggle }
}
