<script setup lang="ts">
import type { LocalConnector } from '@buddy-electron/shared/localChatApi'
import type { DesktopConnectorFormValue, DesktopConnectorSavePlan } from '@/workbenches/settings/local/desktopConnectorForm'
import { NAlert, NButton, NFormItem, NInput, NSelect } from 'naive-ui'
import { reactive, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { createConnectorSavePlan } from '@/workbenches/settings/local/desktopConnectorForm'

const props = defineProps<{
  connector: LocalConnector | null
  language: string
  saving: boolean
}>()
const emit = defineEmits<{
  cancel: []
  save: [plan: DesktopConnectorSavePlan]
}>()
const { t } = useBuddyI18n(() => props.language)
const validationError = shallowRef(false)
const form = reactive<DesktopConnectorFormValue>(createFormValue(props.connector))

function submit() {
  validationError.value = false
  try {
    emit('save', createConnectorSavePlan(form, props.connector))
  }
  catch {
    validationError.value = true
  }
}

function createFormValue(connector: LocalConnector | null): DesktopConnectorFormValue {
  return {
    args: connector?.transport === 'stdio' ? connector.args.join('\n') : '',
    bearerToken: '',
    command: connector?.transport === 'stdio' ? connector.command : '',
    cwd: connector?.transport === 'stdio' ? connector.cwd ?? '' : '',
    env: '',
    headers: '',
    id: connector?.id ?? '',
    name: connector?.name ?? '',
    transport: connector?.transport ?? 'stdio',
    url: connector?.transport === 'streamable-http' ? connector.url : '',
  }
}
</script>

<template>
  <div class="desktop-connector-form">
    <NAlert v-if="validationError" type="error" :show-icon="false">
      {{ t('desktop.connectors.invalidCredentialEntries') }}
    </NAlert>
    <div class="desktop-connector-form__grid">
      <NFormItem :label="t('desktop.connectors.identifier')">
        <NInput v-model:value="form.id" :disabled="connector !== null" />
      </NFormItem>
      <NFormItem :label="t('desktop.connectors.name')">
        <NInput v-model:value="form.name" />
      </NFormItem>
      <NFormItem label="Transport">
        <NSelect
          v-model:value="form.transport"
          :options="[
            { label: 'stdio', value: 'stdio' },
            { label: 'streamable HTTP', value: 'streamable-http' },
          ]"
        />
      </NFormItem>
      <template v-if="form.transport === 'stdio'">
        <NFormItem :label="t('desktop.connectors.command')">
          <NInput v-model:value="form.command" />
        </NFormItem>
        <NFormItem :label="t('desktop.connectors.cwd')">
          <NInput v-model:value="form.cwd" />
        </NFormItem>
        <NFormItem class="desktop-connector-form__wide" :label="t('desktop.connectors.arguments')">
          <NInput v-model:value="form.args" type="textarea" />
        </NFormItem>
        <NFormItem class="desktop-connector-form__wide" :label="t('desktop.connectors.environment')">
          <NInput
            v-model:value="form.env"
            type="textarea"
            :placeholder="t('desktop.connectors.environmentHint')"
          />
        </NFormItem>
      </template>
      <template v-else>
        <NFormItem class="desktop-connector-form__wide" label="URL">
          <NInput v-model:value="form.url" placeholder="https://…" />
        </NFormItem>
        <NFormItem class="desktop-connector-form__wide" :label="t('desktop.connectors.bearerToken')">
          <NInput v-model:value="form.bearerToken" type="password" show-password-on="click" />
        </NFormItem>
        <NFormItem class="desktop-connector-form__wide" :label="t('desktop.connectors.headers')">
          <NInput
            v-model:value="form.headers"
            type="textarea"
            :placeholder="t('desktop.connectors.headersHint')"
          />
        </NFormItem>
      </template>
    </div>
    <footer>
      <NButton :disabled="saving" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </NButton>
      <NButton type="primary" :loading="saving" @click="submit">
        {{ t('common.save') }}
      </NButton>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.desktop-connector-form { display: grid; gap: 0.7rem; }
.desktop-connector-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 0.7rem; }
.desktop-connector-form__wide { grid-column: 1 / -1; }
.desktop-connector-form footer { display: flex; justify-content: flex-end; gap: 0.5rem; }

@media (max-width: 42rem) {
  .desktop-connector-form__grid { grid-template-columns: minmax(0, 1fr); }
  .desktop-connector-form__wide { grid-column: auto; }
}
</style>
