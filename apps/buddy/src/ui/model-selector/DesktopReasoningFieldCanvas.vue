<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

interface StarParticle {
  phase: number
  size: number
  speed: number
  threshold: number
  tone: number
  x: number
  y: number
}

interface ConstellationThread {
  bend: number
  threshold: number
  x1: number
  x2: number
  y1: number
  y2: number
}

const props = defineProps<{
  dragging: boolean
  progress: number
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const particles = Array.from({ length: 168 }, (_, index): StarParticle => ({
  phase: seededRandom(index, 3) * Math.PI * 2,
  size: 0.28 + seededRandom(index, 7) * 0.82,
  speed: 0.22 + seededRandom(index, 11) * 0.72,
  threshold: seededRandom(index, 13),
  tone: seededRandom(index, 17),
  x: seededRandom(index, 23),
  y: 0.12 + seededRandom(index, 29) * 0.76,
}))
const threads = Array.from({ length: 28 }, (_, index): ConstellationThread => {
  const x1 = seededRandom(index, 31) * 0.88
  return {
    bend: (seededRandom(index, 37) - 0.5) * 0.24,
    threshold: seededRandom(index, 41),
    x1,
    x2: Math.min(0.98, x1 + 0.035 + seededRandom(index, 43) * 0.1),
    y1: 0.16 + seededRandom(index, 47) * 0.68,
    y2: 0.16 + seededRandom(index, 53) * 0.68,
  }
})
let animationFrame = 0
let displayedProgress = props.progress
let lastFrameTime = 0
let reducedMotion = false
let waveMomentum = 0
let reducedMotionMedia: MediaQueryList | null = null
let resizeObserver: ResizeObserver | null = null
const waveMaskCanvas = document.createElement('canvas')
let themeObserver: MutationObserver | null = null

watch(() => props.progress, () => {
  if (!reducedMotion)
    return
  displayedProgress = props.progress
  draw(performance.now())
})

onMounted(() => {
  reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = reducedMotionMedia.matches
  reducedMotionMedia.addEventListener('change', handleReducedMotionChange)
  resizeObserver = new ResizeObserver(resizeCanvas)
  if (canvas.value)
    resizeObserver.observe(canvas.value)
  themeObserver = new MutationObserver(() => draw(performance.now()))
  themeObserver.observe(document.documentElement, {
    attributeFilter: ['data-buddy-theme'],
    attributes: true,
  })
  resizeCanvas()
  syncAnimation()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  reducedMotionMedia?.removeEventListener('change', handleReducedMotionChange)
})

function handleReducedMotionChange(event: MediaQueryListEvent) {
  reducedMotion = event.matches
  displayedProgress = props.progress
  waveMomentum = 0
  syncAnimation()
}

function syncAnimation() {
  cancelAnimationFrame(animationFrame)
  animationFrame = 0
  lastFrameTime = 0
  if (reducedMotion) {
    draw(0)
    return
  }
  animationFrame = requestAnimationFrame(renderFrame)
}

function renderFrame(time: number) {
  const elapsed = lastFrameTime === 0 ? 16 : Math.min(64, time - lastFrameTime)
  lastFrameTime = time
  const previousProgress = displayedProgress
  const response = props.dragging ? 0.038 : 0.016
  const easing = 1 - Math.exp(-elapsed * response)
  displayedProgress += (props.progress - displayedProgress) * easing
  if (Math.abs(displayedProgress - props.progress) < 0.0005)
    displayedProgress = props.progress
  const momentumTarget = props.dragging
    ? clamp((displayedProgress - previousProgress) * 36, -1, 1)
    : 0
  const momentumResponse = 1 - Math.exp(-elapsed * (props.dragging ? 0.08 : 0.012))
  waveMomentum += (momentumTarget - waveMomentum) * momentumResponse
  if (Math.abs(waveMomentum) < 0.001)
    waveMomentum = 0
  draw(time)
  animationFrame = requestAnimationFrame(renderFrame)
}

function resizeCanvas() {
  const element = canvas.value
  if (!element)
    return
  const bounds = element.getBoundingClientRect()
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(bounds.width * pixelRatio))
  const height = Math.max(1, Math.round(bounds.height * pixelRatio))
  if (element.width !== width || element.height !== height) {
    element.width = width
    element.height = height
  }
  draw(performance.now())
}

function draw(frameTime: number) {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context)
    return
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const width = element.width / pixelRatio
  const height = element.height / pixelRatio
  const progress = clamp(displayedProgress, 0, 1)
  const time = reducedMotion ? 0 : frameTime / 1000

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, width, height)
  drawEnergyField(context, width, height, progress, time, isDarkTheme(), waveMomentum)
}

function drawEnergyField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  time: number,
  dark: boolean,
  momentum: number,
) {
  const trackInset = height * 0.34
  const frontX = trackInset + progress * (width - trackInset * 2)
  const intensity = 0.24 + progress * 0.76
  const motion = time * (0.32 + progress * 0.78) * (props.dragging ? 2.1 : 1)
  const particleBoundary = progress >= 0.999
    ? width
    : frontX + height * (1.08 + Math.max(0, momentum) * 0.2)

  context.save()
  drawBaseField(context, width, height, progress, dark)
  drawNebula(context, width, height, intensity, dark)
  drawThreads(context, width, height, particleBoundary, progress, dark)
  drawParticles(context, width, height, particleBoundary, progress, intensity, motion, dark)
  if (progress < 0.999)
    drawEnergyWaves(context, width, height, frontX, progress, time, dark, momentum)
  context.restore()
  maskEnergyField(context, width, height, frontX, progress, time, momentum)
}

function drawBaseField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  dark: boolean,
) {
  const field = context.createLinearGradient(0, 0, width, 0)
  if (dark) {
    field.addColorStop(0, '#111827')
    field.addColorStop(0.28, '#16213e')
    field.addColorStop(0.56, '#1b2e60')
    field.addColorStop(0.8, '#243d80')
    field.addColorStop(1, '#2d4a96')
  }
  else {
    field.addColorStop(0, '#f3e5ca')
    field.addColorStop(0.18, '#e7c487')
    field.addColorStop(0.4, '#cf9953')
    field.addColorStop(0.57, '#8d685e')
    field.addColorStop(0.72, '#485783')
    field.addColorStop(0.86, '#1e3d7b')
    field.addColorStop(1, '#0b285f')
  }
  context.globalAlpha = dark
    ? 0.74 + progress * 0.26
    : 0.9 + progress * 0.1
  context.fillStyle = field
  context.fillRect(0, 0, width, height)

  const sheen = context.createLinearGradient(0, 0, 0, height)
  sheen.addColorStop(0, dark ? 'rgb(255 255 255 / 9%)' : 'rgb(255 255 255 / 34%)')
  sheen.addColorStop(0.38, 'transparent')
  sheen.addColorStop(1, dark ? 'rgb(0 0 0 / 18%)' : 'rgb(77 63 54 / 8%)')
  context.globalAlpha = 1
  context.fillStyle = sheen
  context.fillRect(0, 0, width, height)
}

function drawNebula(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  dark: boolean,
) {
  context.save()
  context.globalCompositeOperation = dark ? 'screen' : 'source-over'
  if (dark) {
    drawCloud(context, width * 0.22, height * 0.64, width * 0.28, height * 0.72, `rgb(32 63 143 / ${0.08 + intensity * 0.1})`)
    drawCloud(context, width * 0.58, height * 0.34, width * 0.32, height * 0.78, `rgb(58 91 190 / ${0.08 + intensity * 0.14})`)
    drawCloud(context, width * 0.86, height * 0.62, width * 0.24, height * 0.7, `rgb(93 116 224 / ${0.06 + intensity * 0.12})`)
  }
  else {
    drawCloud(context, width * 0.13, height * 0.36, width * 0.24, height * 0.72, `rgb(255 246 222 / ${0.1 + intensity * 0.1})`)
    drawCloud(context, width * 0.4, height * 0.7, width * 0.27, height * 0.74, `rgb(232 181 99 / ${0.1 + intensity * 0.12})`)
    drawCloud(context, width * 0.76, height * 0.34, width * 0.28, height * 0.76, `rgb(51 87 174 / ${0.06 + intensity * 0.11})`)
  }
  context.restore()
}

function drawThreads(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  boundary: number,
  progress: number,
  dark: boolean,
) {
  const visibility = clamp((progress - 0.18) / 0.82, 0, 1)
  if (visibility <= 0)
    return

  context.save()
  context.lineCap = 'round'
  context.lineWidth = 0.38
  context.strokeStyle = dark ? '#c99754' : '#a87a52'
  context.shadowBlur = progress * 1.8
  context.shadowColor = dark ? '#dbaf69' : '#d4a05e'
  for (const thread of threads) {
    if (thread.threshold > visibility)
      continue
    const x1 = thread.x1 * width
    const x2 = thread.x2 * width
    if (x2 > boundary)
      continue
    const y1 = thread.y1 * height
    const y2 = thread.y2 * height
    context.beginPath()
    context.moveTo(x1, y1)
    context.quadraticCurveTo(
      (x1 + x2) / 2,
      (y1 + y2) / 2 + thread.bend * height,
      x2,
      y2,
    )
    context.globalAlpha = (dark ? 0.07 : 0.045) + progress * (dark ? 0.09 : 0.055)
    context.stroke()
  }
  context.restore()
}

function drawParticles(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  boundary: number,
  progress: number,
  intensity: number,
  motion: number,
  dark: boolean,
) {
  const density = 0.38 + progress * 0.62
  const palette = dark
    ? ['#d4a35b', '#efc978', '#c4d3ff', '#eef2ff', '#fff4d5']
    : ['#8f6538', '#b9823e', '#d8a65e', '#fff4d5', '#ccd9f5']

  context.save()
  context.globalCompositeOperation = dark ? 'lighter' : 'source-over'
  for (const [index, particle] of particles.entries()) {
    if (particle.threshold > density)
      continue
    const normalizedX = (particle.x + motion * particle.speed * 0.0035) % 1
    const x = normalizedX * width
    if (x > boundary)
      continue
    const y = (particle.y + Math.sin(motion * particle.speed + particle.phase) * 0.025) * height
    const shimmer = 0.72 + Math.sin(motion * 1.8 + particle.phase) * 0.28
    const size = particle.size * (0.72 + progress * 0.38) * (props.dragging ? 1.08 : 1)
    const color = palette[Math.min(palette.length - 1, Math.floor(particle.tone * palette.length))] ?? palette[0]

    context.beginPath()
    context.arc(x, y, size, 0, Math.PI * 2)
    context.fillStyle = color
    context.globalAlpha = (dark
      ? 0.2 + intensity * 0.48
      : 0.27 + intensity * 0.4) * shimmer
    context.shadowBlur = 1.5 + size * (2.5 + progress * 3.5)
    context.shadowColor = color
    context.fill()

    if (index % 19 !== 0 || size < 0.58)
      continue
    context.beginPath()
    context.moveTo(x - size * 2.4, y)
    context.lineTo(x + size * 2.4, y)
    context.moveTo(x, y - size * 2.4)
    context.lineTo(x, y + size * 2.4)
    context.globalAlpha *= 0.38
    context.lineWidth = 0.42
    context.strokeStyle = color
    context.stroke()
  }
  context.restore()
}

function maskEnergyField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frontX: number,
  progress: number,
  time: number,
  momentum: number,
) {
  if (progress >= 0.999)
    return

  const maskCanvas = getWaveMaskCanvas(width, height)
  const maskContext = maskCanvas.getContext('2d')
  if (!maskContext)
    return
  maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
  for (let y = 0; y < Math.ceil(height); y += 1) {
    const normalizedY = y / height
    const boundary = frontX - height * 0.08 + waveBoundaryOffset(normalizedY, height, time, momentum)
    const coreEnd = Math.max(0, boundary - height * 0.12)
    const forwardStretch = Math.max(0, momentum) * 0.2
    const featherEnd = Math.min(
      width,
      boundary + height * (0.62 + forwardStretch + (props.dragging ? 0.08 : 0)),
    )
    maskContext.fillStyle = 'white'
    maskContext.fillRect(0, y, coreEnd, 1.25)
    if (featherEnd <= coreEnd)
      continue
    const mask = maskContext.createLinearGradient(coreEnd, 0, featherEnd, 0)
    mask.addColorStop(0, 'white')
    mask.addColorStop(0.2, 'rgb(255 255 255 / 95%)')
    mask.addColorStop(0.52, 'rgb(255 255 255 / 38%)')
    mask.addColorStop(0.82, 'rgb(255 255 255 / 9%)')
    mask.addColorStop(1, 'transparent')
    maskContext.fillStyle = mask
    maskContext.fillRect(coreEnd, y, featherEnd - coreEnd, 1.25)
  }

  context.save()
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(maskCanvas, 0, 0, width, height)
  context.restore()
}

function getWaveMaskCanvas(width: number, height: number): HTMLCanvasElement {
  const pixelWidth = Math.max(1, Math.ceil(width))
  const pixelHeight = Math.max(1, Math.ceil(height))
  if (waveMaskCanvas.width !== pixelWidth)
    waveMaskCanvas.width = pixelWidth
  if (waveMaskCanvas.height !== pixelHeight)
    waveMaskCanvas.height = pixelHeight
  return waveMaskCanvas
}

function waveBoundaryOffset(
  normalizedY: number,
  height: number,
  time: number,
  momentum: number,
): number {
  const envelope = Math.sin(normalizedY * Math.PI)
  const primaryWave = Math.sin(normalizedY * Math.PI * 2.1 + time * 0.48) * height * 0.085
  const secondaryWave = Math.sin(normalizedY * Math.PI * 4.6 - time * 0.31 + 1.7) * height * 0.024
  const centerBulge = envelope * height * 0.032
  const directionalLean = (normalizedY - 0.5) * momentum * height * 0.14
  return envelope * (primaryWave + secondaryWave) + centerBulge + directionalLean
}

function drawEnergyWaves(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frontX: number,
  progress: number,
  time: number,
  dark: boolean,
  momentum: number,
) {
  const stretch = clamp(1 + momentum * 0.28 + (props.dragging ? 0.1 : 0), 0.72, 1.42)
  const startX = Math.max(0, frontX - height * (1.45 + progress * 0.42))
  const endX = Math.min(width, frontX + height * (0.72 + progress * 0.22) * stretch)
  const span = Math.max(1, endX - startX)
  const amplitude = height * (0.07 + progress * 0.035 + Math.abs(momentum) * 0.025)
  const colors = dark
    ? ['224 181 103', '132 151 229', '239 207 151']
    : ['169 122 61', '104 120 168', '197 151 78']

  context.save()
  context.globalCompositeOperation = dark ? 'screen' : 'source-over'
  for (let index = 0; index < 3; index += 1) {
    const phase = index * 2.15 - time * (0.52 + progress * 0.22 + index * 0.06)
    const baseY = height * (0.29 + index * 0.21)
    const layerAmplitude = amplitude * (0.86 + index * 0.12)
    const thickness = height * (0.052 + index * 0.008 + progress * 0.008)
    const points = createWavePoints(startX, span, baseY, layerAmplitude, phase, index)
    const ribbon = context.createLinearGradient(startX, 0, endX, 0)
    const color = colors[index] ?? colors[0]
    ribbon.addColorStop(0, 'transparent')
    ribbon.addColorStop(0.24, `rgb(${color} / ${dark ? 0.07 : 0.04})`)
    ribbon.addColorStop(0.58, `rgb(${color} / ${dark ? 0.24 : 0.15})`)
    ribbon.addColorStop(0.8, `rgb(${color} / ${dark ? 0.13 : 0.075})`)
    ribbon.addColorStop(1, 'transparent')

    context.beginPath()
    context.moveTo(points[0]?.x ?? startX, (points[0]?.y ?? baseY) - thickness)
    for (const point of points)
      context.lineTo(point.x, point.y - thickness)
    for (let pointIndex = points.length - 1; pointIndex >= 0; pointIndex -= 1) {
      const point = points[pointIndex]
      if (point)
        context.lineTo(point.x, point.y + thickness)
    }
    context.closePath()
    context.fillStyle = ribbon
    context.fill()
  }
  context.restore()
}

function createWavePoints(
  startX: number,
  span: number,
  baseY: number,
  amplitude: number,
  phase: number,
  layer: number,
): Array<{ x: number, y: number }> {
  return Array.from({ length: 33 }, (_, pointIndex) => {
    const ratio = pointIndex / 32
    const envelope = Math.sin(ratio * Math.PI) ** 0.72
    const carrier = Math.sin(ratio * Math.PI * (2.45 + layer * 0.34) + phase)
    const harmonic = Math.sin(ratio * Math.PI * 5.2 - phase * 0.43 + layer) * 0.22
    return {
      x: startX + ratio * span,
      y: baseY + (carrier + harmonic) * amplitude * envelope,
    }
  })
}

function drawCloud(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  color: string,
) {
  context.save()
  context.translate(x, y)
  context.scale(radiusX / radiusY, 1)
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusY)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, 'transparent')
  context.fillStyle = gradient
  context.fillRect(-radiusY, -radiusY, radiusY * 2, radiusY * 2)
  context.restore()
}

function isDarkTheme(): boolean {
  return document.documentElement.dataset.buddyTheme === 'dark'
}

function seededRandom(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43_758.5453
  return value - Math.floor(value)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
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
