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

export const particles = Array.from({ length: 168 }, (_, index): StarParticle => ({
  phase: seededRandom(index, 3) * Math.PI * 2,
  size: 0.28 + seededRandom(index, 7) * 0.82,
  speed: 0.22 + seededRandom(index, 11) * 0.72,
  threshold: seededRandom(index, 13),
  tone: seededRandom(index, 17),
  x: seededRandom(index, 23),
  y: 0.12 + seededRandom(index, 29) * 0.76,
}))
export const threads = Array.from({ length: 28 }, (_, index): ConstellationThread => {
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
export function waveBoundaryOffset(
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

export function createWavePoints(
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

function seededRandom(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43_758.5453
  return value - Math.floor(value)
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
