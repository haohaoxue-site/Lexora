import { z } from 'zod'

export const desktopBootstrapFailureSchema = z.object({
  kind: z.literal('desktop_bootstrap'),
  operation: z.enum(['resolve_paths', 'create_directory', 'configure_paths', 'crash_reporter', 'register_protocols', 'desktop_identity']),
  directoryRole: z.enum(['crash_dumps', 'session_data', 'user_data', 'window_state']).optional(),
  systemCode: z.enum(['EACCES', 'EPERM', 'ENOENT', 'EEXIST', 'ENOTDIR', 'ENOSPC', 'EIO', 'EMFILE', 'ENFILE', 'EROFS']).optional(),
}).strict()

export const processExitSchema = z.object({
  type: z.enum(['renderer', 'utility', 'gpu', 'other']),
  reason: z.enum(['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'unknown']),
  code: z.number().int().min(-0x80000000).max(0xFFFFFFFF),
  expected: z.boolean().optional(),
}).strict()

export const rendererLoadFailureSchema = z.object({
  stage: z.enum(['main_frame', 'preload']),
  code: z.number().int().min(-0x80000000).max(0x7FFFFFFF).optional(),
}).strict()
