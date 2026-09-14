import { z } from 'zod'

export const privateDirectoryErrorCodeSchema = z.enum([
  'PRIVATE_DIRECTORIES_INVALID',
  'PRIVATE_DIRECTORIES_UNSAFE',
  'PRIVATE_DIRECTORIES_FAILED',
  'PRIVATE_DIRECTORIES_UNAVAILABLE',
  'PRIVATE_DIRECTORIES_PROCESS_FAILED',
  'PRIVATE_DIRECTORIES_INVALID_RESPONSE',
])

export const privateDirectoryFailureSchema = z.object({
  kind: z.literal('private_directories'),
  operation: z.enum(['request', 'identity', 'open_root', 'open_directory', 'inspect_directory', 'validate_acl', 'response', 'process']),
  directoryIndex: z.number().int().min(0).max(63).optional(),
  directoryRole: z.enum(['lexora_home', 'user_data', 'session_data', 'window_state']).optional(),
  systemError: z.object({
    domain: z.enum(['win32', 'ntstatus']),
    code: z.number().int().min(0).max(0xFFFFFFFF),
  }).strict().optional(),
  exitCode: z.number().int().min(-0x80000000).max(0xFFFFFFFF).nullable().optional(),
  processErrorCode: z.enum(['ENOENT', 'EACCES', 'EPERM', 'EPIPE', 'UNKNOWN', 'NATIVE_COMMAND_TIMEOUT', 'NATIVE_COMMAND_OUTPUT_LIMIT', 'NATIVE_COMMAND_CANCELLED']).optional(),
}).strict()

export type PrivateDirectoryFailure = z.infer<typeof privateDirectoryFailureSchema>
