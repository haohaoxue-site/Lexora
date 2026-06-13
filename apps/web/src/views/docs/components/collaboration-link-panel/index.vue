<script setup lang="ts">
import type {
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
} from '@haohaoxue/samepage-contracts'
import type {
  CollaborationLinkPanelEmits,
  CollaborationLinkPanelProps,
} from './typing'
import { useI18n } from 'vue-i18n'

const props = defineProps<CollaborationLinkPanelProps>()
const emits = defineEmits<CollaborationLinkPanelEmits>()
const permission = defineModel<DocumentCollaborationPermission>('permission', { required: true })
const scope = defineModel<DocumentCollaborationScope>('scope', { required: true })
const { t } = useI18n()
</script>

<template>
  <section class="collaboration-link-panel grid gap-3 py-4">
    <div class="flex items-center justify-between gap-4 max-[720px]:grid max-[720px]:items-stretch">
      <h3 class="m-0 text-[0.95rem] leading-[1.4] text-main">
        {{ t('docs.collaboration.linkCollaboration') }}
      </h3>
      <ElButton
        type="primary"
        plain
        size="small"
        :disabled="props.isUpdatingLink"
        @click="emits('openPassword')"
      >
        {{ props.passwordLabel }}
      </ElButton>
    </div>

    <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 max-[720px]:grid-cols-1 max-[720px]:items-stretch">
      <span
        class="collaboration-link-panel__icon inline-flex h-10 w-10 items-center justify-center rounded-full"
        aria-hidden="true"
      >
        <SvgIcon category="ui" :icon="props.activeLink?.enabled ? 'link' : 'user-group'" size="1.15rem" />
      </span>
      <div class="min-w-0">
        <ElDropdown trigger="click" @command="command => emits('linkEnabledCommand', command)">
          <ElButton text class="collaboration-link-panel__trigger h-auto gap-1 p-0 text-sm font-semibold">
            {{ props.accessTitle }}
            <SvgIcon category="ui" icon="chevron-down" size="0.82rem" />
          </ElButton>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="disabled" :disabled="!props.activeLink">
                {{ t('docs.collaboration.linkAccessDisabled') }}
              </ElDropdownItem>
              <ElDropdownItem command="enabled">
                {{ t('docs.collaboration.linkAccessEnabled') }}
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <p class="mt-1 text-[13px] leading-[1.45] text-secondary">
          {{ props.accessDescription }}
        </p>
      </div>

      <div class="grid grid-cols-[8rem_6.5rem] gap-2 max-[720px]:grid-cols-1">
        <ElSelect
          v-model="scope"
          size="small"
          :disabled="!props.activeLink?.enabled || props.isUpdatingLink"
          @change="emits('saveLink')"
        >
          <ElOption
            v-for="option in props.scopeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </ElSelect>
        <ElSelect
          v-model="permission"
          size="small"
          :disabled="!props.activeLink?.enabled || props.isUpdatingLink"
          @change="emits('saveLink')"
        >
          <ElOption
            v-for="option in props.permissionOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </ElSelect>
      </div>
    </div>

    <div class="collaboration-link-panel__footer flex items-center gap-2 pt-3">
      <ElButton
        class="gap-1.5 rounded-lg"
        :loading="props.isUpdatingLink"
        :disabled="!props.canCopyLink"
        @click="emits('copyLink')"
      >
        <SvgIcon category="ui" icon="link" size="0.95rem" />
        {{ t('docs.publication.copyLink') }}
      </ElButton>
    </div>
  </section>
</template>

<style scoped lang="scss">
.collaboration-link-panel {
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 58%, transparent);
  background: transparent;
}

.collaboration-link-panel__icon {
  background: color-mix(in srgb, var(--brand-primary) 12%, white);
  color: var(--brand-primary);
}

.collaboration-link-panel__trigger {
  &:hover {
    background: transparent !important;
  }
}

.collaboration-link-panel__footer {
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 64%, transparent);
}
</style>
