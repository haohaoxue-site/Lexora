<script setup lang="ts">
import type {
  CollaborationPasswordPanelEmits,
  CollaborationPasswordPanelProps,
} from './typing'

const props = defineProps<CollaborationPasswordPanelProps>()
const emits = defineEmits<CollaborationPasswordPanelEmits>()
</script>

<template>
  <section class="collaboration-password-panel grid content-start gap-3">
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0">
        <h3 class="m-0 text-[0.95rem] font-bold leading-[1.4] text-main">
          启用链接密码
        </h3>
        <p class="mt-1 text-[13px] leading-[1.45] text-secondary">
          开启后，访问协作链接需要输入 {{ props.passwordLength }} 位数字密码。
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
          当前密码
        </div>
        <div class="mt-1 font-mono text-sm font-semibold leading-[1.4] text-main">
          {{ props.passwordStateLabel }}
        </div>
      </div>
      <ElButton
        :disabled="props.updating"
        @click="emits('editPassword')"
      >
        修改密码
      </ElButton>
    </div>

    <ElAlert
      v-else
      title="当前链接不需要密码"
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
