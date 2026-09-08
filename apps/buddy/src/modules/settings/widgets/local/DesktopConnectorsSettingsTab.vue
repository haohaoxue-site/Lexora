<script setup lang="ts">
import type { ConnectorsSettingsEmits, ConnectorsSettingsProps } from './typing'
import { NAlert, NButton, NPopconfirm, NSwitch, NTag } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopConnectorForm from './DesktopConnectorForm.vue'
import { useConnectorEditor } from './useConnectorEditor'

const props = defineProps<ConnectorsSettingsProps>()
const emit = defineEmits<ConnectorsSettingsEmits>()
const { t } = useBuddyI18n(() => props.language)
const { cancel, edit, editingConnector, save, saving, toggle } = useConnectorEditor(props)
</script>

<template>
  <section class="desktop-connectors-settings">
    <header>
      <div><h2>{{ t('desktop.connectors.title') }}</h2><p>{{ t('desktop.connectors.description') }}</p></div><NButton :disabled="busy" type="primary" @click="edit(null)">
        {{ t('desktop.connectors.add') }}
      </NButton>
    </header>
    <NAlert v-if="error" type="error" :show-icon="false">
      {{ error }}
    </NAlert>
    <div v-if="editingConnector !== undefined" class="desktop-connectors-settings__form">
      <DesktopConnectorForm
        :key="editingConnector?.id ?? 'new'"
        :connector="editingConnector"
        :language="language"
        :saving="saving"
        @cancel="cancel"
        @save="save"
      />
    </div>
    <div v-if="connectors.length" class="desktop-connectors-settings__group">
      <article v-for="connector in connectors" :key="connector.id" class="desktop-connector-card">
        <div><strong>{{ connector.name }}</strong><small>{{ connector.transport }} · {{ connector.id }}</small></div>
        <NTag :bordered="false" :type="connector.trusted ? 'success' : 'warning'">
          {{ connector.trusted ? t('desktop.connectors.trusted') : t('desktop.connectors.untrusted') }}
        </NTag>
        <NTag :bordered="false">
          {{ connector.credentialConfigured ? t('desktop.connectors.credentialConfigured') : t('desktop.connectors.noCredential') }}
        </NTag>
        <NSwitch
          :value="connector.enabled"
          :disabled="busy || (connector.transport === 'stdio' && !connector.trusted)"
          @update:value="toggle(connector, $event)"
        />
        <NButton :disabled="busy" size="small" @click="edit(connector)">
          {{ t('common.edit') }}
        </NButton>
        <NButton v-if="!connector.trusted" :disabled="busy" size="small" @click="emit('trust', connector.id)">
          {{ t('desktop.connectors.trust') }}
        </NButton>
        <NPopconfirm
          v-if="connector.credentialConfigured"
          @positive-click="emit('clearCredential', connector.id)"
        >
          <template #trigger>
            <NButton :disabled="busy" size="small" ghost>
              {{ t('desktop.connectors.clearCredential') }}
            </NButton>
          </template>{{ t('desktop.connectors.clearCredentialConfirm') }}
        </NPopconfirm>
        <NPopconfirm @positive-click="emit('remove', connector.id)">
          <template #trigger>
            <NButton :disabled="busy" size="small" type="error" ghost>
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
.desktop-connectors-settings__group { overflow: hidden; border: 1px solid var(--buddy-border-subtle); border-radius: 0.65rem; background: var(--buddy-surface-base); }
.desktop-connectors-settings__form { padding: 0.9rem; }
.desktop-connector-card { display: flex; align-items: center; flex-wrap: wrap; gap: 0.55rem; border-bottom: 1px solid var(--buddy-border-subtle); padding: 0.8rem 0.9rem; }
.desktop-connector-card:last-child { border-bottom: 0; }
.desktop-connector-card > div { display: grid; min-width: 12rem; flex: 1; }
.desktop-connector-card small { color: var(--buddy-text-secondary); }
</style>
