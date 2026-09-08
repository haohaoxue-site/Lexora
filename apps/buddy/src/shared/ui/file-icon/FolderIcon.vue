<script setup lang="ts">
import { getFolderIconUrl } from './fileIcon'

defineProps<{
  expanded?: boolean
}>()
</script>

<template>
  <img
    alt=""
    class="buddy-folder-icon"
    draggable="false"
    :src="getFolderIconUrl(expanded)"
  >
</template>

<style scoped>
.buddy-folder-icon {
  flex: none;
  object-fit: contain;
}
</style>
