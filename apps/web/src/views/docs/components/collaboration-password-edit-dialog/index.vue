<script setup lang="ts">
import type {
  CollaborationPasswordEditDialogEmits,
  CollaborationPasswordEditDialogProps,
} from './typing'

const props = defineProps<CollaborationPasswordEditDialogProps>()
const emits = defineEmits<CollaborationPasswordEditDialogEmits>()
const password = defineModel<string>('password', { required: true })
</script>

<template>
  <ElDialog
    class="collaboration-password-edit-dialog"
    :model-value="props.modelValue"
    width="420px"
    append-to-body
    align-center
    body-class="pt-1 pb-[0.45rem]"
    @update:model-value="visible => emits('update:modelValue', visible)"
  >
    <template #header>
      <div class="flex items-center">
        <span class="text-[1.05rem] font-bold leading-[1.4] text-main">修改链接密码</span>
      </div>
    </template>

    <div class="grid gap-[0.85rem]">
      <div class="flex flex-wrap items-center gap-[0.55rem]">
        <ElInput
          v-model="password"
          class="min-w-[16rem] flex-1"
          placeholder="请输入新密码"
          inputmode="numeric"
          :maxlength="props.passwordLength"
          clearable
          @keyup.enter="emits('submit')"
        />
        <ElButton @click="emits('generate')">
          <SvgIcon category="ui" icon="sync-refresh" size="1rem" />
          随机生成
        </ElButton>
      </div>

      <div
        v-if="props.showValidation"
        class="grid gap-[0.45rem] rounded-[0.45rem] bg-fill-lighter p-[0.8rem]"
      >
        <p
          v-for="error in props.validationErrors"
          :key="error"
          class="m-0 inline-flex items-center gap-[0.45rem] text-[0.92rem] leading-[1.45] text-danger"
        >
          <SvgIcon category="ui" icon="error" size="1rem" />
          {{ error }}
        </p>
      </div>

      <p class="m-0 text-[0.88rem] leading-[1.65] text-secondary">
        安全提示：请勿使用个人常用或其他平台中的密码
      </p>
    </div>

    <template #footer>
      <div class="pt-[0.35rem]">
        <ElButton
          size="large"
          class="min-w-[5.5rem]"
          @click="emits('update:modelValue', false)"
        >
          取消
        </ElButton>
        <ElButton
          type="primary"
          size="large"
          class="min-w-[5.5rem]"
          :loading="props.saving"
          :disabled="!props.canSave"
          @click="emits('submit')"
        >
          保存
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>
