<script setup lang="ts">
import type {
  CollaborationPasswordEditDialogEmits,
  CollaborationPasswordEditDialogProps,
} from './typing'
import { useI18n } from 'vue-i18n'

const props = defineProps<CollaborationPasswordEditDialogProps>()
const emits = defineEmits<CollaborationPasswordEditDialogEmits>()
const password = defineModel<string>('password', { required: true })
const { t } = useI18n()
</script>

<template>
  <ElDialog
    class="collaboration-password-edit-dialog"
    :model-value="props.modelValue"
    width="420px"
    append-to-body
    align-center
    body-class="pt-1 pb-2"
    @update:model-value="visible => emits('update:modelValue', visible)"
  >
    <template #header>
      <div class="flex items-center">
        <span class="text-[1.05rem] font-bold leading-[1.4] text-main">{{ t('docs.collaboration.editLinkPassword') }}</span>
      </div>
    </template>

    <div class="grid gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <ElInput
          v-model="password"
          class="min-w-[16rem] flex-1"
          :placeholder="t('docs.collaboration.passwordPlaceholder')"
          inputmode="numeric"
          :maxlength="props.passwordLength"
          clearable
          @keyup.enter="emits('submit')"
        />
        <ElButton size="default" @click="emits('generate')">
          <SvgIcon category="ui" icon="sync-refresh" size="1rem" />
          {{ t('docs.collaboration.generatePassword') }}
        </ElButton>
      </div>

      <div
        v-if="props.showValidation"
        class="collaboration-password-edit-dialog__validation grid gap-2 rounded-lg bg-fill-lighter p-3"
      >
        <p
          v-for="error in props.validationErrors"
          :key="error"
          class="m-0 inline-flex items-center gap-2 text-[0.92rem] leading-[1.45] text-danger"
        >
          <SvgIcon category="ui" icon="error" size="1rem" />
          {{ error }}
        </p>
      </div>

      <p class="m-0 text-[0.88rem] leading-[1.65] text-secondary">
        {{ t('docs.collaboration.passwordSecurityHint') }}
      </p>
    </div>

    <template #footer>
      <div class="pt-1">
        <ElButton
          size="default"
          class="min-w-20"
          @click="emits('update:modelValue', false)"
        >
          {{ t('docs.common.cancel') }}
        </ElButton>
        <ElButton
          type="primary"
          size="default"
          class="min-w-20"
          :loading="props.saving"
          :disabled="!props.canSave"
          @click="emits('submit')"
        >
          {{ t('docs.common.save') }}
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>
