<script setup lang="ts">
import type {
  CollaborationPasswordPanelEmits,
  CollaborationPasswordPanelProps,
} from './typing'
import { useI18n } from 'vue-i18n'

const props = defineProps<CollaborationPasswordPanelProps>()
const emits = defineEmits<CollaborationPasswordPanelEmits>()
const { t } = useI18n()
</script>

<template>
  <section class="collaboration-password-panel grid content-start gap-3">
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0">
        <h3 class="m-0 text-[0.95rem] font-bold leading-[1.4] text-main">
          {{ t('docs.collaboration.enablePassword') }}
        </h3>
        <p class="mt-1 text-[13px] leading-[1.45] text-secondary">
          {{ t('docs.collaboration.passwordDescription', { length: props.passwordLength }) }}
        </p>
      </div>
      <ElSwitch
        :model-value="props.passwordEnabled"
        :loading="props.updating"
        :disabled="props.updating"
        @change="value => emits('updatePasswordEnabled', value)"
      />
    </div>

    <div
      v-if="props.passwordEnabled"
      class="collaboration-password-panel__card flex items-center justify-between gap-4 rounded-lg px-4 py-3"
    >
      <div>
        <div class="text-xs leading-[1.4] text-secondary">
          {{ t('docs.collaboration.currentPassword') }}
        </div>
        <div class="mt-1 font-mono text-sm font-semibold leading-[1.4] text-main">
          {{ props.passwordStateLabel }}
        </div>
      </div>
      <ElButton
        :disabled="props.updating"
        @click="emits('editPassword')"
      >
        {{ t('docs.collaboration.editPassword') }}
      </ElButton>
    </div>

    <ElAlert
      v-else
      :title="t('docs.collaboration.noPassword')"
      type="info"
      :closable="false"
      show-icon
    />
  </section>
</template>

<style scoped lang="scss">
.collaboration-password-panel__card {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  background: color-mix(in srgb, var(--brand-bg-surface-raised) 88%, var(--brand-bg-surface));
}
</style>
