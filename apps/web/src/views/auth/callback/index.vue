<script setup lang="ts">
import AuthEntryShell from '../components/AuthEntryShell.vue'
import { useCallback } from './composables/useCallback'

const { statusLabel, errorMessage, pageDescription } = useCallback()
</script>

<template>
  <AuthEntryShell
    :title="statusLabel"
    :description="pageDescription"
  >
    <div class="auth-callback__status">
      <div v-if="!errorMessage" class="auth-callback__spinner" />
      <div v-else class="auth-callback__error-mark">
        <SvgIcon category="ui" icon="error" size="1.5rem" />
      </div>
    </div>

    <ElAlert
      v-if="errorMessage"
      class="auth-callback__alert"
      type="error"
      :title="errorMessage"
      :closable="false"
    />

    <template #footer>
      <RouterLink v-if="errorMessage" :to="{ name: 'login' }" class="auth-callback__back-link">
        返回登录
      </RouterLink>
      <span v-else class="auth-callback__hint">请不要关闭当前页面。</span>
    </template>
  </AuthEntryShell>
</template>

<style scoped lang="scss">
.auth-callback {
  &__status {
    display: flex;
    justify-content: center;
    margin-bottom: 0.5rem;
  }

  &__spinner {
    margin-bottom: 1.5rem;
    width: 3rem;
    height: 3rem;
    border-radius: 9999px;
    border: 3px solid color-mix(in srgb, var(--brand-primary) 20%, transparent);
    border-top-color: var(--brand-primary);
    animation: auth-callback-spin 1s linear infinite;
  }

  &__error-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    margin-bottom: 1.5rem;
    border-radius: 9999px;
    color: var(--brand-error);
    font-size: 1.5rem;
    background: color-mix(in srgb, var(--brand-error) 10%, transparent);
  }

  &__alert {
    border-style: dashed;
    border-radius: 0.75rem;
  }

  &__back-link {
    color: var(--brand-primary);
    font-weight: 600;
    text-decoration: none;
  }

  &__hint {
    color: var(--brand-text-secondary);
    font-size: 0.875rem;
  }
}

@keyframes auth-callback-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
