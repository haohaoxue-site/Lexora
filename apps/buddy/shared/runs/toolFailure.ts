export type ToolFailureCode = 'INVALID_PATH' | 'PATH_NOT_FOUND' | 'VALIDATION_FAILED'

export function isToolFailureCode(value: unknown): value is ToolFailureCode {
  return value === 'INVALID_PATH' || value === 'PATH_NOT_FOUND' || value === 'VALIDATION_FAILED'
}
