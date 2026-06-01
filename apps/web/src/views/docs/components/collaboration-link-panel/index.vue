<script setup lang="ts">
import type {
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
} from '@haohaoxue/samepage-contracts'
import type {
  CollaborationLinkPanelEmits,
  CollaborationLinkPanelProps,
} from './typing'

const props = defineProps<CollaborationLinkPanelProps>()
const emits = defineEmits<CollaborationLinkPanelEmits>()
const permission = defineModel<DocumentCollaborationPermission>('permission', { required: true })
const scope = defineModel<DocumentCollaborationScope>('scope', { required: true })
</script>

<template>
  <section class="collaboration-link-panel grid gap-[0.85rem] py-4">
    <div class="flex items-center justify-between gap-4 max-[720px]:grid max-[720px]:items-stretch">
      <h3 class="m-0 text-[0.95rem] leading-[1.4] text-main">
        链接协作
      </h3>
      <ElButton
        type="primary"
        plain
        :disabled="props.isUpdatingLink"
        @click="emits('openPassword')"
      >
        {{ props.passwordLabel }}
      </ElButton>
    </div>

    <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[0.85rem] max-[720px]:grid-cols-1 max-[720px]:items-stretch">
      <span
        class="collaboration-link-panel__icon inline-flex h-[2.65rem] w-[2.65rem] items-center justify-center rounded-full"
        aria-hidden="true"
      >
        <SvgIcon category="ui" :icon="props.activeLink?.enabled ? 'link' : 'user-group'" size="1.15rem" />
      </span>
      <div class="min-w-0">
        <ElDropdown trigger="click" @command="command => emits('linkEnabledCommand', command)">
          <ElButton text class="collaboration-link-panel__trigger h-auto gap-[0.25rem] p-0 text-[0.95rem]">
            {{ props.accessTitle }}
            <SvgIcon category="ui" icon="chevron-down" size="0.82rem" />
          </ElButton>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="disabled" :disabled="!props.activeLink">
                未开启
              </ElDropdownItem>
              <ElDropdownItem command="enabled">
                获得链接的人
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <p class="mt-[0.22rem] text-[0.82rem] leading-[1.45] text-secondary">
          {{ props.accessDescription }}
        </p>
      </div>

      <div class="grid grid-cols-[8.25rem_6.75rem] gap-[0.55rem] max-[720px]:grid-cols-1">
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

    <div class="collaboration-link-panel__footer flex items-center gap-[0.6rem] pt-[0.85rem]">
      <ElButton
        class="gap-[0.35rem]"
        round
        :loading="props.isUpdatingLink"
        :disabled="!props.canCopyLink"
        @click="emits('copyLink')"
      >
        <SvgIcon category="ui" icon="link" size="0.95rem" />
        复制链接
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
  background: var(--brand-primary);
  color: #ffffff;
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
