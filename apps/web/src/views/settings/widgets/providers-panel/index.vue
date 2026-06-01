<script setup lang="ts">
import AiProviderConsole from '@/components/ai-provider-console'
</script>

<template>
  <div class="settings-providers-panel box-border h-full min-h-[calc(100vh-var(--default-header-height))] bg-fill-lighter p-6 pb-8">
    <AiProviderConsole class="h-full min-h-[40rem]" mode="user" />
  </div>
</template>
