export class BoundedFileReadError extends Error {
  readonly code:
    | 'BOUNDED_FILE_OUTPUT_LIMIT'
    | 'BOUNDED_FILE_READER_UNAVAILABLE'
    | 'BOUNDED_FILE_READ_FAILED'

  constructor(
    code: BoundedFileReadError['code'],
    options?: ErrorOptions,
    detail?: string,
  ) {
    super(detail ? `Lexora Buddy could not read a bounded file: ${detail}` : 'Lexora Buddy could not read a bounded file', options)
    this.name = 'BoundedFileReadError'
    this.code = code
  }
}
