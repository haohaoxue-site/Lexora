<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAppSaveShortcut } from '@/composables/useAppSaveCommand'

useAppSaveShortcut()
</script>

<template>
  <RouterView />
</template>
