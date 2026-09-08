<script setup lang="ts">
import type { ReasoningFieldState } from './typing'
import { useTemplateRef } from 'vue'
import { useReasoningFieldCanvas } from './reasoning-field/useReasoningFieldCanvas'

const props = defineProps<ReasoningFieldState>()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
useReasoningFieldCanvas(canvas, props)
</script>

<template>
  <canvas ref="canvas" class="desktop-reasoning-field-canvas" />
</template>

<style scoped>
.desktop-reasoning-field-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
