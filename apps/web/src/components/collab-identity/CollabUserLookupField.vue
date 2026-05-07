<script setup lang="ts">
import type {
  CollabUserLookupFieldEmits,
  CollabUserLookupFieldProps,
} from './typing'
import { computed, watch } from 'vue'
import { useCollabUserLookup } from '@/composables/useCollabUserLookup'
import CollabIdentityItem from './CollabIdentityItem.vue'

const props = withDefaults(defineProps<CollabUserLookupFieldProps>(), {
  placeholder: '请输入完整协作码，例如 SP-ABC2345',
  lookupButtonText: '查找',
  selfTargetMessage: '不能选择自己',
  disabled: false,
})
const emits = defineEmits<CollabUserLookupFieldEmits>()
const code = defineModel<string>('code', {
  default: '',
})
const hasLookupCode = computed(() => code.value.trim().length > 0)

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
  <div class="collab-user-lookup-field">
    <div class="collab-user-lookup-field__controls">
      <ElInput
        v-model="code"
        :disabled="props.disabled"
        :placeholder="props.placeholder"
        @keydown.enter.prevent="handleLookup"
      />

      <ElButton
        type="primary"
        :disabled="props.disabled || !hasLookupCode"
        :loading="isLookingUpUser"
        @click="handleLookup"
      >
        {{ props.lookupButtonText }}
      </ElButton>
    </div>

    <p v-if="lookupErrorMessage" class="collab-user-lookup-field__error">
      {{ lookupErrorMessage }}
    </p>

    <div v-else-if="matchedUser" class="collab-user-lookup-field__matched-user">
      <CollabIdentityItem
        :identity="matchedUser"
        :avatar-size="36"
        class="collab-user-lookup-field__matched-identity"
      />
      <slot name="matched-action" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.collab-user-lookup-field {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;

  &__controls {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    width: 100%;
  }

  :deep(.el-input) {
    flex: 1 1 auto;
    min-width: 0;
  }

  :deep(.el-button) {
    flex: 0 0 auto;
  }

  &__error {
    margin: 0;
    color: var(--brand-error);
    font-size: 0.75rem;
    line-height: 1.25rem;
  }

  &__matched-user {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.625rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 84%, transparent);
  }

  &__matched-identity {
    min-width: 0;
  }
}

@media (max-width: 520px) {
  .collab-user-lookup-field {
    &__controls {
      flex-direction: column;
      align-items: stretch;
    }

    :deep(.el-button) {
      width: 100%;
    }

    &__matched-user {
      flex-direction: column;
      align-items: stretch;
    }
  }
}
</style>
