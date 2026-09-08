<script setup lang="ts">
defineProps<{
  mode: 'continuous' | 'static'
}>()
</script>

<template>
  <span
    class="buddy-shimmer-text"
    :class="`buddy-shimmer-text--${mode}`"
  ><slot /></span>
</template>
