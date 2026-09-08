export const IMAGE_TRANSFORM_ERROR_CODES = [
  'VALIDATION_FAILED',
  'IMAGE_TRANSFORM_UNSUPPORTED_FORMAT',
  'IMAGE_TRANSFORM_INVALID_IMAGE',
  'IMAGE_TRANSFORM_INPUT_TOO_LARGE',
  'IMAGE_TRANSFORM_OUTPUT_TOO_LARGE',
  'IMAGE_TRANSFORM_UNAVAILABLE',
  'IMAGE_TRANSFORM_TIMEOUT',
  'IMAGE_TRANSFORM_FAILED',
] as const

export type ImageTransformErrorCode = typeof IMAGE_TRANSFORM_ERROR_CODES[number]

export class ImageTransformError extends Error {
  readonly code: ImageTransformErrorCode

  constructor(code: ImageTransformErrorCode, options?: ErrorOptions) {
    super('Lexora Buddy image transformation failed', options)
    this.name = 'ImageTransformError'
    this.code = code
  }
}
