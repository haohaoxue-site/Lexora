<script setup lang="ts">
import type {
  CollabUserLookupFieldEmits,
  CollabUserLookupFieldProps,
} from './typing'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCollabUserLookup } from '@/composables/useCollabUserLookup'
import CollabIdentityItem from '../identity-item'

const props = withDefaults(defineProps<CollabUserLookupFieldProps>(), {
  disabled: false,
})
const emits = defineEmits<CollabUserLookupFieldEmits>()
const { t } = useI18n()
const code = defineModel<string>('code', {
  default: '',
})
const hasLookupCode = computed(() => code.value.trim().length > 0)
const placeholder = computed(() => props.placeholder ?? t('docs.collaboration.lookupPlaceholder'))
const lookupButtonText = computed(() => props.lookupButtonText ?? t('docs.collaboration.lookup'))

const {
  isLookingUpUser,
  lookupErrorMessage,
  lookupUserByCode,
  matchedUser,
  resetLookupState,
} = useCollabUserLookup({
  selfTargetMessage: props.selfTargetMessage,
})

watch(code, (nextCode, previousCode) => {
  if (nextCode === previousCode) {
    return
  }

  if (!matchedUser.value && !lookupErrorMessage.value && !isLookingUpUser.value) {
    return
  }

  resetLookupState()
  emits('cleared')
})

async function handleLookup() {
  if (props.disabled) {
    return
  }

  if (!hasLookupCode.value) {
    resetLookupState()
    emits('cleared')
    return
  }

  const user = await lookupUserByCode(code.value)

  if (!user) {
    emits('cleared')
    return
  }

  emits('resolved', user)
}
</script>

<template>
  <div class="collab-user-lookup-field flex w-full flex-col gap-3">
    <div class="collab-user-lookup-field__controls flex w-full items-start gap-3 max-[520px]:items-stretch max-[520px]:flex-col">
      <ElInput
        v-model="code"
        class="min-w-0 flex-1"
        :disabled="props.disabled"
        :placeholder="placeholder"
        @keydown.enter.prevent="handleLookup"
      />

      <ElButton
        type="primary"
        class="shrink-0 max-[520px]:w-full"
        :disabled="props.disabled || !hasLookupCode"
        :loading="isLookingUpUser"
        @click="handleLookup"
      >
        {{ lookupButtonText }}
      </ElButton>
    </div>

    <p v-if="lookupErrorMessage" class="collab-user-lookup-field__error text-xs leading-5 text-danger">
      {{ lookupErrorMessage }}
    </p>

    <div
      v-else-if="matchedUser"
      class="collab-user-lookup-field__matched-user flex min-w-0 items-center justify-between gap-3 rounded-[0.875rem] px-3 py-2.5 max-[520px]:items-stretch max-[520px]:flex-col"
    >
      <CollabIdentityItem
        :identity="matchedUser"
        :avatar-size="36"
        class="collab-user-lookup-field__matched-identity min-w-0"
      />
      <slot name="matched-action" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.collab-user-lookup-field {
  &__error {
    margin: 0;
  }

  &__matched-user {
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
    background: color-mix(in srgb, var(--brand-fill-lighter) 84%, transparent);
  }
}
</style>
