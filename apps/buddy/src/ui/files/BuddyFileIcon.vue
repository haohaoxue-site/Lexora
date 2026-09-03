<script setup lang="ts">
import { computed } from 'vue'
import {
  materialFileIconNameFromPath,
  materialFileIconUrls,
} from '@/assets/file-icons/materialFileIcons'

const props = withDefaults(defineProps<{
  name: string
  size?: 'medium' | 'preview' | 'small'
}>(), {
  size: 'small',
})

const iconName = computed(() => materialFileIconNameFromPath(props.name))
const iconUrl = computed(() => materialFileIconUrls[iconName.value])
</script>

<template>
  <img
    alt=""
    class="buddy-file-icon"
    :class="`is-${size}`"
    :data-file-icon="iconName"
    draggable="false"
    :src="iconUrl"
  >
</template>

<style scoped>
.buddy-file-icon {
  display: block;
  flex: none;
  object-fit: contain;
}

.buddy-file-icon.is-small {
  width: 1rem;
  height: 1rem;
}

.buddy-file-icon.is-preview {
  width: 3.25rem;
  height: 3.25rem;
}

.buddy-file-icon.is-medium {
  width: 1.4rem;
  height: 1.4rem;
}
</style>
