import type { ArtifactService } from '../artifacts/ArtifactService'
import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { ArtifactRecord } from '../storage/artifactRepository'
import { PhotonImage } from '@silvia-odwyer/photon-node'

const MAX_IMAGE_PIXELS = 25_000_000
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

export interface RemoveChromaInput {
  color: string
  conversationId: string
  cwd: string
  despill: number
  grants: readonly DirectoryGrant[]
  outputPath: string
  softness: number
  sourceArtifactId: string
  tolerance: number
}

export class ImageTransformService {
  readonly #artifacts: Pick<
    ArtifactService,
    'materializeConversationArtifact' | 'registerGeneratedImages'
  >

  constructor(options: {
    artifacts: Pick<
      ArtifactService,
      'materializeConversationArtifact' | 'registerGeneratedImages'
    >
  }) {
    this.#artifacts = options.artifacts
  }

  async removeChroma(input: RemoveChromaInput): Promise<ArtifactRecord> {
    const source = await this.#artifacts.materializeConversationArtifact(
      input.conversationId,
      input.sourceArtifactId,
    )
    if (source.resource.mimeType !== 'image/png')
      throw new ImageTransformError('IMAGE_TRANSFORM_UNSUPPORTED_FORMAT')
    const dimensions = readPngDimensions(source.bytes)
    if (!dimensions)
      throw new ImageTransformError('IMAGE_TRANSFORM_INVALID_IMAGE')
    if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS)
      throw new ImageTransformError('IMAGE_TRANSFORM_INPUT_TOO_LARGE')
    const color = parseHexColor(input.color)
    validateTransformInput(input)

    let decoded: PhotonImage | null = null
    try {
      decoded = PhotonImage.new_from_byteslice(source.bytes)
      if (
        decoded.get_width() !== dimensions.width
        || decoded.get_height() !== dimensions.height
      ) {
        throw new ImageTransformError('IMAGE_TRANSFORM_INVALID_IMAGE')
      }
      const pixels = decoded.get_raw_pixels()
      removeChromaPixels(pixels, color, input)
      const transformed = new PhotonImage(pixels, dimensions.width, dimensions.height)
      let bytes: Uint8Array
      try {
        bytes = transformed.get_bytes()
      }
      finally {
        transformed.free()
      }
      const [artifact] = await this.#artifacts.registerGeneratedImages({
        conversationId: input.conversationId,
        cwd: input.cwd,
        grants: input.grants,
        images: [{
          bytes,
          mimeType: 'image/png',
        }],
        outputPath: input.outputPath,
        sourceArtifactId: input.sourceArtifactId,
      })
      if (!artifact)
        throw new ImageTransformError('IMAGE_TRANSFORM_FAILED')
      return artifact
    }
    catch (error) {
      if (readErrorCode(error))
        throw error
      throw new ImageTransformError('IMAGE_TRANSFORM_FAILED', { cause: error })
    }
    finally {
      decoded?.free()
    }
  }
}

export class ImageTransformError extends Error {
  readonly code: string

  constructor(code: string, options?: ErrorOptions) {
    super('Lexora Buddy image transformation failed', options)
    this.name = 'ImageTransformError'
    this.code = code
  }
}

function removeChromaPixels(
  pixels: Uint8Array,
  color: readonly [number, number, number],
  input: Pick<RemoveChromaInput, 'despill' | 'softness' | 'tolerance'>,
): void {
  const dominantChannel = color.indexOf(Math.max(...color))
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]!
    const green = pixels[index + 1]!
    const blue = pixels[index + 2]!
    const distance = Math.hypot(red - color[0], green - color[1], blue - color[2])
    const opacity = chromaOpacity(distance, input.tolerance, input.softness)
    pixels[index + 3] = Math.round(pixels[index + 3]! * opacity)
    if (input.despill === 0 || opacity === 1)
      continue
    const channels = [red, green, blue]
    const dominant = channels[dominantChannel]!
    const otherMaximum = Math.max(...channels.filter((_, channel) => channel !== dominantChannel))
    const spill = Math.max(0, dominant - otherMaximum)
    pixels[index + dominantChannel] = Math.round(
      dominant - spill * (1 - opacity) * input.despill,
    )
  }
}

function chromaOpacity(distance: number, tolerance: number, softness: number): number {
  if (distance <= tolerance)
    return 0
  if (softness === 0 || distance >= tolerance + softness)
    return 1
  return (distance - tolerance) / softness
}

function parseHexColor(value: string): readonly [number, number, number] {
  const match = /^#([\dA-F]{2})([\dA-F]{2})([\dA-F]{2})$/i.exec(value)
  if (!match)
    throw new ImageTransformError('VALIDATION_FAILED')
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
  ]
}

function validateTransformInput(input: RemoveChromaInput): void {
  if (
    !input.outputPath.trim()
    || !Number.isFinite(input.tolerance)
    || input.tolerance < 0
    || input.tolerance > 442
    || !Number.isFinite(input.softness)
    || input.softness < 0
    || input.softness > 442
    || !Number.isFinite(input.despill)
    || input.despill < 0
    || input.despill > 1
  ) {
    throw new ImageTransformError('VALIDATION_FAILED')
  }
}

function readPngDimensions(bytes: Uint8Array): { height: number, width: number } | null {
  if (
    bytes.byteLength < 24
    || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
    || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
  ) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 ? { height, width } : null
}

function readErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | undefined)?.code
  return typeof code === 'string' ? code : null
}
