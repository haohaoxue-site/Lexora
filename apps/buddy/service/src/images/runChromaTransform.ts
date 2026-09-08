import type { ChromaOptions } from './runNativeImage'
import { runNativeImage } from './runNativeImage'

export type { ChromaOptions } from './runNativeImage'

export function runChromaTransform(bytes: Uint8Array, options: ChromaOptions, signal?: AbortSignal) {
  return runNativeImage(bytes, { operation: 'chroma', options }, signal)
}
