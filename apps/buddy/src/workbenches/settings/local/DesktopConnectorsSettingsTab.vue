<script setup lang="ts">
import type { LocalConnector, LocalConnectorConfig } from '@buddy-electron/shared/localChatApi'
import type { DesktopConnectorSavePlan } from '@/workbenches/settings/local/desktopConnectorForm'
import type { DesktopLocalSettingsCapability } from '@/workbenches/settings/local/desktopLocalSettingsCapability'
import { NAlert, NButton, NPopconfirm, NSwitch, NTag } from 'naive-ui'
import { shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopConnectorForm from '@/workbenches/settings/local/DesktopConnectorForm.vue'

const props = defineProps<{ localSettings: DesktopLocalSettingsCapability }>()
const localSettings = props.localSettings
const { t } = useBuddyI18n(localSettings.language)
const editingConnector = shallowRef<LocalConnector | null | undefined>()
const saving = shallowRef(false)

function edit(connector: LocalConnector | null = null) {
  editingConnector.value = connector
}

async function save(plan: DesktopConnectorSavePlan) {
  saving.value = true
  try {
    if (!await localSettings.saveConnector(plan))
      return
    editingConnector.value = undefined
  }
  finally {
    saving.value = false
  }
}

function toggle(connector: LocalConnector, enabled: boolean) {
  const config: LocalConnectorConfig = connector.transport === 'stdio'
    ? { args: [...connector.args], command: connector.command, cwd: connector.cwd, enabled, id: connector.id, name: connector.name, transport: 'stdio' }
    : { enabled, id: connector.id, name: connector.name, transport: 'streamable-http', url: connector.url }
  void localSettings.saveConnector({ config, credential: { mode: 'keep' } })
}
</script>

<template>
  <section class="desktop-connectors-settings">
    <header>
      <div><h2>{{ t('desktop.connectors.title') }}</h2><p>{{ t('desktop.connectors.description') }}</p></div><NButton type="primary" @click="edit(null)">
        {{ t('desktop.connectors.add') }}
      </NButton>
    </header>
    <NAlert v-if="localSettings.connectorsError.value" type="error" :show-icon="false">
      {{ localSettings.connectorsError.value }}
    </NAlert>
    <div v-if="editingConnector !== undefined" class="desktop-connectors-settings__form">
      <DesktopConnectorForm
        :key="editingConnector?.id ?? 'new'"
        :connector="editingConnector"
        :language="localSettings.language.value"
        :saving="saving"
        @cancel="editingConnector = undefined"
        @save="save"
      />
    </div>
    <div v-if="localSettings.connectors.value.length" class="desktop-connectors-settings__group">
      <article v-for="connector in localSettings.connectors.value" :key="connector.id" class="desktop-connector-card">
        <div><strong>{{ connector.name }}</strong><small>{{ connector.transport }} · {{ connector.id }}</small></div>
        <NTag :bordered="false" :type="connector.trusted ? 'success' : 'warning'">
          {{ connector.trusted ? t('desktop.connectors.trusted') : t('desktop.connectors.untrusted') }}
        </NTag>
        <NTag :bordered="false">
          {{ connector.credentialConfigured ? t('desktop.connectors.credentialConfigured') : t('desktop.connectors.noCredential') }}
        </NTag>
        <NSwitch
          :value="connector.enabled"
          :disabled="connector.transport === 'stdio' && !connector.trusted"
          @update:value="toggle(connector, $event)"
        />
        <NButton size="small" @click="edit(connector)">
          {{ t('common.edit') }}
        </NButton>
        <NButton v-if="!connector.trusted" size="small" @click="localSettings.trustConnector(connector.id)">
          {{ t('desktop.connectors.trust') }}
        </NButton>
        <NPopconfirm
          v-if="connector.credentialConfigured"
          @positive-click="localSettings.clearConnectorCredential(connector.id)"
        >
          <template #trigger>
            <NButton size="small" ghost>
              {{ t('desktop.connectors.clearCredential') }}
            </NButton>
          </template>{{ t('desktop.connectors.clearCredentialConfirm') }}
        </NPopconfirm>
        <NPopconfirm @positive-click="localSettings.removeConnector(connector.id)">
          <template #trigger>
            <NButton size="small" type="error" ghost>
              {{ t('common.delete') }}
            </NButton>
          </template>{{ t('desktop.connectors.removeConfirm') }}
        </NPopconfirm>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
.desktop-connectors-settings { display: grid; gap: 0.8rem; }
.desktop-connectors-settings > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.desktop-connectors-settings h2,
.desktop-connectors-settings p { margin: 0; }
.desktop-connectors-settings header p { margin-top: 0.25rem; color: var(--buddy-text-secondary); font-size: 0.75rem; }
.desktop-connectors-settings__form,
.desktop-connectors-settings__group { overflow: hidden; border: 1px solid var(--buddy-border-light); border-radius: 0.65rem; background: var(--buddy-bg-surface); }
.desktop-connectors-settings__form { padding: 0.9rem; }
.desktop-connector-card { display: flex; align-items: center; flex-wrap: wrap; gap: 0.55rem; border-bottom: 1px solid var(--buddy-border-light); padding: 0.8rem 0.9rem; }
.desktop-connector-card:last-child { border-bottom: 0; }
.desktop-connector-card > div { display: grid; min-width: 12rem; flex: 1; }
.desktop-connector-card small { color: var(--buddy-text-secondary); }
</style>
